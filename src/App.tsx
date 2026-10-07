import React, { useState, useEffect, useMemo } from 'react';
import { LauncherItem, AppConfig, UpdateInfo, SyncProgress } from './types';
import { SearchSpotlight } from './components/SearchSpotlight';
import { SettingsModal } from './components/SettingsModal';
import { UpdateDialog } from './components/UpdateDialog';
import { WhatsNewModal } from './components/WhatsNewModal';
import { ChangelogModal } from './components/ChangelogModal';
import { GitCloneModal } from './components/GitCloneModal';
import { CmsDownloadModal } from './components/CmsDownloadModal';
import { InstallerWizard } from './components/InstallerWizard';
import { UninstallerModal } from './components/UninstallerModal';
import { SplashScreen } from './components/SplashScreen';
import { TuneColorModal } from './components/TuneColorModal';
import { QuickCapSnipper } from './components/QuickCapSnipper';
import { ScreenRulerOverlay } from './components/ScreenRulerOverlay';
import { PaletteBar } from './components/PaletteBar';
import { PaletteDetailModal } from './components/PaletteDetailModal';
import { WindowFrame } from './components/WindowFrame';
import { PowerManagementModal } from './components/PowerManagementModal';
import { MagicPlanWindow } from './components/MagicPlanWindow';
import { FeedbackWindow } from './components/FeedbackWindow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CURRENT_APP_VERSION, IS_DEV, getLatestRelease } from './changelog';
import { applyPrimaryColor, applyActionsColor } from './utils/theme';

const DEFAULT_CONFIG: AppConfig = {
  hotkey: 'Ctrl+Alt+Space',
  sources: [],
  magicgate: {
    username: '',
    password: '',
  },
  vscode: {
    path: '',
  },
  extensions: {
    magicgate: false,
    mlog: false,
    github: false,
    vscode: false,
    donkeyTools: false,
    magicplan: false,
  },
  magicplan: {
    enabled: false,
    url: '',
    userColumn: '',
    unassignedColumn: '',
    pollIntervalMinutes: 2,
    notifyNewTasks: true,
    notifyCompletedTasks: true,
    notifyTaskChanges: true,
    notifyQueueTasks: true,
    linkWithTaskManager: true,
    timelineTimeMode: 'real8h',
    timelineCustomStart: '09:00',
    timelineCustomEnd: '17:00',
  },
  donkeyTools: {
    colorMaster: {
      enabled: false,
      hotkey: '',
      defaultFormat: 'hex',
    },
    quickCap: {
      enabled: false,
      hotkey: '',
    },
    screenRuler: {
      enabled: false,
      hotkey: '',
      color: '#f43f5e',
      defaultUnit: 'px',
    },
    easyClip: {
      enabled: false,
      hotkey: '',
      maxItems: 50,
    },
  },
  updateUrl: 'https://raw.githubusercontent.com/magicware/IADonkey/main/version.json',
  lastDeclinedVersion: null,
  lastDeclinedTime: null,
  autoSyncIntervalMinutes: 30,
  primaryColor: '#6366f1',
  actionsColor: '#a855f7',
  lastSeenVersion: null,
  searchGoogle: true,
  defaultSearchEngine: 'google',
};

