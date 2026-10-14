import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { app } from 'electron';
import { AppStore } from './store';
import { UpdateInfo, DownloadProgress } from '../src/types';

export class UpdateChecker {
  private store: AppStore;

  constructor(store: AppStore) {
    this.store = store;
  }

  /**
   * Compares two semantic version strings (e.g. '1.0.2' vs '1.0.1')
   * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/i, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/i, '').split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Checks for updates against the configured URL
   */
  public async checkForUpdates(isManual = false): Promise<UpdateInfo> {
    const config = this.store.getConfig();
    let currentVersion = app.getVersion() || '0.1.1';
    try {
      if (!app.isPackaged) {
        const pkgPath = path.join(app.getAppPath(), 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.version) currentVersion = pkg.version;
        }
      }
    } catch {}
    const updateUrl = config.updateUrl || 'https://raw.githubusercontent.com/magicware/IADonkey/main/version.json';

    try {
      const res = await fetch(updateUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': `IADonkey-Launcher/${currentVersion}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Server vrátil kód ${res.status}`);
      }

      const data = await res.json();
      const latestVersion = data.version || currentVersion;
      const releaseNotes = data.notes || data.releaseNotes || '';
      // Prefer zipUrl for smooth in-app updates, fallback to downloadUrl
      const downloadUrl = data.zipUrl || data.downloadUrl || data.url || '';

      const isNewer = this.compareVersions(latestVersion, currentVersion) > 0;

      if (!isNewer) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion,
          releaseNotes,
          downloadUrl,
        };
      }

      // Check if user declined this specific version within the last 24 hours
      if (!isManual && config.lastDeclinedVersion === latestVersion && config.lastDeclinedTime) {
        const msSinceDecline = Date.now() - config.lastDeclinedTime;
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (msSinceDecline < TWENTY_FOUR_HOURS) {
          // Still in the 24h snooze period for automatic checks
          return {
            hasUpdate: false,
            currentVersion,
            latestVersion,
            releaseNotes,
            downloadUrl,
          };
        }
      }

      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes,
        downloadUrl,
      };
    } catch (err) {
      console.error('[UpdateChecker] Failed to check for updates:', err);
      throw err;
    }
  }

  /**
   * Downloads the update binary/archive to temp folder, reporting progress along the way.
   * If the update is a .zip archive, it unpacks it on the fly while in-app.
   */
  public async downloadUpdate(
    downloadUrl: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    const tempDir = app.getPath('temp');
    const isZip = downloadUrl.toLowerCase().includes('.zip');
    let fileName = isZip ? 'IADonkey-update.zip' : 'IADonkey-update.exe';

    try {
      const parsedUrl = new URL(downloadUrl);
      const base = path.basename(parsedUrl.pathname);
      if (base) {
        fileName = base;
      }
    } catch {}

    const targetPath = path.join(tempDir, fileName);

    console.log(`[UpdateChecker] Starting download from ${downloadUrl} to ${targetPath}`);

    const response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': `IADonkey-Launcher/${app.getVersion() || '0.1.0'}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Server při stahování vrátil kód ${response.status}`);
    }

    const total = Number(response.headers.get('content-length')) || 0;
    const fileStream = fs.createWriteStream(targetPath);
    let transferred = 0;

    if (!response.body) {
      throw new Error('Server neposkytl žádná data k zápisu.');
    }

    const readable = Readable.fromWeb(response.body as any);

    readable.on('data', (chunk: Buffer) => {
      transferred += chunk.length;
      // Download represents 0-90% of total progress for zip, or 0-100% for exe
      const maxPct = isZip ? 90 : 100;
      const percent = total > 0 ? Math.min(maxPct, Math.round((transferred / total) * maxPct)) : 0;
      onProgress({ percent, transferred, total });
    });

    await new Promise<void>((resolve, reject) => {
      readable.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', (err) => reject(err));
      readable.on('error', (err) => reject(err));
    });

    console.log(`[UpdateChecker] Download complete: ${targetPath}`);

    // If update is a zip archive, extract it immediately in temp so restart takes < 1 second!
    if (isZip || targetPath.endsWith('.zip')) {
      onProgress({ percent: 92, transferred: total, total });
      const extractDir = path.join(tempDir, 'IADonkey-update-extracted');
      if (fs.existsSync(extractDir)) {
        try {
          fs.rmSync(extractDir, { recursive: true, force: true });
        } catch {}
      }
      fs.mkdirSync(extractDir, { recursive: true });

      console.log(`[UpdateChecker] Extracting update zip to ${extractDir}...`);
      try {
        const result = spawnSync('tar', ['-xf', targetPath, '-C', extractDir], {
          windowsHide: true,
        });
        if (result.error) {
          throw result.error;
        }
      } catch (tarErr) {
        console.warn('[UpdateChecker] tar failed, trying PowerShell Expand-Archive:', tarErr);
        spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `Expand-Archive -Path '${targetPath}' -DestinationPath '${extractDir}' -Force`,
          ],
          { windowsHide: true }
        );
      }

      onProgress({ percent: 100, transferred: total, total });

      // Check if extracted files are nested inside a subfolder (like win-unpacked)
      let resolvedDir = extractDir;
      const entries = fs.readdirSync(extractDir);
      if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
        resolvedDir = path.join(extractDir, entries[0]);
      }

      return resolvedDir;
    }

    return targetPath;
  }

  /**
   * Installs update and cleanly restarts application.
   * If update was extracted to a folder, it uses a sub-second robocopy swap script.
   * If update is an executable, it runs it with silent flags.
   */
  public installAndRestart(filePath: string, beforeExit?: () => void): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Soubor nebo složka aktualizace nebyla nalezena: ${filePath}`);
    }

    console.log(`[UpdateChecker] Preparing for update installation: ${filePath}`);

    // Execute window destruction, shortcut unregistration, etc.
    try {
      beforeExit?.();
    } catch (err) {
      console.error('[UpdateChecker] Error in beforeExit callback:', err);
    }

    // Release single instance lock and prevent second-instance triggers
    try {
      app.removeAllListeners('second-instance');
      app.releaseSingleInstanceLock();
    } catch (err) {
      console.error('[UpdateChecker] Error releasing single instance lock:', err);
    }

    const isDirectory = fs.statSync(filePath).isDirectory();

    if (isDirectory) {
      // Sub-second instant swap update!
      const targetDir = app.isPackaged
        ? path.dirname(process.resourcesPath)
        : path.join(process.env.LOCALAPPDATA || '', 'Programs', 'IADonkey');
      const tempDir = app.getPath('temp');
      const swapBat = path.join(tempDir, 'iadonkey-swap-update.bat');
      const swapVbs = path.join(tempDir, 'iadonkey-swap-runner.vbs');

      const cleanFilePath = filePath.replace(/[\\/]+$/, '');
      const cleanTargetDir = targetDir.replace(/[\\/]+$/, '');

      const batContent = `@echo off
