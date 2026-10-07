import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AppConfig, DataSource, FileSource, ApiSource, StaticSource, LauncherItem, SyncProgress, UpdateInfo, SourceFieldMapping, MappingTargetKey, BannedItem, CustomSnippet, ActionLogEntry, CrashLogEntry } from '../types';
import { applyPrimaryColor, applyActionsColor, APP_COLOR_PRESETS } from '../utils/theme';
import { formatLastSyncDate } from '../utils/dateHelper';
import { CURRENT_APP_VERSION, DISPLAY_APP_VERSION, IS_DEV, getLatestRelease } from '../changelog';
import { ChangelogModal } from './ChangelogModal';
import { WhatsNewModal } from './WhatsNewModal';
import { SearchItemsViewerModal } from './SearchItemsViewerModal';
import { DataSourcesGuideModal } from './DataSourcesGuideModal';
import { InstallerWizard } from './InstallerWizard';
import { SEARCH_ENGINES } from '../constants/searchEngines';
import { getDynamicSnippets } from '../utils/snippets';
import { MaterialIcon } from './MaterialIcon';
import { IconPickerInput } from './IconPickerInput';
import { pickScreenColor, parseColorQuery, formatColorValue } from '../utils/colorMaster';

interface SettingsModalProps {
  config: AppConfig;
  items: LauncherItem[];
  onSaveConfig: (newConfig: AppConfig) => void;
  onClose: () => void;
  onTriggerSync: () => Promise<void>;
  onCheckUpdate: () => Promise<void>;
  isSyncing: boolean;
  syncProgress?: SyncProgress | null;
  updateStatusMessage?: string | null;
  updateInfo?: UpdateInfo | null;
  onSimulateUpdate?: () => void;
}

interface ColorPickerSectionProps {
  title: string;
  description: string;
  icon: string;
  iconColorClass: string;
  value: string;
  fallbackColor: string;
  onColorChange: (newColor: string) => void;
}

const ColorPickerSection: React.FC<ColorPickerSectionProps> = ({
  title,
  description,
  icon,
  iconColorClass,
  value,
  fallbackColor,
  onColorChange,
}) => {
  const effectiveColor = value || fallbackColor;
  const currentPreset = APP_COLOR_PRESETS.find(
    (preset) => preset.hex.toLowerCase() === effectiveColor.toLowerCase()
  );

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h4 className="font-semibold text-sm text-white flex items-center gap-2">
          <span className={`material-symbols-outlined text-lg ${iconColorClass}`}>{icon}</span>
          {title}
        </h4>
        <p className="text-[13px] text-gray-400 mt-1">{description}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.03] p-4 rounded-2xl shadow-sm">
        {/* Active color preview indicator (left) */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden shadow-inner flex items-center justify-center ring-2 ring-white/20">
            <div
              className="w-full h-full"
              style={{ backgroundColor: effectiveColor }}
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-white font-semibold">
                {currentPreset?.name || effectiveColor.toUpperCase()}
              </span>
              {currentPreset?.isDefault && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-300">
                  Výchozí
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400">Vybraný odstín</span>
          </div>
        </div>

        {/* Preset quick colors (right) */}
        <div className="flex items-center gap-2 flex-wrap">
          {APP_COLOR_PRESETS.map((preset) => (
            <React.Fragment key={preset.hex}>
              <button
                type="button"
                onClick={() => onColorChange(preset.hex)}
                title={preset.isDefault ? `${preset.name} (Výchozí barva)` : preset.name}
                className={`w-7 h-7 rounded-full transition transform hover:scale-110 flex items-center justify-center cursor-pointer shadow-sm relative ${
                  effectiveColor.toLowerCase() === preset.hex.toLowerCase()
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-[#181920]'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: preset.hex }}
              >
                {preset.isDefault && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm pointer-events-none" />
                )}
              </button>
              {preset.isDefault === 'secondary' && (
                <div className="w-px h-4 bg-white/10 mx-0.5" />
              )}
            </React.Fragment>
          ))}
          <button
            type="button"
            onClick={async () => {
              try {
                const picked = await pickScreenColor({ noClipboard: true, noSpotlight: true });
                if (picked) {
                  onColorChange(picked);
                }
              } catch (err) {
                console.error('Eyedropper error in ColorPickerSection:', err);
              }
            }}
            title="Nabrat barvu z obrazovky (Kapátko)"
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition flex items-center justify-center cursor-pointer ml-1 shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">colorize</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Rezervované klávesové zkratky z nápovědy a systému IADonkey.
 * Tyto zkratky nelze použít pro globální vyvolání z důvodu kolize s ovládáním.
 */
const RESERVED_HOTKEYS: Record<string, string> = {
  'Shift+Enter': 'zkratka je v aplikaci vyhrazena pro otevření akcí položky',
  'Alt+Enter': 'zkratka je v aplikaci vyhrazena pro vstup do podpoložek',
  'Ctrl+Enter': 'zkratka je v aplikaci vyhrazena pro rychlé spuštění první volby',
  'Ctrl+Backspace': 'zkratka je v aplikaci vyhrazena pro rychlé smazání hledaného textu',
  'Alt+Backspace': 'zkratka je v aplikaci vyhrazena pro rychlé smazání hledaného textu',
  'Ctrl+Alt+Backspace': 'zkratka je v aplikaci vyhrazena pro smazání hledaného textu',
  'Ctrl+Left': 'šipky jsou v aplikaci vyhrazeny pro listování v informacích položky',
  'Ctrl+Right': 'šipky jsou v aplikaci vyhrazeny pro listování v informacích položky',
  'Alt+Left': 'šipky jsou v aplikaci vyhrazeny pro listování v informacích položky',
  'Alt+Right': 'šipky jsou v aplikaci vyhrazeny pro listování v informacích položky',
  'Ctrl+Up': 'šipky jsou v aplikaci vyhrazeny pro pohyb ve výsledcích vyhledávání',
  'Ctrl+Down': 'šipky jsou v aplikaci vyhrazeny pro pohyb ve výsledcích vyhledávání',
  'Alt+Up': 'šipky jsou v aplikaci vyhrazeny pro pohyb ve výsledcích vyhledávání',
  'Alt+Down': 'šipky jsou v aplikaci vyhrazeny pro pohyb ve výsledcích vyhledávání',
  'Ctrl+Escape': 'kombinace s klávesou Escape nelze použít (Escape slouží k zavírání)',
  'Alt+Escape': 'kombinace s klávesou Escape nelze použít (Escape slouží k zavírání)',
  'Shift+Escape': 'kombinace s klávesou Escape nelze použít (Escape slouží k zavírání)',
};

function getReservedHotkeyCollision(combo: string[]): string | null {
  const hotkey = combo.join('+');
  if (RESERVED_HOTKEYS[hotkey]) {
    return RESERVED_HOTKEYS[hotkey];
  }
  if (combo.includes('Escape')) {
    return 'kombinace s klávesou Escape nelze použít (Escape slouží k zavírání)';
  }
  return null;
}

const getGitRepoData = (item: LauncherItem): { repoName: string; repoUrl: string } | null => {
  const isGit = item.settings === 'git' || item.sourceId === 'github' || item.sourceId === 'git';
  const cloneAction = item.actions?.find((a) => a.action === 'clone' || a.action === 'clonerecursive');
  if (isGit || cloneAction) {
    const repoUrl =
      cloneAction?.location ||
      (item.location && (item.location.startsWith('http') || item.location.endsWith('.git')) ? item.location : null);
    if (repoUrl && item.name) {
      return {
        repoName: item.name,
        repoUrl,
      };
    }
  }
  return null;
};

const getMagicGateInstanceData = (item: LauncherItem): { instanceName: string; adminUrl: string } | null => {
  const isMg =
    item.settings === 'magicgate' ||
    item.sourceId === 'magicgate' ||
    item.sourceId === 'magicgate-xml' ||
    Boolean(item.actions?.some((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive'));

  if (isMg) {
    const adminUrl =
      item.info?.['Admin URL'] ||
      item.actions?.find((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive')?.location ||
      (item.location && item.location.includes('/Administration') ? item.location : undefined) ||
      item.options?.find((opt) => opt.name?.trim().toUpperCase() === 'A' || opt.name?.toLowerCase().includes('administrace'))?.location ||
      (item.location && (item.location.startsWith('http://') || item.location.startsWith('https://')) ? item.location : undefined);

    if (adminUrl && item.name) {
      return {
        instanceName: item.name,
        adminUrl,
      };
    }
  }
  return null;
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  config,
  items,
  onSaveConfig,
  onClose,
  onTriggerSync,
  onCheckUpdate,
  isSyncing,
  syncProgress,
  updateStatusMessage,
  updateInfo,
  onSimulateUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'sources' | 'extensions' | 'magicgate' | 'mlog' | 'github' | 'vscode' | 'android-studio' | 'magicplan' | 'donkey-tools' | 'snippets' | 'general' | 'notifications' | 'system' | 'updates' | 'help' | 'develop'>(() => {
    try {
      const hash = window.location.hash;
      const search = window.location.search;
      let tabParam: string | null = null;
      if (hash && hash.includes('tab=')) {
        const parts = hash.split('tab=');
        if (parts[1]) tabParam = parts[1].split('&')[0];
      }
      if (!tabParam && search && search.includes('tab=')) {
        const urlParams = new URLSearchParams(search);
        tabParam = urlParams.get('tab');
      }
      if (tabParam) {
        const validTabs = ['sources', 'extensions', 'magicgate', 'mlog', 'github', 'vscode', 'android-studio', 'magicplan', 'donkey-tools', 'snippets', 'general', 'notifications', 'system', 'updates', 'help', 'develop'];
        if (validTabs.includes(tabParam)) {
          return tabParam as any;
        }
      }
    } catch {
      // ignore
    }
    return 'sources';
  });

  useEffect(() => {
    const cleanup = window.electronAPI?.onSwitchSettingsTab?.((tab: string) => {
      const validTabs = ['sources', 'extensions', 'magicgate', 'mlog', 'github', 'vscode', 'android-studio', 'magicplan', 'donkey-tools', 'snippets', 'general', 'notifications', 'system', 'updates', 'help', 'develop'];
      if (validTabs.includes(tab)) {
        setActiveTab(tab as any);
      }
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);
  const [activeDonkeyTool, setActiveDonkeyTool] = useState<'colorMaster' | 'quickCap' | 'screenRuler' | 'easyClip'>('colorMaster');
  const [formData, setFormData] = useState<AppConfig>(config);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [isAddingSource, setIsAddingSource] = useState<'file' | 'api' | 'static' | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showItemsViewer, setShowItemsViewer] = useState(false);
  const [showDataSourcesGuide, setShowDataSourcesGuide] = useState(false);
  const [showInstallerPreview, setShowInstallerPreview] = useState(false);
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [recordedModifiers, setRecordedModifiers] = useState<string[]>([]);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [isRecordingColorMasterHotkey, setIsRecordingColorMasterHotkey] = useState(false);
  const [colorMasterRecordedModifiers, setColorMasterRecordedModifiers] = useState<string[]>([]);
  const [colorMasterHotkeyError, setColorMasterHotkeyError] = useState<string | null>(null);
  const [isRecordingPaletteHotkey, setIsRecordingPaletteHotkey] = useState(false);
  const [paletteRecordedModifiers, setPaletteRecordedModifiers] = useState<string[]>([]);
  const [paletteHotkeyError, setPaletteHotkeyError] = useState<string | null>(null);
  const [isSharedDropdownOpen, setIsSharedDropdownOpen] = useState(false);
  const [openSimDropdown, setOpenSimDropdown] = useState<'github' | 'magicgate' | 'cms' | null>(null);
  const [openNotifDropdown, setOpenNotifDropdown] = useState<string | null>(null);
  const [testTaskType, setTestTaskType] = useState<'dev' | 'service'>('dev');
  const [testIsCritical, setTestIsCritical] = useState<boolean>(false);
  const [testSituationId, setTestSituationId] = useState<number>(1);

  useEffect(() => {
    if (!openSimDropdown && !openNotifDropdown) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sim-dropdown]')) {
        setOpenSimDropdown(null);
      }
      if (!target.closest('[data-notif-dropdown]')) {
        setOpenNotifDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [openSimDropdown, openNotifDropdown]);



  const firstGithubRepo = useMemo(() => {
    for (const it of items) {
      const res = getGitRepoData(it);
      if (res) return res;
      if (it.options) {
        for (const opt of it.options) {
          const optRes = getGitRepoData(opt);
          if (optRes) return optRes;
        }
      }
    }
    return null;
  }, [items]);

  const firstMagicGateInstance = useMemo(() => {
    for (const it of items) {
      const res = getMagicGateInstanceData(it);
      if (res) return res;
      if (it.options) {
        for (const opt of it.options) {
          const optRes = getMagicGateInstanceData(opt);
          if (optRes) return optRes;
        }
      }
    }
    return null;
  }, [items]);

  const firstCmsInstance = useMemo(() => {
    if (!firstMagicGateInstance) return null;
    const basePath = formData.magicgate?.instanceSourceCodesPath?.trim() || 'C:\\development\\CMSinFS';
    const cleanBase = basePath.replace(/[\\/]+$/, '');
    const cleanInst = (firstMagicGateInstance.instanceName || 'instance').trim().replace(/^[\\/]+|[\\/]+$/g, '');
    const sep = cleanBase.includes('/') && !cleanBase.includes('\\') ? '/' : '\\';
    return {
      instanceName: firstMagicGateInstance.instanceName,
      adminUrl: firstMagicGateInstance.adminUrl,
      targetDir: `${cleanBase}${sep}${cleanInst}`,
    };
  }, [firstMagicGateInstance, formData.magicgate?.instanceSourceCodesPath]);

  const [hoveredEyeId, setHoveredEyeId] = useState<string | null>(null);
  const [copiedSourceId, setCopiedSourceId] = useState<string | null>(null);
  const [detectedKeys, setDetectedKeys] = useState<string[]>([]);
  const [sampleRecord, setSampleRecord] = useState<Record<string, any> | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [isTestingGitHub, setIsTestingGitHub] = useState(false);
  const [gitHubTestResult, setGitHubTestResult] = useState<{
    ok: boolean;
    user?: { login: string; name?: string; avatar_url?: string };
    orgs?: string[];
    repoCount?: number;
    error?: string;
  } | null>(null);
  const [showGitHubToken, setShowGitHubToken] = useState(false);
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [deviceFlowData, setDeviceFlowData] = useState<{
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    interval: number;
    expiresAt: number;
  } | null>(null);
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);
  const [userCodeCopied, setUserCodeCopied] = useState(false);
  const oauthPollingRef = useRef<NodeJS.Timeout | null>(null);
  const activeRecordingToolRef = useRef<'main' | 'colorMaster' | 'palette' | 'quickCap' | 'screenRuler' | 'easyClip' | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const maxComboRef = useRef<string[]>([]);
  const originalHotkeyRef = useRef<string>(config.hotkey || 'Ctrl+Alt+Space');
  const colorMasterPressedKeysRef = useRef<Set<string>>(new Set());
  const colorMasterMaxComboRef = useRef<string[]>([]);
  const colorMasterOriginalHotkeyRef = useRef<string>(config.donkeyTools?.colorMaster?.hotkey || '');
  const palettePressedKeysRef = useRef<Set<string>>(new Set());
  const paletteMaxComboRef = useRef<string[]>([]);
  const paletteOriginalHotkeyRef = useRef<string>(config.donkeyTools?.colorMaster?.paletteHotkey || '');

  // QuickCap (dříve FastSnap) state & refs
  const [isRecordingQuickCapHotkey, setIsRecordingQuickCapHotkey] = useState(false);
  const [quickCapRecordedModifiers, setQuickCapRecordedModifiers] = useState<string[]>([]);
  const [quickCapHotkeyError, setQuickCapHotkeyError] = useState<string | null>(null);
  const quickCapPressedKeysRef = useRef<Set<string>>(new Set());
  const quickCapMaxComboRef = useRef<string[]>([]);
  const quickCapOriginalHotkeyRef = useRef<string>(config.donkeyTools?.quickCap?.hotkey || config.donkeyTools?.fastSnap?.hotkey || '');
  const [recentQuickCaps, setRecentQuickCaps] = useState<import('../types').QuickCapRecentItem[]>([]);
  const [isLoadingQuickCaps, setIsLoadingQuickCaps] = useState(false);
  const [copiedQuickCapPath, setCopiedQuickCapPath] = useState<string | null>(null);

  // ScreenRuler state & refs
  const [isRecordingScreenRulerHotkey, setIsRecordingScreenRulerHotkey] = useState(false);
  const [screenRulerRecordedModifiers, setScreenRulerRecordedModifiers] = useState<string[]>([]);
  const [screenRulerHotkeyError, setScreenRulerHotkeyError] = useState<string | null>(null);
  const screenRulerPressedKeysRef = useRef<Set<string>>(new Set());
  const screenRulerMaxComboRef = useRef<string[]>([]);
  const screenRulerOriginalHotkeyRef = useRef<string>(config.donkeyTools?.screenRuler?.hotkey || '');

  // EasyClip state & refs
  const [isRecordingEasyClipHotkey, setIsRecordingEasyClipHotkey] = useState(false);
  const [easyClipRecordedModifiers, setEasyClipRecordedModifiers] = useState<string[]>([]);
  const [easyClipHotkeyError, setEasyClipHotkeyError] = useState<string | null>(null);
  const easyClipPressedKeysRef = useRef<Set<string>>(new Set());
  const easyClipMaxComboRef = useRef<string[]>([]);
  const easyClipOriginalHotkeyRef = useRef<string>(config.donkeyTools?.easyClip?.hotkey || '');
  const [easyClipItemCount, setEasyClipItemCount] = useState<number>(0);
  const [easyClipClearSuccess, setEasyClipClearSuccess] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const importSnippetsFileRef = useRef<HTMLInputElement>(null);
  const [snippetFeedback, setSnippetFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testingNotificationVariant, setTestingNotificationVariant] = useState<string | null>(null);
  const [testNotificationFeedback, setTestNotificationFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [systemNotifTestStatus, setSystemNotifTestStatus] = useState<Record<string, 'success' | 'blocked'>>({});

  const handleTestSystemNotification = async (typeKey: string) => {
    const globalEnabled = formData.notifications?.enabled !== false;
    const notifKeyMap: Record<string, string> = {
      quickCap: 'quickCap',
      colorMaster: 'colorMaster',
      syncComplete: 'syncComplete',
      update: 'updates',
      clipboard: 'clipboard',
      error: 'errors',
    };
    const settingKey = notifKeyMap[typeKey];
    const isSpecificEnabled = settingKey ? (formData.notifications as any)?.[settingKey] !== false : true;

    if (!globalEnabled || !isSpecificEnabled) {
      setSystemNotifTestStatus((prev) => ({ ...prev, [typeKey]: 'blocked' }));
      setTimeout(() => {
        setSystemNotifTestStatus((prev) => {
          const next = { ...prev };
          delete next[typeKey];
          return next;
        });
      }, 3000);
      return;
    }

    try {
      if (window.electronAPI?.sendTestNotification) {
        const ok = await window.electronAPI.sendTestNotification(typeKey);
        setSystemNotifTestStatus((prev) => ({ ...prev, [typeKey]: ok ? 'success' : 'blocked' }));
      } else {
        setSystemNotifTestStatus((prev) => ({ ...prev, [typeKey]: 'blocked' }));
      }
    } catch {
      setSystemNotifTestStatus((prev) => ({ ...prev, [typeKey]: 'blocked' }));
    } finally {
      setTimeout(() => {
        setSystemNotifTestStatus((prev) => {
          const next = { ...prev };
          delete next[typeKey];
          return next;
        });
      }, 3000);
    }
  };

  const handleTestNotification = async (payload: any = 'success') => {
    const variantKey = typeof payload === 'string' ? payload : (payload.subType || payload.type || 'test');

    // Check if the tested non-magicplan notification is disabled by user settings
    if (typeof payload === 'string' || (payload && payload.type !== 'magicPlan')) {
      const typeKey = typeof payload === 'string' ? payload : payload.type;
      const globalEnabled = formData.notifications?.enabled !== false;
      if (!globalEnabled) {
        setTestNotificationFeedback({
          type: 'error',
          message: 'Tato notifikace je vypnutá (globální notifikace aplikace jsou vypnuté).',
        });
        setTimeout(() => setTestNotificationFeedback(null), 4000);
        return;
      }

      const notifKeyMap: Record<string, string> = {
        quickCap: 'quickCap',
        colorMaster: 'colorMaster',
        syncComplete: 'syncComplete',
        update: 'updates',
        clipboard: 'clipboard',
        error: 'errors',
        feedback: 'feedback',
      };

      const nameMap: Record<string, string> = {
        quickCap: 'Výstřižky QuickCap',
        colorMaster: 'Kapátko Eyedropper (ColorMaster)',
        syncComplete: 'Dokončení synchronizace dat',
        update: 'Nové verze a aktualizace',
        clipboard: 'Kopírování do schránky',
        error: 'Chyby aplikace a pády',
        feedback: 'Zpětná vazba',
      };

      const settingKey = notifKeyMap[typeKey];
      if (settingKey && (formData.notifications as any)?.[settingKey] === false) {
        setTestNotificationFeedback({
          type: 'error',
          message: `Tato notifikace je vypnutá (položka „${nameMap[typeKey] || typeKey}“ je vypnutá).`,
        });
        setTimeout(() => setTestNotificationFeedback(null), 4000);
        return;
      }
    }

    setTestingNotificationVariant(variantKey);
    setTestNotificationFeedback(null);
    try {
      if (window.electronAPI?.sendTestNotification) {
        const ok = await window.electronAPI.sendTestNotification(payload);
        if (ok) {
          setTestNotificationFeedback({
            type: variantKey === 'error' ? 'error' : 'success',
            message: payload?.customSuccessMessage || 'Testovací notifikace byla úspěšně odeslána do Windows.',
          });
        } else {
          setTestNotificationFeedback({
            type: 'error',
            message: 'Nepodařilo se zobrazit notifikaci.',
          });
        }
      } else {
        setTestNotificationFeedback({
          type: 'error',
          message: 'API notifikací není k dispozici.',
        });
      }
    } catch (err: any) {
      setTestNotificationFeedback({
        type: 'error',
        message: `Chyba: ${err?.message || String(err)}`,
      });
    } finally {
      setTestingNotificationVariant(null);
      setTimeout(() => {
        setTestNotificationFeedback(null);
      }, 4000);
    }
  };

  const magicPlanSituationsList = [
    {
      id: 1,
      name: 'Požadavek ve frontě (nový)',
      badge: 'Fronta',
      icon: 'schedule',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se nově objevil ve frontě (při předchozím načtení v plánu nebyl)',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Kritický úkol ve frontě (Nástěnka)' : 'Nový úkol ve frontě (Nástěnka)',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9006 / T1007] Servisní dotaz k objednávce (1h)' : '[R9002 / T1003] Úprava validačních hlášek formuláře (2h)',
      subType: (isCrit: boolean) => (isCrit ? 'critical' : 'queue'),
    },
    {
      id: 2,
      name: 'Požadavek u mě (nový)',
      badge: 'Vlastní',
      icon: 'lightbulb',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u mě (při předchozím načtení v plánu nebyl)',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Nový kritický požadavek v plánu' : 'Nový požadavek v plánu',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9005 / T1006] Oprava tiskové sestavy faktur (3h)' : '[R9001 / T1002] Implementace platební brány (8h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 3,
      name: 'Přiřazení z fronty ke mně',
      badge: 'Přiřazení',
      icon: 'lightbulb',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u mě a byl ve frontě',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Přiřazení kritického úkolu z fronty' : 'Přiřazení úkolu z fronty',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9011 / T1016] Konzultace nastavení e-shopu (2h)' : '[R9010 / T1015] Optimalizace databázových indexů (5h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 4,
      name: 'Úkol od kolegy ke mně',
      badge: 'Předání',
      icon: 'lightbulb',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u mě a byl u kolegy',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Kritický úkol od Novák byl přiřazen k vám' : 'Úkol od Novák byl přiřazen k vám',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9024 / T1029] Servisní kontrola databáze (2h)' : '[R9020 / T1025] Dokončení integrace API (3h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 5,
      name: 'Nový úkol u kolegy',
      badge: 'Kolega',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u kolegy a nebyl ve frontě',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Novák má nový kritický úkol' : 'Novák má nový úkol v plánu',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9038 / T1043] Reklamace tiskové sestavy (2h)' : '[R9035 / T1040] Příprava testovacích scénářů (4h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 6,
      name: 'Z fronty ke kolegovi',
      badge: 'Kolega',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u kolegy a byl ve frontě',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Novák byl přiřazen kritický úkol' : 'Novák byl přiřazen úkol z fronty',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9039 / T1044] Nastavení platebního terminálu (1h)' : '[R9036 / T1041] Nastavení exportů dat (3h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 7,
      name: 'Kolega převzal můj úkol',
      badge: 'Předání',
      icon: 'arrow_forward',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u kolegy a byl u mě',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Dvořák převzal váš kritický úkol' : 'Dvořák převzal váš úkol',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9025 / T1030] Úprava nastavení tiskárny (1h)' : '[R9021 / T1026] Revize tiskového formuláře (2h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 8,
      name: 'Přesun mezi kolegy',
      badge: 'Kolega',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil u kolegy a byl u jiného kolegy',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Kritický úkol přesunut: Novák ➜ Dvořák' : 'Úkol přesunut od Novák k Dvořák',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9043 / T1048] Prověření chyby exportu (2h)' : '[R9037 / T1042] Migrace databáze zákazníků (5h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 9,
      name: 'Vrácení mého úkolu do fronty',
      badge: 'Fronta',
      icon: 'close',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil ve frontě a byl u mě',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Váš kritický úkol byl vrácen do fronty' : 'Váš úkol byl vrácen do fronty',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9044 / T1049] Odložený servisní ticket (1h)' : '[R9031 / T1036] Odložená úprava filtrů (2h)',
      subType: (isCrit: boolean) => (isCrit ? 'critical' : 'queue'),
    },
    {
      id: 10,
      name: 'Vrácení od kolegy do fronty',
      badge: 'Fronta',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek se objevil ve frontě a byl u kolegy',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Kritický úkol od Novák byl vrácen do fronty' : 'Úkol od Novák byl vrácen do fronty',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9045 / T1050] Servisní požadavek čekající na díl (2h)' : '[R9033 / T1038] Pozastavený vývoj modulu (3h)',
      subType: (isCrit: boolean) => (isCrit ? 'critical' : 'queue'),
    },
    {
      id: 11,
      name: 'Zvýšení odhadu času úkolu',
      badge: 'Hodiny',
      icon: 'arrow_upward',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek u mě změnil čas na vyšší',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Zvýšení času u kritického úkolu' : 'Zvýšení odhadu času úkolu',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9005 / T1006] Oprava tiskárny (navýšeno: 2h ➜ 4h)' : '[R9001 / T1002] Implementace plateb (navýšeno: 4h ➜ 8h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 12,
      name: 'Snížení odhadu času úkolu',
      badge: 'Hodiny',
      icon: 'priority_high',
      iconColor: 'text-cyan-400',
      desc: 'Požadavek u mě změnil čas na nižší',
      getTitle: (_tt: 'dev' | 'service', isCrit: boolean) =>
        isCrit ? 'Snížení času u kritického úkolu' : 'Snížení odhadu času úkolu',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9005 / T1006] Oprava tiskárny (zkráceno: 4h ➜ 2h)' : '[R9001 / T1002] Implementace plateb (zkráceno: 8h ➜ 4h)',
      subType: (isCrit: boolean, tt: 'dev' | 'service') => (isCrit ? 'critical' : tt),
    },
    {
      id: 13,
      name: 'Můj úkol vyřešen (zmizel)',
      badge: 'Vyřešeno',
      icon: 'check',
      iconColor: 'text-cyan-400',
      desc: 'Úkol u mě zmizel a neobjevil se jinde (úkol vyřešen)',
      getTitle: () => 'Úkol v plánu vyřešen',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9007 / T1008] Vyřešení tiskové sestavy faktury' : '[R9003 / T1004] Refaktoring API a optimalizace dotazů',
      subType: () => 'completed',
    },
    {
      id: 14,
      name: 'Můj úkol splněn (solved)',
      badge: 'Vyřešeno',
      icon: 'check',
      iconColor: 'text-cyan-400',
      desc: 'Úkol u mě změnil stav na solved',
      getTitle: () => 'Úkol v plánu splněn',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9046 / T1051] Oprava konfigurace e-shopu' : '[R9041 / T1046] Revize zabezpečení formuláře',
      subType: () => 'completed',
    },
    {
      id: 15,
      name: 'Úkol kolegy vyřešen (zmizel)',
      badge: 'Kolega',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Kolegovi zmizel úkol a nikde jinde se neobjevil',
      getTitle: () => 'Novák dokončil úkol',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9047 / T1052] Servisní zásah na serveru' : '[R9040 / T1045] Nasazení nové verze na staging',
      subType: () => 'completed',
    },
    {
      id: 16,
      name: 'Kolega označil úkol za splněný',
      badge: 'Kolega',
      icon: 'person',
      iconColor: 'text-cyan-400',
      desc: 'Kolegovi úkol přepnul stav na solved',
      getTitle: () => 'Novák označil úkol za splněný',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9048 / T1053] Nastavení parametrů účetnictví' : '[R9042 / T1047] Úprava stylů a komponent',
      subType: () => 'completed',
    },
    {
      id: 17,
      name: 'Ve frontě změněn na kritický',
      badge: 'Kritický',
      icon: 'priority_high',
      iconColor: 'text-cyan-400',
      desc: 'Ve frontě se změnil úkol na kritický',
      getTitle: () => 'Úkol ve frontě změněn na kritický!',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9049 / T1054] Havárie pokladního serveru (nově priorita 1)' : '[R9034 / T1039] Výpadek platební brány (nově priorita 1)',
      subType: () => 'critical',
    },
    {
      id: 18,
      name: 'U mě změněn na kritický',
      badge: 'Kritický',
      icon: 'lightbulb',
      iconColor: 'text-cyan-400',
      desc: 'U mě se změnil úkol na kritický',
      getTitle: () => 'Váš úkol označen jako kritický!',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9051 / T1056] Zablokovaná synchronizace skladů (přiřazena priorita 1)' : '[R9050 / T1055] Výpadek synchronizace plateb (přiřazena priorita 1)',
      subType: () => 'critical',
    },
    {
      id: 19,
      name: 'Ve frontě zrušena kritičnost',
      badge: 'Fronta',
      icon: 'schedule',
      iconColor: 'text-cyan-400',
      desc: 'Ve frontě se změnil úkol na nekritický',
      getTitle: () => 'Úkol ve frontě již není kritický',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9049 / T1054] Běžný servisní dotaz (priorita snížena na běžnou)' : '[R9034 / T1039] Běžná konzultace (priorita snížena na běžnou)',
      subType: () => 'queue',
    },
    {
      id: 20,
      name: 'U mě zrušena kritičnost',
      badge: 'Vlastní',
      icon: 'lightbulb',
      iconColor: 'text-cyan-400',
      desc: 'U mě se změnil úkol na nekritický',
      getTitle: () => 'U vašeho úkolu zrušena kritická priorita',
      getBody: (tt: 'dev' | 'service', _isCrit: boolean) =>
        tt === 'service' ? '[R9051 / T1056] Standardní úprava číselníku (priorita snížena na běžnou)' : '[R9050 / T1055] Běžná oprava komponenty (priorita snížena na běžnou)',
      subType: (_isCrit: boolean, tt: 'dev' | 'service') => tt,
    },
  ];

  const evaluateMagicPlanNotification = (
    situationId: number,
    data: any
  ): {
    allowed: boolean;
    effectiveSituationId: number;
    reasonDisabled?: string;
    isFallback?: boolean;
    fallbackNote?: string;
  } => {
    const globalEnabled = data?.notifications?.enabled !== false;
    if (!globalEnabled) {
      return {
        allowed: false,
        effectiveSituationId: situationId,
        reasonDisabled: 'Globální notifikace aplikace jsou vypnuté',
      };
    }

    const mpEnabled = data?.notifications?.magicplan !== false;
    if (!mpEnabled) {
      return {
        allowed: false,
        effectiveSituationId: situationId,
        reasonDisabled: 'Notifikace modulu MagicPlan jsou vypnuté',
      };
    }

    const notifyNew = data?.magicplan?.notifyNewTasks !== false;
    const notifyChanges = data?.magicplan?.notifyTaskChanges !== false;
    const notifyColleagues = data?.magicplan?.notifyColleagueTasks !== false;
    const notifyCompleted = data?.magicplan?.notifyCompletedTasks !== false;

    // Situace 1, 2, 3, 9 -> Kategorie Nové úkoly
    if ([1, 2, 3, 9].includes(situationId)) {
      if (!notifyNew) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Nové úkoly" je vypnutá',
        };
      }
      return { allowed: true, effectiveSituationId: situationId };
    }

    // Situace 11, 12, 17, 18, 19, 20 -> Kategorie Změny v úkolech
    if ([11, 12, 17, 18, 19, 20].includes(situationId)) {
      if (!notifyChanges) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Změny v úkolech" je vypnutá',
        };
      }
      return { allowed: true, effectiveSituationId: situationId };
    }

    // Situace 13, 14 -> Kategorie Dokončené a uzavřené úkoly
    if ([13, 14].includes(situationId)) {
      if (!notifyCompleted) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Dokončené a uzavřené úkoly" je vypnutá',
        };
      }
      return { allowed: true, effectiveSituationId: situationId };
    }

    // Situace 15, 16 -> Kolegovi smazán / splněn (Kategorie Dokončené + Moji kolegové)
    if ([15, 16].includes(situationId)) {
      if (!notifyCompleted) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Dokončené a uzavřené úkoly" je vypnutá',
        };
      }
      if (!notifyColleagues) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Moji kolegové" je vypnutá',
        };
      }
      return { allowed: true, effectiveSituationId: situationId };
    }

    // Situace 5, 6, 8 -> Čistě kolegialní události (žádný fallback, netýkají se fronty ani mě)
    if ([5, 6, 8].includes(situationId)) {
      if (!notifyColleagues) {
        return {
          allowed: false,
          effectiveSituationId: situationId,
          reasonDisabled: 'Kategorie „Moji kolegové" je vypnutá',
        };
      }
      return { allowed: true, effectiveSituationId: situationId };
    }

    // Situace 4 -> Úkol od kolegy ke mně (fallback na Situaci 3: Přiřazení z fronty)
    if (situationId === 4) {
      if (notifyColleagues) {
        if (!notifyNew) {
          return {
            allowed: false,
            effectiveSituationId: 4,
            reasonDisabled: 'Kategorie „Nové úkoly" je vypnutá',
          };
        }
        return { allowed: true, effectiveSituationId: 4 };
      } else {
        if (!notifyNew) {
          return {
            allowed: false,
            effectiveSituationId: 3,
            reasonDisabled: 'Kategorie „Nové úkoly" i „Moji kolegové" jsou vypnuté',
          };
        }
        return {
          allowed: true,
          effectiveSituationId: 3,
          isFallback: true,
          fallbackNote: 'Fallback na Situaci 3 (Přiřazení z fronty), protože notifikace kolegů jsou vypnuté',
        };
      }
    }

    // Situace 10 -> Kolega vrátil do fronty (fallback na Situaci 1: Nový úkol ve frontě)
    if (situationId === 10) {
      if (notifyColleagues) {
        if (!notifyNew) {
          return {
            allowed: false,
            effectiveSituationId: 10,
            reasonDisabled: 'Kategorie „Nové úkoly" je vypnutá',
          };
        }
        return { allowed: true, effectiveSituationId: 10 };
      } else {
        if (!notifyNew) {
          return {
            allowed: false,
            effectiveSituationId: 1,
            reasonDisabled: 'Kategorie „Nové úkoly" i „Moji kolegové" jsou vypnuté',
          };
        }
        return {
          allowed: true,
          effectiveSituationId: 1,
          isFallback: true,
          fallbackNote: 'Fallback na Situaci 1 (Nový požadavek ve frontě), protože notifikace kolegů jsou vypnuté',
        };
      }
    }

    // Situace 7 -> Kolega převzal můj úkol (fallback na Situaci 9: Úkol odebrán / vrácen do fronty)
    if (situationId === 7) {
      if (notifyColleagues) {
        return { allowed: true, effectiveSituationId: 7 };
      } else {
        if (!notifyNew) {
          return {
            allowed: false,
            effectiveSituationId: 9,
            reasonDisabled: 'Kategorie „Nové úkoly" i „Moji kolegové" jsou vypnuté',
          };
        }
        return {
          allowed: true,
          effectiveSituationId: 9,
          isFallback: true,
          fallbackNote: 'Fallback na Situaci 9 (Úkol odebrán z vašeho sloupce), protože notifikace kolegů jsou vypnuté',
        };
      }
    }

    return { allowed: true, effectiveSituationId: situationId };
  };

  const handleSendMagicPlanTestNotification = (
    sitId: number,
    taskType: 'dev' | 'service',
    isCrit: boolean
  ) => {
    const evalResult = evaluateMagicPlanNotification(sitId, formData);
    if (!evalResult.allowed) {
      setTestNotificationFeedback({
        type: 'error',
        message: `Tato notifikace je vypnutá (${evalResult.reasonDisabled}).`,
      });
      setTimeout(() => setTestNotificationFeedback(null), 4000);
      return;
    }

    const effectiveId = evalResult.effectiveSituationId;
    const sit = magicPlanSituationsList.find((s) => s.id === effectiveId) || magicPlanSituationsList[0];
    const title = sit.getTitle(taskType, isCrit);
    const body = sit.getBody(taskType, isCrit);
    const subType = sit.subType(isCrit, taskType);
    handleTestNotification({
      type: 'magicPlan',
      subType,
      title,
      body,
      mpSituation: sit.id,
      isCritical: isCrit,
      taskType,
      customSuccessMessage: evalResult.isFallback
        ? `Notifikace odeslána (${evalResult.fallbackNote}).`
        : undefined,
    });
  };

  // MagicPlan test state & handler
  const [isTestingMagicPlan, setIsTestingMagicPlan] = useState(false);
  const [magicPlanTestResult, setMagicPlanTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleTestMagicPlan = async () => {
    setIsTestingMagicPlan(true);
    setMagicPlanTestResult(null);
    try {
      if (window.electronAPI?.refreshMagicPlan) {
        const result = await window.electronAPI.refreshMagicPlan();
        if (result?.isOffline || result?.error) {
          setMagicPlanTestResult({
            ok: false,
            message: result.error || 'Server plánu je nedostupný (zkontrolujte připojení k interní síti / VPN).',
          });
        } else {
          setMagicPlanTestResult({
            ok: true,
            message: `Připojeno k plánu (${result?.planRange || 'akt. období'}). Načteno ${result?.myTasks?.length || 0} mých úkolů (${result?.totalMyHours || 0}h) a ${result?.unassignedTasks?.length || 0} ve frontě.`,
          });
        }
      } else {
        setMagicPlanTestResult({
          ok: false,
          message: 'API MagicPlan není v aplikaci k dispozici.',
        });
      }
    } catch (err: any) {
      setMagicPlanTestResult({
        ok: false,
        message: err?.message || 'Chyba při komunikaci se serverem plánu.',
      });
    } finally {
      setIsTestingMagicPlan(false);
    }
  };

  // Developer mode state & easter egg click counter
  const [isDevelop, setIsDevelop] = useState<boolean>(() => {
    try {
      if (localStorage.getItem('iadonkey_develop_mode') === 'false') return false;
      if (localStorage.getItem('iadonkey_develop_mode') === 'true') return true;
    } catch {}
    return Boolean(config?.developMode);
  });

  useEffect(() => {
    if (config?.developMode !== undefined) {
      try {
        if (localStorage.getItem('iadonkey_develop_mode') === 'false') {
          setIsDevelop(false);
          return;
        }
        if (localStorage.getItem('iadonkey_develop_mode') === 'true') {
          setIsDevelop(true);
          return;
        }
      } catch {}
      setIsDevelop(Boolean(config.developMode));
    }
  }, [config?.developMode]);
  const versionClickCountRef = useRef(0);
  const versionClickTimerRef = useRef<any>(null);
  const [developUnlockMessage, setDevelopUnlockMessage] = useState<string | null>(null);
  const [versionClickHint, setVersionClickHint] = useState<string | null>(null);
  const [isSimulatingCrash, setIsSimulatingCrash] = useState(false);
  const [simulatedCrashSuccess, setSimulatedCrashSuccess] = useState<string | null>(null);

  const handleVersionClick = () => {
    if (isDevelop) {
      versionClickCountRef.current += 1;
      const currentClicks = versionClickCountRef.current;

      if (versionClickTimerRef.current) {
        clearTimeout(versionClickTimerRef.current);
      }
      versionClickTimerRef.current = setTimeout(() => {
        versionClickCountRef.current = 0;
      }, 1500);

      if (currentClicks >= 2) {
        versionClickCountRef.current = 0;
        setDevelopUnlockMessage('Již jste vývojář. Vývojové prostředí vypnete v záložce Vývojář.');
        setTimeout(() => {
          setDevelopUnlockMessage(null);
        }, 5000);
      }
      return;
    }

    versionClickCountRef.current += 1;
    const currentClicks = versionClickCountRef.current;

    if (versionClickTimerRef.current) {
      clearTimeout(versionClickTimerRef.current);
    }
    versionClickTimerRef.current = setTimeout(() => {
      versionClickCountRef.current = 0;
      setVersionClickHint(null);
    }, 1500);

    if (currentClicks >= 10) {
      versionClickCountRef.current = 0;
      setVersionClickHint(null);
      setIsDevelop(true);
      try {
        localStorage.setItem('iadonkey_develop_mode', 'true');
      } catch {}
      const updatedCfg = { ...formData, developMode: true };
      setFormData(updatedCfg);
      onSaveConfig(updatedCfg);
      setDevelopUnlockMessage(
        'Vývojářský režim byl úspěšně aktivován! V bočním menu se zobrazila nová záložka Vývojář.'
      );
      setTimeout(() => {
        setDevelopUnlockMessage(null);
      }, 5000);

      window.electronAPI?.logAction?.({
        type: 'action',
        title: 'Vývojářský režim aktivován',
        details: 'Aktivace proběhla 10× kliknutím na verzi aplikace',
        status: 'success',
      });
    } else if (currentClicks >= 5) {
      const remaining = 10 - currentClicks;
      setVersionClickHint(`Ještě ${remaining} ${remaining === 1 ? 'kliknutí' : remaining < 5 ? 'kliknutí' : 'kliknutí'} pro odemknutí vývojářského režimu...`);
    }
  };

  const handleDisableDevelopMode = () => {
    setIsDevelop(false);
    try {
      localStorage.setItem('iadonkey_develop_mode', 'false');
    } catch {}
    const updatedCfg = { ...formData, developMode: false };
    setFormData(updatedCfg);
    onSaveConfig(updatedCfg);
    setActiveTab('system');
    setDevelopUnlockMessage('Vývojářský režim byl deaktivován a skryt.');
    setTimeout(() => {
      setDevelopUnlockMessage(null);
    }, 4000);
    window.electronAPI?.logAction?.({
      type: 'action',
      title: 'Vývojářský režim deaktivován',
      details: 'Vypnuto uživatelem v nastavení',
      status: 'info',
    });
  };

  const handleOpenDevTools = () => {
    try {
      window.electronAPI?.openDevTools?.();
    } catch (err) {
      console.error('[Settings] Failed to toggle DevTools:', err);
    }
  };

  const handleSimulateCrash = async () => {
    setIsSimulatingCrash(true);
    setSimulatedCrashSuccess(null);
    try {
      if (window.electronAPI?.simulateTestCrash) {
        const filePath = await window.electronAPI.simulateTestCrash();
        setSimulatedCrashSuccess(`Testovací crashlog byl vygenerován: ${filePath || 'crashlog'}`);
        await loadDiagnostics();
      }
    } catch (err: any) {
      console.error('[Settings] Failed to simulate crash:', err);
    } finally {
      setIsSimulatingCrash(false);
      setTimeout(() => {
        setSimulatedCrashSuccess(null);
      }, 6000);
    }
  };

  // Diagnostics & Logs state
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [crashLogs, setCrashLogs] = useState<CrashLogEntry[]>([]);
  const [selectedCrashLog, setSelectedCrashLog] = useState<CrashLogEntry | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [diagnosticsCopiedId, setDiagnosticsCopiedId] = useState<string | null>(null);
  const [diagnosticsExportedId, setDiagnosticsExportedId] = useState<string | null>(null);
  const [isExportingCrashId, setIsExportingCrashId] = useState<string | null>(null);
  const [showAllActionLogs, setShowAllActionLogs] = useState(false);
  const [showAllCrashLogs, setShowAllCrashLogs] = useState(false);

  const loadDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    try {
      if (window.electronAPI?.getActionLogs) {
        const acts = await window.electronAPI.getActionLogs();
        setActionLogs(acts || []);
      }
      if (window.electronAPI?.getCrashLogs) {
        const crashes = await window.electronAPI.getCrashLogs();
        setCrashLogs(crashes || []);
      }
    } catch (err) {
      console.error('[Settings] Failed to load diagnostics:', err);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  useEffect(() => {
    if (activeTab === 'help' || activeTab === 'system' || activeTab === 'updates' || activeTab === 'develop') {
      loadDiagnostics();
    }
  }, [activeTab]);

  const handleClearActionLogs = async () => {
    try {
      if (window.electronAPI?.clearActionLogs) {
        await window.electronAPI.clearActionLogs();
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('[Settings] Failed to clear action logs:', err);
    }
  };

  const handleClearCrashLogs = async () => {
    try {
      if (window.electronAPI?.clearCrashLogs) {
        await window.electronAPI.clearCrashLogs();
        setSelectedCrashLog(null);
        await loadDiagnostics();
      }
    } catch (err) {
      console.error('[Settings] Failed to clear crash logs:', err);
    }
  };

  const handleOpenCrashLogFolder = async () => {
    try {
      if (window.electronAPI?.openCrashLogFolder) {
        await window.electronAPI.openCrashLogFolder();
      }
    } catch (err) {
      console.error('[Settings] Failed to open crash log folder:', err);
    }
  };

  const handleCopyCrashLog = (log: CrashLogEntry) => {
    try {
      navigator.clipboard.writeText(log.fullContent);
      setDiagnosticsCopiedId(log.id);
      setTimeout(() => setDiagnosticsCopiedId(null), 2500);
    } catch (err) {
      console.error('[Settings] Failed to copy crash report:', err);
    }
  };

  const handleExportCrashLog = async (log: CrashLogEntry) => {
    try {
      if (window.electronAPI?.exportCrashReport) {
        setIsExportingCrashId(log.id);
        const res = await window.electronAPI.exportCrashReport(log.fileName);
        if (res?.success) {
          setDiagnosticsExportedId(log.id);
          setTimeout(() => setDiagnosticsExportedId(null), 3000);
        }
      }
    } catch (err) {
      console.error('[Settings] Failed to export crash report:', err);
    } finally {
      setIsExportingCrashId(null);
    }
  };

  useEffect(() => {
    if (snippetFeedback) {
      const timer = setTimeout(() => setSnippetFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [snippetFeedback]);

  // MagicPlan Developer Diagnostics state
  const [magicPlanDevLogs, setMagicPlanDevLogs] = useState<{
    cachedData: any | null;
    diskCache: { lastUpdated: string; tasks: Record<string, any> };
    history: any[];
  } | null>(null);
  const [isRefreshingMagicPlanLogs, setIsRefreshingMagicPlanLogs] = useState(false);
  const [magicPlanDevTab, setMagicPlanDevTab] = useState<'tasks' | 'history' | 'raw'>('tasks');
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null);
  const [magicPlanCopied, setMagicPlanCopied] = useState(false);

  const fetchMagicPlanDevLogs = useCallback(async () => {
    if (!window.electronAPI?.getMagicPlanDevLogs) return;
    try {
      setIsRefreshingMagicPlanLogs(true);
      const res = await window.electronAPI.getMagicPlanDevLogs();
      setMagicPlanDevLogs(res);
    } catch (err) {
      console.error('[Settings] Failed to fetch MagicPlan dev logs:', err);
    } finally {
      setIsRefreshingMagicPlanLogs(false);
    }
  }, []);

  const handleForceMagicPlanQuery = async () => {
    if (!window.electronAPI?.refreshMagicPlan) return;
    try {
      setIsRefreshingMagicPlanLogs(true);
      await window.electronAPI.refreshMagicPlan();
      await fetchMagicPlanDevLogs();
    } catch (err) {
      console.error('[Settings] Failed to force refresh MagicPlan:', err);
      setIsRefreshingMagicPlanLogs(false);
    }
  };

  const [magicPlanPersons, setMagicPlanPersons] = useState<{ id: string; name: string }[]>([]);

  const loadMagicPlanPersons = useCallback(async () => {
    if (!window.electronAPI?.getMagicPlanData) return;
    try {
      const data = await window.electronAPI.getMagicPlanData();
      if (data?.availablePersons && Array.isArray(data.availablePersons)) {
        setMagicPlanPersons(data.availablePersons);
      }
    } catch (err) {
      console.warn('[Settings] Failed to fetch available MagicPlan persons:', err);
    }
  }, []);

  useEffect(() => {
    if (formData.extensions?.magicplan) {
      loadMagicPlanPersons();
    }
  }, [formData.extensions?.magicplan, activeTab, loadMagicPlanPersons]);

  useEffect(() => {
    if (activeTab === 'develop' && formData.extensions?.magicplan) {
      fetchMagicPlanDevLogs();
    }
  }, [activeTab, formData.extensions?.magicplan, fetchMagicPlanDevLogs]);

  useEffect(() => {
    if (!window.electronAPI?.onMagicPlanDataUpdated) return;
    const cleanup = window.electronAPI.onMagicPlanDataUpdated((data: any) => {
      if (data?.availablePersons && Array.isArray(data.availablePersons)) {
        setMagicPlanPersons(data.availablePersons);
      }
      if (activeTab === 'develop' && formData.extensions?.magicplan) {
        fetchMagicPlanDevLogs();
      }
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [activeTab, formData.extensions?.magicplan, fetchMagicPlanDevLogs]);

  const allAvailablePersons = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of magicPlanPersons || []) {
      if (p && p.id) {
        const idStr = String(p.id).trim();
        if (idStr) map.set(idStr, String(p.name || idStr));
      }
    }
    const cachedPersons = magicPlanDevLogs?.cachedData?.availablePersons;
    if (Array.isArray(cachedPersons)) {
      for (const p of cachedPersons) {
        if (p && p.id) {
          const idStr = String(p.id).trim();
          if (idStr && !map.has(idStr)) map.set(idStr, String(p.name || idStr));
        }
      }
    }
    const userCols = formData.magicplan?.userColumns || (formData.magicplan?.userColumn ? [formData.magicplan.userColumn] : []);
    for (const u of userCols) {
      if (u !== undefined && u !== null) {
        const uStr = String(u).trim();
        if (uStr && !map.has(uStr)) {
          map.set(uStr, uStr);
        }
      }
    }
    if (formData.magicplan?.unassignedColumn !== undefined && formData.magicplan?.unassignedColumn !== null) {
      const unStr = String(formData.magicplan.unassignedColumn).trim();
      if (unStr && !map.has(unStr)) {
        map.set(unStr, unStr);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [magicPlanPersons, magicPlanDevLogs?.cachedData?.availablePersons, formData.magicplan?.userColumns, formData.magicplan?.userColumn, formData.magicplan?.unassignedColumn]);

  const handleCopyMagicPlanJson = () => {
    if (!magicPlanDevLogs) return;
    try {
      navigator.clipboard.writeText(JSON.stringify(magicPlanDevLogs, null, 2));
      setMagicPlanCopied(true);
      setTimeout(() => setMagicPlanCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy MagicPlan JSON:', err);
    }
  };

  const activeExtensionsCount = useMemo(() => {
    let count = 0;
    if (formData.extensions?.magicgate) count++;
    if (formData.extensions?.mlog) count++;
    if (formData.extensions?.github) count++;
    if (formData.extensions?.vscode) count++;
    if (formData.extensions?.androidStudio) count++;
    if (formData.extensions?.magicplan) count++;
    if (formData.extensions?.donkeyTools) count++;
    return count;
  }, [formData.extensions]);

  const stopOAuthPolling = () => {
    if (oauthPollingRef.current) {
      clearTimeout(oauthPollingRef.current);
      oauthPollingRef.current = null;
    }
  };

  const activeGitHubToken = useMemo(() => {
    if (formData.github?.authMode === 'oauth') {
      return formData.github?.oauthToken?.trim() || '';
    }
    return formData.github?.token?.trim() || '';
  }, [formData.github?.authMode, formData.github?.token, formData.github?.oauthToken]);

  const handleTestGitHub = async (customSettings?: Partial<import('../types').GithubSettings>) => {
    const currentGithub = { ...formData.github, ...customSettings };
    const isOAuth = currentGithub.authMode === 'oauth';
    const activeToken = isOAuth ? currentGithub.oauthToken?.trim() : currentGithub.token?.trim();
    if (!activeToken) return;

    setIsTestingGitHub(true);
    setGitHubTestResult(null);
    try {
      if (window.electronAPI?.testGitHubConnection) {
        const res = await window.electronAPI.testGitHubConnection({
          authMode: currentGithub.authMode || 'pat',
          username: currentGithub.username,
          token: currentGithub.token || '',
          clientId: currentGithub.clientId,
          oauthToken: currentGithub.oauthToken,
          oauthUser: currentGithub.oauthUser,
          org: currentGithub.org,
          apiUrl: currentGithub.apiUrl,
        });
        setGitHubTestResult(res);
      } else {
        setGitHubTestResult({ ok: false, error: 'Funkce není dostupná mimo aplikaci Electron.' });
      }
    } catch (err: any) {
      setGitHubTestResult({ ok: false, error: err?.message || 'Chyba při volání testu připojení.' });
    } finally {
      setIsTestingGitHub(false);
    }
  };

  const handleStartGitHubOAuth = async () => {
    const clientId = formData.github?.clientId?.trim() || 'Ov23liKwJB5JD7CEPsO3';
    setDeviceFlowError(null);
    setIsConnectingOAuth(true);
    stopOAuthPolling();

    try {
      if (!window.electronAPI?.startGitHubDeviceFlow) {
        setDeviceFlowError('OAuth Device Flow není v této verzi dostupný.');
        setIsConnectingOAuth(false);
        return;
      }

      const res = await window.electronAPI.startGitHubDeviceFlow({
        clientId,
        apiUrl: formData.github?.apiUrl,
      });

      if (!res.success || !res.deviceCode || !res.userCode) {
        setDeviceFlowError(res.error || 'Inicializace přihlášení selhala.');
        setIsConnectingOAuth(false);
        return;
      }

      const expiresAt = Date.now() + (res.expiresIn || 900) * 1000;
      const intervalSec = res.interval || 5;

      setDeviceFlowData({
        userCode: res.userCode,
        verificationUri: res.verificationUri || 'https://github.com/login/device',
        deviceCode: res.deviceCode,
        interval: intervalSec,
        expiresAt,
      });

      // Automatically copy user code to clipboard
      try {
        await navigator.clipboard.writeText(res.userCode);
        setUserCodeCopied(true);
        setTimeout(() => setUserCodeCopied(false), 4000);
      } catch {}

      // Open browser with verification url
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(res.verificationUri || 'https://github.com/login/device');
      }

      // Start polling
      const poll = async () => {
        if (Date.now() > expiresAt) {
          setDeviceFlowError('Platnost ověřovacího kódu vypršela. Zkuste to prosím znovu.');
          setDeviceFlowData(null);
          setIsConnectingOAuth(false);
          return;
        }

        try {
          const pollRes = await window.electronAPI.pollGitHubDeviceToken({
            clientId,
            deviceCode: res.deviceCode!,
            apiUrl: formData.github?.apiUrl,
          });

          if (pollRes.status === 'success' && pollRes.accessToken) {
            const updatedGithub: import('../types').GithubSettings = {
              ...formData.github,
              authMode: 'oauth',
              token: formData.github?.token || '',
              clientId,
              oauthToken: pollRes.accessToken,
              oauthUser: pollRes.user,
            };
            const updatedConfig = {
              ...formData,
              github: updatedGithub,
            };
            setFormData(updatedConfig);
            handleSave(updatedConfig);

            setDeviceFlowData(null);
            setIsConnectingOAuth(false);
            setDeviceFlowError(null);

            // Run connection test with newly acquired token
            handleTestGitHub(updatedGithub);
            return;
          }

          if (pollRes.status === 'pending') {
            oauthPollingRef.current = setTimeout(poll, intervalSec * 1000);
          } else if (pollRes.status === 'slow_down') {
            oauthPollingRef.current = setTimeout(poll, (intervalSec + 5) * 1000);
          } else {
            setDeviceFlowError(pollRes.error || 'Autorizace byla zamítnuta nebo vypršela.');
            setDeviceFlowData(null);
            setIsConnectingOAuth(false);
          }
        } catch (err: any) {
          setDeviceFlowError(err?.message || 'Chyba při komunikaci se serverem.');
          setDeviceFlowData(null);
          setIsConnectingOAuth(false);
        }
      };

      oauthPollingRef.current = setTimeout(poll, intervalSec * 1000);
    } catch (err: any) {
      setDeviceFlowError(err?.message || 'Chyba při spuštění přihlášení.');
      setIsConnectingOAuth(false);
    }
  };

  const handleCancelGitHubOAuth = () => {
    stopOAuthPolling();
    setDeviceFlowData(null);
    setIsConnectingOAuth(false);
    setDeviceFlowError(null);
  };

  const handleDisconnectGitHubOAuth = () => {
    stopOAuthPolling();
    setDeviceFlowData(null);
    setIsConnectingOAuth(false);
    setGitHubTestResult(null);

    const updatedGithub: import('../types').GithubSettings = {
      ...formData.github,
      authMode: 'oauth',
      token: formData.github?.token || '',
      oauthToken: '',
      oauthUser: undefined,
    };
    const updatedConfig = {
      ...formData,
      github: updatedGithub,
    };
    setFormData(updatedConfig);
    handleSave(updatedConfig);
  };

  const [isDownloadingIcons, setIsDownloadingIcons] = useState(false);
  const [downloadIconsResult, setDownloadIconsResult] = useState<{
    ok: boolean;
    count?: number;
    downloadedAt?: string;
    error?: string;
  } | null>(null);

  const handleDownloadIcons = async () => {
    setIsDownloadingIcons(true);
    setDownloadIconsResult(null);
    try {
      if (window.electronAPI?.downloadMaterialIcons) {
        const res = await window.electronAPI.downloadMaterialIcons();
        if (res.success) {
          setDownloadIconsResult({
            ok: true,
            count: res.count,
            downloadedAt: res.downloadedAt,
          });
          const updated = {
            ...formData,
            iconsLastDownloadedAt: res.downloadedAt,
            iconsCount: res.count,
          };
          setFormData(updated);
          handleSave(updated);
        } else {
          setDownloadIconsResult({
            ok: false,
            error: res.error || 'Chyba při stahování ikon.',
          });
        }
      } else {
        setDownloadIconsResult({
          ok: false,
          error: 'Funkce není dostupná mimo aplikaci Electron.',
        });
      }
    } catch (err: any) {
      setDownloadIconsResult({
        ok: false,
        error: err?.message || 'Chyba při stahování ikon.',
      });
    } finally {
      setIsDownloadingIcons(false);
    }
  };

  // Synchronization progress & smooth 2s minimum animation state
  const [syncPhase, setSyncPhase] = useState<'idle' | 'syncing' | 'success'>('idle');
  const [visualProgress, setVisualProgress] = useState(0);
  const syncStartTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isSyncing) {
      if (syncPhase !== 'syncing') {
        setSyncPhase('syncing');
        syncStartTimeRef.current = Date.now();
        setVisualProgress(5);
      }
    }
  }, [isSyncing, syncPhase]);

  useEffect(() => {
    if (syncPhase !== 'syncing') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const MIN_SYNC_DURATION_MS = 2000;

    const tick = () => {
      const now = Date.now();
      const startTime = syncStartTimeRef.current || now;
      const elapsed = now - startTime;

      if (isSyncing) {
        // While backend is still syncing:
        // Progress smoothly advances towards either real percentage or up to 88% over MIN_SYNC_DURATION_MS
        const realPercent = syncProgress?.percentage ?? 0;
        const timePercent = Math.min((elapsed / MIN_SYNC_DURATION_MS) * 85, 88);
        const targetPercent = Math.max(realPercent, timePercent, 8);

        setVisualProgress((prev) => {
          const step = Math.max((targetPercent - prev) * 0.15, 0.5);
          return Math.min(prev + step, targetPercent);
        });

        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Backend finished: ensure minimum MIN_SYNC_DURATION_MS elapsed time
        if (elapsed < MIN_SYNC_DURATION_MS) {
          const remainingTime = MIN_SYNC_DURATION_MS - elapsed;
          setVisualProgress((prev) => {
            const step = Math.max((100 - prev) / (remainingTime / 16), 0.8);
            return Math.min(prev + step, 99);
          });
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          // Both backend finished and minimum duration elapsed
          setVisualProgress(100);
          setSyncPhase('success');
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [syncPhase, isSyncing, syncProgress]);

  // Transition from success state back to idle after 1.5s
  useEffect(() => {
    if (syncPhase === 'success') {
      const timer = setTimeout(() => {
        setSyncPhase('idle');
        setVisualProgress(0);
        syncStartTimeRef.current = null;
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [syncPhase]);

  const handleTriggerSync = async () => {
    if (syncPhase !== 'idle') return;
    setSyncPhase('syncing');
    syncStartTimeRef.current = Date.now();
    setVisualProgress(5);
    await onTriggerSync();
  };

  const handleAddCustomSnippet = () => {
    const newSnippet: CustomSnippet = {
      id: `cs-${Date.now()}`,
      name: '',
      location: '',
      icon: 'content_paste',
      shortcuts: [],
    };
    const currentCustom = formData.snippets?.custom || [];
    const updated = {
      ...formData,
      snippets: {
        ...formData.snippets,
        custom: [newSnippet, ...currentCustom],
      },
    };
    setFormData(updated);
    handleSave(updated);
  };

  const handleExportCustomSnippets = () => {
    const list = formData.snippets?.custom || [];
    if (list.length === 0) return;

    // Clean export objects without internal id
    const exportData = list.map((snip) => ({
      name: snip.name || '',
      location: snip.location || '',
      icon: snip.icon || 'content_paste',
      shortcuts: (snip.shortcuts || []).map((s) => (s.startsWith(':') ? s : `:${s}`)),
    }));

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `iadonkey_snippety_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCustomSnippets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Normalize raw items: could be an array, or an object wrapping custom/snippets/items
        let rawList: any[] = [];
        if (Array.isArray(parsed)) {
          rawList = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.custom)) {
            rawList = parsed.custom;
          } else if (Array.isArray(parsed.snippets)) {
            rawList = parsed.snippets;
          } else if (Array.isArray(parsed.items)) {
            rawList = parsed.items;
          }
        }

        if (!rawList || rawList.length === 0) {
          setSnippetFeedback({
            type: 'error',
            message: 'Vybraný soubor neobsahuje žádné platné položky snippetů.',
          });
          return;
        }

        const importedSnippets: CustomSnippet[] = [];
        const now = Date.now();

        rawList.forEach((raw, idx) => {
          if (!raw || typeof raw !== 'object') return;

          const rawName = String(raw.name || '').trim();
          const rawLocation = String(raw.location || raw.value || raw.text || '');
          const rawIcon = String(raw.icon || 'content_paste').trim();

          let rawShortcuts: string[] = [];
          if (Array.isArray(raw.shortcuts)) {
            rawShortcuts = raw.shortcuts.map((s: any) => String(s).trim());
          } else if (typeof raw.shortcut === 'string') {
            rawShortcuts = [raw.shortcut.trim()];
          }

          // If rawName starts with colon (e.g. ":iban"), ensure it is in shortcuts
          if (rawName.startsWith(':')) {
            if (!rawShortcuts.includes(rawName)) {
              rawShortcuts.unshift(rawName);
            }
          }

          const formattedShortcuts = rawShortcuts
            .filter(Boolean)
            .map((s) => {
              const clean = s.replace(/^:+/, '');
              return clean ? `:${clean.toLowerCase()}` : '';
            })
            .filter((s, sIdx, arr) => s && arr.indexOf(s) === sIdx);

          importedSnippets.push({
            id: `cs-${now}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            name: rawName || 'Importovaný snippet',
            location: rawLocation,
            icon: rawIcon || 'content_paste',
            shortcuts: formattedShortcuts,
          });
        });

        if (importedSnippets.length === 0) {
          setSnippetFeedback({
            type: 'error',
            message: 'Ze souboru se nepodařilo načíst žádné snippety.',
          });
          return;
        }

        // Prepend imported snippets to existing ones
        const currentCustom = formData.snippets?.custom || [];
        const updatedCustom = [...importedSnippets, ...currentCustom];
        const updated = {
          ...formData,
          snippets: {
            ...formData.snippets,
            custom: updatedCustom,
          },
        };

        setFormData(updated);
        handleSave(updated);
        setSnippetFeedback({
          type: 'success',
          message: `Úspěšně importováno ${importedSnippets.length} ${
            importedSnippets.length === 1 ? 'snippet' : importedSnippets.length < 5 ? 'snippety' : 'snippetů'
          }.`,
        });
      } catch (err: any) {
        setSnippetFeedback({
          type: 'error',
          message: `Chyba při čtení souboru: ${err?.message || 'Neplatný formát JSON.'}`,
        });
      }
    };

    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleUpdateCustomSnippet = (id: string, patch: Partial<CustomSnippet>) => {
    const currentCustom = formData.snippets?.custom || [];
    const updatedCustom = currentCustom.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    );
    const updated = {
      ...formData,
      snippets: {
        ...formData.snippets,
        custom: updatedCustom,
      },
    };
    setFormData(updated);
    handleSave(updated);
  };

  const handleRemoveCustomSnippet = (id: string) => {
    const currentCustom = formData.snippets?.custom || [];
    const updatedCustom = currentCustom.filter((item) => item.id !== id);
    const updated = {
      ...formData,
      snippets: {
        ...formData.snippets,
        custom: updatedCustom,
      },
    };
    setFormData(updated);
    handleSave(updated);
  };

  const handleAddShortcut = (id: string, rawVal: string) => {
    const clean = rawVal.trim().replace(/^:+/, '');
    if (!clean) return;
    const formatted = `:${clean.toLowerCase()}`;
    const currentCustom = formData.snippets?.custom || [];
    const target = currentCustom.find((item) => item.id === id);
    if (!target) return;
    if ((target.shortcuts || []).includes(formatted)) return;

    handleUpdateCustomSnippet(id, {
      shortcuts: [...(target.shortcuts || []), formatted],
    });
  };

  const handleRemoveShortcut = (id: string, shortcutIdx: number) => {
    const currentCustom = formData.snippets?.custom || [];
    const target = currentCustom.find((item) => item.id === id);
    if (!target) return;
    const updatedShortcuts = (target.shortcuts || []).filter((_, idx) => idx !== shortcutIdx);
    handleUpdateCustomSnippet(id, { shortcuts: updatedShortcuts });
  };

  // Compute indexed search items counts (main items, git items, subitems, dynamic system snippets, and total)
  const { mainItemsCount, gitItemsCount, subItemsCount, snippetsCount, totalIndexedCount } = useMemo(() => {
    const gitCount = items.filter((it) => it.settings === 'git' || it.sourceId === 'github').length;
    const mainOnlyCount = items.filter((it) => !(it.settings === 'git' || it.sourceId === 'github')).length;
    const subCount = items.reduce((acc, it) => acc + (it.options?.length || 0), 0);
    const snipCount = getDynamicSnippets(':', formData.snippets).length;
    return {
      mainItemsCount: mainOnlyCount,
      gitItemsCount: gitCount,
      subItemsCount: subCount,
      snippetsCount: snipCount,
      totalIndexedCount: mainOnlyCount + gitCount + subCount + snipCount,
    };
  }, [items, formData.snippets]);

  // Keep formData in sync when config prop updates from main process
  useEffect(() => {
    setFormData(config);
    if (!isRecordingHotkey) {
      originalHotkeyRef.current = config.hotkey || 'Ctrl+Alt+Space';
    }
    if (config.primaryColor) {
      applyPrimaryColor(config.primaryColor);
    }
    if (config.actionsColor) {
      applyActionsColor(config.actionsColor);
    }
  }, [config, isRecordingHotkey]);

  // Clean up global hotkey pause if component unmounts
  useEffect(() => {
    return () => {
      window.electronAPI?.resumeGlobalHotkey?.();
    };
  }, []);

  // Reset scrollbar when switching tabs in settings modal
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
    if (activeTab === 'donkey-tools') {
      loadRecentQuickCaps();
      loadEasyClipItemCount();
    }
  }, [activeTab]);

  // Listen to EasyClip items updates in real time
  useEffect(() => {
    const unsub = window.electronAPI?.onEasyClipItemsUpdated?.((items) => {
      if (Array.isArray(items)) {
        setEasyClipItemCount(items.length);
      }
    });
    return () => unsub?.();
  }, []);

  // Check if at least one item (or any nested option) has settings === 'magicgate'
  const hasMagicGate = (item: LauncherItem): boolean => {
    if (item.settings === 'magicgate') return true;
    if (item.options && item.options.some(hasMagicGate)) return true;
    return false;
  };

  const hasCustomMapping = Boolean(
    editingSource?.mapping &&
    Object.values(editingSource.mapping).some((r) => r && (r.value || r.type === 'fixed'))
  );
  const hasMissingName = detectedKeys.length > 0 && !detectedKeys.includes('name');
  const hasStructureError = Boolean(inspectError || hasMissingName || editingSource?.error || hasCustomMapping);
  const hasMagicGateItem = items.some(hasMagicGate);

  // New source templates
  const initialFileSource: FileSource = {
    id: `file-${Date.now()}`,
    name: 'Nový lokální soubor',
    type: 'file',
    path: '',
    enabled: true,
  };

  const initialApiSource: ApiSource = {
    id: `api-${Date.now()}`,
    name: 'Nové API',
    type: 'api',
    url: '',
    authType: 'none',
    tokenUrl: '',
    tokenUsername: '',
    tokenPassword: '',
    enabled: true,
  };

  const initialStaticSource: StaticSource = {
    id: `static-${Date.now()}`,
    name: 'Statická data',
    type: 'static',
    enabled: true,
    sharedParams: {
      action: 'open',
      icon: 'bookmark',
      priority: '0',
    },
    items: [],
  };

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingConfigRef = useRef<AppConfig | null>(null);

  const performSave = useCallback((configToSave: AppConfig) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingConfigRef.current = null;
    onSaveConfig(configToSave);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  }, [onSaveConfig]);

  const handleSave = useCallback((customConfig?: AppConfig, immediate: boolean = false) => {
    const toSave = customConfig || formData;
    pendingConfigRef.current = toSave;

    if (immediate) {
      performSave(toSave);
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (pendingConfigRef.current) {
        performSave(pendingConfigRef.current);
      }
    }, 1200);
  }, [formData, performSave]);

  // Flush any pending debounced config on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current && pendingConfigRef.current) {
        clearTimeout(saveTimeoutRef.current);
        onSaveConfig(pendingConfigRef.current);
      }
    };
  }, [onSaveConfig]);

  const handleBanItem = (itemToBan: LauncherItem) => {
    const banlist = formData.banlist || [];
    const alreadyBanned = banlist.some(
      (b) =>
        (b.id && itemToBan.id && b.id === itemToBan.id) ||
        (b.location && itemToBan.location && b.location === itemToBan.location) ||
        (b.name === itemToBan.name && b.sourceId === itemToBan.sourceId)
    );
    if (alreadyBanned) return;

    const newBanned: BannedItem = {
      id: itemToBan.id,
      name: itemToBan.name,
      location: itemToBan.location,
      sourceId: itemToBan.sourceId,
      bannedAt: new Date().toISOString(),
    };
    const updated = {
      ...formData,
      banlist: [...banlist, newBanned],
    };
    setFormData(updated);
    handleSave(updated);
    onTriggerSync();
  };

  const handleUnbanItem = (bannedItem: BannedItem) => {
    const banlist = formData.banlist || [];
    const updatedBanlist = banlist.filter((b) => {
      if (bannedItem.id && b.id) return b.id !== bannedItem.id;
      if (bannedItem.location && b.location) return b.location !== bannedItem.location;
      return b.name !== bannedItem.name;
    });
    const updated = {
      ...formData,
      banlist: updatedBanlist,
    };
    setFormData(updated);
    handleSave(updated);
    onTriggerSync();
  };

  const triggerInspectSource = async (targetSource?: DataSource) => {
    const target = targetSource || editingSource;
    if (!target) return;
    if (target.type === 'file' && !target.path) {
      setInspectError('Nejprve zadejte nebo vyberte cestu k JSON souboru');
      return;
    }
    if (target.type === 'api' && !target.url) {
      setInspectError('Nejprve zadejte URL adresu API');
      return;
    }

    setIsInspecting(true);
    setInspectError(null);
    try {
      const res = await window.electronAPI?.inspectSource(target);
      if (res && res.keys && res.keys.length > 0) {
        setDetectedKeys(res.keys);
        setSampleRecord(res.sample);
      } else {
        setInspectError('V JSONu nebyl nalezen žádný záznam nebo je pole prázdné');
      }
    } catch (err: any) {
      setInspectError(err?.message || 'Chyba při čtení JSONu');
    } finally {
      setIsInspecting(false);
    }
  };

  const handlePickLocalFile = async () => {
    const currentPath = editingSource && editingSource.type === 'file' ? editingSource.path : undefined;
    const selectedPath = await window.electronAPI?.selectJsonFile?.(currentPath);
    if (selectedPath) {
      if (editingSource && editingSource.type === 'file') {
        const updated = { ...editingSource, path: selectedPath };
        setEditingSource(updated);
        triggerInspectSource(updated);
      } else if (isAddingSource === 'file') {
        const updated: FileSource = {
          ...initialFileSource,
          path: selectedPath,
          name: selectedPath.split(/[\\/]/).pop() || 'Lokální soubor',
        };
        setEditingSource(updated);
        triggerInspectSource(updated);
      }
    }
  };

  const handleStartEditSource = (src: DataSource) => {
    if (editingSource?.id === src.id && !isAddingSource) {
      handleCloseSourceForm();
      return;
    }
    setEditingSource(src);
    setIsAddingSource(null);
    setInspectError(null);
    setDetectedKeys([]);
    setSampleRecord(null);
    if ((src.type === 'file' && src.path) || (src.type === 'api' && src.url)) {
      triggerInspectSource(src);
    }
  };

  const handleCloseSourceForm = () => {
    setEditingSource(null);
    setIsAddingSource(null);
    setInspectError(null);
    setDetectedKeys([]);
    setSampleRecord(null);
  };

  const handleMappingChange = (field: MappingTargetKey, modeOrKey: string) => {
    if (!editingSource) return;
    const currentMapping: SourceFieldMapping = { ...(editingSource.mapping || {}) };

    if (!modeOrKey) {
      delete currentMapping[field];
    } else if (modeOrKey === '__fixed_open__') {
      currentMapping[field] = { type: 'fixed', value: 'open' };
    } else if (modeOrKey === '__fixed_copy__') {
      currentMapping[field] = { type: 'fixed', value: 'copy' };
    } else if (modeOrKey === '__fixed__') {
      const prev = currentMapping[field]?.type === 'fixed' ? currentMapping[field]!.value : '';
      currentMapping[field] = { type: 'fixed', value: prev };
    } else if (modeOrKey === '__custom_field__') {
      const prev = currentMapping[field]?.type === 'field' ? currentMapping[field]!.value : '';
      currentMapping[field] = { type: 'field', value: prev };
    } else {
      currentMapping[field] = { type: 'field', value: modeOrKey };
    }

    setEditingSource({ ...editingSource, mapping: currentMapping });
  };

  const handleCustomFieldChange = (field: MappingTargetKey, fieldName: string) => {
    if (!editingSource) return;
    const currentMapping: SourceFieldMapping = { ...(editingSource.mapping || {}) };
    currentMapping[field] = { type: 'field', value: fieldName };
    setEditingSource({ ...editingSource, mapping: currentMapping });
  };

  const handleFixedValueChange = (field: MappingTargetKey, value: string) => {
    if (!editingSource) return;
    const currentMapping: SourceFieldMapping = { ...(editingSource.mapping || {}) };
    currentMapping[field] = { type: 'fixed', value };
    setEditingSource({ ...editingSource, mapping: currentMapping });
  };

  const getMappedPreviewValue = (field: MappingTargetKey, fallback: string) => {
    if (!sampleRecord) return fallback;
    const rule = editingSource?.mapping?.[field];
    if (!rule) return sampleRecord[field] !== undefined ? String(sampleRecord[field]) : fallback;
    if (rule.type === 'fixed') return rule.value || fallback;
    if (rule.type === 'field' && rule.value) {
      return sampleRecord[rule.value] !== undefined ? String(sampleRecord[rule.value]) : fallback;
    }
    return sampleRecord[field] !== undefined ? String(sampleRecord[field]) : fallback;
  };

  const MAPPING_FIELDS: { key: MappingTargetKey; label: string; placeholder?: string; defaultHint: string }[] = [
    { key: 'name', label: 'Název položky (name) *', defaultHint: 'Výchozí: "name"' },
    { key: 'location', label: 'Cesta / URL / Hodnota (location)', defaultHint: 'Výchozí: "location"' },
    { key: 'action', label: 'Akce po spuštění (action)', placeholder: 'např. open, copy', defaultHint: 'Výchozí: "open" (Otevřít)' },
    { key: 'icon', label: 'Ikona (icon)', placeholder: 'např. bookmark, terminal, public...', defaultHint: 'Výchozí: "code"' },
    { key: 'image', label: 'Obrázek / URL loga (image)', defaultHint: 'Výchozí: "image"' },
    { key: 'priority', label: 'Priorita řazení (priority)', placeholder: 'např. 0, 10, -1', defaultHint: 'Výchozí: 0' },
    { key: 'settings', label: 'Speciální nastavení (settings)', placeholder: 'např. magicgate', defaultHint: 'Výchozí: žádné' },
  ];

  const handleSaveSource = (source: DataSource) => {
    let updatedSources: DataSource[];
    const exists = formData.sources.some((s) => s.id === source.id);
    if (exists) {
      updatedSources = formData.sources.map((s) => (s.id === source.id ? source : s));
    } else {
      updatedSources = [...formData.sources, source];
    }

    const updatedConfig = { ...formData, sources: updatedSources };
    setFormData(updatedConfig);
    handleCloseSourceForm();
    handleSave(updatedConfig);
    onTriggerSync();
  };

  const handleDeleteSource = (id: string) => {
    const updatedSources = formData.sources.filter((s) => s.id !== id);
    const updatedConfig = { ...formData, sources: updatedSources };
    setFormData(updatedConfig);
    handleSave(updatedConfig);
    onTriggerSync();
  };

  const handleToggleSource = (id: string) => {
    const updatedSources = formData.sources.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    const updatedConfig = { ...formData, sources: updatedSources };
    setFormData(updatedConfig);
    handleSave(updatedConfig);
    onTriggerSync();
  };

  const handleHotkeyFocus = () => {
    activeRecordingToolRef.current = 'main';
    setIsRecordingHotkey(true);
    setHotkeyError(null);
    originalHotkeyRef.current = formData.hotkey || 'Ctrl+Alt+Space';
    pressedKeysRef.current.clear();
    maxComboRef.current = [];
    setRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handleHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'main') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingHotkey(false);
    pressedKeysRef.current.clear();
    maxComboRef.current = [];
    setRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handleHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores original hotkey
    if (e.key === 'Escape') {
      const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
      setFormData((prev) => ({ ...prev, hotkey: fallback }));
      setHotkeyError(null);
      setIsRecordingHotkey(false);
      pressedKeysRef.current.clear();
      maxComboRef.current = [];
      setRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Backspace when nothing held resets to default
    if (e.key === 'Backspace' && pressedKeysRef.current.size === 0) {
      const updated = { ...formData, hotkey: 'Ctrl+Alt+Space' };
      setFormData(updated);
      handleSave(updated);
      setHotkeyError(null);
      setIsRecordingHotkey(false);
      pressedKeysRef.current.clear();
      maxComboRef.current = [];
      setRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Normalize key
    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    pressedKeysRef.current.add(keyName);
    if (e.altKey) pressedKeysRef.current.add('Alt');
    if (e.ctrlKey) pressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) pressedKeysRef.current.add('Shift');
    if (e.metaKey) pressedKeysRef.current.add('Super');

    // Sort order: Modifiers first, then normal keys
    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(pressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    maxComboRef.current = currentKeys;
    setRecordedModifiers(currentKeys);
    setHotkeyError(null);
  };

  const handleHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = maxComboRef.current;

    // If only 1 key was pressed and released: reset to previous hotkey + display red error
    if (combo.length === 1) {
      const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
      setFormData((prev) => ({ ...prev, hotkey: fallback }));
      setHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingHotkey(false);
      pressedKeysRef.current.clear();
      maxComboRef.current = [];
      setRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // If at least 2 keys were pressed: check reserved hotkey collision, then save
    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      if (conflictReason) {
        const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
        setFormData((prev) => ({ ...prev, hotkey: fallback }));
        setHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        setIsRecordingHotkey(false);
        pressedKeysRef.current.clear();
        maxComboRef.current = [];
        setRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ColorMaster hotkey
      const cmHotkey = formData.donkeyTools?.colorMaster?.hotkey;
      if (cmHotkey && finalHotkey.toLowerCase() === cmHotkey.toLowerCase()) {
        const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
        setFormData((prev) => ({ ...prev, hotkey: fallback }));
        setHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro kapátko ColorMaster.`);
        setIsRecordingHotkey(false);
        pressedKeysRef.current.clear();
        maxComboRef.current = [];
        setRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with QuickCap hotkey
      const qcHotkey = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey;
      if (qcHotkey && finalHotkey.toLowerCase() === qcHotkey.toLowerCase()) {
        const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
        setFormData((prev) => ({ ...prev, hotkey: fallback }));
        setHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro výstřižek QuickCap.`);
        setIsRecordingHotkey(false);
        pressedKeysRef.current.clear();
        maxComboRef.current = [];
        setRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ScreenRuler hotkey
      const srHotkey = formData.donkeyTools?.screenRuler?.hotkey;
      if (srHotkey && finalHotkey.toLowerCase() === srHotkey.toLowerCase()) {
        const fallback = originalHotkeyRef.current || 'Ctrl+Alt+Space';
        setFormData((prev) => ({ ...prev, hotkey: fallback }));
        setHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro měřítko ScreenRuler.`);
        setIsRecordingHotkey(false);
        pressedKeysRef.current.clear();
        maxComboRef.current = [];
        setRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      setHotkeyError(null);
      const updated = { ...formData, hotkey: finalHotkey };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingHotkey(false);
      pressedKeysRef.current.clear();
      maxComboRef.current = [];
      setRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  const handleColorMasterHotkeyFocus = () => {
    activeRecordingToolRef.current = 'colorMaster';
    setIsRecordingColorMasterHotkey(true);
    setColorMasterHotkeyError(null);
    colorMasterOriginalHotkeyRef.current = formData.donkeyTools?.colorMaster?.hotkey || '';
    colorMasterPressedKeysRef.current.clear();
    colorMasterMaxComboRef.current = [];
    setColorMasterRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handleColorMasterHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'colorMaster') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingColorMasterHotkey(false);
    colorMasterPressedKeysRef.current.clear();
    colorMasterMaxComboRef.current = [];
    setColorMasterRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handleColorMasterHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores original hotkey
    if (e.key === 'Escape') {
      const fallback = colorMasterOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            ...formData.donkeyTools?.colorMaster,
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: fallback,
            paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      setColorMasterHotkeyError(null);
      setIsRecordingColorMasterHotkey(false);
      colorMasterPressedKeysRef.current.clear();
      colorMasterMaxComboRef.current = [];
      setColorMasterRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Backspace when nothing held resets / clears the hotkey
    if (e.key === 'Backspace' && colorMasterPressedKeysRef.current.size === 0) {
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            ...formData.donkeyTools?.colorMaster,
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: '',
            paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setColorMasterHotkeyError(null);
      setIsRecordingColorMasterHotkey(false);
      colorMasterPressedKeysRef.current.clear();
      colorMasterMaxComboRef.current = [];
      setColorMasterRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Normalize key
    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    colorMasterPressedKeysRef.current.add(keyName);
    if (e.altKey) colorMasterPressedKeysRef.current.add('Alt');
    if (e.ctrlKey) colorMasterPressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) colorMasterPressedKeysRef.current.add('Shift');
    if (e.metaKey) colorMasterPressedKeysRef.current.add('Super');

    // Sort order: Modifiers first, then normal keys
    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(colorMasterPressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    colorMasterMaxComboRef.current = currentKeys;
    setColorMasterRecordedModifiers(currentKeys);
    setColorMasterHotkeyError(null);
  };

  const handleColorMasterHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = colorMasterMaxComboRef.current;

    // If only 1 key was pressed and released: reset to previous hotkey + display red error
    if (combo.length === 1) {
      const fallback = colorMasterOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            ...formData.donkeyTools?.colorMaster,
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: fallback,
            paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      setColorMasterHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingColorMasterHotkey(false);
      colorMasterPressedKeysRef.current.clear();
      colorMasterMaxComboRef.current = [];
      setColorMasterRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // If at least 2 keys were pressed: check reserved hotkey collision and collision with launcher hotkey
    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      if (conflictReason) {
        const fallback = colorMasterOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            colorMaster: {
              ...formData.donkeyTools?.colorMaster,
              enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
              hotkey: fallback,
              paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
              defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
            },
          },
        };
        setFormData(updated);
        setColorMasterHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        setIsRecordingColorMasterHotkey(false);
        colorMasterPressedKeysRef.current.clear();
        colorMasterMaxComboRef.current = [];
        setColorMasterRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with main launcher hotkey
      const launcherHotkey = formData.hotkey || 'Ctrl+Alt+Space';
      if (finalHotkey.toLowerCase() === launcherHotkey.toLowerCase()) {
        const fallback = colorMasterOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            colorMaster: {
              ...formData.donkeyTools?.colorMaster,
              enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
              hotkey: fallback,
              paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
              defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
            },
          },
        };
        setFormData(updated);
        setColorMasterHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje s globální zkratkou pro vyvolání launcheru.`);
        setIsRecordingColorMasterHotkey(false);
        colorMasterPressedKeysRef.current.clear();
        colorMasterMaxComboRef.current = [];
        setColorMasterRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ScreenRuler hotkey
      const screenRulerHotkey = formData.donkeyTools?.screenRuler?.hotkey || '';
      if (screenRulerHotkey && finalHotkey.toLowerCase() === screenRulerHotkey.toLowerCase()) {
        const fallback = colorMasterOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            colorMaster: {
              ...formData.donkeyTools?.colorMaster,
              enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
              hotkey: fallback,
              paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
              defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
            },
          },
        };
        setFormData(updated);
        setColorMasterHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro měřítko ScreenRuler.`);
        setIsRecordingColorMasterHotkey(false);
        colorMasterPressedKeysRef.current.clear();
        colorMasterMaxComboRef.current = [];
        setColorMasterRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with PaletteMaster hotkey
      const paletteHotkey = formData.donkeyTools?.colorMaster?.paletteHotkey || '';
      if (paletteHotkey && finalHotkey.toLowerCase() === paletteHotkey.toLowerCase()) {
        const fallback = colorMasterOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            colorMaster: {
              enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
              hotkey: fallback,
              paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
              defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
            },
          },
        };
        setFormData(updated);
        setColorMasterHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro správu palet PaletteMaster.`);
        setIsRecordingColorMasterHotkey(false);
        colorMasterPressedKeysRef.current.clear();
        colorMasterMaxComboRef.current = [];
        setColorMasterRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      setColorMasterHotkeyError(null);
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: finalHotkey,
            paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingColorMasterHotkey(false);
      colorMasterPressedKeysRef.current.clear();
      colorMasterMaxComboRef.current = [];
      setColorMasterRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  const handlePaletteHotkeyFocus = () => {
    activeRecordingToolRef.current = 'palette';
    setIsRecordingPaletteHotkey(true);
    setPaletteHotkeyError(null);
    paletteOriginalHotkeyRef.current = formData.donkeyTools?.colorMaster?.paletteHotkey || '';
    palettePressedKeysRef.current.clear();
    paletteMaxComboRef.current = [];
    setPaletteRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handlePaletteHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'palette') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingPaletteHotkey(false);
    palettePressedKeysRef.current.clear();
    paletteMaxComboRef.current = [];
    setPaletteRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handlePaletteHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      const fallback = paletteOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
            paletteHotkey: fallback,
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      setPaletteHotkeyError(null);
      setIsRecordingPaletteHotkey(false);
      palettePressedKeysRef.current.clear();
      paletteMaxComboRef.current = [];
      setPaletteRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    if (e.key === 'Backspace' && palettePressedKeysRef.current.size === 0) {
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
            paletteHotkey: '',
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setPaletteHotkeyError(null);
      setIsRecordingPaletteHotkey(false);
      palettePressedKeysRef.current.clear();
      paletteMaxComboRef.current = [];
      setPaletteRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    palettePressedKeysRef.current.add(keyName);
    if (e.altKey) palettePressedKeysRef.current.add('Alt');
    if (e.ctrlKey) palettePressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) palettePressedKeysRef.current.add('Shift');
    if (e.metaKey) palettePressedKeysRef.current.add('Super');

    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(palettePressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    paletteMaxComboRef.current = currentKeys;
    setPaletteRecordedModifiers(currentKeys);
    setPaletteHotkeyError(null);
  };

  const handlePaletteHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = paletteMaxComboRef.current;

    if (combo.length === 1) {
      const fallback = paletteOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
            paletteHotkey: fallback,
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      setPaletteHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingPaletteHotkey(false);
      palettePressedKeysRef.current.clear();
      paletteMaxComboRef.current = [];
      setPaletteRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      const rollback = () => {
        const fallback = paletteOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            colorMaster: {
              enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
              hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
              paletteHotkey: fallback,
              defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
            },
          },
        };
        setFormData(updated);
        setIsRecordingPaletteHotkey(false);
        palettePressedKeysRef.current.clear();
        paletteMaxComboRef.current = [];
        setPaletteRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
      };

      if (conflictReason) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        return;
      }

      const launcherHotkey = formData.hotkey || 'Ctrl+Alt+Space';
      if (finalHotkey.toLowerCase() === launcherHotkey.toLowerCase()) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje s globální zkratkou pro vyvolání launcheru.`);
        return;
      }

      const eyedropperHotkey = formData.donkeyTools?.colorMaster?.hotkey || '';
      if (eyedropperHotkey && finalHotkey.toLowerCase() === eyedropperHotkey.toLowerCase()) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro kapátko Eyedropper.`);
        return;
      }

      const qcHotkey = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '';
      if (qcHotkey && finalHotkey.toLowerCase() === qcHotkey.toLowerCase()) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro výstřižek QuickCap.`);
        return;
      }

      const srHotkey = formData.donkeyTools?.screenRuler?.hotkey || '';
      if (srHotkey && finalHotkey.toLowerCase() === srHotkey.toLowerCase()) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro měřítko ScreenRuler.`);
        return;
      }

      const ecHotkey = formData.donkeyTools?.easyClip?.hotkey || '';
      if (ecHotkey && finalHotkey.toLowerCase() === ecHotkey.toLowerCase()) {
        rollback();
        setPaletteHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou pro historii schránky EasyClip.`);
        return;
      }

      setPaletteHotkeyError(null);
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          colorMaster: {
            enabled: formData.donkeyTools?.colorMaster?.enabled ?? false,
            hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
            paletteHotkey: finalHotkey,
            defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingPaletteHotkey(false);
      palettePressedKeysRef.current.clear();
      paletteMaxComboRef.current = [];
      setPaletteRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  const handleQuickCapHotkeyFocus = () => {
    activeRecordingToolRef.current = 'quickCap';
    setIsRecordingQuickCapHotkey(true);
    setQuickCapHotkeyError(null);
    quickCapOriginalHotkeyRef.current = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '';
    quickCapPressedKeysRef.current.clear();
    quickCapMaxComboRef.current = [];
    setQuickCapRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handleQuickCapHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'quickCap') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingQuickCapHotkey(false);
    quickCapPressedKeysRef.current.clear();
    quickCapMaxComboRef.current = [];
    setQuickCapRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handleQuickCapHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores original hotkey
    if (e.key === 'Escape') {
      const fallback = quickCapOriginalHotkeyRef.current || '';
      const isEnabled = formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false;
      const saveDir = formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory;
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          quickCap: {
            enabled: isEnabled,
            hotkey: fallback,
            saveDirectory: saveDir,
          },
          fastSnap: {
            enabled: isEnabled,
            hotkey: fallback,
            saveDirectory: saveDir,
          },
        },
      };
      setFormData(updated);
      setQuickCapHotkeyError(null);
      setIsRecordingQuickCapHotkey(false);
      quickCapPressedKeysRef.current.clear();
      quickCapMaxComboRef.current = [];
      setQuickCapRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Backspace when nothing held resets / clears the hotkey
    if (e.key === 'Backspace' && quickCapPressedKeysRef.current.size === 0) {
      const isEnabled = formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false;
      const saveDir = formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory;
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          quickCap: {
            enabled: isEnabled,
            hotkey: '',
            saveDirectory: saveDir,
          },
          fastSnap: {
            enabled: isEnabled,
            hotkey: '',
            saveDirectory: saveDir,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setQuickCapHotkeyError(null);
      setIsRecordingQuickCapHotkey(false);
      quickCapPressedKeysRef.current.clear();
      quickCapMaxComboRef.current = [];
      setQuickCapRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Normalize key
    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    quickCapPressedKeysRef.current.add(keyName);
    if (e.altKey) quickCapPressedKeysRef.current.add('Alt');
    if (e.ctrlKey) quickCapPressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) quickCapPressedKeysRef.current.add('Shift');
    if (e.metaKey) quickCapPressedKeysRef.current.add('Super');

    // Sort order: Modifiers first, then normal keys
    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(quickCapPressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    quickCapMaxComboRef.current = currentKeys;
    const mods = currentKeys.filter((k) => order.includes(k));
    setQuickCapRecordedModifiers(mods);
  };

  const handleQuickCapHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = quickCapMaxComboRef.current;
    const isEnabled = formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false;
    const saveDir = formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory;

    // If only 1 key was pressed and released: reset to previous hotkey + display red error
    if (combo.length === 1) {
      const fallback = quickCapOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          quickCap: {
            enabled: isEnabled,
            hotkey: fallback,
            saveDirectory: saveDir,
          },
          fastSnap: {
            enabled: isEnabled,
            hotkey: fallback,
            saveDirectory: saveDir,
          },
        },
      };
      setFormData(updated);
      setQuickCapHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingQuickCapHotkey(false);
      quickCapPressedKeysRef.current.clear();
      quickCapMaxComboRef.current = [];
      setQuickCapRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // If at least 2 keys were pressed: check reserved hotkey collision and collision with launcher / colorMaster hotkey
    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      if (conflictReason) {
        const fallback = quickCapOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            quickCap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
            fastSnap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
          },
        };
        setFormData(updated);
        setQuickCapHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        setIsRecordingQuickCapHotkey(false);
        quickCapPressedKeysRef.current.clear();
        quickCapMaxComboRef.current = [];
        setQuickCapRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with main launcher hotkey
      const launcherHotkey = formData.hotkey || 'Ctrl+Alt+Space';
      if (finalHotkey.toLowerCase() === launcherHotkey.toLowerCase()) {
        const fallback = quickCapOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            quickCap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
            fastSnap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
          },
        };
        setFormData(updated);
        setQuickCapHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou vyhledávacího okna. Byla zachována původní zkratka.`);
        setIsRecordingQuickCapHotkey(false);
        quickCapPressedKeysRef.current.clear();
        quickCapMaxComboRef.current = [];
        setQuickCapRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ColorMaster hotkey
      const colorMasterHotkey = formData.donkeyTools?.colorMaster?.hotkey || '';
      if (colorMasterHotkey && finalHotkey.toLowerCase() === colorMasterHotkey.toLowerCase()) {
        const fallback = quickCapOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            quickCap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
            fastSnap: {
              enabled: isEnabled,
              hotkey: fallback,
              saveDirectory: saveDir,
            },
          },
        };
        setFormData(updated);
        setQuickCapHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou ColorMaster kapátka. Byla zachována původní zkratka.`);
        setIsRecordingQuickCapHotkey(false);
        quickCapPressedKeysRef.current.clear();
        quickCapMaxComboRef.current = [];
        setQuickCapRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      setQuickCapHotkeyError(null);
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          quickCap: {
            enabled: isEnabled,
            hotkey: finalHotkey,
            saveDirectory: saveDir,
          },
          fastSnap: {
            enabled: isEnabled,
            hotkey: finalHotkey,
            saveDirectory: saveDir,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingQuickCapHotkey(false);
      quickCapPressedKeysRef.current.clear();
      quickCapMaxComboRef.current = [];
      setQuickCapRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  const handleScreenRulerHotkeyFocus = () => {
    activeRecordingToolRef.current = 'screenRuler';
    setIsRecordingScreenRulerHotkey(true);
    setScreenRulerHotkeyError(null);
    screenRulerOriginalHotkeyRef.current = formData.donkeyTools?.screenRuler?.hotkey || '';
    screenRulerPressedKeysRef.current.clear();
    screenRulerMaxComboRef.current = [];
    setScreenRulerRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handleScreenRulerHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'screenRuler') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingScreenRulerHotkey(false);
    screenRulerPressedKeysRef.current.clear();
    screenRulerMaxComboRef.current = [];
    setScreenRulerRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handleScreenRulerHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores original hotkey
    if (e.key === 'Escape') {
      const fallback = screenRulerOriginalHotkeyRef.current || '';
      const isEnabled = formData.donkeyTools?.screenRuler?.enabled ?? false;
      const color = formData.donkeyTools?.screenRuler?.color || '#6366f1';
      const defaultUnit = formData.donkeyTools?.screenRuler?.defaultUnit || 'px';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          screenRuler: {
            enabled: isEnabled,
            hotkey: fallback,
            color,
            defaultUnit,
          },
        },
      };
      setFormData(updated);
      setScreenRulerHotkeyError(null);
      setIsRecordingScreenRulerHotkey(false);
      screenRulerPressedKeysRef.current.clear();
      screenRulerMaxComboRef.current = [];
      setScreenRulerRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Backspace when nothing held resets / clears the hotkey
    if (e.key === 'Backspace' && screenRulerPressedKeysRef.current.size === 0) {
      const isEnabled = formData.donkeyTools?.screenRuler?.enabled ?? false;
      const color = formData.donkeyTools?.screenRuler?.color || '#6366f1';
      const defaultUnit = formData.donkeyTools?.screenRuler?.defaultUnit || 'px';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          screenRuler: {
            enabled: isEnabled,
            hotkey: '',
            color,
            defaultUnit,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setScreenRulerHotkeyError(null);
      setIsRecordingScreenRulerHotkey(false);
      screenRulerPressedKeysRef.current.clear();
      screenRulerMaxComboRef.current = [];
      setScreenRulerRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Normalize key
    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    screenRulerPressedKeysRef.current.add(keyName);
    if (e.altKey) screenRulerPressedKeysRef.current.add('Alt');
    if (e.ctrlKey) screenRulerPressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) screenRulerPressedKeysRef.current.add('Shift');
    if (e.metaKey) screenRulerPressedKeysRef.current.add('Super');

    // Sort order: Modifiers first, then normal keys
    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(screenRulerPressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    if (currentKeys.length > screenRulerMaxComboRef.current.length) {
      screenRulerMaxComboRef.current = [...currentKeys];
    }

    setScreenRulerRecordedModifiers(currentKeys);
    setScreenRulerHotkeyError(null);
  };

  const handleScreenRulerHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = screenRulerMaxComboRef.current;
    const isEnabled = formData.donkeyTools?.screenRuler?.enabled ?? false;
    const color = formData.donkeyTools?.screenRuler?.color || '#6366f1';
    const defaultUnit = formData.donkeyTools?.screenRuler?.defaultUnit || 'px';

    // If only 1 key was pressed and released: reset to previous hotkey + display red error
    if (combo.length === 1) {
      const fallback = screenRulerOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          screenRuler: {
            enabled: isEnabled,
            hotkey: fallback,
            color,
            defaultUnit,
          },
        },
      };
      setFormData(updated);
      setScreenRulerHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingScreenRulerHotkey(false);
      screenRulerPressedKeysRef.current.clear();
      screenRulerMaxComboRef.current = [];
      setScreenRulerRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // If at least 2 keys were pressed: check reserved hotkey collision
    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      if (conflictReason) {
        const fallback = screenRulerOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            screenRuler: {
              enabled: isEnabled,
              hotkey: fallback,
              color,
              defaultUnit,
            },
          },
        };
        setFormData(updated);
        setScreenRulerHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        setIsRecordingScreenRulerHotkey(false);
        screenRulerPressedKeysRef.current.clear();
        screenRulerMaxComboRef.current = [];
        setScreenRulerRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with main launcher hotkey
      const launcherHotkey = formData.hotkey || 'Ctrl+Alt+Space';
      if (finalHotkey.toLowerCase() === launcherHotkey.toLowerCase()) {
        const fallback = screenRulerOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            screenRuler: {
              enabled: isEnabled,
              hotkey: fallback,
              color,
              defaultUnit,
            },
          },
        };
        setFormData(updated);
        setScreenRulerHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou vyhledávacího okna. Byla zachována původní zkratka.`);
        setIsRecordingScreenRulerHotkey(false);
        screenRulerPressedKeysRef.current.clear();
        screenRulerMaxComboRef.current = [];
        setScreenRulerRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ColorMaster hotkey
      const colorMasterHotkey = formData.donkeyTools?.colorMaster?.hotkey || '';
      if (colorMasterHotkey && finalHotkey.toLowerCase() === colorMasterHotkey.toLowerCase()) {
        const fallback = screenRulerOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            screenRuler: {
              enabled: isEnabled,
              hotkey: fallback,
              color,
              defaultUnit,
            },
          },
        };
        setFormData(updated);
        setScreenRulerHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou ColorMaster kapátka. Byla zachována původní zkratka.`);
        setIsRecordingScreenRulerHotkey(false);
        screenRulerPressedKeysRef.current.clear();
        screenRulerMaxComboRef.current = [];
        setScreenRulerRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with QuickCap hotkey
      const quickCapHotkey = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '';
      if (quickCapHotkey && finalHotkey.toLowerCase() === quickCapHotkey.toLowerCase()) {
        const fallback = screenRulerOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            screenRuler: {
              enabled: isEnabled,
              hotkey: fallback,
              color,
              defaultUnit,
            },
          },
        };
        setFormData(updated);
        setScreenRulerHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou QuickCap výstřižku. Byla zachována původní zkratka.`);
        setIsRecordingScreenRulerHotkey(false);
        screenRulerPressedKeysRef.current.clear();
        screenRulerMaxComboRef.current = [];
        setScreenRulerRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      setScreenRulerHotkeyError(null);
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          screenRuler: {
            enabled: isEnabled,
            hotkey: finalHotkey,
            color,
            defaultUnit,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingScreenRulerHotkey(false);
      screenRulerPressedKeysRef.current.clear();
      screenRulerMaxComboRef.current = [];
      setScreenRulerRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  const loadEasyClipItemCount = async () => {
    if (!window.electronAPI?.getEasyClipItems) return;
    try {
      const items = await window.electronAPI.getEasyClipItems();
      setEasyClipItemCount(items ? items.length : 0);
    } catch (err) {
      console.error('Failed to load EasyClip items count:', err);
    }
  };

  const handleClearEasyClipHistory = async () => {
    if (!window.electronAPI?.clearEasyClipHistory) return;
    try {
      await window.electronAPI.clearEasyClipHistory();
      setEasyClipItemCount(0);
      setEasyClipClearSuccess(true);
      setTimeout(() => setEasyClipClearSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to clear EasyClip history:', err);
    }
  };

  const handleOpenEasyClip = async () => {
    onClose();
    if (window.electronAPI?.openEasyClip) {
      window.electronAPI.openEasyClip();
    }
  };

  const handleEasyClipHotkeyFocus = () => {
    activeRecordingToolRef.current = 'easyClip';
    setIsRecordingEasyClipHotkey(true);
    setEasyClipHotkeyError(null);
    easyClipOriginalHotkeyRef.current = formData.donkeyTools?.easyClip?.hotkey || '';
    easyClipPressedKeysRef.current.clear();
    easyClipMaxComboRef.current = [];
    setEasyClipRecordedModifiers([]);
    window.electronAPI?.pauseGlobalHotkey?.();
  };

  const handleEasyClipHotkeyBlur = () => {
    if (activeRecordingToolRef.current === 'easyClip') {
      activeRecordingToolRef.current = null;
    }
    setIsRecordingEasyClipHotkey(false);
    easyClipPressedKeysRef.current.clear();
    easyClipMaxComboRef.current = [];
    setEasyClipRecordedModifiers([]);
    window.electronAPI?.resumeGlobalHotkey?.();
  };

  const handleEasyClipHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording and restores original hotkey
    if (e.key === 'Escape') {
      const fallback = easyClipOriginalHotkeyRef.current || '';
      const isEnabled = formData.donkeyTools?.easyClip?.enabled ?? true;
      const maxItems = formData.donkeyTools?.easyClip?.maxItems || 50;
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          easyClip: {
            enabled: isEnabled,
            hotkey: fallback,
            maxItems,
          },
        },
      };
      setFormData(updated);
      setEasyClipHotkeyError(null);
      setIsRecordingEasyClipHotkey(false);
      easyClipPressedKeysRef.current.clear();
      easyClipMaxComboRef.current = [];
      setEasyClipRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Backspace when nothing held resets / clears the hotkey
    if (e.key === 'Backspace' && easyClipPressedKeysRef.current.size === 0) {
      const isEnabled = formData.donkeyTools?.easyClip?.enabled ?? true;
      const maxItems = formData.donkeyTools?.easyClip?.maxItems || 50;
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          easyClip: {
            enabled: isEnabled,
            hotkey: '',
            maxItems,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setEasyClipHotkeyError(null);
      setIsRecordingEasyClipHotkey(false);
      easyClipPressedKeysRef.current.clear();
      easyClipMaxComboRef.current = [];
      setEasyClipRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // Normalize key
    let keyName = e.key;
    if (keyName === 'Control') keyName = 'Ctrl';
    else if (keyName === 'Alt' || keyName === 'AltGraph') keyName = 'Alt';
    else if (keyName === 'Shift') keyName = 'Shift';
    else if (keyName === 'Meta') keyName = 'Super';
    else if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (/^[a-z]$/i.test(keyName)) keyName = keyName.toUpperCase();

    easyClipPressedKeysRef.current.add(keyName);
    if (e.altKey) easyClipPressedKeysRef.current.add('Alt');
    if (e.ctrlKey) easyClipPressedKeysRef.current.add('Ctrl');
    if (e.shiftKey) easyClipPressedKeysRef.current.add('Shift');
    if (e.metaKey) easyClipPressedKeysRef.current.add('Super');

    // Sort order: Modifiers first, then normal keys
    const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
    const currentKeys = Array.from(easyClipPressedKeysRef.current);
    currentKeys.sort((a, b) => {
      const idxA = order.indexOf(a);
      const idxB = order.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    if (currentKeys.length > easyClipMaxComboRef.current.length) {
      easyClipMaxComboRef.current = [...currentKeys];
    }

    setEasyClipRecordedModifiers(currentKeys);
    setEasyClipHotkeyError(null);
  };

  const handleEasyClipHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const combo = easyClipMaxComboRef.current;
    const isEnabled = formData.donkeyTools?.easyClip?.enabled ?? true;
    const maxItems = formData.donkeyTools?.easyClip?.maxItems || 50;

    // If only 1 key was pressed and released: reset to previous hotkey + display red error
    if (combo.length === 1) {
      const fallback = easyClipOriginalHotkeyRef.current || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          easyClip: {
            enabled: isEnabled,
            hotkey: fallback,
            maxItems,
          },
        },
      };
      setFormData(updated);
      setEasyClipHotkeyError('Je potřeba minimálně dvojkombinace kláves');
      setIsRecordingEasyClipHotkey(false);
      easyClipPressedKeysRef.current.clear();
      easyClipMaxComboRef.current = [];
      setEasyClipRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }

    // If at least 2 keys were pressed: check collisions
    if (combo.length >= 2) {
      const finalHotkey = combo.join('+');
      const conflictReason = getReservedHotkeyCollision(combo);

      if (conflictReason) {
        const fallback = easyClipOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            easyClip: {
              enabled: isEnabled,
              hotkey: fallback,
              maxItems,
            },
          },
        };
        setFormData(updated);
        setEasyClipHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – ${conflictReason}. Byla zachována původní zkratka.`);
        setIsRecordingEasyClipHotkey(false);
        easyClipPressedKeysRef.current.clear();
        easyClipMaxComboRef.current = [];
        setEasyClipRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with main launcher hotkey
      const launcherHotkey = formData.hotkey || 'Ctrl+Alt+Space';
      if (finalHotkey.toLowerCase() === launcherHotkey.toLowerCase()) {
        const fallback = easyClipOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            easyClip: {
              enabled: isEnabled,
              hotkey: fallback,
              maxItems,
            },
          },
        };
        setFormData(updated);
        setEasyClipHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou vyhledávacího okna. Byla zachována původní zkratka.`);
        setIsRecordingEasyClipHotkey(false);
        easyClipPressedKeysRef.current.clear();
        easyClipMaxComboRef.current = [];
        setEasyClipRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ColorMaster hotkey
      const colorMasterHotkey = formData.donkeyTools?.colorMaster?.hotkey || '';
      if (colorMasterHotkey && finalHotkey.toLowerCase() === colorMasterHotkey.toLowerCase()) {
        const fallback = easyClipOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            easyClip: {
              enabled: isEnabled,
              hotkey: fallback,
              maxItems,
            },
          },
        };
        setFormData(updated);
        setEasyClipHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou ColorMaster kapátka. Byla zachována původní zkratka.`);
        setIsRecordingEasyClipHotkey(false);
        easyClipPressedKeysRef.current.clear();
        easyClipMaxComboRef.current = [];
        setEasyClipRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with QuickCap hotkey
      const quickCapHotkey = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '';
      if (quickCapHotkey && finalHotkey.toLowerCase() === quickCapHotkey.toLowerCase()) {
        const fallback = easyClipOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            easyClip: {
              enabled: isEnabled,
              hotkey: fallback,
              maxItems,
            },
          },
        };
        setFormData(updated);
        setEasyClipHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou QuickCap výstřižku. Byla zachována původní zkratka.`);
        setIsRecordingEasyClipHotkey(false);
        easyClipPressedKeysRef.current.clear();
        easyClipMaxComboRef.current = [];
        setEasyClipRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      // Check collision with ScreenRuler hotkey
      const screenRulerHotkey = formData.donkeyTools?.screenRuler?.hotkey || '';
      if (screenRulerHotkey && finalHotkey.toLowerCase() === screenRulerHotkey.toLowerCase()) {
        const fallback = easyClipOriginalHotkeyRef.current || '';
        const updated = {
          ...formData,
          donkeyTools: {
            ...formData.donkeyTools,
            easyClip: {
              enabled: isEnabled,
              hotkey: fallback,
              maxItems,
            },
          },
        };
        setFormData(updated);
        setEasyClipHotkeyError(`Zkratku „${finalHotkey}“ nelze nastavit – koliduje se zkratkou ScreenRuler měřítka. Byla zachována původní zkratka.`);
        setIsRecordingEasyClipHotkey(false);
        easyClipPressedKeysRef.current.clear();
        easyClipMaxComboRef.current = [];
        setEasyClipRecordedModifiers([]);
        (e.target as HTMLInputElement).blur();
        window.electronAPI?.resumeGlobalHotkey?.();
        return;
      }

      setEasyClipHotkeyError(null);
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          easyClip: {
            enabled: isEnabled,
            hotkey: finalHotkey,
            maxItems,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      setIsRecordingEasyClipHotkey(false);
      easyClipPressedKeysRef.current.clear();
      easyClipMaxComboRef.current = [];
      setEasyClipRecordedModifiers([]);
      (e.target as HTMLInputElement).blur();
      window.electronAPI?.resumeGlobalHotkey?.();
      return;
    }
  };

  // Direct handling for injected hotkey events (e.g. Alt+Space, F10 intercepted at native level)
  const injectedHotkeyHandlerRef = useRef<(data: any) => void>(() => {});
  injectedHotkeyHandlerRef.current = (data: any) => {
    let tool = activeRecordingToolRef.current;
    if (!tool) {
      if (isRecordingHotkey) tool = 'main';
      else if (isRecordingColorMasterHotkey) tool = 'colorMaster';
      else if (isRecordingPaletteHotkey) tool = 'palette';
      else if (isRecordingQuickCapHotkey) tool = 'quickCap';
      else if (isRecordingScreenRulerHotkey) tool = 'screenRuler';
      else if (isRecordingEasyClipHotkey) tool = 'easyClip';
    }
    if (!tool) {
      const activeField = document.activeElement?.getAttribute('data-hotkey-field');
      if (
        activeField === 'main' ||
        activeField === 'colorMaster' ||
        activeField === 'palette' ||
        activeField === 'quickCap' ||
        activeField === 'screenRuler' ||
        activeField === 'easyClip'
      ) {
        tool = activeField as any;
      }
    }

    if (!tool) return;

    const fakeTarget = (document.activeElement as HTMLElement) || { blur: () => {} };
    const fakeEvent = {
      key: data.key === ' ' || data.key === 'Space' ? 'Space' : data.key,
      code: data.code || 'Space',
      altKey: Boolean(data.altKey),
      ctrlKey: Boolean(data.ctrlKey),
      shiftKey: Boolean(data.shiftKey),
      metaKey: Boolean(data.metaKey),
      preventDefault: () => {},
      stopPropagation: () => {},
      target: fakeTarget,
    } as unknown as React.KeyboardEvent<HTMLInputElement>;

    if (data.type === 'keydown') {
      if (tool === 'main') handleHotkeyKeyDown(fakeEvent);
      else if (tool === 'colorMaster') handleColorMasterHotkeyKeyDown(fakeEvent);
      else if (tool === 'palette') handlePaletteHotkeyKeyDown(fakeEvent);
      else if (tool === 'quickCap') handleQuickCapHotkeyKeyDown(fakeEvent);
      else if (tool === 'screenRuler') handleScreenRulerHotkeyKeyDown(fakeEvent);
      else if (tool === 'easyClip') handleEasyClipHotkeyKeyDown(fakeEvent);
    } else if (data.type === 'keyup') {
      if (tool === 'main') handleHotkeyKeyUp(fakeEvent);
      else if (tool === 'colorMaster') handleColorMasterHotkeyKeyUp(fakeEvent);
      else if (tool === 'palette') handlePaletteHotkeyKeyUp(fakeEvent);
      else if (tool === 'quickCap') handleQuickCapHotkeyKeyUp(fakeEvent);
      else if (tool === 'screenRuler') handleScreenRulerHotkeyKeyUp(fakeEvent);
      else if (tool === 'easyClip') handleEasyClipHotkeyKeyUp(fakeEvent);
    }
  };

  useEffect(() => {
    const cleanup = window.electronAPI?.onInjectedHotkeyEvent?.((data) => {
      injectedHotkeyHandlerRef.current(data);
    });
    return () => {
      cleanup?.();
    };
  }, []);

  const loadRecentQuickCaps = async () => {
    const getRecent = window.electronAPI?.getRecentQuickCaps || window.electronAPI?.getRecentFastSnaps;
    if (!getRecent) return;
    setIsLoadingQuickCaps(true);
    try {
      const items = await getRecent();
      setRecentQuickCaps(items || []);
    } catch (err) {
      console.error('Failed to load recent quickcaps:', err);
    } finally {
      setIsLoadingQuickCaps(false);
    }
  };

  const handleCopyQuickCap = async (itemPath: string) => {
    const copyFn = window.electronAPI?.copyQuickCapToClipboard || window.electronAPI?.copyFastSnapToClipboard;
    if (!copyFn) return;
    const res = await copyFn(itemPath);
    if (res?.success) {
      setCopiedQuickCapPath(itemPath);
      setTimeout(() => setCopiedQuickCapPath(null), 2000);
    }
  };

  const handleDeleteQuickCap = async (itemPath: string) => {
    const deleteFn = window.electronAPI?.deleteQuickCap || window.electronAPI?.deleteFastSnap;
    if (!deleteFn) return;
    await deleteFn(itemPath);
    await loadRecentQuickCaps();
  };

  const handleShowQuickCapInFolder = (itemPath: string) => {
    if (window.electronAPI?.showQuickCapInFolder) {
      window.electronAPI.showQuickCapInFolder(itemPath);
    } else {
      window.electronAPI?.showFastSnapInFolder?.(itemPath);
    }
  };

  const handleChooseQuickCapFolder = async () => {
    const chooseFn = window.electronAPI?.chooseQuickCapFolder || window.electronAPI?.chooseFastSnapFolder;
    if (!chooseFn) return;
    const chosen = await chooseFn();
    if (chosen) {
      const isEnabled = formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false;
      const hotkey = formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '';
      const updated = {
        ...formData,
        donkeyTools: {
          ...formData.donkeyTools,
          quickCap: {
            enabled: isEnabled,
            hotkey,
            saveDirectory: chosen,
          },
          fastSnap: {
            enabled: isEnabled,
            hotkey,
            saveDirectory: chosen,
          },
        },
      };
      setFormData(updated);
      handleSave(updated);
      loadRecentQuickCaps();
    }
  };

  const renderSourceForm = (isInline: boolean) => {
    if (!editingSource) return null;
    return (
      <div className={isInline ? 'space-y-4' : 'p-4 bg-white/[0.04] border border-indigo-500/40 rounded-xl space-y-4'}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="font-semibold text-sm text-indigo-300">
            {editingSource.type === 'file'
              ? (isInline ? 'Nastavení lokálního souboru' : 'Konfigurace lokálního souboru')
              : (isInline ? 'Nastavení API zdroje' : 'Konfigurace API zdroje')}
          </span>
          <button
            type="button"
            onClick={handleCloseSourceForm}
            className="text-gray-400 hover:text-white cursor-pointer p-0.5"
            title="Zavřít"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-300 mb-1">Název zdroje</label>
            <input
              type="text"
              value={editingSource.name || ''}
              onChange={(e) => setEditingSource({ ...editingSource, name: e.target.value })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
              placeholder="Např. Firemní záložky"
            />
          </div>

          {editingSource.type === 'file' ? (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-300 mb-1">Cesta k JSON souboru na disku</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={(editingSource as FileSource).path || ''}
                  onChange={(e) => {
                    const updated = { ...(editingSource as FileSource), path: e.target.value };
                    setEditingSource(updated);
                  }}
                  onBlur={() => {
                    if ((editingSource as FileSource)?.path) triggerInspectSource();
                  }}
                  className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none font-mono"
                  placeholder="C:\cesta\k\souboru.json"
                />
                <button
                  type="button"
                  onClick={handlePickLocalFile}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Procházet...
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-300 mb-1">API GET Request URL</label>
                <input
                  type="text"
                  value={(editingSource as ApiSource).url || ''}
                  onChange={(e) => {
                    const updated = { ...(editingSource as ApiSource), url: e.target.value };
                    setEditingSource(updated);
                  }}
                  onBlur={() => {
                    if ((editingSource as ApiSource)?.url) triggerInspectSource();
                  }}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none font-mono"
                  placeholder="https://api.example.com/items"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-300 mb-1">Způsob autentizace</label>
                <select
                  value={(editingSource as ApiSource).authType}
                  onChange={(e) =>
                    setEditingSource({
                      ...(editingSource as ApiSource),
                      authType: e.target.value as 'none' | 'getToken',
                    })
                  }
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                >
                  <option value="none">Bez přihlášení</option>
                  <option value="getToken">S přihlášením (getToken metoda)</option>
                </select>
              </div>

              {(editingSource as ApiSource).authType === 'getToken' && (
                <div className="col-span-2 p-3 bg-black/20 rounded-lg border border-white/5 space-y-3">
                  <p className="text-xs text-indigo-300 font-medium">Nastavení pro získání tokenu (getToken)</p>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">URL pro získání tokenu (POST)</label>
                    <input
                      type="text"
                      value={(editingSource as ApiSource).tokenUrl || ''}
                      onChange={(e) =>
                        setEditingSource({ ...(editingSource as ApiSource), tokenUrl: e.target.value })
                      }
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none"
                      placeholder="https://api.example.com/auth/get-token"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Uživatelské jméno / Klíč</label>
                      <input
                        type="text"
                        value={(editingSource as ApiSource).tokenUsername || ''}
                        onChange={(e) =>
                          setEditingSource({ ...(editingSource as ApiSource), tokenUsername: e.target.value })
                        }
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Heslo / Secret</label>
                      <input
                        type="password"
                        value={(editingSource as ApiSource).tokenPassword || ''}
                        onChange={(e) =>
                          setEditingSource({ ...(editingSource as ApiSource), tokenPassword: e.target.value })
                        }
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* JSON Structure Detection and Field Mapping - shown ONLY if structure has an error or mismatch */}
          {hasStructureError && (
            <div className="col-span-2 pt-4 border-t border-white/10 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-indigo-400">tune</span>
                    Mapování polí JSONu (odlišná struktura dat)
                  </h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {hasMissingName
                      ? 'V načtených datech nebylo nalezeno standardní pole "name". Namapujte prosím atributy z JSONu na pole IADonkey.'
                      : 'Vlastní mapování atributů JSONu na pole IADonkey.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => triggerInspectSource()}
                  disabled={isInspecting}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-indigo-300 hover:text-white bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  title="Znovu analyzovat data ze zdroje a načíst pole"
                >
                  <span className={`material-symbols-outlined text-xs ${isInspecting ? 'animate-spin' : ''}`}>sync</span>
                  <span>Znovu načíst pole</span>
                </button>
              </div>

              {isInspecting && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex items-center gap-2 text-xs text-indigo-300">
                  <span className="material-symbols-outlined text-base animate-spin text-indigo-400">sync</span>
                  <span>Načítám a analyzuji strukturu JSON dat...</span>
                </div>
              )}

              {inspectError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm shrink-0">error</span>
                    <span>{inspectError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerInspectSource()}
                    className="text-[11px] underline hover:text-white shrink-0 cursor-pointer"
                  >
                    Zkusit znovu
                  </button>
                </div>
              )}

              <div className="p-3.5 bg-black/30 rounded-xl border border-white/5 space-y-3">
                {detectedKeys.length > 0 ? (
                  <div className="text-[11px] text-gray-400 pb-2 border-b border-white/5 flex flex-wrap items-center gap-1.5">
                    <span>Detekovaná pole v záznamech ({detectedKeys.length}):</span>
                    {detectedKeys.map((k) => (
                      <code key={k} className="px-1.5 py-0.5 rounded bg-white/10 text-indigo-300 font-mono text-[10px]">
                        {k}
                      </code>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-300/80 pb-2 border-b border-white/5 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-amber-400">info</span>
                    <span>Klíče z JSONu nebyly automaticky detekovány. Můžete zadat název pole ručně nebo zvolit pevnou hodnotu.</span>
                  </div>
                )}

                <div className="space-y-3">
                  {MAPPING_FIELDS.map((target) => {
                    const rule = editingSource?.mapping?.[target.key];
                    const isActionField = target.key === 'action';
                    const isFixed = rule?.type === 'fixed';
                    const isCustomField = rule?.type === 'field' && Boolean(rule.value) && !detectedKeys.includes(rule.value);
                    const selectValue = isFixed
                      ? (isActionField && (rule?.value === 'open' || rule?.value === 'copy')
                          ? (rule.value === 'open' ? '__fixed_open__' : '__fixed_copy__')
                          : '__fixed__')
                      : isCustomField
                      ? '__custom_field__'
                      : (rule?.value || '');

                    return (
                      <div key={target.key} className="space-y-1.5 bg-white/[0.02] p-3 rounded-lg border border-white/5 w-full">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-300">{target.label}</label>
                          <span className="text-[10px] text-gray-500">{target.defaultHint}</span>
                        </div>
                        <select
                          value={selectValue}
                          onChange={(e) => handleMappingChange(target.key, e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 outline-none cursor-pointer"
                        >
                          <option value="">{isActionField ? '— Výchozí: open (Otevřít) —' : '— Výchozí (z pole se stejným názvem) —'}</option>
                          {detectedKeys.length > 0 && (
                            <optgroup label="Detekovaná pole v JSONu">
                              {detectedKeys.map((k) => (
                                <option key={k} value={k}>
                                  Pole: {k}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {isActionField && (
                            <>
                              <option value="__fixed_open__">★ Pevná hodnota pro všechny: Otevřít (open)</option>
                              <option value="__fixed_copy__">★ Pevná hodnota pro všechny: Kopírovat (copy)</option>
                            </>
                          )}
                          <option value="__custom_field__">✎ Ručně zadat název pole z JSONu...</option>
                          <option value="__fixed__">{isActionField ? '★ Jiná pevná hodnota...' : '★ Vlastní pevná hodnota pro všechny záznamy...'}</option>
                        </select>

                        {isCustomField && (
                          <div className="pt-1">
                            <input
                              type="text"
                              value={rule?.value || ''}
                              onChange={(e) => handleCustomFieldChange(target.key, e.target.value)}
                              placeholder="Zadejte přesný název klíče v JSONu (např. title, link, url)"
                              className="w-full bg-black/60 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-400 font-mono"
                            />
                          </div>
                        )}

                        {isFixed && isActionField && (
                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleFixedValueChange('action', 'open')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                                rule?.value === 'open'
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">arrow_forward</span>
                              <span>Otevřít (open)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFixedValueChange('action', 'copy')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                                rule?.value === 'copy'
                                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                              }`}
                            >
                              <span className="material-symbols-outlined text-sm">content_copy</span>
                              <span>Kopírovat (copy)</span>
                            </button>
                          </div>
                        )}

                        {isFixed && target.key === 'icon' && (
                          <div className="pt-1">
                            <IconPickerInput
                              value={rule?.value || ''}
                              onChange={(val) => handleFixedValueChange('icon', val)}
                              placeholder="Vyberte pevnou ikonu pro všechny záznamy..."
                            />
                          </div>
                        )}

                        {isFixed && target.key !== 'icon' && (!isActionField || (rule?.value !== 'open' && rule?.value !== 'copy')) && (
                          <div className="pt-1">
                            <input
                              type="text"
                              value={rule?.value || ''}
                              onChange={(e) => handleFixedValueChange(target.key, e.target.value)}
                              placeholder={target.placeholder || 'Zadejte pevnou hodnotu pro všechny záznamy'}
                              className="w-full bg-black/60 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-400 font-mono"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Live preview - věrná simulace Spotlight výsledku */}
                {sampleRecord && (() => {
                  const previewName = getMappedPreviewValue('name', 'Položka bez názvu');
                  const previewLocation = getMappedPreviewValue('location', '');
                  const previewIcon = getMappedPreviewValue('icon', 'code');
                  const previewImage = getMappedPreviewValue('image', '');
                  const previewAction = getMappedPreviewValue('action', 'open');

                  return (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-[11px]">
                        <span className="material-symbols-outlined text-sm">visibility</span>
                        <span>Náhled 1. položky ve Spotlight vyhledávači:</span>
                      </div>

                      {/* Spotlight container frame */}
                      <div className="bg-[#1c1d24] border border-white/10 rounded-xl p-1.5 shadow-xl">
                        <div className="flex items-center px-3 py-2.5 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-white shadow-md gap-3">
                          {/* Column 1: Icon / Image with separator */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="w-9 h-9 flex items-center justify-center overflow-hidden">
                              <MaterialIcon
                                icon={previewIcon}
                                image={previewImage}
                                location={previewLocation}
                                fallbackIcon="code"
                                className="w-7 h-7"
                              />
                            </div>
                            <div className="h-6 w-[1px] shrink-0 self-center bg-white/20" />
                          </div>

                          {/* Column 2: Name and Location */}
                          <div className="flex-1 min-w-0 flex flex-col justify-center pl-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate leading-tight text-white">
                                {previewName}
                              </span>
                              {previewAction && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium uppercase bg-white/10 text-gray-300 border-white/15">
                                  {previewAction}
                                </span>
                              )}
                            </div>
                            <div className="text-xs mt-0.5 font-mono text-gray-400 truncate">
                              {previewLocation || '(žádná lokace)'}
                            </div>
                          </div>

                          {/* Column 3: Action indicator */}
                          <div className="shrink-0 text-xs flex items-center gap-1.5 text-indigo-200 opacity-90 select-none">
                            <span className="text-[11px]">Provést</span>
                            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
                              Enter
                            </kbd>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleCloseSourceForm}
            className="px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={() => editingSource && handleSaveSource(editingSource)}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition cursor-pointer"
          >
            Uložit zdroj
          </button>
        </div>
      </div>
    );
  };

  const STATIC_STRUCT_FIELDS: { key: keyof LauncherItem; label: string; placeholder: string }[] = [
    { key: 'name', label: 'Název (name)', placeholder: 'např. Moje položka' },
    { key: 'location', label: 'Cesta / URL / Hodnota (location)', placeholder: 'např. https://firma.cz nebo C:\\cesta' },
    { key: 'action', label: 'Akce (action)', placeholder: 'open nebo copy' },
    { key: 'icon', label: 'Ikona (icon)', placeholder: 'např. bookmark, folder, terminal...' },
    { key: 'image', label: 'Obrázek (image)', placeholder: 'např. https://.../logo.png' },
    { key: 'priority', label: 'Priorita (priority)', placeholder: 'např. 0, 10, -1' },
    { key: 'settings', label: 'Nastavení (settings)', placeholder: 'např. magicgate, git' },
  ];

  const handleExportStaticSource = (src: StaticSource) => {
    const shared = src.sharedParams || {};
    const mergedItems = (src.items || []).map((it) => {
      const itemCopy: any = { ...it };
      delete itemCopy.id;
      for (const [k, v] of Object.entries(shared)) {
        if (v !== undefined && v !== '' && (itemCopy[k] === undefined || itemCopy[k] === '' || itemCopy[k] === null)) {
          itemCopy[k] = k === 'priority' ? Number(v) : v;
        }
      }
      if (Array.isArray(itemCopy.options)) {
        itemCopy.options = itemCopy.options.map((opt: any) => {
          const optCopy: any = { ...opt };
          delete optCopy.id;
          delete optCopy.actions;
          return optCopy;
        });
      }
      if (Array.isArray(itemCopy.actions)) {
        itemCopy.actions = itemCopy.actions.map((act: any) => {
          const actCopy: any = { ...act };
          delete actCopy.id;
          return actCopy;
        });
      }
      return itemCopy;
    });

    const jsonStr = JSON.stringify(mergedItems, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (src.name || 'static-data').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    a.download = `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStaticSourceForm = (isInline: boolean) => {
    if (!editingSource || editingSource.type !== 'static') return null;
    const staticSrc = editingSource as StaticSource;
    const sharedParams = staticSrc.sharedParams || {};
    const unusedFields = STATIC_STRUCT_FIELDS.filter((f) => !(f.key in sharedParams));
    const items = staticSrc.items || [];
    const itemFields = STATIC_STRUCT_FIELDS.filter((f) => !(f.key in sharedParams));

    const handleUpdateShared = (key: string, value: string) => {
      setEditingSource({
        ...staticSrc,
        sharedParams: { ...sharedParams, [key]: value },
      });
    };

    const handleRemoveShared = (key: string) => {
      const updated = { ...sharedParams };
      delete updated[key];
      setEditingSource({
        ...staticSrc,
        sharedParams: updated,
      });
    };

    const handleAddSharedField = (fieldKey: string) => {
      setEditingSource({
        ...staticSrc,
        sharedParams: {
          ...sharedParams,
          [fieldKey]: fieldKey === 'action' ? 'open' : fieldKey === 'priority' ? '0' : '',
        },
      });
      setIsSharedDropdownOpen(false);
    };

    const handleAddItem = () => {
      const newItem: LauncherItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: '',
      };
      setEditingSource({
        ...staticSrc,
        items: [...items, newItem],
      });
    };

    const handleRemoveItem = (index: number) => {
      const nextItems = items.filter((_, i) => i !== index);
      setEditingSource({
        ...staticSrc,
        items: nextItems,
      });
    };

    const handleUpdateItemField = (itemIdx: number, fieldKey: keyof LauncherItem, val: any) => {
      const nextItems = [...items];
      nextItems[itemIdx] = {
        ...nextItems[itemIdx],
        [fieldKey]: fieldKey === 'priority' ? (val === '' ? null : Number(val)) : val,
      };
      setEditingSource({
        ...staticSrc,
        items: nextItems,
      });
    };

    const handleAddAction = (itemIdx: number) => {
      const nextItems = [...items];
      const curActions = nextItems[itemIdx].actions || [];
      nextItems[itemIdx] = {
        ...nextItems[itemIdx],
        actions: [...curActions, { name: '', action: 'open', location: '', icon: '', settings: null }],
      };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    const handleUpdateAction = (itemIdx: number, actionIdx: number, fieldKey: string, val: string) => {
      const nextItems = [...items];
      const curActions = [...(nextItems[itemIdx].actions || [])];
      const normalizedVal = val === '' ? null : val;
      const updatedAction = { ...curActions[actionIdx], [fieldKey]: normalizedVal };

      // Logické provázání action a settings
      if (fieldKey === 'action') {
        if (val === 'clone' || val === 'clonerecursive') {
          updatedAction.settings = 'git';
        } else if (val === 'vscode') {
          updatedAction.settings = 'vscode';
        } else if (val === 'android-studio') {
          updatedAction.settings = 'android-studio';
        }
      } else if (fieldKey === 'settings') {
        if (val === 'vscode') {
          updatedAction.action = 'vscode';
        } else if (val === 'android-studio') {
          updatedAction.action = 'android-studio';
        } else if (val === 'git' && !['clone', 'clonerecursive'].includes(updatedAction.action)) {
          updatedAction.action = 'clone';
        }
      }

      curActions[actionIdx] = updatedAction;
      nextItems[itemIdx] = { ...nextItems[itemIdx], actions: curActions };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    const handleRemoveAction = (itemIdx: number, actionIdx: number) => {
      const nextItems = [...items];
      const curActions = (nextItems[itemIdx].actions || []).filter((_, i) => i !== actionIdx);
      nextItems[itemIdx] = { ...nextItems[itemIdx], actions: curActions.length > 0 ? curActions : undefined };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    const handleAddOption = (itemIdx: number) => {
      const nextItems = [...items];
      const curOptions = nextItems[itemIdx].options || [];
      const newOpt: LauncherItem = {
        id: `opt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: '',
        location: '',
        action: 'open',
        icon: '',
        image: '',
        settings: null,
      };
      nextItems[itemIdx] = {
        ...nextItems[itemIdx],
        options: [...curOptions, newOpt],
      };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    const handleUpdateOption = (itemIdx: number, optIdx: number, fieldKey: keyof LauncherItem, val: any) => {
      const nextItems = [...items];
      const curOptions = [...(nextItems[itemIdx].options || [])];
      const normalizedVal = val === '' ? null : val;
      const updatedOpt = { ...curOptions[optIdx], [fieldKey]: normalizedVal };

      // Logické provázání action a settings
      if (fieldKey === 'action') {
        if (val === 'vscode') {
          updatedOpt.settings = 'vscode';
        } else if (val === 'android-studio') {
          updatedOpt.settings = 'android-studio';
        }
      } else if (fieldKey === 'settings') {
        if (val === 'vscode') {
          updatedOpt.action = 'open';
        } else if (val === 'android-studio') {
          updatedOpt.action = 'open';
        }
      }

      curOptions[optIdx] = updatedOpt;
      nextItems[itemIdx] = { ...nextItems[itemIdx], options: curOptions };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    const handleRemoveOption = (itemIdx: number, optIdx: number) => {
      const nextItems = [...items];
      const curOptions = (nextItems[itemIdx].options || []).filter((_, i) => i !== optIdx);
      nextItems[itemIdx] = { ...nextItems[itemIdx], options: curOptions.length > 0 ? curOptions : undefined };
      setEditingSource({ ...staticSrc, items: nextItems });
    };

    return (
      <div className={isInline ? 'space-y-4' : 'p-4 bg-purple-950/10 border border-purple-500/40 rounded-xl space-y-4'}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="font-semibold text-sm text-purple-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">data_object</span>
            {isInline ? 'Nastavení statických dat' : 'Konfigurace statických dat'}
          </span>
          <button
            type="button"
            onClick={handleCloseSourceForm}
            className="text-gray-400 hover:text-white cursor-pointer p-0.5"
            title="Zavřít"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        {/* Source Name */}
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-1">Název zdroje</label>
          <input
            type="text"
            value={staticSrc.name || ''}
            onChange={(e) => setEditingSource({ ...staticSrc, name: e.target.value })}
            placeholder="např. Oblíbené weby, Nástroje týmu..."
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-400"
          />
        </div>

        {/* ČÁST 1: Společné parametry */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">share</span>
                Část 1: Společné parametry (dědí všechny položky)
              </h5>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Parametry nastavené zde se automaticky použijí pro každou položku a nebudou se v nich znovu zadávat.
              </p>
            </div>

            {/* Dropdown button for adding shared param */}
            <div className="relative">
              <button
                type="button"
                disabled={unusedFields.length === 0}
                onClick={() => setIsSharedDropdownOpen(!isSharedDropdownOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>Přidat společný parametr</span>
                <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
              </button>

              {isSharedDropdownOpen && unusedFields.length > 0 && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#1e2029] border border-purple-500/40 rounded-xl shadow-2xl py-1 z-50 animate-fade-in">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10">
                    Dostupná pole struktury:
                  </div>
                  {unusedFields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleAddSharedField(f.key)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-purple-500/20 text-gray-200 hover:text-white flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="font-mono text-purple-300">{f.key}</span>
                      <span className="text-[11px] text-gray-400">{f.label.split('(')[0].trim()}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List of active shared params */}
          {Object.keys(sharedParams).length === 0 ? (
            <div className="p-3 bg-black/20 border border-dashed border-white/10 rounded-lg text-center text-xs text-gray-400">
              Žádné společné parametry nejsou definovány. Všechna pole budete moci zadávat u každé položky zvlášť.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(sharedParams).map(([key, val]) => {
                const fieldDef = STATIC_STRUCT_FIELDS.find((f) => f.key === key);
                return (
                  <div key={key} className="p-2.5 bg-black/30 border border-purple-500/30 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-purple-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        {key}
                        <span className="text-[11px] font-sans text-gray-400">({fieldDef?.label.split('(')[0].trim() || key})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveShared(key)}
                        className="text-gray-400 hover:text-rose-400 transition cursor-pointer p-0.5"
                        title="Odebrat společný parametr (vrátí se do dropdownu)"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>

                    {key === 'action' ? (
                      <div className="flex items-center gap-1.5 h-[38px]">
                        <button
                          type="button"
                          onClick={() => handleUpdateShared('action', 'open')}
                          className={`flex-1 h-[38px] text-xs rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                            val === 'open'
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">arrow_forward</span>
                          open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateShared('action', 'copy')}
                          className={`flex-1 h-[38px] text-xs rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                            val === 'copy'
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">content_copy</span>
                          copy
                        </button>
                      </div>
                    ) : key === 'icon' ? (
                      <IconPickerInput
                        value={val || ''}
                        onChange={(newIcon) => handleUpdateShared('icon', newIcon)}
                        placeholder="Vybrat společnou ikonu..."
                        accentColorClass="text-purple-300"
                      />
                    ) : (
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => handleUpdateShared(key, e.target.value)}
                        placeholder={fieldDef?.placeholder || 'Hodnota'}
                        className="w-full h-[38px] bg-black/50 border border-white/10 rounded-lg px-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-400 font-mono"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ČÁST 2: Položky */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">list</span>
                Část 2: Položky ({items.length})
              </h5>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Formulář každé položky obsahuje pouze nespolečná pole.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>Přidat položku</span>
            </button>
          </div>

          {items.length === 0 ? (
            <div className="p-4 bg-black/20 border border-dashed border-white/10 rounded-lg text-center text-xs text-gray-400">
              Zatím nejsou přidány žádné položky. Klikněte na &quot;Přidat položku&quot; výše.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, itemIdx) => (
                <div
                  key={item.id || itemIdx}
                  className="p-3 bg-black/40 border border-white/10 rounded-xl space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-mono flex items-center justify-center">
                        {itemIdx + 1}
                      </span>
                      <span className="text-xs font-semibold text-white truncate max-w-xs">
                        {item.name || '(Položka bez názvu)'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(itemIdx)}
                      className="text-gray-400 hover:text-rose-400 transition cursor-pointer flex items-center gap-1 text-xs"
                      title="Smazat tuto položku"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      <span>Smazat</span>
                    </button>
                  </div>

                  {/* Nespolečná pole položky */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {itemFields.map((field) => {
                      const isFullWidth = field.key === 'name' || field.key === 'location';
                      return (
                        <div
                          key={field.key}
                          className={`space-y-1 ${isFullWidth ? 'col-span-1 sm:col-span-2' : ''}`}
                        >
                          <label className="text-[11px] text-gray-300 font-medium flex items-center justify-between">
                            <span>{field.label}</span>
                            <span className="text-gray-500 font-mono text-[10px]">{field.key}</span>
                          </label>
                          {field.key === 'action' ? (
                            <div className="flex items-center gap-1.5 h-[38px]">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemField(itemIdx, 'action', 'open')}
                                className={`flex-1 h-[38px] text-xs rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                                  (item.action || 'open') === 'open'
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                }`}
                              >
                                open
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemField(itemIdx, 'action', 'copy')}
                                className={`flex-1 h-[38px] text-xs rounded-lg border transition cursor-pointer flex items-center justify-center gap-1 ${
                                  item.action === 'copy'
                                    ? 'bg-purple-600 border-purple-500 text-white'
                                    : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                }`}
                              >
                                copy
                              </button>
                            </div>
                          ) : field.key === 'location' ? (
                            <textarea
                              rows={3}
                              value={(item.location as string) ?? ''}
                              onChange={(e) => handleUpdateItemField(itemIdx, 'location', e.target.value)}
                              placeholder={field.placeholder}
                              className="w-full bg-black/50 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-400 font-mono resize-y whitespace-pre leading-relaxed"
                            />
                          ) : field.key === 'icon' ? (
                            <IconPickerInput
                              value={(item.icon as string) ?? ''}
                              onChange={(val) => handleUpdateItemField(itemIdx, 'icon', val)}
                              placeholder="Vybrat ikonu položky..."
                              accentColorClass="text-purple-300"
                            />
                          ) : (
                            <input
                              type="text"
                              value={(item[field.key as keyof LauncherItem] as string) ?? ''}
                              onChange={(e) => handleUpdateItemField(itemIdx, field.key as keyof LauncherItem, e.target.value)}
                              placeholder={field.placeholder}
                              className="w-full h-[38px] bg-black/50 border border-white/10 rounded-lg px-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-purple-400 font-mono"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Možnosti Actions a Options */}
                  <div className="pt-2 border-t border-white/5 space-y-2.5">
                    {/* Actions list */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-300 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-purple-400">touch_app</span>
                          Akce položky ({item.actions?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddAction(itemIdx)}
                          className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">add</span>
                          Přidat akci
                        </button>
                      </div>

                      {(item.actions || []).map((act, actIdx) => (
                        <div key={actIdx} className="p-3 bg-black/60 border border-white/10 rounded-xl space-y-2.5 text-xs">
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                            <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono flex items-center justify-center">
                                {actIdx + 1}
                              </span>
                              <span>{act.name || `Akce #${actIdx + 1}`}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAction(itemIdx, actIdx)}
                              className="text-gray-400 hover:text-rose-400 text-xs flex items-center gap-1 cursor-pointer"
                              title="Smazat akci"
                            >
                              <span className="material-symbols-outlined text-xs">delete</span>
                              <span>Smazat</span>
                            </button>
                          </div>

                          {/* Řádek 1: name | action */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Název akce (name)</label>
                              <input
                                type="text"
                                value={act.name || ''}
                                onChange={(e) => handleUpdateAction(itemIdx, actIdx, 'name', e.target.value)}
                                placeholder="např. Otevřít ve VS Code"
                                className="w-full h-[38px] bg-black/50 border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Typ akce (action)</label>
                              <select
                                value={act.action || ''}
                                onChange={(e) => handleUpdateAction(itemIdx, actIdx, 'action', e.target.value)}
                                className="w-full h-[38px] bg-[#181920] border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400 font-mono"
                              >
                                <option value="">(Výchozí / null)</option>
                                <option value="open">open</option>
                                <option value="copy">copy</option>
                                <option value="clone">clone</option>
                                <option value="clonerecursive">clonerecursive</option>
                                <option value="vscode">vscode</option>
                                <option value="android-studio">android-studio</option>
                              </select>
                            </div>
                          </div>

                          {/* Řádek 2: location (víceřádkové pole, respektovat odřádkování) */}
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">Cesta / Hodnota (location)</label>
                            <textarea
                              rows={2}
                              value={act.location || ''}
                              onChange={(e) => handleUpdateAction(itemIdx, actIdx, 'location', e.target.value)}
                              placeholder="Cesta k souboru, URL adresa, příkaz nebo text..."
                              className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-400 font-mono resize-y whitespace-pre-wrap leading-relaxed"
                            />
                          </div>

                          {/* Řádek 3: icon | settings */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Ikona (icon)</label>
                              <IconPickerInput
                                value={act.icon || ''}
                                onChange={(val) => handleUpdateAction(itemIdx, actIdx, 'icon', val)}
                                placeholder="Vybrat ikonu akce..."
                                accentColorClass="text-purple-300"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Nastavení (settings)</label>
                              <select
                                value={act.settings || ''}
                                onChange={(e) => handleUpdateAction(itemIdx, actIdx, 'settings', e.target.value)}
                                className="w-full h-[38px] bg-[#181920] border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400 font-mono"
                              >
                                <option value="">(Žádné / null)</option>
                                <option value="git">git</option>
                                <option value="magicgate">magicgate</option>
                                <option value="vscode">vscode</option>
                                <option value="android-studio">android-studio</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Options list */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-300 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-purple-400">subdirectory_arrow_right</span>
                          Subpoložky ({item.options?.length || 0})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddOption(itemIdx)}
                          className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-0.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">add</span>
                          Přidat subpoložku
                        </button>
                      </div>

                      {(item.options || []).map((opt, optIdx) => (
                        <div key={opt.id || optIdx} className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-2.5 text-xs">
                          <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                            <span className="text-xs font-semibold text-purple-200 flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono flex items-center justify-center">
                                {optIdx + 1}
                              </span>
                              <span>{opt.name || `Subpoložka #${optIdx + 1}`}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(itemIdx, optIdx)}
                              className="text-gray-400 hover:text-rose-400 text-xs flex items-center gap-1 cursor-pointer"
                              title="Smazat subpoložku"
                            >
                              <span className="material-symbols-outlined text-xs">delete</span>
                              <span>Smazat</span>
                            </button>
                          </div>

                          {/* Řádek 1: name | action */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Název (name)</label>
                              <input
                                type="text"
                                value={opt.name || ''}
                                onChange={(e) => handleUpdateOption(itemIdx, optIdx, 'name', e.target.value)}
                                placeholder="Název subpoložky"
                                className="w-full h-[38px] bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Typ akce (action)</label>
                              <select
                                value={opt.action || ''}
                                onChange={(e) => handleUpdateOption(itemIdx, optIdx, 'action', e.target.value)}
                                className="w-full h-[38px] bg-[#181920] border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400 font-mono"
                              >
                                <option value="">(Výchozí / null)</option>
                                <option value="open">open</option>
                                <option value="copy">copy</option>
                              </select>
                            </div>
                          </div>

                          {/* Řádek 2: location (víceřádkové pole, respektovat odřádkování) */}
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">Cesta / URL / Hodnota (location)</label>
                            <textarea
                              rows={2}
                              value={opt.location || ''}
                              onChange={(e) => handleUpdateOption(itemIdx, optIdx, 'location', e.target.value)}
                              placeholder="Cesta k souboru, složce, URL adresa..."
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-400 font-mono resize-y whitespace-pre-wrap leading-relaxed"
                            />
                          </div>

                          {/* Řádek 3: icon | image | settings */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Ikona (icon)</label>
                              <IconPickerInput
                                value={opt.icon || ''}
                                onChange={(val) => handleUpdateOption(itemIdx, optIdx, 'icon', val)}
                                placeholder="Vybrat ikonu podpoložky..."
                                accentColorClass="text-purple-300"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Obrázek (image)</label>
                              <input
                                type="text"
                                value={opt.image || ''}
                                onChange={(e) => handleUpdateOption(itemIdx, optIdx, 'image', e.target.value)}
                                placeholder="URL obrázku / favikony"
                                className="w-full h-[38px] bg-black/40 border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">Nastavení (settings)</label>
                              <select
                                value={opt.settings || ''}
                                onChange={(e) => handleUpdateOption(itemIdx, optIdx, 'settings', e.target.value)}
                                className="w-full h-[38px] bg-[#181920] border border-white/10 rounded-lg px-2.5 text-xs text-white outline-none focus:border-purple-400 font-mono"
                              >
                                <option value="">(Žádné / null)</option>
                                <option value="magicgate">magicgate</option>
                                <option value="vscode">vscode</option>
                                <option value="android-studio">android-studio</option>
                                <option value="git">git</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex justify-between items-center gap-2 pt-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleExportStaticSource(staticSrc)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-300 hover:text-white bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 rounded-lg transition cursor-pointer"
            title="Exportovat data se sloučenými společnými parametry"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            <span>Exportovat JSON</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCloseSourceForm}
              className="px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => handleSaveSource(staticSrc)}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition cursor-pointer shadow-sm"
            >
              Uložit statická data
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex bg-[#0e0f12] text-gray-200 select-none overflow-hidden font-sans">
      {/* Left Sidebar */}
      <aside className="w-60 bg-transparent flex flex-col shrink-0 z-10">
        {/* Sidebar Brand Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[19px]">settings</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight leading-tight">IADonkey</h2>
              <span className="text-[11px] text-gray-500 block leading-tight">Nastavení</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowChangelog(true)}
            className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 transition cursor-pointer shadow-sm"
            title="Kliknutím zobrazíte historii verzí a novinky (Changelog)"
          >
            v{DISPLAY_APP_VERSION}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sources')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'sources'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`material-symbols-outlined text-lg ${activeTab === 'sources' ? 'text-white' : 'text-gray-400'}`}>database</span>
              <span>Zdroje dat</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-gray-300 font-mono">
              {formData.sources.length}
            </span>
          </button>

          {/* Extensions tab */}
          <button
            type="button"
            onClick={() => setActiveTab('extensions')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'extensions'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`material-symbols-outlined text-lg ${activeTab === 'extensions' ? 'text-white' : 'text-gray-400'}`}>extension</span>
              <span>Rozšíření</span>
            </div>
            {activeExtensionsCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-gray-300 font-mono">
                {activeExtensionsCount}
              </span>
            )}
          </button>

          {/* Sub-items for enabled extensions: collapsed unless extensions or one of extension tabs is active */}
          {['extensions', 'magicgate', 'mlog', 'magicplan', 'github', 'vscode', 'android-studio', 'donkey-tools'].includes(activeTab) && (
            <div className="space-y-0.5 animate-in fade-in duration-150">
              {/* MagicGate tab - visible only when extension is enabled */}
              {formData.extensions?.magicgate && (
                <button
                  type="button"
                  onClick={() => setActiveTab('magicgate')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'magicgate'
                      ? 'bg-amber-500/20 text-amber-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-amber-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-amber-400">security</span>
                    <span>MagicGate</span>
                  </div>
                </button>
              )}

              {/* MLog tab - visible only when extension is enabled */}
              {formData.extensions?.mlog && (
                <button
                  type="button"
                  onClick={() => setActiveTab('mlog')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'mlog'
                      ? 'bg-sky-500/20 text-sky-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-sky-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-sky-400">support_agent</span>
                    <span>Taskmanager</span>
                  </div>
                </button>
              )}

              {/* MagicPlan tab - visible only when extension is enabled */}
              {Boolean(formData.extensions?.magicplan) && (
                <button
                  type="button"
                  onClick={() => setActiveTab('magicplan')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'magicplan'
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-cyan-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-cyan-400">calendar_month</span>
                    <span>MagicPlan</span>
                  </div>
                </button>
              )}

              {/* GitHub tab - visible only when extension is enabled */}
              {formData.extensions?.github && (
                <button
                  type="button"
                  onClick={() => setActiveTab('github')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'github'
                      ? 'bg-emerald-500/20 text-emerald-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-emerald-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-emerald-400">
                      folder_code
                    </span>
                    <span>GitHub</span>
                  </div>
                </button>
              )}

              {/* VS Code tab - visible only when extension is enabled */}
              {formData.extensions?.vscode && (
                <button
                  type="button"
                  onClick={() => setActiveTab('vscode')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'vscode'
                      ? 'bg-cyan-500/20 text-cyan-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-cyan-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-cyan-400">code</span>
                    <span>VS Code</span>
                  </div>
                </button>
              )}

              {/* Android Studio tab - visible only when extension is enabled */}
              {formData.extensions?.androidStudio && (
                <button
                  type="button"
                  onClick={() => setActiveTab('android-studio')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'android-studio'
                      ? 'bg-pink-500/20 text-pink-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-pink-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-pink-400">android</span>
                    <span>Android Studio</span>
                  </div>
                </button>
              )}

              {/* DonkeyTools tab - visible only when extension is enabled */}
              {formData.extensions?.donkeyTools && (
                <button
                  type="button"
                  onClick={() => setActiveTab('donkey-tools')}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-[12px] font-medium transition cursor-pointer pl-6 ${
                    activeTab === 'donkey-tools'
                      ? 'bg-rose-500/20 text-rose-200 font-semibold shadow-sm'
                      : 'text-gray-400 hover:text-rose-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-rose-400">construction</span>
                    <span>DonkeyTools</span>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Snippets tab */}
          <button
            type="button"
            onClick={() => setActiveTab('snippets')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'snippets'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <span className={`material-symbols-outlined text-lg ${activeTab === 'snippets' ? 'text-white' : 'text-gray-400'}`}>draw</span>
            <span>Snippety</span>
          </button>

          {/* General tab */}
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'general'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <span className={`material-symbols-outlined text-lg ${activeTab === 'general' ? 'text-white' : 'text-gray-400'}`}>tune</span>
            <span>Obecné</span>
          </button>

          {/* Notifications tab */}
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'notifications'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <span className={`material-symbols-outlined text-lg ${activeTab === 'notifications' ? 'text-white' : 'text-gray-400'}`}>notifications</span>
            <span>Notifikace</span>
          </button>

          {/* System tab */}
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'system' || activeTab === 'updates'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`material-symbols-outlined text-lg ${activeTab === 'system' || activeTab === 'updates' ? 'text-white' : 'text-gray-400'}`}>dns</span>
              <span>Systém</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {updateInfo?.hasUpdate ? (
                <span
                  title="K dispozici je nová verze aplikace"
                  className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shadow-md shadow-indigo-600/30 shrink-0"
                  style={{ backgroundColor: formData.primaryColor || undefined }}
                >
                  1
                </span>
              ) : null}
              {crashLogs.length > 0 ? (
                <span
                  title={`${crashLogs.length} ${crashLogs.length === 1 ? 'chyba v protokolu' : crashLogs.length < 5 ? 'chyby v protokolu' : 'chyb v protokolu'}`}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono font-bold"
                >
                  {crashLogs.length}
                </span>
              ) : null}
            </div>
          </button>

          {/* Help tab */}
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
              activeTab === 'help'
                ? 'm3-selected-card text-white font-semibold'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className={`material-symbols-outlined text-lg ${activeTab === 'help' ? 'text-white' : 'text-gray-400'}`}>help</span>
              <span>Nápověda</span>
            </div>
          </button>

          {/* Developer tab (only visible when isDevelop is true) */}
          {isDevelop && (
            <button
              type="button"
              onClick={() => setActiveTab('develop')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-[13px] font-medium transition cursor-pointer ${
                activeTab === 'develop'
                  ? 'bg-amber-500/20 text-amber-200 font-semibold shadow-sm'
                  : 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-500/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-lg text-amber-400">bug_report</span>
                <span>Vývojář</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 uppercase tracking-wider font-bold">
                DEV
              </span>
            </button>
          )}
        </nav>

      </aside>

      {/* Main Right Content Pane */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#0e0f12]">
        {/* Right Pane Header */}
        <header className="px-6 py-4 bg-transparent shrink-0">
          <div className="w-full max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                {activeTab === 'sources' && 'Zdroje dat'}
                {activeTab === 'extensions' && 'Rozšíření'}
                {activeTab === 'magicgate' && 'MagicGate'}
                {activeTab === 'mlog' && 'Taskmanager'}
                {activeTab === 'github' && 'GitHub'}
                {activeTab === 'vscode' && 'VS Code'}
                {activeTab === 'android-studio' && 'Android Studio'}
                {activeTab === 'magicplan' && 'MagicPlan'}
                {activeTab === 'donkey-tools' && 'DonkeyTools'}
                {activeTab === 'snippets' && 'Snippety'}
                {activeTab === 'general' && 'Obecné'}
                {activeTab === 'notifications' && 'Notifikace'}
                {(activeTab === 'system' || activeTab === 'updates') && 'Systém'}
                {activeTab === 'help' && 'Nápověda'}
                {activeTab === 'develop' && 'Vývojář'}
              </h2>
              <p className="text-[13px] text-gray-400 mt-0.5">
                {activeTab === 'sources' && 'Správa lokálních JSON souborů a vzdálených API endpointů'}
                {activeTab === 'extensions' && 'Správa doplňkových modulů, firemních nástrojů a externích služeb'}
                {activeTab === 'magicgate' && 'Konfigurace tichého přihlášení pro instanci IS Tour'}
                {activeTab === 'mlog' && 'Nastavení Base URL pro rychlé otevírání požadavků a úkolů'}
                {activeTab === 'github' && 'Přístup k osobním i firemním repozitářům a rychlému klonování'}
                {activeTab === 'vscode' && 'Konfigurace cesty k editoru VS Code pro otevírání repozitářů a projektů'}
                {activeTab === 'android-studio' && 'Konfigurace cesty k Android Studiu pro otevírání mobilních a Kotlin/Java projektů'}
                {activeTab === 'magicplan' && 'Sledování interního plánu práce, nastavení sloupce a časové osy'}
                {activeTab === 'donkey-tools' && 'Správa vestavěných utilit, modulu ColorMaster a klávesových zkratek'}
                {activeTab === 'snippets' && 'Předem definované textové zkratky a osobní údaje pro rychlé vložení'}
                {activeTab === 'general' && 'Globální klávesová zkratka, barva motivu a vyhledávání programů'}
                {activeTab === 'notifications' && 'Nastavení systémových oznámení Windows a upozornění na události'}
                {(activeTab === 'system' || activeTab === 'updates') && 'Správa verzí, aktualizace IADonkey a diagnostika chybových protokolů'}
                {activeTab === 'help' && 'Přehled všech klávesových zkratek a chytrých funkcí'}
                {activeTab === 'develop' && 'Ladicí nástroje, systémová konzole a auditní protokol prováděných akcí'}
              </p>
            </div>
            {saveSuccess && (
              <span className="text-[13px] text-emerald-300 flex items-center gap-1.5 font-medium animate-fade-in bg-emerald-500/15 px-3.5 py-1.5 rounded-full shadow-sm shrink-0">
                <span className="material-symbols-outlined text-base">check_circle</span>
                Změny uloženy
              </span>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Sources */}
          {activeTab === 'sources' && (
            <div className="space-y-4 animate-fade-in max-w-4xl mx-auto">
              {/* Alert banner for synchronization */}
              <div
                className="mb-6 p-4 rounded-2xl flex items-center justify-between gap-4 text-[13px] font-medium animate-fade-in min-h-[58px]"
                style={{
                  backgroundColor: `${formData.primaryColor || '#6366f1'}15`,
                  color: formData.primaryColor || '#6366f1',
                }}
              >
                {/* Idle state: Last sync time info bubble */}
                {syncPhase === 'idle' && (
                  <div className="flex items-center gap-3 min-w-0 animate-fade-in">
                    <span className="material-symbols-outlined text-lg shrink-0">schedule</span>
                    <span className="text-gray-300 truncate">
                      {formData.lastSyncTime ? (
                        <>
                          Poslední aktualizace proběhla: <strong className="font-mono text-white ml-1">{formatLastSyncDate(formData.lastSyncTime)}</strong>
                        </>
                      ) : (
                        'Synchronizace dat zatím neproběhla'
                      )}
                    </span>
                  </div>
                )}

                {/* Syncing state: Replaces the info bubble with smooth progress bar & status text */}
                {syncPhase === 'syncing' && (
                  <div className="flex flex-col justify-center min-w-0 flex-1 gap-1.5 pr-2 animate-fade-in">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0 text-gray-200">
                        <span className="material-symbols-outlined text-base shrink-0 animate-spin text-indigo-400">
                          sync
                        </span>
                        <span className="truncate font-medium">
                          {syncProgress?.sourceName
                            ? `Synchronizuji: ${syncProgress.sourceName}`
                            : 'Probíhá synchronizace dat...'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-white shrink-0 text-xs">
                        {Math.round(visualProgress)}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 m3-primary-pill rounded-full transition-all duration-150 ease-out shadow-sm"
                        style={{ width: `${visualProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Success state: Confirmation before switching back to info bubble */}
                {syncPhase === 'success' && (
                  <div className="flex items-center gap-2.5 min-w-0 text-emerald-400 animate-fade-in">
                    <span className="material-symbols-outlined text-lg shrink-0">check_circle</span>
                    <span className="text-gray-200 truncate font-medium text-[13px]">
                      Synchronizace dat proběhla úspěšně
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTriggerSync}
                  disabled={syncPhase !== 'idle'}
                  className={`m3-primary-pill flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer shrink-0 shadow-sm ${
                    syncPhase === 'success'
                      ? 'bg-emerald-600/30 text-emerald-300 cursor-default'
                      : 'disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                  title={
                    syncPhase === 'syncing'
                      ? 'Probíhá synchronizace dat'
                      : syncPhase === 'success'
                      ? 'Synchronizace proběhla úspěšně'
                      : 'Spustit synchronizaci dat ze všech povolených zdrojů'
                  }
                >
                  <span
                    className={`material-symbols-outlined text-base ${
                      syncPhase === 'syncing' ? 'animate-spin' : ''
                    }`}
                  >
                    {syncPhase === 'success' ? 'check' : 'sync'}
                  </span>
                  <span>
                    {syncPhase === 'syncing'
                      ? 'Probíhá synchronizace...'
                      : syncPhase === 'success'
                      ? 'Dokončeno'
                      : 'Spustit synchronizaci'}
                  </span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="w-full">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-indigo-400">database</span>
                    Importované JSON zdroje a API
                  </h3>
                  <p className="text-[13px] text-gray-400 mt-1">
                    Aplikace stahuje a spojuje data ze všech povolených zdrojů do lokální mezipaměti.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSource('file');
                        setEditingSource({ ...initialFileSource });
                        setDetectedKeys([]);
                        setSampleRecord(null);
                        setInspectError(null);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-full transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">description</span>
                      Přidat JSON soubor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSource('api');
                        setEditingSource({ ...initialApiSource });
                        setDetectedKeys([]);
                        setSampleRecord(null);
                        setInspectError(null);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-full transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">api</span>
                      Přidat API endpoint
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingSource('static');
                        setEditingSource({ ...initialStaticSource });
                        setDetectedKeys([]);
                        setSampleRecord(null);
                        setInspectError(null);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-full transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base text-purple-400">data_object</span>
                      Přidat statická data
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline Add Source Form */}
              {isAddingSource && (
                <div className={`p-4 rounded-xl shadow-sm animate-fade-in ${
                  isAddingSource === 'static'
                    ? 'bg-purple-950/20 border border-purple-500/40'
                    : 'bg-white/[0.03] border border-indigo-500/40'
                }`}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className={`material-symbols-outlined text-lg ${
                        isAddingSource === 'static' ? 'text-purple-400' : 'text-indigo-400'
                      }`}>
                        {isAddingSource === 'file' ? 'description' : isAddingSource === 'api' ? 'api' : 'data_object'}
                      </span>
                      {isAddingSource === 'file'
                        ? 'Nový lokální JSON soubor'
                        : isAddingSource === 'api'
                        ? 'Nový API endpoint'
                        : 'Nová statická data'}
                    </h4>
                    <button
                      type="button"
                      onClick={handleCloseSourceForm}
                      className="text-gray-400 hover:text-white transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                  {isAddingSource === 'static' ? renderStaticSourceForm(false) : renderSourceForm(false)}
                </div>
              )}

              {/* Sources List */}
              <div className="space-y-2.5">
                {formData.sources.length === 0 ? (
                  <div className="p-8 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-xl space-y-2">
                    <span className="material-symbols-outlined text-3xl text-gray-400">folder_open</span>
                    <p className="text-[13px] text-gray-300 font-medium">Zatím nejsou přidány žádné zdroje dat.</p>
                    <p className="text-xs text-gray-400">
                      Přidejte první lokální soubor, API nebo statická data pomocí tlačítek výše.
                    </p>
                  </div>
                ) : (
                  formData.sources.map((src) => {
                    const isCurrentlyEditing = editingSource?.id === src.id && !isAddingSource;
                    return (
                      <div
                        key={src.id}
                        className={`p-4 rounded-2xl transition-all shadow-sm ${
                          isCurrentlyEditing
                            ? (src.type === 'static' ? 'bg-purple-950/30' : 'bg-white/[0.06]')
                            : src.enabled
                            ? 'bg-white/[0.03] hover:bg-white/[0.05]'
                            : 'bg-black/20 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                              src.type === 'static'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-indigo-500/20 text-indigo-400'
                            }`}>
                              <span className="material-symbols-outlined text-xl leading-none select-none">
                                {src.type === 'file' ? 'description' : src.type === 'api' ? 'api' : 'data_object'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-white">{src.name}</span>
                                <span className={`text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full font-semibold ${
                                  src.type === 'static'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-indigo-500/20 text-indigo-300'
                                }`}>
                                  {src.type}
                                </span>
                                {src.type === 'api' && (src as ApiSource).authType === 'getToken' && (
                                  <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                                    getToken auth
                                  </span>
                                )}
                                {src.mapping && Object.keys(src.mapping).length > 0 && (
                                  <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 font-semibold" title="Vlastní mapování polí je aktivní">
                                    Mapováno
                                  </span>
                                )}
                              </div>
                              {src.type !== 'static' && (
                                <p className="text-[13px] text-gray-400 font-mono truncate max-w-md mt-0.5">
                                  {src.type === 'file' ? (src as FileSource).path : (src as ApiSource).url}
                                </p>
                              )}
                              {src.lastSync && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Poslední synchronizace: {src.lastSync} • {src.itemCount ?? 0} položek
                                </p>
                              )}
                              {src.error && (
                                <p className="text-xs text-rose-400 mt-1 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm">error</span>
                                  {src.error}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {src.type === 'static' && (
                              <button
                                type="button"
                                onClick={() => handleExportStaticSource(src as StaticSource)}
                                title="Exportovat do JSON souboru (se sloučenými společnými parametry)"
                                className="w-8 h-8 rounded-full bg-purple-500/15 text-purple-400 hover:text-purple-300 hover:bg-purple-500/25 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                              >
                                <span className="material-symbols-outlined !text-[16px]" style={{ fontSize: '16px' }}>
                                  download
                                </span>
                              </button>
                            )}
                            {src.type === 'api' && (src as ApiSource).url && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText((src as ApiSource).url);
                                  setCopiedSourceId(src.id);
                                  setTimeout(() => setCopiedSourceId(null), 2000);
                                }}
                                title={copiedSourceId === src.id ? 'Zkopírováno do schránky!' : 'Kopírovat URL adresu do schránky'}
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                  copiedSourceId === src.id
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 hover:text-white'
                                }`}
                              >
                                <span className="material-symbols-outlined !text-[16px]" style={{ fontSize: '16px' }}>
                                  {copiedSourceId === src.id ? 'check' : 'content_copy'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleSource(src.id)}
                              onMouseEnter={() => setHoveredEyeId(src.id)}
                              onMouseLeave={() => setHoveredEyeId(null)}
                              title={src.enabled ? 'Aktivní (kliknutím vypnete)' : 'Vypnuto (kliknutím aktivujete)'}
                              className={`w-8 h-8 rounded-full transition-all duration-150 flex items-center justify-center shrink-0 cursor-pointer ${
                                (src.enabled && hoveredEyeId !== src.id) || (!src.enabled && hoveredEyeId === src.id)
                                  ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                  : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                              }`}
                            >
                              <span className="material-symbols-outlined !text-[16px]" style={{ fontSize: '16px' }}>
                                {(src.enabled && hoveredEyeId !== src.id) || (!src.enabled && hoveredEyeId === src.id)
                                  ? 'visibility'
                                  : 'visibility_off'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditSource(src)}
                              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                isCurrentlyEditing
                                  ? (src.type === 'static' ? 'bg-purple-600 text-white' : 'bg-indigo-600 text-white')
                                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                              }`}
                              title={isCurrentlyEditing ? 'Zavřít úpravy' : 'Upravit'}
                            >
                              <span className="material-symbols-outlined !text-[16px]" style={{ fontSize: '16px' }}>edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSource(src.id)}
                              className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-400 hover:text-rose-300 hover:bg-rose-500/25 flex items-center justify-center shrink-0 transition-all cursor-pointer"
                              title="Smazat"
                            >
                              <span className="material-symbols-outlined !text-[16px]" style={{ fontSize: '16px' }}>delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline Edit Form */}
                        {isCurrentlyEditing && (
                          <div className="mt-3.5 pt-3.5 border-t border-white/10 animate-fade-in">
                            {src.type === 'static' ? renderStaticSourceForm(true) : renderSourceForm(true)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Database items count info footer with items viewer button */}
              <div className="pt-2 flex items-center justify-between text-xs text-gray-400 gap-4 flex-wrap">
                <span>
                  Celkem načteno: <strong className="text-white font-semibold text-[13px]">{totalIndexedCount}</strong> položek
                </span>

                <button
                  type="button"
                  onClick={() => setShowItemsViewer(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 rounded-full transition cursor-pointer shrink-0 ml-auto"
                  title="Zobrazit kompletní prioritně řazený seznam všech indexovaných položek pro vyhledávání"
                >
                  <span className="material-symbols-outlined text-base text-indigo-400">format_list_bulleted</span>
                  <span>Kompletní seznam</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-indigo-500/30 text-indigo-200 ml-0.5 font-bold">
                    {totalIndexedCount}
                  </span>
                </button>
              </div>

              {/* External tools section header */}
              <div className="w-full pt-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-indigo-400">handyman</span>
                  Externí nástroje
                </h3>
                <p className="text-[13px] text-gray-400 mt-1">
                  Doplňkové utility, katalogy a pomocné nástroje pro správu obsahu a vyhledávání.
                </p>
              </div>

              {/* Material Symbols Icons Download Card */}
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center shrink-0 text-indigo-400">
                      <span className="material-symbols-outlined text-2xl">interests</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white tracking-wide">Katalog ikon Material Symbols</h3>
                        {formData.iconsLastDownloadedAt ? (
                          <span className="text-[10px] uppercase font-semibold bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full">
                            Aktualizováno
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-semibold bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full">
                            Nestáhnuto
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Kompletní databáze ikon přímo z Google Fonts (3 900+ unikátních ikon s vyhledáváním a štítky) pro výběr ikon zdrojů, akcí i podpoložek.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={handleDownloadIcons}
                      disabled={isDownloadingIcons}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <span className={`material-symbols-outlined text-sm ${isDownloadingIcons ? 'animate-spin' : ''}`}>
                        {isDownloadingIcons ? 'progress_activity' : 'cloud_download'}
                      </span>
                      <span>{isDownloadingIcons ? 'Stahuji...' : 'Stáhnout ikony'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs text-gray-400 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-gray-500">schedule</span>
                    <span>Čas posledního stažení:</span>
                    <span className="font-medium text-gray-200">
                      {formData.iconsLastDownloadedAt ? formatLastSyncDate(formData.iconsLastDownloadedAt) : 'Zatím nestáhnuto'}
                    </span>
                  </div>
                  {typeof formData.iconsCount === 'number' && formData.iconsCount > 0 && (
                    <span className="inline-flex items-center text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-medium">
                      {formData.iconsCount.toLocaleString('cs-CZ')} ikon uloženo v mezipaměti
                    </span>
                  )}
                </div>

                {downloadIconsResult && (
                  <div
                    className={`p-3.5 rounded-2xl flex items-center gap-2 text-xs ${
                      downloadIconsResult.ok
                        ? 'bg-emerald-950/40 text-emerald-300'
                        : 'bg-rose-950/40 text-rose-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {downloadIconsResult.ok ? 'check_circle' : 'error'}
                    </span>
                    <span>
                      {downloadIconsResult.ok
                        ? `Úspěšně staženo a uloženo ${downloadIconsResult.count?.toLocaleString('cs-CZ')} ikon z Google Fonts.`
                        : downloadIconsResult.error || 'Nastala chyba při stahování ikon.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Extensions */}
          {activeTab === 'extensions' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-indigo-400">extension</span>
                  Doplňková rozšíření a integrace
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Rozšíření umožňují propojit IADonkey s dalšími nástroji a firemními systémy. Vypnutím rozšíření se nesmaže vaše konfigurace, pouze se skryje záložka v levém menu a pozastaví se zobrazování výsledků ve vyhledávači.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* 1. MagicGate */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-400">
                        <span className="material-symbols-outlined text-2xl">security</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">MagicGate (IS Tour)</h3>
                          {formData.magicgate?.username?.trim() || formData.magicgate?.xmlPath?.trim() ? (
                            <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                              Nakonfigurováno
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Nenakonfigurováno
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Automatické a bezpečné tiché přihlašování do instancí IS Tour a načítání serverových konfigurací aplikací (Administrace, Web, API, BO) z deploy XML souboru.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.magicgate ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: e.target.checked,
                                mlog: formData.extensions?.mlog ?? false,
                                github: formData.extensions?.github ?? false,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.magicgate && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('magicgate')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení MagicGate</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Taskmanager */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-sky-500/15 flex items-center justify-center shrink-0 text-sky-400">
                        <span className="material-symbols-outlined text-2xl">support_agent</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">Taskmanager</h3>
                          {formData.mlog?.baseUrl?.trim() ? (
                            <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                              Nakonfigurováno
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Nenakonfigurováno
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Rychlé rozpoznávání kódů úkolů a požadavků a jejich okamžité otevírání ve vašem firemním taskmanageru.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.mlog ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: e.target.checked,
                                github: formData.extensions?.github ?? false,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500" />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.mlog && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('mlog')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení Taskmanageru</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. MagicPlan */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/15 flex items-center justify-center shrink-0 text-cyan-400">
                        <span className="material-symbols-outlined text-2xl">calendar_month</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">MagicPlan</h3>
                          {Boolean(formData.extensions?.magicplan) ? (
                            <span className="text-[10px] uppercase bg-cyan-500/20 text-cyan-300 px-2.5 py-0.5 rounded-full font-semibold">
                              {formData.magicplan?.userColumn || 'Zapnuto'}
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Vypnuto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Sledování a synchronizace úkolů z interního plánu. Pravidelná kontrola změn v rozvrhu, toast notifikace na nově přiřazené a dokončené úkoly, podpora fronty nezařazených úkolů a časová osa úkolů.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={Boolean(formData.extensions?.magicplan)}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: formData.extensions?.mlog ?? false,
                                github: formData.extensions?.github ?? false,
                                vscode: formData.extensions?.vscode ?? false,
                                androidStudio: formData.extensions?.androidStudio ?? false,
                                donkeyTools: formData.extensions?.donkeyTools ?? false,
                                magicplan: e.target.checked,
                              },
                              magicplan: {
                                ...formData.magicplan,
                                enabled: e.target.checked,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                      </label>
                    </div>
                  </div>
                  {Boolean(formData.extensions?.magicplan) && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('magicplan')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení MagicPlan</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. GitHub */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-2xl">folder_code</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">GitHub repozitáře</h3>
                          {formData.github?.token?.trim() ? (
                            <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                              Nakonfigurováno
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Nenakonfigurováno
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Automatická indexace a vyhledávání vašich osobních i firemních repozitářů na GitHubu s možností okamžitého zkopírování příkazu <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">git clone</code>.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.github ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: formData.extensions?.mlog ?? false,
                                github: e.target.checked,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div
                          className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                        />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.github && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('github')}
                        className="px-4 py-2 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení GitHub</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 5. VS Code */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/15 flex items-center justify-center shrink-0 text-cyan-400">
                        <span className="material-symbols-outlined text-2xl">code</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">Visual Studio Code (VS Code)</h3>
                          {formData.vscode?.path?.trim() ? (
                            <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                              Nakonfigurováno
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Výchozí instalace
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Okamžité otevírání lokálně naklonovaných repozitářů a projektových složek přímo v editoru Visual Studio Code ze seznamu akcí.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.vscode ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: formData.extensions?.mlog ?? false,
                                github: formData.extensions?.github ?? false,
                                vscode: e.target.checked,
                                androidStudio: formData.extensions?.androidStudio ?? false,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500" />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.vscode && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('vscode')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení VS Code</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. Android Studio */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-pink-500/15 flex items-center justify-center shrink-0 text-pink-400">
                        <span className="material-symbols-outlined text-2xl">android</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">Android Studio</h3>
                          {formData.androidStudio?.path?.trim() ? (
                            <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                              Nakonfigurováno
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Výchozí instalace
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Okamžité otevírání lokálně naklonovaných mobilních repozitářů a Kotlin/Java projektů přímo v prostředí Android Studio ze seznamu akcí.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.androidStudio ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: formData.extensions?.mlog ?? false,
                                github: formData.extensions?.github ?? false,
                                vscode: formData.extensions?.vscode ?? false,
                                androidStudio: e.target.checked,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-500" />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.androidStudio && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('android-studio')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-pink-300 bg-pink-500/15 hover:bg-pink-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení Android Studio</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 7. DonkeyTools */}
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col justify-between gap-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-400">
                        <span className="material-symbols-outlined text-2xl">construction</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-white tracking-wide">DonkeyTools</h3>
                          {formData.extensions?.donkeyTools ? (
                            (() => {
                              const activeCount = [
                                formData.donkeyTools?.colorMaster?.enabled === true,
                                (formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled) === true,
                                formData.donkeyTools?.screenRuler?.enabled === true,
                                formData.donkeyTools?.easyClip?.enabled === true,
                              ].filter(Boolean).length;
                              if (activeCount > 0) {
                                return (
                                  <span className="text-[10px] uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-semibold">
                                    {activeCount} {activeCount === 1 ? 'nástroj aktivní' : activeCount >= 2 && activeCount <= 4 ? 'nástroje aktivní' : 'nástrojů aktivních'}
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] uppercase bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-semibold">
                                  Nenakonfigurováno
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-[10px] uppercase bg-white/5 text-gray-400 px-2.5 py-0.5 rounded-full font-semibold">
                              Vypnuto
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Sada vestavěných systémových nástrojů a utilit – ColorMaster (Eyedropper kapátko s lupou a PaletteMaster pro tvorbu a správu barevných palet, rozpoznávání barev #HEX, RGB, HSL a převody formátů) a další nástroje vyvolatelné zkratkou nebo lomítkem (/).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={formData.extensions?.donkeyTools ?? false}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              extensions: {
                                ...formData.extensions,
                                magicgate: formData.extensions?.magicgate ?? false,
                                mlog: formData.extensions?.mlog ?? false,
                                github: formData.extensions?.github ?? false,
                                vscode: formData.extensions?.vscode ?? false,
                                androidStudio: formData.extensions?.androidStudio ?? false,
                                donkeyTools: e.target.checked,
                              },
                              donkeyTools: formData.donkeyTools || {
                                colorMaster: {
                                  enabled: true,
                                  hotkey: '',
                                  defaultFormat: 'hex',
                                },
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                        />
                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600" />
                      </label>
                    </div>
                  </div>
                  {formData.extensions?.donkeyTools && (
                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <span className="text-xs text-gray-500">Záložka je dostupná v levém menu</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('donkey-tools')}
                        className="px-4 py-2 rounded-full text-xs font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Nastavení DonkeyTools</span>
                        <span className="material-symbols-outlined text-sm">navigate_next</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MagicGate Credentials */}
          {activeTab === 'magicgate' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-amber-400">security</span>
                  Přihlašovací údaje MagicGate
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Nastavení přihlašovacích údajů pro automatické přihlašování do instancí IS Tour (položky s parametrem <code className="bg-white/10 px-2 py-0.5 rounded-full text-amber-300">settings: "magicgate"</code>). Zadané přihlašovací údaje jsou bezpečně uloženy v lokální konfiguraci.
                </p>
              </div>

              <div className="space-y-3 bg-white/[0.03] p-5 rounded-2xl">
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">MagicGate Uživatelské jméno</label>
                  <input
                    type="text"
                    value={formData.magicgate?.username || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        magicgate: { ...formData.magicgate, username: e.target.value },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                    placeholder="Uživatelské jméno pro MagicGate"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">MagicGate Heslo</label>
                  <input
                    type="password"
                    value={formData.magicgate?.password || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        magicgate: { ...formData.magicgate, password: e.target.value },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {/* MagicGate XML Deployment Config */}
              <div className="space-y-3 bg-white/[0.03] p-5 rounded-2xl">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-lg text-amber-400">code_blocks</span>
                    Konfigurační XML soubor instancí (Deploy Config)
                  </h4>
                  <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
                    Vyberte XML soubor s definicí serverů a instancí. IADonkey z něj automaticky vyextrahuje jednotlivé instance
                    jako hlavní položky s akcí MagicGate a jejich dílčí aplikace (Administrace, Web, API, BO) jako podpoložky s faviconou.
                    Servery a instance s označením <span className="font-mono text-amber-300">Bench</span> jsou automaticky vynechány.
                  </p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">Cesta k XML souboru</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formData.magicgate?.xmlPath || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          magicgate: { ...formData.magicgate, xmlPath: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="h-[38px] flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                      placeholder="C:\deploy\DeployConfig.xml"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectXmlFile) {
                          const selected = await window.electronAPI.selectXmlFile(formData.magicgate?.xmlPath);
                          if (selected) {
                            const updated = {
                              ...formData,
                              magicgate: { ...formData.magicgate, xmlPath: selected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base text-amber-400">folder_open</span>
                      <span>Procházet...</span>
                    </button>
                    {formData.magicgate?.xmlPath && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...formData,
                            magicgate: { ...formData.magicgate, xmlPath: '' },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="w-[38px] h-[38px] flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-full transition cursor-pointer shrink-0"
                        title="Vymazat cestu"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-1.5 block">
                    Změna cesty k XML souboru automaticky spustí synchronizaci položek launcheru.
                  </span>
                </div>
              </div>

              {/* Cesta ke zdrojovým kódům instance (CMSinFS) */}
              <div className="space-y-3 bg-white/[0.03] p-5 rounded-2xl">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-lg text-amber-400">folder_zip</span>
                    Cesta ke zdrojovým kódům instance
                  </h4>
                  <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
                    Základní složka na vašem počítači pro stažení zdrojových kódů webu (CMSinFS) z vybrané instance IS Tour pro programátory. Ke zvolené složce se pro každou instanci automaticky vytvoří podsložka s jejím názvem (<code className="font-mono text-amber-300">&#123;složka&#125;\&#123;instance&#125;\</code>). Pokud není složka vybrána, možnost stažení zdrojáků se v akcích instance nenabízí.
                  </p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">Základní složka pro zdrojové kódy (CMSinFS)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formData.magicgate?.instanceSourceCodesPath || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          magicgate: { ...formData.magicgate, instanceSourceCodesPath: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="h-[38px] flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none font-mono"
                      placeholder="např. C:\inetpub\wwwroot\instance-name\FileSystem\CmsContent"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectDirectory) {
                          const selected = await window.electronAPI.selectDirectory(formData.magicgate?.instanceSourceCodesPath);
                          if (selected) {
                            const updated = {
                              ...formData,
                              magicgate: { ...formData.magicgate, instanceSourceCodesPath: selected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base text-amber-400">folder_open</span>
                      <span>Procházet...</span>
                    </button>
                    {formData.magicgate?.instanceSourceCodesPath && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...formData,
                            magicgate: { ...formData.magicgate, instanceSourceCodesPath: '' },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="w-[38px] h-[38px] flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-full transition cursor-pointer shrink-0"
                        title="Vymazat cestu"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-1.5 block">
                    Při spuštění akce na instanci se podsložka dané instance nejprve kompletně vyčistí (aby nezůstaly staré soubory) a poté se do ní rozbalí aktuální zdrojové kódy z instance.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB Taskmanager */}
          {activeTab === 'mlog' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-sky-400">support_agent</span>
                  Propojení s Taskmanagerem
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Nastavte základní webovou adresu (Base URL) vašeho firemního taskmanageru a volitelné prefixy pro úkoly a požadavky. Po nastavení můžete ve vyhledávači
                  zadat kód (např. <strong className="font-mono text-sky-300">{(formData.mlog?.taskPrefix || 'T').toUpperCase()}7821</strong>, <strong className="font-mono text-sky-300">{(formData.mlog?.requestPrefix || 'R').toUpperCase()}2345</strong>) nebo
                  přímo číslo od 3 číslic pro rychlé otevření v prohlížeči.
                </p>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                    Základní webová adresa Taskmanageru (Base URL)
                  </label>
                  <input
                    type="url"
                    value={formData.mlog?.baseUrl || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        mlog: { ...formData.mlog, baseUrl: e.target.value },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-sky-500 outline-none font-mono"
                    placeholder="https://www.company.com/tasks"
                  />
                  <span className="text-xs text-gray-400 mt-1.5 block">
                    Zadejte adresu včetně protokolu (např. https://www.company.com/tasks). Pokud pole necháte prázdné, detekce je vypnutá.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                      Prefix pro Úkol
                    </label>
                    <input
                      type="text"
                      value={formData.mlog?.taskPrefix ?? 'T'}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          mlog: {
                            baseUrl: formData.mlog?.baseUrl || '',
                            requestPrefix: formData.mlog?.requestPrefix ?? 'R',
                            ...formData.mlog,
                            taskPrefix: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-sky-500 outline-none font-mono uppercase"
                      placeholder="T"
                    />
                    <span className="text-xs text-gray-400 mt-1.5 block">
                      Výchozí: <code className="font-mono text-gray-300">T</code> (např. {(formData.mlog?.taskPrefix || 'T').toUpperCase()}7821).
                    </span>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                      Prefix pro Požadavek
                    </label>
                    <input
                      type="text"
                      value={formData.mlog?.requestPrefix ?? 'R'}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          mlog: {
                            baseUrl: formData.mlog?.baseUrl || '',
                            taskPrefix: formData.mlog?.taskPrefix ?? 'T',
                            ...formData.mlog,
                            requestPrefix: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-sky-500 outline-none font-mono uppercase"
                      placeholder="R"
                    />
                    <span className="text-xs text-gray-400 mt-1.5 block">
                      Výchozí: <code className="font-mono text-gray-300">R</code> (např. {(formData.mlog?.requestPrefix || 'R').toUpperCase()}2345).
                    </span>
                  </div>
                </div>

                {formData.mlog?.baseUrl?.trim() ? (
                  <div className="p-4 bg-sky-950/30 rounded-2xl text-[13px] space-y-2">
                    <p className="font-semibold text-sky-300 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Detekce je aktivní pro následující vzory:
                    </p>
                    <ul className="list-disc list-inside text-gray-300 space-y-1 pl-1">
                      <li>
                        Zadání <code className="text-white font-mono bg-black/40 px-2 py-0.5 rounded-full">{(formData.mlog.taskPrefix || 'T').toUpperCase()}7821</code> otevře{' '}
                        <span className="font-mono text-sky-300">
                          {formData.mlog.baseUrl.trim().replace(/\/+$/, '')}/{(formData.mlog.taskPrefix || 'T').toUpperCase()}7821
                        </span>
                      </li>
                      <li>
                        Zadání <code className="text-white font-mono bg-black/40 px-2 py-0.5 rounded-full">{(formData.mlog.requestPrefix || 'R').toUpperCase()}2345</code> otevře{' '}
                        <span className="font-mono text-sky-300">
                          {formData.mlog.baseUrl.trim().replace(/\/+$/, '')}/{(formData.mlog.requestPrefix || 'R').toUpperCase()}2345
                        </span>
                      </li>
                      <li>
                        Zadání samotného čísla od 3 číslic (např. <code className="text-white font-mono bg-black/40 px-2 py-0.5 rounded-full">123</code>) nabídne ve Spotlightu obě varianty ({' '}
                        <span className="font-mono text-sky-300">{(formData.mlog.taskPrefix || 'T').toUpperCase()}123</span> i{' '}
                        <span className="font-mono text-sky-300">{(formData.mlog.requestPrefix || 'R').toUpperCase()}123</span>).
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-white/[0.03] rounded-2xl text-xs text-gray-400">
                    Detekce je v tuto chvíli vypnutá. Pro její aktivaci vyplňte webovou adresu Taskmanageru výše.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: GitHub */}
          {activeTab === 'github' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-emerald-400">
                    folder_code
                  </span>
                  Přihlašovací údaje a přístup k GitHubu
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Zvolte způsob autorizace – Personal Access Token (PAT) nebo přihlášení přes GitHub OAuth 2.0 (Device Flow). Launcher automaticky načte vaše osobní i firemní repozitáře a umožní v nich vyhledávat a klonovat.
                </p>
              </div>

              {/* Segmented Auth Mode Switch */}
              <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] rounded-full w-fit">
                <button
                  type="button"
                  onClick={() => {
                    const updated = {
                      ...formData,
                      github: {
                        ...formData.github,
                        authMode: 'pat' as const,
                        token: formData.github?.token || '',
                      },
                    };
                    setFormData(updated);
                    handleSave(updated);
                    setGitHubTestResult(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                    (formData.github?.authMode || 'pat') === 'pat'
                      ? 'bg-emerald-500/20 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span className={`material-symbols-outlined text-base ${(formData.github?.authMode || 'pat') === 'pat' ? 'text-emerald-400' : ''}`}>key</span>
                  <span>Osobní token (PAT)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = {
                      ...formData,
                      github: {
                        ...formData.github,
                        authMode: 'oauth' as const,
                        token: formData.github?.token || '',
                      },
                    };
                    setFormData(updated);
                    handleSave(updated);
                    setGitHubTestResult(null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                    formData.github?.authMode === 'oauth'
                      ? 'bg-emerald-500/20 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <span className={`material-symbols-outlined text-base ${formData.github?.authMode === 'oauth' ? 'text-emerald-400' : ''}`}>passkey</span>
                  <span>GitHub OAuth 2.0</span>
                </button>
              </div>

              {/* Box 1A: Personal Access Token (PAT) */}
              {(formData.github?.authMode || 'pat') === 'pat' && (
                <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4 animate-fade-in">
                  <div>
                    <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-lg text-emerald-400">
                        key
                      </span>
                      Přihlašovací údaje (PAT)
                    </h4>
                    <p className="text-[13px] text-gray-400 leading-relaxed">
                      Zadejte vaše uživatelské jméno a Personal Access Token pro přístup k vašim repozitářům.
                    </p>
                  </div>

                  {/* Username field */}
                  <div>
                    <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                      Uživatelské jméno (Username) <span className="text-gray-500 font-normal text-xs">(osobní profil)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.github?.username || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          github: {
                            ...formData.github,
                            username: e.target.value,
                            token: formData.github?.token || '',
                            org: formData.github?.org || '',
                            apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                            defaultCloneDir: formData.github?.defaultCloneDir || '',
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. octocat, username"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                      Vaše osobní uživatelské jméno na GitHubu.
                    </p>
                  </div>

                  {/* Token field */}
                  <div>
                    <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                      Personal Access Token (PAT) <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showGitHubToken ? 'text' : 'password'}
                        value={formData.github?.token || ''}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            github: {
                              ...formData.github,
                              username: formData.github?.username || '',
                              token: e.target.value,
                              org: formData.github?.org || '',
                              apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                              defaultCloneDir: formData.github?.defaultCloneDir || '',
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        placeholder="ghp_... nebo github_pat_..."
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGitHubToken(!showGitHubToken)}
                        className="absolute right-3 text-gray-400 hover:text-gray-200 transition cursor-pointer"
                        title={showGitHubToken ? 'Skrýt token' : 'Zobrazit token'}
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showGitHubToken ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                      Token můžete vygenerovat v{' '}
                      <button
                        type="button"
                        onClick={() => window.electronAPI?.openExternal?.('https://github.com/settings/tokens')}
                        className="text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-0.5"
                      >
                        GitHub Settings &rarr; Personal access tokens
                        <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                      </button>
                      . Pro soukromé repozitáře zaškrtněte rozsah <code className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-emerald-300">repo</code> a pro organizace <code className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-emerald-300">read:org</code>.
                    </p>
                  </div>
                </div>
              )}

              {/* Box 1B: GitHub OAuth 2.0 (Device Flow) */}
              {formData.github?.authMode === 'oauth' && (
                <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4 animate-fade-in">
                  <div>
                    <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-lg text-emerald-400">
                        passkey
                      </span>
                      GitHub OAuth 2.0 (Device Flow)
                    </h4>
                    <p className="text-[13px] text-gray-400 leading-relaxed">
                      Přihlášení bez nutnosti ručního generování PAT tokenu. Využívá standardní autorizační tok zařízení RFC 8628.
                    </p>
                  </div>

                  {formData.github?.oauthToken ? (
                    /* Connected state */
                    <div className="p-5 bg-emerald-500/10 rounded-2xl flex items-center justify-between gap-4 animate-fade-in">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {formData.github?.oauthUser?.avatar_url ? (
                          <img
                            src={formData.github.oauthUser.avatar_url}
                            alt={formData.github.oauthUser.login}
                            className="w-11 h-11 rounded-full shrink-0"
                          />
                        ) : (
                          <span className="material-symbols-outlined text-3xl text-emerald-400 shrink-0">verified_user</span>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-emerald-200">
                              Propojeno s GitHubem
                            </span>
                            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full leading-none">
                              Aktivní OAuth
                            </span>
                          </div>
                          <div className="text-xs text-gray-300 flex items-center gap-1.5 flex-wrap">
                            <span>Přihlášený profil:</span>
                            <span className="font-mono text-emerald-300 font-medium">
                              @{formData.github?.oauthUser?.login || formData.github?.username || 'github-user'}
                            </span>
                            {formData.github?.oauthUser?.name && (
                              <span className="text-gray-400">({formData.github.oauthUser.name})</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleDisconnectGitHubOAuth}
                        className="px-4 py-2 text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-full transition cursor-pointer flex items-center gap-1.5 shrink-0"
                        title="Odpojit účet GitHub"
                      >
                        <span className="material-symbols-outlined text-sm text-rose-400">logout</span>
                        <span>Odpojit účet</span>
                      </button>
                    </div>
                  ) : (
                    /* Not connected state - Clean 1-click experience */
                    <div className="space-y-4">
                      {/* Device Flow active card */}
                      {deviceFlowData ? (
                        <div className="p-5 bg-emerald-950/30 rounded-2xl space-y-3.5 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                              Autorizace zařízení na GitHubu
                            </span>
                            <button
                              type="button"
                              onClick={handleCancelGitHubOAuth}
                              className="text-xs text-gray-400 hover:text-white transition cursor-pointer"
                            >
                              Zrušit
                            </button>
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            Váš jednorázový kód byl automaticky zkopírován do schránky. Vložte jej na otevřené stránce GitHubu pro autorizaci:
                          </p>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="px-4 py-2.5 bg-black/60 rounded-2xl font-mono text-2xl font-bold tracking-widest text-emerald-300 select-all">
                              {deviceFlowData.userCode}
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(deviceFlowData.userCode);
                                setUserCodeCopied(true);
                                setTimeout(() => setUserCodeCopied(false), 3000);
                              }}
                              className="px-4 py-2.5 bg-white/10 hover:bg-white/15 rounded-full text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {userCodeCopied ? 'check' : 'content_copy'}
                              </span>
                              {userCodeCopied ? 'Zkopírováno!' : 'Kopírovat kód'}
                            </button>
                            <button
                              type="button"
                              onClick={() => window.electronAPI?.openExternal?.(deviceFlowData.verificationUri)}
                              className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-full text-xs font-semibold text-emerald-300 flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">open_in_new</span>
                              Otevřít ověření v prohlížeči
                            </button>
                          </div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-xs text-emerald-400">info</span>
                            <span>Aplikace automaticky naslouchá potvrzení a ihned po schválení na GitHubu se propojí.</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-5 bg-white/[0.03] rounded-2xl space-y-3">
                          <p className="text-[13px] text-gray-300 leading-relaxed">
                            Kliknutím na tlačítko níže zahájíte přihlášení. V prohlížeči se otevře stránka GitHubu, kde potvrdíte přístup pro aplikaci <strong className="text-white font-semibold">IADonkey</strong>.
                          </p>
                          <div>
                            <button
                              type="button"
                              disabled={isConnectingOAuth}
                              onClick={handleStartGitHubOAuth}
                              className={`px-5 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                isConnectingOAuth
                                  ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                                  : 'bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/40 shadow-sm'
                              }`}
                            >
                              <span className="material-symbols-outlined text-base">login</span>
                              Přihlásit se přes GitHub
                            </button>
                            {deviceFlowError && (
                              <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {deviceFlowError}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Box 2: Organization */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-3">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-lg text-emerald-400">
                      corporate_fare
                    </span>
                    Organizace / Společnost <span className="text-gray-500 font-normal text-xs">(volitelné)</span>
                  </h4>
                  <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
                    Pokud pole necháte prázdné, repozitáře se automaticky načtou ze všech vašich organizací i osobního profilu.
                  </p>
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.github?.org || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        github: {
                          ...formData.github,
                          username: formData.github?.username || '',
                          token: formData.github?.token || '',
                          org: e.target.value,
                          apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                          defaultCloneDir: formData.github?.defaultCloneDir || '',
                        },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    placeholder="např. company-org"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Box 3: Custom API URL */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-3">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-lg text-emerald-400">
                      cloud
                    </span>
                    GitHub API URL <span className="text-gray-500 font-normal text-xs">(volitelné)</span>
                  </h4>
                  <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
                    Výchozí je <code className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300">https://api.github.com</code>. Vyplňte pouze při použití vlastního GitHub Enterprise Serveru.
                  </p>
                </div>
                <div>
                  <input
                    type="text"
                    value={formData.github?.apiUrl || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        github: {
                          ...formData.github,
                          username: formData.github?.username || '',
                          token: formData.github?.token || '',
                          org: formData.github?.org || '',
                          apiUrl: e.target.value,
                          defaultCloneDir: formData.github?.defaultCloneDir || '',
                        },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    placeholder="https://api.github.com"
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                  />
                </div>
              </div>

              {/* Box 4: Default Clone Directory */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-3">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2 mb-1">
                    <span className="material-symbols-outlined text-lg text-emerald-400">
                      folder_open
                    </span>
                    Výchozí složka pro klonování repozitářů <span className="text-gray-500 font-normal text-xs">(volitelné)</span>
                  </h4>
                  <p className="text-[13px] text-gray-400 mb-3 leading-relaxed">
                    Pokud je nastavena, dialog pro stažení repozitáře (akce Klonovat repozitář na <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Shift+Enter</kbd>) ji automaticky předvyplní jako cílové umístění.
                  </p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">Cesta k cílové složce</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formData.github?.defaultCloneDir || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          github: {
                            ...formData.github,
                            username: formData.github?.username || '',
                            token: formData.github?.token || '',
                            org: formData.github?.org || '',
                            apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                            defaultCloneDir: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. C:\Projekty nebo D:\Git"
                      className="h-[38px] flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectDirectory) {
                          const dir = await window.electronAPI.selectDirectory(formData.github?.defaultCloneDir);
                          if (dir) {
                            const updated = {
                              ...formData,
                              github: {
                                ...formData.github,
                                username: formData.github?.username || '',
                                token: formData.github?.token || '',
                                org: formData.github?.org || '',
                                apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                                defaultCloneDir: dir,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base text-emerald-400">folder_open</span>
                      <span>Procházet...</span>
                    </button>
                    {formData.github?.defaultCloneDir && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...formData,
                            github: {
                              ...formData.github,
                              username: formData.github?.username || '',
                              token: formData.github?.token || '',
                              org: formData.github?.org || '',
                              apiUrl: formData.github?.apiUrl || 'https://api.github.com',
                              defaultCloneDir: '',
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="w-[38px] h-[38px] flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-full transition cursor-pointer shrink-0"
                        title="Vymazat cestu"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Test connection button & results (outside/below boxes) */}
              <div className="pt-2 flex flex-col gap-3">
                {/* Result card or placeholder (above test button) */}
                {gitHubTestResult ? (
                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed animate-fade-in ${
                      gitHubTestResult.ok
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {gitHubTestResult.ok ? (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {gitHubTestResult.user?.avatar_url ? (
                            <img
                              src={gitHubTestResult.user.avatar_url}
                              alt={gitHubTestResult.user.login}
                              className="w-10 h-10 rounded-full shrink-0 self-center"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-2xl text-emerald-400 shrink-0 self-center">check_circle</span>
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="font-semibold text-emerald-200 text-[13px]">
                              Připojení k GitHubu bylo úspěšné!
                            </div>
                            <div className="text-gray-300 flex items-center gap-1.5 flex-wrap">
                              <span>Přihlášený profil:</span>
                              <span className="font-mono font-medium text-emerald-300">
                                @{gitHubTestResult.user?.login}
                              </span>
                              {gitHubTestResult.user?.name && (
                                <span className="text-gray-400">({gitHubTestResult.user.name})</span>
                              )}
                              {gitHubTestResult.orgs && gitHubTestResult.orgs.length > 0 && (
                                <div className="inline-flex items-center gap-1 ml-1 flex-wrap">
                                  {gitHubTestResult.orgs.map((org) => (
                                    <span
                                      key={org}
                                      className="bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-mono text-[10px] leading-none"
                                      title={`Organizace: ${org}`}
                                    >
                                      {org}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Celkový počet repozitářů vpravo svisle vycentrovaný */}
                        <div className="shrink-0 flex flex-col items-center justify-center pl-4 border-l border-emerald-500/20 min-w-[75px]">
                          <span className="text-2xl font-bold font-mono text-emerald-200 leading-none">
                            {gitHubTestResult.repoCount ?? 0}
                          </span>
                          <span className="text-[11px] text-emerald-400/80 mt-1 leading-none font-medium">
                            repozitářů
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl text-rose-400 shrink-0 self-center">error</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-rose-200 text-[13px]">Připojení se nezdařilo</div>
                          <div className="text-rose-300/80 mt-0.5">{gitHubTestResult.error}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white/[0.02] p-4 flex items-center justify-between gap-3 text-xs text-gray-400 select-none flex-wrap">
                    <span>
                      {formData.github?.authMode === 'oauth'
                        ? 'Ověřte funkčnost OAuth autorizace a přístup k GitHub API'
                        : 'Ověřte platnost zadaného PAT tokenu a dostupnost GitHub API'}
                    </span>
                    <button
                      type="button"
                      disabled={!activeGitHubToken || isTestingGitHub}
                      onClick={() => handleTestGitHub()}
                      className={`px-5 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shrink-0 ${
                        !activeGitHubToken || isTestingGitHub
                          ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                          : 'bg-emerald-600/30 text-white hover:bg-emerald-600/40'
                      }`}
                    >
                      {isTestingGitHub ? (
                        <>
                          <span className="material-symbols-outlined text-sm animate-spin text-white">progress_activity</span>
                          <span>Testuji připojení...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm text-white">wifi_tethering</span>
                          <span>Otestovat připojení</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {gitHubTestResult && (
                  <button
                    type="button"
                    disabled={!activeGitHubToken || isTestingGitHub}
                    onClick={() => handleTestGitHub()}
                    className={`px-5 py-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer w-fit ${
                      !activeGitHubToken || isTestingGitHub
                        ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600/30 text-white hover:bg-emerald-600/40'
                    }`}
                  >
                    {isTestingGitHub ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin text-white">progress_activity</span>
                        <span>Testuji připojení...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm text-white">wifi_tethering</span>
                        <span>Otestovat připojení znovu</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB: Visual Studio Code */}
          {activeTab === 'vscode' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-cyan-400">code</span>
                  Propojení s editorem kódu
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Konfigurace editoru Visual Studio Code pro rychlé otevírání naklonovaných repozitářů a projektových složek přímo z akcí vyhledávače nebo z modálního okna klonování.
                </p>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                    Cesta ke spustitelnému souboru VS Code (Code.exe / code.cmd)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formData.vscode?.path || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          vscode: { ...formData.vscode, path: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="h-[38px] flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
                      placeholder="Automatická detekce (např. C:\Users\...\Code.exe)"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectVscodePath) {
                          const selected = await window.electronAPI.selectVscodePath(formData.vscode?.path);
                          if (selected) {
                            const updated = {
                              ...formData,
                              vscode: { ...formData.vscode, path: selected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base text-cyan-400">folder_open</span>
                      <span>Procházet...</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.detectVscodePath) {
                          const detected = await window.electronAPI.detectVscodePath();
                          if (detected) {
                            const updated = {
                              ...formData,
                              vscode: { ...formData.vscode, path: detected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="w-[38px] h-[38px] flex items-center justify-center bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white rounded-full transition cursor-pointer shrink-0"
                      title="Automaticky detekovat (prohledat standardní instalační složky a PATH)"
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">auto_awesome</span>
                    </button>
                    {formData.vscode?.path && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...formData,
                            vscode: { ...formData.vscode, path: '' },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="w-[38px] h-[38px] flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-full transition cursor-pointer shrink-0"
                        title="Vymazat cestu (použije se automatická detekce)"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2 block leading-relaxed">
                    Pokud necháte pole prázdné, aplikace zkusí VS Code automaticky nalézt ve standardních složkách uživatele nebo v systémovém příkazu <code className="bg-white/10 px-2 py-0.5 rounded-full text-cyan-300 font-mono">code</code>.
                  </span>
                </div>

                <div className="p-4 bg-cyan-950/30 rounded-2xl text-xs text-cyan-200/90 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-base text-cyan-400 shrink-0 mt-0.5">info</span>
                  <div className="space-y-1">
                    <div className="font-semibold text-white">Jak to funguje ve vyhledávači:</div>
                    <p className="text-gray-300 leading-relaxed">
                      Když u repozitáře ve Spotlight vyhledávači stisknete <kbd className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-mono text-white">Shift+Enter</kbd> a repozitář již existuje ve vaší cílové složce, zobrazí se na prvním místě akce <strong>Otevřít ve VS Code</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Android Studio */}
          {activeTab === 'android-studio' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-pink-400">android</span>
                  Propojení s vývojovým prostředím
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Konfigurace vývojového prostředí Android Studio pro rychlé otevírání mobilních a Kotlin/Java projektů přímo z akcí vyhledávače nebo z modálního okna klonování.
                </p>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-300 mb-1.5">
                    Cesta ke spustitelnému souboru Android Studio (studio64.exe / studio.bat)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={formData.androidStudio?.path || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          androidStudio: { ...formData.androidStudio, path: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="h-[38px] flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-pink-500 outline-none font-mono"
                      placeholder="Automatická detekce (např. C:\Program Files\Android\Android Studio\bin\studio64.exe)"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.selectAndroidStudioPath) {
                          const selected = await window.electronAPI.selectAndroidStudioPath(formData.androidStudio?.path);
                          if (selected) {
                            const updated = {
                              ...formData,
                              androidStudio: { ...formData.androidStudio, path: selected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base text-pink-400">folder_open</span>
                      <span>Procházet...</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.electronAPI?.detectAndroidStudioPath) {
                          const detected = await window.electronAPI.detectAndroidStudioPath();
                          if (detected) {
                            const updated = {
                              ...formData,
                              androidStudio: { ...formData.androidStudio, path: detected },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }
                        }
                      }}
                      className="w-[38px] h-[38px] flex items-center justify-center bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white rounded-full transition cursor-pointer shrink-0"
                      title="Automaticky detekovat (prohledat standardní instalační složky Android Studia a JetBrains Toolbox)"
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">auto_awesome</span>
                    </button>
                    {formData.androidStudio?.path && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...formData,
                            androidStudio: { ...formData.androidStudio, path: '' },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="w-[38px] h-[38px] flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 rounded-full transition cursor-pointer shrink-0"
                        title="Vymazat cestu (použije se automatická detekce)"
                      >
                        <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 mt-2 block leading-relaxed">
                    Pokud necháte pole prázdné, aplikace zkusí Android Studio automaticky nalézt ve složce <code className="bg-white/10 px-2 py-0.5 rounded-full text-pink-300 font-mono">Program Files\Android\Android Studio</code>, v JetBrains Toolboxu nebo v systémovém příkazu <code className="bg-white/10 px-2 py-0.5 rounded-full text-pink-300 font-mono">studio64.exe</code>.
                  </span>
                </div>

                <div className="p-4 bg-pink-950/30 rounded-2xl text-xs text-pink-200/90 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-base text-pink-400 shrink-0 mt-0.5">info</span>
                  <div className="space-y-1">
                    <div className="font-semibold text-white">Kdy se Android Studio nabízí:</div>
                    <p className="text-gray-300 leading-relaxed">
                      Aplikace se nabízí, pokud repozitář z GitHubu používá <strong>Kotlin</strong> nebo <strong>Java</strong>. Pro webové projekty a instance MagicGate se vždy nabízí VS Code (nabízí se buď VS Code, nebo Android Studio, nikdy obojí současně).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MagicPlan */}
          {activeTab === 'magicplan' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-cyan-400">calendar_month</span>
                  Interní plán práce (MagicPlan)
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Pravidelné sledování vašeho sloupce a fronty nezařazených úkolů z interního HTML plánu. Změny jsou automaticky hlídány a oznamovány Windows toast notifikacemi.
                </p>
              </div>

              {/* Configuration card */}
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Seznam URL adres plánů */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-gray-300 block">URL adresy plánů (interní síť / intranet)</label>

                    {(() => {
                      const urlList = (formData.magicplan?.urls && formData.magicplan.urls.length > 0)
                        ? formData.magicplan.urls
                        : [formData.magicplan?.url ?? ''];

                      return (
                        <div className="space-y-2">
                          {urlList.map((uStr, uIdx) => (
                            <div key={uIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={uStr}
                                onChange={(e) => {
                                  const newUrls = [...urlList];
                                  newUrls[uIdx] = e.target.value;
                                  const updated = {
                                    ...formData,
                                    magicplan: {
                                      ...formData.magicplan,
                                      urls: newUrls,
                                      url: newUrls[0] || '',
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                }}
                                placeholder="https://intranet.company.local/plan/"
                                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
                              />
                              {urlList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newUrls = urlList.filter((_, i) => i !== uIdx);
                                    const updated = {
                                      ...formData,
                                      magicplan: {
                                        ...formData.magicplan,
                                        urls: newUrls,
                                        url: newUrls[0] || '',
                                      },
                                    };
                                    setFormData(updated);
                                    handleSave(updated);
                                  }}
                                  className="w-[38px] h-[38px] rounded-full bg-white/[0.03] hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition flex items-center justify-center cursor-pointer shrink-0"
                                  title="Odebrat tento plán"
                                >
                                  <span className="material-symbols-outlined text-base leading-none select-none">delete</span>
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const currentUrls = formData.magicplan?.urls && formData.magicplan.urls.length > 0
                                ? [...formData.magicplan.urls, '']
                                : [formData.magicplan?.url || '', ''];
                              const updated = {
                                ...formData,
                                magicplan: {
                                  ...formData.magicplan,
                                  urls: currentUrls,
                                  url: currentUrls[0] || '',
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer w-fit"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            <span>Přidat plán</span>
                          </button>
                        </div>
                      );
                    })()}
                    <span className="text-[11px] text-gray-400 block">
                      Dotaz se provádí na všechny zadané URL s výchozími přihlašovacími údaji Windows (NTLM Integrated Authentication).
                    </span>
                  </div>

                  {/* URL adresa worklogu (MLog Logs.aspx) */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-gray-300 block">URL adresa denního worklogu (MLog Logs.aspx)</label>
                    <input
                      type="text"
                      value={formData.magicplan?.worklogUrl ?? 'http://mlog/Logs.aspx'}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          magicplan: {
                            ...formData.magicplan,
                            worklogUrl: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="http://mlog/Logs.aspx"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-cyan-500 outline-none font-mono"
                    />
                    <span className="text-[11px] text-gray-400 block">
                      Dotaz se provádí automaticky pro dny od pondělí do dnešního dne (s parametrem <code className="text-cyan-300">?Date=DD.MM.YYYY</code>) pro načtení a sumarizaci reálně odpracovaných hodin, zaokrouhlení na celých 0,5h a doplnění úkolů mimo plán.
                    </span>
                  </div>

                  {/* Nastavení lidí (uživatelů) - vlastní celý řádek */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-gray-300 block">Sledované osoby (sloupce)</label>

                    {(() => {
                      const userList = (formData.magicplan?.userColumns && formData.magicplan.userColumns.length > 0)
                        ? formData.magicplan.userColumns
                        : [formData.magicplan?.userColumn ?? ''];

                      const moveUser = (fromIndex: number, toIndex: number) => {
                        if (toIndex < 0 || toIndex >= userList.length) return;
                        const newUsers = [...userList];
                        const [moved] = newUsers.splice(fromIndex, 1);
                        newUsers.splice(toIndex, 0, moved);
                        const updated = {
                          ...formData,
                          magicplan: {
                            ...formData.magicplan,
                            userColumns: newUsers,
                            userColumn: newUsers[0] || '',
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      };

                      return (
                        <div className="space-y-2">
                          {userList.map((uVal, uIdx) => {
                            const uStr = uVal !== undefined && uVal !== null ? String(uVal).trim() : '';
                            const curUserStr = formData.magicplan?.currentUserColumn !== undefined && formData.magicplan?.currentUserColumn !== null
                              ? String(formData.magicplan.currentUserColumn).trim()
                              : '';
                            const isCurrentUser = Boolean(uStr && curUserStr && curUserStr.toLowerCase() === uStr.toLowerCase());

                            const availableForSelect = allAvailablePersons.filter(
                              (p) => String(p.id) === uStr || !userList.map((x) => String(x).trim()).includes(String(p.id))
                            );
                            const hasCurrentOption = !uStr || availableForSelect.some((p) => String(p.id) === uStr);

                            return (
                              <div key={uIdx} className="flex items-center gap-2">
                                <select
                                  value={uStr}
                                  onChange={(e) => {
                                    const newUsers = [...userList];
                                    const oldVal = newUsers[uIdx];
                                    const selectedId = e.target.value;
                                    newUsers[uIdx] = selectedId;
                                    const isCur = String(formData.magicplan?.currentUserColumn || '').trim() === String(oldVal || '').trim();
                                    const updated = {
                                      ...formData,
                                      magicplan: {
                                        ...formData.magicplan,
                                        userColumns: newUsers,
                                        userColumn: newUsers[0] || '',
                                        currentUserColumn: isCur ? selectedId : formData.magicplan?.currentUserColumn,
                                      },
                                    };
                                    setFormData(updated);
                                    handleSave(updated);
                                  }}
                                  className="flex-1 h-[38px] bg-black/30 border border-white/10 rounded-xl px-3.5 text-sm text-white focus:border-cyan-500 outline-none cursor-pointer"
                                >
                                  <option value="" disabled className="bg-[#181920] text-gray-400">
                                    -- Vyberte osobu z plánu --
                                  </option>
                                  {!hasCurrentOption && uStr && (
                                    <option value={uStr} className="bg-[#181920] text-white">
                                      {uStr}
                                    </option>
                                  )}
                                  {availableForSelect.map((p) => (
                                    <option key={p.id} value={p.id} className="bg-[#181920] text-white">
                                      {p.name && p.name !== p.id ? `${p.name} (${p.id})` : `Osoba ${p.id}`}
                                    </option>
                                  ))}
                                </select>

                                {/* Reordering buttons */}
                                {userList.length > 1 && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={uIdx === 0}
                                      onClick={() => moveUser(uIdx, uIdx - 1)}
                                      className="w-[38px] h-[38px] rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-gray-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition flex items-center justify-center cursor-pointer shrink-0"
                                      title="Posunout osobu nahoru"
                                    >
                                      <span className="material-symbols-outlined text-base leading-none select-none">arrow_upward</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={uIdx === userList.length - 1}
                                      onClick={() => moveUser(uIdx, uIdx + 1)}
                                      className="w-[38px] h-[38px] rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-gray-400 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition flex items-center justify-center cursor-pointer shrink-0"
                                      title="Posunout osobu dolů"
                                    >
                                      <span className="material-symbols-outlined text-base leading-none select-none">arrow_downward</span>
                                    </button>
                                  </div>
                                )}

                                {/* "Já" toggle switch (stable size and wording in both states) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!uStr) return;
                                    const newCurrentUser = isCurrentUser ? undefined : uStr;
                                    const updated = {
                                      ...formData,
                                      magicplan: {
                                        ...formData.magicplan,
                                        currentUserColumn: newCurrentUser,
                                      },
                                    };
                                    setFormData(updated);
                                    handleSave(updated);
                                  }}
                                  className={`h-[36px] my-auto px-3.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer select-none shrink-0 ${
                                    isCurrentUser
                                      ? 'bg-cyan-500 text-white shadow-sm'
                                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-gray-200'
                                  }`}
                                  title={isCurrentUser ? 'Vy jste tato osoba (kliknutím zrušíte)' : 'Označit tuto osobu jako sebe'}
                                >
                                  <span className="material-symbols-outlined text-sm leading-none select-none">
                                    {isCurrentUser ? 'person_check' : 'person'}
                                  </span>
                                  <span>Já</span>
                                </button>

                                {userList.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const deletedVal = String(userList[uIdx] || '').trim();
                                      const newUsers = userList.filter((_, i) => i !== uIdx);
                                      const updated = {
                                        ...formData,
                                        magicplan: {
                                          ...formData.magicplan,
                                          userColumns: newUsers,
                                          userColumn: newUsers[0] || '',
                                          currentUserColumn:
                                            String(formData.magicplan?.currentUserColumn || '').trim() === deletedVal
                                              ? undefined
                                              : formData.magicplan?.currentUserColumn,
                                        },
                                      };
                                      setFormData(updated);
                                      handleSave(updated);
                                    }}
                                    className="w-[38px] h-[38px] rounded-full bg-white/[0.03] hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition flex items-center justify-center cursor-pointer shrink-0"
                                    title="Odebrat tuto osobu"
                                  >
                                    <span className="material-symbols-outlined text-base leading-none select-none">delete</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              const currentUsers = formData.magicplan?.userColumns && formData.magicplan.userColumns.length > 0
                                ? [...formData.magicplan.userColumns, '']
                                : [formData.magicplan?.userColumn || '', ''];
                              const updated = {
                                ...formData,
                                magicplan: {
                                  ...formData.magicplan,
                                  userColumns: currentUsers,
                                  userColumn: currentUsers[0] || '',
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="px-3 py-1.5 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer w-fit"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            <span>Přidat osobu</span>
                          </button>
                        </div>
                      );
                    })()}
                    <span className="text-[11px] text-gray-400 block">
                      Sledované osoby v plánu práce identifikované pomocí ID. Vlastní sloupec označte tlačítkem „Já“.
                    </span>
                  </div>

                  {/* Sloupec nezařazených úkolů (Fronta) - vlastní celý řádek */}
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-gray-300 block">Sloupec nezařazených úkolů (Fronta)</label>
                    <select
                      value={formData.magicplan?.unassignedColumn ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          magicplan: {
                            ...formData.magicplan,
                            unassignedColumn: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="w-full h-[38px] bg-black/30 border border-white/10 rounded-xl px-3.5 text-sm text-white focus:border-cyan-500 outline-none cursor-pointer"
                    >
                      <option value="" className="bg-[#181920] text-gray-400">
                        -- Žádný (fronta vypnuta) --
                      </option>
                      {Boolean(
                        formData.magicplan?.unassignedColumn &&
                        !allAvailablePersons.some((p) => String(p.id) === String(formData.magicplan?.unassignedColumn))
                      ) && (
                        <option value={formData.magicplan?.unassignedColumn} className="bg-[#181920] text-white">
                          Sloupec {formData.magicplan?.unassignedColumn}
                        </option>
                      )}
                      {allAvailablePersons.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#181920] text-white">
                          {p.name && p.name !== p.id ? `${p.name} (${p.id})` : `Sloupec ${p.id}`}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-gray-400 block">
                      Zásobník volných nezařazených úkolů z plánu práce. Nezařazená fronta je fiktivní uživatel identifikovaný svým ID.
                    </span>
                  </div>

                  {/* Interval dotazování */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-gray-300">Interval kontroly změn na pozadí</label>
                    <select
                      value={formData.magicplan?.pollIntervalMinutes ?? 2}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          magicplan: {
                            ...formData.magicplan,
                            pollIntervalMinutes: parseInt(e.target.value, 10),
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-cyan-500 outline-none cursor-pointer"
                    >
                      <option value={1} className="bg-[#181920] text-white">Každou 1 minutu</option>
                      <option value={2} className="bg-[#181920] text-white">Každé 2 minuty (doporučeno)</option>
                      <option value={5} className="bg-[#181920] text-white">Každých 5 minut</option>
                      <option value={10} className="bg-[#181920] text-white">Každých 10 minut</option>
                    </select>
                  </div>

                  {/* Kompaktní zobrazení denního plánu */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] md:col-span-2">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-white block">
                        Kompaktní zobrazení denního plánu
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Zmenší výšku karet úkolů v denním rozvrhu pro přehlednější a úspornější zobrazení
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.magicplan?.compactDayView === true}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            magicplan: {
                              ...formData.magicplan,
                              compactDayView: e.target.checked,
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                    </label>
                  </div>

                  {/* Progress bar odpracovaného času (worklog) */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] md:col-span-2">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-white block">
                        Indikátor odpracovaného času (worklog bar)
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Zobrazí tenký progress bar odpracovaného času pod úkoly uživatelů v denním i týdenním rozvrhu
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.magicplan?.showWorklogProgressBar !== false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            magicplan: {
                              ...formData.magicplan,
                              showWorklogProgressBar: e.target.checked,
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                    </label>
                  </div>

                  {/* Trvalé zobrazení všech úkolů (zobrazí se pouze pokud je moje osoba mezi sledovanými osobami) */}
                  {(() => {
                    const userList = (formData.magicplan?.userColumns && formData.magicplan.userColumns.length > 0)
                      ? formData.magicplan.userColumns
                      : (formData.magicplan?.userColumn ? [formData.magicplan.userColumn] : []);
                    const currentUserCol = formData.magicplan?.currentUserColumn ? String(formData.magicplan.currentUserColumn).trim().toLowerCase() : '';
                    const isCurrentUserPresent = Boolean(
                      currentUserCol && userList.some((u: string) => u && String(u).trim().toLowerCase() === currentUserCol)
                    );

                    if (!isCurrentUserPresent) return null;

                    return (
                      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] md:col-span-2">
                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold text-white block">
                            Zobrazit úkoly všech osob
                          </span>
                          <span className="text-[11px] text-gray-400">
                            Při otevření MagicPlanu se výchozivě zobrazí úkoly všech sledovaných osob namísto pouze vašich
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.magicplan?.showAllTasks === true}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: {
                                  ...formData.magicplan,
                                  showAllTasks: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                        </label>
                      </div>
                    );
                  })()}

                  {/* Propojení s rozšířením TaskManager (MLog) */}
                  <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] md:col-span-2">
                    <div>
                      <span className="text-xs font-semibold text-white block">Propojit s rozšířením TaskManager (MLog)</span>
                      <span className="text-[11px] text-gray-400">
                        Odkazy na R (požadavky) a T (úkoly) se budou generovat podle nastavené URL adresy v TaskManageru
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.magicplan?.linkWithTaskManager !== false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            magicplan: {
                              ...formData.magicplan,
                              linkWithTaskManager: e.target.checked,
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                    </label>
                  </div>

                  {/* Chování časového realtime posuvníku v časové ose */}
                  <div className="p-4 rounded-2xl bg-white/[0.02] space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <span className="text-xs font-semibold text-white block">
                          Chování časového realtime posuvníku
                        </span>
                        <span className="text-[11px] text-gray-400">
                          Určuje, v jakém časovém rozmezí se posuvník a vodicí linka pohybují po časové ose
                        </span>
                      </div>

                      {/* Mode Switcher: Reálná 8h vs Vlastní */}
                      <div className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-full w-fit shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...formData,
                              magicplan: {
                                ...formData.magicplan,
                                timelineTimeMode: 'real8h' as const,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            (formData.magicplan?.timelineTimeMode || 'real8h') === 'real8h'
                              ? 'bg-cyan-500/20 text-white font-semibold shadow-sm'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-sm ${(formData.magicplan?.timelineTimeMode || 'real8h') === 'real8h' ? 'text-cyan-400' : 'text-gray-400'}`}>
                            schedule
                          </span>
                          <span className={(formData.magicplan?.timelineTimeMode || 'real8h') === 'real8h' ? 'text-white' : ''}>
                            Reálná 8h (09:00 – 17:00)
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...formData,
                              magicplan: {
                                ...formData.magicplan,
                                timelineTimeMode: 'custom' as const,
                                timelineCustomStart: formData.magicplan?.timelineCustomStart || '09:00',
                                timelineCustomEnd: formData.magicplan?.timelineCustomEnd || '17:00',
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            formData.magicplan?.timelineTimeMode === 'custom'
                              ? 'bg-cyan-500/20 text-white font-semibold shadow-sm'
                              : 'text-gray-400 hover:text-gray-200'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-sm ${formData.magicplan?.timelineTimeMode === 'custom' ? 'text-cyan-400' : 'text-gray-400'}`}>
                            tune
                          </span>
                          <span className={formData.magicplan?.timelineTimeMode === 'custom' ? 'text-white' : ''}>
                            Vlastní rozsah
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Custom range inputs when 'custom' is selected */}
                    {formData.magicplan?.timelineTimeMode === 'custom' && (
                      <div className="pt-2 flex items-center gap-4 flex-wrap animate-fade-in border-t border-white/[0.04]">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400">Čas od:</label>
                          <input
                            type="time"
                            value={formData.magicplan?.timelineCustomStart || '09:00'}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: {
                                  ...formData.magicplan,
                                  timelineCustomStart: e.target.value,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500 transition font-mono [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400">Čas do:</label>
                          <input
                            type="time"
                            value={formData.magicplan?.timelineCustomEnd || '17:00'}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: {
                                  ...formData.magicplan,
                                  timelineCustomEnd: e.target.value,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500 transition font-mono [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Test button and feedback */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestMagicPlan}
                    disabled={isTestingMagicPlan}
                    className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-base ${isTestingMagicPlan ? 'animate-spin' : ''} text-cyan-400`}>
                      {isTestingMagicPlan ? 'sync' : 'network_check'}
                    </span>
                    <span>{isTestingMagicPlan ? 'Ověřuji připojení k plánu...' : 'Otestovat připojení k plánu'}</span>
                  </button>

                  {magicPlanTestResult && (
                    <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 animate-fade-in ${magicPlanTestResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                      <span className="material-symbols-outlined text-sm shrink-0">
                        {magicPlanTestResult.ok ? 'check_circle' : 'error'}
                      </span>
                      <span>{magicPlanTestResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: DonkeyTools */}
          {activeTab === 'donkey-tools' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-rose-400">construction</span>
                  Systémové nástroje a utility
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Konfigurace vestavěných produktivních nástrojů pro práci s barvami, měřením a systémovými akcemi. Všechny nástroje lze rychle vyvolat ve vyhledávači pomocí prefixu <code className="bg-white/10 px-1.5 py-0.5 rounded text-rose-300 font-mono">/</code> (např. <code className="bg-white/10 px-1 rounded font-mono">/kapatko</code>).
                </p>
              </div>

              {/* DonkeyTools Sub-extensions Switch */}
              <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] rounded-full w-fit flex-wrap">
                {[
                  { id: 'colorMaster', name: 'ColorMaster', icon: 'colorize' },
                  { id: 'quickCap', name: 'QuickCap', icon: 'crop' },
                  { id: 'screenRuler', name: 'ScreenRuler', icon: 'straighten' },
                  { id: 'easyClip', name: 'EasyClip', icon: 'content_paste' },
                ].map((tool) => {
                  const isActive = activeDonkeyTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setActiveDonkeyTool(tool.id as any)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                        isActive
                          ? 'bg-rose-500/20 text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-base ${isActive ? 'text-rose-400' : ''}`}>
                        {tool.icon}
                      </span>
                      <span>{tool.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* SECTION 1: ColorMaster */}
              {activeDonkeyTool === 'colorMaster' && (
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors animate-fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-400">
                      <span className="material-symbols-outlined text-2xl">colorize</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white tracking-wide">ColorMaster</h4>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Nástroj na barvy
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Sada nástrojů pro práci s barvami: <strong>Eyedropper</strong> (systémové kapátko s lupou pod kurzorem pro přesné nabrání barvy) a <strong>PaletteMaster</strong> (tvorba a správa 5místných barevných palet s plovoucí lištou a detailem). Podporuje rozpoznávání barev (#HEX, RGB, HSL) ve Spotlightu.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.donkeyTools?.colorMaster?.enabled ?? false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            donkeyTools: {
                              ...formData.donkeyTools,
                              colorMaster: {
                                ...formData.donkeyTools?.colorMaster,
                                enabled: e.target.checked,
                                hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
                                paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
                                defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
                              },
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600" />
                    </label>
                  </div>
                </div>

                {/* Sub-settings when ColorMaster is enabled */}
                {(formData.donkeyTools?.colorMaster?.enabled ?? false) && (
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    {/* Hotkey configuration & Eyedropper test */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Globální klávesová zkratka pro Eyedropper kapátko (volitelné)
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={
                                isRecordingColorMasterHotkey
                                  ? (colorMasterRecordedModifiers.length > 0
                                      ? colorMasterRecordedModifiers.join(' + ')
                                      : 'Stiskněte klávesy...')
                                  : formData.donkeyTools?.colorMaster?.hotkey || ''
                              }
                              onFocus={handleColorMasterHotkeyFocus}
                              onBlur={handleColorMasterHotkeyBlur}
                              data-hotkey-field="colorMaster"
                              onKeyDown={handleColorMasterHotkeyKeyDown}
                              onKeyUp={handleColorMasterHotkeyKeyUp}
                              className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                                colorMasterHotkeyError
                                  ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                                  : isRecordingColorMasterHotkey
                                  ? 'm3-selected-card text-white ring-2 ring-white/50'
                                  : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                              }`}
                              placeholder="Klikněte"
                            />
                            {formData.donkeyTools?.colorMaster?.hotkey && !isRecordingColorMasterHotkey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = {
                                    ...formData,
                                    donkeyTools: {
                                      ...formData.donkeyTools,
                                      colorMaster: {
                                        ...formData.donkeyTools?.colorMaster,
                                        enabled: formData.donkeyTools?.colorMaster?.enabled ?? true,
                                        hotkey: '',
                                        paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
                                        defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
                                      },
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                  setColorMasterHotkeyError(null);
                                }}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                                title="Odstranit zkratku"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const picked = await pickScreenColor();
                                if (picked) {
                                  const parsed = parseColorQuery(picked);
                                  const fmt = formData.donkeyTools?.colorMaster?.defaultFormat || 'hex';
                                  const formatted = parsed ? formatColorValue(parsed, fmt) : picked;
                                  if (window.electronAPI) {
                                    await window.electronAPI.executeAction({
                                      action: 'copy',
                                      location: formatted,
                                    });
                                  } else {
                                    await navigator.clipboard.writeText(formatted);
                                  }
                                }
                              } catch (err) {
                                console.error('Test eyedropper error:', err);
                              }
                            }}
                            className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                            title="Otevře systémové kapátko s lupou pro vyzkoušení"
                          >
                            <span className="material-symbols-outlined text-base text-rose-400">colorize</span>
                            <span>Vyzkoušet kapátko</span>
                          </button>
                        </div>

                        {colorMasterHotkeyError && (
                          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold animate-fade-in">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <span>{colorMasterHotkeyError}</span>
                          </div>
                        )}

                        <span className="text-[12px] text-gray-400">
                          {isRecordingColorMasterHotkey ? (
                            <span className="text-rose-400 font-medium animate-pulse">
                              Stiskněte klávesovou kombinaci (např. Shift+Alt+C). Esc zruší, Backspace zkratku odstraní.
                            </span>
                          ) : (
                            <span>Klikněte do pole a stiskněte kombinaci kláves (např. Shift+Alt+C). Zkratka nesmí kolidovat se zkratkou launcheru ani s rezervovanými klávesami. Backspace zkratku vymaže.</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Default format selector */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="block text-xs font-semibold text-gray-300">
                        Výchozí formát pro zkopírování do schránky
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { id: 'hex', label: 'HEX', example: '#2563EB' },
                          { id: 'hex8', label: 'HEX8', example: '#2563EBFF' },
                          { id: 'hex-no-hash', label: 'HEX bez #', example: '2563EB' },
                          { id: 'rgb', label: 'RGB', example: 'rgb(37, 99, 235)' },
                          { id: 'rgba', label: 'RGBA', example: 'rgba(37, 99, 235, 1)' },
                          { id: 'hsl', label: 'HSL', example: 'hsl(221, 83%, 53%)' },
                        ].map((fmt) => {
                          const isSelected = (formData.donkeyTools?.colorMaster?.defaultFormat || 'hex') === fmt.id;
                          return (
                            <button
                              key={fmt.id}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...formData,
                                  donkeyTools: {
                                    ...formData.donkeyTools,
                                    colorMaster: {
                                      ...formData.donkeyTools?.colorMaster,
                                      enabled: formData.donkeyTools?.colorMaster?.enabled ?? true,
                                      hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
                                      paletteHotkey: formData.donkeyTools?.colorMaster?.paletteHotkey || '',
                                      defaultFormat: fmt.id as any,
                                    },
                                  },
                                };
                                setFormData(updated);
                                handleSave(updated);
                              }}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-black/30 text-gray-400 hover:bg-white/10 hover:text-white'
                              }`}
                              title={`Příklad formátu: ${fmt.example}`}
                            >
                              <span>{fmt.label}</span>
                              <span className="font-mono text-[10px] opacity-60">({fmt.example})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Hotkey configuration for PaletteMaster */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="block text-xs font-semibold text-gray-300">
                        Globální klávesová zkratka pro PaletteMaster – Správce palet (volitelné)
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={
                                isRecordingPaletteHotkey
                                  ? (paletteRecordedModifiers.length > 0
                                      ? paletteRecordedModifiers.join(' + ')
                                      : 'Stiskněte klávesy...')
                                  : formData.donkeyTools?.colorMaster?.paletteHotkey || ''
                              }
                              onFocus={handlePaletteHotkeyFocus}
                              onBlur={handlePaletteHotkeyBlur}
                              data-hotkey-field="palette"
                              onKeyDown={handlePaletteHotkeyKeyDown}
                              onKeyUp={handlePaletteHotkeyKeyUp}
                              className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                                paletteHotkeyError
                                  ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                                  : isRecordingPaletteHotkey
                                  ? 'm3-selected-card text-white ring-2 ring-white/50'
                                  : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                              }`}
                              placeholder="Klikněte"
                            />
                            {formData.donkeyTools?.colorMaster?.paletteHotkey && !isRecordingPaletteHotkey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = {
                                    ...formData,
                                    donkeyTools: {
                                      ...formData.donkeyTools,
                                      colorMaster: {
                                        ...formData.donkeyTools?.colorMaster,
                                        enabled: formData.donkeyTools?.colorMaster?.enabled ?? true,
                                        hotkey: formData.donkeyTools?.colorMaster?.hotkey || '',
                                        paletteHotkey: '',
                                        defaultFormat: formData.donkeyTools?.colorMaster?.defaultFormat || 'hex',
                                      },
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                  setPaletteHotkeyError(null);
                                }}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                                title="Odstranit zkratku"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {paletteHotkeyError && (
                          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold animate-fade-in">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <span>{paletteHotkeyError}</span>
                          </div>
                        )}

                        <span className="text-[12px] text-gray-400">
                          {isRecordingPaletteHotkey ? (
                            <span className="text-rose-400 font-medium animate-pulse">
                              Stiskněte klávesovou kombinaci (např. Shift+Alt+P). Esc zruší, Backspace zkratku odstraní.
                            </span>
                          ) : (
                            <span>Klikněte do pole a stiskněte kombinaci kláves (např. Shift+Alt+P). Zkratka nesmí kolidovat s ostatními zkratkami. Backspace zkratku vymaže.</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Usage examples banner */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-1 text-[11px] text-gray-400">
                      <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">info</span>
                        Jak ColorMaster používat ve vyhledávači
                      </span>
                      <ul className="list-disc list-inside space-y-1 text-gray-400 pl-1">
                        <li><strong>Eyedropper (kapátko):</strong> Zadejte <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/kapatko</code>, <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/eyedropper</code>, použijte nastavenou klávesovou zkratku nebo klikněte na ikonku kapátka v nabídce DonkeyTools.</li>
                        <li><strong>PaletteMaster (palety):</strong> Zadejte <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/palette</code> pro otevření správce barevných palet, použijte nastavenou klávesovou zkratku nebo klikněte na položku v tray menu.</li>
                        <li><strong>Rozpoznávání barev:</strong> Zadejte kód barvy (např. <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">#ff8800</code>, <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">rgb(255, 128, 0)</code> nebo <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">hsl(32, 100%, 50%)</code>) – vyhledávač okamžitě zobrazí vzorník a převody formátů.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* SUB-EXTENSION 2: QuickCap */}
              {activeDonkeyTool === 'quickCap' && (
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors animate-fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-400">
                      <span className="material-symbols-outlined text-2xl">crop</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white tracking-wide">QuickCap</h4>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Výstřižky obrazovky
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Rychlé pořízení výstřižku libovolné oblasti obrazovky. Snímek se automaticky uloží do vybrané složky a současně vloží do systémové schránky pro okamžité vložení (Ctrl+V).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={(formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false)}
                        onChange={(e) => {
                          const isEnabled = e.target.checked;
                          const currentSub = formData.donkeyTools?.quickCap || formData.donkeyTools?.fastSnap;
                          const updated = {
                            ...formData,
                            donkeyTools: {
                              ...formData.donkeyTools,
                              quickCap: {
                                enabled: isEnabled,
                                hotkey: currentSub?.hotkey || '',
                                saveDirectory: currentSub?.saveDirectory,
                              },
                              fastSnap: {
                                enabled: isEnabled,
                                hotkey: currentSub?.hotkey || '',
                                saveDirectory: currentSub?.saveDirectory,
                              },
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600" />
                    </label>
                  </div>
                </div>

                {/* Sub-settings when QuickCap is enabled */}
                {(formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? false) && (
                  <div className="pt-4 border-t border-white/5 space-y-5">
                    {/* Hotkey configuration & Snipper test */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Globální klávesová zkratka pro pořízení výstřižku (volitelné)
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={
                                isRecordingQuickCapHotkey
                                  ? (quickCapRecordedModifiers.length > 0
                                      ? quickCapRecordedModifiers.join(' + ')
                                      : 'Stiskněte klávesy...')
                                  : (formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey || '')
                              }
                              onFocus={handleQuickCapHotkeyFocus}
                              onBlur={handleQuickCapHotkeyBlur}
                              data-hotkey-field="quickCap"
                              onKeyDown={handleQuickCapHotkeyKeyDown}
                              onKeyUp={handleQuickCapHotkeyKeyUp}
                              className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                                quickCapHotkeyError
                                  ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                                  : isRecordingQuickCapHotkey
                                  ? 'm3-selected-card text-white ring-2 ring-white/50'
                                  : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                              }`}
                              placeholder="Klikněte"
                            />
                            {(formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey) && !isRecordingQuickCapHotkey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = {
                                    ...formData,
                                    donkeyTools: {
                                      ...formData.donkeyTools,
                                      quickCap: {
                                        enabled: formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? true,
                                        hotkey: '',
                                        saveDirectory: formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory,
                                      },
                                      fastSnap: {
                                        enabled: formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled ?? true,
                                        hotkey: '',
                                        saveDirectory: formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory,
                                      },
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                  setQuickCapHotkeyError(null);
                                }}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                                title="Odstranit zkratku"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              (window.electronAPI?.startQuickCap || window.electronAPI?.startFastSnap)?.();
                            }}
                            className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                            title="Spustí výběr výstřižku z obrazovky"
                          >
                            <span className="material-symbols-outlined text-base text-rose-400">crop</span>
                            <span>Vyzkoušet výstřižek</span>
                          </button>
                        </div>

                        {quickCapHotkeyError && (
                          <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold animate-fade-in">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <span>{quickCapHotkeyError}</span>
                          </div>
                        )}

                        <span className="text-[12px] text-gray-400">
                          {isRecordingQuickCapHotkey ? (
                            <span className="text-rose-400 font-medium animate-pulse">
                              Stiskněte klávesovou kombinaci (např. Ctrl+Shift+S). Esc zruší, Backspace zkratku odstraní.
                            </span>
                          ) : (
                            <span>Klikněte do pole a stiskněte klávesy (např. Ctrl+Shift+S). Zkratka nesmí kolidovat s ostatními. Backspace zkratku vymaže.</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Target folder setting */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="block text-xs font-semibold text-gray-300">
                        Složka pro ukládání výstřižků
                      </label>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <div className="flex-1 bg-black/30 rounded-full px-4 py-2 text-xs font-mono text-gray-300 truncate">
                          {formData.donkeyTools?.quickCap?.saveDirectory || formData.donkeyTools?.fastSnap?.saveDirectory || 'Výchozí: Obrázky\\IADonkey Screenshots'}
                        </div>
                        <button
                          type="button"
                          onClick={handleChooseQuickCapFolder}
                          className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-base text-rose-400">folder_open</span>
                          <span>Změnit složku...</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShowQuickCapInFolder('')}
                          className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                          title="Otevře složku v Průzkumníku souborů Windows"
                        >
                          <span className="material-symbols-outlined text-base text-rose-400">open_in_new</span>
                          <span>Otevřít v Průzkumníku</span>
                        </button>
                      </div>
                    </div>

                    {/* Gallery: Recent 10 screenshots */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-gray-300">
                          Poslední výstřižky ({recentQuickCaps.length})
                        </label>
                      </div>

                      {recentQuickCaps.length === 0 ? (
                        <div className="p-4 bg-white/[0.02] rounded-2xl text-center text-xs text-gray-400 flex flex-col items-center gap-1.5">
                          <span className="material-symbols-outlined text-2xl text-gray-400">image_not_supported</span>
                          <span>Zatím žádné pořízené výstřižky. Zkuste vyzkoušet tlačítko výše nebo zadat <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/quickcap</code> ve vyhledávači.</span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                          {recentQuickCaps.map((snap) => {
                            const isCopied = copiedQuickCapPath === snap.path;
                            const dateStr = new Date(snap.createdAt).toLocaleString('cs-CZ', {
                              dateStyle: 'short',
                              timeStyle: 'medium',
                            });
                            return (
                              <div
                                key={snap.path}
                                className="group relative p-3 bg-black/30 hover:bg-black/50 rounded-2xl transition flex gap-3 items-center"
                              >
                                {snap.dataUrl ? (
                                  <img
                                    src={snap.dataUrl}
                                    alt={snap.name}
                                    className="w-16 h-12 object-cover rounded-xl bg-black/50 shrink-0 cursor-pointer"
                                    onClick={() => handleCopyQuickCap(snap.path)}
                                    title="Kliknutím vložíte do schránky"
                                  />
                                ) : (
                                  <div className="w-16 h-12 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-gray-400">image</span>
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="text-xs font-medium text-white truncate cursor-pointer hover:text-rose-300"
                                    onClick={() => handleCopyQuickCap(snap.path)}
                                    title={snap.name}
                                  >
                                    {snap.name}
                                  </div>
                                  <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
                                    <span>{dateStr}</span>
                                    {snap.width && snap.height && (
                                      <span className="font-mono text-rose-400/80">{snap.width}×{snap.height}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 self-center">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyQuickCap(snap.path)}
                                    className={`w-8 h-8 rounded-full transition cursor-pointer flex items-center justify-center shrink-0 ${
                                      isCopied
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'text-gray-400 hover:text-white hover:bg-white/10'
                                    }`}
                                    title="Zkopírovat znovu do schránky"
                                  >
                                    <span className="material-symbols-outlined !text-[18px] leading-none" style={{ fontSize: '18px' }}>
                                      {isCopied ? 'check' : 'content_copy'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleShowQuickCapInFolder(snap.path)}
                                    className="w-8 h-8 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition cursor-pointer flex items-center justify-center shrink-0"
                                    title="Zobrazit ve složce"
                                  >
                                    <span className="material-symbols-outlined !text-[18px] leading-none" style={{ fontSize: '18px' }}>folder_open</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuickCap(snap.path)}
                                    className="w-8 h-8 text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 rounded-full transition cursor-pointer flex items-center justify-center shrink-0"
                                    title="Smazat výstřižek"
                                  >
                                    <span className="material-symbols-outlined !text-[18px] leading-none" style={{ fontSize: '18px' }}>delete</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Usage examples banner */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-1 text-[11px] text-gray-400">
                      <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">info</span>
                        Jak QuickCap používat
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-gray-400 pl-1">
                        <li>Zadejte <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/cap</code>, použijte klávesovou zkratku nebo ve Spotlightu klikněte na ikonku nástrojů.</li>
                        <li>Táhněte myší pro výběr oblasti. Uvolněním tlačítka myši se snímek ihned zkopíruje do schránky a uloží na disk.</li>
                        <li>Stiskem <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Esc</kbd> pořízení výstřižku zrušíte bez uložení.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* SECTION 3: ScreenRuler */}
              {activeDonkeyTool === 'screenRuler' && (
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors animate-fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-400">
                      <span className="material-symbols-outlined text-2xl">straighten</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white tracking-wide">ScreenRuler</h4>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Měřítko a pravítko
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Přesné měření rozměrů, vzdáleností a pixelů na živé obrazovce pomocí obdélníkového výběru nebo celoobrazovkového kříže s kótami k okrajům. Podporuje jednotky px, % i dp s rychlým kopírováním do schránky.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.donkeyTools?.screenRuler?.enabled ?? false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            donkeyTools: {
                              ...formData.donkeyTools,
                              screenRuler: {
                                enabled: e.target.checked,
                                hotkey: formData.donkeyTools?.screenRuler?.hotkey || '',
                                color: formData.donkeyTools?.screenRuler?.color || '#f43f5e',
                                defaultUnit: formData.donkeyTools?.screenRuler?.defaultUnit || 'px',
                              },
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600" />
                    </label>
                  </div>
                </div>

                {/* Sub-settings when ScreenRuler is enabled */}
                {(formData.donkeyTools?.screenRuler?.enabled ?? false) && (
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    {/* Hotkey configuration & Test launch */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Globální klávesová zkratka pro ScreenRuler (volitelné)
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={
                                isRecordingScreenRulerHotkey
                                  ? (screenRulerRecordedModifiers.length > 0
                                      ? screenRulerRecordedModifiers.join(' + ')
                                      : 'Stiskněte klávesy...')
                                  : formData.donkeyTools?.screenRuler?.hotkey || ''
                              }
                              onFocus={handleScreenRulerHotkeyFocus}
                              onBlur={handleScreenRulerHotkeyBlur}
                              data-hotkey-field="screenRuler"
                              onKeyDown={handleScreenRulerHotkeyKeyDown}
                              onKeyUp={handleScreenRulerHotkeyKeyUp}
                              className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                                screenRulerHotkeyError
                                  ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                                  : isRecordingScreenRulerHotkey
                                  ? 'm3-selected-card text-white ring-2 ring-white/50'
                                  : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                              }`}
                              placeholder="Klikněte"
                            />
                            {formData.donkeyTools?.screenRuler?.hotkey && !isRecordingScreenRulerHotkey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = {
                                    ...formData,
                                    donkeyTools: {
                                      ...formData.donkeyTools,
                                      screenRuler: {
                                        enabled: formData.donkeyTools?.screenRuler?.enabled ?? true,
                                        hotkey: '',
                                        color: formData.donkeyTools?.screenRuler?.color || '#f43f5e',
                                        defaultUnit: formData.donkeyTools?.screenRuler?.defaultUnit || 'px',
                                      },
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                  setScreenRulerHotkeyError(null);
                                }}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                                title="Odstranit zkratku"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            )}
                          </div>

                            <button
                            type="button"
                            onClick={async () => {
                              try {
                                if (window.electronAPI?.startScreenRuler) {
                                  await window.electronAPI.startScreenRuler();
                                }
                              } catch (err) {
                                console.error('ScreenRuler test run error:', err);
                              }
                            }}
                            className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            <span className="material-symbols-outlined text-base text-rose-400">straighten</span>
                            <span>Spustit ScreenRuler</span>
                          </button>
                        </div>

                        {screenRulerHotkeyError && (
                          <div className="text-xs text-rose-400 flex items-center gap-1.5 animate-fade-in font-medium">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <span>{screenRulerHotkeyError}</span>
                          </div>
                        )}

                        <p className="text-[11px] text-gray-500">
                          Klikněte do pole a stiskněte požadovanou kombinaci kláves (např. <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">Ctrl+Alt+R</kbd>). Klávesou <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">Backspace</kbd> zkratku smažete, <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">Esc</kbd> zruší změnu.
                        </p>
                      </div>
                    </div>

                    {/* Default Unit */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="block text-xs font-semibold text-gray-300">
                        Výchozí jednotka měření
                      </label>
                      <div className="flex items-center gap-2">
                        {(['px', '%', 'dp'] as const).map((unitOpt) => {
                          const isSelected = (formData.donkeyTools?.screenRuler?.defaultUnit || 'px') === unitOpt;
                          return (
                            <button
                              key={unitOpt}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...formData,
                                  donkeyTools: {
                                    ...formData.donkeyTools,
                                    screenRuler: {
                                      enabled: formData.donkeyTools?.screenRuler?.enabled ?? true,
                                      hotkey: formData.donkeyTools?.screenRuler?.hotkey || '',
                                      color: formData.donkeyTools?.screenRuler?.color || '#f43f5e',
                                      defaultUnit: unitOpt,
                                    },
                                  },
                                };
                                setFormData(updated);
                                handleSave(updated);
                              }}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-black/30 text-gray-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {unitOpt}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Během měření lze jednotku okamžitě přepínat klávesou <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">U</kbd>.
                      </p>
                    </div>

                    {/* Accent Color */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <label className="block text-xs font-semibold text-gray-300">
                        Barva vodítek a měřítka
                      </label>
                      {(() => {
                        const effectiveColor = formData.donkeyTools?.screenRuler?.color || '#f43f5e';
                        const currentPreset = APP_COLOR_PRESETS.find(
                          (preset) => preset.hex.toLowerCase() === effectiveColor.toLowerCase()
                        );
                        const handleColorChange = (newColor: string) => {
                          const updated = {
                            ...formData,
                            donkeyTools: {
                              ...formData.donkeyTools,
                              screenRuler: {
                                enabled: formData.donkeyTools?.screenRuler?.enabled ?? true,
                                hotkey: formData.donkeyTools?.screenRuler?.hotkey || '',
                                color: newColor,
                                defaultUnit: formData.donkeyTools?.screenRuler?.defaultUnit || 'px',
                              },
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        };

                        return (
                          <div className="flex flex-wrap items-center justify-between gap-4 bg-black/30 p-4 rounded-2xl shadow-sm">
                            {/* Active color preview indicator (left) */}
                            <div className="flex items-center gap-3">
                              <div className="relative w-10 h-10 rounded-full overflow-hidden shadow-inner flex items-center justify-center ring-2 ring-white/20">
                                <div
                                  className="w-full h-full"
                                  style={{ backgroundColor: effectiveColor }}
                                />
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-sm text-white font-semibold">
                                    {currentPreset?.name || effectiveColor.toUpperCase()}
                                  </span>
                                  {currentPreset?.isDefault && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-300">
                                      Výchozí
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">Vybraný odstín</span>
                              </div>
                            </div>

                            {/* Preset quick colors (right) */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {APP_COLOR_PRESETS.map((preset) => (
                                <React.Fragment key={preset.hex}>
                                  <button
                                    type="button"
                                    onClick={() => handleColorChange(preset.hex)}
                                    title={preset.isDefault ? `${preset.name} (Výchozí barva)` : preset.name}
                                    className={`w-7 h-7 rounded-full transition transform hover:scale-110 flex items-center justify-center cursor-pointer shadow-sm relative ${
                                      effectiveColor.toLowerCase() === preset.hex.toLowerCase()
                                        ? 'ring-2 ring-white ring-offset-2 ring-offset-[#181920]'
                                        : 'opacity-70 hover:opacity-100'
                                    }`}
                                    style={{ backgroundColor: preset.hex }}
                                  >
                                    {preset.isDefault && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm pointer-events-none" />
                                    )}
                                  </button>
                                  {preset.isDefault === 'secondary' && (
                                    <div className="w-px h-4 bg-white/10 mx-0.5" />
                                  )}
                                </React.Fragment>
                              ))}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const picked = await pickScreenColor({ noClipboard: true, noSpotlight: true });
                                    if (picked) {
                                      handleColorChange(picked);
                                    }
                                  } catch (err) {
                                    console.error('Eyedropper error in ScreenRuler color picker:', err);
                                  }
                                }}
                                title="Nabrat barvu z obrazovky (Kapátko)"
                                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition flex items-center justify-center cursor-pointer ml-1 shadow-sm"
                              >
                                <span className="material-symbols-outlined text-sm">colorize</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Usage shortcuts banner */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-1.5 text-[11px] text-gray-400">
                      <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">keyboard</span>
                        Ovládací zkratky v overlay měřítka
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-gray-300 pt-1">
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">Esc</kbd>
                          <span className="text-gray-400">Zavřít pravítko</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">Mezerník</kbd>
                          <span className="text-gray-400">Zmrazit / odemknout výběr</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">C</kbd>
                          <span className="text-gray-400">Zkopírovat rozměry do schránky</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">M</kbd>
                          <span className="text-gray-400">Přepnout režim (Výběr ↔ Kříž)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">U</kbd>
                          <span className="text-gray-400">Změnit jednotky (px ↔ % ↔ dp)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono text-[10px]">Šipky (Shift)</kbd>
                          <span className="text-gray-400">Posunout výběr o 1 px (10 px)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* SECTION 4: EasyClip */}
              {activeDonkeyTool === 'easyClip' && (
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors animate-fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0 text-rose-400">
                      <span className="material-symbols-outlined text-2xl">content_paste</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white tracking-wide">EasyClip</h4>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                          Správce schránky
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Pokročilá historie schránky přímo ve Spotlightu s podporou formátovaného textu i zkopírovaných obrázků. Umožňuje okamžité vyhledávání a vkládání libovolné předchozí položky zpět do schránky.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formData.donkeyTools?.easyClip?.enabled ?? false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            donkeyTools: {
                              ...formData.donkeyTools,
                              easyClip: {
                                enabled: e.target.checked,
                                hotkey: formData.donkeyTools?.easyClip?.hotkey || '',
                                maxItems: formData.donkeyTools?.easyClip?.maxItems || 50,
                              },
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600" />
                    </label>
                  </div>
                </div>

                {/* Sub-settings when EasyClip is enabled */}
                {(formData.donkeyTools?.easyClip?.enabled ?? false) && (
                  <div className="pt-4 space-y-4">
                    {/* Hotkey configuration & Test Button */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Globální klávesová zkratka pro otevření EasyClipu (volitelné)
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={
                                isRecordingEasyClipHotkey
                                  ? (easyClipRecordedModifiers.length > 0
                                      ? easyClipRecordedModifiers.join('+')
                                      : 'Stiskněte kombinaci kláves...')
                                  : (formData.donkeyTools?.easyClip?.hotkey || '')
                              }
                              placeholder="Klikněte"
                              onFocus={handleEasyClipHotkeyFocus}
                              onBlur={handleEasyClipHotkeyBlur}
                              data-hotkey-field="easyClip"
                              onKeyDown={handleEasyClipHotkeyKeyDown}
                              onKeyUp={handleEasyClipHotkeyKeyUp}
                              className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                                easyClipHotkeyError
                                  ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                                  : isRecordingEasyClipHotkey
                                  ? 'm3-selected-card text-white ring-2 ring-white/50'
                                  : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                              }`}
                            />
                            {formData.donkeyTools?.easyClip?.hotkey && !isRecordingEasyClipHotkey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = {
                                    ...formData,
                                    donkeyTools: {
                                      ...formData.donkeyTools,
                                      easyClip: {
                                        enabled: formData.donkeyTools?.easyClip?.enabled ?? true,
                                        hotkey: '',
                                        maxItems: formData.donkeyTools?.easyClip?.maxItems || 50,
                                      },
                                    },
                                  };
                                  setFormData(updated);
                                  handleSave(updated);
                                  setEasyClipHotkeyError(null);
                                }}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                                title="Odstranit zkratku"
                              >
                                <span className="material-symbols-outlined text-xs">close</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleOpenEasyClip}
                            className="px-4 py-2 rounded-full text-xs font-semibold text-white bg-white/[0.06] hover:bg-white/[0.1] transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
                            title="Otevře EasyClip ve Spotlightu"
                          >
                            <span className="material-symbols-outlined text-base text-rose-400">open_in_new</span>
                            <span>Otevřít EasyClip</span>
                          </button>
                        </div>

                        {easyClipHotkeyError && (
                          <p className="text-[11px] text-red-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">error</span>
                            {easyClipHotkeyError}
                          </p>
                        )}
                        <p className="text-[11px] text-gray-500">
                          Klikněte do pole a stiskněte požadovanou kombinaci kláves (např. <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">Alt+V</kbd> nebo <kbd className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono">Ctrl+Shift+V</kbd>). Backspace zkratku smaže, Escape zruší nahrávání.
                        </p>
                      </div>
                    </div>

                    {/* Max Items in history */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Maximální počet uchovávaných položek v historii
                      </label>
                      <div className="flex items-center gap-2">
                        {[25, 50, 100, 200].map((num) => {
                          const currentMax = formData.donkeyTools?.easyClip?.maxItems || 50;
                          const isSelected = currentMax === num;
                          return (
                            <button
                              key={num}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...formData,
                                  donkeyTools: {
                                    ...formData.donkeyTools,
                                    easyClip: {
                                      enabled: formData.donkeyTools?.easyClip?.enabled ?? true,
                                      hotkey: formData.donkeyTools?.easyClip?.hotkey || '',
                                      maxItems: num,
                                    },
                                  },
                                };
                                setFormData(updated);
                                handleSave(updated);
                              }}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-mono font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-black/30 text-gray-400 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {num} položek
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Clipboard storage & Clear History */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-gray-300">
                        Aktuální stav schránky
                      </label>
                      <div className="flex items-center justify-between p-3.5 bg-black/30 rounded-2xl text-xs">
                        <div className="flex items-center gap-2 text-gray-300">
                          <span className="material-symbols-outlined text-rose-400 text-base">history</span>
                          <span>Uloženo v historii: <strong className="text-white font-mono">{easyClipItemCount}</strong> položek</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {easyClipClearSuccess && (
                            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                              <span className="material-symbols-outlined text-sm">check</span>
                              Historie byla vymazána
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={handleClearEasyClipHistory}
                            disabled={easyClipItemCount === 0}
                            className="px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-40 text-white rounded-full text-xs font-semibold transition cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm text-rose-400">delete_sweep</span>
                            <span>Vymazat historii</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Usage banner */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-1.5 text-[11px] text-gray-400">
                      <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">info</span>
                        Jak EasyClip používat
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-gray-400 pl-1">
                        <li>Zadejte příkaz <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/clip</code>, <code className="bg-white/10 px-2 py-0.5 rounded-full text-white font-mono">/schranka</code>, klikněte na ikonu schránky ve Spotlightu nebo použijte klávesovou zkratku.</li>
                        <li>V zobrazení EasyClip můžete přímo psát a filtrovat historii textu v reálném čase.</li>
                        <li>Stiskem <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Enter</kbd> zkopírujete vybranou položku a okno se zavře.</li>
                        <li>Klávesou <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Del</kbd> odstraníte položku z historie, <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Esc</kbd> se vrátíte zpět do vyhledávače.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* TAB: Snippets */}
          {activeTab === 'snippets' && (
            <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
              {/* SECTION 1: Vlastní snippety */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-white text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-indigo-400">draw</span>
                    Vlastní snippety
                  </h3>
                  <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                    Vytvořte si vlastní zkratky přes dvojtečku a textové šablony pro rychlé zkopírování do schránky (např. IBAN, čísla účtů, smlouvy či často používané odpovědi).
                  </p>
                </div>

                {/* Action buttons on their own line, left-aligned */}
                <div className="flex items-center justify-start gap-2 flex-wrap">
                  {/* Hidden input for JSON file import */}
                  <input
                    ref={importSnippetsFileRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportCustomSnippets}
                    className="hidden"
                  />

                  {/* Import button */}
                  <button
                    type="button"
                    onClick={() => importSnippetsFileRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 hover:text-white text-xs font-medium transition cursor-pointer"
                    title="Importovat snippety ze souboru JSON"
                  >
                    <span className="material-symbols-outlined text-[16px] text-indigo-400">file_upload</span>
                    <span>Importovat</span>
                  </button>

                  {/* Export button */}
                  <button
                    type="button"
                    onClick={handleExportCustomSnippets}
                    disabled={!formData.snippets?.custom || formData.snippets.custom.length === 0}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition ${
                      !formData.snippets?.custom || formData.snippets.custom.length === 0
                        ? 'bg-white/[0.02] text-gray-500 cursor-not-allowed opacity-50'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 hover:text-white cursor-pointer'
                    }`}
                    title="Exportovat vlastní snippety do souboru JSON"
                  >
                    <span className="material-symbols-outlined text-[16px] text-indigo-400">file_download</span>
                    <span>Exportovat</span>
                  </button>

                  {/* Add snippet button */}
                  <button
                    type="button"
                    onClick={handleAddCustomSnippet}
                    className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-medium transition cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                    <span>Přidat snippet</span>
                  </button>
                </div>

                {snippetFeedback && (
                  <div
                    className={`p-3 px-4 rounded-xl text-xs flex items-center justify-between gap-2 transition ${
                      snippetFeedback.type === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">
                        {snippetFeedback.type === 'success' ? 'check_circle' : 'error'}
                      </span>
                      <span>{snippetFeedback.message}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSnippetFeedback(null)}
                      className="hover:opacity-75 text-gray-400 hover:text-white transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                )}

                {/* List of custom snippets */}
                {(!formData.snippets?.custom || formData.snippets.custom.length === 0) ? (
                  <div className="p-8 bg-white/[0.02] rounded-2xl text-center space-y-3">
                    <span className="material-symbols-outlined text-3xl text-gray-500">content_paste</span>
                    <p className="text-xs text-gray-400">
                      Zatím nemáte vytvořené žádné vlastní snippety.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={handleAddCustomSnippet}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 rounded-full text-xs font-semibold transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm text-indigo-400">add</span>
                        <span>Vytvořit první snippet</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => importSnippetsFileRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 hover:text-white rounded-full text-xs font-medium transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm text-indigo-400">file_upload</span>
                        <span>Importovat JSON</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.snippets.custom.map((snip, index) => (
                      <div
                        key={snip.id || index}
                        className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-3 transition-colors"
                      >
                        {/* Row 1: {vyber ikony} | {nazev} | [odebrat] */}
                        <div className="flex items-center gap-2.5">
                          <div className="w-48 sm:w-56 shrink-0">
                            <IconPickerInput
                              value={snip.icon || ''}
                              onChange={(newIcon) => handleUpdateCustomSnippet(snip.id, { icon: newIcon })}
                              placeholder="Vybrat ikonu..."
                              accentColorClass="text-indigo-400"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={snip.name}
                              onChange={(e) => handleUpdateCustomSnippet(snip.id, { name: e.target.value })}
                              placeholder="Název snippetu (např. Číslo bankovního účtu, IBAN)"
                              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-medium"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCustomSnippet(snip.id)}
                            className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-400 hover:text-rose-300 hover:bg-rose-500/25 flex items-center justify-center shrink-0 transition cursor-pointer"
                            title="Smazat snippet"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>

                        {/* Row 2: {location - viceradkove pole} */}
                        <div>
                          <textarea
                            rows={2}
                            value={snip.location}
                            onChange={(e) => handleUpdateCustomSnippet(snip.id, { location: e.target.value })}
                            placeholder="Obsah snippetu (víceřádkový text ke zkopírování do schránky)..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono resize-y leading-relaxed"
                          />
                        </div>

                        {/* Row 3: {shortcuts X} [pridat novy] */}
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          <span className="h-7 flex items-center gap-1.5 text-xs text-gray-300 font-medium mr-0.5 select-none">
                            <span className="material-symbols-outlined text-[17px] text-indigo-400 leading-none">label</span>
                            <span className="leading-none">Zkratky:</span>
                          </span>
                          {(snip.shortcuts || []).map((sc, scIdx) => {
                            const clean = sc.replace(/^:+/, '');
                            return (
                              <span
                                key={scIdx}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-mono select-none"
                              >
                                <span className="text-indigo-400 font-bold leading-none">:</span>
                                <span className="leading-none">{clean}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveShortcut(snip.id, scIdx)}
                                  className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-rose-500/20 hover:text-rose-300 text-gray-400 transition cursor-pointer ml-0.5"
                                  title="Odebrat zkratku"
                                >
                                  <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                                </button>
                              </span>
                            );
                          })}

                          {/* Inline input to add shortcut with non-deletable colon */}
                          <div className="inline-flex items-center h-7 px-2.5 bg-black/40 border border-white/15 rounded-lg focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/30 transition">
                            <span className="text-indigo-400 font-mono text-xs select-none font-bold mr-1 leading-none">:</span>
                            <input
                              type="text"
                              placeholder="přidat zkratku..."
                              className="bg-transparent text-white text-xs font-mono outline-none w-28 placeholder:text-gray-500 leading-none"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const target = e.currentTarget;
                                  const val = target.value.trim().replace(/^:+/, '');
                                  if (val) {
                                    handleAddShortcut(snip.id, val);
                                    target.value = '';
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                const val = e.target.value.trim().replace(/^:+/, '');
                                if (val) {
                                  handleAddShortcut(snip.id, val);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: Předdefinované osobní údaje */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-white text-base flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-indigo-400">badge</span>
                    Předdefinované osobní údaje
                  </h3>
                  <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                    Pevně definované textové zkratky a kontaktní údaje zabudované v aplikaci (podpis, jméno, IČO, DIČ, telefon, e-mail, adresa). Hodnota se po výběru okamžitě zkopíruje do schránky.
                  </p>
                </div>

              {/* Vlastní podpis */}
              <div className="space-y-3 bg-white/[0.03] p-5 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-medium text-gray-200">
                    Můj Podpis (<span className="text-indigo-300 font-mono">:podpis</span>, <span className="text-indigo-300 font-mono">:sign</span>, <span className="text-indigo-300 font-mono">:signature</span>)
                  </label>
                  <span className="text-[11px] text-gray-500 font-mono">Víceřádkový text</span>
                </div>
                <textarea
                  rows={4}
                  value={formData.snippets?.signature || ''}
                  onChange={(e) => {
                    const updated = {
                      ...formData,
                      snippets: {
                        ...formData.snippets,
                        signature: e.target.value,
                      },
                    };
                    setFormData(updated);
                    handleSave(updated);
                  }}
                  placeholder={`S pozdravem,\nJan Novák\ntel: +420 123 456 789`}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 outline-none font-mono resize-y leading-relaxed"
                />
                <p className="text-xs text-gray-400">
                  Po výběru zkratky <span className="text-indigo-300 font-mono">:podpis</span> ve vyhledávači se tento text zkopíruje do schránky.
                </p>
              </div>

              {/* Company & contact snippets */}
              <div className="bg-white/[0.03] p-5 rounded-2xl space-y-4">
                <h5 className="text-[13px] font-medium text-gray-200 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-indigo-400">badge</span>
                  Osobní, firemní a kontaktní údaje pro rychlé vložení
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Moje Jmeno */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 flex items-center justify-between">
                      <span>Moje Jméno (<code className="text-indigo-300 font-mono">:jmeno</code>, <code className="text-indigo-300 font-mono">:name</code>)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.snippets?.name || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          snippets: { ...formData.snippets, name: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. Jan Novák"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>

                  {/* Moje ICO */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 flex items-center justify-between">
                      <span>Moje IČO (<code className="text-indigo-300 font-mono">:ico</code>, <code className="text-indigo-300 font-mono">:ičo</code>)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.snippets?.ico || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          snippets: { ...formData.snippets, ico: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. 12345678"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>

                  {/* DIC */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 flex items-center justify-between">
                      <span>Moje DIČ (<code className="text-indigo-300 font-mono">:dic</code>, <code className="text-indigo-300 font-mono">:dič</code>, <code className="text-indigo-300 font-mono">:vat</code>)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.snippets?.dic || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          snippets: { ...formData.snippets, dic: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. CZ12345678"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>

                  {/* Muj Telefon */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 flex items-center justify-between">
                      <span>Můj Telefon (<code className="text-indigo-300 font-mono">:telefon</code>, <code className="text-indigo-300 font-mono">:tel</code>)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.snippets?.phone || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          snippets: { ...formData.snippets, phone: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. +420 777 123 456"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 flex items-center justify-between">
                      <span>Můj E-mail (<code className="text-indigo-300 font-mono">:email</code>, <code className="text-indigo-300 font-mono">:mail</code>, <code className="text-indigo-300 font-mono">:e-mail</code>)</span>
                    </label>
                    <input
                      type="email"
                      value={formData.snippets?.email || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          snippets: { ...formData.snippets, email: e.target.value },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. info@firma.cz"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Moje Adresa */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs text-gray-300 flex items-center justify-between">
                    <span>Moje Adresa (<code className="text-indigo-300 font-mono">:adresa</code>, <code className="text-indigo-300 font-mono">:address</code>)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.snippets?.address || ''}
                    onChange={(e) => {
                      const updated = {
                        ...formData,
                        snippets: { ...formData.snippets, address: e.target.value },
                      };
                      setFormData(updated);
                      handleSave(updated);
                    }}
                    placeholder="např. Václavské náměstí 1, 110 00 Praha 1"
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                  />
                </div>

                <p className="text-[11px] text-gray-400">
                  Zadáním dvojtečky a názvu (např. <code className="text-indigo-300 font-mono">:ico</code> nebo <code className="text-indigo-300 font-mono">:adresa</code>) se údaj okamžitě zkopíruje do schránky.
                </p>
              </div>
            </div>
          </div>
        )}

          {/* TAB 3: General & Updates */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              {/* Hotkey Section */}
              <div className="space-y-3 bg-white/[0.03] p-4 rounded-2xl shadow-sm">
                <div>
                  <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-indigo-400">keyboard</span>
                    Globální klávesová zkratka
                  </h4>
                  <p className="text-[13px] text-gray-400 mt-1">
                    Kombinace kláves pro otevření vyhledávacího okna uprostřed monitoru s myší.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative w-fit">
                      <input
                        type="text"
                        readOnly
                        value={
                          isRecordingHotkey
                            ? (recordedModifiers.length > 0
                                ? recordedModifiers.join(' + ')
                                : 'Stiskněte klávesy...')
                            : formData.hotkey
                        }
                        onFocus={handleHotkeyFocus}
                        onBlur={handleHotkeyBlur}
                        data-hotkey-field="main"
                        onKeyDown={handleHotkeyKeyDown}
                        onKeyUp={handleHotkeyKeyUp}
                        className={`w-64 rounded-full px-4 py-2.5 text-sm font-mono cursor-pointer transition outline-none select-none text-center font-semibold shadow-sm ${
                          hotkeyError
                            ? 'bg-rose-950/40 text-rose-300 ring-2 ring-rose-500/50'
                            : isRecordingHotkey
                            ? 'm3-selected-card text-white ring-2 ring-white/50'
                            : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                        }`}
                        placeholder="Klikněte"
                      />
                      {formData.hotkey && !isRecordingHotkey && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = { ...formData, hotkey: '' };
                            setFormData(updated);
                            handleSave(updated);
                            setHotkeyError(null);
                          }}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                          title="Odstranit zkratku"
                        >
                          <span className="material-symbols-outlined text-xs">close</span>
                        </button>
                      )}
                    </div>
                    <span className="text-[13px] text-gray-400">
                      {isRecordingHotkey ? (
                        <span className="text-indigo-400 font-medium animate-pulse">
                          Stiskněte klávesovou kombinaci (např. Ctrl+Alt+Space). Esc zruší.
                        </span>
                      ) : (
                        <span>Klikněte do pole a stiskněte kombinaci kláves (např. Ctrl+Alt+Space). Rezervované zkratky z nápovědy nelze použít.</span>
                      )}
                    </span>
                  </div>

                  {hotkeyError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold animate-fade-in">
                      <span className="material-symbols-outlined text-sm">error</span>
                      <span>{hotkeyError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Primary Color Accent Section */}
              <ColorPickerSection
                title="Hlavní barva aplikace (Zvýraznění)"
                description="Nastavení barvy tlačítek, aktivních záložek a prvků. Semaforové stavové barvy (zelená, červená, oranžová) zůstávají beze změny."
                icon="palette"
                iconColorClass="text-indigo-400"
                value={formData.primaryColor || '#6366f1'}
                fallbackColor="#6366f1"
                onColorChange={(val) => {
                  const updated = { ...formData, primaryColor: val };
                  setFormData(updated);
                  applyPrimaryColor(val);
                  handleSave(updated);
                }}
              />

              {/* Actions Color Accent Section */}
              <ColorPickerSection
                title="Barva akcí a informací (Sekundární)"
                description="Nastavení barvy pro nabídku Akcí a podrobných informací (Shift+Enter), štítků akcí a dialogu pro stahování Git repozitářů."
                icon="bolt"
                iconColorClass="text-purple-400"
                value={formData.actionsColor || '#a855f7'}
                fallbackColor="#a855f7"
                onColorChange={(val) => {
                  const updated = { ...formData, actionsColor: val };
                  setFormData(updated);
                  applyActionsColor(val);
                  handleSave(updated);
                }}
              />

              {/* Installed Apps Section */}
              <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-indigo-400">apps</span>
                      Nainstalované programy Windows
                    </h4>
                    <p className="text-[13px] text-gray-400 mt-1 max-w-xl leading-relaxed">
                      IADonkey prohledá nainstalované programy v nabídce Start a nabídne je ve vyhledávači včetně jejich původních systémových ikon. Programy jsou řazeny pod vašimi vlastními položkami (priorita 99).
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={formData.searchInstalledApps !== false}
                      onChange={(e) => {
                        const updated = { ...formData, searchInstalledApps: e.target.checked };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>

              {/* Default Search Engine Section */}
              <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-indigo-400">travel_explore</span>
                      Výchozí internetový vyhledávač
                    </h4>
                    <p className="text-[13px] text-gray-400 mt-1 max-w-xl leading-relaxed">
                      Vyhledávač nabízený ve Spotlightu na konci výsledků i bez prefixu (od 2 znaků).
                      Vyhledávání s přímým prefixem ({SEARCH_ENGINES.map((e) => e.prefixes.map((p) => `${p}:`).join(', ')).join(', ')}) funguje vždy bez ohledu na výchozí volbu.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <select
                      value={
                        formData.defaultSearchEngine !== undefined
                          ? formData.defaultSearchEngine
                          : (formData.searchGoogle !== false ? 'google' : 'none')
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = {
                          ...formData,
                          defaultSearchEngine: val,
                          searchGoogle: val !== 'none',
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="bg-black/40 rounded-full px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition cursor-pointer min-w-[200px] shadow-sm"
                    >
                      {SEARCH_ENGINES.map((engine) => (
                        <option key={engine.id} value={engine.id} className="bg-[#181920] text-white">
                          {engine.name}
                        </option>
                      ))}
                      <option value="none" className="bg-[#181920] text-gray-400">
                        Žádný
                      </option>
                    </select>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB: Dedicated Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-indigo-400">notifications</span>
                  Systémové notifikace Windows
                </h3>
                <p className="text-[13px] text-gray-400 mt-1 leading-relaxed">
                  Zobrazování nativních toast notifikací v oznamovacím centru Windows při důležitých událostech (výstřižky, barvy, synchronizace a aktualizace).
                </p>
              </div>

              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/5">
                  <div>
                    <span className="text-sm font-semibold text-white block">Povolit systémové notifikace</span>
                    <span className="text-xs text-gray-400">Hlavní přepínač pro všechna vyskakovací oznámení Windows</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={formData.notifications?.enabled !== false}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          notifications: {
                            ...formData.notifications,
                            enabled: e.target.checked,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>

                {formData.notifications?.enabled !== false && (
                  <div className="space-y-2 pt-1">
                    {/* Tichý režim */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">volume_off</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Tichý režim</span>
                          <span className="text-[11px] text-gray-400">Nezahrnovat systémový zvuk Windows při zobrazení banneru</span>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.notifications?.silent)}
                          onChange={(e) => {
                            const updated = {
                              ...formData,
                              notifications: {
                                ...formData.notifications,
                                enabled: formData.notifications?.enabled ?? true,
                                silent: e.target.checked,
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                      </label>
                    </div>

                    {/* QuickCap */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">crop</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Výstřižky QuickCap</span>
                          <span className="text-[11px] text-gray-400">Upozornění na uložení výstřižku (kliknutím otevřete ve složce)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['quickCap'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('quickCap')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat notifikaci QuickCap"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.quickCap !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  quickCap: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>

                    {/* ColorMaster */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">colorize</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Kapátko Eyedropper (ColorMaster)</span>
                          <span className="text-[11px] text-gray-400">Upozornění s kódem nabrané barvy zkopírované do schránky</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['colorMaster'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('colorMaster')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat notifikaci ColorMaster"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.colorMaster !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  colorMaster: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>

                    {/* Synchronizace dat */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">sync</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Dokončení synchronizace dat</span>
                          <span className="text-[11px] text-gray-400">Upozornění na úspěšnou synchronizaci a počet načtených položek</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['syncComplete'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('syncComplete')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat notifikaci synchronizace"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.syncComplete !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  syncComplete: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>

                    {/* Aktualizace aplikace */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">upgrade</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Nové verze a aktualizace</span>
                          <span className="text-[11px] text-gray-400">Upozornění na dostupnou novou verzi s možností kliknout pro instalaci</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['update'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('update')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat notifikaci aktualizace"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.updates !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  updates: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>

                    {/* Kopírování do schránky */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-indigo-400">content_copy</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Kopírování do schránky</span>
                          <span className="text-[11px] text-gray-400">Upozornění při zkopírování textu, barvy, rozměrů či cesty do schránky (ze Spotlightu, pravítka, PaletteMasteru apod.)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['clipboard'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('clipboard')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat notifikaci schránky"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.clipboard !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  clipboard: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600" />
                        </label>
                      </div>
                    </div>

                    {/* Chyby aplikace a crashlogy */}
                    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-base text-rose-400">error</span>
                        <div>
                          <span className="text-xs font-medium text-gray-200 block">Chyby aplikace a pády</span>
                          <span className="text-[11px] text-gray-400">Upozornění při chybovém pádu nebo selhání akce (kliknutím otevřete crashlog)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isDevelop && (() => {
                          const status = systemNotifTestStatus['error'];
                          let btnClasses = "w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.10] text-amber-400";
                          let icon = "notifications_active";
                          if (status === 'success') {
                            btnClasses = "w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400";
                            icon = "check";
                          } else if (status === 'blocked') {
                            btnClasses = "w-8 h-8 rounded-full bg-rose-500/15 text-rose-400";
                            icon = "close";
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => handleTestSystemNotification('error')}
                              className={`${btnClasses} transition-all duration-200 flex items-center justify-center cursor-pointer select-none shrink-0`}
                              title="Otestovat chybovou notifikaci"
                            >
                              <span className="material-symbols-outlined text-base leading-none">{icon}</span>
                            </button>
                          );
                        })()}
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.notifications?.errors !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                notifications: {
                                  ...formData.notifications,
                                  enabled: formData.notifications?.enabled ?? true,
                                  errors: e.target.checked,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-rose-600" />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* KARTA 2: Notifikace MagicPlan */}
              {Boolean(formData.extensions?.magicplan) && (
                <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                  <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-sm font-semibold text-white block">Notifikace MagicPlan</span>
                      <span className="text-xs text-gray-400">Sledování změn v plánu, nových úkolů, fronty nástěnky a termínů</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={formData.notifications?.magicplan !== false}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            notifications: {
                              ...formData.notifications,
                              enabled: formData.notifications?.enabled ?? true,
                              magicplan: e.target.checked,
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
                    </label>
                  </div>

                  {formData.notifications?.magicplan !== false && (
                    <div className="space-y-3 pt-1">
                      {/* 1. Nové úkoly */}
                      <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-base text-cyan-400">add_task</span>
                          <div>
                            <span className="text-xs font-medium text-gray-200 block">Nové úkoly</span>
                            <span className="text-[11px] text-gray-400">Nové úkoly ve frontě nástěnky a nově přiřazené úkoly do vašeho sloupce (i z fronty)</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.magicplan?.notifyNewTasks !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: { ...formData.magicplan, notifyNewTasks: e.target.checked },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-600" />
                        </label>
                      </div>

                      {/* 2. Změny v úkolech */}
                      <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-base text-cyan-400">edit</span>
                          <div>
                            <span className="text-xs font-medium text-gray-200 block">Změny v úkolech</span>
                            <span className="text-[11px] text-gray-400">Změna odhadu času (zvýšení/snížení), přepnutí na kritický nebo běžný úkol</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.magicplan?.notifyTaskChanges !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: { ...formData.magicplan, notifyTaskChanges: e.target.checked },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-600" />
                        </label>
                      </div>

                      {/* 3. Moji kolegové */}
                      <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-base text-cyan-400">group</span>
                          <div>
                            <span className="text-xs font-medium text-gray-200 block">Moji kolegové</span>
                            <span className="text-[11px] text-gray-400">Úkoly přiřazené kolegům a přesuny mezi kolegy (při vypnutí se úkol od kolegy k vám chová jako z fronty)</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.magicplan?.notifyColleagueTasks !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: { ...formData.magicplan, notifyColleagueTasks: e.target.checked },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-600" />
                        </label>
                      </div>

                      {/* 4. Dokončené a uzavřené úkoly */}
                      <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-base text-cyan-400">task_alt</span>
                          <div>
                            <span className="text-xs font-medium text-gray-200 block">Dokončené a uzavřené úkoly</span>
                            <span className="text-[11px] text-gray-400">Úkoly vyřešené nebo smazané z plánu (u vás i sledovaných kolegů)</span>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={formData.magicplan?.notifyCompletedTasks !== false}
                            onChange={(e) => {
                              const updated = {
                                ...formData,
                                magicplan: { ...formData.magicplan, notifyCompletedTasks: e.target.checked },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-cyan-600" />
                        </label>
                      </div>

                      {/* Vývojářský test notifikací MagicPlan */}
                      {isDevelop && (
                        <div className="mt-4 p-4 rounded-xl bg-white/[0.03] space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-base text-amber-400">build</span>
                              <span className="text-xs font-semibold text-amber-300">
                                Vývojářský test notifikací MagicPlan
                              </span>
                            </div>
                            <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-amber-400/15 text-amber-300">
                              DEV MODE
                            </span>
                          </div>

                          {/* 3 Nastavení bez labelů: Typ požadavku, Priorita úkolu, Typ notifikace */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            {/* 1. Typ požadavku: Dev vs Service */}
                            <div className="sm:col-span-3">
                              <div className="flex rounded-full bg-black/40 p-1 border border-white/10">
                                <button
                                  type="button"
                                  onClick={() => setTestTaskType('dev')}
                                  className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    testTaskType === 'dev'
                                      ? 'bg-amber-400 text-gray-950 font-semibold shadow-sm'
                                      : 'text-gray-400 hover:text-gray-200'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">code</span>
                                  <span>Dev</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTestTaskType('service')}
                                  className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    testTaskType === 'service'
                                      ? 'bg-amber-400 text-gray-950 font-semibold shadow-sm'
                                      : 'text-gray-400 hover:text-gray-200'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">build</span>
                                  <span>Service</span>
                                </button>
                              </div>
                            </div>

                            {/* 2. Switch na kritickou (stejný 2-tlačítkový přepínač jako Dev / Service) */}
                            <div className="sm:col-span-3">
                              <div className="flex rounded-full bg-black/40 p-1 border border-white/10">
                                <button
                                  type="button"
                                  onClick={() => setTestIsCritical(false)}
                                  className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    !testIsCritical
                                      ? 'bg-amber-400 text-gray-950 font-semibold shadow-sm'
                                      : 'text-gray-400 hover:text-gray-200'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">schedule</span>
                                  <span>Běžný</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTestIsCritical(true)}
                                  className={`flex-1 py-1.5 text-xs font-medium rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                    testIsCritical
                                      ? 'bg-amber-400 text-gray-950 font-semibold shadow-sm'
                                      : 'text-gray-400 hover:text-gray-200'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-sm">priority_high</span>
                                  <span>Kritická</span>
                                </button>
                              </div>
                            </div>

                            {/* 3. Dropdown typu notifikace */}
                            <div className="sm:col-span-6 relative" data-notif-dropdown>
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenNotifDropdown(
                                    openNotifDropdown === 'mp-dev-test' ? null : 'mp-dev-test'
                                  )
                                }
                                className="w-full h-[38px] flex items-center justify-between px-3 rounded-lg bg-black/40 border border-white/10 hover:border-white/20 text-left transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <span className="material-symbols-outlined text-sm text-amber-400 shrink-0">
                                    {magicPlanSituationsList.find((s) => s.id === testSituationId)?.icon || 'notifications'}
                                  </span>
                                  <span className="text-xs text-gray-200 font-medium truncate">
                                    {magicPlanSituationsList.find((s) => s.id === testSituationId)?.name}
                                  </span>
                                </div>
                                <span className="material-symbols-outlined text-sm text-gray-400 ml-1 shrink-0">
                                  arrow_drop_down
                                </span>
                              </button>

                              {openNotifDropdown === 'mp-dev-test' && (
                                <div className="absolute z-50 bottom-full mb-1 left-0 right-0 max-h-72 overflow-y-auto rounded-xl bg-[#181920] border border-white/10 shadow-2xl p-1.5 space-y-0.5">
                                  {magicPlanSituationsList.map((sit) => {
                                    const isSelected = sit.id === testSituationId;
                                    return (
                                      <button
                                        key={sit.id}
                                        type="button"
                                        onClick={() => {
                                          setTestSituationId(sit.id);
                                          setOpenNotifDropdown(null);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                          isSelected
                                            ? 'bg-amber-500/15 text-amber-200 font-medium'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                                        }`}
                                      >
                                        <span className="material-symbols-outlined text-sm shrink-0 text-amber-400">
                                          {sit.icon}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="truncate">{sit.name}</span>
                                            <span className="px-1.5 py-0.2 text-[9px] font-mono rounded bg-white/5 text-gray-400 shrink-0">
                                              {sit.badge}
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-gray-400 truncate mt-0.5">{sit.desc}</p>
                                        </div>
                                        {isSelected && (
                                          <span className="material-symbols-outlined text-xs text-amber-400 shrink-0">
                                            check
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Tlačítko Odeslat test a zpráva o stavu */}
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => handleSendMagicPlanTestNotification(testSituationId, testTaskType, testIsCritical)}
                              disabled={testingNotificationVariant !== null}
                              className="px-4 py-2 rounded-full font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-950 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">notifications_active</span>
                              <span>Odeslat testovací notifikaci</span>
                            </button>
                          </div>

                          {testNotificationFeedback && (
                            <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 animate-fade-in ${
                              testNotificationFeedback.type === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              <span className="material-symbols-outlined text-sm shrink-0">
                                {testNotificationFeedback.type === 'error' ? 'error' : 'check_circle'}
                              </span>
                              <span>{testNotificationFeedback.message}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: Dedicated System & Updates */}
          {(activeTab === 'system' || activeTab === 'updates') && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              <div>
                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-indigo-400">dns</span>
                  Systém a aktualizace aplikace
                </h3>
                <p className="text-[13px] text-gray-400 mt-1">
                  IADonkey automaticky kontroluje nové verze každých 24 hodin na pozadí. Zde můžete provést ruční kontrolu a spravovat chybové protokoly.
                </p>
              </div>

              {/* Section 1: Updates & Version */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                  <div>
                    <span className="text-[13px] text-gray-400 block mb-1">Nainstalovaná verze</span>
                    <div
                      onClick={handleVersionClick}
                      className="text-lg font-mono font-bold text-white tracking-wide cursor-pointer select-none active:scale-95 transition-transform inline-flex items-center gap-2 group"
                      title={isDevelop ? 'Vývojářský režim je aktivní' : 'Verze aplikace'}
                    >
                      <span className="group-hover:text-indigo-300 transition-colors">v{DISPLAY_APP_VERSION}</span>
                      {(isDevelop || IS_DEV) && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 uppercase tracking-wider inline-flex items-center justify-center leading-none h-4.5 align-middle shadow-xs">
                          DEV
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowChangelog(true)}
                      className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">history_edu</span>
                      <span>Historie změn</span>
                    </button>
                    <button
                      type="button"
                      onClick={onCheckUpdate}
                      className="m3-primary-pill px-5 py-2 text-xs font-semibold rounded-full transition flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <span className="material-symbols-outlined text-base">refresh</span>
                      Zkontrolovat aktualizace nyní
                    </button>
                  </div>
                </div>

                {/* Developer Mode Easter Egg Feedback Messages under divider */}
                {versionClickHint && (
                  <div className="p-3 bg-amber-500/10 rounded-2xl text-xs text-amber-300 flex items-center gap-2 animate-pulse font-medium">
                    <span className="material-symbols-outlined text-base text-amber-400 shrink-0">touch_app</span>
                    <span>{versionClickHint}</span>
                  </div>
                )}
                {developUnlockMessage && (
                  <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 animate-fade-in font-medium ${
                    developUnlockMessage.includes('Již jste')
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'bg-emerald-500/10 text-emerald-300'
                  }`}>
                    <span className={`material-symbols-outlined text-base shrink-0 ${
                      developUnlockMessage.includes('Již jste') ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {developUnlockMessage.includes('Již jste') ? 'info' : 'verified'}
                    </span>
                    <span>{developUnlockMessage}</span>
                  </div>
                )}

                {updateStatusMessage ? (
                  <div className="p-3.5 bg-indigo-950/30 rounded-2xl flex items-center gap-2.5 text-[13px] text-indigo-300">
                    <span className="material-symbols-outlined text-base text-indigo-400">info</span>
                    <span>{updateStatusMessage}</span>
                  </div>
                ) : (
                  <div className="text-[13px] text-gray-400 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-gray-500">check_circle</span>
                    <span>Aplikace je připravena k vyhledávání novějších verzí na GitHubu.</span>
                  </div>
                )}
              </div>

              {/* Section: Feedback & Ideas */}
              <div className="bg-white/[0.03] rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-indigo-400">rate_review</span>
                      Interní zpětná vazba a nápady
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Podělte se o nápady na vylepšení nebo nahlaste chyby přímo vývojáři aplikace. Záznamy se ukládají na společný síťový disk.
                    </p>
                  </div>
                  {Boolean(formData.feedback?.sharedFolder?.trim()) && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          window.electronAPI?.openFeedbackWindow?.('user');
                        }}
                        className="h-[38px] px-4 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm"
                        title="Otevřít okno pro zadání či zobrazení vašich podnětů"
                      >
                        <span className="material-symbols-outlined text-base text-indigo-400">rate_review</span>
                        <span>Otevřít Zpětnou vazbu</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Author Name - first */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[12px] font-medium text-gray-300 block">
                      Vaše jméno / autor podnětů
                    </label>
                    <input
                      type="text"
                      value={formData.feedback?.authorName || ''}
                      onChange={(e) => {
                        const updated = {
                          ...formData,
                          feedback: {
                            ...formData.feedback,
                            authorName: e.target.value,
                          },
                        };
                        setFormData(updated);
                        handleSave(updated);
                      }}
                      placeholder="např. Jan Novák"
                      className="w-full h-[38px] px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-indigo-500 outline-none transition"
                    />
                  </div>

                  {/* Shared folder path - second */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[12px] font-medium text-gray-300 block">
                      Cesta ke sdílené složce (síťový disk)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={formData.feedback?.sharedFolder || ''}
                        onChange={(e) => {
                          const updated = {
                            ...formData,
                            feedback: {
                              ...formData.feedback,
                              sharedFolder: e.target.value,
                            },
                          };
                          setFormData(updated);
                          handleSave(updated);
                        }}
                        placeholder="Zadejte síťovou složku pro sdílenou zpětnou vazbu..."
                        className="flex-1 h-[38px] px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white placeholder-gray-500 text-sm focus:border-indigo-500 outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.electronAPI?.selectFeedbackFolder) {
                            const selected = await window.electronAPI.selectFeedbackFolder();
                            if (selected) {
                              const updated = {
                                ...formData,
                                feedback: {
                                  ...formData.feedback,
                                  sharedFolder: selected,
                                },
                              };
                              setFormData(updated);
                              handleSave(updated);
                            }
                          }
                        }}
                        className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-[13px] font-medium transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px] text-indigo-400 leading-none">folder_open</span>
                        <span>Procházet...</span>
                      </button>
                      {Boolean(formData.feedback?.sharedFolder) && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...formData,
                              feedback: {
                                ...formData.feedback,
                                sharedFolder: '',
                              },
                            };
                            setFormData(updated);
                            handleSave(updated);
                          }}
                          className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-rose-400 hover:text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 transition cursor-pointer shrink-0"
                          title="Vymazat nastavenou složku"
                        >
                          <span className="material-symbols-outlined text-[18px] leading-none">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Crashlogs & Error Diagnostics */}
              <div className="bg-white/[0.03] rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-rose-400">bug_report</span>
                      Chybové protokoly a diagnostika (Crashlogs)
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Automaticky ukládané protokoly chyb ze složky <code className="bg-white/10 px-2 py-0.5 rounded-full text-gray-300 font-mono text-[11px]">crashlog/</code> pro rychlou diagnostiku.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenCrashLogFolder}
                      className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                      title="Otevře složku s crashlogy v Průzkumníku Windows"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">folder_open</span>
                      <span>Otevřít složku</span>
                    </button>
                    {crashLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCrashLogs}
                        className="h-[38px] px-4 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                        title="Vymaže všechny soubory crashlogů"
                      >
                        <span className="material-symbols-outlined text-base text-rose-400">delete_sweep</span>
                        <span>Vymazat</span>
                      </button>
                    )}
                  </div>
                </div>

                {crashLogs.length === 0 ? (
                  <div className="p-5 bg-emerald-500/10 rounded-2xl flex items-center gap-3 text-[13px] text-emerald-300">
                    <span className="material-symbols-outlined text-xl text-emerald-400 shrink-0">check_circle</span>
                    <div>
                      <span className="font-semibold text-emerald-200">Žádné zaznamenané chyby ani pády</span>
                      <p className="text-xs text-emerald-400/80 mt-0.5">Všechny operace a procesy aplikace běží v pořádku bez zachycených výjimek.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(showAllCrashLogs ? crashLogs : crashLogs.slice(0, 5)).map((log) => {
                      const isExpanded = selectedCrashLog?.id === log.id;
                      const isCopied = diagnosticsCopiedId === log.id;
                      const isExported = diagnosticsExportedId === log.id;
                      const isExporting = isExportingCrashId === log.id;
                      return (
                        <div
                          key={log.id}
                          className="bg-white/[0.03] rounded-2xl overflow-hidden text-[13px] transition"
                        >
                          <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-rose-500/10">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className="material-symbols-outlined text-lg text-rose-400 shrink-0 mt-0.5">error</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-white truncate">{log.action}</span>
                                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                                    {log.timestamp}
                                  </span>
                                </div>
                                <p className="text-xs text-rose-200/80 mt-1 truncate max-w-xl font-mono">
                                  {log.errorSnippet}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleCopyCrashLog(log)}
                                className="px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                                title="Zkopíruje celý protokol včetně časové osy do schránky"
                              >
                                <span className={`material-symbols-outlined text-sm ${isCopied ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isCopied ? 'check' : 'content_copy'}
                                </span>
                                <span>{isCopied ? 'Zkopírováno' : 'Kopírovat'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExportCrashLog(log)}
                                disabled={isExporting}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                                  isExported
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-white/[0.06] hover:bg-white/[0.1] text-white'
                                }`}
                                title="Exportuje protokol chyby včetně časové osy akcí do souboru (.txt / .log)"
                              >
                                <span className={`material-symbols-outlined text-sm ${isExported ? 'text-emerald-400' : isExporting ? 'animate-spin text-white' : 'text-rose-400'}`}>
                                  {isExported ? 'check_circle' : isExporting ? 'sync' : 'download'}
                                </span>
                                <span>{isExported ? 'Exportováno' : isExporting ? 'Ukládám...' : 'Exportovat'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedCrashLog(isExpanded ? null : log)}
                                className="px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <span>{isExpanded ? 'Skrýt detail' : 'Detail'}</span>
                                <span className="material-symbols-outlined text-sm text-rose-400">
                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-4 bg-black/40 space-y-2">
                              <div className="flex items-center justify-between text-xs text-gray-400">
                                <span className="font-mono text-[11px] text-gray-400">{log.fileName}</span>
                                <span className="text-[11px] text-gray-500">{log.filePath}</span>
                              </div>
                              <pre className="p-3.5 bg-[#0d0e14] rounded-xl text-[11.5px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 select-text">
                                {log.fullContent}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {crashLogs.length > 5 && (
                      <div className="pt-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllCrashLogs(!showAllCrashLogs)}
                          className="text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1.5 py-2 px-4 rounded-full bg-white/[0.03] hover:bg-white/[0.06] transition cursor-pointer"
                        >
                          <span>
                            {showAllCrashLogs
                              ? 'Zobrazit méně (posledních 5)'
                              : `Ukázat vše (zobrazit všech ${crashLogs.length} protokolů)`}
                          </span>
                          <span className="material-symbols-outlined text-base">
                            {showAllCrashLogs ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Help & Shortcuts */}
          {activeTab === 'help' && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              {/* Top Banner / Button: Jak na zdroje dat */}
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 shrink-0">
                    <span className="material-symbols-outlined text-2xl">menu_book</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Jak na zdroje dat (JSON schémata)</h4>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      Kompletní dokumentace TypeScript modelu, podporované akce, subpoložky, metadata a kopírovatelné ukázky.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDataSourcesGuide(true)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-semibold transition flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">code</span>
                  <span>Jak na zdroje dat</span>
                </button>
              </div>

              {/* Section 1: Shortcuts */}
              <div className="bg-white/[0.02] rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-indigo-400">keyboard</span>
                  Ovládání a klávesové zkratky
                </h4>

                <div className="divide-y divide-white/5 text-[13px]">
                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Otevřít / Spustit položku</span>
                      <p className="text-gray-400 text-xs mt-0.5">Provede výchozí akci (otevření URL, spuštění programu, kopírování výsledku).</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">Enter</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Akce položky</span>
                      <p className="text-gray-400 text-xs mt-0.5">Zobrazí nabídku dostupných akcí položky (např. klonování repozitáře, otevření na GitHubu).</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">Shift + Enter</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Vstup do subpoložek (options)</span>
                      <p className="text-gray-400 text-xs mt-0.5">Rozbalí vnořené subpoložky a volby vybrané položky se samostatným vyhledáváním.</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">Alt + Enter</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Rychlé spuštění 1. subpoložky</span>
                      <p className="text-gray-400 text-xs mt-0.5">Okamžitě provede první subpoložku položky (lze také podržet Ctrl a kliknout myší).</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 text-xs font-semibold whitespace-nowrap">Ctrl + Enter</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Zpět / Zavřít okno</span>
                      <p className="text-gray-400 text-xs mt-0.5">V podpoložkách vás vrátí zpět na původní hledání, v hlavním seznamu skryje IADonkey.</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">Escape</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Pohyb ve výběru položek</span>
                      <p className="text-gray-400 text-xs mt-0.5">Listování nahoru a dolů v seznamu nalezených výsledků.</p>
                    </div>
                    <div className="flex gap-1.5">
                      <kbd className="px-2.5 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">↑</kbd>
                      <kbd className="px-2.5 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">↓</kbd>
                    </div>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Smazání celého textu hledání</span>
                      <p className="text-gray-400 text-xs mt-0.5">Rychle vyprázdní celé vyhledávací pole a vrátí výběr na první položku.</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">Ctrl / Alt + Backspace</kbd>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Listování v informacích položky</span>
                      <p className="text-gray-400 text-xs mt-0.5">Přepínání stránek dodatečných informací v režimu akcí (při více než 6 záznamech).</p>
                    </div>
                    <div className="flex gap-1.5">
                      <kbd className="px-2.5 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">←</kbd>
                      <kbd className="px-2.5 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">→</kbd>
                    </div>
                  </div>

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Zkopírování systémového snippetu</span>
                      <p className="text-gray-400 text-xs mt-0.5">Napište dvojtečku a klíčové slovo (např. :today, :now, :cas, :guid, :podpis) pro zkopírování hodnoty do schránky.</p>
                    </div>
                    <kbd className="px-3 py-1 bg-white/10 rounded-full font-mono text-gray-200 font-semibold whitespace-nowrap">:klicove_slovo</kbd>
                  </div>

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.colorMaster?.enabled === true && !!formData.donkeyTools?.colorMaster?.hotkey?.trim() && (
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">Vyvolání kapátka Eyedropper (ColorMaster)</span>
                        <p className="text-gray-400 text-xs mt-0.5">Spustí systémové kapátko s lupou a nabere barvu do schránky odkudkoliv z Windows.</p>
                      </div>
                      <kbd className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full font-mono font-semibold whitespace-nowrap">
                        {formData.donkeyTools.colorMaster.hotkey}
                      </kbd>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.colorMaster?.enabled === true && !!formData.donkeyTools?.colorMaster?.paletteHotkey?.trim() && (
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">Správa barevných palet PaletteMaster (ColorMaster)</span>
                        <p className="text-gray-400 text-xs mt-0.5">Otevře správce barevných palet ve Spotlightu odkudkoliv z Windows.</p>
                      </div>
                      <kbd className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full font-mono font-semibold whitespace-nowrap">
                        {formData.donkeyTools.colorMaster.paletteHotkey}
                      </kbd>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && ((formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled) === true) && !!(formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey)?.trim() && (
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">Výstřižek obrazovky (QuickCap)</span>
                        <p className="text-gray-400 text-xs mt-0.5">Spustí celoobrazovkový výběr výstřižku s automatickým uložením a zkopírováním do schránky.</p>
                      </div>
                      <kbd className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full font-mono font-semibold whitespace-nowrap">
                        {formData.donkeyTools?.quickCap?.hotkey || formData.donkeyTools?.fastSnap?.hotkey}
                      </kbd>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.screenRuler?.enabled === true && !!formData.donkeyTools?.screenRuler?.hotkey?.trim() && (
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">Měřítko a pravítko (ScreenRuler)</span>
                        <p className="text-gray-400 text-xs mt-0.5">Spustí celoobrazovkové průhledné pravítko pro přesné odměřování rozměrů a pixelů.</p>
                      </div>
                      <kbd className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full font-mono font-semibold whitespace-nowrap">
                        {formData.donkeyTools.screenRuler.hotkey}
                      </kbd>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.easyClip?.enabled !== false && !!formData.donkeyTools?.easyClip?.hotkey?.trim() && (
                    <div className="py-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-white">Historie schránky (EasyClip)</span>
                        <p className="text-gray-400 text-xs mt-0.5">Otevře vyhledávač v režimu správce schránky s historií zkopírovaných textů i obrázků.</p>
                      </div>
                      <kbd className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full font-mono font-semibold whitespace-nowrap">
                        {formData.donkeyTools.easyClip.hotkey}
                      </kbd>
                    </div>
                  )}

                  <div className="py-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-white">Globální vyvolání launcheru</span>
                      <p className="text-gray-400 text-xs mt-0.5">Aktivuje nebo skryje vyhledávací okno odkudkoliv ze systému Windows.</p>
                    </div>
                    <kbd className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full font-mono font-semibold whitespace-nowrap">
                      {formData.hotkey || 'Ctrl+Alt+Space'}
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Section 2: Smart Features */}
              <div className="bg-white/[0.02] rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-indigo-400">auto_awesome</span>
                  Chytré funkce
                </h4>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[13px]">
                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-teal-400 font-semibold">
                      <span className="material-symbols-outlined text-base">content_copy</span>
                      Systémové snippety
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Začněte dotaz dvojtečkou (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">:today</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">:now</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">:cas</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">:guid</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">:podpis</code>). Stiskem Enter se vygenerovaná hodnota zkopíruje do schránky.
                    </p>
                  </div>

                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span className="material-symbols-outlined text-base">calculate</span>
                      Kalkulačka
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Zadejte matematický výraz (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">25 * 4 + 10</code> nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">1200 * 1.21</code>). Stiskem Enter se výsledek zkopíruje do schránky.
                    </p>
                  </div>

                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-blue-400 font-semibold">
                      <span className="material-symbols-outlined text-base">link</span>
                      Rychlé URL
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Napište libovolnou webovou adresu (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">seznam.cz</code>). Stiskem Enter ji rovnou otevřete ve vašem výchozím prohlížeči.
                    </p>
                  </div>

                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-rose-400 font-semibold">
                      <span className="material-symbols-outlined text-base">mail</span>
                      Gmail rychlé psaní
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Zadejte e-mailovou adresu (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">jmeno@company.com</code>). Stiskem Enter okamžitě otevřete okno nové zprávy v Gmailu s vyplněným příjemcem.
                    </p>
                  </div>

                  {formData.extensions?.mlog !== false && !!formData.mlog?.baseUrl?.trim() && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-indigo-400 font-semibold">
                        <span className="material-symbols-outlined text-base">support_agent</span>
                        Taskmanager
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Zadejte kód úkolu (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">{(formData.mlog?.taskPrefix || 'T').toUpperCase()}7821</code>) nebo požadavku (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">{(formData.mlog?.requestPrefix || 'R').toUpperCase()}2345</code>), případně rovnou samotné číslo od 3 číslic (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">123</code>), a vyhledávač nabídne obě možnosti pro přímé otevření v prohlížeči.
                      </p>
                    </div>
                  )}

                  {Boolean(formData.extensions?.magicplan) && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                        <span className="material-symbols-outlined text-base">calendar_month</span>
                        MagicPlan – Plánovač a přehled úkolů
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Interaktivní přehled naplánovaných úkolů z centrálního plánu MagicWare. Zobrazuje vytížení dnů, čerpání hodin, přetížení kapacity, stav rozpracovanosti a automatické notifikace změn. Otevřete příkazem <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/plan</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/magicplan</code> nebo ikonou kalendáře ve Spotlightu.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.magicgate !== false && (!!formData.magicgate?.username?.trim() || !!formData.magicgate?.xmlPath?.trim()) && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-amber-400 font-semibold">
                        <span className="material-symbols-outlined text-base">security</span>
                        MagicGate přihlášení a vyhledávání
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Pro vyhledávání výhradně v instancích MagicGate použijte prefix <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">magicgate:</code> nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">mg:</code> (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">magicgate:</code> pro zobrazení všech instancí nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">magicgate: produkce</code>). U položek se <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">settings: "magicgate"</code> aplikace provede tichý handshake a otevře instanci IS Tour v prohlížeči již plně přihlášenou.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.github !== false && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <span className="material-symbols-outlined text-base">folder_code</span>
                        GitHub repozitáře
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Vyhledejte repozitář podle názvu. Pro vyhledávání výhradně v repozitářích použijte prefix <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">git:</code> (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">git:</code> pro všechny nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">git: iadonkey</code>). Stiskem Enter jej otevřete na GitHubu v prohlížeči, stiskem <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[11px] whitespace-nowrap">Shift+Enter</kbd> otevřete nabídku Akcí pro přímé stažení nebo rekurzivní klonování do zvolené složky.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.vscode && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                        <span className="material-symbols-outlined text-base">code</span>
                        Visual Studio Code
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Pokud existuje repozitář nebo projekt v lokální cílové složce, v nabídce akcí (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[11px] whitespace-nowrap">Shift+Enter</kbd>) jej můžete okamžitě otevřít přímo v editoru VS Code.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.androidStudio && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-pink-400 font-semibold">
                        <span className="material-symbols-outlined text-base">android</span>
                        Android Studio
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Aplikace se nabízí, pokud repozitář z GitHubu používá jazyk Kotlin nebo Java. V nabídce akcí (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[11px] whitespace-nowrap">Shift+Enter</kbd>) nebo v okně klonování jej můžete okamžitě otevřít přímo v Android Studiu.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.colorMaster?.enabled === true && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold">
                        <span className="material-symbols-outlined text-base">palette</span>
                        ColorMaster – Eyedropper & PaletteMaster (DonkeyTools)
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Napište kód barvy přímo do vyhledávání (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">#ff4400</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">rgb(255, 68, 0)</code> nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">hsl(16, 100%, 50%)</code>) pro okamžitý náhled barvy. V nabídce akcí (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[11px] whitespace-nowrap">Shift+Enter</kbd>) ji můžete zkopírovat v libovolném formátu nebo nastavit jako barvu motivu. Systémové kapátko spustíte zkratkou <kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[11px] whitespace-nowrap">{formData.donkeyTools?.colorMaster?.hotkey || 'Shift+Alt+C'}</kbd> nebo příkazy <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/kapatko</code> a <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/eyedropper</code>. Správu barevných palet vyvoláte příkazem <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/palette</code> nebo nastavenou klávesovou zkratkou.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && ((formData.donkeyTools?.quickCap?.enabled ?? formData.donkeyTools?.fastSnap?.enabled) === true) && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold">
                        <span className="material-symbols-outlined text-base">crop</span>
                        QuickCap (DonkeyTools)
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Rychlé pořízení výstřižku libovolné oblasti obrazovky. Snímek se automaticky uloží do vybrané složky a současně vloží do systémové schránky pro okamžité vložení (Ctrl+V). Výstřižek spustíte příkazem <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/quickcap</code>, ikonkou ve Spotlightu nebo nastavenou globální klávesovou zkratkou.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.screenRuler?.enabled === true && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold">
                        <span className="material-symbols-outlined text-base">straighten</span>
                        ScreenRuler (DonkeyTools)
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Přesné měření rozměrů, vzdáleností a pixelů na živé obrazovce. Nabízí obdélníkový výběr nebo celoobrazovkový kříž s kótami k okrajům obrazovky, jednotky px, % a dp s rychlým kopírováním (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">C</kbd>) a zmrazením (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Mezerník</kbd>). Spustíte příkazem <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/screenruler</code>, ikonou ve Spotlightu nebo klávesovou zkratkou.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && formData.donkeyTools?.easyClip?.enabled !== false && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold">
                        <span className="material-symbols-outlined text-base">content_paste</span>
                        EasyClip (DonkeyTools)
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Chytrá historie schránky přímo ve vyhledávači Spotlight s podporou textu i zkopírovaných obrázků. Umožňuje rychlé fulltextové vyhledávání v historii, okamžité vložení (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Enter</kbd>) a smazání položky (<kbd className="bg-white/10 px-2 py-0.5 rounded-full font-mono text-[10px]">Del</kbd>). Spustíte příkazem <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/clip</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/schranka</code>, ikonou ve Spotlightu nebo nastavenou zkratkou.
                      </p>
                    </div>
                  )}

                  {formData.extensions?.donkeyTools && (
                    <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                      <div className="flex items-center gap-2 text-rose-300 font-semibold">
                        <span className="material-symbols-outlined text-base">terminal</span>
                        Příkazy DonkeyTools
                      </div>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Zadejte do vyhledávače lomítko <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/</code> pro zobrazení rychlých příkazů aktivních nástrojů DonkeyTools (např. <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/kapatko</code> pro nabrání barvy, <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">/quickcap</code> pro výstřižek obrazovky).
                      </p>
                    </div>
                  )}

                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-fuchsia-400 font-semibold">
                      <span className="material-symbols-outlined text-base">travel_explore</span>
                      Internetové vyhledávače
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Zadejte libovolný dotaz a na konci seznamu jej otevřete ve zvoleném vyhledávači. Kdykoliv můžete vyhledat přímo s prefixy: <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">g: dotaz</code> (Google), <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">s: dotaz</code> (Seznam), <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">c: dotaz</code> (Centrum) nebo <code className="bg-white/10 px-1.5 py-0.5 rounded-full text-[11px]">w: dotaz</code> (Wikipedie).
                    </p>
                  </div>

                  <div className="p-4 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-1.5 transition-colors">
                    <div className="flex items-center gap-2 text-sky-400 font-semibold">
                      <span className="material-symbols-outlined text-base">apps</span>
                      Programy Windows
                    </div>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      IADonkey nabízí nainstalované programy ze Start Menu s jejich originálními ikonami (priorita 99). Lze kdykoliv vypnout v záložce Obecné.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: Developer Mode */}
          {activeTab === 'develop' && isDevelop && (
            <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
              {/* Header card with status & disable button */}
              <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <span className="material-symbols-outlined text-2xl">bug_report</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">Vývojářský a diagnostický režim</h4>
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold uppercase">
                        Aktivní
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      Zpřístupňuje systémovou konzoli DevTools, generování testovacích crashlogů a kompletní auditní protokol prováděných akcí.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDisableDevelopMode}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-semibold rounded-full text-xs transition flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer shadow-md"
                  title="Vypne vývojářský režim a skryje tuto záložku z menu"
                >
                  <span className="material-symbols-outlined text-base text-black">visibility_off</span>
                  <span>Deaktivovat a skrýt</span>
                </button>
              </div>

              {/* Developer tools action card */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-amber-400">terminal</span>
                    Ladicí a servisní nástroje
                  </h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Přímý přístup k systémovým nástrojům Electronu a ověření funkčnosti diagnostických subsystémů.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* 1. DevTools */}
                  <button
                    type="button"
                    onClick={handleOpenDevTools}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře nebo zavře Chrome DevTools vývojářskou konzoli"
                  >
                    <span className="material-symbols-outlined text-base text-cyan-400">developer_mode</span>
                    <span>Otevřít Chrome DevTools</span>
                  </button>

                  {/* 2. Nová verze, Test instalace, Splash screen */}
                  <button
                    type="button"
                    onClick={onSimulateUpdate}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Vyvolá dialog nové verze se simulovaným průběhem stažení a tlačítkem restartu"
                  >
                    <span className="material-symbols-outlined text-base text-emerald-400">system_update</span>
                    <span>Simulovat novou verzi (stažení)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowInstallerPreview(true)}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře instalátor aplikace v testovacím režimu náhledu (bez zápisu do systému)"
                  >
                    <span className="material-symbols-outlined text-base text-emerald-400">install_desktop</span>
                    <span>Test instalačního průvodce</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.electronAPI?.showSplashScreen?.();
                    }}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Vyvolá úvodní obrazovku (Splash screen) se simulací načítání"
                  >
                    <span className="material-symbols-outlined text-base text-emerald-400">rocket_launch</span>
                    <span>Simulovat Splash screen</span>
                  </button>

                  {/* 3. Ostatní */}
                  <button
                    type="button"
                    onClick={loadDiagnostics}
                    disabled={isLoadingDiagnostics}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    title="Znovu načte záznamy z diagnostické služby na pozadí"
                  >
                    <span className={`material-symbols-outlined text-base ${isLoadingDiagnostics ? 'animate-spin text-indigo-400' : 'text-indigo-400'}`}>
                      refresh
                    </span>
                    <span>Znovu načíst diagnostiku</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowWhatsNew(true)}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře okno Co je nového s přehledem změn aktuální verze"
                  >
                    <span className="material-symbols-outlined text-base text-indigo-400">auto_awesome</span>
                    <span>Zobrazit Release notes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.electronAPI?.openFeedbackWindow?.('dev');
                    }}
                    className="w-full px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 hover:text-amber-100 border border-amber-500/20 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm"
                    title="Otevře okno se všemi nahlášenými podněty, možností řízení priorit, stavů a plánování verzí"
                  >
                    <span className="material-symbols-outlined text-base text-amber-400">rate_review</span>
                    <span>Správce zpětné vazby (DEV režim)</span>
                  </button>

                  {/* GitHub clone simulation dropdown */}
                  <div className="relative w-full" data-sim-dropdown>
                    <button
                      type="button"
                      onClick={() => setOpenSimDropdown((curr) => (curr === 'github' ? null : 'github'))}
                      className={`w-full px-4 py-2 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                        openSimDropdown === 'github' ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10 text-white'
                      }`}
                      title="Otevře nabídku pro simulaci okna GitHub klonování"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">folder_code</span>
                      <span>Simulovat okno GitHub</span>
                      <span className={`ml-auto material-symbols-outlined text-sm text-gray-400 transition-transform duration-200 ${openSimDropdown === 'github' ? 'rotate-180 text-white' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {openSimDropdown === 'github' && (
                      <div className="absolute left-0 top-full mt-1.5 w-full min-w-[260px] bg-[#181926] border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md animate-fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenSimDropdown(null);
                            window.electronAPI?.openGitCloneWindow?.({
                              repoName: 'Demo-Error-Repo',
                              repoUrl: 'https://github.com/magicware/non-existent-repo-demo-error.git',
                            });
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-gray-200 hover:text-rose-200 transition flex items-center gap-2.5 group cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base text-rose-400 group-hover:scale-110 transition-transform">
                            error
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-rose-300">Simulace chyba</span>
                            <span className="text-[10px] text-gray-400 truncate">Demo-Error-Repo</span>
                          </div>
                        </button>

                        {firstGithubRepo && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSimDropdown(null);
                              window.electronAPI?.openGitCloneWindow?.({
                                repoName: firstGithubRepo.repoName,
                                repoUrl: firstGithubRepo.repoUrl,
                              });
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-500/10 text-gray-200 hover:text-emerald-200 transition flex items-center gap-2.5 group cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base text-emerald-400 group-hover:scale-110 transition-transform">
                              check_circle
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-emerald-300">Simulace úspěchu</span>
                              <span className="text-[10px] text-gray-400 truncate" title={firstGithubRepo.repoName}>
                                {firstGithubRepo.repoName}
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* MagicGate repo simulation dropdown */}
                  <div className="relative w-full" data-sim-dropdown>
                    <button
                      type="button"
                      onClick={() => setOpenSimDropdown((curr) => (curr === 'magicgate' ? null : 'magicgate'))}
                      className={`w-full px-4 py-2 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                        openSimDropdown === 'magicgate' ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10 text-white'
                      }`}
                      title="Otevře nabídku pro simulaci okna MagicGate klonování"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">cloud_download</span>
                      <span>Simulovat okno MagicGate repo</span>
                      <span className={`ml-auto material-symbols-outlined text-sm text-gray-400 transition-transform duration-200 ${openSimDropdown === 'magicgate' ? 'rotate-180 text-white' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {openSimDropdown === 'magicgate' && (
                      <div className="absolute left-0 top-full mt-1.5 w-full min-w-[260px] bg-[#181926] border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md animate-fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenSimDropdown(null);
                            window.electronAPI?.openGitCloneWindow?.({
                              repoName: 'Demo-Error-Instance',
                              adminUrl: 'https://demo-error.example.com',
                              isInstanceMode: true,
                            });
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-gray-200 hover:text-rose-200 transition flex items-center gap-2.5 group cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base text-rose-400 group-hover:scale-110 transition-transform">
                            error
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-rose-300">Simulace chyba</span>
                            <span className="text-[10px] text-gray-400 truncate">Demo-Error-Instance</span>
                          </div>
                        </button>

                        {firstMagicGateInstance && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSimDropdown(null);
                              window.electronAPI?.openGitCloneWindow?.({
                                repoName: firstMagicGateInstance.instanceName,
                                adminUrl: firstMagicGateInstance.adminUrl,
                                isInstanceMode: true,
                              });
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-500/10 text-gray-200 hover:text-emerald-200 transition flex items-center gap-2.5 group cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base text-emerald-400 group-hover:scale-110 transition-transform">
                              check_circle
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-emerald-300">Simulace úspěchu</span>
                              <span className="text-[10px] text-gray-400 truncate" title={firstMagicGateInstance.instanceName}>
                                {firstMagicGateInstance.instanceName}
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CMS source codes simulation dropdown */}
                  <div className="relative w-full" data-sim-dropdown>
                    <button
                      type="button"
                      onClick={() => setOpenSimDropdown((curr) => (curr === 'cms' ? null : 'cms'))}
                      className={`w-full px-4 py-2 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
                        openSimDropdown === 'cms' ? 'bg-white/15 text-white ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10 text-white'
                      }`}
                      title="Otevře nabídku pro simulaci stažení CMS zdrojáků"
                    >
                      <span className="material-symbols-outlined text-base text-indigo-400">code</span>
                      <span>Simulovat okno CMS zdrojáky</span>
                      <span className={`ml-auto material-symbols-outlined text-sm text-gray-400 transition-transform duration-200 ${openSimDropdown === 'cms' ? 'rotate-180 text-white' : ''}`}>
                        expand_more
                      </span>
                    </button>

                    {openSimDropdown === 'cms' && (
                      <div className="absolute left-0 top-full mt-1.5 w-full min-w-[260px] bg-[#181926] border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md animate-fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenSimDropdown(null);
                            window.electronAPI?.openCmsDownloadWindow?.({
                              instanceName: 'Demo-Error-Instance',
                              adminUrl: 'https://demo-error.example.com',
                              targetDir: 'C:\\development\\CMSinFS\\Demo-Error-Instance',
                            });
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-gray-200 hover:text-rose-200 transition flex items-center gap-2.5 group cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base text-rose-400 group-hover:scale-110 transition-transform">
                            error
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-rose-300">Simulace chyba</span>
                            <span className="text-[10px] text-gray-400 truncate">Demo-Error-Instance</span>
                          </div>
                        </button>

                        {firstCmsInstance && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSimDropdown(null);
                              window.electronAPI?.openCmsDownloadWindow?.({
                                instanceName: firstCmsInstance.instanceName,
                                adminUrl: firstCmsInstance.adminUrl,
                                targetDir: firstCmsInstance.targetDir,
                              });
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-emerald-500/10 text-gray-200 hover:text-emerald-200 transition flex items-center gap-2.5 group cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base text-emerald-400 group-hover:scale-110 transition-transform">
                              check_circle
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-emerald-300">Simulace úspěchu</span>
                              <span className="text-[10px] text-gray-400 truncate" title={firstCmsInstance.instanceName}>
                                {firstCmsInstance.instanceName}
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        let targetPaletteId = 'demo-palette-developer';
                        if (window.electronAPI?.getPalettes) {
                          const palettes = await window.electronAPI.getPalettes();
                          if (palettes && palettes.length > 0) {
                            targetPaletteId = palettes[0].id;
                          } else if (window.electronAPI?.savePalette) {
                            await window.electronAPI.savePalette({
                              id: targetPaletteId,
                              name: 'Ukázková paleta (Dev)',
                              createdAt: Date.now(),
                              updatedAt: Date.now(),
                              colors: ['#e11d48', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                            });
                          }
                        }
                        window.electronAPI?.openPaletteDetail?.({ paletteId: targetPaletteId });
                      } catch (err) {
                        console.error('Error opening palette detail simulation:', err);
                      }
                    }}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře okno detailu palety PaletteMaster pro simulaci a kontrolu vzhledu"
                  >
                    <span className="material-symbols-outlined text-base text-indigo-400">palette</span>
                    <span>Simulovat okno Detail palety</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.electronAPI?.openTuneColorWindow?.({
                        initialColor: formData.primaryColor || '#6366f1',
                      });
                    }}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře okno doladění barvy ColorMasteru s aktuální primární barvou"
                  >
                    <span className="material-symbols-outlined text-base text-indigo-400">palette</span>
                    <span>Simulovat okno Ladění barvy</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      window.electronAPI?.openPowerWindow?.();
                    }}
                    className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer"
                    title="Otevře okno správy aplikace s možnostmi restartu a ukončení"
                  >
                    <span className="material-symbols-outlined text-base text-indigo-400">power_settings_new</span>
                    <span>Simulovat Správu aplikace</span>
                  </button>

                  {/* 4. Poslední */}
                  <button
                    type="button"
                    onClick={handleSimulateCrash}
                    disabled={isSimulatingCrash}
                    className="w-full px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-white rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    title="Vyvolá simulovanou výjimku pro ověření vytvoření souboru v crashlog/"
                  >
                    <span className={`material-symbols-outlined text-base ${isSimulatingCrash ? 'animate-spin text-rose-400' : 'text-rose-400'}`}>
                      {isSimulatingCrash ? 'sync' : 'report_problem'}
                    </span>
                    <span>{isSimulatingCrash ? 'Generuji...' : 'Vygenerovat testovací crashlog'}</span>
                  </button>
                </div>

                {simulatedCrashSuccess && (
                  <div className="p-3 bg-rose-500/10 rounded-2xl text-xs text-rose-300 flex items-center gap-2 animate-fade-in font-mono">
                    <span className="material-symbols-outlined text-sm text-rose-400 shrink-0">check_circle</span>
                    <span className="truncate">{simulatedCrashSuccess}</span>
                  </div>
                )}

                {testNotificationFeedback && (
                  <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 animate-fade-in font-mono ${testNotificationFeedback.type === 'error' ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                    <span className="material-symbols-outlined text-sm shrink-0">
                      {testNotificationFeedback.type === 'error' ? 'info' : 'check_circle'}
                    </span>
                    <span className="truncate">{testNotificationFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Action Log Section */}
              <div className="p-5 bg-white/[0.03] rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-amber-400">receipt_long</span>
                      Protokol prováděných akcí (Action Log)
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Průběžný auditní záznam posledních 50 spuštěných položek, nabídek, klávesových zkratek a systémových operací zaznamenávaný na pozadí pro crashlogy.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {actionLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearActionLogs}
                        className="h-[38px] px-4 bg-white/[0.06] hover:bg-rose-500/20 text-gray-300 hover:text-rose-200 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-sm shrink-0"
                        title="Vymaže historii akcí"
                      >
                        <span className="material-symbols-outlined text-base text-rose-500">delete</span>
                        <span>Vyčistit</span>
                      </button>
                    )}
                  </div>
                </div>

                {actionLogs.length === 0 ? (
                  <div className="p-4 bg-white/[0.02] rounded-2xl text-center text-gray-400 text-xs py-6">
                    Zatím nebyly zaznamenány žádné akce od spuštění aplikace.
                  </div>
                ) : (
                  <div className="rounded-2xl overflow-hidden bg-black/20">
                    <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                      {(showAllActionLogs ? actionLogs : actionLogs.slice(0, 5)).map((entry) => {
                        let badgeBg = 'bg-indigo-500/10 text-indigo-300';
                        let iconName = 'info';
                        let iconColor = 'text-indigo-400';

                        if (entry.status === 'success') {
                          badgeBg = 'bg-emerald-500/10 text-emerald-300';
                          iconName = 'check_circle';
                          iconColor = 'text-emerald-400';
                        } else if (entry.status === 'error') {
                          badgeBg = 'bg-rose-500/10 text-rose-300';
                          iconName = 'error';
                          iconColor = 'text-rose-400';
                        } else if (entry.status === 'warn') {
                          badgeBg = 'bg-amber-500/10 text-amber-300';
                          iconName = 'warning';
                          iconColor = 'text-amber-400';
                        }

                        if (entry.type === 'color-picker' || entry.type === 'color-master') {
                          iconName = 'colorize';
                          iconColor = 'text-rose-400';
                        } else if (entry.type === 'shortcut') {
                          iconName = 'keyboard';
                          iconColor = 'text-cyan-400';
                        } else if (entry.type === 'options') {
                          iconName = 'account_tree';
                          iconColor = 'text-amber-400';
                        } else if (entry.type === 'window') {
                          iconName = 'settings';
                          iconColor = 'text-purple-400';
                        } else if (entry.type === 'sync') {
                          iconName = 'sync';
                          iconColor = 'text-blue-400';
                        } else if (entry.type === 'ui') {
                          iconName = 'touch_app';
                          iconColor = 'text-teal-400';
                        }

                        return (
                          <div key={entry.id} className="p-2.5 px-3.5 flex items-start justify-between gap-3 text-xs hover:bg-white/[0.02] transition">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className={`material-symbols-outlined text-base ${iconColor} shrink-0 mt-0.5`}>{iconName}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-200">{entry.title}</span>
                                  <span className={`px-2.5 py-0.5 text-[10px] rounded-full font-medium ${badgeBg}`}>
                                    {entry.type}
                                  </span>
                                </div>
                                {entry.details && (
                                  <p className="text-[11.5px] text-gray-400 mt-0.5 truncate max-w-xl font-mono">
                                    {entry.details}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className="text-[11px] text-gray-500 whitespace-nowrap font-mono shrink-0">
                              {entry.timestamp}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {actionLogs.length > 5 && (
                      <div className="p-2.5 bg-white/[0.02] flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllActionLogs(!showAllActionLogs)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 py-1.5 px-4 rounded-full bg-white/[0.03] hover:bg-white/[0.06] transition cursor-pointer"
                        >
                          <span>
                            {showAllActionLogs
                              ? 'Zobrazit méně (posledních 5)'
                              : `Ukázat vše (zobrazit všech ${actionLogs.length} záznamů)`}
                          </span>
                          <span className="material-symbols-outlined text-base">
                            {showAllActionLogs ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MagicPlan Dev Diagnostics Section */}
              {Boolean(formData.extensions?.magicplan) && (
                <div className="p-5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-4 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-amber-400">calendar_month</span>
                        <span>MagicPlan – Lokální mezipaměť a audit dotazů</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold uppercase tracking-wider">
                          EXTENZE
                        </span>
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Přehled lokálně uložených a interpretovaných dat úkolů a historie posledních 10 síťových dotazů pro porovnávání změn a odchylek.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleForceMagicPlanQuery}
                        disabled={isRefreshingMagicPlanLogs}
                        className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Okamžitě provede síťový dotaz a znovu interpretuje data plánu"
                      >
                        <span className={`material-symbols-outlined text-base ${isRefreshingMagicPlanLogs ? 'animate-spin' : ''}`}>
                          sync
                        </span>
                        <span>{isRefreshingMagicPlanLogs ? 'Dotazuji...' : 'Vynutit dotaz nyní'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={fetchMagicPlanDevLogs}
                        disabled={isRefreshingMagicPlanLogs}
                        className="p-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full transition flex items-center justify-center cursor-pointer disabled:opacity-50"
                        title="Znovu načíst lokální záznamy mezipaměti"
                      >
                        <span className="material-symbols-outlined text-base">refresh</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric Chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="p-3 bg-white/[0.02] rounded-xl">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider block font-medium">Moje úkoly</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-bold font-mono text-amber-400">
                          {magicPlanDevLogs?.cachedData?.myTasks?.length || 0}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({magicPlanDevLogs?.cachedData?.totalHours || 0} h)
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-white/[0.02] rounded-xl">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider block font-medium">Nezařazené (Fronta)</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-bold font-mono text-amber-400">
                          {magicPlanDevLogs?.cachedData?.unassignedTasks?.length || 0}
                        </span>
                        <span className="text-xs text-gray-400">úkolů</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white/[0.02] rounded-xl">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider block font-medium">Disková mezipaměť</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-xl font-bold font-mono text-amber-400">
                          {Object.keys(magicPlanDevLogs?.diskCache?.tasks || {}).length}
                        </span>
                        <span className="text-xs text-gray-400">otisků</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white/[0.02] rounded-xl">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wider block font-medium">Poslední synchronizace</span>
                      <div className="mt-1 truncate">
                        <span className="text-xs font-mono text-gray-300">
                          {magicPlanDevLogs?.cachedData?.lastUpdated
                            ? new Date(magicPlanDevLogs.cachedData.lastUpdated).toLocaleTimeString()
                            : 'Zatím neproběhla'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Standard Tab Switcher */}
                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] rounded-full w-fit">
                      {[
                        { id: 'tasks', name: `Interpretované úkoly (${magicPlanDevLogs?.cachedData?.myTasks?.length || 0})`, icon: 'checklist' },
                        { id: 'history', name: `Historie dotazů (${magicPlanDevLogs?.history?.length || 0}/10)`, icon: 'history' },
                        { id: 'raw', name: 'Surový JSON', icon: 'data_object' },
                      ].map((tab) => {
                        const isActive = magicPlanDevTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setMagicPlanDevTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                              isActive
                                ? 'bg-amber-500/20 text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <span className={`material-symbols-outlined text-base ${isActive ? 'text-amber-400' : ''}`}>
                              {tab.icon}
                            </span>
                            <span>{tab.name}</span>
                          </button>
                        );
                      })}
                    </div>

                    {magicPlanDevTab === 'raw' && (
                      <button
                        type="button"
                        onClick={handleCopyMagicPlanJson}
                        className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-sm">
                          {magicPlanCopied ? 'check' : 'content_copy'}
                        </span>
                        <span>{magicPlanCopied ? 'Zkopírováno' : 'Kopírovat JSON'}</span>
                      </button>
                    )}
                  </div>

                  {/* Panel Content */}
                  {magicPlanDevTab === 'tasks' && (
                    <div className="space-y-2">
                      {(!magicPlanDevLogs?.cachedData?.myTasks || magicPlanDevLogs.cachedData.myTasks.length === 0) ? (
                        <div className="p-6 text-center text-xs text-gray-500 bg-white/[0.02] rounded-xl">
                          V mezipaměti nejsou uloženy žádné interpretované úkoly. Zkontrolujte nastavení adresy nebo spusťte dotaz.
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                          {magicPlanDevLogs.cachedData.myTasks.map((task: any, idx: number) => (
                            <div key={task.taskId || idx} className="p-3 bg-white/[0.02] hover:bg-white/[0.04] rounded-xl flex items-start justify-between gap-3 text-xs transition-colors">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {task.requirementId && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono text-[11px] font-semibold">
                                      {task.requirementId}
                                    </span>
                                  )}
                                  {task.taskIdentifier && (
                                    <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300 font-mono text-[11px] font-semibold">
                                      {task.taskIdentifier}
                                    </span>
                                  )}
                                  <span className="text-gray-200 font-medium truncate">{task.title}</span>
                                </div>
                                <div className="flex items-center gap-3 text-gray-400 text-[11px]">
                                  {task.project && <span>Projekt: <strong className="text-gray-300">{task.project}</strong></span>}
                                  {task.status && <span>Stav: <strong className="text-gray-300">{task.status}</strong></span>}
                                  {task.assignedTo && <span>Přiřazeno: <strong className="text-gray-300">{task.assignedTo}</strong></span>}
                                  {task.date && <span>Termín: <strong className="text-gray-300">{task.date}</strong></span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-amber-400 font-mono font-bold text-xs bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                                  {task.hours} h
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {magicPlanDevTab === 'history' && (
                    <div className="space-y-2">
                      {(!magicPlanDevLogs?.history || magicPlanDevLogs.history.length === 0) ? (
                        <div className="p-6 text-center text-xs text-gray-500 bg-white/[0.02] rounded-xl">
                          Zatím neproběhl žádný síťový dotaz nebo služba ještě nezaznamenala běh. Klikněte na &quot;Vynutit dotaz nyní&quot;.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {magicPlanDevLogs.history.map((query: any, qIdx: number) => {
                            const isExpanded = expandedQueryId === query.id;
                            const isSuccess = query.status === 'success';
                            const hasDiffs = (query.newTasks?.length > 0) || (query.completedTasks?.length > 0) || (query.changedTasks?.length > 0);

                            return (
                              <div
                                key={query.id || qIdx}
                                className={`rounded-xl transition-colors ${
                                  isSuccess
                                    ? 'bg-white/[0.02] hover:bg-white/[0.04]'
                                    : 'bg-rose-500/[0.06] hover:bg-rose-500/[0.09]'
                                }`}
                              >
                                <div
                                  onClick={() => setExpandedQueryId(isExpanded ? null : query.id)}
                                  className="p-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider ${
                                        isSuccess
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : 'bg-rose-500/20 text-rose-300'
                                      }`}
                                    >
                                      {isSuccess ? '200 OK' : 'CHYBA'}
                                    </span>

                                    <span className="text-xs text-gray-300 font-mono">
                                      {new Date(query.timestamp).toLocaleTimeString()}
                                    </span>

                                    <span className="text-[11px] text-gray-400 font-mono">
                                      {query.durationMs} ms
                                    </span>

                                    <span className="text-[11px] text-gray-500 font-mono">
                                      {(query.htmlLength / 1024).toFixed(1)} KB
                                    </span>

                                    {/* Diffs tags */}
                                    <div className="flex items-center gap-1.5 ml-1">
                                      {query.newTasks?.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                                          +{query.newTasks.length} nových
                                        </span>
                                      )}
                                      {query.completedTasks?.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-[10px] font-semibold">
                                          -{query.completedTasks.length} dokončeno
                                        </span>
                                      )}
                                      {query.changedTasks?.length > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-semibold">
                                          ~{query.changedTasks.length} upraveno
                                        </span>
                                      )}
                                      {!hasDiffs && isSuccess && (
                                        <span className="text-[10px] text-gray-500 font-mono">
                                          0 změn
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-gray-400 font-mono">
                                      {query.myTasksCount || 0} úkolů ({query.totalHours || 0} h)
                                    </span>
                                    <span className="material-symbols-outlined text-base text-gray-400">
                                      {isExpanded ? 'expand_less' : 'expand_more'}
                                    </span>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="px-3 pb-3 pt-1 space-y-2.5 text-xs animate-fade-in">
                                    {query.error && (
                                      <div className="p-2.5 bg-rose-500/15 rounded-xl text-rose-300 font-mono text-[11px]">
                                        Chyba: {query.error}
                                      </div>
                                    )}

                                    <div className="text-[11px] text-gray-400">
                                      <span>Dotazovaná adresa: </span>
                                      <code className="text-gray-300 bg-white/5 px-2 py-0.5 rounded-full font-mono break-all">
                                        {query.url || 'Výchozí konfigurace'}
                                      </code>
                                    </div>

                                    {query.myTasks && query.myTasks.length > 0 && (
                                      <div className="space-y-1">
                                        <span className="text-[11px] text-gray-400 uppercase tracking-wider block font-medium">
                                          Nalezené úkoly v tomto dotazu ({query.myTasks.length}):
                                        </span>
                                        <div className="max-h-48 overflow-y-auto space-y-1 bg-black/20 p-2.5 rounded-xl font-mono text-[11px]">
                                          {query.myTasks.map((t: any, tidx: number) => (
                                            <div key={tidx} className="flex items-center justify-between text-gray-300 py-0.5">
                                              <span className="truncate pr-2">
                                                <span className="text-amber-400 font-semibold">{t.requirementId || t.taskIdentifier || `#${tidx+1}`}</span>: {t.title}
                                              </span>
                                              <span className="shrink-0 text-amber-300">{t.hours} h</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {magicPlanDevTab === 'raw' && (
                    <div className="bg-white/[0.02] rounded-xl p-3 max-h-80 overflow-y-auto font-mono text-[11px] text-gray-300 leading-relaxed">
                      <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify(magicPlanDevLogs || { status: 'žádná data' }, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* What's New Modal (Latest Release Notes) */}
      {showWhatsNew && (
        <WhatsNewModal
          release={getLatestRelease()}
          onDismiss={() => setShowWhatsNew(false)}
          onOpenFullChangelog={() => {
            setShowWhatsNew(false);
            setShowChangelog(true);
          }}
        />
      )}

      {/* Full Changelog Modal */}
      {showChangelog && (
        <ChangelogModal onClose={() => setShowChangelog(false)} />
      )}

      {/* Search Items Viewer Modal */}
      {showItemsViewer && (
        <SearchItemsViewerModal
          isOpen={showItemsViewer}
          onClose={() => setShowItemsViewer(false)}
          items={items}
          sources={formData.sources}
          snippetsConfig={formData.snippets}
          banlist={formData.banlist || []}
          onBanItem={handleBanItem}
          onUnbanItem={handleUnbanItem}
        />
      )}

      {/* Data Sources Guide Modal */}
      {showDataSourcesGuide && (
        <DataSourcesGuideModal
          isOpen={showDataSourcesGuide}
          onClose={() => setShowDataSourcesGuide(false)}
          magicGateEnabled={formData.extensions?.magicgate !== false}
          githubEnabled={formData.extensions?.github !== false}
        />
      )}

      {/* Installer Wizard Preview Modal */}
      {showInstallerPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 window-modal-overlay">
          <div className="w-[940px] h-[640px] max-w-full max-h-full rounded-[28px] overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <InstallerWizard previewMode={true} onClose={() => setShowInstallerPreview(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