export const App: React.FC = () => {
  const [isInstallerMode] = useState(() => {
    return window.location.hash.startsWith('#installer') || window.location.search.includes('window=installer');
  });

  const [isUninstallMode] = useState(() => {
    return window.location.hash.startsWith('#uninstall') || window.location.search.includes('window=uninstall');
  });

  const [isSplashMode] = useState(() => {
    return window.location.hash.startsWith('#splash') || window.location.search.includes('window=splash');
  });

  const [isSettingsView, setIsSettingsView] = useState(() => {
    return window.location.hash.startsWith('#settings') || window.location.search.includes('window=settings');
  });

  const [isGitCloneView, setIsGitCloneView] = useState(() => {
    return window.location.hash.startsWith('#git-clone') || window.location.search.includes('window=git-clone');
  });

  const [isPowerView] = useState(() => {
    return window.location.hash.startsWith('#power') || window.location.search.includes('window=power');
  });

  const [isTuneColorView, setIsTuneColorView] = useState(() => {
    return window.location.hash.startsWith('#tune-color') || window.location.search.includes('window=tune-color');
  });

  const [isQuickCapView] = useState(() => {
    return (
      window.location.hash.startsWith('#quickcap') ||
      window.location.hash.startsWith('#fastsnap') ||
      window.location.search.includes('window=quickcap') ||
      window.location.search.includes('window=fastsnap')
    );
  });

  const [isScreenRulerView] = useState(() => {
    return (
      window.location.hash.startsWith('#ruler') ||
      window.location.hash.startsWith('#screenruler') ||
      window.location.search.includes('window=ruler') ||
      window.location.search.includes('window=screenruler')
    );
  });

  const [isPaletteBarView] = useState(() => {
    return (
      window.location.hash.startsWith('#palette-bar') ||
      window.location.search.includes('window=palette-bar')
    );
  });

  const [isPaletteDetailView] = useState(() => {
    return (
      window.location.hash.startsWith('#palette-detail') ||
      window.location.search.includes('window=palette-detail')
    );
  });

  const [isMagicPlanView] = useState(() => {
    return (
      window.location.hash.startsWith('#magicplan') ||
      window.location.hash.startsWith('#plan') ||
      window.location.search.includes('window=magicplan') ||
      window.location.search.includes('window=plan')
    );
  });

  const [isFeedbackView, setIsFeedbackView] = useState(() => {
    return (
      window.location.hash.startsWith('#feedback') ||
      window.location.search.includes('window=feedback')
    );
  });

  const [feedbackInitialMode] = useState<'user' | 'dev'>(() => {
    let devAllowed = false;
    try {
      if (localStorage.getItem('iadonkey_develop_mode') === 'true') devAllowed = true;
      else if (localStorage.getItem('iadonkey_develop_mode') === 'false') devAllowed = false;
    } catch {}
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const sp = new URLSearchParams(hash.slice(qIndex + 1));
      const m = (sp.get('mode') as 'user' | 'dev') || 'user';
      return m === 'dev' && !devAllowed ? 'user' : m;
    }
    const search = window.location.search;
    if (search) {
      const sp = new URLSearchParams(search);
      const m = (sp.get('mode') as 'user' | 'dev') || 'user';
      return m === 'dev' && !devAllowed ? 'user' : m;
    }
    return 'user';
  });

  const [isCmsDownloadView, setIsCmsDownloadView] = useState(() => {
    return window.location.hash.startsWith('#cms-download') || window.location.search.includes('window=cms-download');
  });

  const [cmsDownloadParams, setCmsDownloadParams] = useState(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const sp = new URLSearchParams(hash.slice(qIndex + 1));
      return {
        instanceName: sp.get('instanceName') || '',
        adminUrl: sp.get('adminUrl') || '',
        targetDir: sp.get('targetDir') || '',
      };
    }
    const search = window.location.search;
    if (search) {
      const sp = new URLSearchParams(search);
      return {
        instanceName: sp.get('instanceName') || '',
        adminUrl: sp.get('adminUrl') || '',
        targetDir: sp.get('targetDir') || '',
      };
    }
    return { instanceName: '', adminUrl: '', targetDir: '' };
  });

  const [gitCloneParams, setGitCloneParams] = useState(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const sp = new URLSearchParams(hash.slice(qIndex + 1));
      return {
        repoName: sp.get('name') || '',
        repoUrl: sp.get('url') || '',
        recursive: sp.get('recursive') === '1' || sp.get('recursive') === 'true',
        isInstanceMode: sp.get('isInstanceMode') === '1' || sp.get('isInstanceMode') === 'true',
        adminUrl: sp.get('adminUrl') || '',
        targetDir: sp.get('targetDir') || '',
        repoLanguage: sp.get('repoLanguage') || '',
      };
    }
    const search = window.location.search;
    if (search) {
      const sp = new URLSearchParams(search);
      if (sp.has('recursive') || sp.has('name') || sp.has('isInstanceMode') || sp.has('targetDir')) {
        return {
          repoName: sp.get('name') || '',
          repoUrl: sp.get('url') || '',
          recursive: sp.get('recursive') === '1' || sp.get('recursive') === 'true',
          isInstanceMode: sp.get('isInstanceMode') === '1' || sp.get('isInstanceMode') === 'true',
          adminUrl: sp.get('adminUrl') || '',
          targetDir: sp.get('targetDir') || '',
          repoLanguage: sp.get('repoLanguage') || '',
        };
      }
    }
    return { repoName: '', repoUrl: '', recursive: false, isInstanceMode: false, adminUrl: '', targetDir: '', repoLanguage: '' };
  });

  const [items, setItems] = useState<LauncherItem[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string | null>(null);
  const [isInitialReady, setIsInitialReady] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);

  // Hash listener for hot-reload or navigation
  useEffect(() => {
    const handleHash = () => {
      setIsSettingsView(window.location.hash.startsWith('#settings') || window.location.search.includes('window=settings'));
      setIsGitCloneView(window.location.hash.startsWith('#git-clone') || window.location.search.includes('window=git-clone'));
      setIsCmsDownloadView(window.location.hash.startsWith('#cms-download') || window.location.search.includes('window=cms-download'));
      setIsTuneColorView(window.location.hash.startsWith('#tune-color') || window.location.search.includes('window=tune-color'));
      setIsFeedbackView(window.location.hash.startsWith('#feedback') || window.location.search.includes('window=feedback'));
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Set [DEV] in document.title if running in development mode
  useEffect(() => {
    if (IS_DEV) {
      if (!document.title.includes('[DEV]')) {
        document.title = document.title ? document.title.replace('IADonkey', 'IADonkey [DEV]') : 'IADonkey [DEV]';
      }
    }
  }, []);

  // Listen to cms-download params updates if window was already open
  useEffect(() => {
    if (window.electronAPI?.onCmsDownloadParams) {
      const unsubscribe = window.electronAPI.onCmsDownloadParams((params: any) => {
        setCmsDownloadParams({
          instanceName: params.instanceName || '',
          adminUrl: params.adminUrl || '',
          targetDir: params.targetDir || '',
        });
      });
      return () => unsubscribe();
    }
  }, []);

  // Listen to git-clone params updates if window was already open
  useEffect(() => {
    if (window.electronAPI?.onGitCloneParams) {
      const unsubscribe = window.electronAPI.onGitCloneParams((params: any) => {
        setGitCloneParams({
          repoName: params.repoName || '',
          repoUrl: params.repoUrl || '',
          recursive: Boolean(params.recursive ?? params.initialRecursive),
          isInstanceMode: Boolean(params.isInstanceMode),
          adminUrl: params.adminUrl || '',
          targetDir: params.targetDir || '',
          repoLanguage: params.repoLanguage || '',
        });
      });
      return () => unsubscribe();
    }
  }, []);

  // Synchronize dynamic primary and actions color CSS variables
  useEffect(() => {
    applyPrimaryColor(config.primaryColor);
    applyActionsColor(config.actionsColor);
  }, [config.primaryColor, config.actionsColor]);

  // Initial load
  useEffect(() => {
    async function loadData() {
      if (window.electronAPI) {
        try {
          const cfg = await window.electronAPI.getConfig();
          if (cfg) {
            let effectiveCfg = cfg;
            try {
              if (localStorage.getItem('iadonkey_develop_mode') === 'true' && !cfg.developMode) {
                effectiveCfg = { ...cfg, developMode: true };
                window.electronAPI.saveConfig(effectiveCfg).catch(() => {});
              } else if (localStorage.getItem('iadonkey_develop_mode') === 'false' && cfg.developMode) {
                effectiveCfg = { ...cfg, developMode: false };
                window.electronAPI.saveConfig(effectiveCfg).catch(() => {});
              }
            } catch {}
            setConfig(effectiveCfg);
            applyPrimaryColor(effectiveCfg.primaryColor);
            applyActionsColor(effectiveCfg.actionsColor);
            if (!isSettingsView && effectiveCfg.lastSeenVersion !== CURRENT_APP_VERSION) {
              setShowWhatsNew(true);
            }
          }
          const cachedItems = await window.electronAPI.getItems();
          setItems(cachedItems || []);
        } catch (err) {
          console.error('Failed to load initial config or items:', err);
        } finally {
          setIsInitialReady(true);
        }
      } else {
        setIsInitialReady(true);
      }
    }
    loadData();

    // Listen to IPC events from main process
    const cleanupDataListener = window.electronAPI?.onDataUpdated?.((newItems: LauncherItem[]) => {
      setItems(newItems);
      setIsSyncing(false);
    });

    const cleanupConfigListener = window.electronAPI?.onConfigUpdated?.((newConfig: AppConfig) => {
      if (newConfig) setConfig(newConfig);
    });

    const cleanupSettingsListener = window.electronAPI?.onOpenSettingsRequest?.(() => {
      window.electronAPI?.openSettingsWindow?.();
    });

    const cleanupUpdateListener = window.electronAPI?.onUpdateAvailable?.((info: UpdateInfo) => {
      setUpdateInfo(info);
    });

    const cleanupProgressListener = window.electronAPI?.onSyncProgress?.((prog: SyncProgress) => {
      setSyncProgress(prog);
      if (prog.isComplete) {
        setTimeout(() => setSyncProgress(null), 2000);
      }
    });

    return () => {
      cleanupDataListener?.();
      cleanupConfigListener?.();
      cleanupSettingsListener?.();
      cleanupUpdateListener?.();
      cleanupProgressListener?.();
    };
  }, []);

  const handleSaveConfig = async (newConfig: AppConfig) => {
    setConfig(newConfig);
    if (window.electronAPI) {
      await window.electronAPI.saveConfig(newConfig);
    }
  };

  const handleRefreshData = async () => {
    setIsSyncing(true);
    window.electronAPI?.logAction?.({
      type: 'sync',
      title: 'Spuštěna synchronizace dat',
      details: 'Kliknutí na tlačítko synchronizace v záhlaví Spotlightu',
      status: 'info',
    });
    if (window.electronAPI) {
      try {
        const freshItems = await window.electronAPI.syncNow();
        setItems(freshItems || []);
        const freshConfig = await window.electronAPI.getConfig();
        if (freshConfig) setConfig(freshConfig);
        window.electronAPI?.logAction?.({
          type: 'sync',
          title: 'Synchronizace dat dokončena',
          details: `Načteno ${freshItems?.length || 0} položek`,
          status: 'success',
        });
      } catch (err) {
        console.error('Sync failed:', err);
        window.electronAPI?.logAction?.({
          type: 'sync',
          title: 'Synchronizace dat selhala',
          details: String(err),
          status: 'error',
        });
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatusMessage('Zjišťuji dostupnost nové verze...');
    if (window.electronAPI) {
      try {
        const info = await window.electronAPI.checkUpdate();
        if (info.hasUpdate) {
          setUpdateInfo(info);
          setUpdateStatusMessage(`K dispozici nová verze: ${info.latestVersion}`);
        } else {
          setUpdateStatusMessage(`Máte aktuální verzi (${info.currentVersion}).`);
          setTimeout(() => setUpdateStatusMessage(null), 4000);
        }
      } catch (err: any) {
        setUpdateStatusMessage(`Chyba kontroly aktualizace: ${err?.message || err}`);
      }
    }
  };

  const handleAcceptUpdate = () => {
    if (updateInfo?.downloadUrl && window.electronAPI) {
      window.electronAPI.openExternal(updateInfo.downloadUrl);
    }
    setUpdateInfo(null);
  };

  const handleSimulateUpdate = () => {
    window.electronAPI?.logAction?.({
      type: 'action',
      title: 'Spuštěna simulace aktualizace aplikace',
      details: `Simulace přechodu z v${CURRENT_APP_VERSION} na v1.2.0`,
      status: 'info',
    });
    setUpdateInfo({
      hasUpdate: true,
      latestVersion: '1.2.0 (Simulace)',
      currentVersion: CURRENT_APP_VERSION,
      releaseNotes: '• Nový vylepšený design systém\n• Rychlejší vyhledávání v repozitářích\n• Opravy drobných chyb a vylepšení stability',
      downloadUrl: 'https://example.com/simulated-update.exe',
      isSimulated: true,
    });
  };

  const handleDeclineUpdate = async () => {
    if (updateInfo && !updateInfo.isSimulated && config && window.electronAPI) {
      const updatedConfig: AppConfig = {
        ...config,
        lastDeclinedVersion: updateInfo.latestVersion,
        lastDeclinedTime: Date.now(),
      };
      await window.electronAPI.saveConfig(updatedConfig);
      setConfig(updatedConfig);
    }
    setUpdateInfo(null);
  };

  const handleDismissWhatsNew = async () => {
    setShowWhatsNew(false);
    if (config && window.electronAPI) {
      const updatedConfig: AppConfig = {
        ...config,
        lastSeenVersion: CURRENT_APP_VERSION,
      };
      setConfig(updatedConfig);
      await window.electronAPI.saveConfig(updatedConfig);
    }
  };

  // Dedicated Installer Window mode
  if (isInstallerMode) {
    return <InstallerWizard />;
  }

  // Dedicated Uninstaller Window mode
  if (isUninstallMode) {
    return <UninstallerModal />;
  }

  // Dedicated Splash Screen Window mode
  if (isSplashMode) {
    return <SplashScreen />;
  }

  // Dedicated Settings Window mode
  if (isSettingsView) {
    if (!isInitialReady) {
      return (
        <WindowFrame
          title="IADonkey – Nastavení"
          allowMinimize={true}
          allowMaximize={true}
          onClose={() => window.close()}
        >
          <main className="w-full h-full bg-[#181920] flex flex-col items-center justify-center text-gray-400 gap-3 select-none">
            <div className="w-7 h-7 rounded-full border-2 border-white/10 border-t-indigo-500 animate-spin" />
            <span className="text-xs font-medium tracking-wide text-gray-400">Načítám nastavení...</span>
          </main>
        </WindowFrame>
      );
    }

    return (
      <WindowFrame
        title="IADonkey – Nastavení"
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => window.close()}
      >
        <main className="w-full h-full bg-[#181920] overflow-hidden text-gray-200">
          <ErrorBoundary fallbackTitle="Chyba vykreslení okna Nastavení">
            <SettingsModal
              config={config}
              items={items}
              onSaveConfig={handleSaveConfig}
              onClose={() => window.close()}
              onTriggerSync={handleRefreshData}
              onCheckUpdate={handleCheckUpdate}
              isSyncing={isSyncing}
              syncProgress={syncProgress}
              updateStatusMessage={updateStatusMessage}
              updateInfo={updateInfo}
              onSimulateUpdate={handleSimulateUpdate}
            />
          </ErrorBoundary>
          {/* Update Dialog in settings view if simulated */}
          {updateInfo && (
            <UpdateDialog
              updateInfo={updateInfo}
              onAccept={handleAcceptUpdate}
              onDecline={handleDeclineUpdate}
            />
          )}
        </main>
      </WindowFrame>
    );
  }

  // Dedicated Git Clone Window mode
  if (isGitCloneView) {
    const baseCloneDir = config.github?.defaultCloneDir || '';
    const initialTargetDir =
      gitCloneParams.targetDir ||
      (gitCloneParams.isInstanceMode && baseCloneDir && gitCloneParams.repoName
        ? `${baseCloneDir.replace(/[\\/]+$/, '')}\\magicgate\\${gitCloneParams.repoName}`
        : baseCloneDir);

    const winTitle = gitCloneParams.isInstanceMode
      ? `IADonkey – Klonovat repozitáře instance (${gitCloneParams.repoName || 'Instance'})`
      : `IADonkey – Klonovat repozitář${gitCloneParams.repoName ? ` (${gitCloneParams.repoName})` : ''}`;

    return (
      <WindowFrame
        title={winTitle}
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => window.close()}
      >
        <GitCloneModal
          isOpen={true}
          onClose={() => window.close()}
          repoName={gitCloneParams.repoName}
          repoUrl={gitCloneParams.repoUrl}
          defaultTargetDir={initialTargetDir}
          initialRecursive={gitCloneParams.recursive}
          isStandaloneWindow={true}
          isInstanceMode={gitCloneParams.isInstanceMode}
          adminUrl={gitCloneParams.adminUrl}
          vscodeEnabled={config.extensions?.vscode ?? false}
          androidStudioEnabled={config.extensions?.androidStudio ?? false}
          repoLanguage={gitCloneParams.repoLanguage}
          actionsColor={config.actionsColor}
        />
      </WindowFrame>
    );
  }

  // Dedicated CMSinFS Download Window mode
  if (isCmsDownloadView) {
    return (
      <WindowFrame
        title={`IADonkey – Stažení CMSinFS zdrojáků (${cmsDownloadParams.instanceName || 'Instance'})`}
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => {
          if (window.electronAPI?.closeCmsDownloadWindow) {
            window.electronAPI.closeCmsDownloadWindow(true);
          } else {
            window.close();
          }
        }}
      >
        <CmsDownloadModal
          isOpen={true}
          onClose={() => {
            if (window.electronAPI?.closeCmsDownloadWindow) {
              window.electronAPI.closeCmsDownloadWindow(true);
            } else {
              window.close();
            }
          }}
          instanceName={cmsDownloadParams.instanceName}
          adminUrl={cmsDownloadParams.adminUrl}
          targetDir={cmsDownloadParams.targetDir}
          vscodeEnabled={config.extensions?.vscode ?? false}
        />
      </WindowFrame>
    );
  }

  // Dedicated Power / Quit / Restart Window mode
  if (isPowerView) {
    return (
      <WindowFrame
        title="IADonkey – Správa aplikace"
        allowMinimize={true}
        allowMaximize={false}
        onClose={() => window.electronAPI?.closePowerWindow?.()}
      >
        <PowerManagementModal onClose={() => window.electronAPI?.closePowerWindow?.()} />
      </WindowFrame>
    );
  }

  // Dedicated Tune Color Window mode (displays in Windows taskbar)
  if (isTuneColorView) {
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : '');
    const params = new URLSearchParams(rawSearch);
    const initialColor = params.get('color') || '#6366f1';
    return (
      <WindowFrame
        title="IADonkey – Doladění barvy"
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => {
          if (window.electronAPI?.closeTuneColorWindow) {
            window.electronAPI.closeTuneColorWindow();
          } else {
            window.close();
          }
        }}
      >
        <TuneColorModal initialColor={initialColor} />
      </WindowFrame>
    );
  }

  // QuickCap Snipper Screen Overlay mode
  if (isQuickCapView) {
    return <QuickCapSnipper />;
  }

  // ScreenRuler Screen Overlay mode
  if (isScreenRulerView) {
    return <ScreenRulerOverlay />;
  }

  // PaletteBar top floating bar
  if (isPaletteBarView) {
    return <PaletteBar />;
  }

  // PaletteDetail modal window
  if (isPaletteDetailView) {
    return (
      <WindowFrame
        title="IADonkey – PaletteMaster"
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => {
          if (window.electronAPI?.closePaletteDetail) {
            window.electronAPI.closePaletteDetail();
          } else {
            window.close();
          }
        }}
      >
        <PaletteDetailModal />
      </WindowFrame>
    );
  }

  // MagicPlan dedicated standalone window
  if (isMagicPlanView) {
    return (
      <WindowFrame
        title="IADonkey – MagicPlan"
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => {
          if (window.electronAPI?.closeMagicPlanWindow) {
            window.electronAPI.closeMagicPlanWindow();
          } else {
            window.close();
          }
        }}
      >
        <ErrorBoundary fallbackTitle="Chyba vykreslení okna MagicPlan">
          <MagicPlanWindow
            config={config}
            onSaveConfig={handleSaveConfig}
            onOpenSettings={() => {
              if (window.electronAPI?.openSettingsWindow) {
                window.electronAPI.openSettingsWindow();
              } else {
                setShowSettings(true);
              }
            }}
          />
        </ErrorBoundary>
      </WindowFrame>
    );
  }

  // Feedback dedicated standalone window
  if (isFeedbackView) {
    return (
      <WindowFrame
        title="IADonkey – Zpětná vazba a nápady"
        allowMinimize={true}
        allowMaximize={true}
        onClose={() => {
          if (window.electronAPI?.closeFeedbackWindow) {
            window.electronAPI.closeFeedbackWindow();
          } else {
            window.close();
          }
        }}
      >
        <ErrorBoundary fallbackTitle="Chyba vykreslení okna Zpětné vazby">
          <FeedbackWindow
            config={config}
            onSaveConfig={handleSaveConfig}
            initialMode={feedbackInitialMode}
          />
        </ErrorBoundary>
      </WindowFrame>
    );
  }

  // Filter items by enabled extensions
  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (config?.extensions?.magicgate === false && item.sourceId === 'magicgate-xml') {
        return false;
      }
      if (config?.extensions?.github === false && item.sourceId === 'github') {
        return false;
      }
      return true;
    });
  }, [items, config?.extensions]);

  // Floating Spotlight Search Bar mode
  return (
    <main
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          window.electronAPI?.hideWindow?.();
        }
      }}
      className="w-full h-screen p-6 sm:p-7 flex flex-col justify-start select-none bg-transparent"
    >
      {/* Search Bar & Autocomplete list */}
      {!showWhatsNew && !showChangelog && !updateInfo && !showSettings && (
        <SearchSpotlight
          items={visibleItems}
          mlogBaseUrl={config?.extensions?.mlog ? config?.mlog?.baseUrl : undefined}
          mlogTaskPrefix={config?.mlog?.taskPrefix}
          mlogRequestPrefix={config?.mlog?.requestPrefix}
          searchGoogle={config.searchGoogle !== false}
          defaultSearchEngine={config.defaultSearchEngine}
          githubEnabled={config.extensions?.github ?? false}
          hasGithubCredentials={Boolean(config.github?.token?.trim() || config.github?.oauthToken?.trim())}
          defaultCloneDir={config?.github?.defaultCloneDir}
          instanceSourceCodesPath={config?.magicgate?.instanceSourceCodesPath}
          vscodeEnabled={config.extensions?.vscode ?? false}
          androidStudioEnabled={config.extensions?.androidStudio ?? false}
          donkeyToolsEnabled={config.extensions?.donkeyTools ?? false}
          colorMasterConfig={config.donkeyTools?.colorMaster}
          quickCapConfig={config.donkeyTools?.quickCap || config.donkeyTools?.fastSnap}
          fastSnapConfig={config.donkeyTools?.quickCap || config.donkeyTools?.fastSnap}
          screenRulerConfig={config?.donkeyTools?.screenRuler}
          easyClipConfig={config?.donkeyTools?.easyClip}
          magicPlanEnabled={config.extensions?.magicplan !== false}
          magicPlanConfig={config?.magicplan}
          onSaveConfig={handleSaveConfig}
          onOpenSettings={() => {
            if (window.electronAPI?.openSettingsWindow) {
              window.electronAPI.openSettingsWindow();
            } else {
              setShowSettings(true);
            }
          }}
          onRefreshData={handleRefreshData}
          isSyncing={isSyncing}
          syncProgress={syncProgress}
          lastSyncTime={config.lastSyncTime}
          snippets={config.snippets}
        />
      )}

      {/* Fallback modal if not in dedicated window */}
      {showSettings && (
        <ErrorBoundary fallbackTitle="Chyba vykreslení okna Nastavení">
          <SettingsModal
            config={config}
            items={items}
            onSaveConfig={handleSaveConfig}
            onClose={() => {
              setShowSettings(false);
              window.dispatchEvent(new CustomEvent('focus-search-input'));
            }}
            onTriggerSync={handleRefreshData}
            onCheckUpdate={handleCheckUpdate}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
            updateStatusMessage={updateStatusMessage}
            updateInfo={updateInfo}
            onSimulateUpdate={handleSimulateUpdate}
          />
        </ErrorBoundary>
      )}

      {/* Update Dialog */}
      {updateInfo && (
        <UpdateDialog
          updateInfo={updateInfo}
          onAccept={handleAcceptUpdate}
          onDecline={handleDeclineUpdate}
        />
      )}

      {/* What's New Dialog on first launch after update */}
      {showWhatsNew && (
        <WhatsNewModal
          release={getLatestRelease()}
          onDismiss={handleDismissWhatsNew}
          onOpenFullChangelog={() => setShowChangelog(true)}
        />
      )}

      {/* Complete Changelog Modal */}
      {showChangelog && (
        <ChangelogModal
          onClose={() => setShowChangelog(false)}
          isSpotlightView={true}
        />
      )}
    </main>
  );
};
