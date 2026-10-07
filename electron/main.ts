import { app, BrowserWindow, Menu, globalShortcut, ipcMain, dialog, shell, clipboard, protocol, desktopCapturer, screen, nativeImage, ClipboardItem } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { AppStore } from './store';
import { DataSyncManager } from './dataSync';
import { UpdateChecker } from './updater';
import { WindowManager } from './windowManager';
import { AppScanner } from './appScanner';
import { AppConfig, LauncherItem, ActionLogEntry } from '../src/types';
import { getMagicGateAutoLoginUrl } from './magicGate';
import { testGitHubConnection, startGitHubDeviceFlow, pollGitHubDeviceToken, getActiveGitHubToken } from './githubService';
import { faviconService } from './faviconService';
import { fetchInstanceSectionRepos, runMultiRepoClone, downloadInstanceCmsContent, normalizeInstanceCmsPath, MagicGateSectionRepo } from './magicGateService';
import { InstallerService } from './installerService';
import { diagnosticsService } from './diagnosticsService';
import { notificationService } from './notificationService';
import { easyClipService } from './easyClipService';
import { pasteService } from './pasteService';
import { MagicPlanService } from './magicPlanService';
import { windowDragService } from './windowDragService';
import { feedbackService } from './feedbackService';
import { feedbackNotificationService } from './feedbackNotificationService';

app.name = 'IADonkey';
if (process.platform === 'win32') {
  app.setAppUserModelId('com.iadonkey.launcher');
}

// Register file scheme as secure
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'file',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
  diagnosticsService.recordCrash('Neošetřené odmítnutí Promise (unhandledRejection)', reason, { promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error);
  diagnosticsService.recordCrash('Globální neošetřená výjimka (uncaughtException)', error);
});

let store: AppStore;
let syncManager: DataSyncManager;
let updateChecker: UpdateChecker;
let windowManager: WindowManager;
let appScanner: AppScanner;
let currentHotkey = 'Ctrl+Alt+Space';
let syncIntervalTimer: NodeJS.Timeout | null = null;
let updateIntervalTimer: NodeJS.Timeout | null = null;
let magicPlanService: MagicPlanService;

function getCombinedItems(): LauncherItem[] {
  const customItems = store ? store.getItems() : [];
  const config = store ? store.getConfig() : null;
  if (!config || config.searchInstalledApps !== false) {
    const apps = appScanner ? appScanner.getCachedApps() : [];
    return [...customItems, ...apps];
  }
  return customItems;
}

