import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Tray, Menu, screen, nativeImage, app } from 'electron';
import { diagnosticsService } from './diagnosticsService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ICON_PNG_B64 =
  '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';

const getAppIcon = () => {
  const ico = path.join(__dirname, '../electron/assets/icon.ico');
  const png = path.join(__dirname, '../electron/assets/icon.png');
  const distPng = path.join(__dirname, '../dist/icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  if (fs.existsSync(distPng)) return distPng;
  return undefined;
};

const getAppIconBase64 = (): string => {
  const candidates = [
    path.join(__dirname, '../electron/assets/icon.png'),
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/electron/assets/icon.png'),
    path.join(process.resourcesPath || '', 'app.asar/dist/icon.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return `data:image/png;base64,${fs.readFileSync(c).toString('base64')}`;
      } catch {}
    }
  }
  return `data:image/png;base64,${APP_ICON_PNG_B64}`;
};

export const isDevMode = !app.isPackaged;

export const getWindowTitle = (subTitle?: string): string => {
  const prefix = isDevMode ? 'IADonkey [DEV]' : 'IADonkey';
  return subTitle ? `${prefix} – ${subTitle}` : prefix;
};

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private settingsWindow: BrowserWindow | null = null;
  private powerWindow: BrowserWindow | null = null;
  private gitCloneWindow: BrowserWindow | null = null;
  private cmsDownloadWindow: BrowserWindow | null = null;
  private tuneColorWindow: BrowserWindow | null = null;
  private paletteBarWindow: BrowserWindow | null = null;
  private paletteDetailWindow: BrowserWindow | null = null;
  private magicPlanWindow: BrowserWindow | null = null;
  private snipperWindow: BrowserWindow | null = null;
  private rulerWindow: BrowserWindow | null = null;
  private splashWindow: BrowserWindow | null = null;
  private lastSplashStatus: { percent: number; text: string } = {
    percent: 10,
    text: 'Inicializace aplikace...',
  };
  private tray: Tray | null = null;
  private isQuitting = false;
  private lastShowTime = 0;
  private shouldRestoreSpotlightOnCloneClose = true;
  private shouldRestoreSpotlightOnCmsDownloadClose = true;
  private shouldResetSpotlightOnCloneClose = false;
  private shouldResetSpotlightOnCmsDownloadClose = false;
  private registerCrashHandlers(win: BrowserWindow, windowName: string): void {
    win.webContents.on('render-process-gone', (_event, details) => {
      diagnosticsService.recordCrash(`Pád procesu okna ${windowName} (${details.reason})`, new Error(details.reason), {
        windowName,
        details,
      });
    });
    win.webContents.on('unresponsive', () => {
      diagnosticsService.recordCrash(`Okno ${windowName} přestalo odpovídat (unresponsive)`, new Error('Process unresponsive'), {
        windowName,
      });
    });
  }

  public setSkipSpotlightRestoreOnCloneClose(skip: boolean): void {
    this.shouldRestoreSpotlightOnCloneClose = !skip;
  }

  public setSkipSpotlightRestoreOnCmsDownloadClose(skip: boolean): void {
    this.shouldRestoreSpotlightOnCmsDownloadClose = !skip;
  }

  public setResetSpotlightOnCloneClose(reset: boolean): void {
    this.shouldResetSpotlightOnCloneClose = reset;
  }

  public setResetSpotlightOnCmsDownloadClose(reset: boolean): void {
    this.shouldResetSpotlightOnCmsDownloadClose = reset;
  }

  constructor(
    private onSyncRequest: () => void,
    private onSettingsRequest: () => void,
    private getConfig?: () => any,
    private onQuickCapRequest?: () => void,
    private onColorPickerRequest?: () => void,
    private onScreenRulerRequest?: () => void,
    private onEasyClipRequest?: () => void
  ) {}

  public createMainWindow(): BrowserWindow {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { bounds } = primaryDisplay;

    const width = 800;
    const height = 620;
    const x = Math.round(bounds.x + (bounds.width - width) / 2);
    const y = Math.round(bounds.y + (bounds.height - height) / 3);

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.mainWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      icon: getAppIcon(),
      title: getWindowTitle('Spotlight'),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.registerCrashHandlers(this.mainWindow, 'Spotlight (Hlavní okno)');

    // In dev mode, load Vite server; in prod, load index.html
    if (process.env.VITE_DEV_SERVER_URL) {
      this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Preload window in background; spotlight is revealed via hotkey or tray click
    this.mainWindow.once('ready-to-show', () => {
      // Keep hidden in background until requested
    });

    // Hide window when it loses focus (unless devtools is active or during initial reveal / reactivation)
    this.mainWindow.on('blur', () => {
      if (Date.now() - this.lastShowTime < 800) {
        return;
      }
      if (this.mainWindow && !this.mainWindow.webContents.isDevToolsOpened()) {
        this.hideSpotlight();
      }
    });

    // Intercept close to hide instead of quit
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.mainWindow?.hide();
      }
    });

    return this.mainWindow;
  }

  public showSpotlight(): void {
    if (!this.mainWindow) return;

    this.lastShowTime = Date.now();

    // Center on the display where the mouse cursor is located
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { bounds } = currentDisplay;

    const width = 800;
    const height = 620;
    const x = Math.round(bounds.x + (bounds.width - width) / 2);
    const y = Math.round(bounds.y + (bounds.height - height) / 3);

    const b = this.mainWindow.getBounds();
    if (b.x !== x || b.y !== y || b.width !== width || b.height !== height) {
      this.mainWindow.setBounds({ x, y, width, height });
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.setAlwaysOnTop(true);
    app.focus({ steal: true });
    this.mainWindow.focus();
    this.mainWindow.webContents.focus();

    this.mainWindow.webContents.send('window-shown');
  }

  public showSpotlightWithMode(mode: string, options?: any): void {
    this.showSpotlight();
    this.mainWindow?.webContents.send('open-spotlight-mode', { mode, options });
  }

  public hideSpotlight(): void {
    if (!this.mainWindow || !this.mainWindow.isVisible()) return;
    this.mainWindow.webContents.send('window-hide-request');
    this.mainWindow.webContents.send('reset-spotlight');
    setTimeout(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        try {
          this.mainWindow.setAlwaysOnTop(false);
          this.mainWindow.blur();
        } catch {}
        this.mainWindow.hide();
      }
    }, 90);
  }

  public hideImmediately(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('window-hide-request');
    this.mainWindow.webContents.send('reset-spotlight');
    try {
      this.mainWindow.setAlwaysOnTop(false);
      this.mainWindow.blur();
    } catch {}
    this.mainWindow.hide();
  }

  public resetAndHideSpotlight(): void {
    this.hideImmediately();
  }

  public getMainWindowHandle(): number {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return 0;
    try {
      const handleBuffer = this.mainWindow.getNativeWindowHandle();
      return process.arch === 'x64' ? Number(handleBuffer.readBigInt64LE(0)) : handleBuffer.readInt32LE(0);
    } catch {
      return 0;
    }
  }

  public getLastShowTime(): number {
    return this.lastShowTime;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public getSettingsWindow(): BrowserWindow | null {
    return this.settingsWindow;
  }

  public openSettingsWindow(tab?: string): BrowserWindow {
    const hash = tab ? `settings?tab=${tab}` : 'settings';
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      if (this.settingsWindow.isMinimized()) this.settingsWindow.restore();
      if (tab) {
        this.settingsWindow.webContents.send('switch-settings-tab', tab);
      }
      this.settingsWindow.show();
      this.settingsWindow.focus();
      return this.settingsWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.settingsWindow = new BrowserWindow({
      width: 1100,
      height: 820,
      minWidth: 860,
      minHeight: 660,
      title: getWindowTitle('Nastavení'),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.registerCrashHandlers(this.settingsWindow, 'Nastavení');

    this.settingsWindow.on('maximize', () => {
      this.settingsWindow?.webContents.send('window-maximize-changed', true);
    });
    this.settingsWindow.on('unmaximize', () => {
      this.settingsWindow?.webContents.send('window-maximize-changed', false);
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      this.settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${hash}`);
    } else {
      this.settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash });
    }

    this.settingsWindow.once('ready-to-show', () => {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        if (tab) {
          this.settingsWindow.webContents.send('switch-settings-tab', tab);
        }
        this.settingsWindow.show();
        this.settingsWindow.focus();
      }
    });

    this.settingsWindow.on('closed', () => {
      this.settingsWindow = null;
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.showSpotlight();
        this.mainWindow.webContents.send('focus-input');
      }
    });

    return this.settingsWindow;
  }

  public getPowerWindow(): BrowserWindow | null {
    return this.powerWindow;
  }

  public closePowerWindow(): void {
    if (this.powerWindow && !this.powerWindow.isDestroyed()) {
      this.powerWindow.close();
    }
  }

  public openPowerWindow(): BrowserWindow {
    if (this.powerWindow && !this.powerWindow.isDestroyed()) {
      if (this.powerWindow.isMinimized()) this.powerWindow.restore();
      this.powerWindow.show();
      this.powerWindow.focus();
      return this.powerWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.powerWindow = new BrowserWindow({
      width: 440,
      height: 275,
      minWidth: 400,
      minHeight: 250,
      maxWidth: 480,
      maxHeight: 320,
      resizable: false,
      title: getWindowTitle('Správa aplikace'),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      this.powerWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#power`);
    } else {
      this.powerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'power' });
    }

    this.powerWindow.once('ready-to-show', () => {
      if (this.powerWindow && !this.powerWindow.isDestroyed()) {
        this.powerWindow.show();
        this.powerWindow.focus();
      }
    });

    this.powerWindow.on('closed', () => {
      this.powerWindow = null;
    });

    return this.powerWindow;
  }

  public getGitCloneWindow(): BrowserWindow | null {
    return this.gitCloneWindow;
  }

  public openGitCloneWindow(params: {
    repoName: string;
    repoUrl?: string;
    initialRecursive?: boolean;
    isInstanceMode?: boolean;
    adminUrl?: string;
    repoLanguage?: string;
  }): BrowserWindow {
    const isRecursive = Boolean(params.initialRecursive);
    const isInstanceMode = Boolean(params.isInstanceMode);
    const adminUrl = params.adminUrl || '';
    const repoLanguage = params.repoLanguage || '';

    const appConfig = this.getConfig ? this.getConfig() : null;
    const baseDir = appConfig?.github?.defaultCloneDir || '';
    let targetDir = baseDir;
    if (isInstanceMode && params.repoName && baseDir) {
      targetDir = `${baseDir.replace(/[\\/]+$/, '')}\\magicgate\\${params.repoName}`;
    }

    const query = new URLSearchParams({
      name: params.repoName || '',
      url: params.repoUrl || '',
      recursive: isRecursive ? '1' : '0',
      isInstanceMode: isInstanceMode ? '1' : '0',
      adminUrl,
      targetDir,
      repoLanguage,
    }).toString();

    const payload = {
      repoName: params.repoName || '',
      repoUrl: params.repoUrl || '',
      recursive: isRecursive,
      initialRecursive: isRecursive,
      isInstanceMode,
      adminUrl,
      targetDir,
      repoLanguage,
    };

    if (this.gitCloneWindow && !this.gitCloneWindow.isDestroyed()) {
      if (this.gitCloneWindow.isMinimized()) this.gitCloneWindow.restore();
      this.gitCloneWindow.show();
      this.gitCloneWindow.focus();
      this.gitCloneWindow.webContents.send('git-clone-params', payload);
      return this.gitCloneWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.gitCloneWindow = new BrowserWindow({
      width: 640,
      height: 560,
      minWidth: 540,
      minHeight: 480,
      title: isInstanceMode
        ? getWindowTitle(`Klonovat repozitáře instance (${params.repoName})`)
        : getWindowTitle(`Klonovat repozitář${params.repoName ? ` (${params.repoName})` : ''}`),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.gitCloneWindow.on('maximize', () => {
      this.gitCloneWindow?.webContents.send('window-maximize-changed', true);
    });
    this.gitCloneWindow.on('unmaximize', () => {
      this.gitCloneWindow?.webContents.send('window-maximize-changed', false);
    });

    this.shouldRestoreSpotlightOnCloneClose = true;
    this.shouldResetSpotlightOnCloneClose = false;

    if (process.env.VITE_DEV_SERVER_URL) {
      this.gitCloneWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#git-clone?${query}`);
    } else {
      this.gitCloneWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `git-clone?${query}` });
    }

    this.gitCloneWindow.once('ready-to-show', () => {
      if (this.gitCloneWindow && !this.gitCloneWindow.isDestroyed()) {
        this.gitCloneWindow.show();
        this.gitCloneWindow.focus();
        this.gitCloneWindow.webContents.send('git-clone-params', payload);
      }
    });

    this.gitCloneWindow.on('closed', () => {
      this.gitCloneWindow = null;
      if (this.shouldRestoreSpotlightOnCloneClose) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.showSpotlight();
          if (this.shouldResetSpotlightOnCloneClose) {
            this.mainWindow.webContents.send('reset-and-focus-spotlight');
            this.shouldResetSpotlightOnCloneClose = false;
          } else {
            this.mainWindow.webContents.send('focus-input');
          }
        }
      } else {
        this.shouldRestoreSpotlightOnCloneClose = true;
        this.shouldResetSpotlightOnCloneClose = false;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.hideSpotlight();
          this.mainWindow.webContents.send('reset-spotlight');
        }
      }
    });

    return this.gitCloneWindow;
  }

  public closeGitCloneWindow(): void {
    if (this.gitCloneWindow && !this.gitCloneWindow.isDestroyed()) {
      this.gitCloneWindow.close();
    }
  }

  public getCmsDownloadWindow(): BrowserWindow | null {
    return this.cmsDownloadWindow;
  }

  public closeCmsDownloadWindow(): void {
    if (this.cmsDownloadWindow && !this.cmsDownloadWindow.isDestroyed()) {
      this.cmsDownloadWindow.close();
    }
  }

  public openCmsDownloadWindow(params: {
    instanceName: string;
    adminUrl: string;
    targetDir: string;
  }): BrowserWindow {
    const query = new URLSearchParams({
      instanceName: params.instanceName,
      adminUrl: params.adminUrl,
      targetDir: params.targetDir,
    }).toString();

    const payload = {
      instanceName: params.instanceName,
      adminUrl: params.adminUrl,
      targetDir: params.targetDir,
    };

    if (this.cmsDownloadWindow && !this.cmsDownloadWindow.isDestroyed()) {
      if (this.cmsDownloadWindow.isMinimized()) this.cmsDownloadWindow.restore();
      this.cmsDownloadWindow.show();
      this.cmsDownloadWindow.focus();
      this.cmsDownloadWindow.webContents.send('cms-download-params', payload);
      return this.cmsDownloadWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.cmsDownloadWindow = new BrowserWindow({
      width: 640,
      height: 620,
      minWidth: 540,
      minHeight: 520,
      title: getWindowTitle(`Stažení CMSinFS zdrojáků (${params.instanceName})`),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.cmsDownloadWindow.on('maximize', () => {
      this.cmsDownloadWindow?.webContents.send('window-maximize-changed', true);
    });
    this.cmsDownloadWindow.on('unmaximize', () => {
      this.cmsDownloadWindow?.webContents.send('window-maximize-changed', false);
    });

    this.shouldRestoreSpotlightOnCmsDownloadClose = true;
    this.shouldResetSpotlightOnCmsDownloadClose = false;

    if (process.env.VITE_DEV_SERVER_URL) {
      this.cmsDownloadWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#cms-download?${query}`);
    } else {
      this.cmsDownloadWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: `cms-download?${query}` });
    }

    this.cmsDownloadWindow.once('ready-to-show', () => {
      if (this.cmsDownloadWindow && !this.cmsDownloadWindow.isDestroyed()) {
        this.cmsDownloadWindow.show();
        this.cmsDownloadWindow.focus();
        this.cmsDownloadWindow.webContents.send('cms-download-params', payload);
      }
    });

    this.cmsDownloadWindow.on('closed', () => {
      this.cmsDownloadWindow = null;
      if (this.shouldRestoreSpotlightOnCmsDownloadClose) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.showSpotlight();
          if (this.shouldResetSpotlightOnCmsDownloadClose) {
            this.mainWindow.webContents.send('reset-and-focus-spotlight');
            this.shouldResetSpotlightOnCmsDownloadClose = false;
          } else {
            this.mainWindow.webContents.send('focus-input');
          }
        }
      } else {
        this.shouldRestoreSpotlightOnCmsDownloadClose = true;
        this.shouldResetSpotlightOnCmsDownloadClose = false;
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.hideSpotlight();
          this.mainWindow.webContents.send('reset-spotlight');
        }
      }
    });

    return this.cmsDownloadWindow;
  }

  public getTuneColorWindow(): BrowserWindow | null {
    return this.tuneColorWindow;
  }

  public closeTuneColorWindow(): void {
    if (this.tuneColorWindow && !this.tuneColorWindow.isDestroyed()) {
      this.tuneColorWindow.close();
    }
  }

  public openTuneColorWindow(params: { initialColor: string; source?: string; slotIndex?: number }): BrowserWindow {
    const initialColor = params.initialColor || '#6366f1';
    const source = params.source || 'spotlight';
    const slotStr = params.slotIndex !== undefined ? String(params.slotIndex) : '';
    const query = new URLSearchParams({ color: initialColor, source, slotIndex: slotStr }).toString();

    if (this.tuneColorWindow && !this.tuneColorWindow.isDestroyed()) {
      if (this.tuneColorWindow.isMinimized()) this.tuneColorWindow.restore();
      this.tuneColorWindow.show();
      this.tuneColorWindow.focus();
      this.tuneColorWindow.webContents.send('tune-color-init', { color: initialColor, source, slotIndex: params.slotIndex });
      return this.tuneColorWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.tuneColorWindow = new BrowserWindow({
      width: 540,
      height: 640,
      minWidth: 480,
      minHeight: 460,
      maxWidth: 720,
      maxHeight: 850,
      resizable: true,
      title: getWindowTitle('Doladění barvy'),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.tuneColorWindow.on('maximize', () => {
      this.tuneColorWindow?.webContents.send('window-maximize-changed', true);
    });
    this.tuneColorWindow.on('unmaximize', () => {
      this.tuneColorWindow?.webContents.send('window-maximize-changed', false);
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      this.tuneColorWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${query}#tune-color`);
    } else {
      this.tuneColorWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'tune-color',
        search: query,
      });
    }

    this.tuneColorWindow.once('ready-to-show', () => {
      if (this.tuneColorWindow && !this.tuneColorWindow.isDestroyed()) {
        this.tuneColorWindow.show();
        this.tuneColorWindow.focus();
      }
    });

    this.tuneColorWindow.on('closed', () => {
      this.tuneColorWindow = null;
    });

    return this.tuneColorWindow;
  }

  public getPaletteBarWindow(): BrowserWindow | null {
    return this.paletteBarWindow;
  }

  public closePaletteBarWindow(): void {
    if (this.paletteBarWindow && !this.paletteBarWindow.isDestroyed()) {
      this.paletteBarWindow.close();
      this.paletteBarWindow = null;
    }
  }

  public openPaletteBarWindow(paletteId: string, paletteName: string): BrowserWindow {
    const primaryDisplay = screen.getPrimaryDisplay();
    const bounds = primaryDisplay.workArea;
    const barWidth = 960;
    const barHeight = 84;
    const x = Math.round(bounds.x + (bounds.width - barWidth) / 2);
    const y = Math.round(bounds.y + 20);

    const query = new URLSearchParams({
      window: 'palette-bar',
      paletteId: paletteId || '',
      paletteName: paletteName || '',
    }).toString();

    if (this.paletteBarWindow && !this.paletteBarWindow.isDestroyed()) {
      this.paletteBarWindow.setBounds({ x, y, width: barWidth, height: barHeight });
      if (this.paletteBarWindow.isMinimized()) this.paletteBarWindow.restore();
      this.paletteBarWindow.show();
      this.paletteBarWindow.focus();
      this.paletteBarWindow.webContents.send('palette-bar-init', { paletteId, paletteName });
      return this.paletteBarWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.paletteBarWindow = new BrowserWindow({
      x,
      y,
      width: barWidth,
      height: barHeight,
      title: getWindowTitle('PaletteBar'),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.paletteBarWindow.setAlwaysOnTop(true, 'screen-saver');

    if (process.env.VITE_DEV_SERVER_URL) {
      this.paletteBarWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${query}#palette-bar`);
    } else {
      this.paletteBarWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'palette-bar',
        search: query,
      });
    }

    this.paletteBarWindow.once('ready-to-show', () => {
      this.paletteBarWindow?.show();
      this.paletteBarWindow?.focus();
    });

    this.paletteBarWindow.on('closed', () => {
      this.paletteBarWindow = null;
    });

    return this.paletteBarWindow;
  }

  public getPaletteDetailWindow(): BrowserWindow | null {
    return this.paletteDetailWindow;
  }

  public closePaletteDetailWindow(): void {
    if (this.paletteDetailWindow && !this.paletteDetailWindow.isDestroyed()) {
      this.paletteDetailWindow.close();
      this.paletteDetailWindow = null;
    }
  }

  public openPaletteDetailWindow(paletteId: string): BrowserWindow {
    const query = new URLSearchParams({
      window: 'palette-detail',
      paletteId: paletteId || '',
    }).toString();

    if (this.paletteDetailWindow && !this.paletteDetailWindow.isDestroyed()) {
      if (this.paletteDetailWindow.isMinimized()) this.paletteDetailWindow.restore();
      this.paletteDetailWindow.show();
      this.paletteDetailWindow.focus();
      this.paletteDetailWindow.webContents.send('palette-detail-init', { paletteId });
      return this.paletteDetailWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.paletteDetailWindow = new BrowserWindow({
      width: 640,
      height: 560,
      minWidth: 540,
      minHeight: 460,
      resizable: true,
      title: getWindowTitle('PaletteMaster'),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      this.paletteDetailWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${query}#palette-detail`);
    } else {
      this.paletteDetailWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'palette-detail',
        search: query,
      });
    }

    this.paletteDetailWindow.once('ready-to-show', () => {
      this.paletteDetailWindow?.show();
      this.paletteDetailWindow?.focus();
    });

    this.paletteDetailWindow.on('closed', () => {
      this.paletteDetailWindow = null;
    });

    return this.paletteDetailWindow;
  }

  public getMagicPlanWindow(): BrowserWindow | null {
    return this.magicPlanWindow;
  }

  public closeMagicPlanWindow(): void {
    if (this.magicPlanWindow && !this.magicPlanWindow.isDestroyed()) {
      this.magicPlanWindow.hide();
    }
  }

  public async openMagicPlanWindow(): Promise<BrowserWindow> {
    const query = new URLSearchParams({
      window: 'magicplan',
    }).toString();

    if (this.magicPlanWindow && !this.magicPlanWindow.isDestroyed()) {
      if (this.magicPlanWindow.isMinimized()) this.magicPlanWindow.restore();
      this.magicPlanWindow.show();
      this.magicPlanWindow.focus();
      return this.magicPlanWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.magicPlanWindow = new BrowserWindow({
      width: 1080,
      height: 740,
      minWidth: 780,
      minHeight: 520,
      resizable: true,
      title: getWindowTitle('MagicPlan'),
      icon: getAppIcon(),
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false,
      skipTaskbar: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.registerCrashHandlers(this.magicPlanWindow, 'MagicPlan');

    if (process.env.VITE_DEV_SERVER_URL) {
      this.magicPlanWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?${query}#magicplan`);
    } else {
      this.magicPlanWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'magicplan',
        search: query,
      });
    }

    // Intercept close to hide window instead of destroying it (instant re-opening)
    this.magicPlanWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.magicPlanWindow?.hide();
      }
    });

    this.magicPlanWindow.on('closed', () => {
      this.magicPlanWindow = null;
    });

    return new Promise<BrowserWindow>((resolve) => {
      let resolved = false;
      const onReady = () => {
        if (!resolved) {
          resolved = true;
          this.magicPlanWindow?.show();
          this.magicPlanWindow?.focus();
          resolve(this.magicPlanWindow!);
        }
      };

      this.magicPlanWindow?.once('ready-to-show', onReady);

      // Fallback safeguard in case ready-to-show was delayed
      setTimeout(() => {
        onReady();
      }, 4000);
    });
  }

  public getSnipperWindow(): BrowserWindow | null {
    return this.snipperWindow;
  }

  public closeSnipperWindow(): void {
    if (this.snipperWindow && !this.snipperWindow.isDestroyed()) {
      this.snipperWindow.webContents.send('quickcap-cleanup');
      this.snipperWindow.webContents.send('fastsnap-cleanup');
      this.snipperWindow.hide();
    }
  }

  public createSnipperWindow(
    displayBounds: { x: number; y: number; width: number; height: number },
    screenshotUrl: string,
    scaleFactor: number
  ): BrowserWindow {
    const applyFullScreenAndShow = (win: BrowserWindow) => {
      win.setBounds(displayBounds);
      win.setAlwaysOnTop(true, 'screen-saver');
      const initPayload = {
        screenshotUrl,
        width: displayBounds.width,
        height: displayBounds.height,
        scaleFactor,
      };
      // Poslat data před zobrazením okna pro plynulé navázání
      win.webContents.send('quickcap-init-data', initPayload);
      win.webContents.send('fastsnap-init-data', initPayload);
      win.show();
      win.focus();
    };

    if (this.snipperWindow && !this.snipperWindow.isDestroyed()) {
      applyFullScreenAndShow(this.snipperWindow);
      return this.snipperWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.snipperWindow = new BrowserWindow({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height,
      title: getWindowTitle('QuickCap'),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      fullscreen: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    this.snipperWindow.setAlwaysOnTop(true, 'screen-saver');

    if (process.env.VITE_DEV_SERVER_URL) {
      this.snipperWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#quickcap`);
    } else {
      this.snipperWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'quickcap',
      });
    }

    this.snipperWindow.once('ready-to-show', () => {
      if (this.snipperWindow && !this.snipperWindow.isDestroyed()) {
        applyFullScreenAndShow(this.snipperWindow);
      }
    });

    this.snipperWindow.on('closed', () => {
      this.snipperWindow = null;
    });

    return this.snipperWindow;
  }

  public setOnScreenRulerRequest(cb: () => void): void {
    this.onScreenRulerRequest = cb;
  }

  public getRulerWindow(): BrowserWindow | null {
    return this.rulerWindow;
  }

  public closeScreenRulerWindow(): void {
    if (this.rulerWindow && !this.rulerWindow.isDestroyed()) {
      this.rulerWindow.webContents.send('screenruler-cleanup');
      this.rulerWindow.hide();
    }
  }

  public openScreenRulerWindow(
    displayBounds: { x: number; y: number; width: number; height: number },
    options?: { color?: string; defaultUnit?: string }
  ): BrowserWindow {
    const applyFullScreenAndShow = (win: BrowserWindow) => {
      win.setBounds({
        x: displayBounds.x,
        y: displayBounds.y,
        width: displayBounds.width,
        height: displayBounds.height - 1,
      });
      win.setAlwaysOnTop(true);
      const initPayload = {
        width: displayBounds.width,
        height: displayBounds.height,
        color: options?.color || '#f43f5e',
        defaultUnit: options?.defaultUnit || 'px',
      };
      win.webContents.send('screenruler-init', initPayload);
      win.show();
      win.focus();
    };

    if (this.rulerWindow && !this.rulerWindow.isDestroyed()) {
      applyFullScreenAndShow(this.rulerWindow);
      return this.rulerWindow;
    }

    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    this.rulerWindow = new BrowserWindow({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height - 1,
      title: getWindowTitle('ScreenRuler'),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      fullscreen: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    this.rulerWindow.setAlwaysOnTop(true);

    if (process.env.VITE_DEV_SERVER_URL) {
      this.rulerWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#ruler`);
    } else {
      this.rulerWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
        hash: 'ruler',
      });
    }

    this.rulerWindow.once('ready-to-show', () => {
      if (this.rulerWindow && !this.rulerWindow.isDestroyed()) {
        applyFullScreenAndShow(this.rulerWindow);
      }
    });

    this.rulerWindow.on('closed', () => {
      this.rulerWindow = null;
    });

    return this.rulerWindow;
  }

  public createInstallerWindow(): BrowserWindow {
    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    const win = new BrowserWindow({
      width: 940,
      height: 640,
      minWidth: 880,
      minHeight: 590,
      resizable: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: getAppIcon(),
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#installer`);
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'installer' });
    }

    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });

    win.on('closed', () => {
      app.quit();
    });

    return win;
  }

  public createUninstallerWindow(): BrowserWindow {
    const preloadPath = fs.existsSync(path.join(__dirname, 'preload.cjs'))
      ? path.join(__dirname, 'preload.cjs')
      : fs.existsSync(path.join(__dirname, 'preload.mjs'))
      ? path.join(__dirname, 'preload.mjs')
      : path.join(__dirname, 'preload.js');

    const win = new BrowserWindow({
      width: 480,
      height: 320,
      resizable: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: getAppIcon(),
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.VITE_DEV_SERVER_URL) {
      win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#uninstall`);
    } else {
      win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'uninstall' });
    }

    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });

    win.on('closed', () => {
      app.quit();
    });

    return win;
  }

  public createTray(hotkeyLabel: string): void {
    // Unified minimalist Donkey icon with violet border in a rounded squircle
    const trayCandidates = [
      path.join(__dirname, '../electron/assets/tray-icon.png'),
      path.join(__dirname, 'assets/tray-icon.png'),
      path.join(__dirname, '../electron/assets/icon.png'),
      path.join(__dirname, 'assets/icon.png'),
      path.join(process.resourcesPath || '', 'app.asar/electron/assets/tray-icon.png'),
      path.join(process.resourcesPath || '', 'app.asar/dist-electron/assets/tray-icon.png'),
      path.join(process.resourcesPath || '', 'app.asar/electron/assets/icon.png'),
    ];

    let iconImage: ReturnType<typeof nativeImage.createFromPath> | null = null;
    for (const c of trayCandidates) {
      if (fs.existsSync(c)) {
        try {
          const loaded = nativeImage.createFromPath(c).resize({ width: 18, height: 18 });
          if (!loaded.isEmpty()) {
            iconImage = loaded;
            break;
          }
        } catch {}
      }
    }

    if (!iconImage || iconImage.isEmpty()) {
      const TRAY_ICON_PNG_B64 =
        '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';
      iconImage = nativeImage
        .createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG_B64}`)
        .resize({ width: 18, height: 18 });
    }

    this.tray = new Tray(iconImage);
    this.updateTrayContextMenu(hotkeyLabel);

    this.tray.on('click', () => this.showSpotlight());
    this.tray.on('double-click', () => this.showSpotlight());
  }

  private currentTrayHotkeyLabel = 'Ctrl+Alt+Space';

  public updateTrayContextMenu(hotkeyLabel?: string): void {
    if (hotkeyLabel) {
      this.currentTrayHotkeyLabel = hotkeyLabel;
    }
    const label = this.currentTrayHotkeyLabel;

    if (!this.tray || this.tray.isDestroyed()) {
      return;
    }

    this.tray.setToolTip(isDevMode ? `IADonkey [DEV] (${label})` : `IADonkey Launcher (${label})`);

    const config = this.getConfig ? this.getConfig() : null;
    const isDonkeyToolsEnabled = Boolean(config?.extensions?.donkeyTools);

    const isQuickCapEnabled = Boolean(
      isDonkeyToolsEnabled &&
        (config?.donkeyTools?.quickCap?.enabled === true || config?.donkeyTools?.fastSnap?.enabled === true)
    );
    const isColorMasterEnabled = Boolean(
      isDonkeyToolsEnabled && config?.donkeyTools?.colorMaster?.enabled === true
    );
    const isScreenRulerEnabled = Boolean(
      isDonkeyToolsEnabled && config?.donkeyTools?.screenRuler?.enabled === true
    );
    const isEasyClipEnabled = Boolean(
      isDonkeyToolsEnabled && config?.donkeyTools?.easyClip?.enabled === true
    );

    const template: Electron.MenuItemConstructorOptions[] = [];

    if (isDevMode) {
      template.push(
        {
          label: 'IADonkey [DEV REŽIM]',
          enabled: false,
        },
        { type: 'separator' }
      );
    }

    template.push(
      {
        label: `Hledat (${label})`,
        click: () => this.showSpotlight(),
      },
      {
        label: 'Nastavení...',
        click: () => {
          this.openSettingsWindow();
        },
      },
      {
        label: 'Synchronizovat data',
        click: () => this.onSyncRequest(),
      },
    );

    const isMagicPlanEnabled = Boolean(config?.extensions?.magicplan);

    const hasAnyTool = isQuickCapEnabled || isColorMasterEnabled || isScreenRulerEnabled || isEasyClipEnabled;

    if (isMagicPlanEnabled) {
      template.push({ type: 'separator' });
      template.push({
        label: 'MagicPlan – Plánování a úkoly',
        click: () => {
          this.openMagicPlanWindow();
        },
      });
    }

    if (hasAnyTool) {
      template.push({ type: 'separator' });

      if (isQuickCapEnabled) {
        const qcHotkey = config?.donkeyTools?.quickCap?.hotkey || config?.donkeyTools?.fastSnap?.hotkey;
        const qcLabel = qcHotkey ? `QuickCap – Výstřižek obrazovky (${qcHotkey})` : 'QuickCap – Výstřižek obrazovky';
        template.push({
          label: qcLabel,
          click: () => {
            this.onQuickCapRequest?.();
          },
        });
      }

      if (isColorMasterEnabled) {
        const cmHotkey = config?.donkeyTools?.colorMaster?.hotkey;
        const cmLabel = cmHotkey ? `Eyedropper – Kapátko (${cmHotkey})` : 'Eyedropper – Kapátko (nabrat barvu)';
        template.push({
          label: cmLabel,
          click: () => {
            this.onColorPickerRequest?.();
          },
        });

        const pmHotkey = config?.donkeyTools?.colorMaster?.paletteHotkey;
        const pmLabel = pmHotkey ? `PaletteMaster – Barevné palety (${pmHotkey})` : 'PaletteMaster – Barevné palety';
        template.push({
          label: pmLabel,
          click: () => {
            this.showSpotlightWithMode('palette');
          },
        });
      }

      if (isScreenRulerEnabled) {
        const srHotkey = config?.donkeyTools?.screenRuler?.hotkey;
        const srLabel = srHotkey ? `ScreenRuler – Měřítko a pravítko (${srHotkey})` : 'ScreenRuler – Měřítko a pravítko';
        template.push({
          label: srLabel,
          click: () => {
            this.onScreenRulerRequest?.();
          },
        });
      }

      if (isEasyClipEnabled) {
        const ecHotkey = config?.donkeyTools?.easyClip?.hotkey;
        const ecLabel = ecHotkey ? `EasyClip – Historie schránky (${ecHotkey})` : 'EasyClip – Historie schránky';
        template.push({
          label: ecLabel,
          click: () => {
            this.onEasyClipRequest?.();
          },
        });
      }
    }

    template.push(
      { type: 'separator' },
      {
        label: isDevMode ? 'Ukončit IADonkey [DEV]' : 'Ukončit IADonkey',
        click: () => {
          this.isQuitting = true;
          app.quit();
        },
      }
    );

    const contextMenu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(contextMenu);
  }

  public updateTrayTooltip(hotkeyLabel: string): void {
    this.currentTrayHotkeyLabel = hotkeyLabel;
    this.updateTrayContextMenu(hotkeyLabel);
  }

  public setQuitting(val: boolean): void {
    this.isQuitting = val;
  }

  public createSplashWindow(version: string = '1.1.16'): BrowserWindow {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      return this.splashWindow;
    }

    this.splashWindow = new BrowserWindow({
      width: 480,
      height: 440,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: getAppIcon(),
      show: false,
      center: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const iconDataUrl = getAppIconBase64();
    const splashHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100vw;
    height: 100vh;
    background: transparent;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 36px;
    user-select: none;
    -webkit-user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  }
  .card {
    width: 100%;
    height: 100%;
    background-color: #15161c;
    border-radius: 20px;
    border: none;
    outline: none;
    box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.35), 0 4px 12px -2px rgba(0, 0, 0, 0.2), 0 0 1px 0 rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 32px 36px 28px 36px;
    text-align: left;
    -webkit-app-region: drag;
  }
  .icon {
    width: 60px;
    height: 60px;
    object-fit: contain;
    margin-bottom: 16px;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.45));
  }
  .header-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .title {
    font-size: 26px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.4px;
    line-height: 1.15;
  }
  .version-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 9999px;
    background-color: ${isDevMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.18)'};
    color: ${isDevMode ? '#fcd34d' : '#a5b4fc'};
    font-size: 11px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 0.5px;
    white-space: nowrap;
    flex-shrink: 0;
    border: none;
    outline: none;
  }
  .spacer {
    flex: 1;
    min-height: 14px;
  }
  .description {
    font-size: 12px;
    line-height: 1.55;
    color: #94a3b8;
    margin-bottom: 34px;
  }
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-size: 11px;
    color: #64748b;
    letter-spacing: 0.2px;
  }
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #818cf8;
    font-weight: 500;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #818cf8;
    animation: pulse 1.8s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.9); }
    50% { opacity: 1; transform: scale(1.1); }
  }
</style>
</head>
<body>
  <div class="card">
    ${iconDataUrl ? `<img class="icon" src="${iconDataUrl}" alt="IADonkey" />` : ''}
    <div class="header-row">
      <div class="title">IADonkey</div>
      <div class="version-badge">v${isDevMode && !version.endsWith('dev') ? `${version} dev` : version}</div>
    </div>
    <div class="spacer"></div>
    <div class="description">
      Rychlý a inteligentní spouštěč pro vaše každodenní úkoly a produktivitu. Sjednocuje vyhledávání, pracovní nástroje a automatizaci do jednoho přehledného prostředí.
    </div>
    <div class="footer">
      <div>© 2026 Petr Coolhanek</div>
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span>Spouštění...</span>
      </div>
    </div>
  </div>
</body>
</html>`;

    this.splashWindow.once('ready-to-show', () => {
      if (this.splashWindow && !this.splashWindow.isDestroyed()) {
        this.splashWindow.show();
        this.splashWindow.setAlwaysOnTop(true, 'screen-saver');
        this.splashWindow.focus();
      }
    });

    this.splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

    return this.splashWindow;
  }

  public whenSplashReady(): Promise<void> {
    if (!this.splashWindow || this.splashWindow.isDestroyed()) {
      return Promise.resolve();
    }
    if (this.splashWindow.isVisible()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      if (!this.splashWindow || this.splashWindow.isDestroyed()) {
        resolve();
        return;
      }
      let resolved = false;
      const onReady = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      this.splashWindow.once('ready-to-show', onReady);
      // Safety fallback: ensure splash is displayed and resolved within 800ms
      setTimeout(() => {
        if (!resolved) {
          if (this.splashWindow && !this.splashWindow.isDestroyed() && !this.splashWindow.isVisible()) {
            this.splashWindow.show();
            this.splashWindow.setAlwaysOnTop(true, 'screen-saver');
            this.splashWindow.focus();
          }
          onReady();
        }
      }, 800);
    });
  }

  public updateSplashStatus(percent: number, text: string): void {
    this.lastSplashStatus = { percent, text };
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send('splash-status', this.lastSplashStatus);
    }
  }

  public getLastSplashStatus(): { percent: number; text: string } {
    return this.lastSplashStatus;
  }

  public async closeSplashWindow(delayMs = 0): Promise<void> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      if (this.splashWindow && !this.splashWindow.isDestroyed()) {
        this.splashWindow.destroy();
        this.splashWindow = null;
      }
    } catch {}
  }

  public prepareForQuitOrRestart(): void {
    this.isQuitting = true;
    try {
      if (this.splashWindow && !this.splashWindow.isDestroyed()) {
        this.splashWindow.destroy();
        this.splashWindow = null;
      }
    } catch {}
    try {
      if (this.snipperWindow && !this.snipperWindow.isDestroyed()) {
        this.snipperWindow.destroy();
        this.snipperWindow = null;
      }
    } catch {}
    try {
      if (this.tuneColorWindow && !this.tuneColorWindow.isDestroyed()) {
        this.tuneColorWindow.destroy();
        this.tuneColorWindow = null;
      }
    } catch {}
    try {
      if (this.rulerWindow && !this.rulerWindow.isDestroyed()) {
        this.rulerWindow.destroy();
        this.rulerWindow = null;
      }
    } catch {}
    try {
      if (this.tray && !this.tray.isDestroyed()) {
        this.tray.destroy();
        this.tray = null;
      }
    } catch {}
    try {
      if (this.gitCloneWindow && !this.gitCloneWindow.isDestroyed()) {
        this.gitCloneWindow.destroy();
        this.gitCloneWindow = null;
      }
    } catch {}
    try {
      if (this.magicPlanWindow && !this.magicPlanWindow.isDestroyed()) {
        this.magicPlanWindow.removeAllListeners('close');
        this.magicPlanWindow.destroy();
        this.magicPlanWindow = null;
      }
    } catch {}
    try {
      if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
        this.settingsWindow.destroy();
        this.settingsWindow = null;
      }
    } catch {}
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.removeAllListeners('close');
        this.mainWindow.destroy();
        this.mainWindow = null;
      }
    } catch {}
  }
}
