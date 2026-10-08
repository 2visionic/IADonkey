import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import AdmZip from 'adm-zip';

export interface MagicGateSectionRepo {
  sectionId: number;
  manifestPath: string;
  repoUrl: string;
  version?: string;
  targetSubdir: string;
}

/**
 * Extracts the top-level directory name from a manifest path.
 * Mirrors Wox: GetTopDirectoryName
 * e.g.:
 *  "Templates\\Web\\manifest.json" -> "Templates"
 *  "modules/eshop/manifest.json"   -> "modules"
 *  "global/manifest.xml"           -> "global"
 */
export function getTopDirectoryName(manifestPath: string): string {
  if (!manifestPath) return 'repo';
  const normalized = manifestPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : (parts[0] || 'repo');
}

/**
 * Fetches section repositories from an instance's Administration endpoint.
 * URL: {adminUrl}/CmsFsContentHandler.ashx
 * Headers:
 *  X-UserName: <username>
 *  X-Password: <password>
 *  X-Method: GetContentRepos
 */
export async function fetchInstanceSectionRepos(
  adminUrl: string,
  userName?: string,
  password?: string
): Promise<{ ok: boolean; repos: MagicGateSectionRepo[]; rawJson?: string; error?: string }> {
  if (!adminUrl || !adminUrl.trim()) {
    return { ok: false, repos: [], error: 'Instance nemá zadanou URL adresu administrace.' };
  }

  const cleanBase = adminUrl.trim().replace(/\/+$/, '');
  const endpoint = `${cleanBase}/CmsFsContentHandler.ashx`;

  const headers: Record<string, string> = {
    'X-Method': 'GetContentRepos',
  };

  if (userName) {
    headers['X-UserName'] = userName.trim();
  }
  if (password) {
    headers['X-Password'] = password;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          repos: [],
          error: `Ověření MagicGate selhalo (HTTP ${res.status}). Zkontrolujte uživatelské jméno a heslo v Nastavení -> Rozšíření -> MagicGate.`,
        };
      }
      return {
        ok: false,
        repos: [],
        error: `Server vrátil chybu HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();

    let parsed: any[] = [];
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        repos: [],
        rawJson: rawText,
        error: `Odpověď serveru nebyla ve formátu JSON (Content-Type: ${contentType}).`,
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        ok: false,
        repos: [],
        rawJson: rawText,
        error: 'Neplatný formát odpovědi: očekáváno pole repozitářů sekcí.',
      };
    }

    const repos: MagicGateSectionRepo[] = parsed.map((item) => {
      const sectionId = Number(item.SectionID || item.sectionId || 0);
      const manifestPath = String(item.ManifestPath || item.manifestPath || '');
      const repoUrl = String(item.RepoUrl || item.repoUrl || '');
      const version = item.Version || item.version ? String(item.Version || item.version) : undefined;
      const targetSubdir = getTopDirectoryName(manifestPath);

      return {
        sectionId,
        manifestPath,
        repoUrl,
        version,
        targetSubdir,
      };
    });

    return {
      ok: true,
      repos,
      rawJson: rawText,
    };
  } catch (err: any) {
    return {
      ok: false,
      repos: [],
      error: err?.message || 'Chyba při komunikaci s instancí MagicGate.',
    };
  }
}

/**
 * Sanitizes output by masking sensitive tokens and authorization headers.
 */
export function createGitOutputSanitizer(githubToken?: string): (data: Buffer | string) => string {
  return (data: Buffer | string) => {
    let str = typeof data === 'string' ? data : data.toString();
    if (githubToken) {
      str = str.split(githubToken).join('[REDACTED]');
      const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
      str = str.split(basicAuth).join('[REDACTED]');
    }
    return str;
  };
}

/**
 * Creates Git process environment and CLI flags for authenticated git operations.
 * Sets GIT_CONFIG_* environment variables so all child processes (including git-submodule)
 * automatically inherit HTTP Authorization and SSH->HTTPS URL rewrites.
 */
export function createGitAuthEnv(repoUrl: string, githubToken?: string): { env: NodeJS.ProcessEnv; authArgs: string[] } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };
  const authArgs: string[] = [];

  if (githubToken) {
    let host = 'github.com';
    let protocol = 'https:';

    try {
      if (repoUrl.includes('://')) {
        const parsed = new URL(repoUrl);
        if (parsed.host) host = parsed.host;
        if (parsed.protocol) protocol = parsed.protocol;
      } else if (repoUrl.includes('@')) {
        const match = repoUrl.match(/@([^:]+):/);
        if (match && match[1]) host = match[1];
      }
    } catch {
      // fallback to github.com
    }

    const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    const origin = `${protocol}//${host}`;

    // Pass via GIT_CONFIG_* environment variables so all child processes (and top-level clone) inherit it.
    // NOTE: Do NOT also pass -c extraheader on the CLI, because Git will send duplicate Authorization
    // HTTP headers, which GitHub rejects with HTTP 400 Bad Request!
    env.GIT_CONFIG_COUNT = '3';
    env.GIT_CONFIG_KEY_0 = `http.${origin}/.extraheader`;
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basicAuth}`;

    // Rewrite SSH git@host: URLs to https://host/ so submodules using git@... work with the token
    env.GIT_CONFIG_KEY_1 = `url.${origin}/.insteadOf`;
    env.GIT_CONFIG_VALUE_1 = `git@${host}:`;

    // Rewrite ssh://git@host/ URLs to https://host/
    env.GIT_CONFIG_KEY_2 = `url.${origin}/.insteadOf`;
    env.GIT_CONFIG_VALUE_2 = `ssh://git@${host}/`;
  }

  return { env, authArgs };
}

