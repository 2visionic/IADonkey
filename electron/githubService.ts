import type { GithubSettings, LauncherItem } from '../src/types';

export interface GitHubTestResult {
  ok: boolean;
  user?: {
    login: string;
    name?: string;
    avatar_url?: string;
  };
  orgs?: string[];
  repoCount?: number;
  error?: string;
}

interface RawGitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url?: string;
  description?: string | null;
  private?: boolean;
  default_branch?: string;
  language?: string | null;
  owner?: {
    login: string;
    avatar_url?: string;
    type?: string;
  };
}

function getApiBaseUrl(apiUrl?: string): string {
  if (!apiUrl || !apiUrl.trim()) {
    return 'https://api.github.com';
  }
  return apiUrl.trim().replace(/\/+$/, '');
}

function getWebBaseUrl(apiUrl?: string): string {
  if (!apiUrl || !apiUrl.trim() || apiUrl.includes('api.github.com')) {
    return 'https://github.com';
  }
  return apiUrl.trim().replace(/\/api(\/v\d+)?\/?$/i, '').replace(/\/+$/, '');
}

export function getActiveGitHubToken(settings?: GithubSettings): string {
  if (!settings) return '';
  if (settings.authMode === 'oauth') {
    return settings.oauthToken?.trim() || '';
  }
  return settings.token?.trim() || '';
}

function getHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'IADonkey-Launcher',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liKwJB5JD7CEPsO3';

/**
 * Initiates the GitHub Device Authorization Flow (RFC 8628).
 */
export async function startGitHubDeviceFlow(params: { clientId?: string; apiUrl?: string }): Promise<{
  success: boolean;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  interval?: number;
  expiresIn?: number;
  error?: string;
}> {
  const clientId = params.clientId?.trim() || DEFAULT_GITHUB_CLIENT_ID;
  if (!clientId) {
    return { success: false, error: 'Chybí Client ID GitHub OAuth aplikace.' };
  }

  const webBase = getWebBaseUrl(params.apiUrl);
  try {
    const res = await fetch(`${webBase}/login/device/code`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: 'repo read:org user',
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error_description || data.error || `Chyba při inicializaci OAuth (${res.status})`,
      };
    }

    return {
      success: true,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri || `${webBase}/login/device`,
      interval: data.interval || 5,
      expiresIn: data.expires_in || 900,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Nepodařilo se připojit k autorizačnímu serveru GitHubu.',
    };
  }
}

/**
 * Polls the GitHub OAuth token endpoint during Device Flow authorization.
 */
