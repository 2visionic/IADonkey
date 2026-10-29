import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { app, shell } from 'electron';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// In Electron, default 'fs' intercepts *.asar files and treats them as virtual directories.
// To safely scan, read, and copy *.asar files as real binary files, we must use Electron's unpatched 'original-fs' module.
let fileSystem: typeof fs = fs;
try {
  fileSystem = (require('original-fs') as typeof fs) || fs;
} catch {
  fileSystem = fs;
}

export interface InstallOptions {
  targetDir: string;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  autoStartWithWindows: boolean;
}

export interface InstallProgress {
  percent: number;
  phase: string;
  detail?: string;
}

export class InstallerService {
  /**
   * Default installation path in user's LocalAppData (per-user installation, no admin needed)
   */
  public static getDefaultInstallPath(): string {
    const localAppData =
      process.env.LOCALAPPDATA ||
      (process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'AppData', 'Local')
        : 'C:\\Users\\Default\\AppData\\Local');
    return path.join(localAppData, 'Programs', 'IADonkey');
  }

  /**
   * Checks if current process is running in installer mode.
   */
  public static isInstallerMode(): boolean {
    if (!app.isPackaged) return false;
    if (process.argv.includes('--install') || process.argv.includes('--setup')) return true;
    if (process.argv.includes('--uninstall')) return false;
    if (process.argv.includes('--portable')) return false;

    // Check executable name
    const exeName = path.basename(process.execPath).toLowerCase();
    if (exeName.includes('setup') || exeName.includes('installer')) return true;

    // Compare running path with default or registered install path
    const currentDir = path.dirname(process.execPath).toLowerCase();
    const defaultInstallDir = InstallerService.getDefaultInstallPath().toLowerCase();

    // If running inside default install folder, it is the installed app
    if (currentDir === defaultInstallDir) {
      return false;
    }

    // Check if installed.json exists next to the current exe
    const markerFile = path.join(path.dirname(process.execPath), 'installed.json');
    if (fs.existsSync(markerFile)) {
      return false;
    }

    return true;
  }

  /**
   * Performs installation into targetDir with live progress reporting.
   */
  public static async performInstall(
    options: InstallOptions,
    onProgress: (progress: InstallProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const targetDir = options.targetDir || InstallerService.getDefaultInstallPath();
      const sourceDir = path.dirname(process.resourcesPath);

      onProgress({ percent: 5, phase: 'Příprava instalace', detail: 'Kontrola cílové složky...' });

      // 1. Ensure target directory exists
      if (!fileSystem.existsSync(targetDir)) {
        fileSystem.mkdirSync(targetDir, { recursive: true });
      }

      onProgress({ percent: 10, phase: 'Příprava instalace', detail: 'Ukončování běžících instancí IADonkey...' });

      // Terminate any running IADonkey instance from targetDir or background (except the installer itself)
      try {
        const currentPid = process.pid;
        const psCommand = `
          $currentExe = (Get-Process -Id ${currentPid} -ErrorAction SilentlyContinue).Path
          $installerDir = if ($currentExe) { Split-Path -Parent $currentExe } else { '' }

          Get-Process -Name IADonkey -ErrorAction SilentlyContinue | Where-Object {
            $p = $_
            if ($p.Id -eq ${currentPid}) { return $false }
            if (-not $p.Path) { return $false }
            if ($installerDir -and $p.Path.StartsWith($installerDir, [System.StringComparison]::OrdinalIgnoreCase)) {
              return $false
            }
            return $true
          } | ForEach-Object {
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
          }
        `.trim();

        spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
          windowsHide: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err: any) {
        console.warn('[Installer] Warning terminating processes:', err.message);
      }

      onProgress({ percent: 15, phase: 'Kopírování souborů', detail: 'Příprava seznamu souborů...' });

      // 2. Collect all files from source directory using unpatched original-fs
      const allFiles: { src: string; rel: string }[] = [];
      function scanDir(dir: string, base: string) {
        const entries = fileSystem.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = path.relative(base, full);
          if (entry.isDirectory()) {
            scanDir(full, base);
          } else {
            allFiles.push({ src: full, rel });
          }
        }
      }

      scanDir(sourceDir, sourceDir);

      const totalFiles = allFiles.length;
      let copiedCount = 0;

      for (const item of allFiles) {
        const destPath = path.join(targetDir, item.rel);
        const destDir = path.dirname(destPath);
        if (!fileSystem.existsSync(destDir)) {
          fileSystem.mkdirSync(destDir, { recursive: true });
        }

        let copied = false;
        let attempts = 0;
        while (!copied && attempts < 5) {
          try {
            fileSystem.copyFileSync(item.src, destPath);
            copied = true;
          } catch (err: any) {
            attempts++;

            // Atomic rename-swap fallback if target file is locked by Windows background processes
            try {
              if (fileSystem.existsSync(destPath)) {
                const tempOld = destPath + '.old.' + Date.now();
                fileSystem.renameSync(destPath, tempOld);
                fileSystem.copyFileSync(item.src, destPath);
                try { fileSystem.unlinkSync(tempOld); } catch {}
                copied = true;
                break;
              }
            } catch {}

            if (!copied) {
              if (attempts >= 5) {
                console.error(`[Installer] Failed to copy ${item.rel}:`, err);
                throw new Error(`Nepodařilo se přepsat soubor ${item.rel}. Ukončete prosím aplikaci IADonkey v systémové liště.`);
              }
              await new Promise((r) => setTimeout(r, 400));
            }
          }
        }

        copiedCount++;
        const percent = Math.round(15 + (copiedCount / Math.max(1, totalFiles)) * 60);
        onProgress({
          percent,
          phase: 'Kopírování souborů',
          detail: item.rel,
        });
      }

      // 3. Write installed.json metadata
      const version = app.getVersion() || '1.1.8';
      const metadata = {
        version,
        installedAt: new Date().toISOString(),
        installPath: targetDir,
      };
      fileSystem.writeFileSync(
        path.join(targetDir, 'installed.json'),
        JSON.stringify(metadata, null, 2),
        'utf8'
      );

    // 4. Create Desktop Shortcut if requested
    const targetExe = path.join(targetDir, 'IADonkey.exe');

    if (options.createDesktopShortcut) {
      onProgress({ percent: 80, phase: 'Vytváření zástupce', detail: 'Zástupce na Ploše...' });
      InstallerService.createShortcut(
        'Desktop',
        'IADonkey.lnk',
        targetExe,
        targetDir,
        'IADonkey Launcher a AI asistent'
      );
    }

    // 5. Create Start Menu Shortcut if requested
    if (options.createStartMenuShortcut) {
      onProgress({ percent: 85, phase: 'Vytváření zástupce', detail: 'Zástupce v nabídce Start...' });
      InstallerService.createShortcut(
        'Programs',
        'IADonkey.lnk',
        targetExe,
        targetDir,
        'IADonkey Launcher a AI asistent'
      );
    }

    // 6. Register Windows Uninstall entry in Registry
    onProgress({ percent: 92, phase: 'Registrace v systému', detail: 'Zápis do registrů Windows...' });
    InstallerService.registerWindowsUninstall(targetDir, targetExe, version);

    // 7. Auto start with Windows if requested
    if (options.autoStartWithWindows) {
      try {
        app.setLoginItemSettings({
          openAtLogin: true,
          path: targetExe,
          args: ['--background'],
        });
      } catch {}
    }

    onProgress({ percent: 100, phase: 'Dokončeno', detail: 'Instalace byla úspěšně dokončena!' });
    return { success: true };
  } catch (err: any) {
    console.error('[Installer] Installation error:', err);
    return { success: false, error: err?.message || 'Nastala chyba při instalaci aplikace.' };
  }
}

  /**
   * Helper to create or update a Windows shortcut (.lnk) in-place without resetting Desktop grid position or Taskbar pins
   */
  public static createShortcut(
    specialFolder: 'Desktop' | 'Programs',
    shortcutName: string,
    targetExe: string,
    workingDir: string,
    description: string
  ): void {
    const appId = 'com.iadonkey.launcher';
    try {
      const dir =
        specialFolder === 'Desktop'
          ? app.getPath('desktop')
          : path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      const shortcutPath = path.join(dir, shortcutName);
      const exists = fs.existsSync(shortcutPath);

      let existingClsid: string | undefined;
      if (exists) {
        try {
          const existing = shell.readShortcutLink(shortcutPath);
          if (existing?.toastActivatorClsid) {
            existingClsid = existing.toastActivatorClsid;
          }
          if (
            existing &&
            existing.target?.toLowerCase() === targetExe.toLowerCase() &&
            existing.appUserModelId === appId
          ) {
            return;
          }
        } catch {}
      }

      const written = shell.writeShortcutLink(shortcutPath, exists ? 'update' : 'create', {
        target: targetExe,
        cwd: workingDir,
        description,
        icon: targetExe,
        iconIndex: 0,
        appUserModelId: appId,
        ...(existingClsid ? { toastActivatorClsid: existingClsid } : {}),
      });

      if (written) return;
    } catch {}

    const psScript = `
$ws = New-Object -ComObject WScript.Shell
$dir = [Environment]::GetFolderPath('${specialFolder}')
$shortcut = $ws.CreateShortcut((Join-Path $dir '${shortcutName}'))
$shortcut.TargetPath = '${targetExe.replace(/'/g, "''")}'
$shortcut.WorkingDirectory = '${workingDir.replace(/'/g, "''")}'
$shortcut.IconLocation = '${targetExe.replace(/'/g, "''")},0'
$shortcut.Description = '${description.replace(/'/g, "''")}'
$shortcut.Save()
`.trim();

    try {
      spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
      });
    } catch (err) {
      console.error(`[Installer] Failed to create shortcut in ${specialFolder}:`, err);
    }
  }

  /**
   * Registers the application in Windows HKCU registry for Add/Remove Programs
   */
  public static registerWindowsUninstall(targetDir: string, targetExe: string, version: string): void {
    const escapedExe = targetExe.replace(/'/g, "''");
    const escapedDir = targetDir.replace(/'/g, "''");

    const psScript = `
$regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IADonkey'
if (!(Test-Path $regPath)) {
  New-Item -Path $regPath -Force | Out-Null
}
Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value 'IADonkey'
Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value '${escapedExe},0'
Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value '${version}'
Set-ItemProperty -Path $regPath -Name 'Publisher' -Value 'Petr Coolhanek'
Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value '${escapedDir}'
Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value '"${escapedExe}" --uninstall'
Set-ItemProperty -Path $regPath -Name 'QuietUninstallString' -Value '"${escapedExe}" --uninstall --silent'
Set-ItemProperty -Path $regPath -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $regPath -Name 'NoRepair' -Value 1 -Type DWord
`.trim();

    try {
      spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
      });
    } catch (err) {
      console.error('[Installer] Failed to register uninstall in Registry:', err);
    }
  }

  /**
   * Performs uninstallation: removes shortcuts, unregisters from Windows Registry,
   * and schedules removal of program directory on exit.
   */
  public static performUninstall(): void {
    const psScript = `
# Remove Desktop shortcut
$desktopDir = [Environment]::GetFolderPath('Desktop')
$desktopLnk = Join-Path $desktopDir 'IADonkey.lnk'
if (Test-Path $desktopLnk) { Remove-Item $desktopLnk -Force -ErrorAction SilentlyContinue }

# Remove Start Menu shortcut
$programsDir = [Environment]::GetFolderPath('Programs')
$startLnk = Join-Path $programsDir 'IADonkey.lnk'
if (Test-Path $startLnk) { Remove-Item $startLnk -Force -ErrorAction SilentlyContinue }

# Remove Registry uninstall key
$regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\IADonkey'
if (Test-Path $regPath) { Remove-Item $regPath -Recurse -Force -ErrorAction SilentlyContinue }
`.trim();

    try {
      spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
        windowsHide: true,
      });
    } catch (err) {
      console.error('[Installer] Error cleaning registry/shortcuts during uninstall:', err);
    }

    // Schedule deletion of installation folder after this process exits
    const installDir = path.dirname(process.execPath);
    const tempDir = app.getPath('temp');
    const cleanupBat = path.join(tempDir, 'iadonkey-uninstall-cleanup.bat');

    const batContent = `@echo off
timeout /t 1 /nobreak >nul
rmdir /s /q "${installDir}" >nul 2>&1
del "%~f0" >nul 2>&1
exit
`;
    try {
      fs.writeFileSync(cleanupBat, batContent, 'utf8');
      const child = spawn('cmd.exe', ['/c', cleanupBat], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch {}

    app.exit(0);
  }

  /**
   * Launches installed IADonkey executable and terminates current installer process.
   */
  public static launchInstalledAppAndExit(targetDir: string): void {
    const targetExe = path.join(targetDir, 'IADonkey.exe');
    if (fs.existsSync(targetExe)) {
      const child = spawn(targetExe, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }

    setTimeout(() => {
      app.exit(0);
    }, 150);
  }
}