/**
 * Spawns a Git process with live logging and sanitized output.
 */
export function executeGitProcess(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onLog?: (data: string) => void;
    sanitize?: (text: string) => string;
  }
): Promise<{ success: boolean; code?: number; error?: string; output: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: any;

    try {
      child = spawn('git', args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        env: options.env || { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Nepodařilo se spustit git.', output: '' });
      return;
    }

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      options.onLog?.(options.sanitize ? options.sanitize(text) : text);
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      options.onLog?.(options.sanitize ? options.sanitize(text) : text);
    });

    child.on('close', (code: number) => {
      const combined = stderr || stdout;
      if (code === 0) {
        resolve({ success: true, code, output: stdout });
      } else {
        resolve({ success: false, code, error: `Git skončil s kódem ${code}`, output: combined });
      }
    });

    child.on('error', (err: any) => {
      resolve({ success: false, error: err?.message || 'Nepodařilo se spustit git.', output: stderr });
    });
  });
}

/**
 * Parsed Git repository version information.
 */
export interface ParsedRepoVersion {
  branch?: string;
  commit?: string;
}

/**
 * Parses repo version string from MagicGate (e.g. "brenna/b8bf268f...", "main/b4227...", "feature/foo/commit", "main").
 */
export function parseRepoVersion(version?: string): ParsedRepoVersion {
  if (!version || !version.trim()) return {};
  const trimmed = version.trim();
  const lastSlashIndex = trimmed.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    const candidateSha = trimmed.substring(lastSlashIndex + 1);
    if (/^[0-9a-fA-F]{7,40}$/.test(candidateSha)) {
      const branch = trimmed.substring(0, lastSlashIndex);
      return { branch: branch || undefined, commit: candidateSha };
    }
  }
  if (/^[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { commit: trimmed };
  }
  return { branch: trimmed };
}

export interface GitSubmoduleInfo {
  name: string;
  path: string;
  url?: string;
  branch?: string;
}

/**
 * Parses .gitmodules file content to extract submodule entries.
 */
