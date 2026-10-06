import { contextBridge, ipcRenderer } from 'electron';
import { AppConfig, LauncherItem, UpdateInfo, ActionLogEntry, CrashLogEntry, EasyClipItem } from '../src/types';

contextBridge.exposeInMainWorld('electronAPI', {
  downloadMaterialIcons: (): Promise<any> => ipcRenderer.invoke('download-material-icons'),
  getMaterialIcons: (): Promise<any> => ipcRenderer.invoke('get-material-icons'),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig): Promise<void> => ipcRenderer.invoke('save-config', config),
  getItems: (): Promise<LauncherItem[]> => ipcRenderer.invoke('get-items'),
  syncNow: (): Promise<LauncherItem[]> => ipcRenderer.invoke('sync-now'),
  selectJsonFile: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('select-json-file', defaultPath),
  selectXmlFile: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('select-xml-file', defaultPath),
  inspectSource: (source: any): Promise<{ keys: string[]; sample: any }> =>
    ipcRenderer.invoke('inspect-source', source),
  executeAction: (data: { action: string; location: string; settings?: string | null; autoPaste?: boolean; sourceId?: string }): Promise<void> =>
    ipcRenderer.invoke('execute-action', data),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke('open-path', path),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('hide-window'),
  resetAndHideSpotlight: (): Promise<void> => ipcRenderer.invoke('reset-and-hide-spotlight'),
  openSettingsWindow: (tab?: string): Promise<void> => ipcRenderer.invoke('open-settings-window', tab),
  openPowerWindow: (): Promise<void> => ipcRenderer.invoke('open-power-window'),
  closePowerWindow: (): Promise<void> => ipcRenderer.invoke('close-power-window'),
  restartApp: (): Promise<void> => ipcRenderer.invoke('restart-app'),
  quitApp: (): Promise<void> => ipcRenderer.invoke('quit-app'),
  openGitCloneWindow: (params: { repoName: string; repoUrl?: string; initialRecursive?: boolean; isInstanceMode?: boolean; adminUrl?: string; targetDir?: string }): Promise<void> =>
    ipcRenderer.invoke('open-git-clone-window', params),
  checkUpdate: (): Promise<UpdateInfo> => ipcRenderer.invoke('check-update'),
  downloadUpdate: (downloadUrl: string): Promise<string> => ipcRenderer.invoke('download-update', downloadUrl),
  installUpdate: (filePath: string): Promise<void> => ipcRenderer.invoke('install-update', filePath),
  pauseGlobalHotkey: (): Promise<void> => ipcRenderer.invoke('pause-global-hotkey'),
  resumeGlobalHotkey: (): Promise<void> => ipcRenderer.invoke('resume-global-hotkey'),
  fetchFaviconForUrl: (url: string): Promise<string | null> => ipcRenderer.invoke('fetch-favicon-for-url', url),
  testGitHubConnection: (settings: any): Promise<any> => ipcRenderer.invoke('test-github-connection', settings),
  startGitHubDeviceFlow: (params: any): Promise<any> => ipcRenderer.invoke('github-oauth-start-device-flow', params),
  pollGitHubDeviceToken: (params: any): Promise<any> => ipcRenderer.invoke('github-oauth-poll-token', params),
  selectDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('select-directory', defaultPath),
  runGitClone: (params: { repoUrl: string; targetDir: string; recursive?: boolean }): Promise<{ success: boolean; targetPath: string; output?: string; error?: string; alreadyExists?: boolean }> =>
    ipcRenderer.invoke('run-git-clone', params),
  openInVscode: (folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-in-vscode', folderPath),
  selectVscodePath: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('select-vscode-path', defaultPath),
  detectVscodePath: (): Promise<string | null> => ipcRenderer.invoke('detect-vscode-path'),
  openInAndroidStudio: (folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-in-android-studio', folderPath),
  selectAndroidStudioPath: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('select-android-studio-path', defaultPath),
  detectAndroidStudioPath: (): Promise<string | null> => ipcRenderer.invoke('detect-android-studio-path'),
  isAndroidProject: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('is-android-project', folderPath),
  getExistingClonedRepos: (baseDir?: string): Promise<string[]> => ipcRenderer.invoke('get-existing-cloned-repos', baseDir),
  fetchInstanceRepos: (adminUrl: string): Promise<{ ok: boolean; repos: any[]; rawJson?: string; error?: string }> =>
    ipcRenderer.invoke('magicgate-get-repos', { adminUrl }),
  runMultiRepoClone: (params: { repos: any[]; targetDir: string; recursive?: boolean; rawJson?: string }): Promise<{ success: boolean; targetPath: string; error?: string; alreadyExists?: boolean }> =>
    ipcRenderer.invoke('magicgate-clone-start', params),
  downloadInstanceCmsContent: (params: { instanceName?: string; adminUrl: string; targetDir?: string }): Promise<{ success: boolean; targetPath?: string; error?: string; fileCount?: number }> =>
    ipcRenderer.invoke('magicgate-download-cms-content', params),
  openCmsDownloadWindow: (params: { instanceName: string; adminUrl: string; targetDir: string }): Promise<void> =>
    ipcRenderer.invoke('open-cms-download-window', params),
  closeCmsDownloadWindow: (restoreSpotlight: boolean = false): Promise<void> =>
    ipcRenderer.invoke('close-cms-download-window', restoreSpotlight),
  closeAndResetSpotlight: (): Promise<void> => ipcRenderer.invoke('close-and-reset-spotlight'),
  onMagicGateCloneProgress: (callback: (data: { current: number; total: number; repoName: string; log: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('magicgate-clone-progress', handler);
    return () => ipcRenderer.removeListener('magicgate-clone-progress', handler);
  },
  onCmsDownloadProgress: (callback: (data: { step: string; percent?: number; loadedBytes?: number; totalBytes?: number; log?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('magicgate-download-cms-progress', handler);
    return () => ipcRenderer.removeListener('magicgate-download-cms-progress', handler);
  },
  onCmsDownloadParams: (callback: (params: { instanceName: string; adminUrl: string; targetDir: string }) => void) => {
    const handler = (_event: any, params: any) => callback(params);
    ipcRenderer.on('cms-download-params', handler);
    return () => ipcRenderer.removeListener('cms-download-params', handler);
  },
  onGitCloneParams: (callback: (params: { repoName: string; repoUrl?: string; recursive?: boolean; initialRecursive?: boolean; isInstanceMode?: boolean; adminUrl?: string }) => void) => {
    const handler = (_event: any, params: any) => callback(params);
    ipcRenderer.on('git-clone-params', handler);
    return () => ipcRenderer.removeListener('git-clone-params', handler);
  },

  // Event subscriptions from main process
  onDataUpdated: (callback: (items: LauncherItem[]) => void) => {
    const handler = (_event: any, items: LauncherItem[]) => callback(items);
    ipcRenderer.on('data-updated', handler);
    return () => ipcRenderer.removeListener('data-updated', handler);
  },

  onConfigUpdated: (callback: (config: AppConfig) => void) => {
    const handler = (_event: any, config: AppConfig) => callback(config);
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },

  onOpenSettingsRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings', handler);
    return () => ipcRenderer.removeListener('open-settings', handler);
  },

  onSwitchSettingsTab: (callback: (tab: string) => void) => {
    const handler = (_event: any, tab: string) => callback(tab);
    ipcRenderer.on('switch-settings-tab', handler);
    return () => ipcRenderer.removeListener('switch-settings-tab', handler);
  },

  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
    const handler = (_event: any, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  onUpdateDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },

  onWindowShown: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-shown', handler);
    return () => ipcRenderer.removeListener('window-shown', handler);
  },

  onWindowHideRequest: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-hide-request', handler);
    return () => ipcRenderer.removeListener('window-hide-request', handler);
  },

  onSyncProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('sync-progress', handler);
    return () => ipcRenderer.removeListener('sync-progress', handler);
  },

  getSearchEngineFavicons: (): Promise<Record<string, string>> => ipcRenderer.invoke('get-search-engine-favicons'),
  onSearchEngineFaviconsUpdated: (callback: (favicons: Record<string, string>) => void) => {
    const handler = (_event: any, favicons: Record<string, string>) => callback(favicons);
    ipcRenderer.on('search-engine-favicons-updated', handler);
    return () => ipcRenderer.removeListener('search-engine-favicons-updated', handler);
  },

  onFocusInput: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('focus-input', handler);
    return () => ipcRenderer.removeListener('focus-input', handler);
  },

  onResetSpotlight: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('reset-spotlight', handler);
    return () => ipcRenderer.removeListener('reset-spotlight', handler);
  },

  onResetAndFocusSpotlight: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('reset-and-focus-spotlight', handler);
    return () => ipcRenderer.removeListener('reset-and-focus-spotlight', handler);
  },

  onTriggerEyedropper: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-eyedropper', handler);
    return () => ipcRenderer.removeListener('trigger-eyedropper', handler);
  },

  pickScreenColor: (options?: { noClipboard?: boolean; noSpotlight?: boolean }): Promise<string | null> =>
    ipcRenderer.invoke('pick-screen-color', options),

  onColorPickedGlobal: (callback: (data: { color: string; formatted: string }) => void) => {
    const handler = (_event: any, data: { color: string; formatted: string }) => callback(data);
    ipcRenderer.on('color-picked-global', handler);
    return () => ipcRenderer.removeListener('color-picked-global', handler);
  },

  openTuneColorWindow: (params: { initialColor: string; source?: 'spotlight' | 'palette' | 'dev'; slotIndex?: number }): Promise<void> =>
    ipcRenderer.invoke('open-tune-color-window', params),

  saveTuneColor: (color: string): Promise<void> =>
    ipcRenderer.invoke('save-tune-color', color),

  closeTuneColorWindow: (): Promise<void> =>
    ipcRenderer.invoke('close-tune-color-window'),

  onTuneColorApplied: (callback: (data: { color: string; slotIndex?: number }) => void) => {
    const handler = (_event: any, data: { color: string; slotIndex?: number }) => callback(data);
    ipcRenderer.on('tune-color-applied', handler);
    return () => ipcRenderer.removeListener('tune-color-applied', handler);
  },

  onTuneColorInit: (callback: (data: { color: string; source?: 'spotlight' | 'palette' | 'dev'; slotIndex?: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('tune-color-init', handler);
    return () => ipcRenderer.removeListener('tune-color-init', handler);
  },

  // Installer API
  installerGetDefaultPath: (): Promise<string> => ipcRenderer.invoke('installer-get-default-path'),
  installerBrowseFolder: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('installer-browse-folder', defaultPath),
  installerPerformInstall: (options: any): Promise<void> =>
    ipcRenderer.invoke('installer-perform-install', options),
  installerLaunchAndFinish: (targetDir: string, runNow: boolean): Promise<void> =>
    ipcRenderer.invoke('installer-launch-and-finish', targetDir, runNow),
  installerPerformUninstall: (): Promise<void> => ipcRenderer.invoke('installer-perform-uninstall'),
  onInstallerProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('installer-progress', handler);
    return () => ipcRenderer.removeListener('installer-progress', handler);
  },
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('maximize-window'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('is-window-maximized'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('close-window'),
  onWindowMaximizeChanged: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: any, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window-maximize-changed', handler);
    return () => ipcRenderer.removeListener('window-maximize-changed', handler);
  },
  onWindowSnapChanged: (callback: (snapState: 'left' | 'right' | null) => void) => {
    const handler = (_event: any, snapState: any) => callback(snapState);
    ipcRenderer.on('window-snap-changed', handler);
    return () => ipcRenderer.removeListener('window-snap-changed', handler);
  },
  startWindowDrag: (data: {
    screenX: number;
    screenY: number;
    gripRatioX: number;
    gripOffsetY: number;
    isMaximized: boolean;
    allowMaximize?: boolean;
  }): Promise<void> => ipcRenderer.invoke('start-window-drag', data),
  moveWindowDrag: (data: {
    screenX: number;
    screenY: number;
  }): Promise<{ snapZone: 'top' | 'left' | 'right' | null }> => ipcRenderer.invoke('move-window-drag', data),
  endWindowDrag: (data: { screenX: number; screenY: number }): Promise<void> =>
    ipcRenderer.invoke('end-window-drag', data),

  // Splash Screen API
  getSplashStatus: (): Promise<{ percent: number; text: string }> => ipcRenderer.invoke('get-splash-status'),
  showSplashScreen: (): Promise<void> => ipcRenderer.invoke('show-splash-screen'),
  onSplashStatus: (callback: (status: { percent: number; text: string }) => void) => {
    const handler = (_event: any, status: any) => callback(status);
    ipcRenderer.on('splash-status', handler);
    return () => ipcRenderer.removeListener('splash-status', handler);
  },

  // Diagnostics & Logs API
  getActionLogs: (): Promise<ActionLogEntry[]> => ipcRenderer.invoke('get-action-logs'),
  clearActionLogs: (): Promise<void> => ipcRenderer.invoke('clear-action-logs'),
  getCrashLogs: (): Promise<CrashLogEntry[]> => ipcRenderer.invoke('get-crash-logs'),
  openCrashLogFolder: (): Promise<void> => ipcRenderer.invoke('open-crash-log-folder'),
  clearCrashLogs: (): Promise<void> => ipcRenderer.invoke('clear-crash-logs'),
  logAction: (entry: Omit<ActionLogEntry, 'id' | 'timestamp'> & { timestamp?: string }): Promise<void> =>
    ipcRenderer.invoke('log-action', entry),
  exportCrashReport: (fileName: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-crash-report', fileName),
  recordCrash: (action: string, error: any, context?: any): Promise<string> =>
    ipcRenderer.invoke('record-crash', action, error, context),
  simulateTestCrash: (): Promise<string> => ipcRenderer.invoke('simulate-test-crash'),
  openDevTools: (): Promise<void> => ipcRenderer.invoke('open-dev-tools'),

  // Systémové notifikace
  sendTestNotification: (variant?: any): Promise<boolean> => ipcRenderer.invoke('send-test-notification', variant),
  copyToClipboard: (text: string, options?: { title?: string; body?: string }): Promise<boolean> =>
    ipcRenderer.invoke('copy-to-clipboard', text, options),

  // QuickCap (dříve FastSnap) API
  startQuickCap: (): Promise<void> => ipcRenderer.invoke('quickcap-start'),
  finishQuickCap: (cropArea: { x: number; y: number; width: number; height: number; windowWidth?: number; windowHeight?: number }): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('quickcap-finish-crop', cropArea),
  cancelQuickCap: (): Promise<void> => ipcRenderer.invoke('quickcap-cancel'),
  getRecentQuickCaps: (): Promise<any[]> => ipcRenderer.invoke('quickcap-get-recent'),
  copyQuickCapToClipboard: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('quickcap-copy-to-clipboard', filePath),
  deleteQuickCap: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('quickcap-delete', filePath),
  showQuickCapInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('quickcap-show-in-folder', filePath),
  chooseQuickCapFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('quickcap-choose-folder'),
  getQuickCapInitData: (): Promise<{ screenshotUrl: string; width: number; height: number; scaleFactor: number } | null> =>
    ipcRenderer.invoke('quickcap-get-init-data'),
  onQuickCapInitData: (callback: (data: { screenshotUrl: string; width: number; height: number; scaleFactor: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('quickcap-init-data', handler);
    ipcRenderer.on('fastsnap-init-data', handler);
    return () => {
      ipcRenderer.removeListener('quickcap-init-data', handler);
      ipcRenderer.removeListener('fastsnap-init-data', handler);
    };
  },
  onQuickCapCleanup: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('quickcap-cleanup', handler);
    ipcRenderer.on('fastsnap-cleanup', handler);
    return () => {
      ipcRenderer.removeListener('quickcap-cleanup', handler);
      ipcRenderer.removeListener('fastsnap-cleanup', handler);
    };
  },
  onQuickCapCaptured: (callback: (data: { filePath: string; fileName: string; dataUrl: string; width: number; height: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('quickcap-captured-global', handler);
    return () => {
      ipcRenderer.removeListener('quickcap-captured-global', handler);
    };
  },

  // ScreenRuler API
  startScreenRuler: (): Promise<void> => ipcRenderer.invoke('screenruler-start'),
  closeScreenRuler: (): Promise<void> => ipcRenderer.invoke('screenruler-close'),
  copyScreenRulerDimensions: (dimensions: string): Promise<void> =>
    ipcRenderer.invoke('screenruler-copy', dimensions),
  getScreenRulerInitData: (): Promise<{ width: number; height: number; color: string; defaultUnit: string } | null> =>
    ipcRenderer.invoke('screenruler-get-init-data'),
  onScreenRulerInit: (callback: (data: { width: number; height: number; color: string; defaultUnit: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('screenruler-init', handler);
    return () => {
      ipcRenderer.removeListener('screenruler-init', handler);
    };
  },
  onScreenRulerCleanup: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('screenruler-cleanup', handler);
    return () => {
      ipcRenderer.removeListener('screenruler-cleanup', handler);
    };
  },

  // Zpětná kompatibilita pro FastSnap
  startFastSnap: (): Promise<void> => ipcRenderer.invoke('quickcap-start'),
  finishFastSnap: (cropArea: { x: number; y: number; width: number; height: number; windowWidth?: number; windowHeight?: number }): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('quickcap-finish-crop', cropArea),
  cancelFastSnap: (): Promise<void> => ipcRenderer.invoke('quickcap-cancel'),
  getRecentFastSnaps: (): Promise<any[]> => ipcRenderer.invoke('quickcap-get-recent'),
  copyFastSnapToClipboard: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('quickcap-copy-to-clipboard', filePath),
  deleteFastSnap: (filePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('quickcap-delete', filePath),
  showFastSnapInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('quickcap-show-in-folder', filePath),
  chooseFastSnapFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('quickcap-choose-folder'),
  getFastSnapInitData: (): Promise<{ screenshotUrl: string; width: number; height: number; scaleFactor: number } | null> =>
    ipcRenderer.invoke('quickcap-get-init-data'),
  onFastSnapInitData: (callback: (data: { screenshotUrl: string; width: number; height: number; scaleFactor: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('quickcap-init-data', handler);
    ipcRenderer.on('fastsnap-init-data', handler);
    return () => {
      ipcRenderer.removeListener('quickcap-init-data', handler);
      ipcRenderer.removeListener('fastsnap-init-data', handler);
    };
  },
  onFastSnapCleanup: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('quickcap-cleanup', handler);
    ipcRenderer.on('fastsnap-cleanup', handler);
    return () => {
      ipcRenderer.removeListener('quickcap-cleanup', handler);
      ipcRenderer.removeListener('fastsnap-cleanup', handler);
    };
  },

  // EasyClip API
  getEasyClipItems: (): Promise<EasyClipItem[]> => ipcRenderer.invoke('easyclip-get-items'),
  copyEasyClipItem: (id: string, paste: boolean = true): Promise<boolean> => ipcRenderer.invoke('easyclip-copy-item', id, paste),
  copyMultipleEasyClipItems: (ids: string[], paste: boolean = true): Promise<boolean> => ipcRenderer.invoke('easyclip-copy-multiple', ids, paste),
  deleteEasyClipItem: (id: string): Promise<boolean> => ipcRenderer.invoke('easyclip-delete-item', id),
  deleteMultipleEasyClipItems: (ids: string[]): Promise<boolean> => ipcRenderer.invoke('easyclip-delete-multiple', ids),
  clearEasyClipHistory: (): Promise<boolean> => ipcRenderer.invoke('easyclip-clear-history'),
  openEasyClip: (): Promise<void> => ipcRenderer.invoke('easyclip-open'),
  onEasyClipItemsUpdated: (callback: (items: EasyClipItem[]) => void) => {
    const handler = (_event: any, items: EasyClipItem[]) => callback(items);
    ipcRenderer.on('easyclip-items-updated', handler);
    return () => ipcRenderer.removeListener('easyclip-items-updated', handler);
  },
  onOpenSpotlightMode: (callback: (data: { mode: string; options?: any }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('open-spotlight-mode', handler);
    return () => ipcRenderer.removeListener('open-spotlight-mode', handler);
  },

  // PaletteMaster API
  getPalettes: (): Promise<any[]> => ipcRenderer.invoke('get-palettes'),
  savePalette: (palette: any): Promise<any[]> => ipcRenderer.invoke('save-palette', palette),
  deletePalette: (paletteId: string): Promise<any[]> => ipcRenderer.invoke('delete-palette', paletteId),
  openPaletteBar: (params: { paletteId: string; paletteName: string }): Promise<void> =>
    ipcRenderer.invoke('open-palette-bar', params),
  closePaletteBar: (): Promise<void> => ipcRenderer.invoke('close-palette-bar'),
  openPaletteDetail: (params: { paletteId: string }): Promise<void> =>
    ipcRenderer.invoke('open-palette-detail', params),
  closePaletteDetail: (): Promise<void> => ipcRenderer.invoke('close-palette-detail'),
  onPalettesUpdated: (callback: (palettes: any[]) => void) => {
    const handler = (_event: any, palettes: any[]) => callback(palettes);
    ipcRenderer.on('palettes-updated', handler);
    return () => ipcRenderer.removeListener('palettes-updated', handler);
  },
  onPaletteBarInit: (callback: (data: { paletteId: string; paletteName: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('palette-bar-init', handler);
    return () => ipcRenderer.removeListener('palette-bar-init', handler);
  },
  onPaletteDetailInit: (callback: (data: { paletteId: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('palette-detail-init', handler);
    return () => ipcRenderer.removeListener('palette-detail-init', handler);
  },

  // MagicPlan API
  openMagicPlanWindow: (): Promise<void> => ipcRenderer.invoke('open-magicplan-window'),
  closeMagicPlanWindow: (): Promise<void> => ipcRenderer.invoke('close-magicplan-window'),
  getMagicPlanData: (): Promise<any> => ipcRenderer.invoke('magicplan-get-data'),
  refreshMagicPlan: (): Promise<any> => ipcRenderer.invoke('magicplan-refresh'),
  getMagicPlanDevLogs: (): Promise<any> => ipcRenderer.invoke('magicplan-get-dev-logs'),
  clearMagicPlanData: (): Promise<any> => ipcRenderer.invoke('magicplan-clear-data'),
  onMagicPlanDataUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('magicplan:data-updated', handler);
    return () => ipcRenderer.removeListener('magicplan:data-updated', handler);
  },
});
