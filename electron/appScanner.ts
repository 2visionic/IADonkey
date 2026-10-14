import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import type { LauncherItem } from '../src/types';

import { execFile } from 'node:child_process';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

interface AppCandidate {
  name: string;
  location: string;
  iconPath?: string | null;
  isUwp?: boolean;
}

export class AppScanner {
  private cachedApps: LauncherItem[] = [];
  private scanPromise: Promise<LauncherItem[]> | null = null;

  public async scanApps(): Promise<LauncherItem[]> {
    if (this.scanPromise) {
      return this.scanPromise;
    }

    this.scanPromise = this.performScan();
    try {
      return await this.scanPromise;
    } finally {
      this.scanPromise = null;
    }
  }

  private async performScan(): Promise<LauncherItem[]> {
    try {
      const foldersToScan: string[] = [];

      const programData = process.env.ProgramData || 'C:\\ProgramData';
      foldersToScan.push(path.join(programData, 'Microsoft\\Windows\\Start Menu\\Programs'));

      if (process.env.APPDATA) {
        foldersToScan.push(path.join(process.env.APPDATA, 'Microsoft\\Windows\\Start Menu\\Programs'));
      }

      const candidates: AppCandidate[] = [];
      const seen = new Set<string>();

      const isIgnoredName = (name: string) => {
        const lower = name.toLowerCase();
        return (
          lower.includes('uninstall') ||
          lower.includes('odinstalovat') ||
          lower.includes('odebrat') ||
          lower.includes('help') ||
          lower.includes('nápověda') ||
          lower.includes('napoveda') ||
          lower.includes('readme') ||
          lower.includes('documentation') ||
          lower.includes('dokumentace') ||
          lower.includes('license') ||
          lower.includes('licence') ||
          lower.includes('website')
        );
      };

      // 1. Scan filesystem for classic .lnk shortcuts
      const walkDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
              const baseName = entry.name.slice(0, -4).trim();
              if (isIgnoredName(baseName)) {
                continue;
              }
              const key = baseName.toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                candidates.push({ name: baseName, location: fullPath, isUwp: false });
              }
            }
          }
        } catch (err) {
          console.warn(`[AppScanner] Error reading directory ${dir}:`, err);
        }
      };

      for (const folder of foldersToScan) {
        walkDir(folder);
      }

      // 2. Query Get-StartApps with UWP package logo extraction
      try {
        const psScript = `
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
          $OutputEncoding = [System.Text.Encoding]::UTF8
          $pkgMap = @{}
          Get-AppxPackage | ForEach-Object {
              if ($_.PackageFamilyName -and $_.InstallLocation) {
                  $pkgMap[$_.PackageFamilyName] = $_.InstallLocation
              }
          }

          function Get-UwpLogo($dir) {
              if (-not $dir -or -not (Test-Path $dir)) { return $null }
              $m = Join-Path $dir 'AppxManifest.xml'
              if (-not (Test-Path $m)) { return $null }
              try {
                  [xml]$xml = Get-Content $m -Raw -Encoding UTF8
                  $appEl = $xml.Package.Applications.Application
                  if ($appEl -is [System.Array]) { $appEl = $appEl[0] }
                  $ve = $appEl.VisualElements
                  $logoRel = $null
                  if ($ve.Square44x44Logo) { $logoRel = $ve.Square44x44Logo }
                  elseif ($ve.Square150x150Logo) { $logoRel = $ve.Square150x150Logo }
                  elseif ($xml.Package.Properties.Logo) { $logoRel = $xml.Package.Properties.Logo }
                  if ($logoRel) {
                      $basePath = Join-Path $dir $logoRel
                      if (Test-Path $basePath) { return $basePath }
                      $parent = Split-Path $basePath
                      $stem = [System.IO.Path]::GetFileNameWithoutExtension($basePath)
                      $ext = [System.IO.Path]::GetExtension($basePath)
                      $matches = Get-ChildItem $parent -Filter ($stem + '*' + $ext) -ErrorAction SilentlyContinue
                      $best = $matches | Where-Object { $_.Name -match 'targetsize-48|targetsize-44|targetsize-32|scale-100|scale-125|scale-150|scale-200' } | Select-Object -First 1
                      if ($best) { return $best.FullName }
                      if ($matches) { return ($matches | Select-Object -First 1).FullName }
                  }
              } catch {}
              return $null
          }

          $apps = Get-StartApps
          $results = @()
          foreach ($a in $apps) {
              if (-not $a.Name -or -not $a.AppID) { continue }
              $iconPath = $null
              if ($a.AppID -match '!') {
                  $fam = $a.AppID.Split('!')[0]
                  if ($pkgMap.ContainsKey($fam)) {
                      $iconPath = Get-UwpLogo $pkgMap[$fam]
                  }
              }
              $results += [PSCustomObject]@{
                  Name = $a.Name
                  AppID = $a.AppID
                  IconPath = $iconPath
              }
          }
          $results | ConvertTo-Json -Compress
        `;

        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        const { stdout } = await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
          { maxBuffer: 10 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }
        );

        if (stdout && stdout.trim()) {
          const parsed = JSON.parse(stdout);
          const startApps: { Name: string; AppID: string; IconPath?: string | null }[] = Array.isArray(parsed)
            ? parsed
            : [parsed];

          for (const sa of startApps) {
            if (!sa.Name || !sa.AppID) continue;
            const appName = sa.Name.trim();
            if (isIgnoredName(appName)) continue;

            const key = appName.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({
                name: appName,
                location: `shell:AppsFolder\\${sa.AppID}`,
                iconPath: sa.IconPath || null,
                isUwp: true,
              });
            }
          }
        }
      } catch (psErr) {
        console.warn('[AppScanner] Get-StartApps query skipped or failed:', psErr);
      }

      // 3. Extract icons using direct file read or Electron native getFileIcon
      const appsWithIcons: LauncherItem[] = await Promise.all(
        candidates.map(async (item, idx) => {
          let iconDataUrl: string | null = null;

          // If a direct icon file was resolved (e.g. from UWP manifest)
          if (item.iconPath && fs.existsSync(item.iconPath)) {
            try {
              const buf = fs.readFileSync(item.iconPath);
              if (buf.length > 0) {
                const ext = path.extname(item.iconPath).toLowerCase();
                const mime = ext === '.ico' ? 'image/x-icon' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                iconDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
              }
            } catch {
              // fallback
            }
          }

          // Otherwise use Electron native getFileIcon for Win32 files
          if (!iconDataUrl && app?.getFileIcon) {
            let iconLookupPath = item.location;

            if (!item.isUwp && shell?.readShortcutLink) {
              try {
                const shortcut = shell.readShortcutLink(item.location);
                if (shortcut?.target && fs.existsSync(shortcut.target)) {
                  iconLookupPath = shortcut.target;
                } else if (shortcut?.icon && fs.existsSync(shortcut.icon)) {
                  iconLookupPath = shortcut.icon;
                }
              } catch {
                // Ignore shortcuts that cannot be parsed by readShortcutLink
              }
            }

            try {
              let nativeImg = await app.getFileIcon(iconLookupPath, { size: 'normal' });
              if ((!nativeImg || nativeImg.isEmpty()) && iconLookupPath !== item.location) {
                nativeImg = await app.getFileIcon(item.location, { size: 'normal' });
              }
              if (nativeImg && !nativeImg.isEmpty()) {
                const pngBuf = nativeImg.toPNG();
                // Filter out the Windows generic empty document icon (~281 bytes)
                if (pngBuf.length > 350) {
                  iconDataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`;
                }
              }
            } catch {
              // fallback
            }
          }

          const normalizedSlug = item.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

          return {
            id: `win-app-${normalizedSlug || idx}`,
            name: item.name,
            location: item.location,
            action: 'open',
            icon: 'apps',
            image: iconDataUrl,
            priority: 99,
            sourceId: 'windows-apps',
          };
        })
      );

      this.cachedApps = appsWithIcons;
      console.log(`[AppScanner] Successfully indexed ${this.cachedApps.length} installed Windows applications.`);
      return this.cachedApps;
    } catch (err) {
      console.error('[AppScanner] Failed to scan installed applications:', err);
      return this.cachedApps;
    }
  }

  public getCachedApps(): LauncherItem[] {
    return this.cachedApps;
  }
}