export function parseGitmodulesContent(content: string): GitSubmoduleInfo[] {
  const submodules: GitSubmoduleInfo[] = [];
  const lines = content.split(/\r?\n/);
  let current: Partial<GitSubmoduleInfo> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[submodule\s+"([^"]+)"\]$/i);
    if (sectionMatch) {
      if (current && current.path) {
        submodules.push(current as GitSubmoduleInfo);
      }
      current = { name: sectionMatch[1] };
      continue;
    }

    if (!current) continue;

    const kvMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
      const val = kvMatch[2].trim();
      if (key === 'path') current.path = val;
      else if (key === 'url') current.url = val;
      else if (key === 'branch') current.branch = val;
    }
  }

  if (current && current.path) {
    submodules.push(current as GitSubmoduleInfo);
  }

  return submodules;
}

/**
 * Checks out the given repository or submodule directory to an appropriate branch
 * rather than leaving it in detached HEAD state.
 */
export async function ensureGitBranch(
  dirPath: string,
  preferredBranch: string | undefined,
  options: {
    gitEnv: NodeJS.ProcessEnv;
    sanitizeOutput?: (text: string) => string;
    onLog?: (text: string) => void;
  }
): Promise<{ branch: string; switched: boolean }> {
  const { gitEnv, sanitizeOutput, onLog } = options;

  // 1. Get current branch
  const currentBranchRes = await executeGitProcess(['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: dirPath,
    env: gitEnv,
    sanitize: sanitizeOutput,
  });
  const currentBranch = currentBranchRes.output.trim();

  // 2. Fetch remote branch list
  const remoteBranchesRes = await executeGitProcess(['branch', '-r'], {
    cwd: dirPath,
    env: gitEnv,
    sanitize: sanitizeOutput,
  });
  const remoteOutput = remoteBranchesRes.output;
  const remoteBranches = remoteOutput
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^origin\//, ''))
    .filter((b) => b && !b.includes('->'));

  // 3. Determine target branch
  let targetBranch = '';
  if (preferredBranch && remoteBranches.includes(preferredBranch)) {
    targetBranch = preferredBranch;
  } else if (remoteBranches.includes('main')) {
    targetBranch = 'main';
  } else if (remoteBranches.includes('master')) {
    targetBranch = 'master';
  } else if (preferredBranch) {
    targetBranch = preferredBranch;
  } else if (remoteBranches.length > 0) {
    targetBranch = remoteBranches[0];
  }

  if (!targetBranch) {
    return { branch: currentBranch || 'unknown', switched: false };
  }

  // If already on the chosen branch and not in detached HEAD ('HEAD')
  if (currentBranch === targetBranch) {
    return { branch: currentBranch, switched: false };
  }

  // 4. Checkout branch
  onLog?.(`Přepínám na větev '${targetBranch}'...\n`);
  let checkoutRes = await executeGitProcess(['checkout', '-B', targetBranch, `origin/${targetBranch}`], {
    cwd: dirPath,
    env: gitEnv,
    onLog,
    sanitize: sanitizeOutput,
  });

  if (!checkoutRes.success) {
    checkoutRes = await executeGitProcess(['checkout', targetBranch], {
      cwd: dirPath,
      env: gitEnv,
      onLog,
      sanitize: sanitizeOutput,
    });
  }

  return { branch: targetBranch, switched: checkoutRes.success };
}

/**
 * Synchronizes, downloads and configures branches for submodules in a repository.
 */