export async function pollGitHubDeviceToken(params: { clientId?: string; deviceCode: string; apiUrl?: string }): Promise<{
  status: 'success' | 'pending' | 'slow_down' | 'expired' | 'denied' | 'error';
  accessToken?: string;
  user?: { login: string; name?: string; avatar_url?: string };
  error?: string;
}> {
  const clientId = params.clientId?.trim() || DEFAULT_GITHUB_CLIENT_ID;
  const { deviceCode } = params;
  const webBase = getWebBaseUrl(params.apiUrl);
  const apiBase = getApiBaseUrl(params.apiUrl);

  try {
    const res = await fetch(`${webBase}/login/oauth/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId.trim(),
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await res.json();
    if (data.error) {
      if (data.error === 'authorization_pending') {
        return { status: 'pending' };
      }
      if (data.error === 'slow_down') {
        return { status: 'slow_down' };
      }
      if (data.error === 'expired_token') {
        return { status: 'expired', error: 'Platnost kódu zařízení vypršela. Spusťte přihlášení znovu.' };
      }
      if (data.error === 'access_denied') {
        return { status: 'denied', error: 'Přístup byl na GitHubu zamítnut uživatelem.' };
      }
      return { status: 'error', error: data.error_description || data.error };
    }

    if (data.access_token) {
      try {
        const userRes = await fetch(`${apiBase}/user`, {
          headers: getHeaders(data.access_token),
        });
        let userData: { login: string; name?: string; avatar_url?: string } | undefined;
        if (userRes.ok) {
          const u = await userRes.json();
          userData = {
            login: u.login,
            name: u.name,
            avatar_url: u.avatar_url,
          };
        }
        return {
          status: 'success',
          accessToken: data.access_token,
          user: userData,
        };
      } catch {
        return {
          status: 'success',
          accessToken: data.access_token,
        };
      }
    }

    return { status: 'error', error: 'Server nevrátil přístupový token.' };
  } catch (err: any) {
    return { status: 'error', error: err?.message || 'Chyba sítě při ověřování tokenu.' };
  }
}

/**
 * Tests connection to GitHub with the provided credentials or OAuth token.
 */
export async function testGitHubConnection(settings?: GithubSettings): Promise<GitHubTestResult> {
  const isOAuth = settings?.authMode === 'oauth';
  const token = getActiveGitHubToken(settings);
  if (!token) {
    return {
      ok: false,
      error: isOAuth
        ? 'Účet GitHub není propojen přes OAuth. Přihlaste se prosím tlačítkem výše.'
        : 'Chybí Personal Access Token (PAT).',
    };
  }

  const base = getApiBaseUrl(settings?.apiUrl);
  const headers = getHeaders(token);

  try {
    // 1. Fetch authenticated user profile
    const userRes = await fetch(`${base}/user`, { headers });
    if (!userRes.ok) {
      if (userRes.status === 401) {
        return { ok: false, error: 'Neplatný token (HTTP 401 Unauthorized).' };
      }
      return { ok: false, error: `Chyba GitHub API: ${userRes.status} ${userRes.statusText}` };
    }
    const userData = (await userRes.json()) as { login: string; name?: string; avatar_url?: string };

    // 2. Fetch user's organizations
    let orgNames: string[] = [];
    try {
      const orgsRes = await fetch(`${base}/user/orgs`, { headers });
      if (orgsRes.ok) {
        const orgsData = (await orgsRes.json()) as Array<{ login: string }>;
        orgNames = orgsData.map((o) => o.login);
      }
    } catch {}

    // 3. Count accessible repositories
    const repos = await fetchGitHubRepos(settings);

    return {
      ok: true,
      user: {
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
      },
      orgs: orgNames,
      repoCount: repos.length,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Nepodařilo se navázat spojení se serverem GitHub.' };
  }
}

/**
 * Fetches repositories accessible to the user (personal + organizations)
 * and formats them as LauncherItems.
 */
export async function fetchGitHubRepos(settings?: GithubSettings): Promise<LauncherItem[]> {
  const token = getActiveGitHubToken(settings);
  if (!token) return [];

  const base = getApiBaseUrl(settings?.apiUrl);
  const headers = getHeaders(token);
  const reposMap = new Map<number, RawGitHubRepo>();

  // Fetch page 1 (and 2 if needed) of user repos (including orgs membership)
  try {
    const userReposUrl = `${base}/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated`;
    const res = await fetch(userReposUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const data = (await res.json()) as RawGitHubRepo[];
      if (Array.isArray(data)) {
        for (const repo of data) {
          if (repo && repo.id) {
            reposMap.set(repo.id, repo);
          }
        }
      }
    } else {
      console.warn(`[GitHubService] /user/repos returned status ${res.status}`);
    }
  } catch (err) {
    console.error('[GitHubService] Error fetching user repos:', err);
  }

  // If a specific username is set or known via OAuth, fetch that user's repos as well to guarantee full coverage
  const specificUser = settings?.username?.trim() || (settings?.authMode === 'oauth' ? settings?.oauthUser?.login : '');
  if (specificUser) {
    try {
      const userUrl = `${base}/users/${encodeURIComponent(specificUser)}/repos?per_page=100&sort=updated`;
      const res = await fetch(userUrl, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = (await res.json()) as RawGitHubRepo[];
        if (Array.isArray(data)) {
          for (const repo of data) {
            if (repo && repo.id) {
              reposMap.set(repo.id, repo);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[GitHubService] Error fetching user "${specificUser}" repos:`, err);
    }
  }

  // If a specific organization is set, fetch org repos as well to guarantee full coverage
  const specificOrg = settings?.org?.trim();
  if (specificOrg) {
    try {
      const orgReposUrl = `${base}/orgs/${encodeURIComponent(specificOrg)}/repos?per_page=100&sort=updated`;
      const res = await fetch(orgReposUrl, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = (await res.json()) as RawGitHubRepo[];
        if (Array.isArray(data)) {
          for (const repo of data) {
            if (repo && repo.id) {
              reposMap.set(repo.id, repo);
            }
          }
        }
      } else {
        console.warn(`[GitHubService] /orgs/${specificOrg}/repos returned status ${res.status}`);
      }
    } catch (err) {
      console.error(`[GitHubService] Error fetching org "${specificOrg}" repos:`, err);
    }
  }

  const allRawRepos = Array.from(reposMap.values());

  // Map to LauncherItem
  return allRawRepos.map(mapRawRepoToLauncherItem);
}