let lastHotkeyToggle = 0;
function registerGlobalHotkey(hotkey: string) {
  try {
    if (currentHotkey) {
      globalShortcut.unregister(currentHotkey);
    }
    const registered = globalShortcut.register(hotkey, () => {
      const now = Date.now();
      if (now - lastHotkeyToggle < 300) {
        return;
      }
      lastHotkeyToggle = now;

      diagnosticsService.logAction({
        type: 'shortcut',
        title: `Zkratka launcheru: ${hotkey}`,
        details: 'Přepnutí zobrazení vyhledávacího okna Spotlight',
        status: 'info',
      });

      const win = windowManager.getMainWindow();
      if (win && win.isVisible() && (now - windowManager.getLastShowTime() > 500)) {
        windowManager.hideSpotlight();
      } else {
        windowManager.showSpotlight();
      }
    });

    if (!registered) {
      console.warn(`[Main] Failed to register global shortcut: ${hotkey}`);
    } else {
      currentHotkey = hotkey;
      windowManager?.updateTrayTooltip(hotkey);
      console.log(`[Main] Successfully registered shortcut: ${hotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace globální zkratky launcheru', err, { hotkey });
  }
}

function getColorPickerExePath(): string {
  const candidates = [
    // 1. Packaged unpacked resources (prioritní pro produkční sestavení s asarUnpack)
    path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'assets', 'color-picker.exe'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'color-picker.exe'),
    path.join(process.resourcesPath, 'electron', 'assets', 'color-picker.exe'),
    path.join(process.resourcesPath, 'assets', 'color-picker.exe'),
    path.join(process.resourcesPath, 'color-picker.exe'),
    // 2. Standardní cesty pro vývojové prostředí (dev mode)
    path.join(app.getAppPath(), 'electron', 'assets', 'color-picker.exe'),
    path.join(app.getAppPath(), 'dist-electron', 'assets', 'color-picker.exe'),
    path.join(process.cwd(), 'electron', 'assets', 'color-picker.exe'),
    path.join(process.cwd(), 'dist-electron', 'assets', 'color-picker.exe'),
    path.join(__dirname, 'assets', 'color-picker.exe'),
    path.join(__dirname, '..', 'electron', 'assets', 'color-picker.exe'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      // Pokud soubor leží uvnitř app.asar (který Windows CreateProcess neumí přímo spustit)
      if (c.includes('app.asar') && !c.includes('app.asar.unpacked')) {
        const unpackedAttempt = c.replace('app.asar', 'app.asar.unpacked');
        if (fs.existsSync(unpackedAttempt)) {
          console.log('[Main] Found unpacked color-picker.exe at:', unpackedAttempt);
          return unpackedAttempt;
        }

        // Záchranná automatická extrakce binárky z ASAR do userData/bin/color-picker.exe
        try {
          const extractedDir = path.join(app.getPath('userData'), 'bin');
          if (!fs.existsSync(extractedDir)) {
            fs.mkdirSync(extractedDir, { recursive: true });
          }
          const extractedPath = path.join(extractedDir, 'color-picker.exe');
          const data = fs.readFileSync(c);
          fs.writeFileSync(extractedPath, data);
          console.log('[Main] Auto-extracted color-picker.exe from asar archive to:', extractedPath);
          return extractedPath;
        } catch (extractErr) {
          console.error('[Main] Failed to extract color-picker.exe from asar archive:', extractErr);
          diagnosticsService.recordCrash('Extrakce color-picker.exe z ASAR archivu', extractErr, { sourcePath: c });
        }
      } else {
        console.log('[Main] Found executable color-picker.exe at:', c);
        return c;
      }
    }
  }

  // Zkontrolovat, zda již dříve nebyla binárka extrahována do userData/bin/color-picker.exe
  try {
    const extractedPath = path.join(app.getPath('userData'), 'bin', 'color-picker.exe');
    if (fs.existsSync(extractedPath)) {
      return extractedPath;
    }
  } catch {}

  console.warn('[Main] color-picker.exe not found in candidates, falling back to:', candidates[0]);
  return candidates[0];
}

async function pickScreenColorNative(
  instant = false,
  options?: { noClipboard?: boolean; noSpotlight?: boolean }
): Promise<string | null> {
  const exePath = getColorPickerExePath();

  diagnosticsService.logAction({
    type: 'color-picker',
    title: 'Spuštění kapátka (ColorMaster)',
    details: `Cesta k exe: ${exePath}, režim: ${instant ? 'Okamžitý' : 'Lupa pod kurzorem'}${options?.noClipboard ? ' (bez schránky)' : ''}`,
    status: 'info',
  });

  if (!fs.existsSync(exePath)) {
    const notFoundErr = new Error(`Spustitelný soubor kapátka nebyl nalezen na cestě: ${exePath}`);
    console.error('[Main]', notFoundErr.message);
    diagnosticsService.recordCrash('Spuštění kapátka (soubor nenalezen)', notFoundErr, { exePath, instant });
    return null;
  }

  console.log('[Main] Launching color-picker.exe:', exePath, instant ? '--instant' : '(loupe mode)');

  // If Spotlight window is visible, hide it with animation so user can pick what is under it
  const mainWin = windowManager ? windowManager.getMainWindow() : null;
  const wasMainVisible = !options?.noSpotlight && mainWin && !mainWin.isDestroyed() && mainWin.isVisible();
  if (wasMainVisible && windowManager) {
    windowManager.hideSpotlight();
    await new Promise((r) => setTimeout(r, 100));
  }

  return new Promise((resolve) => {
    try {
      const targetWin = options?.noSpotlight
        ? (windowManager ? (windowManager.getPaletteBarWindow() || windowManager.getSettingsWindow()) : null)
        : (windowManager ? windowManager.getMainWindow() : null);

      const nativeHwnd = targetWin && !targetWin.isDestroyed() ? targetWin.getNativeWindowHandle() : null;
      let hwndString = '0';
      if (nativeHwnd && nativeHwnd.length >= 4) {
        try {
          hwndString = nativeHwnd.length >= 8 ? nativeHwnd.readBigInt64LE(0).toString() : nativeHwnd.readInt32LE(0).toString();
        } catch {
          hwndString = '0';
        }
      }

      const args = instant ? ['--instant'] : [];
      if (hwndString !== '0') {
        args.push('--parent-hwnd', hwndString);
      }
      args.push('--parent-pid', process.pid.toString());

      const child = spawn(exePath, args, {
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutData = '';
      let stderrData = '';
      child.stdout?.on('data', (data) => {
        stdoutData += data.toString();
      });
      child.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });

      const restoreWindows = () => {
        if (wasMainVisible && windowManager) {
          windowManager.showSpotlight();
          app.focus({ steal: true });
        } else {
          const palBarWin = windowManager ? windowManager.getPaletteBarWindow() : null;
          if (palBarWin && !palBarWin.isDestroyed() && palBarWin.isVisible()) {
            palBarWin.setAlwaysOnTop(true, 'screen-saver');
            app.focus({ steal: true });
            palBarWin.focus();
            palBarWin.webContents.focus();
            return;
          }
          const settingsWin = windowManager ? windowManager.getSettingsWindow() : null;
          if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
            app.focus({ steal: true });
            settingsWin.focus();
          }
        }
      };

      child.on('close', (code) => {
        if (stderrData.trim()) {
          console.warn('[Main] color-picker.exe stderr:', stderrData.trim());
        }
        const trimmed = stdoutData.trim();
        console.log('[Main] color-picker.exe closed with code:', code, 'stdout:', trimmed);
        const pickedColor =
          trimmed.startsWith('#') && (trimmed.length === 7 || trimmed.length === 9)
            ? trimmed.toUpperCase()
            : null;

        if (pickedColor) {
          const currentCfg = store ? store.getConfig() : null;
          const fmt = currentCfg?.donkeyTools?.colorMaster?.defaultFormat || 'hex';
          let formatted = pickedColor;
          const r = parseInt(pickedColor.slice(1, 3), 16);
          const g = parseInt(pickedColor.slice(3, 5), 16);
          const b = parseInt(pickedColor.slice(5, 7), 16);
          if (fmt === 'hex-no-hash') {
            formatted = pickedColor.replace('#', '');
          } else if (fmt === 'rgb') {
            formatted = `rgb(${r}, ${g}, ${b})`;
          } else if (fmt === 'rgba') {
            formatted = `rgba(${r}, ${g}, ${b}, 1)`;
          } else if (fmt === 'hsl') {
            const rN = r / 255, gN = g / 255, bN = b / 255;
            const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
            let h = 0, s = 0, l = (max + min) / 2;
            if (max !== min) {
              const d = max - min;
              s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
              switch (max) {
                case rN: h = (gN - bN) / d + (gN < bN ? 6 : 0); break;
                case gN: h = (bN - rN) / d + 2; break;
                case bN: h = (rN - gN) / d + 4; break;
              }
              h /= 6;
            }
            formatted = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
          }
          if (!options?.noClipboard) {
            clipboard.writeText(formatted);
            console.log(`[Main] Picked color ${formatted} copied to clipboard`);

            diagnosticsService.logAction({
              type: 'color-picker',
              title: `Nabrání barvy: ${pickedColor}`,
              details: `Zkopírováno do schránky jako ${formatted}`,
              status: 'success',
            });

            notificationService.show({
              type: 'colorMaster',
              title: 'ColorMaster – Barva zkopírována',
              body: `Odstín ${formatted} byl zkopírován do schránky.`,
            });
          } else {
            diagnosticsService.logAction({
              type: 'color-picker',
              title: `Výběr barvy v nastavení: ${pickedColor}`,
              details: `Odstín ${formatted} aplikován bez kopírování do schránky`,
              status: 'info',
            });
          }

          if (!options?.noSpotlight && windowManager) {
            windowManager.showSpotlight();
            const win = windowManager.getMainWindow();
            if (win && !win.isDestroyed()) {
              if (win.isMinimized()) {
                win.restore();
              }
              win.show();
              win.setAlwaysOnTop(true);
              app.focus({ steal: true });
              win.focus();
              win.webContents.focus();
              win.webContents.send('color-picked-global', { color: pickedColor, formatted });
            }
          } else {
            const palBarWin = windowManager ? windowManager.getPaletteBarWindow() : null;
            if (palBarWin && !palBarWin.isDestroyed() && palBarWin.isVisible()) {
              palBarWin.setAlwaysOnTop(true, 'screen-saver');
              app.focus({ steal: true });
              palBarWin.focus();
              palBarWin.webContents.focus();
            } else {
              const settingsWin = windowManager ? windowManager.getSettingsWindow() : null;
              if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
                app.focus({ steal: true });
                settingsWin.focus();
              }
            }
          }
        } else {
          // Cancelled (Esc or right-click) or failure
          if (code !== 0 && code !== 1) {
            const exitErr = new Error(`color-picker.exe byl neočekávaně ukončen s kódem ${code}: ${stderrData.trim() || stdoutData.trim() || 'Bez výstupu'}`);
            diagnosticsService.recordCrash('Chyba běhu kapátka (color-picker.exe exit)', exitErr, { code, stderr: stderrData, stdout: stdoutData, exePath });
          } else {
            diagnosticsService.logAction({
              type: 'color-picker',
              title: 'Kapátko zrušeno',
              details: 'Výběr barvy byl ukončen stiskem Escape nebo pravého tlačítka',
              status: 'info',
            });
          }

          if (wasMainVisible && windowManager) {
            windowManager.showSpotlight();
            const win = windowManager.getMainWindow();
            if (win && !win.isDestroyed()) {
              if (win.isMinimized()) {
                win.restore();
              }
              win.show();
              win.setAlwaysOnTop(true);
              app.focus({ steal: true });
              win.focus();
              win.webContents.focus();
            }
          } else {
            const palBarWin = windowManager ? windowManager.getPaletteBarWindow() : null;
            if (palBarWin && !palBarWin.isDestroyed() && palBarWin.isVisible()) {
              palBarWin.setAlwaysOnTop(true, 'screen-saver');
              app.focus({ steal: true });
              palBarWin.focus();
              palBarWin.webContents.focus();
            } else {
              const settingsWin = windowManager ? windowManager.getSettingsWindow() : null;
              if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
                app.focus({ steal: true });
                settingsWin.focus();
              }
            }
          }
        }

        resolve(pickedColor);
      });

      child.on('error', (err) => {
        if (wasMainVisible && windowManager) {
          windowManager.showSpotlight();
        }
        console.error('[Main] Failed to execute color-picker.exe:', err);
        diagnosticsService.recordCrash('Selhání spuštění procesu kapátka (child process error)', err, { exePath, instant });
        resolve(null);
      });
    } catch (err) {
      if (wasMainVisible && windowManager) {
        windowManager.showSpotlight();
      }
      console.error('[Main] Error launching screen color picker:', err);
      diagnosticsService.recordCrash('Výjimka při vyvolání kapátka', err, { exePath, instant });
      resolve(null);
    }
  });
}

let currentColorMasterHotkey = '';
function registerColorMasterHotkey(hotkey?: string) {
  try {
    if (currentColorMasterHotkey) {
      globalShortcut.unregister(currentColorMasterHotkey);
      currentColorMasterHotkey = '';
    }
    const config = store ? store.getConfig() : null;
    const isEnabled = Boolean(config?.extensions?.donkeyTools && config?.donkeyTools?.colorMaster?.enabled === true);
    if (!isEnabled || !hotkey || !hotkey.trim()) {
      return;
    }
    const cleanHotkey = hotkey.trim();
    const registered = globalShortcut.register(cleanHotkey, async () => {
      try {
        console.log('[Main] ColorMaster hotkey triggered, opening screen color picker...');
        diagnosticsService.logAction({
          type: 'shortcut',
          title: `Zkratka ColorMaster: ${cleanHotkey}`,
          details: 'Spuštění kapátka přes klávesovou zkratku',
          status: 'info',
        });
        await pickScreenColorNative();
      } catch (err) {
        console.error('[Main] Error in ColorMaster hotkey callback:', err);
        diagnosticsService.recordCrash('Volání kapátka z klávesové zkratky', err, { hotkey: cleanHotkey });
      }
    });
    if (!registered) {
      console.warn(`[Main] Failed to register ColorMaster shortcut: ${cleanHotkey}`);
    } else {
      currentColorMasterHotkey = cleanHotkey;
      console.log(`[Main] Successfully registered ColorMaster shortcut: ${cleanHotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering ColorMaster shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace zkratky ColorMaster', err, { hotkey });
  }
}

let currentQuickCapHotkey = '';
function registerQuickCapHotkey(hotkey?: string) {
  try {
    if (currentQuickCapHotkey) {
      globalShortcut.unregister(currentQuickCapHotkey);
      currentQuickCapHotkey = '';
    }
    const config = store ? store.getConfig() : null;
    const quickCapCfg = config?.donkeyTools?.quickCap || config?.donkeyTools?.fastSnap;
    const isEnabled = Boolean(config?.extensions?.donkeyTools && quickCapCfg?.enabled === true);
    const targetHotkey = hotkey || quickCapCfg?.hotkey;
    if (!isEnabled || !targetHotkey || !targetHotkey.trim()) {
      return;
    }
    const cleanHotkey = targetHotkey.trim();
    const registered = globalShortcut.register(cleanHotkey, async () => {
      try {
        console.log('[Main] QuickCap hotkey triggered');
        diagnosticsService.logAction({
          type: 'shortcut',
          title: `Zkratka QuickCap: ${cleanHotkey}`,
          details: 'Spuštění výstřižku přes klávesovou zkratku',
          status: 'info',
        });
        await startQuickCapProcess();
      } catch (err) {
        console.error('[Main] Error in QuickCap hotkey callback:', err);
        diagnosticsService.recordCrash('Volání QuickCap z klávesové zkratky', err, { hotkey: cleanHotkey });
      }
    });
    if (!registered) {
      console.warn(`[Main] Failed to register QuickCap shortcut: ${cleanHotkey}`);
    } else {
      currentQuickCapHotkey = cleanHotkey;
      console.log(`[Main] Successfully registered QuickCap shortcut: ${cleanHotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering QuickCap shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace zkratky QuickCap', err, { hotkey });
  }
}
function registerFastSnapHotkey(hotkey?: string) {
  registerQuickCapHotkey(hotkey);
}

let currentScreenRulerHotkey = '';
function registerScreenRulerHotkey(hotkey?: string) {
  try {
    if (currentScreenRulerHotkey) {
      globalShortcut.unregister(currentScreenRulerHotkey);
      currentScreenRulerHotkey = '';
    }
    const config = store ? store.getConfig() : null;
    const rulerCfg = config?.donkeyTools?.screenRuler;
    const isEnabled = Boolean(config?.extensions?.donkeyTools && rulerCfg?.enabled === true);
    const targetHotkey = hotkey || rulerCfg?.hotkey;
    if (!isEnabled || !targetHotkey || !targetHotkey.trim()) {
      return;
    }
    const cleanHotkey = targetHotkey.trim();
    const registered = globalShortcut.register(cleanHotkey, async () => {
      try {
        console.log('[Main] ScreenRuler hotkey triggered');
        diagnosticsService.logAction({
          type: 'shortcut',
          title: `Zkratka ScreenRuler: ${cleanHotkey}`,
          details: 'Spuštění měřítka a pravítka přes klávesovou zkratku',
          status: 'info',
        });
        await startScreenRulerProcess();
      } catch (err) {
        console.error('[Main] Error in ScreenRuler hotkey callback:', err);
        diagnosticsService.recordCrash('Volání ScreenRuler z klávesové zkratky', err, { hotkey: cleanHotkey });
      }
    });
    if (!registered) {
      console.warn(`[Main] Failed to register ScreenRuler shortcut: ${cleanHotkey}`);
    } else {
      currentScreenRulerHotkey = cleanHotkey;
      console.log(`[Main] Successfully registered ScreenRuler shortcut: ${cleanHotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering ScreenRuler shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace zkratky ScreenRuler', err, { hotkey });
  }
}

let currentEasyClipHotkey = '';
function registerEasyClipHotkey(hotkey?: string) {
  try {
    if (currentEasyClipHotkey) {
      globalShortcut.unregister(currentEasyClipHotkey);
      currentEasyClipHotkey = '';
    }
    const config = store ? store.getConfig() : null;
    const isEnabled = Boolean(config?.extensions?.donkeyTools && config?.donkeyTools?.easyClip?.enabled === true);
    const targetHotkey = hotkey || config?.donkeyTools?.easyClip?.hotkey;
    if (!isEnabled || !targetHotkey || !targetHotkey.trim()) {
      return;
    }
    const cleanHotkey = targetHotkey.trim();
    const registered = globalShortcut.register(cleanHotkey, async () => {
      try {
        console.log('[Main] EasyClip hotkey triggered');
        diagnosticsService.logAction({
          type: 'shortcut',
          title: `Zkratka EasyClip: ${cleanHotkey}`,
          details: 'Spuštění historie schránky přes klávesovou zkratku',
          status: 'info',
        });
        windowManager.showSpotlightWithMode('easyclip');
      } catch (err) {
        console.error('[Main] Error in EasyClip hotkey callback:', err);
        diagnosticsService.recordCrash('Volání EasyClip z klávesové zkratky', err, { hotkey: cleanHotkey });
      }
    });
    if (!registered) {
      console.warn(`[Main] Failed to register EasyClip shortcut: ${cleanHotkey}`);
    } else {
      currentEasyClipHotkey = cleanHotkey;
      console.log(`[Main] Successfully registered EasyClip shortcut: ${cleanHotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering EasyClip shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace zkratky EasyClip', err, { hotkey });
  }
}

let currentPaletteMasterHotkey: string | null = null;

function registerPaletteMasterHotkey(hotkey?: string) {
  if (currentPaletteMasterHotkey) {
    try {
      globalShortcut.unregister(currentPaletteMasterHotkey);
      currentPaletteMasterHotkey = null;
    } catch {}
  }
  const config = store?.getConfig();
  const isEnabled = Boolean(config?.extensions?.donkeyTools && config?.donkeyTools?.colorMaster?.enabled === true);
  if (!isEnabled) return;
  const targetHotkey = hotkey !== undefined ? hotkey : config?.donkeyTools?.colorMaster?.paletteHotkey;
  if (!targetHotkey || !targetHotkey.trim()) return;
  const cleanHotkey = targetHotkey.trim();

  try {
    const registered = globalShortcut.register(cleanHotkey, async () => {
      try {
        diagnosticsService.logAction({
          type: 'shortcut',
          title: `Zkratka PaletteMaster: ${cleanHotkey}`,
          details: 'Spuštění správce palet přes klávesovou zkratku',
          status: 'info',
        });
        windowManager.showSpotlightWithMode('palette');
      } catch (err) {
        console.error('[Main] Error in PaletteMaster hotkey callback:', err);
        diagnosticsService.recordCrash('Volání PaletteMaster z klávesové zkratky', err, { hotkey: cleanHotkey });
      }
    });

    if (!registered) {
      console.warn(`[Main] Failed to register PaletteMaster shortcut: ${cleanHotkey}`);
    } else {
      currentPaletteMasterHotkey = cleanHotkey;
      console.log(`[Main] Successfully registered PaletteMaster shortcut: ${cleanHotkey}`);
    }
  } catch (err) {
    console.error(`[Main] Error registering PaletteMaster shortcut ${hotkey}:`, err);
    diagnosticsService.recordCrash('Registrace zkratky PaletteMaster', err, { hotkey });
  }
}

let currentCapturedScreenImage: Electron.NativeImage | null = null;
let currentCapturedBounds: { x: number; y: number; width: number; height: number; scaleFactor: number } | null = null;
let currentQuickCapInitData: { screenshotUrl: string; width: number; height: number; scaleFactor: number } | null = null;
const currentFastSnapInitData = currentQuickCapInitData;

async function writeNativeImageToClipboard(nativeImg: Electron.NativeImage): Promise<void> {
  // 1. Zkusíme staré Electron API pokud existuje
  if (typeof (clipboard as any).writeImage === 'function') {
    (clipboard as any).writeImage(nativeImg);
    return;
  }
  // 2. Electron 44+ W3C ClipboardItem API
  try {
    const pngBuffer = nativeImg.toPNG();
    const ItemClass = typeof ClipboardItem !== 'undefined' ? ClipboardItem : (globalThis as any).ClipboardItem;
    if (ItemClass && typeof clipboard.write === 'function') {
      const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
      const item = new ItemClass({ 'image/png': blob });
      await clipboard.write([item]);
      return;
    }
  } catch (err) {
    console.warn('[Main] ClipboardItem write failed, trying fallback:', err);
  }
  // 3. Fallback přes clipboard.write({ image: nativeImg })
  if (typeof (clipboard as any).write === 'function') {
    try {
      await (clipboard as any).write({ image: nativeImg });
      return;
    } catch (err) {
      console.error('[Main] clipboard.write fallback failed:', err);
    }
  }
}

function getQuickCapSaveDirectory(): string {
  const config = store ? store.getConfig() : null;
  const configured = config?.donkeyTools?.quickCap?.saveDirectory || config?.donkeyTools?.fastSnap?.saveDirectory;
  if (configured && configured.trim()) {
    return configured.trim();
  }
  return path.join(app.getPath('pictures'), 'IADonkey Screenshots');
}
const getFastSnapSaveDirectory = getQuickCapSaveDirectory;

async function startQuickCapProcess(): Promise<void> {
  try {
    diagnosticsService.logAction({
      type: 'action',
      title: 'Spuštění QuickCap (Výstřižek obrazovky)',
      details: 'Příprava snímku a otevření výběrového okna',
      status: 'info',
    });

    if (windowManager) {
      windowManager.setSkipSpotlightRestoreOnCloneClose(true);
      windowManager.hideImmediately();
      windowManager.closeScreenRulerWindow();
      windowManager.getMainWindow()?.webContents.send('reset-spotlight');
    }
    const settingsWin = windowManager ? windowManager.getSettingsWindow() : null;
    if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
      settingsWin.hide();
    }

    // Krátká prodleva pro překreslení DWM bez oken aplikace
    await new Promise((r) => setTimeout(r, 50));

    const cursorPoint = screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
    const { bounds, scaleFactor } = targetDisplay;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(bounds.width * scaleFactor),
        height: Math.round(bounds.height * scaleFactor),
      },
    });

    let selectedSource = sources.find((s) => s.display_id === targetDisplay.id.toString());
    if (!selectedSource && sources.length > 0) {
      selectedSource = sources[0];
    }

    if (!selectedSource) {
      throw new Error('Nepodařilo se zachytit obrazovku (žádný zdroj screen).');
    }

    currentCapturedScreenImage = selectedSource.thumbnail;
    currentCapturedBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      scaleFactor,
    };

    const dataUrl = currentCapturedScreenImage.toDataURL();
    currentQuickCapInitData = {
      screenshotUrl: dataUrl,
      width: bounds.width,
      height: bounds.height,
      scaleFactor,
    };

    windowManager.createSnipperWindow(bounds, dataUrl, scaleFactor);
  } catch (err: any) {
    console.error('[Main] startQuickCapProcess error:', err);
    diagnosticsService.recordCrash('Spuštění QuickCap', err);
    diagnosticsService.logAction({
      type: 'error',
      title: 'Chyba při spuštění QuickCap',
      details: err?.message || String(err),
      status: 'error',
    });
  }
}
const startFastSnapProcess = startQuickCapProcess;

let currentScreenRulerInitData: { width: number; height: number; color: string; defaultUnit: string } | null = null;

async function startScreenRulerProcess(): Promise<void> {
  try {
    diagnosticsService.logAction({
      type: 'action',
      title: 'Spuštění ScreenRuler (Měřítko a pravítko)',
      details: 'Otevření transparentního overlay okna pro měření',
      status: 'info',
    });

    if (windowManager) {
      windowManager.setSkipSpotlightRestoreOnCloneClose(true);
      windowManager.hideImmediately();
      windowManager.closeSnipperWindow();
      windowManager.getMainWindow()?.webContents.send('reset-spotlight');
    }
    const settingsWin = windowManager ? windowManager.getSettingsWindow() : null;
    if (settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()) {
      settingsWin.hide();
    }

    // Krátká prodleva pro překreslení DWM bez oken aplikace
    await new Promise((r) => setTimeout(r, 40));

    const cursorPoint = screen.getCursorScreenPoint();
    const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
    const { bounds } = targetDisplay;

    const config = store ? store.getConfig() : null;
    const rulerCfg = config?.donkeyTools?.screenRuler;
    const color = rulerCfg?.color || '#f43f5e';
    const defaultUnit = rulerCfg?.defaultUnit || 'px';

    currentScreenRulerInitData = {
      width: bounds.width,
      height: bounds.height,
      color,
      defaultUnit,
    };

    windowManager.openScreenRulerWindow(bounds, { color, defaultUnit });
  } catch (err: any) {
    console.error('[Main] startScreenRulerProcess error:', err);
    diagnosticsService.recordCrash('Spuštění ScreenRuler', err);
    diagnosticsService.logAction({
      type: 'error',
      title: 'Chyba při spuštění ScreenRuler',
      details: err?.message || String(err),
      status: 'error',
    });
  }
}


function setupIpcHandlers() {
  ipcMain.handle('pick-screen-color', async (_event, options?: { noClipboard?: boolean; noSpotlight?: boolean }) => {
    try {
      return await pickScreenColorNative(false, options);
    } catch (err) {
      console.error('[Main] Error handling pick-screen-color IPC:', err);
      return null;
    }
  });

  // Diagnostics & Action Log IPC
  ipcMain.handle('get-action-logs', () => {
    return diagnosticsService.getActionLogs();
  });

  ipcMain.handle('clear-action-logs', () => {
    diagnosticsService.clearActionLogs();
  });

  ipcMain.handle('get-crash-logs', () => {
    return diagnosticsService.getCrashLogs();
  });

  ipcMain.handle('open-crash-log-folder', async () => {
    await diagnosticsService.openCrashLogFolder();
  });

  ipcMain.handle('clear-crash-logs', () => {
    diagnosticsService.clearCrashLogs();
  });

  ipcMain.handle('log-action', (_event, entry: Omit<ActionLogEntry, 'id' | 'timestamp'> & { timestamp?: string }) => {
    diagnosticsService.logAction(entry);
  });

  ipcMain.handle('export-crash-report', async (_event, fileName: string) => {
    return await diagnosticsService.exportCrashReport(fileName);
  });

  ipcMain.handle('record-crash', (_event, action: string, error: any, context?: any) => {
    return diagnosticsService.recordCrash(action, error, context);
  });

  ipcMain.handle('simulate-test-crash', () => {
    return diagnosticsService.recordCrash(
      'Simulovaný pád z vývojářského režimu (Test exception)',
      new Error('Testovací chyba vyvolaná vývojářem pro ověření generování a struktury crashlogu.'),
      { trigger: 'developer_tab_manual_test', environment: process.env.NODE_ENV || 'production' }
    );
  });

  ipcMain.handle('open-dev-tools', () => {
    const win = windowManager.getMainWindow();
    if (win) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  let currentTuneColorSource: 'spotlight' | 'palette' | 'dev' = 'spotlight';
  let currentTuneColorSlot: number | undefined = undefined;

  ipcMain.handle('open-tune-color-window', (_event, params: { initialColor: string; source?: 'spotlight' | 'palette' | 'dev'; slotIndex?: number }) => {
    currentTuneColorSource = params.source || 'spotlight';
    currentTuneColorSlot = params.slotIndex;
    windowManager.openTuneColorWindow(params);
  });

  ipcMain.handle('save-tune-color', (_event, color: string) => {
    if (currentTuneColorSource === 'palette') {
      const barWin = windowManager.getPaletteBarWindow();
      if (barWin && !barWin.isDestroyed()) {
        barWin.webContents.send('tune-color-applied', { color, slotIndex: currentTuneColorSlot });
      }
      const detailWin = windowManager.getPaletteDetailWindow();
      if (detailWin && !detailWin.isDestroyed()) {
        detailWin.webContents.send('tune-color-applied', { color, slotIndex: currentTuneColorSlot });
      }
      windowManager.closeTuneColorWindow();
      return;
    }

    const win = windowManager.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('tune-color-applied', { color });
    }
    const barWin = windowManager.getPaletteBarWindow();
    if (barWin && !barWin.isDestroyed()) {
      barWin.webContents.send('tune-color-applied', { color, slotIndex: currentTuneColorSlot });
    }
    const detailWin = windowManager.getPaletteDetailWindow();
    if (detailWin && !detailWin.isDestroyed()) {
      detailWin.webContents.send('tune-color-applied', { color, slotIndex: currentTuneColorSlot });
    }
    windowManager.closeTuneColorWindow();
    windowManager.showSpotlight();
  });

  ipcMain.handle('close-tune-color-window', () => {
    windowManager.closeTuneColorWindow();
    if (currentTuneColorSource === 'spotlight') {
      windowManager.resetAndHideSpotlight();
    }
  });

  // PaletteMaster IPC Handlers
  ipcMain.handle('get-palettes', () => {
    return store.getConfig().colorPalettes || [];
  });

  ipcMain.handle('save-palette', (_event, palette: any) => {
    const cfg = store.getConfig();
    const existing = cfg.colorPalettes || [];
    const idx = existing.findIndex((p: any) => p.id === palette.id);
    let updated: any[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = { ...palette, updatedAt: Date.now() };
    } else {
      updated = [
        ...existing,
        {
          ...palette,
          createdAt: palette.createdAt || Date.now(),
          updatedAt: Date.now(),
        },
      ];
    }
    const newConfig = { ...cfg, colorPalettes: updated };
    store.saveConfig(newConfig);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('palettes-updated', updated);
      }
    });
    return updated;
  });

  ipcMain.handle('delete-palette', (_event, paletteId: string) => {
    const cfg = store.getConfig();
    const existing = cfg.colorPalettes || [];
    const updated = existing.filter((p: any) => p.id !== paletteId);
    const newConfig = { ...cfg, colorPalettes: updated };
    store.saveConfig(newConfig);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('palettes-updated', updated);
      }
    });
    return updated;
  });

  ipcMain.handle('open-palette-bar', (_event, params: { paletteId: string; paletteName: string }) => {
    windowManager.hideSpotlight();
    windowManager.openPaletteBarWindow(params.paletteId, params.paletteName);
  });

  ipcMain.handle('close-palette-bar', () => {
    windowManager.closePaletteBarWindow();
  });

  ipcMain.handle('open-palette-detail', (_event, params: { paletteId: string }) => {
    windowManager.closePaletteBarWindow();
    windowManager.openPaletteDetailWindow(params.paletteId);
  });

  ipcMain.handle('close-palette-detail', () => {
    windowManager.closePaletteDetailWindow();
  });

  // QuickCap (dříve FastSnap) IPC Handlers
  const handleQuickCapStart = async () => {
    await startQuickCapProcess();
  };
  ipcMain.handle('quickcap-start', handleQuickCapStart);
  ipcMain.handle('fastsnap-start', handleQuickCapStart);

  const handleQuickCapGetInitData = () => {
    return currentQuickCapInitData;
  };
  ipcMain.handle('quickcap-get-init-data', handleQuickCapGetInitData);
  ipcMain.handle('fastsnap-get-init-data', handleQuickCapGetInitData);

  const handleQuickCapCancel = () => {
    windowManager.closeSnipperWindow();
    currentCapturedScreenImage = null;
    currentCapturedBounds = null;
    currentQuickCapInitData = null;
  };
  ipcMain.handle('quickcap-cancel', handleQuickCapCancel);
  ipcMain.handle('fastsnap-cancel', handleQuickCapCancel);

  const handleQuickCapFinishCrop = async (_event: any, cropArea: { x: number; y: number; width: number; height: number; windowWidth?: number; windowHeight?: number }) => {
    try {
      windowManager.closeSnipperWindow();

      if (!currentCapturedScreenImage) {
        throw new Error('Snímek obrazovky není k dispozici pro ořez.');
      }

      const imgSize = currentCapturedScreenImage.getSize();
      const winW = cropArea.windowWidth || currentCapturedBounds?.width || imgSize.width;
      const winH = cropArea.windowHeight || currentCapturedBounds?.height || imgSize.height;

      const scaleX = imgSize.width / winW;
      const scaleY = imgSize.height / winH;

      const cropRect = {
        x: Math.max(0, Math.min(imgSize.width - 1, Math.round(cropArea.x * scaleX))),
        y: Math.max(0, Math.min(imgSize.height - 1, Math.round(cropArea.y * scaleY))),
        width: Math.max(1, Math.min(imgSize.width - Math.round(cropArea.x * scaleX), Math.round(cropArea.width * scaleX))),
        height: Math.max(1, Math.min(imgSize.height - Math.round(cropArea.y * scaleY), Math.round(cropArea.height * scaleY))),
      };

      const croppedImage = currentCapturedScreenImage.crop(cropRect);
      currentCapturedScreenImage = null;
      currentCapturedBounds = null;
      currentQuickCapInitData = null;

      // 1. Zkopírovat do schránky
      await writeNativeImageToClipboard(croppedImage);

      // 2. Uložit do cílové složky
      const saveDir = getQuickCapSaveDirectory();
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      let fileName = `QuickCap_${timeStr}.png`;
      let filePath = path.join(saveDir, fileName);

      let counter = 1;
      while (fs.existsSync(filePath)) {
        fileName = `QuickCap_${timeStr}_${counter}.png`;
        filePath = path.join(saveDir, fileName);
        counter++;
      }

      fs.writeFileSync(filePath, croppedImage.toPNG());
      const dataUrl = croppedImage.toDataURL();

      diagnosticsService.logAction({
        type: 'action',
        title: `QuickCap výstřižek uložen: ${fileName}`,
        details: `Rozměry: ${cropArea.width}×${cropArea.height} px (fyzicky ${cropRect.width}×${cropRect.height} px), zkopírováno do schránky a uloženo do: ${filePath}`,
        status: 'success',
      });

      notificationService.show({
        type: 'quickCap',
        title: 'QuickCap – Výstřižek uložen',
        body: `Snímek ${fileName} byl zkopírován do schránky. Kliknutím otevřete ve složce.`,
        onClick: () => {
          shell.showItemInFolder(filePath);
        },
      });

      if (windowManager) {
        windowManager.showSpotlight();
        const win = windowManager.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('quickcap-captured-global', {
            filePath,
            fileName,
            dataUrl,
            width: cropRect.width,
            height: cropRect.height,
          });
        }
      }

      return { success: true, filePath };
    } catch (err: any) {
      console.error('[Main] quickcap-finish-crop error:', err);
      diagnosticsService.recordCrash('Uložení výstřižku QuickCap', err, { cropArea });
      diagnosticsService.logAction({
        type: 'error',
        title: 'Chyba při ukládání výstřižku QuickCap',
        details: err?.message || String(err),
        status: 'error',
      });
      return { success: false, error: err?.message || String(err) };
    }
  };
  ipcMain.handle('quickcap-finish-crop', handleQuickCapFinishCrop);
  ipcMain.handle('fastsnap-finish-crop', handleQuickCapFinishCrop);

  const handleQuickCapGetRecent = async () => {
    try {
      const saveDir = getQuickCapSaveDirectory();
      if (!fs.existsSync(saveDir)) {
        return [];
      }
      const files = fs.readdirSync(saveDir);
      const imageFiles: Array<{ name: string; path: string; createdAt: number; size: number }> = [];

      for (const file of files) {
        if (/\.(png|jpg|jpeg|webp)$/i.test(file)) {
          const fullPath = path.join(saveDir, file);
          try {
            const stat = fs.statSync(fullPath);
            imageFiles.push({
              name: file,
              path: fullPath,
              createdAt: stat.mtimeMs,
              size: stat.size,
            });
          } catch {}
        }
      }

      imageFiles.sort((a, b) => b.createdAt - a.createdAt);
      const recent10 = imageFiles.slice(0, 10);

      const itemsWithThumbnails = recent10.map((item) => {
        try {
          const img = nativeImage.createFromPath(item.path);
          const size = img.getSize();
          const thumb = img.resize({ height: 120 });
          return {
            ...item,
            width: size.width,
            height: size.height,
            dataUrl: thumb.toDataURL(),
          };
        } catch {
          return item;
        }
      });

      return itemsWithThumbnails;
    } catch (err) {
      console.error('[Main] quickcap-get-recent error:', err);
      return [];
    }
  };
  ipcMain.handle('quickcap-get-recent', handleQuickCapGetRecent);
  ipcMain.handle('fastsnap-get-recent', handleQuickCapGetRecent);

  const handleQuickCapCopyToClipboard = async (_event: any, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Soubor neexistuje' };
      }
      const img = nativeImage.createFromPath(filePath);
      await writeNativeImageToClipboard(img);
      const baseName = path.basename(filePath);
      diagnosticsService.logAction({
        type: 'action',
        title: 'Výstřižek zkopírován do schránky',
        details: baseName,
        status: 'success',
      });
      notificationService.show({
        type: 'clipboard',
        title: 'Zkopírováno do schránky',
        body: `Snímek "${baseName}" byl úspěšně zkopírován do schránky.`,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  };
  ipcMain.handle('quickcap-copy-to-clipboard', handleQuickCapCopyToClipboard);
  ipcMain.handle('fastsnap-copy-to-clipboard', handleQuickCapCopyToClipboard);

  const handleQuickCapDelete = async (_event: any, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        diagnosticsService.logAction({
          type: 'action',
          title: 'Výstřižek smazán',
          details: path.basename(filePath),
          status: 'info',
        });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  };
  ipcMain.handle('quickcap-delete', handleQuickCapDelete);
  ipcMain.handle('fastsnap-delete', handleQuickCapDelete);

  const handleQuickCapShowInFolder = (_event: any, filePath: string) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      const dir = getQuickCapSaveDirectory();
      if (fs.existsSync(dir)) {
        shell.openPath(dir);
      }
    }
  };
  ipcMain.handle('quickcap-show-in-folder', handleQuickCapShowInFolder);
  ipcMain.handle('fastsnap-show-in-folder', handleQuickCapShowInFolder);

  const handleQuickCapChooseFolder = async () => {
    const res = await dialog.showOpenDialog({
      title: 'Vyberte složku pro ukládání výstřižků QuickCap',
      defaultPath: getQuickCapSaveDirectory(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  };
  ipcMain.handle('quickcap-choose-folder', handleQuickCapChooseFolder);
  ipcMain.handle('fastsnap-choose-folder', handleQuickCapChooseFolder);

  // ScreenRuler IPC Handlers
  ipcMain.handle('screenruler-start', async () => {
    await startScreenRulerProcess();
  });

  ipcMain.handle('screenruler-get-init-data', () => {
    return currentScreenRulerInitData;
  });

  ipcMain.handle('screenruler-close', () => {
    windowManager.closeScreenRulerWindow();
    currentScreenRulerInitData = null;
  });

  ipcMain.handle('screenruler-copy', (_event, text: string) => {
    clipboard.writeText(text);
    diagnosticsService.logAction({
      type: 'action',
      title: 'ScreenRuler – Rozměry zkopírovány',
      details: text,
      status: 'success',
    });
    notificationService.show({
      type: 'clipboard',
      title: 'Zkopírováno do schránky',
      body: `Rozměry "${text}" byly úspěšně zkopírovány do schránky.`,
    });
  });

  ipcMain.handle('copy-to-clipboard', (_event, text: string, options?: { title?: string; body?: string }) => {
    clipboard.writeText(text);
    const title = options?.title || 'Zkopírováno do schránky';
    diagnosticsService.logAction({
      type: 'action',
      title,
      details: text,
      status: 'success',
    });
    const truncated = text.length > 80 ? `${text.slice(0, 80)}...` : text;
    const body = options?.body || `Hodnota "${truncated}" byla zkopírována do schránky.`;
    notificationService.show({
      type: 'clipboard',
      title,
      body,
    });
    return true;
  });

  // EasyClip IPC Handlers
  ipcMain.handle('easyclip-get-items', () => {
    return easyClipService.getItems();
  });

  ipcMain.handle('easyclip-copy-item', async (_event, id: string, paste: boolean = true) => {
    const success = await easyClipService.copyItem(id);
    if (success) {
      windowManager.hideImmediately();
      if (paste) {
        const hwnd = windowManager.getMainWindowHandle();
        pasteService.simulatePaste(80, hwnd);
      }
    }
    return success;
  });

  ipcMain.handle('easyclip-copy-multiple', async (_event, ids: string[], paste: boolean = true) => {
    const success = await easyClipService.copyMultipleItems(ids);
    if (success) {
      windowManager.hideImmediately();
      if (paste) {
        const hwnd = windowManager.getMainWindowHandle();
        pasteService.simulatePaste(80, hwnd);
      }
    }
    return success;
  });

  ipcMain.handle('easyclip-delete-item', (_event, id: string) => {
    return easyClipService.deleteItem(id);
  });

  ipcMain.handle('easyclip-delete-multiple', (_event, ids: string[]) => {
    return easyClipService.deleteMultipleItems(ids);
  });

  ipcMain.handle('easyclip-clear-history', () => {
    easyClipService.clearHistory();
    return true;
  });

  ipcMain.handle('easyclip-open', () => {
    windowManager.showSpotlightWithMode('easyclip');
  });

  // MagicPlan IPC Handlers
  ipcMain.handle('magicplan-get-data', async () => {
    return magicPlanService?.getCachedData() || (await magicPlanService?.fetchAndDiff());
  });

  ipcMain.handle('magicplan-refresh', async () => {
    return await magicPlanService?.manualRefresh();
  });

  ipcMain.handle('magicplan-get-dev-logs', async () => {
    return magicPlanService?.getDevLogs();
  });

  ipcMain.handle('magicplan-clear-data', () => {
    magicPlanService?.clearData();
    return true;
  });

  ipcMain.handle('open-magicplan-window', async () => {
    await windowManager.openMagicPlanWindow();
    return true;
  });

  ipcMain.handle('close-magicplan-window', () => {
    windowManager.closeMagicPlanWindow();
  });

  ipcMain.handle('open-feedback-window', async (_event, mode?: 'user' | 'dev') => {
    const config = store.getConfig();
    const effectiveMode = mode === 'dev' && !config.developMode ? 'user' : (mode || 'user');
    await windowManager.openFeedbackWindow(effectiveMode);
    return true;
  });

  ipcMain.handle('close-feedback-window', () => {
    windowManager.closeFeedbackWindow();
  });

  ipcMain.handle('feedback-list', async (_event, folderPath?: string) => {
    const config = store.getConfig();
    const targetFolder = folderPath || config.feedback?.sharedFolder;
    return await feedbackService.listFeedbacks(targetFolder);
  });

  ipcMain.handle('feedback-create', async (_event, params: { folderPath?: string; data: any; screenshotBase64?: string }) => {
    const config = store.getConfig();
    const targetFolder = params?.folderPath || config.feedback?.sharedFolder || feedbackService.getDefaultFolderPath();
    const res = await feedbackService.createFeedback(targetFolder, params.data, params.screenshotBase64);
    if (res.success && res.item) {
      feedbackNotificationService.onFeedbackCreated(res.item);
    }
    return res;
  });

  ipcMain.handle('feedback-update', async (_event, params: { folderPath?: string; item: any; screenshotBase64?: string }) => {
    const config = store.getConfig();
    const targetFolder = params?.folderPath || config.feedback?.sharedFolder || feedbackService.getDefaultFolderPath();
    const res = await feedbackService.updateFeedback(targetFolder, params.item, params.screenshotBase64);
    if (res.success && res.item) {
      feedbackNotificationService.onFeedbackUpdated(res.item);
    }
    return res;
  });

  ipcMain.handle('feedback-delete', async (_event, params: { folderPath?: string; feedbackId: string }) => {
    const config = store.getConfig();
    const targetFolder = params?.folderPath || config.feedback?.sharedFolder || feedbackService.getDefaultFolderPath();
    const res = await feedbackService.deleteFeedback(targetFolder, params.feedbackId);
    if (res.success) {
      feedbackNotificationService.onFeedbackDeleted(params.feedbackId);
    }
    return res;
  });

  ipcMain.handle('feedback-get-screenshot', async (_event, params: { folderPath?: string; filename: string }) => {
    const config = store.getConfig();
    const targetFolder = params?.folderPath || config.feedback?.sharedFolder || feedbackService.getDefaultFolderPath();
    return await feedbackService.getScreenshot(targetFolder, params.filename);
  });

  ipcMain.handle('feedback-get-next-version', (_event, currentVer?: string) => {
    return feedbackService.getNextVersion(currentVer);
  });

  ipcMain.handle('feedback-select-folder', async () => {
    const win = windowManager.getFeedbackWindow() || windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const res = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte složku pro sdílenou zpětnou vazbu',
      defaultPath: feedbackService.getDefaultFolderPath(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('feedback-get-clipboard-image', () => {
    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      return img.toDataURL();
    }
    return null;
  });

  ipcMain.handle('get-config', () => {
    return store.getConfig();
  });

  ipcMain.handle('save-config', (_event, newConfig: AppConfig) => {
    const oldConfig = store.getConfig();
    store.saveConfig(newConfig);

    // If hotkey was changed, re-register
    if (newConfig.hotkey && newConfig.hotkey !== oldConfig.hotkey) {
      registerGlobalHotkey(newConfig.hotkey);
    }

    registerColorMasterHotkey(newConfig.donkeyTools?.colorMaster?.hotkey);
    registerPaletteMasterHotkey(newConfig.donkeyTools?.colorMaster?.paletteHotkey);
    registerQuickCapHotkey(newConfig.donkeyTools?.quickCap?.hotkey || newConfig.donkeyTools?.fastSnap?.hotkey);
    registerScreenRulerHotkey(newConfig.donkeyTools?.screenRuler?.hotkey);
    registerEasyClipHotkey(newConfig.donkeyTools?.easyClip?.hotkey);
    easyClipService.updateConfig(newConfig);

    const magicPlanConfigChanged =
      newConfig.magicplan?.userColumn !== oldConfig.magicplan?.userColumn ||
      JSON.stringify(newConfig.magicplan?.userColumns || []) !== JSON.stringify(oldConfig.magicplan?.userColumns || []) ||
      JSON.stringify(newConfig.magicplan?.urls || []) !== JSON.stringify(oldConfig.magicplan?.urls || []) ||
      newConfig.magicplan?.url !== oldConfig.magicplan?.url;

    if (magicPlanConfigChanged) {
      magicPlanService?.onUserColumnChanged(
        newConfig.magicplan?.userColumn,
        newConfig.magicplan?.userColumns,
        newConfig.magicplan?.urls
      );
    } else {
      magicPlanService?.restart();
    }

    // Update tray context menu to reflect enabled/disabled DonkeyTools
    windowManager?.updateTrayContextMenu(currentHotkey);

    // If searchInstalledApps setting changed, refresh items in UI
    if (newConfig.searchInstalledApps !== oldConfig.searchInstalledApps) {
      const allItems = getCombinedItems();
      windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
      windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);
    }

    // If MagicGate or GitHub settings/extensions changed, trigger sync to update launcher items
    const magicgateChanged =
      newConfig.magicgate?.xmlPath !== oldConfig.magicgate?.xmlPath ||
      newConfig.extensions?.magicgate !== oldConfig.extensions?.magicgate;
    const oldGhToken = getActiveGitHubToken(oldConfig.github);
    const newGhToken = getActiveGitHubToken(newConfig.github);
    const githubChanged =
      newConfig.extensions?.github !== oldConfig.extensions?.github ||
      newConfig.github?.authMode !== oldConfig.github?.authMode ||
      newGhToken !== oldGhToken ||
      newConfig.github?.username !== oldConfig.github?.username ||
      newConfig.github?.org !== oldConfig.github?.org ||
      newConfig.github?.apiUrl !== oldConfig.github?.apiUrl;

    if (magicgateChanged || githubChanged) {
      syncManager.syncAll().then(() => {
        const allItems = getCombinedItems();
        windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
        windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);
      });
    }

    if (newConfig.feedback?.sharedFolder !== oldConfig.feedback?.sharedFolder) {
      feedbackNotificationService.restart();
    }

    // Update notifications service config
    notificationService.updateConfig(newConfig);

    try {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && !win.webContents?.isDestroyed()) {
          win.webContents.send('config-updated', newConfig);
        }
      });
    } catch (err) {
      console.error('Failed to broadcast config-updated:', err);
    }

    return true;
  });

  ipcMain.handle(
    'send-test-notification',
    (
      _event,
      payload?:
        | string
        | {
            type?: string;
            subType?: string;
            feedbackType?: 'bug' | 'idea' | 'other' | 'resolved';
            title?: string;
            body?: string;
            mpSituation?: number;
            isCritical?: boolean;
            taskType?: 'dev' | 'service';
          }
    ) => {
      if (typeof payload === 'object' && payload !== null) {
        const type = (payload.type as any) || 'test';
        const subType = payload.subType as any;
        const feedbackType = (payload as any).feedbackType;
        const title = payload.title || 'Testovací notifikace';
        const body = payload.body || 'Systémové notifikace fungují správně!';
        const mpSituation = payload.mpSituation;
        const isCritical = payload.isCritical;
        const taskType = payload.taskType as any;
        return notificationService.show({
          type,
          subType,
          feedbackType,
          title,
          body,
          isTest: true,
          mpSituation,
          isCritical,
          taskType,
          onClick: () => {
            if (type === 'error') {
              diagnosticsService.openCrashLogFolder();
            } else if (type === 'magicPlan') {
              windowManager.openMagicPlanWindow();
            } else if (type === 'feedback') {
              const currentCfg = store.getConfig();
              const effectiveMode = subType === 'dev' && currentCfg.developMode ? 'dev' : 'user';
              windowManager.openFeedbackWindow(effectiveMode);
            } else {
              windowManager.showSpotlight();
            }
          },
        });
      }

      if (payload === 'error') {
        return notificationService.show({
          type: 'error',
          title: 'Chyba aplikace (test)',
          body: 'Toto je simulovaná chybová notifikace pro ověření funkčnosti.',
          onClick: () => {
            diagnosticsService.openCrashLogFolder();
          },
        });
      }

      if (payload === 'quickCap') {
        return notificationService.show({
          type: 'quickCap',
          title: 'Snímek obrazovky (test)',
          body: 'Výstřižek QuickCap byl uložen do schránky a do složky.',
        });
      }

      if (payload === 'colorMaster') {
        return notificationService.show({
          type: 'colorMaster',
          title: 'Nabraná barva (test)',
          body: 'Barva #6366f1 (RGB: 99, 102, 241) byla zkopírována do schránky.',
        });
      }

      if (payload === 'screenRuler') {
        return notificationService.show({
          type: 'screenRuler',
          title: 'Pravítko na obrazovce (test)',
          body: 'Měření dokončeno: 420 × 280 px (poměr 3:2).',
        });
      }

      if (payload === 'syncComplete') {
        return notificationService.show({
          type: 'syncComplete',
          title: 'Synchronizace dokončena (test)',
          body: 'Data byla úspěšně stažena z MagicGate a MLog.',
        });
      }

      if (payload === 'update') {
        return notificationService.show({
          type: 'update',
          title: 'Dostupná aktualizace (test)',
          body: 'Je k dispozici nová verze aplikace IADonkey.',
        });
      }

      if (payload === 'clipboard') {
        return notificationService.show({
          type: 'clipboard',
          title: 'Zkopírováno do schránky (test)',
          body: 'Text byl úspěšně vložen do schránky Windows.',
        });
      }

      return notificationService.show({
        type: 'test',
        title: 'Testovací notifikace',
        body: 'Systémové notifikace fungují správně! Budete dostávat upozornění o důležitých událostech.',
        onClick: () => {
          windowManager.showSpotlight();
        },
      });
    }
  );

  ipcMain.handle('open-settings-window', (_event, tab?: string) => {
    const win = windowManager.openSettingsWindow(tab);
    win.on('closed', () => {
      const cfg = store.getConfig();
      if (cfg.hotkey) {
        registerGlobalHotkey(cfg.hotkey);
      }
    });
  });

  ipcMain.handle('open-git-clone-window', (_event, params: {
    repoName: string;
    repoUrl?: string;
    initialRecursive?: boolean;
    isInstanceMode?: boolean;
    adminUrl?: string;
  }) => {
    windowManager.openGitCloneWindow(params);
  });

  ipcMain.handle('magicgate-get-repos', async (_event, params: { adminUrl: string }) => {
    const config = store.getConfig();
    const username = config.magicgate?.username;
    const password = config.magicgate?.password;
    return fetchInstanceSectionRepos(params.adminUrl, username, password);
  });

  ipcMain.handle('magicgate-clone-start', async (event, params: {
    repos: MagicGateSectionRepo[];
    targetDir: string;
    recursive?: boolean;
    rawJson?: string;
  }) => {
    const config = store ? store.getConfig() : null;
    if (config?.extensions?.github === false) {
      return {
        success: false,
        results: [],
        error: 'Rozšíření GitHub je v Nastavení vypnuté. Klonování repozitářů není povoleno.',
      };
    }
    const sender = event.sender;
    const githubToken = getActiveGitHubToken(config?.github);
    return runMultiRepoClone({
      ...params,
      githubToken,
      onProgress: (data) => {
        if (!sender.isDestroyed()) {
          sender.send('magicgate-clone-progress', data);
        }
      },
    });
  });

  ipcMain.handle('open-cms-download-window', (_event, params: {
    instanceName: string;
    adminUrl: string;
    targetDir: string;
  }) => {
    windowManager.openCmsDownloadWindow(params);
  });

  ipcMain.handle('close-cms-download-window', (_event, restoreSpotlight: boolean = true) => {
    windowManager.setSkipSpotlightRestoreOnCmsDownloadClose(!restoreSpotlight);
    windowManager.closeCmsDownloadWindow();
  });

  ipcMain.handle('close-and-reset-spotlight', () => {
    windowManager.setSkipSpotlightRestoreOnCloneClose(true);
    windowManager.setSkipSpotlightRestoreOnCmsDownloadClose(true);
    windowManager.hideSpotlight();
    windowManager.getMainWindow()?.webContents.send('reset-spotlight');
    windowManager.closeGitCloneWindow();
    windowManager.closeCmsDownloadWindow();
  });

  ipcMain.handle('magicgate-download-cms-content', async (event, params: {
    adminUrl: string;
    instanceName?: string;
    targetDir?: string;
  }) => {
    const config = store.getConfig();
    const basePath = config.magicgate?.instanceSourceCodesPath;
    let targetDir = params.targetDir;
    if (!targetDir && basePath) {
      targetDir = normalizeInstanceCmsPath(basePath, params.instanceName || 'instance');
    }
    const username = config.magicgate?.username;
    const password = config.magicgate?.password;

    if (!targetDir || !targetDir.trim()) {
      const errMsg = 'Není nastavena cílová složka. Zkontrolujte v Nastavení -> Rozšíření -> MagicGate položku "Cesta ke zdrojovým kódům instance".';
      diagnosticsService.logAction({
        type: 'action',
        title: `Stažení CMSinFS zdrojáků (${params.instanceName || 'instance'}) selhalo`,
        details: errMsg,
        status: 'error',
      });
      return { success: false, error: errMsg };
    }

    const sender = event.sender;
    const result = await downloadInstanceCmsContent({
      adminUrl: params.adminUrl,
      targetDir,
      userName: username,
      password,
      instanceName: params.instanceName,
      onProgress: (data) => {
        if (!sender.isDestroyed()) {
          sender.send('magicgate-download-cms-progress', data);
        }
      },
    });

    if (result.success && result.targetPath) {
      diagnosticsService.logAction({
        type: 'action',
        title: `Staženy CMSinFS zdrojáky: ${params.instanceName || 'instance'}`,
        details: `Cíl: ${result.targetPath} (${result.fileCount ?? 0} souborů)`,
        status: 'info',
      });
    } else {
      const errMsg = result.error || 'Neznámá chyba při stahování CMSinFS zdrojáků.';
      diagnosticsService.logAction({
        type: 'action',
        title: `Chyba stahování CMSinFS zdrojáků: ${params.instanceName || 'instance'}`,
        details: errMsg,
        status: 'error',
      });
    }

    return result;
  });

  ipcMain.handle('pause-global-hotkey', () => {
    if (currentHotkey) {
      globalShortcut.unregister(currentHotkey);
      console.log(`[Main] Global hotkey paused for input recording: ${currentHotkey}`);
    }
    if (currentColorMasterHotkey) {
      globalShortcut.unregister(currentColorMasterHotkey);
      console.log(`[Main] ColorMaster hotkey paused for input recording: ${currentColorMasterHotkey}`);
    }
    if (currentQuickCapHotkey) {
      globalShortcut.unregister(currentQuickCapHotkey);
      console.log(`[Main] QuickCap hotkey paused for input recording: ${currentQuickCapHotkey}`);
    }
    if (currentScreenRulerHotkey) {
      globalShortcut.unregister(currentScreenRulerHotkey);
      console.log(`[Main] ScreenRuler hotkey paused for input recording: ${currentScreenRulerHotkey}`);
    }
    if (currentEasyClipHotkey) {
      globalShortcut.unregister(currentEasyClipHotkey);
      console.log(`[Main] EasyClip hotkey paused for input recording: ${currentEasyClipHotkey}`);
    }
    if (currentPaletteMasterHotkey) {
      globalShortcut.unregister(currentPaletteMasterHotkey);
      console.log(`[Main] PaletteMaster hotkey paused for input recording: ${currentPaletteMasterHotkey}`);
    }

    // Intercept Alt+Space at OS level via RegisterHotKey to suppress Windows native system menu
    try {
      globalShortcut.unregister('Alt+Space');
      const intercepted = globalShortcut.register('Alt+Space', () => {
        console.log('[Main] Recording interceptor caught Alt+Space');
        const settingsWin = windowManager.getSettingsWindow();
        const mainWin = windowManager.getMainWindow();
        const targetWin =
          settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible()
            ? settingsWin
            : mainWin && !mainWin.isDestroyed() && mainWin.isVisible()
            ? mainWin
            : null;

        if (targetWin) {
          targetWin.webContents.send('injected-hotkey-event', {
            type: 'keydown',
            key: 'Space',
            code: 'Space',
            altKey: true,
            ctrlKey: false,
            shiftKey: false,
            metaKey: false,
          });
          setTimeout(() => {
            if (!targetWin.isDestroyed()) {
              targetWin.webContents.send('injected-hotkey-event', {
                type: 'keyup',
                key: 'Space',
                code: 'Space',
                altKey: true,
                ctrlKey: false,
                shiftKey: false,
                metaKey: false,
              });
            }
          }, 60);
        }
      });
      console.log(`[Main] Alt+Space OS-level interceptor registered: ${intercepted}`);
    } catch (err) {
      console.warn('[Main] Failed to register Alt+Space recording interceptor:', err);
    }
  });

  ipcMain.handle('resume-global-hotkey', () => {
    try {
      globalShortcut.unregister('Alt+Space');
    } catch {}

    const cfg = store.getConfig();
    const hotkey = cfg.hotkey || currentHotkey;
    if (hotkey) {
      registerGlobalHotkey(hotkey);
      console.log(`[Main] Global hotkey resumed: ${hotkey}`);
    }
    registerColorMasterHotkey(cfg.donkeyTools?.colorMaster?.hotkey);
    registerPaletteMasterHotkey(cfg.donkeyTools?.colorMaster?.paletteHotkey);
    registerQuickCapHotkey(cfg.donkeyTools?.quickCap?.hotkey || cfg.donkeyTools?.fastSnap?.hotkey);
    registerScreenRulerHotkey(cfg.donkeyTools?.screenRuler?.hotkey);
    registerEasyClipHotkey(cfg.donkeyTools?.easyClip?.hotkey);
  });

  ipcMain.handle('get-items', () => {
    return getCombinedItems();
  });

  ipcMain.handle('get-material-icons', () => {
    return store.getMaterialIcons();
  });

  ipcMain.handle('download-material-icons', async () => {
    try {
      const url = 'https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=true';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Chyba serveru Google Fonts (${res.status} ${res.statusText})`);
      }
      const text = await res.text();
      const clean = text.replace(/^\)]}'\s*/, '');
      const data = JSON.parse(clean);

      if (!Array.isArray(data.icons)) {
        throw new Error('Neplatný formát metadat z Google Fonts');
      }

      function normalizeCategory(rawCat?: string): string {
        if (!rawCat) return 'Ostatní';
        const lower = rawCat.toLowerCase().trim();
        if (lower.includes('action')) return 'Akce';
        if (lower.includes('audio') || lower === 'av' || lower.includes('video')) return 'Zvuk a video';
        if (lower.includes('image') || lower.includes('photo')) return 'Obrázky';
        if (lower.includes('social')) return 'Sociální';
        if (lower.includes('device') || lower.includes('hardware') || lower.includes('android')) return 'Hardware a zařízení';
        if (lower.includes('map') || lower.includes('transit') || lower.includes('travel') || lower.includes('places')) return 'Mapy a cestování';
        if (lower.includes('communicat')) return 'Komunikace';
        if (lower.includes('home') || lower.includes('household')) return 'Domácnost';
        if (lower.includes('business') || lower.includes('payment')) return 'Obchod a finance';
        if (lower.includes('notif') || lower.includes('alert')) return 'Upozornění';
        if (lower.includes('text') || lower.includes('editor')) return 'Text a editor';
        if (lower.includes('file')) return 'Soubory';
        if (lower.includes('privacy') || lower.includes('security')) return 'Bezpečnost';
        if (lower.includes('navigat') || lower.includes('search')) return 'Navigace a hledání';
        if (lower.includes('activit')) return 'Aktivity';
        return 'Ostatní';
      }

      // Filter only icons supported in Material Symbols Outlined (exclude legacy Material Icons)
      const symbolsOnly = data.icons.filter((item: any) => {
        const unsupported = Array.isArray(item.unsupported_families) ? item.unsupported_families : [];
        return !unsupported.includes('Material Symbols Outlined');
      });

      const iconMap = new Map<string, { name: string; category: string; tags: string[] }>();
      for (const item of symbolsOnly) {
        if (!item.name) continue;
        const name = String(item.name).trim().toLowerCase();
        const rawTags = Array.isArray(item.tags) ? item.tags : [];
        const cleanTags = rawTags
          .map((t: any) => String(t).trim().toLowerCase())
          .filter((t: string) => t.length > 0);

        if (!iconMap.has(name)) {
          iconMap.set(name, {
            name,
            category: normalizeCategory(item.categories?.[0]),
            tags: cleanTags,
          });
        } else {
          const existing = iconMap.get(name)!;
          existing.tags = Array.from(new Set([...existing.tags, ...cleanTags]));
        }
      }

      const simplified = Array.from(iconMap.values());

      store.saveMaterialIcons(simplified);

      const downloadedAt = new Date().toISOString();
      const currentConfig = store.getConfig();
      const updatedConfig = {
        ...currentConfig,
        iconsLastDownloadedAt: downloadedAt,
        iconsCount: simplified.length,
      };
      store.saveConfig(updatedConfig);

      windowManager.getMainWindow()?.webContents.send('config-updated', updatedConfig);
      windowManager.getSettingsWindow()?.webContents.send('config-updated', updatedConfig);
      windowManager.getMagicPlanWindow()?.webContents.send('config-updated', updatedConfig);

      return {
        success: true,
        count: simplified.length,
        downloadedAt,
      };
    } catch (err: any) {
      console.error('[Main] Failed to download material icons:', err);
      return {
        success: false,
        error: err?.message || 'Chyba při stahování ikon z Google Fonts.',
      };
    }
  });

  ipcMain.handle('sync-now', async () => {
    await syncManager.syncAll((progress) => {
      windowManager.getMainWindow()?.webContents.send('sync-progress', progress);
      windowManager.getSettingsWindow()?.webContents.send('sync-progress', progress);
    });
    const updatedConfig = store.getConfig();
    const allItems = getCombinedItems();
    windowManager.getMainWindow()?.webContents.send('config-updated', updatedConfig);
    windowManager.getSettingsWindow()?.webContents.send('config-updated', updatedConfig);
    windowManager.getMagicPlanWindow()?.webContents.send('config-updated', updatedConfig);
    windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
    windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);

    notificationService.show({
      type: 'syncComplete',
      title: 'Synchronizace dokončena',
      body: `Úspěšně synchronizováno celkem ${allItems.length} položek.`,
      onClick: () => {
        windowManager.showSpotlight();
      },
    });

    return allItems;
  });

  ipcMain.handle('inspect-source', async (_, source: any) => {
    return await syncManager.inspectSource(source);
  });

  function resolveDefaultPath(initialPath?: string, forDirectory: boolean = false): string | undefined {
    if (!initialPath || typeof initialPath !== 'string') return undefined;
    const trimmed = initialPath.trim();
    if (!trimmed) return undefined;

    try {
      if (fs.existsSync(trimmed)) {
        if (forDirectory) {
          const stat = fs.statSync(trimmed);
          return stat.isDirectory() ? trimmed : path.dirname(trimmed);
        }
        return trimmed;
      }
      // If exact path does not exist, check its parent directory
      const parent = path.dirname(trimmed);
      if (fs.existsSync(parent)) {
        return parent;
      }
    } catch {
      // ignore filesystem errors
    }
    return undefined;
  }

  ipcMain.handle('select-json-file', async (_event, defaultPath?: string) => {
    const win = windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const resolvedPath = resolveDefaultPath(defaultPath, false);
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte JSON soubor s daty',
      defaultPath: resolvedPath,
      filters: [
        { name: 'JSON soubory (*.json)', extensions: ['json'] },
        { name: 'Všechny soubory', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('select-xml-file', async (_event, defaultPath?: string) => {
    const win = windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const resolvedPath = resolveDefaultPath(defaultPath, false);
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte MagicGate XML soubor konfigurace',
      defaultPath: resolvedPath,
      filters: [
        { name: 'XML soubory (*.xml)', extensions: ['xml'] },
        { name: 'Všechny soubory', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('select-directory', async (_event, defaultPath?: string) => {
    const win = windowManager.getGitCloneWindow() || windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const resolvedPath = resolveDefaultPath(defaultPath, true);
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte cílovou složku',
      defaultPath: resolvedPath,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('run-git-clone', async (_event, data: { repoUrl: string; targetDir: string; recursive?: boolean }) => {
    const config = store ? store.getConfig() : null;
    if (config?.extensions?.github === false) {
      return {
        success: false,
        targetPath: '',
        error: 'Rozšíření GitHub je v Nastavení vypnuté. Klonování repozitářů není povoleno.',
      };
    }
    const { repoUrl, targetDir, recursive } = data;
    if (!repoUrl || !targetDir) {
      return { success: false, targetPath: '', error: 'Chybí URL repozitáře nebo cílová složka.' };
    }

    const githubToken = getActiveGitHubToken(config?.github);

    return new Promise((resolve) => {
      // Determine folder name from repository url
      const cleanUrl = repoUrl.trim().replace(/\.git$/i, '');
      const parts = cleanUrl.split(/[/\\\\]/);
      const repoName = parts[parts.length - 1] || 'repository';
      const targetPath = path.join(targetDir, repoName);

      const authArgs: string[] = [];
      if (githubToken) {
        try {
          const parsed = new URL(repoUrl);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
            const origin = `${parsed.protocol}//${parsed.host}`;
            authArgs.push('-c', `http.${origin}/.extraheader=AUTHORIZATION: basic ${basicAuth}`);
          }
        } catch {
          // Omit if invalid URL or SSH
        }
      }

      const args = [...authArgs, 'clone'];
      if (recursive) {
        args.push('--recursive');
      }
      args.push(repoUrl, targetPath);

      const gitProcess = spawn('git', args, {
        cwd: targetDir,
        shell: false,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';

      const sanitizeOutput = (text: string) => {
        if (!text) return text;
        let res = text;
        if (githubToken) {
          res = res.split(githubToken).join('[REDACTED]');
          const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
          res = res.split(basicAuth).join('[REDACTED]');
        }
        return res;
      };

      gitProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      gitProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, targetPath, output: sanitizeOutput(stdout) });
        } else {
          const combinedErr = stderr || stdout || `Příkaz git clone selhal s kódem ${code}`;
          const isAlreadyExists =
            /already exists and is not an empty directory/i.test(combinedErr) ||
            /již existuje a není prázdná/i.test(combinedErr);

          if (isAlreadyExists) {
            resolve({
              success: true,
              targetPath,
              alreadyExists: true,
              output: `Repozitář již existuje v cílové složce.`,
            });
          } else {
            resolve({
              success: false,
              targetPath,
              error: sanitizeOutput(combinedErr),
            });
          }
        }
      });

      gitProcess.on('error', (err) => {
        resolve({
          success: false,
          targetPath,
          error: sanitizeOutput(err.message) || 'Nepodařilo se spustit příkaz git. Ujistěte se, že máte Git nainstalovaný a v systémové cestě PATH.',
        });
      });
    });
  });

  ipcMain.handle('execute-action', async (_event, data: { action: string; location: string; settings?: string | null; autoPaste?: boolean; sourceId?: string }) => {
    const { action, location, settings, autoPaste, sourceId } = data;
    if (!location) return;

    diagnosticsService.logAction({
      type: 'action',
      title: `Provedení akce: ${action || 'open'}`,
      details: `Cíl: ${location}${settings ? ` (${settings})` : ''}`,
      status: 'info',
    });

    try {
      const trimmed = location.trim();
      const isUrl = /^https?:\/\//i.test(trimmed) || /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/i.test(trimmed);

      if (action === 'paste' || action === 'copy') {
        clipboard.writeText(location);
        diagnosticsService.logAction({
          type: 'action',
          title: 'Zkopírováno do schránky',
          details: location,
          status: 'success',
        });
        const truncated = location.length > 80 ? `${location.slice(0, 80)}...` : location;
        notificationService.show({
          type: 'clipboard',
          title: 'Zkopírováno do schránky',
          body: `Text "${truncated}" byl úspěšně zkopírován do schránky.`,
        });
        windowManager.hideImmediately();
        if (autoPaste || sourceId === 'snippet' || action === 'paste') {
          const hwnd = windowManager.getMainWindowHandle();
          pasteService.simulatePaste(80, hwnd);
        }
        return;
      }

      if (action === 'open-paint') {
        try {
          const { spawn } = await import('node:child_process');
          const child = spawn('mspaint', [trimmed], { detached: true, stdio: 'ignore' });
          child.unref();
          diagnosticsService.logAction({
            type: 'action',
            title: 'Otevření výstřižku v aplikaci Malování',
            details: trimmed,
            status: 'success',
          });
        } catch (paintErr: any) {
          console.error('[Main] Failed to open in paint:', paintErr);
          diagnosticsService.recordCrash('Chyba při otevírání v Malování', paintErr, { filePath: trimmed });
        }
        windowManager.hideImmediately();
        return;
      }

      if (action === 'show-in-folder') {
        try {
          shell.showItemInFolder(trimmed);
          diagnosticsService.logAction({
            type: 'action',
            title: 'Zobrazení souboru v Průzkumníku',
            details: trimmed,
            status: 'success',
          });
        } catch (folderErr: any) {
          console.error('[Main] Failed to show item in folder:', folderErr);
        }
        windowManager.hideImmediately();
        return;
      }

      if (action === 'open' || !action) {
        if (isUrl) {
          let fullUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

          if (settings === 'magicgate' && store.getConfig().extensions?.magicgate !== false) {
            try {
              const config = store.getConfig();
              const autoLoginUrl = await getMagicGateAutoLoginUrl(fullUrl, config);
              fullUrl = autoLoginUrl;
            } catch (mgErr: any) {
              console.error('[Main] MagicGate login error, falling back to direct URL:', mgErr?.message || mgErr);
              diagnosticsService.recordCrash('MagicGate přihlašovací handshake', mgErr, { url: fullUrl });
            }
          }

          await shell.openExternal(fullUrl);
          diagnosticsService.logAction({
            type: 'action',
            title: 'Otevření webové adresy v prohlížeči',
            details: fullUrl,
            status: 'success',
          });
        } else {
          // File or folder path on disk
          const openErr = await shell.openPath(trimmed);
          if (openErr) {
            console.error(`[Main] openPath error: ${openErr}`);
            // Fallback try as external url
            try {
              await shell.openExternal(trimmed);
              diagnosticsService.logAction({
                type: 'action',
                title: 'Otevření cíle přes výchozí protokol',
                details: trimmed,
                status: 'success',
              });
            } catch (extErr) {
              diagnosticsService.recordCrash('Chyba při otevírání cesty/URL', extErr, { location: trimmed, openErr });
            }
          } else {
            diagnosticsService.logAction({
              type: 'action',
              title: 'Otevření souboru nebo složky na disku',
              details: trimmed,
              status: 'success',
            });
          }
        }
      }
    } catch (err) {
      console.error('[Main] Failed to execute action:', err);
      diagnosticsService.recordCrash(`Chyba při provádění akce ${action || 'open'}`, err, { action, location, settings });
    }
  });

  ipcMain.handle('test-github-connection', async (_event, settings) => {
    return await testGitHubConnection(settings);
  });

  ipcMain.handle('github-oauth-start-device-flow', async (_event, params: { clientId: string; apiUrl?: string }) => {
    return await startGitHubDeviceFlow(params);
  });

  ipcMain.handle('github-oauth-poll-token', async (_event, params: { clientId: string; deviceCode: string; apiUrl?: string }) => {
    return await pollGitHubDeviceToken(params);
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    if (url) {
      const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      await shell.openExternal(fullUrl);
    }
  });

  ipcMain.handle('open-path', async (_event, filePath: string) => {
    if (filePath) {
      await shell.openPath(filePath);
    }
  });

  ipcMain.handle('hide-window', () => {
    windowManager.hideSpotlight();
  });

  ipcMain.handle('open-power-window', () => {
    windowManager.openPowerWindow();
  });

  ipcMain.handle('close-power-window', () => {
    windowManager.closePowerWindow();
  });

  ipcMain.handle('restart-app', () => {
    windowManager.prepareForQuitOrRestart();
    globalShortcut.unregisterAll();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('quit-app', () => {
    windowManager.prepareForQuitOrRestart();
    globalShortcut.unregisterAll();
    app.quit();
  });

  ipcMain.handle('reset-and-hide-spotlight', () => {
    windowManager.setSkipSpotlightRestoreOnCloneClose(true);
    windowManager.setSkipSpotlightRestoreOnCmsDownloadClose(true);
    windowManager.hideImmediately();
    windowManager.getMainWindow()?.webContents.send('reset-spotlight');
  });

  ipcMain.handle('check-update', async () => {
    return await updateChecker.checkForUpdates(true);
  });

  ipcMain.handle('download-update', async (_event, downloadUrl: string) => {
    return await updateChecker.downloadUpdate(downloadUrl, (progress) => {
      windowManager.getMainWindow()?.webContents.send('update-download-progress', progress);
      windowManager.getSettingsWindow()?.webContents.send('update-download-progress', progress);
    });
  });

  ipcMain.handle('install-update', (_event, filePath: string) => {
    updateChecker.installAndRestart(filePath, () => {
      windowManager.prepareForQuitOrRestart();
      globalShortcut.unregisterAll();
      if (syncIntervalTimer) clearInterval(syncIntervalTimer);
      if (updateIntervalTimer) clearInterval(updateIntervalTimer);
    });
  });

  // Installer IPC handlers
  ipcMain.handle('installer-get-default-path', () => {
    return InstallerService.getDefaultInstallPath();
  });

  ipcMain.handle('installer-browse-folder', async (_event, defaultPath?: string) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte cílovou složku pro instalaci IADonkey',
      defaultPath: defaultPath || InstallerService.getDefaultInstallPath(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('installer-perform-install', async (event, options) => {
    return await InstallerService.performInstall(options, (progress) => {
      event.sender.send('installer-progress', progress);
    });
  });

  ipcMain.handle('installer-launch-and-finish', (_event, targetDir: string, runNow: boolean) => {
    if (runNow) {
      InstallerService.launchInstalledAppAndExit(targetDir);
    } else {
      app.exit(0);
    }
  });

  ipcMain.handle('installer-perform-uninstall', () => {
    InstallerService.performUninstall();
  });

  ipcMain.handle('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle('maximize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    return windowDragService.handleMaximizeToggle(win);
  });

  ipcMain.handle('is-window-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });

  ipcMain.handle('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  // VS Code integration handlers
  ipcMain.handle('open-in-vscode', async (_event, folderPath: string) => {
    if (!folderPath) {
      return { success: false, error: 'Chybí cesta ke složce.' };
    }
    return await openPathInVscode(folderPath);
  });

  ipcMain.handle('select-vscode-path', async (_event, defaultPath?: string) => {
    const win = windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const resolvedPath = resolveDefaultPath(defaultPath, false);
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte spustitelný soubor VS Code (Code.exe)',
      defaultPath: resolvedPath,
      properties: ['openFile'],
      filters: [
        { name: 'Spustitelné soubory (*.exe, *.cmd)', extensions: ['exe', 'cmd'] },
        { name: 'Všechny soubory', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('detect-vscode-path', () => {
    return detectDefaultVscodePath();
  });

  ipcMain.handle('open-in-android-studio', async (_event, folderPath: string) => {
    if (!folderPath) {
      return { success: false, error: 'Chybí cesta ke složce.' };
    }
    return await openPathInAndroidStudio(folderPath);
  });

  ipcMain.handle('select-android-studio-path', async (_event, defaultPath?: string) => {
    const win = windowManager.getSettingsWindow() || windowManager.getMainWindow();
    const resolvedPath = resolveDefaultPath(defaultPath, false);
    const result = await dialog.showOpenDialog(win || (undefined as any), {
      title: 'Vyberte spustitelný soubor Android Studio (studio64.exe)',
      defaultPath: resolvedPath,
      properties: ['openFile'],
      filters: [
        { name: 'Spustitelné soubory (*.exe, *.bat, *.cmd)', extensions: ['exe', 'bat', 'cmd'] },
        { name: 'Všechny soubory', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('detect-android-studio-path', () => {
    return detectDefaultAndroidStudioPath();
  });

  ipcMain.handle('is-android-project', (_event, folderPath: string) => {
    return isAndroidProjectFolder(folderPath);
  });

  ipcMain.handle('get-existing-cloned-repos', (_event, baseDir?: string) => {
    const config = store.getConfig();
    const targetDir = baseDir?.trim() || config.github?.defaultCloneDir?.trim();
    if (!targetDir || !fs.existsSync(targetDir)) {
      return [];
    }
    try {
      const repoNames = new Set<string>();

      // 1. Direct subdirectories of targetDir (standard GitHub / git repositories)
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(targetDir, entry.name);
          try {
            const subEntries = fs.readdirSync(subPath);
            if (subEntries.length > 0) {
              repoNames.add(entry.name.toLowerCase());
            }
          } catch {}
        }
      }

      // 2. Subdirectories of targetDir/magicgate (MagicGate instances)
      const mgDir = path.join(targetDir, 'magicgate');
      if (fs.existsSync(mgDir)) {
        try {
          const mgStat = fs.statSync(mgDir);
          if (mgStat.isDirectory()) {
            const mgEntries = fs.readdirSync(mgDir, { withFileTypes: true });
            for (const mgEntry of mgEntries) {
              if (mgEntry.isDirectory()) {
                const mgSubPath = path.join(mgDir, mgEntry.name);
                try {
                  const subEntries = fs.readdirSync(mgSubPath);
                  if (subEntries.length > 0) {
                    repoNames.add(`magicgate/${mgEntry.name.toLowerCase()}`);
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }

      return Array.from(repoNames);
    } catch (err) {
      console.warn('[Main] Error reading existing cloned repos:', err);
      return [];
    }
  });

  ipcMain.handle('get-splash-status', () => {
    return windowManager ? windowManager.getLastSplashStatus() : { percent: 15, text: 'Inicializace aplikace...' };
  });

  ipcMain.handle('show-splash-screen', async () => {
    if (!windowManager) return;
    const version = app.getVersion() || '2.0.0';
    windowManager.createSplashWindow(version);
    await windowManager.whenSplashReady();

    const steps = [
      { percent: 15, text: 'Inicializace aplikace...' },
      { percent: 35, text: 'Načítání konfigurace a modulů...' },
      { percent: 60, text: 'Příprava vyhledávacího indexu...' },
      { percent: 85, text: 'Ověřování datových zdrojů...' },
      { percent: 100, text: 'Připraveno ke spuštění!' },
    ];
    for (const step of steps) {
      windowManager.updateSplashStatus(step.percent, step.text);
      await new Promise((r) => setTimeout(r, 600));
    }
    await new Promise((r) => setTimeout(r, 500));
    await windowManager.closeSplashWindow(200);
  });
}

function detectDefaultVscodePath(): string | null {
  const localAppData = process.env.LOCALAPPDATA || '';
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(progFiles, 'Microsoft VS Code', 'Code.exe'),
    path.join(progFilesX86, 'Microsoft VS Code', 'Code.exe'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Check if 'code' or 'code.cmd' is available in PATH
  try {
    const check = spawnSync('where', ['code.cmd'], { windowsHide: true, encoding: 'utf-8' });
    if (check.status === 0 && check.stdout) {
      const firstLine = check.stdout.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    }
  } catch {}

  return null;
}

async function openPathInVscode(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = store.getConfig();
    let vscodeExe = config.vscode?.path?.trim();

    if (!vscodeExe || !fs.existsSync(vscodeExe)) {
      const detected = detectDefaultVscodePath();
      if (detected) {
        vscodeExe = detected;
      }
    }

    if (vscodeExe && fs.existsSync(vscodeExe)) {
      const child = spawn(`"${vscodeExe}"`, [`"${folderPath}"`], {
        shell: true,
        detached: true,
        windowsHide: true,
      });
      child.unref();
      return { success: true };
    }

    // Fallback: spawn code directly via shell
    const child = spawn('code', [`"${folderPath}"`], {
      shell: true,
      detached: true,
      windowsHide: true,
    });
    child.unref();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Nepodařilo se spustit VS Code.' };
  }
}

function detectDefaultAndroidStudioPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA || '';
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    path.join(progFiles, 'Android', 'Android Studio', 'bin', 'studio64.exe'),
    path.join(localAppData, 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
    path.join(progFilesX86, 'Android', 'Android Studio', 'bin', 'studio64.exe'),
    path.join(progFiles, 'Google', 'Android Studio', 'bin', 'studio64.exe'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Check JetBrains Toolbox apps directory for Android Studio
  try {
    const toolboxDir = path.join(localAppData, 'JetBrains', 'Toolbox', 'apps', 'AndroidStudio', 'ch-0');
    if (fs.existsSync(toolboxDir)) {
      const versions = fs.readdirSync(toolboxDir);
      for (const ver of versions) {
        const candidate = path.join(toolboxDir, ver, 'bin', 'studio64.exe');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  } catch {}

  // Check if 'studio64.exe' or 'studio.bat' is available in PATH
  try {
    const checkExe = spawnSync('where', ['studio64.exe'], { windowsHide: true, encoding: 'utf-8' });
    if (checkExe.status === 0 && checkExe.stdout) {
      const firstLine = checkExe.stdout.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    }
    const checkBat = spawnSync('where', ['studio.bat'], { windowsHide: true, encoding: 'utf-8' });
    if (checkBat.status === 0 && checkBat.stdout) {
      const firstLine = checkBat.stdout.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    }
  } catch {}

  return null;
}

async function openPathInAndroidStudio(folderPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const config = store.getConfig();
    let studioExe = config.androidStudio?.path?.trim();

    if (!studioExe || !fs.existsSync(studioExe)) {
      const detected = detectDefaultAndroidStudioPath();
      if (detected) {
        studioExe = detected;
      }
    }

    if (studioExe && fs.existsSync(studioExe)) {
      const child = spawn(`"${studioExe}"`, [`"${folderPath}"`], {
        shell: true,
        detached: true,
        windowsHide: true,
      });
      child.unref();
      return { success: true };
    }

    // Fallback: spawn studio64 directly via shell
    const child = spawn('studio64', [`"${folderPath}"`], {
      shell: true,
      detached: true,
      windowsHide: true,
    });
    child.unref();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Nepodařilo se spustit Android Studio.' };
  }
}

function isAndroidProjectFolder(folderPath: string): boolean {
  if (!folderPath) return false;
  try {
    if (!fs.existsSync(folderPath)) return false;
    const markers = [
      path.join(folderPath, 'build.gradle'),
      path.join(folderPath, 'build.gradle.kts'),
      path.join(folderPath, 'settings.gradle'),
      path.join(folderPath, 'settings.gradle.kts'),
      path.join(folderPath, 'app', 'build.gradle'),
      path.join(folderPath, 'app', 'build.gradle.kts'),
      path.join(folderPath, 'app', 'src', 'main', 'AndroidManifest.xml'),
      path.join(folderPath, 'AndroidManifest.xml'),
    ];
    return markers.some((m) => fs.existsSync(m));
  } catch {
    return false;
  }
}

function startBackgroundTasks() {
  // 0. Initial scan of installed Windows applications
  appScanner.scanApps().then(() => {
    const config = store.getConfig();
    if (config.searchInstalledApps !== false) {
      const allItems = getCombinedItems();
      windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
      windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);
    }
  }).catch((err) => {
    console.warn('[Main] AppScanner error on startup:', err);
  });

  // 1. Silent sync interval
  const config = store.getConfig();
  const intervalMs = Math.max(5, config.autoSyncIntervalMinutes || 30) * 60 * 1000;
  
  // Initial sync after 600ms if sources exist
  setTimeout(async () => {
    if (store.getConfig().sources.length > 0) {
      try {
        console.log('[Main] Running startup silent sync...');
        await syncManager.syncAll((progress) => {
          windowManager.getMainWindow()?.webContents.send('sync-progress', progress);
          windowManager.getSettingsWindow()?.webContents.send('sync-progress', progress);
        });
        const updatedConfig = store.getConfig();
        const allItems = getCombinedItems();
        windowManager.getMainWindow()?.webContents.send('config-updated', updatedConfig);
        windowManager.getSettingsWindow()?.webContents.send('config-updated', updatedConfig);
        windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
        windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);
      } catch (err) {
        console.error('[Main] Startup sync error:', err);
      }
    }
  }, 600);

  syncIntervalTimer = setInterval(async () => {
    if (store.getConfig().sources.length > 0) {
      try {
        console.log('[Main] Running scheduled background sync...');
        await syncManager.syncAll((progress) => {
          windowManager.getMainWindow()?.webContents.send('sync-progress', progress);
          windowManager.getSettingsWindow()?.webContents.send('sync-progress', progress);
        });
        const updatedConfig = store.getConfig();
        const allItems = getCombinedItems();
        windowManager.getMainWindow()?.webContents.send('config-updated', updatedConfig);
        windowManager.getSettingsWindow()?.webContents.send('config-updated', updatedConfig);
        windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
        windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);
      } catch (err) {
        console.error('[Main] Scheduled sync error:', err);
      }
    }
  }, intervalMs);

  // 2. Periodic update check (run once at startup after 5s, then every 24h)
  const checkUpdateSilently = async () => {
    try {
      const updateInfo = await updateChecker.checkForUpdates(false);
      if (updateInfo.hasUpdate) {
        notificationService.show({
          type: 'update',
          title: `Nová verze v${updateInfo.latestVersion}`,
          body: `Byla nalezena nová aktualizace aplikace. Kliknutím zobrazíte podrobnosti.`,
          onClick: () => {
            windowManager.showSpotlight();
          },
        });

        const win = windowManager.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('update-available', updateInfo);
        }
        const settingsWin = windowManager.getSettingsWindow();
        if (settingsWin && !settingsWin.isDestroyed()) {
          settingsWin.webContents.send('update-available', updateInfo);
        }
      }
    } catch (err) {
      // silent catch for background checks
    }
  };

  setTimeout(checkUpdateSilently, 5000);
  updateIntervalTimer = setInterval(checkUpdateSilently, 24 * 60 * 60 * 1000);
}

// App lifecycle
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  store = new AppStore();
  syncManager = new DataSyncManager(store);
  updateChecker = new UpdateChecker(store);
  appScanner = new AppScanner();

  const initialConfig = store.getConfig();
  notificationService.init(initialConfig);
  windowDragService.init();
  diagnosticsService.setOnCrashCallback((action, error) => {
    const errorMsg = error instanceof Error ? error.message : String(error?.message || error || 'Neznámá chyba');
    notificationService.show({
      type: 'error',
      title: 'Chyba aplikace',
      body: `Došlo k chybě při: ${action} (${errorMsg}). Záznam byl uložen do crashlogu.`,
      onClick: () => {
        diagnosticsService.openCrashLogFolder();
      },
    });
  });
  currentHotkey = initialConfig.hotkey || 'Ctrl+Alt+Space';

  windowManager = new WindowManager(
    // onSyncRequest from Tray
    async () => {
      await syncManager.syncAll((progress) => {
        windowManager.getMainWindow()?.webContents.send('sync-progress', progress);
        windowManager.getSettingsWindow()?.webContents.send('sync-progress', progress);
      });
      const updatedConfig = store.getConfig();
      const allItems = getCombinedItems();
      windowManager.getMainWindow()?.webContents.send('config-updated', updatedConfig);
      windowManager.getSettingsWindow()?.webContents.send('config-updated', updatedConfig);
      windowManager.getMainWindow()?.webContents.send('data-updated', allItems);
      windowManager.getSettingsWindow()?.webContents.send('data-updated', allItems);

      notificationService.show({
        type: 'syncComplete',
        title: 'Synchronizace dokončena',
        body: `Úspěšně synchronizováno celkem ${allItems.length} položek.`,
        onClick: () => {
          windowManager.showSpotlight();
        },
      });
    },
    // onSettingsRequest from Tray
    () => {
      windowManager.getMainWindow()?.webContents.send('open-settings');
    },
    // getConfig callback
    () => store.getConfig(),
    // onQuickCapRequest from Tray
    () => {
      startQuickCapProcess().catch((err) => {
        console.error('[Main] Tray QuickCap error:', err);
      });
    },
    // onColorPickerRequest from Tray
    () => {
      pickScreenColorNative().catch((err) => {
        console.error('[Main] Tray ColorPicker error:', err);
      });
    },
    // onScreenRulerRequest from Tray
    () => {
      startScreenRulerProcess().catch((err) => {
        console.error('[Main] Tray ScreenRuler error:', err);
      });
    },
    // onEasyClipRequest from Tray
    () => {
      windowManager.showSpotlightWithMode('easyclip');
    }
  );

  setupIpcHandlers();

  // Check if running in uninstaller mode
  if (process.argv.includes('--uninstall')) {
    windowManager.createUninstallerWindow();
    return;
  }

  // Check if running in installer mode
  if (InstallerService.isInstallerMode()) {
    windowManager.createInstallerWindow();
    return;
  }

  const isSilentStart =
    process.argv.includes('--background') ||
    process.argv.includes('--hidden') ||
    process.argv.includes('--silent');

  if (!isSilentStart) {
    windowManager.createSplashWindow(app.getVersion() || '1.1.16');
  }

  const mainWindow = windowManager.createMainWindow();
  windowManager.createTray(currentHotkey);
  registerGlobalHotkey(currentHotkey);
  registerColorMasterHotkey(initialConfig.donkeyTools?.colorMaster?.hotkey);
  registerPaletteMasterHotkey(initialConfig.donkeyTools?.colorMaster?.paletteHotkey);
  registerQuickCapHotkey(initialConfig.donkeyTools?.quickCap?.hotkey || initialConfig.donkeyTools?.fastSnap?.hotkey);
  registerScreenRulerHotkey(initialConfig.donkeyTools?.screenRuler?.hotkey);
  registerEasyClipHotkey(initialConfig.donkeyTools?.easyClip?.hotkey);

  easyClipService.init(initialConfig, notificationService);
  easyClipService.setOnItemsUpdated((items) => {
    windowManager?.getMainWindow()?.webContents.send('easyclip-items-updated', items);
    windowManager?.getSettingsWindow()?.webContents.send('easyclip-items-updated', items);
  });

  magicPlanService = new MagicPlanService(store);
  magicPlanService.start();

  feedbackNotificationService.init(store, windowManager);
  feedbackNotificationService.start();

  const launchDeferredTasks = () => {
    startBackgroundTasks();
    faviconService.refreshFavicons((favicons) => {
      windowManager.getMainWindow()?.webContents.send('search-engine-favicons-updated', favicons);
      windowManager.getSettingsWindow()?.webContents.send('search-engine-favicons-updated', favicons);
    }).catch((err) => {
      console.warn('[Main] Favicon refresh error:', err);
    });
  };

  if (!isSilentStart) {
    // 1. Wait until splash screen is physically rendered and visible on screen
    await windowManager.whenSplashReady();

    // 2. Guaranteed 5-second display timer from the exact moment user sees the splash screen
    const minSplashPromise = new Promise((resolve) => setTimeout(resolve, 5000));

    // 3. Verify mainWindow is loaded
    const mainWindowReadyPromise = new Promise<void>((resolve) => {
      if (!mainWindow) {
        resolve();
        return;
      }
      if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', () => resolve());
      } else {
        resolve();
      }
    });

    // Run splash for AT LEAST 5 seconds while visible, then reveal and focus Spotlight
    Promise.all([minSplashPromise, mainWindowReadyPromise]).then(async () => {
      await windowManager.closeSplashWindow();
      windowManager.showSpotlight();
      // Launch background scan and sync smoothly after spotlight is ready
      setTimeout(() => launchDeferredTasks(), 500);
    });
  } else {
    launchDeferredTasks();
  }
});

app.on('second-instance', () => {
  windowManager?.showSpotlight();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (syncIntervalTimer) clearInterval(syncIntervalTimer);
  if (updateIntervalTimer) clearInterval(updateIntervalTimer);
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
});