export async function syncAndSetupSubmodules(
  repoPath: string,
  sectionBranch: string | undefined,
  options: {
    gitEnv: NodeJS.ProcessEnv;
    sanitizeOutput: (text: string) => string;
    onLog?: (text: string) => void;
  }
): Promise<void> {
  const { gitEnv, sanitizeOutput, onLog } = options;
  const gitmodulesPath = path.join(repoPath, '.gitmodules');
  if (!fs.existsSync(gitmodulesPath)) return;

  onLog?.(`Synchronizuji submoduly (git submodule sync)...\n`);
  await executeGitProcess(['submodule', 'sync', '--recursive'], {
    cwd: repoPath,
    env: gitEnv,
    onLog,
    sanitize: sanitizeOutput,
  });

  onLog?.(`Stahuji submoduly (git submodule update --init --recursive)...\n`);
  const subResult = await executeGitProcess(['submodule', 'update', '--init', '--recursive'], {
    cwd: repoPath,
    env: gitEnv,
    onLog,
    sanitize: sanitizeOutput,
  });

  if (!subResult.success) {
    onLog?.(`[Varování] Stažení některých submodulů skončilo s chybou: ${subResult.error || subResult.output}\n`);
  }

  // For each submodule, switch out of detached HEAD to an active branch
  try {
    const gitmodulesContent = fs.readFileSync(gitmodulesPath, 'utf8');
    const submodules = parseGitmodulesContent(gitmodulesContent);

    for (const sub of submodules) {
      const subDir = path.join(repoPath, sub.path);
      if (!fs.existsSync(subDir)) continue;

      const subRemoteRes = await executeGitProcess(['branch', '-r'], {
        cwd: subDir,
        env: gitEnv,
        sanitize: sanitizeOutput,
      });
      const remoteOutput = subRemoteRes.output;

      // Priority for submodule branch:
      // 1. Same branch as section (e.g. 'brenna') if it exists on submodule remote
      // 2. Branch explicitly defined in .gitmodules (e.g. 'main')
      // 3. 'main'
      // 4. 'master'
      let chosenBranch = 'main';
      if (sectionBranch && remoteOutput.includes(`origin/${sectionBranch}`)) {
        chosenBranch = sectionBranch;
      } else if (sub.branch && remoteOutput.includes(`origin/${sub.branch}`)) {
        chosenBranch = sub.branch;
      } else if (remoteOutput.includes('origin/main')) {
        chosenBranch = 'main';
      } else if (remoteOutput.includes('origin/master')) {
        chosenBranch = 'master';
      } else if (sub.branch) {
        chosenBranch = sub.branch;
      }

      const res = await ensureGitBranch(subDir, chosenBranch, {
        gitEnv,
        sanitizeOutput,
        onLog: (msg) => onLog?.(`  [${sub.name}] ${msg}`),
      });

      onLog?.(`[OK] Submodul ${sub.name} nastaven na větev '${res.branch}'.\n`);
    }
  } catch (err: any) {
    onLog?.(`[Varování] Nepodařilo se dokončit nastavení větví submodulů: ${err?.message || err}\n`);
  }
}

/**
 * Clones all section repositories of an instance into targetDir.
 * Also writes repos.json in targetDir for full compatibility with Wox.
 */