export function mapRawRepoToLauncherItem(repo: RawGitHubRepo): LauncherItem {
  const isPrivate = repo.private === true;
  const repoLabel = repo.full_name || repo.name;

  return {
    id: `github-${repo.id}`,
    name: repoLabel,
    location: repo.html_url,
    action: 'open',
    icon: 'folder_code',
    image: '{favicon}',
    priority: 5,
    settings: 'git',
    sourceId: 'github',
    shortcuts: [repo.name, repo.full_name],
    actions: [
      {
        name: 'Klonovat repozitář (git clone)...',
        action: 'clone',
        location: repo.clone_url,
        icon: 'download',
        settings: 'git',
      },
      {
        name: 'Otevřít na GitHubu',
        action: 'open',
        location: repo.html_url,
        icon: 'open_in_new',
        settings: 'git',
      },
    ],
    info: {
      'Repozitář': repoLabel,
      'Vlastník': repo.owner?.login || '',
      'Viditelnost': isPrivate ? 'Soukromý (Private)' : 'Veřejný (Public)',
      'Výchozí větev': repo.default_branch || 'main',
      'Clone URL': repo.clone_url,
      'SSH URL': repo.ssh_url,
      ...(repo.language ? { 'Jazyk': repo.language } : {}),
    },
  };
}

export interface GitHubOwnerOption {
  login: string;
  type: 'user' | 'org';
  name?: string;
  avatarUrl?: string;
}

/**
 * Fetches available repository owners (authenticated user + organizations).
 * If a default organization is configured in settings, it is placed first.
 */