timeout /t 1 /nobreak >nul
robocopy "${cleanFilePath}" "${cleanTargetDir}" /E /IS /IT /MOVE >nul 2>&1
ie4uinit.exe -show >nul 2>&1
start "" "${cleanTargetDir}\\IADonkey.exe" --updated
del "%~f0" >nul 2>&1
exit
`;
      fs.writeFileSync(swapBat, batContent, 'utf8');

      // VBScript runner executed via wscript.exe (GUI subsystem) guarantees 0% console window flicker
      const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c """ & WScript.Arguments(0) & """", 0, False
Set FSO = CreateObject("Scripting.FileSystemObject")
On Error Resume Next
FSO.DeleteFile WScript.ScriptFullName
`;
      fs.writeFileSync(swapVbs, vbsContent, 'utf8');

      console.log(`[UpdateChecker] Spawning 100% silent swap runner via wscript: ${swapVbs}`);
      const child = spawn('wscript.exe', ['//B', '//nologo', swapVbs, swapBat], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } else {
      // Executable fallback
      console.log(`[UpdateChecker] Spawning updater executable: ${filePath}`);
      const child = spawn(filePath, ['/S', '--force-run', '--updated'], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }

    console.log(`[UpdateChecker] Terminating current application process...`);

    setTimeout(() => {
      try {
        app.exit(0);
      } catch {}
      try {
        process.exit(0);
      } catch {}
    }, 150);
  }
}