export async function runMultiRepoClone(params: {
  repos: MagicGateSectionRepo[];
  targetDir: string;
  recursive?: boolean;
  rawJson?: string;
  forceReclone?: boolean;
  githubToken?: string;
  onProgress?: (data: { current: number; total: number; repoName: string; log: string }) => void;
}): Promise<{ success: boolean; targetPath: string; error?: string; alreadyExists?: boolean; allSkipped?: boolean }> {
  const { repos, targetDir, recursive = true, rawJson, forceReclone = false, githubToken, onProgress } = params;

  if (!targetDir || !targetDir.trim()) {
    return { success: false, targetPath: '', error: 'Nebyla zadána cílová složka.' };
  }

  const cleanTarget = path.resolve(targetDir.trim());

  // 1. Create main target directory if not exists
  try {
    if (!fs.existsSync(cleanTarget)) {
      fs.mkdirSync(cleanTarget, { recursive: true });
    }
  } catch (err: any) {
    return { success: false, targetPath: cleanTarget, error: `Nelze vytvořit cílovou složku: ${err?.message}` };
  }

  // 2. Save repos.json in the target directory (identical to Wox behavior)
  try {
    const reposJsonPath = path.join(cleanTarget, 'repos.json');
    const content = rawJson || JSON.stringify(repos, null, 2);
    fs.writeFileSync(reposJsonPath, content, 'utf-8');
  } catch (err) {
    console.error('[MagicGateService] Failed to write repos.json:', err);
  }

  // 3. Filter valid repos with a URL
  const validRepos = repos.filter((r) => r.repoUrl && r.repoUrl.trim());
  if (validRepos.length === 0) {
    return {
      success: true,
      targetPath: cleanTarget,
      error: 'Instance neobsahuje žádné sekce s aktivním Git repozitářem.',
    };
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedErrors: string[] = [];
  const sanitizeOutput = createGitOutputSanitizer(githubToken);

  // 4. Clone each repo sequentially
  for (let i = 0; i < validRepos.length; i++) {
    const repo = validRepos[i];
    const subPath = path.join(cleanTarget, repo.targetSubdir);

    onProgress?.({
      current: i + 1,
      total: validRepos.length,
      repoName: repo.targetSubdir,
      log: `\n[${i + 1}/${validRepos.length}] Příprava sekce ${repo.targetSubdir} (${repo.repoUrl})...\n`,
    });

    const { env: gitEnv, authArgs } = createGitAuthEnv(repo.repoUrl, githubToken);
    const { branch: targetBranch } = parseRepoVersion(repo.version);

    // Check if subPath already exists and contains a .git repository
    const gitDirPath = path.join(subPath, '.git');
    if (fs.existsSync(subPath) && fs.existsSync(gitDirPath)) {
      onProgress?.({
        current: i + 1,
        total: validRepos.length,
        repoName: repo.targetSubdir,
        log: `[${i + 1}/${validRepos.length}] Složka ${repo.targetSubdir} již existuje. Ověřuji větve a balíčky...\n`,
      });

      // Ensure branch on existing main repo
      if (targetBranch) {
        await ensureGitBranch(subPath, targetBranch, {
          gitEnv,
          sanitizeOutput,
          onLog: (text) => onProgress?.({
            current: i + 1,
            total: validRepos.length,
            repoName: repo.targetSubdir,
            log: text,
          }),
        });
      }

      // Ensure submodules if requested
      if (recursive) {
        await syncAndSetupSubmodules(subPath, targetBranch, {
          gitEnv,
          sanitizeOutput,
          onLog: (text) => onProgress?.({
            current: i + 1,
            total: validRepos.length,
            repoName: repo.targetSubdir,
            log: text,
          }),
        });
      }

      successCount++;
      continue;
    }

    let cloneArgs = [...authArgs, 'clone'];
    if (targetBranch) {
      cloneArgs.push('--branch', targetBranch);
    }
    cloneArgs.push(repo.repoUrl, subPath);

    // Clean display command without sensitive token headers
    const displayArgs = cloneArgs.filter((_, idx) => {
      if (cloneArgs[idx] === '-c' && cloneArgs[idx + 1]?.includes('.extraheader=')) return false;
      if (cloneArgs[idx - 1] === '-c' && cloneArgs[idx]?.includes('.extraheader=')) return false;
      return true;
    });

    onProgress?.({
      current: i + 1,
      total: validRepos.length,
      repoName: repo.targetSubdir,
      log: `> git ${displayArgs.join(' ')}\n`,
    });

    let cloneResult = await executeGitProcess(cloneArgs, {
      cwd: cleanTarget,
      env: gitEnv,
      onLog: (text) => onProgress?.({
        current: i + 1,
        total: validRepos.length,
        repoName: repo.targetSubdir,
        log: text,
      }),
      sanitize: sanitizeOutput,
    });

    // Fallback: If cloning with targetBranch failed because the branch doesn't exist on remote, retry default branch
    if (!cloneResult.success && targetBranch && cloneResult.output.includes('not found in upstream origin')) {
      onProgress?.({
        current: i + 1,
        total: validRepos.length,
        repoName: repo.targetSubdir,
        log: `[Varování] Větev '${targetBranch}' na remote nebyla nalezena, zkouším výchozí větev repozitáře...\n`,
      });
      cloneArgs = [...authArgs, 'clone', repo.repoUrl, subPath];
      cloneResult = await executeGitProcess(cloneArgs, {
        cwd: cleanTarget,
        env: gitEnv,
        onLog: (text) => onProgress?.({
          current: i + 1,
          total: validRepos.length,
          repoName: repo.targetSubdir,
          log: text,
        }),
        sanitize: sanitizeOutput,
      });
    }

    if (!cloneResult.success) {
      failedCount++;
      const errMsg = cloneResult.error || cloneResult.output || 'Neznámá chyba';
      failedErrors.push(`${repo.targetSubdir}: ${errMsg}`);
      onProgress?.({
        current: i + 1,
        total: validRepos.length,
        repoName: repo.targetSubdir,
        log: `Chyba při klonování sekce ${repo.targetSubdir}: ${errMsg}\n`,
      });
      continue;
    }

    // Ensure proper branch checkout on newly cloned repo
    if (targetBranch) {
      await ensureGitBranch(subPath, targetBranch, {
        gitEnv,
        sanitizeOutput,
        onLog: (text) => onProgress?.({
          current: i + 1,
          total: validRepos.length,
          repoName: repo.targetSubdir,
          log: text,
        }),
      });
    }

    successCount++;

    // Submodules handling: if recursive is requested and .gitmodules exists, explicitly sync, update & set branches
    if (recursive) {
      await syncAndSetupSubmodules(subPath, targetBranch, {
        gitEnv,
        sanitizeOutput,
        onLog: (text) => onProgress?.({
          current: i + 1,
          total: validRepos.length,
          repoName: repo.targetSubdir,
          log: text,
        }),
      });
    }
  }

  if (successCount === 0 && skippedCount === 0 && failedCount > 0) {
    return {
      success: false,
      targetPath: cleanTarget,
      error: `Nepodařilo se stáhnout žádný repozitář sekce:\n${failedErrors.join('\n')}`,
    };
  }

  return {
    success: true,
    targetPath: cleanTarget,
    alreadyExists: skippedCount > 0,
    error: failedCount > 0 ? `Některé sekce se nepodařilo stáhnout:\n${failedErrors.join('\n')}` : undefined,
  };
}

/**
 * Normalizes instance target directory for CMSinFS content: {baseDir}/{instanceName}
 */
export function normalizeInstanceCmsPath(baseDir?: string, instanceName?: string): string {
  if (!baseDir || !baseDir.trim()) return '';
  const cleanBase = baseDir.trim().replace(/[\\/]+$/, '');
  const cleanInst = (instanceName || 'instance').trim().replace(/^[\\/]+|[\\/]+$/g, '');
  const sep = cleanBase.includes('/') && !cleanBase.includes('\\') ? '/' : '\\';
  return `${cleanBase}${sep}${cleanInst}`;
}

/**
 * Downloads and extracts CMSinFS web content ZIP from an instance's Administration endpoint.
 * URL: {adminUrl}/CmsFsContentHandler.ashx
 * Headers:
 *  X-UserName: <username>
 *  X-Password: <password>
 *  X-Method: GetContent
 */
export async function downloadInstanceCmsContent(params: {
  adminUrl: string;
  targetDir: string;
  userName?: string;
  password?: string;
  instanceName?: string;
  onProgress?: (data: {
    step: 'connecting' | 'downloading' | 'purging' | 'extracting' | 'done';
    percent?: number;
    loadedBytes?: number;
    totalBytes?: number;
    log?: string;
  }) => void;
}): Promise<{ success: boolean; targetPath?: string; error?: string; fileCount?: number }> {
  const { adminUrl, targetDir, userName, password, instanceName, onProgress } = params;

  if (!adminUrl || !adminUrl.trim()) {
    return { success: false, error: 'Instance nemá zadanou URL adresu administrace.' };
  }

  if (!targetDir || !targetDir.trim()) {
    return {
      success: false,
      error: 'Není nastavena cílová složka. Zkontrolujte v Nastavení -> Rozšíření -> MagicGate položku "Cesta ke zdrojovým kódům instance".',
    };
  }

  const cleanTarget = path.resolve(targetDir.trim());
  const cleanBase = adminUrl.trim().replace(/\/+$/, '');
  const endpoint = `${cleanBase}/CmsFsContentHandler.ashx`;

  const headers: Record<string, string> = {
    'X-Method': 'GetContent',
  };

  if (userName) {
    headers['X-UserName'] = userName.trim();
  }
  if (password) {
    headers['X-Password'] = password;
  }

  try {
    onProgress?.({ step: 'connecting', log: `Připojování k administraci instance ${instanceName || ''}...` });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Ověření MagicGate selhalo (HTTP ${res.status}). Zkontrolujte uživatelské jméno a heslo v Nastavení -> Rozšíření -> MagicGate.`,
        };
      }
      return {
        success: false,
        error: `Server vrátil chybu HTTP ${res.status}: ${res.statusText}`,
      };
    }

    onProgress?.({ step: 'downloading', log: 'Zahajuji stahování webového archivu CMSinFS...' });

    let buffer: Buffer;
    if (res.body && typeof (res.body as any).getReader === 'function') {
      const contentLengthHeader = res.headers.get('content-length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;
      let loadedBytes = 0;
      const chunks: Uint8Array[] = [];
      const reader = (res.body as any).getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.length;
          const percent = totalBytes && totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : undefined;
          onProgress?.({
            step: 'downloading',
            percent,
            loadedBytes,
            totalBytes,
            log: totalBytes
              ? `Stahování: ${(loadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB (${percent}%)`
              : `Stahování: ${(loadedBytes / 1024 / 1024).toFixed(1)} MB`,
          });
        }
      }
      buffer = Buffer.concat(chunks);
    } else {
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // ZIP magic bytes check: PK.. (0x50, 0x4B)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      const rawText = buffer.toString('utf-8').trim();
      return {
        success: false,
        error: rawText ? `Server vrátil chybu: ${rawText.slice(0, 250)}` : 'Server nevrátil platný ZIP archiv.',
      };
    }

    onProgress?.({ step: 'purging', log: `Čištění cílové složky ${path.basename(cleanTarget)}...` });

    // Prepare target directory: if exists, purge contents; if not, create
    try {
      if (!fs.existsSync(cleanTarget)) {
        fs.mkdirSync(cleanTarget, { recursive: true });
      } else {
        const entries = fs.readdirSync(cleanTarget);
        for (const entry of entries) {
          const entryPath = path.join(cleanTarget, entry);
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      }
    } catch (fsErr: any) {
      return {
        success: false,
        error: `Nelze připravit cílovou složku "${cleanTarget}": ${fsErr?.message}`,
      };
    }

    // Extract ZIP safely
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (zipErr: any) {
      return {
        success: false,
        error: `Nepodařilo se otevřít stažený ZIP archiv: ${zipErr?.message}`,
      };
    }

    const zipEntries = zip.getEntries();
    for (const entry of zipEntries) {
      const normalized = path.normalize(entry.entryName);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        return {
          success: false,
          error: `Detekována nepovolená cesta v archivu: ${entry.entryName}`,
        };
      }
    }

    onProgress?.({ step: 'extracting', log: `Rozbalování ${zipEntries.length} souborů do ${path.basename(cleanTarget)}...` });

    zip.extractAllTo(cleanTarget, true);

    onProgress?.({ step: 'done', log: `Hotovo. Rozbaleno ${zipEntries.length} souborů.` });

    return {
      success: true,
      targetPath: cleanTarget,
      fileCount: zipEntries.length,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Chyba při stahování zdrojových kódů webu z instance.',
    };
  }
}