export async function fetchGitHubOwners(settings?: GithubSettings): Promise<{
  ok: boolean;
  owners: GitHubOwnerOption[];
  error?: string;
}> {
  const token = getActiveGitHubToken(settings);
  if (!token) {
    return { ok: false, owners: [], error: 'Chybí přihlášení nebo přístupový token pro GitHub.' };
  }

  const base = getApiBaseUrl(settings?.apiUrl);
  const headers = getHeaders(token);
  const ownersMap = new Map<string, GitHubOwnerOption>();

  try {
    const userRes = await fetch(`${base}/user`, { headers });
    if (userRes.ok) {
      const userData = (await userRes.json()) as { login: string; name?: string; avatar_url?: string };
      if (userData?.login) {
        ownersMap.set(userData.login.toLowerCase(), {
          login: userData.login,
          type: 'user',
          name: userData.name || undefined,
          avatarUrl: userData.avatar_url || undefined,
        });
      }
    }
  } catch (err) {
    console.warn('[GitHubService] Failed to fetch /user for owners:', err);
  }

  if (ownersMap.size === 0) {
    const fallbackUser = settings?.oauthUser?.login || settings?.username?.trim();
    if (fallbackUser) {
      ownersMap.set(fallbackUser.toLowerCase(), {
        login: fallbackUser,
        type: 'user',
        name: settings?.oauthUser?.name,
        avatarUrl: settings?.oauthUser?.avatar_url,
      });
    }
  }

  try {
    const orgsRes = await fetch(`${base}/user/orgs?per_page=100`, { headers });
    if (orgsRes.ok) {
      const orgsData = (await orgsRes.json()) as Array<{ login: string; description?: string; avatar_url?: string }>;
      if (Array.isArray(orgsData)) {
        for (const o of orgsData) {
          if (o?.login) {
            ownersMap.set(o.login.toLowerCase(), {
              login: o.login,
              type: 'org',
              name: o.description || undefined,
              avatarUrl: o.avatar_url || undefined,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[GitHubService] Failed to fetch /user/orgs for owners:', err);
  }

  const configuredOrg = settings?.org?.trim();
  if (configuredOrg && !ownersMap.has(configuredOrg.toLowerCase())) {
    ownersMap.set(configuredOrg.toLowerCase(), {
      login: configuredOrg,
      type: 'org',
    });
  }

  const allOwners = Array.from(ownersMap.values());
  if (configuredOrg) {
    const prefLower = configuredOrg.toLowerCase();
    allOwners.sort((a, b) => {
      if (a.login.toLowerCase() === prefLower && b.login.toLowerCase() !== prefLower) return -1;
      if (b.login.toLowerCase() === prefLower && a.login.toLowerCase() !== prefLower) return 1;
      if (a.type !== b.type) return a.type === 'org' ? -1 : 1;
      return a.login.localeCompare(b.login);
    });
  }

  return { ok: true, owners: allOwners };
}

export interface CreateGitHubRepoParams {
  owner: string;
  ownerType?: 'user' | 'org';
  name: string;
  description?: string;
  isPrivate: boolean;
  autoInit: boolean;
}

/**
 * Creates a new GitHub repository under the authenticated user or an organization.
 */
export async function createGitHubRepository(
  settings: GithubSettings | undefined,
  params: CreateGitHubRepoParams
): Promise<{
  ok: boolean;
  repo?: {
    id: number;
    name: string;
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    sshUrl?: string;
    defaultBranch?: string;
    private: boolean;
  };
  item?: LauncherItem;
  error?: string;
}> {
  const token = getActiveGitHubToken(settings);
  if (!token) {
    return { ok: false, error: 'Chybí přihlášení nebo přístupový token pro GitHub.' };
  }

  const repoName = (params.name || '').trim();
  if (!repoName) {
    return { ok: false, error: 'Název repozitáře nesmí být prázdný.' };
  }

  const base = getApiBaseUrl(settings?.apiUrl);
  const headers = {
    ...getHeaders(token),
    'Content-Type': 'application/json',
  };

  let isOrg = params.ownerType === 'org';
  const ownerLogin = (params.owner || '').trim();

  if (ownerLogin && !params.ownerType) {
    const authUser = settings?.oauthUser?.login || settings?.username?.trim() || '';
    if (authUser && ownerLogin.toLowerCase() !== authUser.toLowerCase()) {
      isOrg = true;
    }
  }

  const endpoint =
    isOrg && ownerLogin
      ? `${base}/orgs/${encodeURIComponent(ownerLogin)}/repos`
      : `${base}/user/repos`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: repoName,
        description: params.description?.trim() || undefined,
        private: Boolean(params.isPrivate),
        auto_init: Boolean(params.autoInit),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const apiMsg =
        Array.isArray(data?.errors) && data.errors[0]?.message
          ? `${data.message || ''} (${data.errors[0].message})`.trim()
          : data?.message || `${res.status} ${res.statusText}`;

      if (res.status === 422 && JSON.stringify(data).toLowerCase().includes('name already exists')) {
        return {
          ok: false,
          error: `Repozitář s názvem „${repoName}“ již pod účtem/organizací ${ownerLogin || ''} existuje.`,
        };
      }
      if (res.status === 403 || res.status === 401) {
        return {
          ok: false,
          error: `Nedostatečná oprávnění pro vytvoření repozitáře (${apiMsg}). Zkontrolujte oprávnění tokenu (scope 'repo').`,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          error: `Organizace nebo cílový účet „${ownerLogin}“ nebyl nalezen nebo váš token nemá oprávnění vytvářet v něm repozitáře.`,
        };
      }
      return {
        ok: false,
        error: `Nepodařilo se vytvořit repozitář: ${apiMsg}`,
      };
    }

    const rawRepo = data as RawGitHubRepo;
    const item = mapRawRepoToLauncherItem(rawRepo);

    return {
      ok: true,
      repo: {
        id: rawRepo.id,
        name: rawRepo.name,
        fullName: rawRepo.full_name || rawRepo.name,
        htmlUrl: rawRepo.html_url,
        cloneUrl: rawRepo.clone_url,
        sshUrl: rawRepo.ssh_url,
        defaultBranch: rawRepo.default_branch || 'main',
        private: Boolean(rawRepo.private),
      },
      item,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Chyba sítě při komunikaci s GitHub API.',
    };
  }
}

