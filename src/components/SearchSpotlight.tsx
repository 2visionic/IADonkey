import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DISPLAY_APP_VERSION, IS_DEV } from '../changelog';
import { LauncherItem, LauncherAction, SyncProgress, SnippetsConfig, ColorMasterSettings, QuickCapSettings, FastSnapSettings, ScreenRulerSettings, EasyClipSettings, EasyClipItem, ColorPalette, AppConfig, MagicPlanSettings, MagicPlanData, PlanTaskItem, LauncherWizard, WizardStep, WizardOption, SsmsSettings, DataSource, FileSource, ApiSource, StaticSource } from '../types';
import { MaterialIcon } from './MaterialIcon';
import { evaluateExpression } from '../utils/calculator';
import { detectUrl } from '../utils/urlHelper';
import { detectMlogTicket } from '../utils/mlog';
import { detectEmail } from '../utils/gmail';
import { getDynamicSnippets } from '../utils/snippets';
import { formatLastSyncDate } from '../utils/dateHelper';
import { SEARCH_ENGINES } from '../constants/searchEngines';
import { removeDiacritics } from '../utils/text';
import {
  parseColorQuery,
  createColorLauncherItem,
  getDonkeyToolsCommands,
  pickScreenColor,
  formatColorValue,
} from '../utils/colorMaster';
import { applyPrimaryColor, applyActionsColor } from '../utils/theme';
import { isTaskForUser } from './MagicPlanWindow';

export const SOURCE_ITEM_WIZARD_DEFINITION: LauncherWizard = {
  action: 'savesourceitem',
  steps: [
    {
      id: 'name',
      title: 'Název záznamu',
      placeholder: 'Zadejte název položky (např. Dynamiclist, Můj skript)...',
      icon: 'edit',
      required: true,
      type: 'text',
    },
    {
      id: 'action',
      title: 'Typ akce',
      placeholder: 'Vyberte akci při spuštění položky (šipky ↑/↓ a Enter)...',
      icon: 'touch_app',
      required: true,
      type: 'select',
      options: [
        { text: 'Zkopírovat do schránky (kód / text)', value: 'copy', icon: 'content_copy', color: '#10b981', description: 'Vhodné pro code snippety, šablony a texty' },
        { text: 'Otevřít odkaz nebo soubor', value: 'open', icon: 'open_in_new', color: '#0ea5e9', description: 'Otevře webovou adresu nebo spustí soubor na disku' },
        { text: 'Otevřít ve VS Code', value: 'vscode', icon: 'code', color: '#38bdf8', description: 'Otevře složku nebo soubor ve Visual Studio Code' },
      ],
    },
    {
      id: 'location',
      title: 'Obsah / Cíl / Odkaz',
      placeholder: 'Zadejte text, kód, URL nebo vyberte ze schránky...',
      icon: 'link',
      required: true,
      type: 'text',
      dynamicOption: 'clipboard',
    },
    {
      id: 'icon',
      title: 'Ikona',
      placeholder: 'Zvolte ikonu pro zobrazení...',
      icon: 'star',
      required: false,
      type: 'select',
      options: [
        { text: 'Kód (code)', value: 'code', icon: 'code', color: '#38bdf8' },
        { text: 'Text / Šablona (description)', value: 'description', icon: 'description', color: '#a855f7' },
        { text: 'Odkaz (link)', value: 'link', icon: 'link', color: '#0ea5e9' },
        { text: 'Terminál (terminal)', value: 'terminal', icon: 'terminal', color: '#10b981' },
        { text: 'Složka (folder)', value: 'folder', icon: 'folder', color: '#f59e0b' },
        { text: 'Databáze (database)', value: 'database', icon: 'database', color: '#ec4899' },
        { text: 'Záložka (bookmark)', value: 'bookmark', icon: 'bookmark', color: '#eab308' },
        { text: 'Hvězda (star)', value: 'star', icon: 'star', color: '#f97316' },
      ],
    },
  ],
};

export const SOURCE_CREATE_WIZARD_DEFINITION: LauncherWizard = {
  action: 'createsource',
  steps: [
    {
      id: 'type',
      title: 'Typ nového zdroje',
      placeholder: 'Zvolte typ datového zdroje (šipky ↑/↓ a Enter)...',
      icon: 'category',
      required: true,
      type: 'select',
      options: [
        { text: 'Lokální JSON soubor', value: 'file', icon: 'description', color: '#38bdf8', description: 'Ukládá a čte položky ze souboru na disku' },
        { text: 'Statický interní seznam', value: 'static', icon: 'database', color: '#10b981', description: 'Ukládá položky přímo do konfigurace IADonkey' },
        { text: 'Vzdálené REST API', value: 'api', icon: 'cloud', color: '#a855f7', description: 'Stahuje položky z HTTP endpointu (read-only)' },
      ],
    },
    {
      id: 'name',
      title: 'Název zdroje',
      placeholder: 'Zadejte název zdroje (např. MW Code Snippet, Osobní zkratky)...',
      icon: 'edit',
      required: true,
      type: 'text',
    },
    {
      id: 'pathOrUrl',
      title: 'Cesta k souboru nebo URL adresa',
      placeholder: 'Zadejte absolutní cestu k .json souboru nebo URL adresu...',
      icon: 'link',
      required: true,
      type: 'text',
    },
  ],
};

export const FEEDBACK_WIZARD_DEFINITION: LauncherWizard = {
  action: 'createfeedback',
  openWindowAfter: true,
  steps: [
    {
      id: 'title',
      title: 'Název podnětu',
      placeholder: 'Zadejte stručný a výstižný název...',
      icon: 'edit',
      required: true,
      type: 'text',
    },
    {
      id: 'type',
      title: 'Typ podnětu',
      placeholder: 'Vyberte typ podnětu (šipky ↑/↓ a Enter)...',
      icon: 'category',
      required: true,
      type: 'select',
      options: [
        { text: 'Chyba', value: 'bug', icon: 'bug_report', color: '#f43f5e', description: 'Něco nefunguje správně nebo došlo k chybě' },
        { text: 'Nápad', value: 'idea', icon: 'lightbulb', color: '#a855f7', description: 'Návrh na novou funkci nebo vylepšení' },
        { text: 'Dotaz', value: 'other', icon: 'chat', color: '#0ea5e9', description: 'Obecný dotaz, nejasnost nebo připomínka' },
      ],
    },
    {
      id: 'priority',
      title: 'Priorita',
      placeholder: 'Zvolte prioritu podnětu...',
      icon: 'flag',
      required: true,
      type: 'select',
      options: [
        { text: 'Nízká', value: 'low', icon: 'arrow_downward', color: '#9ca3af', description: 'Drobnost, nespěchá' },
        { text: 'Normální', value: 'normal', icon: 'remove', color: '#818cf8', description: 'Standardní priorita pro řešení' },
        { text: 'Vysoká', value: 'high', icon: 'arrow_upward', color: '#f59e0b', description: 'Významná překážka v práci' },
        { text: 'Kritická', value: 'critical', icon: 'priority_high', color: '#f43f5e', description: 'Blokující problém, nelze pokračovat' },
      ],
    },
    {
      id: 'description',
      title: 'Podrobný popis',
      placeholder: 'Zadejte detailnější popis (Enter pro přeskočení)...',
      icon: 'description',
      required: false,
      type: 'text',
    },
    {
      id: 'screenshot',
      title: 'Snímek obrazovky ze schránky',
      placeholder: 'Vyberte snímek ze schránky nebo stiskněte Enter pro přeskočení...',
      icon: 'photo_library',
      required: false,
      type: 'select',
      dynamicOption: 'clipboard',
      settings: 'screens',
    },
  ],
};

export const GITHUB_CREATE_REPO_WIZARD_DEFINITION: LauncherWizard = {
  action: 'creategithubrepo',
  steps: [
    {
      id: 'owner',
      title: 'Vlastník repozitáře',
      placeholder: 'Vyberte účet nebo organizaci (šipky ↑/↓ a Enter)...',
      icon: 'corporate_fare',
      required: true,
      type: 'select',
      dynamicOption: 'github-owners',
    },
    {
      id: 'name',
      title: 'Název repozitáře',
      placeholder: 'Zadejte název nového repozitáře (např. muj-projekt)...',
      icon: 'folder_code',
      required: true,
      type: 'text',
    },
    {
      id: 'description',
      title: 'Popis repozitáře',
      placeholder: 'Zadejte krátký popis repozitáře (Enter pro přeskočení)...',
      icon: 'description',
      required: false,
      type: 'text',
    },
    {
      id: 'visibility',
      title: 'Viditelnost',
      placeholder: 'Zvolte viditelnost repozitáře...',
      icon: 'lock',
      required: true,
      type: 'select',
      options: [
        {
          text: 'Soukromý (Private)',
          value: 'private',
          icon: 'lock',
          color: '#f59e0b',
          description: 'Viditelný pouze pro vás nebo členy organizace',
        },
        {
          text: 'Veřejný (Public)',
          value: 'public',
          icon: 'public',
          color: '#10b981',
          description: 'Veřejně přístupný repozitář na internetu',
        },
      ],
    },
    {
      id: 'autoInit',
      title: 'Inicializace repozitáře',
      placeholder: 'Zvolte výchozí stav repozitáře...',
      icon: 'article',
      required: true,
      type: 'select',
      options: [
        {
          text: 'S úvodním README.md',
          value: 'true',
          icon: 'article',
          color: '#818cf8',
          description: 'Vytvoří výchozí větev main s README.md (ihned připraveno ke klonování)',
        },
        {
          text: 'Prázdný repozitář (bez souborů)',
          value: 'false',
          icon: 'folder_open',
          color: '#9ca3af',
          description: 'Vhodné pro napojení existujícího lokálního Gitu (git remote add origin)',
        },
      ],
    },
    {
      id: 'afterAction',
      title: 'Akce po vytvoření',
      placeholder: 'Co udělat po založení repozitáře...',
      icon: 'rocket_launch',
      required: true,
      type: 'select',
      options: [
        {
          text: 'Naklonovat na disk (otevřít Git Clone okno)',
          value: 'clone',
          icon: 'download',
          color: '#a855f7',
          description: 'Otevře dialog pro naklonování repozitáře do výchozí složky',
        },
        {
          text: 'Otevřít repozitář na GitHubu v prohlížeči',
          value: 'open',
          icon: 'open_in_new',
          color: '#38bdf8',
          description: 'Otevře stránku nového repozitáře ve výchozím prohlížeči',
        },
        {
          text: 'Zkopírovat Clone URL do schránky',
          value: 'copy',
          icon: 'content_copy',
          color: '#10b981',
          description: 'Zkopíruje HTTPS .git adresu repozitáře do systémové schránky',
        },
      ],
    },
  ],
};

/**
 * Resolves the icon for a wizard step applying fallback rules:
 * 1) Explicit step icon
 * 2) dynamicOption === 'clipboard' && settings === 'screens' -> 'photo_library'
 * 3) any dynamicOption -> 'dynamic_form'
 * 4) type === 'select' -> 'category'
 * 5) type === 'text' (or fallback) -> 'edit'
 */
export const getWizardStepIcon = (step?: WizardStep, fallbackParentIcon?: string): string => {
  if (step?.icon?.trim()) return step.icon.trim();

  if (step?.dynamicOption === 'clipboard' && step?.settings === 'screens') {
    return 'photo_library';
  }

  if (step?.dynamicOption) {
    return 'dynamic_form';
  }

  if (step?.type === 'select') {
    return 'category';
  }

  if (step?.type === 'text') {
    return 'edit';
  }

  return fallbackParentIcon || 'edit';
};

/**
 * Resolves the icon for a wizard step option applying fallback rules:
 * 1) Explicit option icon
 * 2) dynamicOption === 'clipboard' && settings === 'screens' -> 'image'
 * 3) any dynamicOption -> 'cards_star'
 * 4) type === 'select' -> 'cards_stack'
 */
export const getWizardOptionIcon = (step?: WizardStep, opt?: WizardOption): string => {
  if (opt?.icon?.trim()) return opt.icon.trim();

  if (step?.dynamicOption === 'clipboard' && step?.settings === 'screens') {
    return 'image';
  }

  if (step?.dynamicOption) {
    return 'cards_star';
  }

  if (step?.type === 'select') {
    return 'cards_stack';
  }

  return 'check_circle';
};

type PaletteListItem =
  | { type: 'add' }
  | { type: 'palette'; palette: ColorPalette };

interface SearchSpotlightProps {
  items: LauncherItem[];
  mlogBaseUrl?: string;
  mlogTaskPrefix?: string;
  mlogRequestPrefix?: string;
  searchGoogle?: boolean;
  defaultSearchEngine?: string;
  githubEnabled?: boolean;
  hasGithubCredentials?: boolean;
  defaultCloneDir?: string;
  instanceSourceCodesPath?: string;
  vscodeEnabled?: boolean;
  androidStudioEnabled?: boolean;
  ssmsEnabled?: boolean;
  ssmsConfig?: SsmsSettings;
  magicgateEnabled?: boolean;
  ftpEnabled?: boolean;
  allowFtpWithoutSlash?: boolean;
  donkeyToolsEnabled?: boolean;
  colorMasterConfig?: ColorMasterSettings;
  quickCapConfig?: QuickCapSettings;
  fastSnapConfig?: FastSnapSettings;
  screenRulerConfig?: ScreenRulerSettings;
  easyClipConfig?: EasyClipSettings;
  magicPlanEnabled?: boolean;
  magicPlanConfig?: MagicPlanSettings;
  onSaveConfig?: (newConfig: AppConfig) => Promise<void>;
  onOpenSettings: () => void;
  onRefreshData: () => void;
  isSyncing?: boolean;
  syncProgress?: SyncProgress | null;
  lastSyncTime?: string | null;
  snippets?: SnippetsConfig;
  sources?: DataSource[];
}

const INFO_ITEMS_PER_PAGE = 4; // 2x2 grid (2 columns x 2 rows)

export const SearchSpotlight: React.FC<SearchSpotlightProps> = ({
  items,
  mlogBaseUrl,
  mlogTaskPrefix,
  mlogRequestPrefix,
  searchGoogle = true,
  defaultSearchEngine = 'google',
  githubEnabled = false,
  hasGithubCredentials = false,
  defaultCloneDir,
  instanceSourceCodesPath,
  vscodeEnabled = false,
  androidStudioEnabled = false,
  ssmsEnabled = false,
  ssmsConfig,
  magicgateEnabled = false,
  ftpEnabled = true,
  allowFtpWithoutSlash = false,
  donkeyToolsEnabled = false,
  colorMasterConfig,
  quickCapConfig,
  fastSnapConfig,
  screenRulerConfig,
  easyClipConfig,
  magicPlanEnabled = false,
  magicPlanConfig,
  onSaveConfig,
  onOpenSettings,
  onRefreshData,
  isSyncing = false,
  syncProgress,
  lastSyncTime,
  snippets,
  sources = [],
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [parentItem, setParentItem] = useState<LauncherItem | null>(null);
  const [actionsParentItem, setActionsParentItem] = useState<LauncherItem | null>(null);
  const [selectedActionIndex, setSelectedActionIndex] = useState<number>(0);
  const [infoPage, setInfoPage] = useState<number>(0);
  const [existingClonedRepos, setExistingClonedRepos] = useState<Set<string>>(new Set());
  const [instanceSubRepos, setInstanceSubRepos] = useState<Record<string, Array<{ name: string; path: string }>>>({});
  const [localDatabases, setLocalDatabases] = useState<string[]>([]);
  const [copiedInfoKey, setCopiedInfoKey] = useState<string | null>(null);
  const [savedQueryBeforeSubitems, setSavedQueryBeforeSubitems] = useState<string>('');
  const [savedIndexBeforeSubitems, setSavedIndexBeforeSubitems] = useState<number>(0);
  const restoringIndexRef = useRef<number | null>(null);
  const savedParentItemRef = useRef<LauncherItem | null>(null);
  const [engineFavicons, setEngineFavicons] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [settingsHoldProgress, setSettingsHoldProgress] = useState<number>(0);
  const settingsHoldStartRef = useRef<number>(0);
  const settingsHoldRafRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

  const [isDonkeyToolsOpen, setIsDonkeyToolsOpen] = useState(false);
  const donkeyToolsRef = useRef<HTMLDivElement>(null);

  const [isEasyClipMode, setIsEasyClipMode] = useState(false);
  const [easyClipItems, setEasyClipItems] = useState<EasyClipItem[]>([]);
  const [easyClipSelectedIndex, setEasyClipSelectedIndex] = useState<number>(0);
  const [selectedEasyClipIds, setSelectedEasyClipIds] = useState<Set<string>>(new Set());
  const easyClipAnchorRef = useRef<number>(0);
  const isEyedropperRef = useRef<boolean>(false);

  const [isPaletteMode, setIsPaletteMode] = useState(false);
  const [isCreatingPalette, setIsCreatingPalette] = useState(false);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [paletteSelectedIndex, setPaletteSelectedIndex] = useState<number>(0);

  const [magicPlanData, setMagicPlanData] = useState<MagicPlanData | null>(null);
  const [isOpeningMagicPlan, setIsOpeningMagicPlan] = useState(false);

  // Wizard (Stepper) states
  const [wizardItem, setWizardItem] = useState<LauncherItem | null>(null);
  const [wizardStepIndex, setWizardStepIndex] = useState<number>(0);
  const [wizardValues, setWizardValues] = useState<Record<string, any>>({});
  const [wizardSelectedOptionIndex, setWizardSelectedOptionIndex] = useState<number>(0);
  const [wizardDynamicOptions, setWizardDynamicOptions] = useState<WizardOption[]>([]);
  const [isWizardLoadingDynamic, setIsWizardLoadingDynamic] = useState<boolean>(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [isSubmittingWizard, setIsSubmittingWizard] = useState<boolean>(false);
  const [currentMagicPlanConfig, setCurrentMagicPlanConfig] = useState<MagicPlanSettings | undefined>(magicPlanConfig);

  useEffect(() => {
    if (magicPlanConfig) {
      setCurrentMagicPlanConfig(magicPlanConfig);
    }
  }, [magicPlanConfig]);

  // Strict opt-in rule: SSMS actions & /db commands are ONLY active when SSMS extension is enabled AND Ssms.exe path is configured
  const isSsmsActive = Boolean(ssmsEnabled && ssmsConfig?.path?.trim());

  const refreshLocalDatabases = (force: boolean = false) => {
    if (!isSsmsActive || !window.electronAPI?.getLocalDatabases) return;
    const srv = ssmsConfig?.localServer?.trim() || 'localhost';
    window.electronAPI.getLocalDatabases(srv, force).then((res) => {
      if (res && Array.isArray(res.databases)) {
        setLocalDatabases(res.databases);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    if (isSsmsActive) {
      refreshLocalDatabases(false);
    } else {
      setLocalDatabases([]);
    }
  }, [isSsmsActive, ssmsConfig?.localServer]);

  const isColorMasterActive = Boolean(donkeyToolsEnabled && colorMasterConfig?.enabled === true);
  const isQuickCapActive = Boolean(donkeyToolsEnabled && (quickCapConfig?.enabled === true || fastSnapConfig?.enabled === true));
  const isScreenRulerActive = Boolean(donkeyToolsEnabled && screenRulerConfig?.enabled === true);
  const isEasyClipActive = Boolean(donkeyToolsEnabled && easyClipConfig?.enabled === true);
  const isMagicPlanActive = Boolean(magicPlanEnabled && magicPlanConfig?.enabled !== false);
  const showDonkeyToolsIcon = Boolean(donkeyToolsEnabled && (isColorMasterActive || isQuickCapActive || isScreenRulerActive || isEasyClipActive || isMagicPlanActive));

  // Click outside to close DonkeyTools quick tools menu
  useEffect(() => {
    if (!isDonkeyToolsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (donkeyToolsRef.current && !donkeyToolsRef.current.contains(e.target as Node)) {
        setIsDonkeyToolsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isDonkeyToolsOpen]);

  const handleRefocusInput = () => {
    requestAnimationFrame(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
      }
    });
  };

  const handlePickColor = async () => {
    try {
      window.electronAPI?.logAction?.({
        type: 'color-picker',
        title: 'Spuštění kapátka z DonkeyTools',
        details: 'Výběr nástroje kapátka v nabídce rychlých nástrojů',
        status: 'info',
      });
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await new Promise((r) => setTimeout(r, 110));
      await window.electronAPI?.resetAndHideSpotlight?.();
      await pickScreenColor();
    } catch (err) {
      console.error('Pick color error:', err);
    }
  };

  const handleStartQuickCap = async () => {
    try {
      window.electronAPI?.logAction?.({
        type: 'action',
        title: 'Spuštění QuickCap z DonkeyTools',
        details: 'Výběr nástroje výstřižku v nabídce rychlých nástrojů',
        status: 'info',
      });
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await new Promise((r) => setTimeout(r, 110));
      await window.electronAPI?.resetAndHideSpotlight?.();
      const startFn = window.electronAPI?.startQuickCap || window.electronAPI?.startFastSnap;
      if (startFn) {
        await startFn();
      }
    } catch (err) {
      console.error('QuickCap start error:', err);
    }
  };

  const handleStartScreenRuler = async () => {
    try {
      window.electronAPI?.logAction?.({
        type: 'action',
        title: 'Spuštění ScreenRuler z DonkeyTools',
        details: 'Výběr nástroje pravítka v nabídce rychlých nástrojů',
        status: 'info',
      });
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await new Promise((r) => setTimeout(r, 110));
      await window.electronAPI?.resetAndHideSpotlight?.();
      if (window.electronAPI?.startScreenRuler) {
        await window.electronAPI.startScreenRuler();
      }
    } catch (err) {
      console.error('ScreenRuler start error:', err);
    }
  };

  const resetSpotlightState = () => {
    setIsRevealed(false);
    setIsDonkeyToolsOpen(false);
    setParentItem(null);
    setActionsParentItem(null);
    setIsEasyClipMode(false);
    setIsPaletteMode(false);
    setWizardItem(null);
    setWizardStepIndex(0);
    setWizardValues({});
    setWizardSelectedOptionIndex(0);
    setWizardDynamicOptions([]);
    setWizardError(null);
    setIsSubmittingWizard(false);
    setQuery('');
    setSelectedIndex(0);
    setEasyClipSelectedIndex(0);
    setSelectedEasyClipIds(new Set());
    savedParentItemRef.current = null;
    restoringIndexRef.current = null;
    isEyedropperRef.current = false;
  };

  const exitWizard = () => {
    setIsDonkeyToolsOpen(false);
    setWizardItem(null);
    setWizardStepIndex(0);
    setWizardValues({});
    setWizardSelectedOptionIndex(0);
    setWizardDynamicOptions([]);
    setWizardError(null);
    if (!query.trimStart().match(/^\/(?:source|sources|zdroj|zdroje)/i)) {
      setQuery('');
    }
    setSelectedIndex(0);
    setIsRevealed(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const loadStepDynamicOptions = async (step?: WizardStep) => {
    if (!step) return;
    if (step.dynamicOption === 'clipboard') {
      setIsWizardLoadingDynamic(true);
      try {
        const opts: WizardOption[] = [];

        // 0. If not required, put "Nevybráno" as the FIRST option
        if (!step.required) {
          opts.push({
            text: 'Nevybráno',
            value: null,
            icon: 'block',
            color: '#9ca3af',
            description: 'Pokračovat bez snímku obrazovky',
          });
        }

        // 1. Current clipboard image if any
        if (window.electronAPI?.getClipboardImage) {
          const currentImg = await window.electronAPI.getClipboardImage();
          if (currentImg && currentImg.startsWith('data:image')) {
            opts.push({
              text: 'Aktuální snímek ze schránky (Ctrl+V)',
              value: currentImg,
              icon: 'content_paste',
              imagePreview: currentImg,
              description: 'Právě zkopírovaný snímek obrazovky',
            });
          }
        }

        // 2. EasyClip history images
        if (window.electronAPI?.getEasyClipItems) {
          const easyClipItems = await window.electronAPI.getEasyClipItems();
          if (Array.isArray(easyClipItems)) {
            const imageItems = easyClipItems.filter((it) => it && it.type === 'image' && (it.filePath || it.dataUrl));
            imageItems.slice(0, 10).forEach((it) => {
              const fullSource = it.filePath || it.dataUrl;
              if (opts.some((o) => o.value === fullSource || (it.dataUrl && o.value === it.dataUrl))) return;
              opts.push({
                text: `Snímek obrazovky ${it.width && it.height ? `(${it.width}×${it.height})` : ''}`,
                value: fullSource,
                icon: 'image',
                imagePreview: it.dataUrl,
                description: new Date(it.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              });
            });
          }
        }

        // 3. Text from clipboard / EasyClip text if step is not for screens/images
        if (step.settings !== 'screens' && step.settings !== 'images') {
          try {
            if (navigator.clipboard?.readText) {
              const clipText = await navigator.clipboard.readText();
              if (clipText && clipText.trim()) {
                const preview = clipText.trim().replace(/\s+/g, ' ').slice(0, 45);
                opts.unshift({
                  text: `Vložit ze schránky: „${preview}“`,
                  value: clipText.trim(),
                  icon: 'content_paste',
                  color: '#10b981',
                  description: `${clipText.length} znaků ze schránky`,
                });
              }
            }
          } catch {}

          if (window.electronAPI?.getEasyClipItems) {
            const easyClipItems = await window.electronAPI.getEasyClipItems();
            if (Array.isArray(easyClipItems)) {
              const textItems = easyClipItems.filter((it) => it && it.type === 'text' && it.content?.trim());
              textItems.slice(0, 5).forEach((it) => {
                const preview = it.content.trim().replace(/\s+/g, ' ').slice(0, 45);
                if (opts.some((o) => o.value === it.content)) return;
                opts.push({
                  text: `Text z EasyClipu: „${preview}“`,
                  value: it.content,
                  icon: 'history',
                  color: '#0ea5e9',
                  description: new Date(it.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                });
              });
            }
          }
        }

        setWizardDynamicOptions(opts);
      } catch (err) {
        console.error('Failed to load dynamic clipboard options:', err);
        setWizardDynamicOptions(!step.required ? [{
          text: 'Nevybráno',
          value: null,
          icon: 'block',
          color: '#9ca3af',
          description: 'Pokračovat bez snímku obrazovky',
        }] : []);
      } finally {
        setIsWizardLoadingDynamic(false);
      }
    } else if (step.dynamicOption === 'github-owners') {
      setIsWizardLoadingDynamic(true);
      try {
        const opts: WizardOption[] = [];
        if (window.electronAPI?.getGitHubOwners) {
          const res = await window.electronAPI.getGitHubOwners();
          if (res?.ok && Array.isArray(res.owners)) {
            for (const o of res.owners) {
              opts.push({
                text: o.login,
                value: `${o.type}:${o.login}`,
                icon: o.type === 'org' ? 'corporate_fare' : 'person',
                color: o.type === 'org' ? '#818cf8' : '#38bdf8',
                description:
                  o.type === 'org'
                    ? `Organizace${o.name ? ` – ${o.name}` : ''}`
                    : `Osobní účet${o.name ? ` (${o.name})` : ''}`,
              });
            }
          } else if (res?.error) {
            setWizardError(res.error);
          }
        }
        setWizardDynamicOptions(opts);
      } catch (err) {
        console.error('Failed to load GitHub owners:', err);
        setWizardDynamicOptions([]);
      } finally {
        setIsWizardLoadingDynamic(false);
      }
    } else {
      setWizardDynamicOptions([]);
    }
  };

  const startWizard = async (item: LauncherItem) => {
    if (!item?.wizard || !Array.isArray(item.wizard.steps) || item.wizard.steps.length === 0) return;

    const initialValues: Record<string, any> = {
      ...((item as any).__wizardInitialValues || {}),
    };
    if (item.wizard.action === 'creategithubrepo') {
      const ghMatch = query.trim().match(/^\/(?:github|gh|repo)\s+(.+)$/i);
      if (ghMatch && ghMatch[1]?.trim()) {
        initialValues.name = ghMatch[1].trim().replace(/\s+/g, '-');
      }
    }

    setIsDonkeyToolsOpen(false);
    setActionsParentItem(null);
    setParentItem(null);
    setIsEasyClipMode(false);
    setIsPaletteMode(false);
    setWizardItem(item);
    setWizardStepIndex(0);
    setWizardValues(initialValues);
    setWizardSelectedOptionIndex(0);
    setWizardError(null);
    setIsSubmittingWizard(false);

    const firstStep = item.wizard.steps[0];
    const firstVal = initialValues[firstStep.id];
    if (typeof firstVal === 'string' && !firstStep.options && !firstStep.dynamicOption) {
      setQuery(firstVal);
    } else {
      setQuery('');
    }

    loadStepDynamicOptions(item.wizard.steps[0]);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const goToWizardStep = (targetIndex: number) => {
    if (!wizardItem || !wizardItem.wizard) return;
    if (targetIndex < 0) {
      exitWizard();
      return;
    }
    if (targetIndex >= wizardItem.wizard.steps.length) return;
    setWizardStepIndex(targetIndex);
    const targetStep = wizardItem.wizard.steps[targetIndex];
    const existingVal = wizardValues[targetStep.id];
    if (typeof existingVal === 'string' && (!targetStep.options && !targetStep.dynamicOption)) {
      setQuery(existingVal);
    } else {
      setQuery('');
    }
    setWizardSelectedOptionIndex(0);
    setWizardError(null);
    loadStepDynamicOptions(targetStep);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const currentWizardStep = wizardItem?.wizard?.steps?.[wizardStepIndex] || null;

  const currentWizardOptions = useMemo<WizardOption[]>(() => {
    if (!currentWizardStep) return [];
    let baseOptions: WizardOption[] = [];
    if (currentWizardStep.dynamicOption) {
      baseOptions = wizardDynamicOptions;
    } else {
      baseOptions = currentWizardStep.options || [];
    }

    if (!currentWizardStep.required && baseOptions.length > 0) {
      const hasUnselected = baseOptions.some(
        (o) => o.value === null || o.value === '' || o.value === undefined
      );
      if (!hasUnselected) {
        const unselectedOpt: WizardOption = {
          text: 'Nevybráno',
          value: null,
          icon: 'block',
          color: '#9ca3af',
          description: currentWizardStep.dynamicOption === 'clipboard'
            ? 'Pokračovat bez snímku obrazovky'
            : 'Pokračovat bez výběru',
        };
        return [unselectedOpt, ...baseOptions];
      }
    }

    return baseOptions;
  }, [currentWizardStep, wizardDynamicOptions]);

  const isWizardSelectStep = Boolean(
    currentWizardStep &&
    (currentWizardStep.type === 'select' ||
      (currentWizardOptions && currentWizardOptions.length > 0) ||
      Boolean(currentWizardStep.dynamicOption))
  );

  const filteredWizardOptions = useMemo<WizardOption[]>(() => {
    if (!currentWizardStep || !isWizardSelectStep) return [];
    const q = query.trim().toLowerCase();
    if (!q) return currentWizardOptions;
    const normQ = removeDiacritics(q);
    return currentWizardOptions.filter((opt) => {
      const normText = removeDiacritics(opt.text.toLowerCase());
      const normDesc = opt.description ? removeDiacritics(opt.description.toLowerCase()) : '';
      return normText.includes(normQ) || normDesc.includes(normQ);
    });
  }, [currentWizardStep, isWizardSelectStep, currentWizardOptions, query]);

  const executeWizardAction = async (wizard: LauncherWizard, values: Record<string, any>) => {
    setIsSubmittingWizard(true);
    try {
      if (wizard.action === 'createfeedback') {
        const title = values.title || 'Nový podnět';
        const type = values.type || 'bug';
        const priority = values.priority || 'normal';
        const description = values.description || '';
        const screenshotBase64 = values.screenshot || undefined;

        if (window.electronAPI?.createFeedback) {
          const res = await window.electronAPI.createFeedback({
            data: {
              title,
              type,
              priority,
              description,
            },
            screenshotBase64,
          });

          if (res?.success) {
            window.electronAPI?.logAction?.({
              type: 'action',
              title: `Vytvořen feedback: ${title}`,
              details: `Typ: ${type}, Priorita: ${priority}`,
              status: 'success',
            });
          }
        }

        exitWizard();
        setIsRevealed(false);
        await window.electronAPI?.resetAndHideSpotlight?.();

        if (wizard.openWindowAfter && window.electronAPI?.openFeedbackWindow) {
          // Krátká prodleva pro zajištění kompletního zápisu souborů na disk před aktivací okna
          await new Promise((r) => setTimeout(r, 80));
          await window.electronAPI.openFeedbackWindow('user');
        }
      } else if (wizard.action === 'creategithubrepo') {
        const rawOwner = String(values.owner || '');
        const [ownerTypePart, ownerLoginPart] = rawOwner.includes(':')
          ? rawOwner.split(':')
          : ['user', rawOwner];
        const ownerType: 'user' | 'org' = ownerTypePart === 'org' ? 'org' : 'user';
        const owner = ownerLoginPart || rawOwner;
        const name = String(values.name || '').trim();
        const description = values.description ? String(values.description).trim() : '';
        const isPrivate = values.visibility !== 'public';
        const autoInit = values.autoInit !== 'false';
        const afterAction = values.afterAction || 'clone';

        if (!window.electronAPI?.createGitHubRepo) {
          setWizardError('Rozhraní pro vytvoření GitHub repozitáře není dostupné.');
          return;
        }

        const res = await window.electronAPI.createGitHubRepo({
          owner,
          ownerType,
          name,
          description,
          isPrivate,
          autoInit,
        });

        if (!res?.ok || !res.repo) {
          const errMsg = res?.error || 'Nepodařilo se vytvořit repozitář na GitHubu.';
          if (errMsg.toLowerCase().includes('existuje') || errMsg.toLowerCase().includes('název')) {
            setWizardStepIndex(1);
            setQuery(name);
            setTimeout(() => {
              inputRef.current?.focus();
              inputRef.current?.select();
            }, 50);
          }
          setWizardError(errMsg);
          return;
        }

        const createdRepo = res.repo;
        exitWizard();
        setIsRevealed(false);
        await window.electronAPI?.resetAndHideSpotlight?.();

        if (afterAction === 'clone' && window.electronAPI?.openGitCloneWindow) {
          await new Promise((r) => setTimeout(r, 80));
          const targetDir = defaultCloneDir
            ? `${defaultCloneDir.replace(/[\\/]+$/, '')}\\${createdRepo.name}`
            : '';
          await window.electronAPI.openGitCloneWindow({
            repoName: createdRepo.fullName,
            repoUrl: createdRepo.cloneUrl,
            targetDir,
          });
        } else if (afterAction === 'open' && window.electronAPI?.openExternal) {
          await window.electronAPI.openExternal(createdRepo.htmlUrl);
        } else if (afterAction === 'copy' && window.electronAPI?.executeAction) {
          await window.electronAPI.executeAction({
            action: 'copy',
            location: createdRepo.cloneUrl,
            sourceId: 'github',
          });
        }
      } else if (wizard.action === 'savesourceitem') {
        const sourceId = values.__sourceId;
        const originalIndex = typeof values.__originalIndex === 'number' ? values.__originalIndex : undefined;
        const itemToSave: LauncherItem = {
          name: String(values.name || '').trim(),
          action: values.action || 'open',
          location: values.location ? String(values.location).trim() : null,
          icon: values.icon || 'star',
          priority: values.priority !== undefined ? Number(values.priority) : 0,
        };
        if (!sourceId) {
          setWizardError('Chybí identifikátor cílového zdroje.');
          return;
        }
        if (!itemToSave.name) {
          setWizardError('Název položky je povinný.');
          return;
        }
        if (window.electronAPI?.saveSourceItem) {
          const res = await window.electronAPI.saveSourceItem({
            sourceId,
            item: itemToSave,
            originalIndex,
          });
          if (!res?.ok) {
            setWizardError(res?.error || 'Uložení položky do zdroje selhalo.');
            return;
          }
        }
        exitWizard();
        return;
      } else if (wizard.action === 'createsource') {
        const type = values.type || 'file';
        const name = String(values.name || '').trim();
        const pathOrUrl = String(values.pathOrUrl || '').trim();
        if (!name) {
          setWizardError('Název zdroje je povinný.');
          return;
        }
        const newSource: any = {
          id: `source-${Date.now()}`,
          name,
          type,
          enabled: true,
        };
        if (type === 'file') {
          newSource.path = pathOrUrl;
        } else if (type === 'api') {
          newSource.url = pathOrUrl;
          newSource.authType = 'none';
        } else {
          newSource.items = [];
        }
        if (window.electronAPI?.createSource) {
          const res = await window.electronAPI.createSource(newSource);
          if (!res?.ok) {
            setWizardError(res?.error || 'Vytvoření nového zdroje selhalo.');
            return;
          }
        }
        exitWizard();
        return;
      } else {
        console.warn('Neznámá akce wizardu:', wizard.action, values);
        exitWizard();
        setIsRevealed(false);
        await window.electronAPI?.resetAndHideSpotlight?.();
      }
    } catch (err) {
      console.error('Chyba při provádění akce wizardu:', err);
      setWizardError('Chyba při ukládání: ' + String(err));
    } finally {
      setIsSubmittingWizard(false);
    }
  };

  const submitCurrentWizardStep = async (explicitValue?: any) => {
    if (!wizardItem || !currentWizardStep) return;

    let chosenValue = explicitValue;

    if (chosenValue === undefined) {
      if (isWizardSelectStep) {
        const option = filteredWizardOptions[wizardSelectedOptionIndex] || filteredWizardOptions[0];
        if (option) {
          chosenValue = option.value;
        } else if (!currentWizardStep.required) {
          chosenValue = null;
        } else {
          setWizardError('Vyberte prosím jednu z nabízených možností.');
          return;
        }
      } else {
        const textVal = query.trim();
        if (currentWizardStep.required && !textVal) {
          setWizardError('Tento údaj je povinný, prosím vyplňte jej.');
          return;
        }
        if (wizardItem.wizard?.action === 'creategithubrepo' && currentWizardStep.id === 'name') {
          const sanitized = textVal.replace(/\s+/g, '-');
          if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
            setWizardError('Název repozitáře může obsahovat pouze písmena, číslice, pomlčky (-), podtržítka (_) a tečky (.).');
            return;
          }
          chosenValue = sanitized;
        } else {
          chosenValue = textVal || null;
        }
      }
    }

    setWizardError(null);
    if (!wizardItem?.wizard) return;
    const updatedValues = { ...wizardValues, [currentWizardStep.id]: chosenValue };
    setWizardValues(updatedValues);

    const isLastStep = wizardStepIndex >= wizardItem.wizard.steps.length - 1;

    if (isLastStep) {
      await executeWizardAction(wizardItem.wizard, updatedValues);
    } else {
      const nextIdx = wizardStepIndex + 1;
      setWizardStepIndex(nextIdx);
      const nextStep = wizardItem.wizard.steps[nextIdx];
      const existingVal = updatedValues[nextStep.id];
      if (typeof existingVal === 'string' && (!nextStep.options && !nextStep.dynamicOption)) {
        setQuery(existingVal);
      } else {
        setQuery('');
      }
      setWizardSelectedOptionIndex(0);
      loadStepDynamicOptions(nextStep);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const enterEasyClip = async () => {
    setIsDonkeyToolsOpen(false);
    setActionsParentItem(null);
    setParentItem(null);
    setIsPaletteMode(false);
    if (window.electronAPI?.getEasyClipItems) {
      try {
        const items = await window.electronAPI.getEasyClipItems();
        if (Array.isArray(items)) {
          setEasyClipItems(items);
        }
      } catch (err) {
        console.error('Failed to load EasyClip items:', err);
      }
    }
    setQuery('');
    setEasyClipSelectedIndex(0);
    easyClipAnchorRef.current = 0;
    setSelectedEasyClipIds(new Set());
    setIsEasyClipMode(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const exitEasyClip = () => {
    setIsDonkeyToolsOpen(false);
    setParentItem(null);
    setActionsParentItem(null);
    setIsEasyClipMode(false);
    setQuery('');
    setSelectedIndex(0);
    setEasyClipSelectedIndex(0);
    setSelectedEasyClipIds(new Set());
    savedParentItemRef.current = null;
    restoringIndexRef.current = null;
    setIsRevealed(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const loadPalettes = async () => {
    if (window.electronAPI?.getPalettes) {
      try {
        const list = await window.electronAPI.getPalettes();
        if (Array.isArray(list)) {
          setPalettes(list);
        }
      } catch (err) {
        console.error('Failed to load palettes:', err);
      }
    }
  };

  const enterPaletteMode = async () => {
    setIsDonkeyToolsOpen(false);
    setActionsParentItem(null);
    setParentItem(null);
    setIsEasyClipMode(false);
    setIsCreatingPalette(false);
    await loadPalettes();
    setQuery('');
    setPaletteSelectedIndex(0);
    setIsPaletteMode(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const openMagicPlan = async (filterArg?: string | unknown) => {
    const filter = typeof filterArg === 'string' && filterArg.trim() ? filterArg.trim() : undefined;
    if (isOpeningMagicPlan) return;
    setIsOpeningMagicPlan(true);
    try {
      if (window.electronAPI?.openMagicPlanWindow) {
        await window.electronAPI.openMagicPlanWindow(filter ? { filter } : undefined);
      }
    } catch (err) {
      console.error('Failed to open MagicPlan window:', err);
    } finally {
      setIsOpeningMagicPlan(false);
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await window.electronAPI?.resetAndHideSpotlight?.();
    }
  };

  const openFeedback = async (requestedMode: 'user' | 'dev' = 'user') => {
    try {
      const isDevActive =
        typeof localStorage !== 'undefined' && localStorage.getItem('iadonkey_develop_mode') === 'true';
      const mode = requestedMode === 'dev' && !isDevActive ? 'user' : requestedMode;
      if (window.electronAPI?.openFeedbackWindow) {
        await window.electronAPI.openFeedbackWindow(mode);
      }
    } catch (err) {
      console.error('Failed to open Feedback window:', err);
    } finally {
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await window.electronAPI?.resetAndHideSpotlight?.();
    }
  };

  const exitPaletteMode = () => {
    setIsDonkeyToolsOpen(false);
    setParentItem(null);
    setActionsParentItem(null);
    setIsPaletteMode(false);
    setIsCreatingPalette(false);
    setQuery('');
    setSelectedIndex(0);
    setPaletteSelectedIndex(0);
    setIsRevealed(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleDeletePalette = async (paletteId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.electronAPI?.deletePalette) {
      const updated = await window.electronAPI.deletePalette(paletteId);
      if (Array.isArray(updated)) {
        setPalettes(updated);
      }
    }
  };

  const handleCopyEasyClipItem = async (item: EasyClipItem, shouldPaste: boolean = true) => {
    if (!item) return;
    resetSpotlightState();
    if (window.electronAPI?.copyEasyClipItem) {
      await window.electronAPI.copyEasyClipItem(item.id, shouldPaste);
    } else {
      if (item.type === 'text' && item.text) {
        await navigator.clipboard.writeText(item.text);
      }
      handleClose();
    }
  };

  const handleCopyMultipleEasyClipItems = async (shouldPaste: boolean = true) => {
    const idsInOrder = filteredEasyClipItems
      .filter((it) => selectedEasyClipIds.has(it.id))
      .map((it) => it.id);

    if (idsInOrder.length === 0) return;

    resetSpotlightState();

    if (window.electronAPI?.copyMultipleEasyClipItems) {
      await window.electronAPI.copyMultipleEasyClipItems(idsInOrder, shouldPaste);
    } else {
      const selected = filteredEasyClipItems.filter((it) => selectedEasyClipIds.has(it.id));
      const reversed = [...selected].reverse();
      const combined = reversed
        .map((it) => (it.type === 'text' ? it.text?.trimEnd() || '' : ''))
        .filter((t) => t.length > 0)
        .join('\n');
      if (combined) {
        await navigator.clipboard.writeText(combined);
      }
      handleClose();
    }
  };

  const handleDeleteSelectedEasyClipItems = async () => {
    const idsToDelete = Array.from(selectedEasyClipIds);
    if (idsToDelete.length === 0) return;

    if (window.electronAPI?.deleteMultipleEasyClipItems) {
      await window.electronAPI.deleteMultipleEasyClipItems(idsToDelete);
    }
    setEasyClipItems((prev) => prev.filter((it) => !selectedEasyClipIds.has(it.id)));
    setSelectedEasyClipIds(new Set());
    setEasyClipSelectedIndex((prev) =>
      Math.max(0, Math.min(prev, filteredEasyClipItems.length - idsToDelete.length - 1))
    );
  };

  const handleEasyClipItemClick = (item: EasyClipItem, idx: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      setEasyClipSelectedIndex(idx);
      const start = Math.min(easyClipAnchorRef.current, idx);
      const end = Math.max(easyClipAnchorRef.current, idx);
      const newSet = new Set<string>();
      for (let i = start; i <= end; i++) {
        if (filteredEasyClipItems[i]) {
          newSet.add(filteredEasyClipItems[i].id);
        }
      }
      setSelectedEasyClipIds(newSet);
      handleRefocusInput();
      return;
    }

    if (selectedEasyClipIds.size > 1) {
      setSelectedEasyClipIds(new Set());
      setEasyClipSelectedIndex(idx);
      easyClipAnchorRef.current = idx;
      handleRefocusInput();
      return;
    }

    const shouldPaste = !e.ctrlKey && !isCtrlDown;
    handleCopyEasyClipItem(item, shouldPaste);
  };

  const handleDeleteEasyClipItem = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.electronAPI?.deleteEasyClipItem) {
      await window.electronAPI.deleteEasyClipItem(id);
    }
    setEasyClipItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedEasyClipIds.has(id)) {
      setSelectedEasyClipIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    handleRefocusInput();
  };

  const handleClearEasyClip = async () => {
    if (window.electronAPI?.clearEasyClipHistory) {
      await window.electronAPI.clearEasyClipHistory();
    }
    setEasyClipItems([]);
    setSelectedEasyClipIds(new Set());
    handleRefocusInput();
  };

  useEffect(() => {
    if (window.electronAPI?.getEasyClipItems) {
      window.electronAPI.getEasyClipItems().then((items) => {
        if (Array.isArray(items)) {
          setEasyClipItems(items);
        }
      }).catch(() => {});
    }

    const unsubUpdated = window.electronAPI?.onEasyClipItemsUpdated?.((items) => {
      if (Array.isArray(items)) {
        setEasyClipItems(items);
      }
    });

    const unsubPalettes = window.electronAPI?.onPalettesUpdated?.((updatedPalettes: ColorPalette[]) => {
      if (Array.isArray(updatedPalettes)) {
        setPalettes(updatedPalettes);
      }
    });

    if (window.electronAPI?.getMagicPlanData) {
      window.electronAPI.getMagicPlanData().then((data) => {
        if (data) setMagicPlanData(data);
      }).catch(() => {});
    }

    const unsubPlan = window.electronAPI?.onMagicPlanDataUpdated?.((data: MagicPlanData) => {
      if (data) setMagicPlanData(data);
    });

    const unsubMode = window.electronAPI?.onOpenSpotlightMode?.((data) => {
      if (data?.mode === 'easyclip') {
        enterEasyClip();
      } else if (data?.mode === 'palette') {
        enterPaletteMode();
      } else if (data?.mode === 'plan' || data?.mode === 'magicplan') {
        openMagicPlan();
      } else if (data?.mode === 'feedback' || data?.mode === 'feedback-user') {
        openFeedback('user');
      } else if (data?.mode === 'feedback-dev') {
        openFeedback('dev');
      }
    });

    const unsubConfig = window.electronAPI?.onConfigUpdated?.((newCfg: AppConfig) => {
      if (newCfg?.magicplan) {
        setCurrentMagicPlanConfig(newCfg.magicplan);
      }
    });

    return () => {
      unsubUpdated?.();
      unsubPalettes?.();
      unsubPlan?.();
      unsubMode?.();
      unsubConfig?.();
    };
  }, []);

  const paletteListItems = useMemo<PaletteListItem[]>(() => {
    if (!isPaletteMode) return [];
    const q = query.trim().toLowerCase();
    const matched = !q ? palettes : palettes.filter((p) => p.name.toLowerCase().includes(q));
    const showAdd = !q || matched.length === 0;

    const items: PaletteListItem[] = [];
    if (showAdd) {
      items.push({ type: 'add' });
    }
    for (const p of matched) {
      items.push({ type: 'palette', palette: p });
    }
    return items;
  }, [isPaletteMode, query, palettes]);

  useEffect(() => {
    if (isPaletteMode) {
      setPaletteSelectedIndex(0);
    }
  }, [isPaletteMode, query]);

  const filteredEasyClipItems = useMemo(() => {
    if (!isEasyClipMode) return [];
    const q = query.trim().toLowerCase();
    if (!q) return easyClipItems;
    return easyClipItems.filter((item) => {
      if (item.type === 'text') {
        return item.text?.toLowerCase().includes(q);
      }
      if (item.type === 'image') {
        return (
          'obrázek image foto screenshot snímek výstřižek vystrizek vstrih clip'.includes(q) ||
          Boolean(item.width && item.height && `${item.width}x${item.height}`.includes(q))
        );
      }
      return false;
    });
  }, [isEasyClipMode, query, easyClipItems]);

  useEffect(() => {
    if (isEasyClipMode) {
      setEasyClipSelectedIndex(0);
      easyClipAnchorRef.current = 0;
      setSelectedEasyClipIds(new Set());
    }
  }, [isEasyClipMode, query]);

  const formatRelativeTime = (timestamp: number): string => {
    if (!timestamp) return '';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 45) return 'Právě teď';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Před ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      const d = new Date(timestamp);
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `Dnes ${h}:${m}`;
    }
    const d = new Date(timestamp);
    return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Listen to global color picker and tune color applied
  useEffect(() => {
    if (window.electronAPI?.onTuneColorApplied) {
      const unsub = window.electronAPI.onTuneColorApplied((data: { color: string }) => {
        if (data.color) {
          const parsed = parseColorQuery(data.color);
          const format = colorMasterConfig?.defaultFormat || 'hex';
          if (parsed) {
            const newItem = createColorLauncherItem(parsed, format);
            setQuery(data.color);
            setActionsParentItem(newItem);
            setSelectedActionIndex(0);
          }
        }
      });
      return () => unsub?.();
    }
  }, [colorMasterConfig]);

  useEffect(() => {
    if (window.electronAPI?.onColorPickedGlobal) {
      const unsub = window.electronAPI.onColorPickedGlobal((data: { color: string; formatted: string }) => {
        if (data.color) {
          isEyedropperRef.current = true;
          const parsed = parseColorQuery(data.color);
          const format = colorMasterConfig?.defaultFormat || 'hex';
          setQuery(data.color);
          if (parsed) {
            const newItem = createColorLauncherItem(parsed, format);
            setActionsParentItem(newItem);
            setSelectedActionIndex(0);
          }
          setIsRevealed(true);
          inputRef.current?.focus();
          setTimeout(() => inputRef.current?.focus(), 50);
          setTimeout(() => inputRef.current?.focus(), 150);
        }
      });
      return () => unsub?.();
    }
  }, [colorMasterConfig]);

  // Listen to QuickCap screenshot captured event
  useEffect(() => {
    if (window.electronAPI?.onQuickCapCaptured) {
      const unsub = window.electronAPI.onQuickCapCaptured((data: {
        filePath: string;
        fileName: string;
        dataUrl?: string;
        width: number;
        height: number;
      }) => {
        const item: LauncherItem = {
          id: `quickcap-${Date.now()}`,
          name: data.fileName,
          location: data.filePath,
          icon: 'crop',
          imagePreview: data.dataUrl,
          info: {
            'Název': data.fileName,
            'Rozměry': `${data.width} × ${data.height} px`,
            'Cesta': data.filePath,
          },
          actions: [
            {
              name: 'Zavřít',
              action: 'close',
              location: 'Již zkopírováno ve schránce',
              icon: 'close',
            },
            {
              name: 'Upravit',
              action: 'edit-quickcap',
              location: data.filePath,
              icon: 'edit',
            },
            {
              name: 'Otevřít',
              action: 'open',
              location: data.filePath,
              icon: 'open_in_new',
            },
            {
              name: 'Otevřít v malování',
              action: 'open-paint',
              location: data.filePath,
              icon: 'draw',
            },
            {
              name: 'Otevřít ve složce',
              action: 'show-in-folder',
              location: data.filePath,
              icon: 'folder_open',
            },
          ],
        };
        setQuery('');
        setActionsParentItem(item);
        setSelectedActionIndex(0);
        setIsRevealed(true);
        inputRef.current?.focus();
      });
      return () => unsub?.();
    }
  }, []);

  // Load and listen for search engine metadata favicons
  useEffect(() => {
    if (window.electronAPI?.getSearchEngineFavicons) {
      window.electronAPI.getSearchEngineFavicons().then((favs) => {
        if (favs) setEngineFavicons(favs);
      });
    }

    const unsubFavicons = window.electronAPI?.onSearchEngineFaviconsUpdated?.((favs) => {
      if (favs) setEngineFavicons(favs);
    });

    const handleFocus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('focus-search-input', handleFocus);

    const handleBlur = () => {
      if (settingsHoldRafRef.current) {
        cancelAnimationFrame(settingsHoldRafRef.current);
        settingsHoldRafRef.current = null;
      }
      setSettingsHoldProgress(0);
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      unsubFavicons?.();
      window.removeEventListener('focus-search-input', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (settingsHoldRafRef.current) {
        cancelAnimationFrame(settingsHoldRafRef.current);
      }
    };
  }, []);

  // Fetch existing cloned repos for instant VS Code action availability
  const refreshExistingClonedRepos = () => {
    if (window.electronAPI?.getExistingClonedRepos) {
      window.electronAPI.getExistingClonedRepos(defaultCloneDir).then((res: any) => {
        if (Array.isArray(res)) {
          setExistingClonedRepos(new Set(res.map((r: string) => r.toLowerCase())));
        } else if (res && typeof res === 'object') {
          if (Array.isArray(res.repos)) {
            setExistingClonedRepos(new Set(res.repos.map((r: string) => r.toLowerCase())));
          }
          if (res.instanceSubRepos) {
            setInstanceSubRepos(res.instanceSubRepos);
          }
        }
      });
    }
  };

  useEffect(() => {
    refreshExistingClonedRepos();
  }, [defaultCloneDir]);

  // Sync icon rotation & smooth check status animation
  const [syncStatus, setSyncStatus] = useState<'idle' | 'spinning' | 'success'>('idle');
  const shouldStopSpinRef = useRef(false);

  useEffect(() => {
    if (isSyncing) {
      shouldStopSpinRef.current = false;
      setSyncStatus('spinning');
    } else {
      if (syncStatus === 'spinning') {
        shouldStopSpinRef.current = true;
      }
    }
  }, [isSyncing, syncStatus]);

  const handleSyncAnimationIteration = () => {
    if (shouldStopSpinRef.current) {
      shouldStopSpinRef.current = false;
      setSyncStatus('success');
    }
  };

  useEffect(() => {
    if (syncStatus === 'spinning' && !isSyncing) {
      const fallback = setTimeout(() => {
        setSyncStatus('success');
      }, 2500);
      return () => clearTimeout(fallback);
    }
  }, [syncStatus, isSyncing]);

  useEffect(() => {
    if (syncStatus === 'success') {
      const timer = setTimeout(() => {
        setSyncStatus('idle');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);
  // Modifier keys state (Shift, Ctrl, Alt)
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [isAltDown, setIsAltDown] = useState(false);

  useEffect(() => {
    const handleModifierKeys = (e: KeyboardEvent) => {
      setIsShiftDown(e.shiftKey);
      setIsCtrlDown(e.ctrlKey);
      setIsAltDown(e.altKey);
    };
    const handleBlur = () => {
      setIsRevealed(false);
      setIsShiftDown(false);
      setIsCtrlDown(false);
      setIsAltDown(false);
    };

    window.addEventListener('keydown', handleModifierKeys);
    window.addEventListener('keyup', handleModifierKeys);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleModifierKeys);
      window.removeEventListener('keyup', handleModifierKeys);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsRevealed(true);
      inputRef.current?.focus();
    });
    const handleFocus = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('focus', handleFocus);

    const cleanupShown = window.electronAPI?.onWindowShown?.(() => {
      refreshExistingClonedRepos();
      setIsRevealed(true);
      inputRef.current?.focus();
    });

    const cleanupFocusInput = window.electronAPI?.onFocusInput?.(() => {
      setIsRevealed(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    const cleanupHide = window.electronAPI?.onWindowHideRequest?.(() => {
      resetSpotlightState();
    });

    const cleanupReset = window.electronAPI?.onResetSpotlight?.(() => {
      resetSpotlightState();
      inputRef.current?.blur();
    });

    const cleanupResetAndFocus = window.electronAPI?.onResetAndFocusSpotlight?.(() => {
      resetSpotlightState();
      setIsRevealed(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      cleanupShown?.();
      cleanupFocusInput?.();
      cleanupHide?.();
      cleanupReset?.();
      cleanupResetAndFocus?.();
    };
  }, [defaultCloneDir]);

  // Enter subitems mode
  const enterSubitems = (item: LauncherItem) => {
    if (!item.options || item.options.length === 0) return;
    window.electronAPI?.logAction?.({
      type: 'options',
      title: `Otevření podpoložek (options): ${item.name}`,
      details: `Počet podpoložek: ${item.options.length}`,
      status: 'info',
    });
    setActionsParentItem(null);
    setSavedQueryBeforeSubitems(query);
    setSavedIndexBeforeSubitems(selectedIndex);
    savedParentItemRef.current = item;
    setParentItem(item);
    setQuery('');
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // Return from subitems mode back to previous main level
  const exitSubitems = () => {
    restoringIndexRef.current = savedIndexBeforeSubitems;
    setParentItem(null);
    setQuery(savedQueryBeforeSubitems);
    setSelectedIndex(savedIndexBeforeSubitems);
    inputRef.current?.focus();
  };

  // Extract folder name of repository
  const getRepoFolderName = (item?: LauncherItem | null): string | null => {
    if (!item) return null;
    if (item.settings === 'git' || item.sourceId === 'github' || item.sourceId === 'git') {
      if (item.shortcuts && item.shortcuts[0]) {
        return item.shortcuts[0];
      }
      const parts = (item.name || '').split(/[/\\\\]/);
      return parts[parts.length - 1] || null;
    }
    if (item.settings === 'magicgate' || item.sourceId === 'magicgate' || item.sourceId === 'magicgate-xml') {
      return item.name || null;
    }
    return null;
  };

  // Resolve local directory path if repository is already cloned
  const getLocalRepoPath = (item?: LauncherItem | null): string | null => {
    if (!item || !defaultCloneDir) return null;
    const folderName = getRepoFolderName(item);
    if (!folderName) return null;

    const sep = defaultCloneDir.includes('/') ? '/' : '\\';
    const cleanBase = defaultCloneDir.replace(/[\\/]+$/, '');

    // For MagicGate instances: target directory is {defaultCloneDir}/magicgate/{instanceName}
    const isMagicGate = item.settings === 'magicgate' || item.sourceId === 'magicgate' || item.sourceId === 'magicgate-xml';
    if (isMagicGate) {
      const lowerName = folderName.toLowerCase();
      if (existingClonedRepos.has(`magicgate/${lowerName}`) || existingClonedRepos.has(lowerName)) {
        return `${cleanBase}${sep}magicgate${sep}${folderName}`;
      }
      return null;
    }

    // For standard GitHub / Git repositories: target directory is {defaultCloneDir}/{repoName}
    if (existingClonedRepos.has(folderName.toLowerCase())) {
      return `${cleanBase}${sep}${folderName}`;
    }
    return null;
  };

  const isAndroidProjectItem = (item?: LauncherItem | null): boolean => {
    if (!item) return false;
    // MagicGate projects are NEVER Android Studio projects
    if (item.settings === 'magicgate' || item.sourceId === 'magicgate' || item.sourceId === 'magicgate-xml') {
      return false;
    }
    const lang = String(item.info?.['Jazyk'] || item.info?.['Language'] || '').trim().toLowerCase();
    if (lang === 'kotlin' || lang === 'java') {
      return true;
    }
    return false;
  };

  const canCloneGit = Boolean(githubEnabled && hasGithubCredentials);

  const isMagicGateItem = (item?: LauncherItem | null): boolean => {
    if (!item) return false;
    return Boolean(
      item.settings === 'magicgate' ||
      item.sourceId === 'magicgate' ||
      item.sourceId === 'magicgate-xml' ||
      item.actions?.some((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive')
    );
  };

  // Dynamically resolve actions for an item, inserting either 'Otevřít v Android Studiu' or 'Otevřít ve VS Code' (never both!)
  const getItemActions = (item?: LauncherItem | null): LauncherAction[] => {
    if (!item) return [];
    // Explicit empty actions array means no actions desired for this item
    if (Array.isArray(item.actions) && item.actions.length === 0) {
      return [];
    }
    let baseActions = item.actions ? [...item.actions] : [];

    // Filter out redundant recursive clone actions (handled by checkbox in clone modal)
    baseActions = baseActions.filter(
      (a) => a.action !== 'clonerecursive' && a.action !== 'mgclonerecursive'
    );

    // If GitHub extension is disabled or GitHub credentials are not configured, hide cloning actions
    if (!canCloneGit) {
      baseActions = baseActions.filter(
        (a) =>
          a.action !== 'clone' &&
          a.action !== 'clonerecursive' &&
          a.action !== 'mgclone' &&
          a.action !== 'mgclonerecursive'
      );
    }

    // For Git / GitHub items: ensure 'Otevřít na GitHubu' is always at the very end
    const isGit = item.settings === 'git' || item.sourceId === 'github' || item.sourceId === 'git';
    if (isGit) {
      const openOnGithubIndex = baseActions.findIndex(
        (a) =>
          a.action === 'open' &&
          (a.name.toLowerCase().includes('github') || a.location?.includes('github.com'))
      );
      if (openOnGithubIndex >= 0 && openOnGithubIndex < baseActions.length - 1) {
        const [openOnGithubAction] = baseActions.splice(openOnGithubIndex, 1);
        baseActions.push(openOnGithubAction);
      }
    }

    const isMagicGate =
      item.settings === 'magicgate' ||
      item.sourceId === 'magicgate' ||
      item.sourceId === 'magicgate-xml' ||
      baseActions.some((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive') ||
      Boolean(item.actions?.some((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive'));

    const localPath = getLocalRepoPath(item);
    if (localPath) {
      const isAndroid = isAndroidProjectItem(item);

      if (isAndroid) {
        if (androidStudioEnabled) {
          const hasAndroidAction = baseActions.some((a) => a.action === 'android-studio');
          if (!hasAndroidAction) {
            baseActions.unshift({
              name: 'Otevřít v Android Studiu',
              action: 'android-studio',
              location: localPath,
              icon: 'android',
              settings: 'android-studio',
            });
          }
        } else if (vscodeEnabled) {
          // Fallback to VS Code if Android Studio extension is not active
          const hasVscodeAction = baseActions.some((a) => a.action === 'vscode');
          if (!hasVscodeAction) {
            baseActions.unshift({
              name: isMagicGate ? 'Otevřít repozitáře ve VS Code' : 'Otevřít ve VS Code',
              action: 'vscode',
              location: localPath,
              icon: 'code',
              settings: 'vscode',
            });
          }
        }
      } else {
        // Not Android (MagicGate or regular web/backend repo) -> VS Code only
        if (vscodeEnabled) {
          if (isMagicGate) {
            // Remove any generic vscode actions to properly reconstruct with subrepositories
            baseActions = baseActions.filter((a) => a.action !== 'vscode');

            const folderName = getRepoFolderName(item)?.toLowerCase() || '';
            const subRepos = instanceSubRepos[folderName] || [];

            if (subRepos.length === 1) {
              // Exactly 1 section repository -> directly open that repository instead of the parent folder
              baseActions.unshift({
                name: `Otevřít ${subRepos[0].name} ve VS Code`,
                action: 'vscode',
                location: subRepos[0].path,
                icon: 'code',
                settings: 'vscode',
              });
            } else if (subRepos.length > 1) {
              // Multiple section repositories -> break down per repository + optional full instance
              const vscodeActions: LauncherAction[] = subRepos.map((sub) => ({
                name: `Otevřít ${sub.name} ve VS Code`,
                action: 'vscode',
                location: sub.path,
                icon: 'code',
                settings: 'vscode',
              }));
              vscodeActions.push({
                name: 'Otevřít celou instanci ve VS Code',
                action: 'vscode',
                location: localPath,
                icon: 'code',
                settings: 'vscode',
              });
              baseActions.unshift(...vscodeActions);
            } else {
              // Fallback if subrepositories were not yet detected
              baseActions.unshift({
                name: 'Otevřít repozitáře ve VS Code',
                action: 'vscode',
                location: localPath,
                icon: 'code',
                settings: 'vscode',
              });
            }
          } else {
            const hasVscodeAction = baseActions.some((a) => a.action === 'vscode');
            if (!hasVscodeAction) {
              baseActions.unshift({
                name: 'Otevřít ve VS Code',
                action: 'vscode',
                location: localPath,
                icon: 'code',
                settings: 'vscode',
              });
            }
          }
        }
      }
    }

    // Add CMSinFS download action for MagicGate instances if instanceSourceCodesPath is configured
    if (instanceSourceCodesPath && instanceSourceCodesPath.trim()) {
      if (isMagicGate) {
        const adminUrl =
          item.info?.['Admin URL'] ||
          baseActions.find((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive')?.location ||
          (item.location && item.location.includes('/Administration') ? item.location : undefined) ||
          item.options?.find((opt) => opt.name?.trim().toUpperCase() === 'A' || opt.name?.toLowerCase().includes('administrace'))?.location;

        if (adminUrl) {
          const downloadAction: LauncherAction = {
            name: 'Stáhnout CMSinFS zdrojáky (pro PRG)',
            action: 'mgdownloadcontent',
            location: adminUrl,
            settings: 'magicgate',
            icon: 'folder_zip',
          };
          const mgCloneIdx = baseActions.findIndex((a) => a.action === 'mgclone');
          if (mgCloneIdx >= 0) {
            baseActions.splice(mgCloneIdx + 1, 0, downloadAction);
          } else {
            baseActions.push(downloadAction);
          }
        }
      }
    }

    // Add SSMS Query & Copy FTP actions for MagicGate instances
    if (isMagicGate && item.sourceId !== 'ssms-db' && item.sourceId !== 'magicgate-ftp') {
      // 1. Otevřít dotaz v SSMS - ONLY when SSMS extension is enabled AND Ssms.exe is selected
      if (isSsmsActive) {
        const dbName = item.info?.['Databáze']?.trim();
        const dbServer = (item.info?.['DB Host (adresa)'] || item.info?.['DB Server'] || '').trim();
        if (dbName && !baseActions.some((a) => a.action === 'ssms-query')) {
          baseActions.push({
            name: `Otevřít dotaz v SSMS (${dbName})`,
            action: 'ssms-query',
            location: `${dbServer || 'localhost'}|${dbName}`,
            icon: 'database',
            settings: 'ssms',
          });
        }
      }

      // 2. Zkopírovat FTP adresu - ONLY when FTP section is enabled in MagicGate settings
      if (ftpEnabled) {
        const ftpAddr = item.info?.['FTP']?.trim();
        if (ftpAddr && !baseActions.some((a) => a.action === 'copy' && a.location === ftpAddr)) {
          baseActions.push({
            name: `Zkopírovat FTP adresu (${ftpAddr})`,
            action: 'copy',
            location: ftpAddr,
            icon: 'folder_shared',
            settings: 'magicgate',
          });
        }
      }
    }

    return baseActions;
  };

  const canAccessMagicGateExtras = Boolean(
    canCloneGit || isSsmsActive || Boolean(instanceSourceCodesPath?.trim()) || magicgateEnabled
  );

  const hasItemActions = (item?: LauncherItem | null): boolean => {
    if (!item) return false;
    if (isMagicGateItem(item) && !canAccessMagicGateExtras) return false;
    return getItemActions(item).length > 0;
  };

  const hasItemInfo = (item?: LauncherItem | null) => {
    if (isMagicGateItem(item) && !canAccessMagicGateExtras) return false;
    return Boolean(item?.info && typeof item.info === 'object' && Object.keys(item.info).length > 0);
  };

  const hasItemActionsOrInfo = (item?: LauncherItem | null) => {
    if (isMagicGateItem(item) && !canAccessMagicGateExtras) return false;
    return hasItemActions(item) || hasItemInfo(item);
  };

  // Enter actions / info mode for an item
  const enterActions = (item: LauncherItem) => {
    if (isMagicGateItem(item) && !canAccessMagicGateExtras) return;
    if (!hasItemActionsOrInfo(item)) return;
    window.electronAPI?.logAction?.({
      type: 'action',
      title: `Otevření nabídky akcí: ${item.name}`,
      details: item.location ? `Cíl: ${item.location}` : undefined,
      status: 'info',
    });
    refreshExistingClonedRepos();
    setActionsParentItem(item);
    setSelectedActionIndex(0);
    setInfoPage(0);
  };

  // Return from actions mode back to search results
  const exitActions = () => {
    isEyedropperRef.current = false;
    setActionsParentItem(null);
    setSelectedActionIndex(0);
    setInfoPage(0);
    inputRef.current?.focus();
  };

  const handleCopyInfoValue = async (key: string, value: string) => {
    if (!value) return;
    try {
      window.electronAPI?.logAction?.({
        type: 'action',
        title: `Zkopírována informace položky: ${key}`,
        details: value,
        status: 'success',
      });
      if (window.electronAPI) {
        await window.electronAPI.executeAction({
          action: 'copy',
          location: value,
        });
      } else {
        await navigator.clipboard.writeText(value);
      }
      setCopiedInfoKey(key);
      setTimeout(() => {
        setCopiedInfoKey(null);
      }, 1500);
      handleRefocusInput();
    } catch (err) {
      console.error('Failed to copy info value:', err);
    }
  };

  // Pre-normalize items once when `items` array changes so typing never runs `normalize('NFD')` thousands of times per keystroke
  const indexedSearchData = useMemo(() => {
    const byItem = new Map<
      LauncherItem,
      {
        nameNorm: string;
        nameWords: string[];
        locNorm: string;
        optionsNorm: string;
        shortcutsNorm: string;
        infoNorm: string;
        infoCompactNorm: string;
        isMg: boolean;
        isGit: boolean;
      }
    >();

    for (const item of items) {
      const nameNorm = removeDiacritics(item.name || '').toLowerCase();
      const nameWords = nameNorm.split(/[\s\-_\/]+/).filter(Boolean);
      const locNorm = removeDiacritics(item.location || '').toLowerCase();
      const optionsNorm = item.options?.length
        ? item.options
            .map(
              (opt) =>
                `${removeDiacritics(opt.name || '').toLowerCase()}\n${removeDiacritics(opt.location || '').toLowerCase()}`
            )
            .join('\n')
        : '';
      const shortcutsNorm = item.shortcuts?.length
        ? item.shortcuts.map((sc) => removeDiacritics(sc || '').toLowerCase()).join('\n')
        : '';
      let infoNorm = '';
      let infoCompactNorm = '';
      if (item.info) {
        const vals: string[] = [];
        const compactVals: string[] = [];
        for (const v of Object.values(item.info)) {
          if (typeof v === 'string' && v) {
            const n = removeDiacritics(v).toLowerCase();
            vals.push(n);
            compactVals.push(n.replace(/\s+/g, ''));
          }
        }
        infoNorm = vals.join('\n');
        infoCompactNorm = compactVals.join('\n');
      }
      const isMg = Boolean(
        item.settings === 'magicgate' ||
          item.sourceId === 'magicgate' ||
          item.sourceId === 'magicgate-xml' ||
          item.id?.startsWith('mg-') ||
          item.actions?.some((a) => a.action === 'mgclone' || a.action === 'mgclonerecursive') ||
          item.options?.some((opt) => opt.settings === 'magicgate' || opt.id?.startsWith('mg-'))
      );
      const isGit = Boolean(
        item.settings === 'git' || item.sourceId === 'github' || item.sourceId === 'git'
      );

      byItem.set(item, {
        nameNorm,
        nameWords,
        locNorm,
        optionsNorm,
        shortcutsNorm,
        infoNorm,
        infoCompactNorm,
        isMg,
        isGit,
      });
    }

    return byItem;
  }, [items]);

  // Precompute DB candidates so `/db ` filtering and sorting does zero diacritics normalization on keystrokes
  const precomputedDbCandidates = useMemo(() => {
    if (!isSsmsActive) return [];
    const localSrv = ssmsConfig?.localServer?.trim() || 'localhost';
    const recentList = (ssmsConfig?.recentDatabases || []).map((r) => r.toLowerCase());

    const findRecentRank = (srv: string, db: string) => {
      const fullKey = `${srv.toLowerCase()}|${db.toLowerCase()}`;
      const dbLower = db.toLowerCase();
      const idxFull = recentList.indexOf(fullKey);
      if (idxFull !== -1) return idxFull;
      return recentList.findIndex((r) => r.endsWith(`|${dbLower}`) || r === dbLower);
    };

    const seenKeys = new Set<string>();
    const candidates: Array<{
      dbName: string;
      dbNorm: string;
      dbWords: string[];
      dbServer: string;
      displayServer: string;
      srvNorm: string;
      isLocal: boolean;
      instanceName: string;
      instNorm: string;
      adminUrl?: string;
      recentRank: number;
    }> = [];

    for (const localDb of localDatabases) {
      const cleanDb = (localDb || '').trim();
      if (!cleanDb) continue;
      const key = `${localSrv.toLowerCase()}|${cleanDb.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const dbNorm = removeDiacritics(cleanDb).toLowerCase();
      candidates.push({
        dbName: cleanDb,
        dbNorm,
        dbWords: dbNorm.split(/[\s\-_]+/).filter(Boolean),
        dbServer: localSrv,
        displayServer: localSrv,
        srvNorm: removeDiacritics(localSrv).toLowerCase(),
        isLocal: true,
        instanceName: '',
        instNorm: '',
        recentRank: findRecentRank(localSrv, cleanDb),
      });
    }

    for (const it of items) {
      if (!isMagicGateItem(it)) continue;
      const dbName = it.info?.['Databáze']?.trim();
      if (!dbName) continue;
      const dbServer = (it.info?.['DB Host (adresa)'] || it.info?.['DB Server'] || 'localhost').trim();
      const displayServer = (it.info?.['DB Server'] || dbServer).trim();
      const key = `${dbServer.toLowerCase()}|${dbName.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const dbNorm = removeDiacritics(dbName).toLowerCase();
      const instName = it.name || '';
      candidates.push({
        dbName,
        dbNorm,
        dbWords: dbNorm.split(/[\s\-_]+/).filter(Boolean),
        dbServer,
        displayServer,
        srvNorm: removeDiacritics(displayServer).toLowerCase(),
        isLocal: false,
        instanceName: instName,
        instNorm: removeDiacritics(instName).toLowerCase(),
        adminUrl: it.info?.['Admin URL'] || it.location || undefined,
        recentRank: findRecentRank(dbServer, dbName),
      });
    }

    // Pre-sort in default (unfiltered) order: Recent -> Local -> Alphabetical
    candidates.sort((a, b) => {
      const aRec = a.recentRank >= 0;
      const bRec = b.recentRank >= 0;
      if (aRec && !bRec) return -1;
      if (!aRec && bRec) return 1;
      if (aRec && bRec && a.recentRank !== b.recentRank) return a.recentRank - b.recentRank;
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return a.dbName.localeCompare(b.dbName);
    });

    return candidates;
  }, [isSsmsActive, localDatabases, items, ssmsConfig?.localServer, ssmsConfig?.recentDatabases]);

  // Precompute FTP candidates so `/ftp ` filtering and sorting does zero diacritics normalization on keystrokes
  const precomputedFtpCandidates = useMemo(() => {
    const list: Array<{
      item: LauncherItem;
      nameNorm: string;
      ftpAddr: string;
      ftpNorm: string;
      srvName: string;
      srvNorm: string;
      dbName?: string;
      dbServer: string;
    }> = [];

    for (const it of items) {
      if (!isMagicGateItem(it)) continue;
      const ftpAddr = (it.info?.['FTP'] || '').trim();
      if (!ftpAddr) continue;
      const srvName = (it.info?.['Server'] || '').trim();
      const dbName = it.info?.['Databáze']?.trim();
      const dbServer = (it.info?.['DB Host (adresa)'] || it.info?.['DB Server'] || 'localhost').trim();
      list.push({
        item: it,
        nameNorm: removeDiacritics(it.name || '').toLowerCase(),
        ftpAddr,
        ftpNorm: removeDiacritics(ftpAddr).toLowerCase(),
        srvName,
        srvNorm: removeDiacritics(srvName).toLowerCase(),
        dbName,
        dbServer,
      });
    }

    list.sort((a, b) => (a.item.name || '').localeCompare(b.item.name || ''));
    return list;
  }, [items]);

  // Filter and prioritize results (or display parentItem.options if in subitems mode)
  const results = useMemo(() => {
    const trimmed = query.trim();

    // 1. If currently browsing subitems of a parent item
    if (parentItem) {
      const rawSubitems = parentItem.options || [];
      const subitems = rawSubitems.map((it) => ({
        ...it,
        icon: it.icon?.trim() ? it.icon : parentItem.icon,
        image: it.image?.trim() ? it.image : parentItem.image,
        sourceId: it.sourceId || parentItem.sourceId,
        settings: it.settings || (parentItem.settings === 'magicgate' ? undefined : parentItem.settings),
      }));
      if (!trimmed) {
        return subitems;
      }
      const normQuery = removeDiacritics(trimmed).toLowerCase();
      return subitems.filter((it) => {
        const nameNorm = removeDiacritics(it.name).toLowerCase();
        const locNorm = removeDiacritics(it.location).toLowerCase();
        return nameNorm.includes(normQuery) || locNorm.includes(normQuery);
      });
    }

    // 2. Normal main mode
    const list: LauncherItem[] = [];

    // Special snippet prefix: ":" (e.g. :today, :time, :guid, :iban)
    // Snippets are ONLY shown when query starts with a colon
    if (trimmed.startsWith(':')) {
      const dynamicSnippets = getDynamicSnippets(trimmed, snippets);
      const normQuery = removeDiacritics(trimmed).toLowerCase();
      // Also find any custom items configured with name starting with ':'
      const customSnippets = items.filter((item) => {
        if (item.name?.startsWith(':')) {
          const meta = indexedSearchData.get(item);
          const nameNorm = meta ? meta.nameNorm : removeDiacritics(item.name).toLowerCase();
          const locNorm = meta ? meta.locNorm : removeDiacritics(item.location).toLowerCase();
          return nameNorm.includes(normQuery) || locNorm.includes(normQuery);
        }
        return false;
      });
      return [...dynamicSnippets, ...customSnippets];
    }

    // Special `/db ` and `/ftp ` interactive modes (triggered as soon as space is typed after command, or in Wox mode without slash)
    const rawTrimmedStart = query.trimStart();
    const allowDbNoSlash = Boolean(ssmsConfig?.allowWithoutSlash);
    const allowFtpNoSlash = Boolean(allowFtpWithoutSlash);

    const dbModeMatch = isSsmsActive
      ? rawTrimmedStart.match(allowDbNoSlash ? /^\/?(?:db|sql|ssms)\s+(.*)$/i : /^\/(?:db|sql|ssms)\s+(.*)$/i)
      : null;

    if (dbModeMatch && isSsmsActive) {
      const dbFilter = dbModeMatch[1].trim();
      const normFilter = removeDiacritics(dbFilter).toLowerCase();
      const localSrv = ssmsConfig?.localServer?.trim() || 'localhost';

      const filtered = normFilter
        ? precomputedDbCandidates.filter(
            (c) =>
              c.dbNorm.includes(normFilter) ||
              c.instNorm.includes(normFilter) ||
              c.srvNorm.includes(normFilter)
          )
        : precomputedDbCandidates;

      if (normFilter) {
        filtered.sort((a, b) => {
          // 1. Exact match
          const aExact = a.dbNorm === normFilter || a.instNorm === normFilter;
          const bExact = b.dbNorm === normFilter || b.instNorm === normFilter;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;

          // 2. DB name prefix match (critical for inline ghost-text autocomplete!)
          const aDbStarts = a.dbNorm.startsWith(normFilter);
          const bDbStarts = b.dbNorm.startsWith(normFilter);
          if (aDbStarts && !bDbStarts) return -1;
          if (!aDbStarts && bDbStarts) return 1;

          // 3. Instance name prefix match
          const aInstStarts = a.instNorm.startsWith(normFilter);
          const bInstStarts = b.instNorm.startsWith(normFilter);
          if (aInstStarts && !bInstStarts) return -1;
          if (!aInstStarts && bInstStarts) return 1;

          // 4. Word boundary match in DB name (e.g. MagicWare_ATour matches "atour")
          const aWord = a.dbWords.some((w) => w.startsWith(normFilter));
          const bWord = b.dbWords.some((w) => w.startsWith(normFilter));
          if (aWord && !bWord) return -1;
          if (!aWord && bWord) return 1;

          // 5. Recent rank
          const aRec = a.recentRank >= 0;
          const bRec = b.recentRank >= 0;
          if (aRec && !bRec) return -1;
          if (!aRec && bRec) return 1;
          if (aRec && bRec && a.recentRank !== b.recentRank) return a.recentRank - b.recentRank;

          // 6. Local SQL before remote
          if (a.isLocal && !b.isLocal) return -1;
          if (!a.isLocal && b.isLocal) return 1;

          return a.dbName.localeCompare(b.dbName);
        });
      }

      return filtered.slice(0, 120).map((c): LauncherItem => {
        const isRecent = c.recentRank >= 0;
        const targetSpec = `${c.dbServer}|${c.dbName}`;
        const shortSrv = c.displayServer.split(' - ')[0].trim();
        return {
          id: `ssms-db-${c.isLocal ? 'local' : 'mg'}-${c.dbServer}-${c.dbName}`,
          name: c.dbName,
          location: `${isRecent ? '★ Nedávné • ' : ''}${
            c.isLocal
              ? `Lokální SQL (${localSrv})`
              : `MagicGate • ${c.displayServer}${c.instanceName ? ` • instance: ${c.instanceName}` : ''}`
          }`,
          action: 'ssms-query',
          icon: 'database',
          settings: 'ssms',
          sourceId: 'ssms-db',
          shortcuts: c.isLocal
            ? ['Lokální SQL', localSrv]
            : [c.instanceName || 'MagicGate', shortSrv],
          info: {
            'Databáze': c.dbName,
            'DB Server': c.displayServer,
            'Typ': c.isLocal ? 'Lokální SQL Server' : `Vzdálená DB (${c.instanceName || 'MagicGate'})`,
            ...(c.adminUrl ? { 'Admin URL': c.adminUrl } : {}),
          },
          actions: [
            {
              name: `Otevřít dotaz v SSMS (${c.dbName})`,
              action: 'ssms-query',
              location: targetSpec,
              icon: 'database',
              settings: 'ssms',
            },
            {
              name: 'Zkopírovat název databáze',
              action: 'copy',
              location: c.dbName,
              icon: 'content_copy',
            },
            {
              name: 'Zkopírovat adresu DB serveru',
              action: 'copy',
              location: c.dbServer,
              icon: 'dns',
            },
            {
              name: 'Obnovit lokální databáze (sys.databases)',
              action: 'ssms-refresh-local',
              location: localSrv,
              icon: 'refresh',
            },
          ],
        };
      });
    }

    const ftpModeMatch = ftpEnabled
      ? rawTrimmedStart.match(allowFtpNoSlash ? /^\/?ftp\s+(.*)$/i : /^\/ftp\s+(.*)$/i)
      : null;
    if (ftpModeMatch) {
      const ftpFilter = ftpModeMatch[1].trim();
      const normFilter = removeDiacritics(ftpFilter).toLowerCase();

      const matchedFtp = normFilter
        ? precomputedFtpCandidates.filter(
            (c) =>
              c.nameNorm.includes(normFilter) ||
              c.ftpNorm.includes(normFilter) ||
              c.srvNorm.includes(normFilter)
          )
        : precomputedFtpCandidates;

      if (normFilter) {
        matchedFtp.sort((a, b) => {
          const aExact = a.nameNorm === normFilter;
          const bExact = b.nameNorm === normFilter;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          const aStarts = a.nameNorm.startsWith(normFilter);
          const bStarts = b.nameNorm.startsWith(normFilter);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return (a.item.name || '').localeCompare(b.item.name || '');
        });
      }

      return matchedFtp.slice(0, 120).map((c): LauncherItem => {
        const { item: it, ftpAddr, srvName, dbName, dbServer } = c;
        return {
          id: `mg-ftp-${it.id || it.name}`,
          name: it.name,
          location: `Zkopírovat FTP: ${ftpAddr}${srvName ? ` • Server: ${srvName}` : ''}`,
          action: 'copy',
          icon: 'folder_shared',
          settings: 'magicgate',
          sourceId: 'magicgate-ftp',
          shortcuts: [ftpAddr],
          info: {
            'FTP': ftpAddr,
            ...(it.info || {}),
          },
          actions: [
            {
              name: `Zkopírovat FTP adresu (${ftpAddr})`,
              action: 'copy',
              location: ftpAddr,
              icon: 'content_copy',
              settings: 'magicgate',
            },
            ...(isSsmsActive && dbName
              ? [
                  {
                    name: `Otevřít dotaz v SSMS (${dbName})`,
                    action: 'ssms-query',
                    location: `${dbServer}|${dbName}`,
                    icon: 'database',
                    settings: 'ssms' as const,
                  },
                ]
              : []),
          ],
        };
      });
    }

    // Special `/source ` interactive command mode
    const sourceModeMatch = rawTrimmedStart.match(/^\/(?:source|sources|zdroj|zdroje)(.*)$/i);
    if (sourceModeMatch) {
      const rawAfter = sourceModeMatch[1].trim();

      const addSourceItem: LauncherItem = {
        id: 'source-add-command',
        name: '➕ Přidat nový zdroj...',
        location: 'Spustit průvodce pro vytvoření nového lokálního, statického nebo API zdroje',
        action: 'create-source-wizard',
        icon: 'add_circle',
        priority: 9999,
        sourceId: 'source-manager',
        wizard: SOURCE_CREATE_WIZARD_DEFINITION,
      };

      // 1. /source add
      if (rawAfter.toLowerCase() === 'add') {
        return [addSourceItem];
      }

      // 2. /source (empty after) -> list all sources + addSourceItem
      if (!rawAfter) {
        const srcCards: LauncherItem[] = sources.map((s): LauncherItem => {
          const sItemsCount = items.filter((it) => it.sourceId === s.id).length;
          const typeLabel =
            s.type === 'file'
              ? 'Lokální JSON soubor'
              : s.type === 'api'
              ? 'REST API endpoint'
              : 'Statický interní seznam';
          const pathOrUrl =
            s.type === 'file'
              ? (s as FileSource).path
              : s.type === 'api'
              ? (s as ApiSource).url
              : `${sItemsCount} položek`;

          return {
            id: `source-card-${s.id}`,
            name: s.name,
            location: `${typeLabel} • ${pathOrUrl} (${sItemsCount} položek)`,
            action: 'enter-source-mode',
            icon: s.type === 'file' ? 'description' : s.type === 'api' ? 'cloud' : 'database',
            priority: -1.2,
            sourceId: 'source-manager',
            actions: [
              {
                name: `Otevřít zdroj „${s.name}“`,
                action: 'enter-source-mode',
                location: s.name,
                icon: 'folder_open',
              },
              {
                name: `Smazat zdroj „${s.name}“`,
                action: 'delete-source',
                location: s.id,
                icon: 'delete',
              },
            ],
          };
        });
        return [...srcCards, addSourceItem];
      }

      // 3. /source <sourcename> ...
      let matchedSource: DataSource | null = null;
      let queryRemainder = '';

      const quotedMatch = rawAfter.match(/^"([^"]+)"(?:\s+(.*))?$/);
      if (quotedMatch) {
        const targetName = quotedMatch[1].trim().toLowerCase();
        queryRemainder = quotedMatch[2] ? quotedMatch[2].trim() : '';
        matchedSource =
          sources.find((s) => s.name.toLowerCase() === targetName) ||
          sources.find((s) => s.name.toLowerCase().includes(targetName)) ||
          null;
      } else {
        for (const s of sources) {
          const sNameLower = s.name.toLowerCase();
          if (rawAfter.toLowerCase() === sNameLower) {
            matchedSource = s;
            queryRemainder = '';
            break;
          }
          if (rawAfter.toLowerCase().startsWith(sNameLower + ' ')) {
            matchedSource = s;
            queryRemainder = rawAfter.slice(sNameLower.length).trim();
            break;
          }
        }
        if (!matchedSource) {
          matchedSource =
            sources.find((s) => s.name.toLowerCase().includes(rawAfter.toLowerCase())) || null;
          if (matchedSource) {
            queryRemainder = '';
          }
        }
      }

      if (!matchedSource) {
        const normAfter = removeDiacritics(rawAfter).toLowerCase();
        const matchedSources = sources.filter((s) =>
          removeDiacritics(s.name).toLowerCase().includes(normAfter)
        );
        const filteredSrcCards = matchedSources.map((s): LauncherItem => {
          const sItemsCount = items.filter((it) => it.sourceId === s.id).length;
          const typeLabel =
            s.type === 'file'
              ? 'Lokální JSON soubor'
              : s.type === 'api'
              ? 'REST API endpoint'
              : 'Statický interní seznam';
          return {
            id: `source-card-${s.id}`,
            name: s.name,
            location: `${typeLabel} • ${sItemsCount} položek`,
            action: 'enter-source-mode',
            icon: s.type === 'file' ? 'description' : s.type === 'api' ? 'cloud' : 'database',
            priority: -1.2,
            sourceId: 'source-manager',
            actions: [
              {
                name: `Otevřít zdroj „${s.name}“`,
                action: 'enter-source-mode',
                location: s.name,
                icon: 'folder_open',
              },
              {
                name: `Smazat zdroj „${s.name}“`,
                action: 'delete-source',
                location: s.id,
                icon: 'delete',
              },
            ],
          };
        });
        return [...filteredSrcCards, addSourceItem];
      }

      // 3a. /source "<source>" delete
      if (queryRemainder.toLowerCase() === 'delete') {
        return [
          {
            id: `delete-source-confirm-${matchedSource.id}`,
            name: `🗑️ Smazat zdroj dat „${matchedSource.name}“?`,
            location: `Stiskněte Enter pro potvrzení odstranění zdroje (${matchedSource.type})`,
            action: 'delete-source-confirmed',
            icon: 'delete_forever',
            priority: -2,
            sourceId: matchedSource.id,
          },
        ];
      }

      // 3b. /source "<source>" add
      const isReadOnlyApi = matchedSource.type === 'api';
      const addItemToSourceCard: LauncherItem = {
        id: `add-item-to-${matchedSource.id}`,
        name: `➕ Přidat záznam do zdroje „${matchedSource.name}“...`,
        location: isReadOnlyApi
          ? 'API zdroje jsou pouze pro čtení – záznamy nelze přidávat'
          : `Spustit průvodce pro vytvoření nového záznamu ve zdroji ${matchedSource.name}`,
        action: isReadOnlyApi ? 'none' : 'add-source-item-wizard',
        icon: isReadOnlyApi ? 'block' : 'add_circle',
        priority: 9999,
        sourceId: 'source-manager',
        wizard: isReadOnlyApi ? undefined : SOURCE_ITEM_WIZARD_DEFINITION,
      };
      (addItemToSourceCard as any).__wizardInitialValues = {
        __sourceId: matchedSource.id,
      };

      if (queryRemainder.toLowerCase() === 'add') {
        return [addItemToSourceCard];
      }

      // 3c. List and filter items of matchedSource
      let sourceItems = items.filter((it) => it.sourceId === matchedSource!.id);

      // Direct item subcommands: /source "<source>" <item> delete | /source "<source>" <item> edit
      if (!isReadOnlyApi && queryRemainder) {
        const itemDeleteMatch = queryRemainder.match(/^(.*?)\s+(?:delete|smazat|remove)$/i);
        if (itemDeleteMatch) {
          const itemTarget = itemDeleteMatch[1].trim();
          const targetItem = sourceItems.find(
            (it) =>
              removeDiacritics(it.name || '').toLowerCase() === removeDiacritics(itemTarget).toLowerCase() ||
              removeDiacritics(it.name || '').toLowerCase().includes(removeDiacritics(itemTarget).toLowerCase())
          );
          if (targetItem) {
            return [
              {
                id: `delete-source-item-confirm-${targetItem.id || targetItem.name}`,
                name: `🗑️ Smazat záznam „${targetItem.name}“ ze zdroje „${matchedSource.name}“?`,
                location: 'Stiskněte Enter pro potvrzení trvalého odstranění záznamu ze zdroje',
                action: 'delete-source-item-confirmed',
                icon: 'delete_forever',
                priority: -2,
                sourceId: matchedSource.id,
                info: {
                  'Položka': targetItem.name,
                  'Zdroj': matchedSource.name,
                },
              },
            ];
          }
        }

        const itemEditMatch = queryRemainder.match(/^(.*?)\s+(?:edit|upravit)$/i);
        if (itemEditMatch) {
          const itemTarget = itemEditMatch[1].trim();
          const targetItem = sourceItems.find(
            (it) =>
              removeDiacritics(it.name || '').toLowerCase() === removeDiacritics(itemTarget).toLowerCase() ||
              removeDiacritics(it.name || '').toLowerCase().includes(removeDiacritics(itemTarget).toLowerCase())
          );
          if (targetItem) {
            const origIdx = items.findIndex((orig) => orig.sourceId === matchedSource!.id && orig.name === targetItem.name);
            const editItemCard: LauncherItem = {
              id: `edit-item-${targetItem.id || targetItem.name}`,
              name: `✏️ Upravit záznam „${targetItem.name}“ (${matchedSource.name})`,
              location: 'Stiskněte Enter pro spuštění průvodce úpravou záznamu',
              action: 'edit-source-item',
              icon: 'edit',
              priority: -2,
              sourceId: matchedSource.id,
              wizard: SOURCE_ITEM_WIZARD_DEFINITION,
            };
            (editItemCard as any).__wizardInitialValues = {
              __sourceId: matchedSource.id,
              __originalIndex: origIdx >= 0 ? origIdx : undefined,
              name: targetItem.name,
              action: (targetItem as any).__originalAction || targetItem.action || 'open',
              location: (targetItem as any).__originalLocation !== undefined ? (targetItem as any).__originalLocation : (targetItem.location || ''),
              icon: targetItem.icon || 'star',
              priority: targetItem.priority !== undefined ? targetItem.priority : 0,
            };
            return [editItemCard];
          }
        }
      }

      if (queryRemainder) {
        const cleanQ = removeDiacritics(queryRemainder).toLowerCase();
        sourceItems = sourceItems.filter((it) => {
          const cleanName = removeDiacritics(it.name || '').toLowerCase();
          const cleanLoc = removeDiacritics(it.location || '').toLowerCase();
          return cleanName.includes(cleanQ) || cleanLoc.includes(cleanQ);
        });
      }

      // Enhance source items with edit/delete actions if not API
      const enhancedItems: LauncherItem[] = sourceItems.map((it, idx) => {
        if (isReadOnlyApi) {
          return it;
        }
        const origIdx = items.findIndex((orig) => orig.sourceId === matchedSource!.id && orig.name === it.name);
        const itemActions: LauncherAction[] = [
          {
            name: `Upravit záznam „${it.name}“`,
            action: 'edit-source-item',
            icon: 'edit',
          },
          {
            name: `Smazat záznam „${it.name}“`,
            action: 'delete-source-item',
            icon: 'delete',
          },
          ...(it.actions ? it.actions : []),
        ];

        if (it.action === 'copy' && !itemActions.some((a) => a.action === 'copy')) {
          itemActions.push({
            name: `Zkopírovat obsah do schránky`,
            action: 'copy',
            location: it.location || it.name,
            icon: 'content_copy',
          });
        } else if ((it.action === 'open' || !it.action) && !itemActions.some((a) => a.action === 'open')) {
          itemActions.push({
            name: `Otevřít položku`,
            action: 'open',
            location: it.location || it.name,
            icon: 'open_in_new',
          });
        }

        const editCard: LauncherItem = {
          ...it,
          location: `${it.action ? `[${it.action}] ` : ''}${it.location || '—'} • Enter: Upravit, Ctrl+Enter: Spustit, Shift+Enter: Akce`,
          action: 'edit-source-item',
          wizard: SOURCE_ITEM_WIZARD_DEFINITION,
          actions: itemActions,
        };
        (editCard as any).__originalAction = it.action || 'open';
        (editCard as any).__originalLocation = it.location || '';
        (editCard as any).__wizardInitialValues = {
          __sourceId: matchedSource!.id,
          __originalIndex: origIdx >= 0 ? origIdx : idx,
          name: it.name,
          action: it.action || 'open',
          location: it.location || '',
          icon: it.icon || 'star',
          priority: it.priority !== undefined ? it.priority : 0,
        };
        return editCard;
      });

      if (!isReadOnlyApi) {
        return [...enhancedItems, addItemToSourceCard];
      }
      return enhancedItems;
    }

    // Special slash commands: DonkeyTools, MagicPlan, SSMS (/db) & MagicGate FTP (/ftp)
    // Commands are ONLY shown when query starts with a slash
    if (trimmed.startsWith('/')) {
      const dtCommands = donkeyToolsEnabled
        ? getDonkeyToolsCommands(trimmed, {
            colorMasterEnabled: isColorMasterActive,
            quickCapEnabled: isQuickCapActive,
            fastSnapEnabled: isQuickCapActive,
            screenRulerEnabled: isScreenRulerActive,
            easyClipEnabled: isEasyClipActive,
          })
        : [];

      const ssmsAndFtpCommands: LauncherItem[] = [];
      const slashCmd = trimmed.slice(1).trim().toLowerCase();

      // /db command - strictly offered ONLY when SSMS extension is enabled AND Ssms.exe is selected
      if (isSsmsActive) {
        const dbShortcuts = ['/db', '/sql', '/ssms'];
        if (
          slashCmd === '' ||
          'db'.includes(slashCmd) ||
          'sql'.includes(slashCmd) ||
          'ssms'.includes(slashCmd) ||
          'databaze'.includes(removeDiacritics(slashCmd)) ||
          dbShortcuts.some((s) => s.replace(/^\//, '').includes(slashCmd))
        ) {
          ssmsAndFtpCommands.push({
            id: 'ssms-db-command',
            name: 'Databáze – Otevřít dotaz v SSMS',
            location: 'Vypsat všechny lokální i vzdálené databáze a otevřít New Query v SSMS',
            action: 'enter-db-mode',
            icon: 'database',
            priority: -1.18,
            sourceId: 'ssms',
            shortcuts: dbShortcuts,
          });
        }
      }

      // /ftp command - offered when FTP section is enabled in MagicGate settings
      if (ftpEnabled && (magicgateEnabled || items.some((it) => isMagicGateItem(it) && it.info?.['FTP']))) {
        const ftpShortcuts = ['/ftp'];
        if (
          slashCmd === '' ||
          'ftp'.includes(slashCmd) ||
          ftpShortcuts.some((s) => s.replace(/^\//, '').includes(slashCmd))
        ) {
          ssmsAndFtpCommands.push({
            id: 'mg-ftp-command',
            name: 'FTP adresy instancí (MagicGate)',
            location: 'Vypsat instance a zkopírovat FTP adresu serveru do schránky',
            action: 'enter-ftp-mode',
            icon: 'folder_shared',
            priority: -1.16,
            sourceId: 'magicgate',
            shortcuts: ftpShortcuts,
          });
        }
      }

      const planCommands: LauncherItem[] = [];
      if (isMagicPlanActive) {
        const cmd = trimmed.slice(1).trim().toLowerCase();
        const shortcuts = ['/plan', '/magicplan'];
        if (cmd === '' || 'magicplan'.includes(cmd) || 'plan'.includes(cmd) || shortcuts.some((s) => s.replace(/^\//, '').includes(cmd))) {
          planCommands.push({
            id: 'magicplan-command',
            name: 'MagicPlan',
            location: 'Sledování a přehled interního plánu úkolů a fronty',
            action: 'magicplan',
            icon: 'calendar_month',
            priority: -1.15,
            sourceId: 'magicplan',
            shortcuts,
          });
        }
      }

      const feedbackCommands: LauncherItem[] = [];
      const fbUserShortcuts = ['/feedback', '/zpetnavazba', '/napady', '/chyba'];
      if (
        slashCmd === '' ||
        'feedback'.includes(slashCmd) ||
        'zpetnavazba'.includes(slashCmd) ||
        'napady'.includes(slashCmd) ||
        'chyba'.includes(slashCmd) ||
        fbUserShortcuts.some((s) => s.replace(/^\//, '').includes(slashCmd))
      ) {
        feedbackCommands.push({
          id: 'feedback-user-command',
          name: 'Zpětná vazba a nápady',
          location: 'Spustit průvodce vytvořením podnětu (vícekrokový režim)',
          action: 'feedback-wizard',
          icon: 'rate_review',
          priority: -1.1,
          sourceId: 'feedback',
          shortcuts: fbUserShortcuts,
          wizard: FEEDBACK_WIZARD_DEFINITION,
          actions: [
            {
              name: 'Otevřít přehled zpětné vazby',
              action: 'feedback-user',
              icon: 'open_in_new',
            },
          ],
        });
      }

      const isDevelopMode =
        typeof localStorage !== 'undefined' && localStorage.getItem('iadonkey_develop_mode') === 'true';
      if (isDevelopMode) {
        const fbDevShortcuts = ['/feedback-dev', '/feedback dev', '/zpetnavazba-dev'];
        if (
          slashCmd === '' ||
          'feedback-dev'.includes(slashCmd) ||
          'feedback dev'.includes(slashCmd) ||
          'dev'.includes(slashCmd) ||
          fbDevShortcuts.some((s) => s.replace(/^\//, '').includes(slashCmd))
        ) {
          feedbackCommands.push({
            id: 'feedback-dev-command',
            name: 'Správce zpětné vazby (DEV)',
            location: 'Správa všech podnětů, plánování verzí a změny stavů',
            action: 'feedback-dev',
            icon: 'rate_review',
            priority: -1.05,
            sourceId: 'feedback',
            shortcuts: fbDevShortcuts,
          });
        }
      }

      const githubCommands: LauncherItem[] = [];
      if (githubEnabled && hasGithubCredentials) {
        const ghShortcuts = ['/github', '/gh', '/repo'];
        const ghCmdBase = slashCmd.split(/\s+/)[0] || '';
        if (
          slashCmd === '' ||
          'github'.includes(ghCmdBase) ||
          'gh'.includes(ghCmdBase) ||
          'repo'.includes(ghCmdBase) ||
          'repozitar'.includes(removeDiacritics(ghCmdBase)) ||
          ghShortcuts.some((s) => s.replace(/^\//, '').includes(ghCmdBase))
        ) {
          githubCommands.push({
            id: 'github-create-repo-command',
            name: 'Vytvořit nový GitHub repozitář',
            location: 'Spustit průvodce založením nového repozitáře na GitHubu',
            action: 'github-create-repo-wizard',
            icon: 'create_new_folder',
            priority: -1.14,
            sourceId: 'github',
            shortcuts: ghShortcuts,
            wizard: GITHUB_CREATE_REPO_WIZARD_DEFINITION,
          });
        }
      const sourceCommands: LauncherItem[] = [];
      const srcShortcuts = ['/source', '/sources', '/zdroje', '/zdroj'];
      if (
        slashCmd === '' ||
        'source'.includes(slashCmd) ||
        'sources'.includes(slashCmd) ||
        'zdroje'.includes(slashCmd) ||
        'zdroj'.includes(slashCmd) ||
        srcShortcuts.some((s) => s.replace(/^\//, '').includes(slashCmd))
      ) {
        sourceCommands.push({
          id: 'source-overview-command',
          name: 'Zdroje dat – Procházení a správa',
          location: 'Vypsat nakonfigurované zdroje dat, filtrovat položky nebo spustit průvodce přidáním',
          action: 'enter-source-mode',
          icon: 'database',
          priority: -1.13,
          sourceId: 'source-manager',
          shortcuts: srcShortcuts,
        });
      }

      const allSlash = [...ssmsAndFtpCommands, ...dtCommands, ...planCommands, ...githubCommands, ...feedbackCommands, ...sourceCommands];
      if (allSlash.length > 0) {
        return allSlash;
      }
      return [];
    }

    // Prefix "git:": searches exclusively in git repositories
    const gitPrefixMatch = trimmed.match(/^git:\s*(.*)$/i);
    if (gitPrefixMatch) {
      const gitQuery = gitPrefixMatch[1].trim();
      const gitItems = items.filter((item) => indexedSearchData.get(item)?.isGit);

      if (!gitQuery) {
        return [...gitItems].sort((a, b) => {
          const pA = a.priority ?? 0;
          const pB = b.priority ?? 0;
          if (pA !== pB) return pA - pB;
          return (a.name || '').localeCompare(b.name || '');
        });
      }

      const normGitQuery = removeDiacritics(gitQuery).toLowerCase();
      const matchedGit = gitItems.filter((item) => {
        const meta = indexedSearchData.get(item);
        if (!meta) return false;
        return (
          meta.nameNorm.includes(normGitQuery) ||
          meta.locNorm.includes(normGitQuery) ||
          Boolean(meta.optionsNorm && meta.optionsNorm.includes(normGitQuery)) ||
          Boolean(meta.infoNorm && meta.infoNorm.includes(normGitQuery))
        );
      });

      matchedGit.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const mA = indexedSearchData.get(a);
        const mB = indexedSearchData.get(b);
        const aNorm = mA ? mA.nameNorm : '';
        const bNorm = mB ? mB.nameNorm : '';

        const aStarts = aNorm.startsWith(normGitQuery);
        const bStarts = bNorm.startsWith(normGitQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = mA ? mA.nameWords.some((w) => w.startsWith(normGitQuery)) : false;
        const bWordStarts = mB ? mB.nameWords.some((w) => w.startsWith(normGitQuery)) : false;
        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return (a.name || '').localeCompare(b.name || '');
      });

      return matchedGit;
    }

    // Prefix "magicgate:" (or "mg:"): searches exclusively in MagicGate items
    const mgPrefixMatch = trimmed.match(/^(?:magicgate|mg):\s*(.*)$/i);
    if (mgPrefixMatch) {
      const mgQuery = mgPrefixMatch[1].trim();
      const mgItems = items.filter((item) => indexedSearchData.get(item)?.isMg);

      if (!mgQuery) {
        return [...mgItems].sort((a, b) => {
          const pA = a.priority ?? 0;
          const pB = b.priority ?? 0;
          if (pA !== pB) return pA - pB;
          return (a.name || '').localeCompare(b.name || '');
        });
      }

      const normMgQuery = removeDiacritics(mgQuery).toLowerCase();
      const matchedMg = mgItems.filter((item) => {
        const meta = indexedSearchData.get(item);
        if (!meta) return false;
        return (
          meta.nameNorm.includes(normMgQuery) ||
          meta.locNorm.includes(normMgQuery) ||
          Boolean(meta.shortcutsNorm && meta.shortcutsNorm.includes(normMgQuery)) ||
          Boolean(meta.optionsNorm && meta.optionsNorm.includes(normMgQuery)) ||
          Boolean(meta.infoNorm && meta.infoNorm.includes(normMgQuery))
        );
      });

      matchedMg.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const mA = indexedSearchData.get(a);
        const mB = indexedSearchData.get(b);
        const aNorm = mA ? mA.nameNorm : '';
        const bNorm = mB ? mB.nameNorm : '';

        const aStarts = aNorm.startsWith(normMgQuery);
        const bStarts = bNorm.startsWith(normMgQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = mA ? mA.nameWords.some((w) => w.startsWith(normMgQuery)) : false;
        const bWordStarts = mB ? mB.nameWords.some((w) => w.startsWith(normMgQuery)) : false;
        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return (a.name || '').localeCompare(b.name || '');
      });

      return matchedMg;
    }

    // Prefix search across all registered SEARCH_ENGINES (e.g. g:, google:, s:, seznam:, w:, wiki:, ...)
    for (const engine of SEARCH_ENGINES) {
      const prefixPattern = new RegExp(`^(?:${engine.prefixes.join('|')}):\\s*(.*)$`, 'i');
      const prefixMatch = trimmed.match(prefixPattern);
      if (prefixMatch) {
        const targetQuery = prefixMatch[1].trim();
        const iconImage = engineFavicons[engine.id] || engine.defaultFaviconUrl;
        list.push({
          id: `${engine.id}-search-direct`,
          name: targetQuery ? `Hledat na ${engine.name}: "${targetQuery}"` : `Hledat na ${engine.name}...`,
          location: targetQuery
            ? engine.searchUrlTemplate.replace('{query}', encodeURIComponent(targetQuery))
            : engine.baseUrl,
          action: 'open',
          icon: engine.fallbackIcon,
          image: iconImage,
          priority: 100,
          sourceId: `engine-${engine.id}`,
        });
        return list;
      }
    }

    const tPref = (mlogTaskPrefix || 'T').trim();
    const rPref = (mlogRequestPrefix || 'R').trim();

    // Helper to build a LauncherItem for a MagicPlan task with actions and a single subitem
    const buildPlanTaskLauncherItem = (t: PlanTaskItem, taskPriority: number = -0.9): LauncherItem => {
      const cleanBase = (mlogBaseUrl || '').trim().replace(/\/+$/, '');
      const tDigits = t.taskIdentifier ? t.taskIdentifier.replace(/\D/g, '') : '';
      const rDigits = t.requirementId ? t.requirementId.replace(/\D/g, '') : '';

      const canonicalTaskCode = tDigits ? `${tPref}${tDigits}` : (t.taskIdentifier || '');
      const canonicalReqCode = rDigits ? `${rPref}${rDigits}` : (t.requirementId || '');
      const filterCode = canonicalTaskCode || canonicalReqCode || '';

      const taskUrl = cleanBase
        ? (canonicalTaskCode
          ? `${cleanBase}/${canonicalTaskCode}`
          : canonicalReqCode
          ? `${cleanBase}/${canonicalReqCode}`
          : t.url || magicPlanConfig?.url?.trim() || '')
        : (t.url || magicPlanConfig?.url?.trim() || '');

      // 1. Actions list (all 3 options converted to actions)
      const taskActions: LauncherAction[] = [];
      if (taskUrl) {
        taskActions.push({
          name: 'Otevřít úkol',
          action: 'open',
          location: taskUrl,
          icon: 'support_agent',
        });
      }
      taskActions.push({
        name: 'Kopírovat kód úlohy',
        action: 'copy',
        location: filterCode || t.taskId,
        icon: 'content_copy',
      });
      taskActions.push({
        name: 'Otevřít plán úkolů',
        action: 'magicplan',
        location: filterCode,
        icon: 'calendar_month',
      });

      // 2. Subitems (options) - only 1 item: the first one "Otevřít úkol"
      const taskOptions: LauncherItem[] = [];
      if (taskUrl) {
        taskOptions.push({
          id: `magicplan-subtask-open-${t.taskId}`,
          name: 'Otevřít úkol',
          action: 'open',
          location: taskUrl,
          icon: 'support_agent',
          sourceId: 'magicplan',
        });
      }

      return {
        id: `magicplan-task-${t.taskId}`,
        name: `${canonicalTaskCode ? `[${canonicalTaskCode}] ` : canonicalReqCode ? `[${canonicalReqCode}] ` : ''}${t.title}`,
        location: `${t.totalHours}h • ${t.userName || 'Nezařazeno'} • ${t.project || 'Projekt'} (MagicPlan)`,
        action: 'magicplan',
        icon: 'calendar_month',
        priority: taskPriority,
        sourceId: 'magicplan',
        options: taskOptions.length > 0 ? taskOptions : undefined,
        actions: taskActions,
      };
    };

    // Helper to find matching tasks in MagicPlanData
    const findMatchingPlanTasks = (searchStr: string, limit: number = 6, defaultPriority: number = -1.8): LauncherItem[] => {
      if (!magicPlanEnabled || !magicPlanData) return [];
      const cleanSearch = removeDiacritics(searchStr.trim().toLowerCase());
      if (!cleanSearch) return [];

      const searchDigits = cleanSearch.replace(/\D/g, '');
      const isDigitsOnly = /^\d+$/.test(cleanSearch);
      const isTPrefix = cleanSearch.startsWith(tPref.toLowerCase()) || cleanSearch.startsWith('t');
      const isRPrefix = cleanSearch.startsWith(rPref.toLowerCase()) || cleanSearch.startsWith('r');

      const effectivePlanCfg = currentMagicPlanConfig || magicPlanConfig;
      const currentUser = effectivePlanCfg?.currentUserColumn?.trim();
      const showOnlyMyTasks = effectivePlanCfg?.showAllTasks !== undefined
        ? !effectivePlanCfg.showAllTasks
        : Boolean(currentUser);

      const rawTasks = [...(magicPlanData.myTasks || []), ...(magicPlanData.unassignedTasks || [])];
      const allTasks = (showOnlyMyTasks && currentUser)
        ? rawTasks.filter((t) => isTaskForUser(t, currentUser, magicPlanData.availablePersons))
        : rawTasks;

      const seenTaskIds = new Set<string>();

      const matchedTasks = allTasks.filter((t: PlanTaskItem) => {
        if (!t || seenTaskIds.has(t.taskId)) return false;

        const tIdent = (t.taskIdentifier || '').toLowerCase();
        const rIdent = (t.requirementId || '').toLowerCase();
        const tDigits = tIdent.replace(/\D/g, '');
        const rDigits = rIdent.replace(/\D/g, '');
        const titleNorm = removeDiacritics(t.title || '').toLowerCase();
        const projNorm = removeDiacritics(t.project || '').toLowerCase();

        let isMatch = false;

        if (isDigitsOnly && searchDigits) {
          if ((tDigits && tDigits.includes(searchDigits)) || (rDigits && rDigits.includes(searchDigits))) {
            isMatch = true;
          } else if (titleNorm.includes(cleanSearch) || projNorm.includes(cleanSearch)) {
            isMatch = true;
          }
        } else if (isTPrefix && searchDigits) {
          if (tDigits && tDigits.includes(searchDigits)) {
            isMatch = true;
          } else if (tIdent.includes(cleanSearch)) {
            isMatch = true;
          } else if (titleNorm.includes(cleanSearch) || projNorm.includes(cleanSearch)) {
            isMatch = true;
          }
        } else if (isRPrefix && searchDigits) {
          if (rDigits && rDigits.includes(searchDigits)) {
            isMatch = true;
          } else if (rIdent.includes(cleanSearch)) {
            isMatch = true;
          } else if (titleNorm.includes(cleanSearch) || projNorm.includes(cleanSearch)) {
            isMatch = true;
          }
        } else {
          const idMatch = tIdent.includes(cleanSearch);
          const reqMatch = rIdent.includes(cleanSearch);
          const titleMatch = titleNorm.includes(cleanSearch);
          const projMatch = projNorm.includes(cleanSearch);
          if (idMatch || reqMatch || titleMatch || projMatch) {
            isMatch = true;
          }
        }

        if (isMatch) {
          seenTaskIds.add(t.taskId);
          return true;
        }
        return false;
      });

      return matchedTasks.slice(0, limit).map((t) => buildPlanTaskLauncherItem(t, defaultPriority));
    };

    // Prefix "taskmanager:" or "mlog:": searches exclusively in Taskmanager tickets and related items
    const tmPrefixMatch = trimmed.match(/^(?:taskmanager|mlog):\s*(.*)$/i);
    if (tmPrefixMatch) {
      const tmQuery = tmPrefixMatch[1].trim();
      const tmList: LauncherItem[] = [];

      if (mlogBaseUrl) {
        const cleanBase = mlogBaseUrl.trim().replace(/\/+$/, '');
        if (tmQuery) {
          const directTicket = detectMlogTicket(tmQuery, mlogBaseUrl, tPref, rPref);
          if (directTicket) {
            tmList.push(directTicket);
          }
          const numOnly = tmQuery.match(/^(\d+)$/);
          if (numOnly) {
            const id = numOnly[1];
            const taskItem = detectMlogTicket(`${tPref}${id}`, mlogBaseUrl, tPref, rPref);
            const reqItem = detectMlogTicket(`${rPref}${id}`, mlogBaseUrl, tPref, rPref);
            if (taskItem && !tmList.some((it) => it.id === taskItem.id)) tmList.push(taskItem);
            if (reqItem && !tmList.some((it) => it.id === reqItem.id)) tmList.push(reqItem);
          }
        } else {
          tmList.push({
            id: 'taskmanager-home',
            name: 'Otevřít Taskmanager',
            location: cleanBase,
            action: 'open',
            icon: 'support_agent',
            image: null,
            priority: -2,
            settings: null,
          });
        }
      }

      // Also include matching plan tasks in taskmanager search
      if (tmQuery) {
        const matchingPlan = findMatchingPlanTasks(tmQuery, 6, -1.8);
        tmList.push(...matchingPlan);
      }

      // Also filter any items that mention Taskmanager or this ticket
      if (tmQuery) {
        const norm = removeDiacritics(tmQuery).toLowerCase();
        const extraTm = items.filter((it) => {
          const meta = indexedSearchData.get(it);
          const n = meta ? meta.nameNorm : '';
          const l = meta ? meta.locNorm : '';
          const infoM = Boolean(meta?.infoNorm && meta.infoNorm.includes(norm));
          return (
            (it.sourceId === 'mlog' || it.settings === 'mlog' || n.includes('mlog') || n.includes('taskmanager') || infoM) &&
            (n.includes(norm) || l.includes(norm) || infoM)
          );
        });
        tmList.push(...extraTm);
      }

      return tmList;
    }

    // 0. Taskmanager ticket engine (active when mlogBaseUrl is configured)
    const mlogItem = detectMlogTicket(trimmed, mlogBaseUrl, tPref, rPref);
    if (mlogItem) {
      list.push(mlogItem);

      // Include matching plan tasks right under the main ticket action
      const matchingPlanTasks = findMatchingPlanTasks(trimmed, 6, -1.8);
      list.push(...matchingPlanTasks);

      // Also look for items that specifically reference this ticket in info
      const normTicket = removeDiacritics(trimmed.replace(/\s+/g, '')).toLowerCase();
      const referencingItems = items.filter((it) => {
        const meta = indexedSearchData.get(it);
        return Boolean(meta?.infoCompactNorm && meta.infoCompactNorm.includes(normTicket));
      });
      list.push(...referencingItems);
      return list;
    }

    // 0a. Taskmanager digits-only query (3 or more digits, e.g. 123 -> offers Task and Request with configured prefixes)
    const digitsOnlyMatch = trimmed.match(/^(\d{3,})$/);
    if (digitsOnlyMatch && (mlogBaseUrl || (magicPlanEnabled && magicPlanData))) {
      const numId = digitsOnlyMatch[1];
      if (mlogBaseUrl) {
        const taskItem = detectMlogTicket(`${tPref}${numId}`, mlogBaseUrl, tPref, rPref);
        const reqItem = detectMlogTicket(`${rPref}${numId}`, mlogBaseUrl, tPref, rPref);
        if (taskItem) list.push(taskItem);
        if (reqItem) list.push(reqItem);
      }

      // Include matching plan tasks right under the main T and R tasks
      const matchingPlanTasks = findMatchingPlanTasks(numId, 6, -1.8);
      list.push(...matchingPlanTasks);

      // Also look for items that specifically reference this ticket or number in info or name
      const tNum = `${tPref.toLowerCase()}${numId}`;
      const rNum = `${rPref.toLowerCase()}${numId}`;
      const referencingItems = items.filter((it) => {
        const meta = indexedSearchData.get(it);
        if (!meta) return false;
        if (
          meta.infoCompactNorm &&
          (meta.infoCompactNorm.includes(tNum) ||
            meta.infoCompactNorm.includes(rNum) ||
            meta.infoCompactNorm.includes(numId))
        ) {
          return true;
        }
        return meta.nameNorm.includes(numId);
      });
      list.push(...referencingItems);
      return list;
    }

    // 0b. Standalone Email -> Gmail compose engine (priority -1.5)
    const emailItem = detectEmail(trimmed);
    if (emailItem) {
      list.push(emailItem);
    }

    // 0c. ColorMaster regex color engine (priority -1.2, active when ColorMaster is enabled)
    if (isColorMasterActive) {
      const parsedColor = parseColorQuery(trimmed);
      if (parsedColor) {
        const colorItem = createColorLauncherItem(parsedColor, colorMasterConfig?.defaultFormat);
        list.push(colorItem);
      }
    }

    // 1. Calculator engine (priority -1)
    const calcItem = evaluateExpression(trimmed);
    if (calcItem) {
      list.push(calcItem);
    }

    // 2. Data items from JSON / API (min 2 characters or if query empty, wait until 2 chars)
    if (trimmed.length >= 2) {
      const normQuery = removeDiacritics(trimmed).toLowerCase();
      const matched = items.filter((item) => {
        // Exclude items starting with ':' from normal search (require leading colon)
        if (item.name?.startsWith(':')) {
          return false;
        }
        const meta = indexedSearchData.get(item);
        if (!meta) return false;
        return (
          meta.nameNorm.includes(normQuery) ||
          meta.locNorm.includes(normQuery) ||
          Boolean(meta.optionsNorm && meta.optionsNorm.includes(normQuery))
        );
      });

      // Sort according to priority ascending (smaller number = higher priority, default 0)
      matched.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const mA = indexedSearchData.get(a);
        const mB = indexedSearchData.get(b);
        const aNorm = mA ? mA.nameNorm : '';
        const bNorm = mB ? mB.nameNorm : '';

        // Sub-sort: exact start match comes first
        const aStarts = aNorm.startsWith(normQuery);
        const bStarts = bNorm.startsWith(normQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Sub-sort: word boundary match (e.g. "Adobe XD" when searching "xd", "Příkazový řádek" when searching "rad")
        const aWordStarts = mA ? mA.nameWords.some((w) => w.startsWith(normQuery)) : false;
        const bWordStarts = mB ? mB.nameWords.some((w) => w.startsWith(normQuery)) : false;
        if (aWordStarts && !bWordStarts) return -1;
        if (!aWordStarts && bWordStarts) return 1;

        return a.name.localeCompare(b.name);
      });

      list.push(...matched);
    }

    // 2.4. Feedback search item
    if (trimmed.length >= 2) {
      const normQ = removeDiacritics(trimmed.toLowerCase());
      if (
        ['feedback', 'zpetna vazba', 'zpetna', 'vazba', 'napady', 'napad', 'podnet', 'podnety', 'chyba', 'nahlasit'].some(
          (k) => k.includes(normQ) || normQ.includes(k)
        )
      ) {
        list.push({
          id: 'feedback-search-item',
          name: 'Zpětná vazba a nápady',
          location: 'Zadání podnětu, návrhu na vylepšení či nahlášení chyby',
          action: 'feedback-user',
          icon: 'rate_review',
          priority: -0.95,
          sourceId: 'feedback',
          shortcuts: ['/feedback', '/chyba', '/napad'],
        });
      }
    }

    // 2.5. MagicPlan tasks search (matches task title, R-code, T-code, or project)
    if (magicPlanEnabled && magicPlanData && trimmed.length >= 2) {
      const generalPlanTasks = findMatchingPlanTasks(trimmed, 6, -0.9);
      for (const pt of generalPlanTasks) {
        if (!list.some((it) => it.id === pt.id)) {
          list.push(pt);
        }
      }
    }

    // 3. URL match (priority 999)
    const urlItem = detectUrl(trimmed);
    if (urlItem) {
      // Don't duplicate if already in matched list
      const alreadyHasSameLocation = list.some(
        (i) => i.location?.toLowerCase() === urlItem.location?.toLowerCase()
      );
      if (!alreadyHasSameLocation) {
        list.push(urlItem);
      }
    }

    // 4. Default search engine item at the end of the list (priority 100)
    const effectiveEngineId = defaultSearchEngine !== undefined
      ? defaultSearchEngine
      : (searchGoogle !== false ? 'google' : 'none');

    if (effectiveEngineId && effectiveEngineId !== 'none' && trimmed.length >= 2 && !calcItem && !emailItem) {
      const chosenEngine = SEARCH_ENGINES.find((e) => e.id === effectiveEngineId);
      if (chosenEngine) {
        const iconImage = engineFavicons[chosenEngine.id] || chosenEngine.defaultFaviconUrl;
        list.push({
          id: `${chosenEngine.id}-search-${trimmed.toLowerCase()}`,
          name: `Hledat na ${chosenEngine.name}: "${trimmed}"`,
          location: chosenEngine.searchUrlTemplate.replace('{query}', encodeURIComponent(trimmed)),
          action: 'open',
          icon: chosenEngine.fallbackIcon,
          image: iconImage,
          priority: 100,
          sourceId: `engine-${chosenEngine.id}`,
        });
      }
    }

    return list;
  }, [
    query,
    items,
    indexedSearchData,
    precomputedDbCandidates,
    precomputedFtpCandidates,
    parentItem,
    searchGoogle,
    defaultSearchEngine,
    mlogBaseUrl,
    mlogTaskPrefix,
    mlogRequestPrefix,
    engineFavicons,
    magicPlanEnabled,
    magicPlanData,
    magicPlanConfig,
    currentMagicPlanConfig,
    snippets,
    donkeyToolsEnabled,
    isColorMasterActive,
    isQuickCapActive,
    isScreenRulerActive,
    isEasyClipActive,
    isMagicPlanActive,
    colorMasterConfig?.defaultFormat,
    isSsmsActive,
    ssmsConfig,
    localDatabases,
    magicgateEnabled,
    ftpEnabled,
    allowFtpWithoutSlash,
    githubEnabled,
    hasGithubCredentials,
  ]);

  const [renderLimit, setRenderLimit] = useState<number>(45);

  // Keep selected index within bounds or restore saved index when returning from subitems
  useEffect(() => {
    setRenderLimit(45);
    if (restoringIndexRef.current !== null) {
      const savedIdx = restoringIndexRef.current;
      restoringIndexRef.current = null;
      if (results.length > 0) {
        let targetIndex = savedIdx;
        if (savedParentItemRef.current) {
          const parent = savedParentItemRef.current;
          const foundIdx = results.findIndex(
            (r) =>
              (r.id && parent.id && r.id === parent.id) ||
              (r.name === parent.name && r.location === parent.location)
          );
          if (foundIdx !== -1) {
            targetIndex = foundIdx;
          }
          savedParentItemRef.current = null;
        }
        const bounded = Math.max(0, Math.min(targetIndex, results.length - 1));
        setSelectedIndex(bounded);
        if (bounded >= 35) {
          setRenderLimit(bounded + 20);
        }
        return;
      }
    }
    setSelectedIndex(0);
  }, [results]);

  // Expand renderLimit automatically when navigating down with keyboard
  useEffect(() => {
    if (selectedIndex >= renderLimit - 10 && renderLimit < results.length) {
      setRenderLimit(Math.min(results.length, Math.max(renderLimit + 45, selectedIndex + 20)));
    }
  }, [selectedIndex, renderLimit, results.length]);

  // Scroll selected item or action into view and keep scrollbar moving
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    if (wizardItem && isWizardSelectStep) {
      if (wizardSelectedOptionIndex === 0) {
        container.scrollTop = 0;
        return;
      }
      const activeEl = container.querySelector<HTMLElement>('[data-wizard-selected="true"]');
      if (activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - activeRect.top + 8);
        } else if (activeRect.bottom > containerRect.bottom) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + 8);
        }
      }
    } else if (actionsParentItem) {
      if (selectedActionIndex === 0) {
        container.scrollTop = 0;
        return;
      }
      const activeEl = container.querySelector<HTMLElement>('[data-action-selected="true"]');
      if (activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - activeRect.top + 8);
        } else if (activeRect.bottom > containerRect.bottom) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + 8);
        }
      }
    } else if (isEasyClipMode) {
      if (easyClipSelectedIndex === 0) {
        container.scrollTop = 0;
        return;
      }
      const activeEl = container.querySelector<HTMLElement>('[data-selected="true"]');
      if (activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - activeRect.top + 8);
        } else if (activeRect.bottom > containerRect.bottom) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + 8);
        }
      }
    } else {
      if (selectedIndex === 0) {
        container.scrollTop = 0;
        return;
      }
      const activeEl = container.querySelector<HTMLElement>('[data-selected="true"]');
      if (activeEl) {
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.top < containerRect.top) {
          container.scrollTop -= (containerRect.top - activeRect.top + 8);
        } else if (activeRect.bottom > containerRect.bottom) {
          container.scrollTop += (activeRect.bottom - containerRect.bottom + 8);
        }
      }
    }
  }, [
    selectedIndex,
    selectedActionIndex,
    actionsParentItem,
    isEasyClipMode,
    easyClipSelectedIndex,
    wizardItem,
    isWizardSelectStep,
    wizardSelectedOptionIndex,
  ]);

  // Smooth close helper - fades out in CSS before hiding native window
  const handleClose = () => {
    resetSpotlightState();
    setTimeout(() => {
      window.electronAPI?.hideWindow?.();
    }, 90);
  };

  // Execute selected item
  const handleExecute = async (item: LauncherItem) => {
    if (!item) return;

    const isCalculator = item.id === 'calculator-result' || item.icon === 'calculate';
    const isSourceCommandMode = Boolean(query.trimStart().match(/^\/(?:source|sources|zdroj|zdroje)/i)) || item.sourceId === 'source-manager';

    window.electronAPI?.logAction?.({
      type: 'action',
      title: `Vybrána položka: ${item.name}`,
      details: `Akce: ${item.action || 'open'}, cíl: ${isCalculator ? item.name : (item.location || item.name)}`,
      status: 'info',
    });

    if (item.action === 'enter-db-mode') {
      refreshLocalDatabases(false);
      setQuery('/db ');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    if (item.action === 'enter-ftp-mode') {
      setQuery('/ftp ');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    if (item.action === 'enter-source-mode') {
      if (item.id === 'source-overview-command') {
        setQuery('/source ');
      } else {
        const srcName = item.actions?.find((a) => a.action === 'enter-source-mode')?.location || item.name;
        setQuery(`/source "${srcName}" `);
      }
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    if (item.action === 'delete-source-confirmed') {
      const sId = item.sourceId || item.location;
      if (sId && window.electronAPI?.deleteSource) {
        await window.electronAPI.deleteSource(sId);
        setQuery('/source');
      }
      return;
    }

    if (item.action === 'delete-source-item-confirmed') {
      const sId = item.sourceId;
      const itemName = item.info?.['Položka'] || (item as any).__itemName;
      if (sId && itemName && window.electronAPI?.deleteSourceItem) {
        await window.electronAPI.deleteSourceItem({ sourceId: sId, itemName });
        const srcName = item.info?.['Zdroj'];
        if (srcName) {
          setQuery(`/source "${srcName}" `);
        } else {
          setQuery('/source');
        }
      }
      return;
    }

    if (item.action === 'edit-source-item') {
      const origIdx = items.findIndex((orig) => orig.sourceId === item.sourceId && orig.name === item.name);
      const wizardItem: LauncherItem = {
        name: `Upravit: ${item.name}`,
        wizard: SOURCE_ITEM_WIZARD_DEFINITION,
      };
      (wizardItem as any).__wizardInitialValues = {
        __sourceId: item.sourceId,
        __originalIndex: origIdx >= 0 ? origIdx : undefined,
        name: item.name,
        action: (item as any).__originalAction || item.action || 'open',
        location: (item as any).__originalLocation !== undefined ? (item as any).__originalLocation : (item.location || ''),
        icon: item.icon || 'star',
        priority: item.priority !== undefined ? item.priority : 0,
      };
      startWizard(wizardItem);
      return;
    }

    if (item.action === 'delete-source-item') {
      if (item.sourceId && window.electronAPI?.deleteSourceItem) {
        if (window.confirm(`Opravdu chcete smazat záznam „${item.name}“ ze zdroje?`)) {
          await window.electronAPI.deleteSourceItem({ sourceId: item.sourceId, itemName: item.name });
        }
      }
      return;
    }

    if (item.action === 'ssms-query') {
      const targetSpec =
        item.actions?.find((a) => a.action === 'ssms-query')?.location || item.location || '';
      const [srvPart, dbPart] = targetSpec.includes('|')
        ? targetSpec.split('|')
        : [ssmsConfig?.localServer || 'localhost', item.name];
      const effectiveSrv = srvPart || 'localhost';
      if (window.electronAPI?.openQueryInSsms && dbPart) {
        await window.electronAPI.openQueryInSsms({
          server: effectiveSrv,
          dbServer: effectiveSrv,
          database: dbPart,
          serverName: item.info?.['Server'],
          instanceName: item.info?.['Instance'] || (item.sourceId !== 'ssms-db' ? item.name : undefined),
          isLocal: item.id?.startsWith('ssms-db-local-'),
        });
      }
      handleClose();
      return;
    }

    if (item.wizard && Array.isArray(item.wizard.steps) && item.wizard.steps.length > 0) {
      startWizard(item);
      return;
    }

    if (item.action === 'pick-color') {
      await handlePickColor();
      return;
    }

    if (item.action === 'quickcap' || item.action === 'fastsnap') {
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await new Promise((r) => setTimeout(r, 110));
      await window.electronAPI?.resetAndHideSpotlight?.();
      const startFn = window.electronAPI?.startQuickCap || window.electronAPI?.startFastSnap;
      if (startFn) {
        await startFn();
      }
      return;
    }

    if (item.action === 'screenruler') {
      setIsDonkeyToolsOpen(false);
      setIsRevealed(false);
      await new Promise((r) => setTimeout(r, 110));
      await window.electronAPI?.resetAndHideSpotlight?.();
      if (window.electronAPI?.startScreenRuler) {
        await window.electronAPI.startScreenRuler();
      }
      return;
    }

    if (item.action === 'easyclip') {
      await enterEasyClip();
      return;
    }

    if (item.action === 'magicplan') {
      const planAction = item.actions?.find((a) => a.action === 'magicplan');
      const filter = planAction?.location || (item.id?.startsWith('magicplan-task-') && item.name.match(/\[([TR]\d+)\]/i)?.[1]) || undefined;
      await openMagicPlan(filter);
      return;
    }

    if (item.action === 'feedback-user') {
      await openFeedback('user');
      return;
    }

    if (item.action === 'feedback-dev') {
      await openFeedback('dev');
      return;
    }

    if (item.action === 'palette-bar') {
      const paletteName = item.location || 'Nová paleta';
      const paletteId = `palette-${Date.now()}`;
      setIsRevealed(false);
      await window.electronAPI?.resetAndHideSpotlight?.();
      if (window.electronAPI?.openPaletteBar) {
        await window.electronAPI.openPaletteBar({ paletteId, paletteName });
      }
      return;
    }

    if (item.action === 'palette-list') {
      enterPaletteMode();
      return;
    }

    if (item.id === 'colormaster-detected-color' && item.colorPreview) {
      const format = colorMasterConfig?.defaultFormat || 'hex';
      const parsed = parseColorQuery(item.colorPreview);
      const toCopy = parsed ? formatColorValue(parsed, format) : item.colorPreview;
      if (window.electronAPI) {
        try {
          await window.electronAPI.executeAction({
            action: 'copy',
            location: toCopy,
          });
        } catch (err) {
          console.error('Clipboard copy error via electronAPI:', err);
        }
      } else {
        await navigator.clipboard.writeText(toCopy);
      }
      handleClose();
      return;
    }

    if (item.action === 'copy' || item.action === 'paste') {
      const toCopy =
        item.sourceId === 'magicgate-ftp' && item.info?.['FTP']
          ? item.info['FTP']
          : isCalculator
          ? item.name
          : (item.location || item.name);
      const isSnippet = item.sourceId === 'snippet';
      if (isSnippet) {
        resetSpotlightState();
      }
      if (window.electronAPI) {
        try {
          await window.electronAPI.executeAction({
            action: isSnippet ? 'paste' : 'copy',
            location: toCopy,
            settings: item.settings,
            sourceId: item.sourceId,
            autoPaste: isSnippet,
          });
        } catch (err) {
          console.error('Clipboard copy error via electronAPI:', err);
        }
      } else {
        try {
          await navigator.clipboard.writeText(toCopy);
        } catch (err) {
          console.error('Clipboard copy error:', err);
        }
      }
      if (!isSnippet && !isSourceCommandMode) {
        handleClose();
      }
      return;
    }

    // Default action is 'open'
    const target = item.location || item.name;
    if (target) {
      const trimmed = target.trim();
      const isUrl = /^https?:\/\//i.test(trimmed) || /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/i.test(trimmed);

      // Revalidate favicon on execution for items using {favicon} placeholder or web URLs
      if (isUrl && (item.image === '{favicon}' || item.settings === 'magicgate' || item.settings === 'git' || item.sourceId === 'github')) {
        const fetchUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        try {
          const origin = new URL(fetchUrl).origin;
          window.electronAPI?.fetchFaviconForUrl?.(fetchUrl).then((dataUrl) => {
            if (dataUrl) {
              const currentCached = localStorage.getItem(`favicon:${origin}`);
              if (dataUrl !== currentCached) {
                try {
                  localStorage.setItem(`favicon:${origin}`, dataUrl);
                  window.dispatchEvent(new CustomEvent('favicon-cached', { detail: { origin, dataUrl } }));
                } catch {
                  // ignore localStorage quota error
                }
              }
            }
          });
        } catch {
          // ignore URL parsing error
        }
      }

      if (window.electronAPI) {
        try {
          await window.electronAPI.executeAction({
            action: item.action || 'open',
            location: trimmed,
            settings: item.settings,
          });
        } catch (err) {
          console.error('Failed to execute action via electronAPI:', err);
        }
      } else if (isUrl) {
        const fullUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        window.open(fullUrl, '_blank');
      }
    }

    if (!isSourceCommandMode) {
      handleClose();
    }
  };

  // Execute action from actions mode
  const handleExecuteAction = async (parent: LauncherItem, actionItem: LauncherAction) => {
    const actionType = actionItem.action;
    const effectiveSettings = actionItem.settings || parent.settings;
    const isCalculatorParent = parent.id === 'calculator-result' || parent.icon === 'calculate';
    const effectiveLocation = actionItem.location || (isCalculatorParent ? parent.name : parent.location) || '';

    window.electronAPI?.logAction?.({
      type: 'action',
      title: `Vyvolána akce: ${actionItem.name} (${parent.name})`,
      details: `Typ: ${actionType || 'open'}, cíl: ${effectiveLocation || '—'}`,
      status: 'info',
    });

    if (actionType === 'close') {
      exitActions();
      setQuery('');
      setSelectedIndex(0);
      handleClose();
      return;
    }

    if (actionType === 'ssms-query') {
      exitActions();
      const [srvPart, dbPart] = effectiveLocation.includes('|')
        ? effectiveLocation.split('|')
        : [ssmsConfig?.localServer || 'localhost', effectiveLocation || parent.name];
      const effectiveSrv = srvPart || 'localhost';
      if (window.electronAPI?.openQueryInSsms && dbPart) {
        await window.electronAPI.openQueryInSsms({
          server: effectiveSrv,
          dbServer: effectiveSrv,
          database: dbPart,
          serverName: parent.info?.['Server'],
          instanceName: parent.info?.['Instance'] || (parent.sourceId !== 'ssms-db' ? parent.name : undefined),
          isLocal: parent.id?.startsWith('ssms-db-local-'),
        });
      }
      handleClose();
      return;
    }

    if (actionType === 'ssms-refresh-local') {
      exitActions();
      refreshLocalDatabases(true);
      return;
    }

    if (actionType === 'clone' || actionType === 'clonerecursive') {
      exitActions();
      window.electronAPI?.openGitCloneWindow?.({
        repoName: parent.name,
        repoUrl: effectiveLocation,
        initialRecursive: actionType === 'clonerecursive',
      });
      setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 60);
      return;
    }

    if (actionType === 'mgclone' || actionType === 'mgclonerecursive') {
      exitActions();
      window.electronAPI?.openGitCloneWindow?.({
        repoName: parent.name,
        adminUrl: effectiveLocation,
        isInstanceMode: true,
        initialRecursive: true,
      });
      setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 60);
      return;
    }

    if (actionType === 'mgdownloadcontent') {
      exitActions();
      const adminUrl = effectiveLocation;
      if (adminUrl && instanceSourceCodesPath) {
        const cleanBase = instanceSourceCodesPath.trim().replace(/[\\/]+$/, '');
        const cleanInst = (parent.name || 'instance').trim().replace(/^[\\/]+|[\\/]+$/g, '');
        const sep = cleanBase.includes('/') && !cleanBase.includes('\\') ? '/' : '\\';
        const targetDir = `${cleanBase}${sep}${cleanInst}`;

        window.electronAPI?.openCmsDownloadWindow?.({
          instanceName: parent.name,
          adminUrl,
          targetDir,
        });
      }
      setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 60);
      return;
    }

    if (actionType === 'tune-color') {
      const colorToTune = effectiveLocation || parent.colorPreview || parent.name || '#6366f1';
      window.electronAPI?.openTuneColorWindow?.({ initialColor: colorToTune, source: 'spotlight' });
      window.electronAPI?.hideWindow?.();
      return;
    }

    if (actionType === 'copy') {
      if (window.electronAPI) {
        try {
          await window.electronAPI.executeAction({
            action: 'copy',
            location: effectiveLocation,
            settings: effectiveSettings,
          });
        } catch (err) {
          console.error('Clipboard copy error via electronAPI:', err);
        }
      } else {
        await navigator.clipboard.writeText(effectiveLocation);
      }
      exitActions();
      handleClose();
      return;
    }

    if (actionType === 'vscode') {
      exitActions();
      if (window.electronAPI?.openInVscode) {
        window.electronAPI.openInVscode(effectiveLocation);
      }
      setTimeout(() => {
        handleClose();
      }, 60);
      return;
    }

    if (actionType === 'android-studio') {
      exitActions();
      if (window.electronAPI?.openInAndroidStudio) {
        window.electronAPI.openInAndroidStudio(effectiveLocation);
      }
      setTimeout(() => {
        handleClose();
      }, 60);
      return;
    }

    if (actionType === 'set-primary-color') {
      applyPrimaryColor(effectiveLocation);
      if (window.electronAPI?.getConfig && window.electronAPI?.saveConfig) {
        const cfg = await window.electronAPI.getConfig();
        await window.electronAPI.saveConfig({ ...cfg, primaryColor: effectiveLocation });
      }
      exitActions();
      handleClose();
      return;
    }

    if (actionType === 'set-actions-color') {
      applyActionsColor(effectiveLocation);
      if (window.electronAPI?.getConfig && window.electronAPI?.saveConfig) {
        const cfg = await window.electronAPI.getConfig();
        await window.electronAPI.saveConfig({ ...cfg, actionsColor: effectiveLocation });
      }
      exitActions();
      handleClose();
      return;
    }

    if (actionType === 'edit-quickcap') {
      exitActions();
      if (window.electronAPI?.openQuickCapEditor) {
        await window.electronAPI.openQuickCapEditor(effectiveLocation);
      }
      handleClose();
      return;
    }

    if (actionType === 'open-paint') {
      exitActions();
      if (window.electronAPI) {
        await window.electronAPI.executeAction({
          action: 'open-paint',
          location: effectiveLocation,
        });
      }
      handleClose();
      return;
    }

    if (actionType === 'show-in-folder') {
      exitActions();
      if (window.electronAPI) {
        await window.electronAPI.executeAction({
          action: 'show-in-folder',
          location: effectiveLocation,
        });
      }
      handleClose();
      return;
    }

    if (actionType === 'magicplan') {
      exitActions();
      handleClose();
      await openMagicPlan(effectiveLocation || undefined);
      return;
    }

    if (actionType === 'feedback-user') {
      exitActions();
      handleClose();
      await openFeedback('user');
      return;
    }

    if (actionType === 'feedback-dev') {
      exitActions();
      handleClose();
      await openFeedback('dev');
      return;
    }

    if (actionType === 'enter-source-mode') {
      exitActions();
      setQuery(`/source "${actionItem.location || parent.name}" `);
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    if (actionType === 'delete-source') {
      exitActions();
      const sId = actionItem.location || parent.id?.replace('source-card-', '');
      if (sId && window.confirm(`Opravdu chcete smazat zdroj dat „${parent.name}“ ze seznamu?`)) {
        if (window.electronAPI?.deleteSource) {
          await window.electronAPI.deleteSource(sId);
          setQuery('/source');
        }
      }
      return;
    }

    if (actionType === 'edit-source-item') {
      exitActions();
      const origIdx = items.findIndex((orig) => orig.sourceId === parent.sourceId && orig.name === parent.name);
      const wizardItem: LauncherItem = {
        name: `Upravit: ${parent.name}`,
        wizard: SOURCE_ITEM_WIZARD_DEFINITION,
      };
      (wizardItem as any).__wizardInitialValues = {
        __sourceId: parent.sourceId,
        __originalIndex: origIdx >= 0 ? origIdx : undefined,
        name: parent.name,
        action: (parent as any).__originalAction || parent.action || 'open',
        location: (parent as any).__originalLocation !== undefined ? (parent as any).__originalLocation : (parent.location || ''),
        icon: parent.icon || 'star',
        priority: parent.priority !== undefined ? parent.priority : 0,
      };
      startWizard(wizardItem);
      return;
    }

    if (actionType === 'delete-source-item') {
      exitActions();
      const sId = parent.sourceId;
      if (sId && window.confirm(`Opravdu chcete smazat záznam „${parent.name}“ ze zdroje?`)) {
        if (window.electronAPI?.deleteSourceItem) {
          await window.electronAPI.deleteSourceItem({ sourceId: sId, itemName: parent.name });
        }
      }
      return;
    }

    // Default / 'open' action
    if (actionType === 'open' || !actionType) {
      exitActions();
      await handleExecute({
        name: actionItem.name,
        location: effectiveLocation,
        action: 'open',
        settings: effectiveSettings,
      });
      return;
    }

    // Any other action
    if (window.electronAPI) {
      await window.electronAPI.executeAction({
        action: actionType,
        location: effectiveLocation,
        settings: effectiveSettings,
      });
    }
    exitActions();
    handleClose();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 0. If in wizard mode
    if (wizardItem && currentWizardStep) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (wizardStepIndex > 0) {
          goToWizardStep(wizardStepIndex - 1);
        } else {
          exitWizard();
        }
        return;
      }

      if (e.key === 'Backspace' && query === '' && wizardStepIndex > 0) {
        e.preventDefault();
        goToWizardStep(wizardStepIndex - 1);
        return;
      }

      if (isWizardSelectStep) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (filteredWizardOptions.length > 0) {
            setWizardSelectedOptionIndex((prev) => (prev + 1) % filteredWizardOptions.length);
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (filteredWizardOptions.length > 0) {
            setWizardSelectedOptionIndex((prev) => (prev - 1 + filteredWizardOptions.length) % filteredWizardOptions.length);
          }
          return;
        }
      }

      // If user presses Ctrl+V on screenshot step, read clipboard directly
      if (e.ctrlKey && e.key.toLowerCase() === 'v' && currentWizardStep.dynamicOption === 'clipboard') {
        if (window.electronAPI?.getClipboardImage) {
          window.electronAPI.getClipboardImage().then((img) => {
            if (img && img.startsWith('data:image')) {
              submitCurrentWizardStep(img);
            }
          });
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        submitCurrentWizardStep();
        return;
      }

      return;
    }

    // If in actions mode
    if (actionsParentItem) {
      const actionsList = getItemActions(actionsParentItem);
      const allInfoEntries = Object.entries(actionsParentItem.info || {});
      const totalInfoPages = Math.ceil(allInfoEntries.length / INFO_ITEMS_PER_PAGE);

      if (e.key === 'ArrowRight') {
        if (totalInfoPages > 1) {
          e.preventDefault();
          setInfoPage((prev) => (prev < totalInfoPages - 1 ? prev + 1 : prev));
        }
      } else if (e.key === 'ArrowLeft') {
        if (totalInfoPages > 1) {
          e.preventDefault();
          setInfoPage((prev) => (prev > 0 ? prev - 1 : prev));
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedActionIndex((prev) => (actionsList.length > 0 ? (prev + 1) % actionsList.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedActionIndex((prev) => (actionsList.length > 0 ? (prev - 1 + actionsList.length) % actionsList.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = actionsList[selectedActionIndex];
        if (chosen) {
          handleExecuteAction(actionsParentItem, chosen);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isEyedropperRef.current) {
          isEyedropperRef.current = false;
          handleClose();
        } else {
          exitActions();
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        exitActions();
      }
      return;
    }

    // If in EasyClip mode
    if (isEasyClipMode) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredEasyClipItems.length === 0) return;
        if (e.shiftKey) {
          // Range selection with Shift
          const nextIndex = Math.min(easyClipSelectedIndex + 1, filteredEasyClipItems.length - 1);
          setEasyClipSelectedIndex(nextIndex);
          const start = Math.min(easyClipAnchorRef.current, nextIndex);
          const end = Math.max(easyClipAnchorRef.current, nextIndex);
          const newSet = new Set<string>();
          for (let i = start; i <= end; i++) {
            if (filteredEasyClipItems[i]) {
              newSet.add(filteredEasyClipItems[i].id);
            }
          }
          setSelectedEasyClipIds(newSet);
        } else {
          // Single navigation
          const nextIndex = (easyClipSelectedIndex + 1) % filteredEasyClipItems.length;
          setEasyClipSelectedIndex(nextIndex);
          easyClipAnchorRef.current = nextIndex;
          setSelectedEasyClipIds(new Set());
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredEasyClipItems.length === 0) return;
        if (e.shiftKey) {
          // Range selection with Shift
          const nextIndex = Math.max(0, easyClipSelectedIndex - 1);
          setEasyClipSelectedIndex(nextIndex);
          const start = Math.min(easyClipAnchorRef.current, nextIndex);
          const end = Math.max(easyClipAnchorRef.current, nextIndex);
          const newSet = new Set<string>();
          for (let i = start; i <= end; i++) {
            if (filteredEasyClipItems[i]) {
              newSet.add(filteredEasyClipItems[i].id);
            }
          }
          setSelectedEasyClipIds(newSet);
        } else {
          // Single navigation
          const nextIndex =
            (easyClipSelectedIndex - 1 + filteredEasyClipItems.length) % filteredEasyClipItems.length;
          setEasyClipSelectedIndex(nextIndex);
          easyClipAnchorRef.current = nextIndex;
          setSelectedEasyClipIds(new Set());
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey && selectedEasyClipIds.size <= 1) {
          const chosen = filteredEasyClipItems[easyClipSelectedIndex];
          if (chosen && chosen.type === 'image' && chosen.filePath) {
            const imgItem: LauncherItem = {
              id: `easyclip-img-${chosen.id}`,
              name: `Obrázek (${chosen.width ?? '?'} × ${chosen.height ?? '?'} px)`,
              location: chosen.filePath,
              icon: 'image',
              imagePreview: chosen.dataUrl,
              info: {
                'Rozměry': `${chosen.width ?? '?'} × ${chosen.height ?? '?'} px`,
                'Cesta': chosen.filePath,
              },
              actions: [
                {
                  name: 'Upravit',
                  action: 'edit-quickcap',
                  location: chosen.filePath,
                  icon: 'edit',
                },
                {
                  name: 'Otevřít',
                  action: 'open',
                  location: chosen.filePath,
                  icon: 'open_in_new',
                },
                {
                  name: 'Otevřít v malování',
                  action: 'open-paint',
                  location: chosen.filePath,
                  icon: 'draw',
                },
                {
                  name: 'Otevřít ve složce',
                  action: 'show-in-folder',
                  location: chosen.filePath,
                  icon: 'folder_open',
                },
              ],
            };
            setActionsParentItem(imgItem);
            setSelectedActionIndex(0);
            return;
          }
        }
        const shouldPaste = !e.ctrlKey && !isCtrlDown;
        if (selectedEasyClipIds.size > 1) {
          handleCopyMultipleEasyClipItems(shouldPaste);
        } else {
          const chosen = filteredEasyClipItems[easyClipSelectedIndex];
          if (chosen) {
            handleCopyEasyClipItem(chosen, shouldPaste);
          }
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedEasyClipIds.size > 1) {
          setSelectedEasyClipIds(new Set());
          easyClipAnchorRef.current = easyClipSelectedIndex;
        } else {
          exitEasyClip();
        }
        return;
      } else if (e.key === 'Delete') {
        e.preventDefault();
        if (selectedEasyClipIds.size > 1) {
          handleDeleteSelectedEasyClipItems();
        } else {
          const chosen = filteredEasyClipItems[easyClipSelectedIndex];
          if (chosen) {
            handleDeleteEasyClipItem(chosen.id);
          }
        }
      }
      return;
    }

    // If in PaletteMaster mode
    if (isPaletteMode) {
      if (isCreatingPalette) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const pName = query.trim();
          if (pName) {
            const pId = `palette-${Date.now()}`;
            const newPal: ColorPalette = {
              id: pId,
              name: pName,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              colors: [null, null, null, null, null],
            };
            if (window.electronAPI?.savePalette) {
              window.electronAPI.savePalette(newPal);
            }
            setIsRevealed(false);
            window.electronAPI?.resetAndHideSpotlight?.();
            const shouldOpenDetail = e.ctrlKey || isCtrlDown;
            if (shouldOpenDetail) {
              if (window.electronAPI?.openPaletteDetail) {
                window.electronAPI.openPaletteDetail({ paletteId: pId });
              }
            } else {
              if (window.electronAPI?.openPaletteBar) {
                window.electronAPI.openPaletteBar({ paletteId: pId, paletteName: pName });
              }
            }
            exitPaletteMode();
          }
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsCreatingPalette(false);
          setQuery('');
          setPaletteSelectedIndex(0);
          return;
        }
        return;
      }

      // Palette list navigation
      const totalPaletteItems = paletteListItems.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteSelectedIndex((prev) => (totalPaletteItems > 0 ? (prev + 1) % totalPaletteItems : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteSelectedIndex((prev) => (totalPaletteItems > 0 ? (prev - 1 + totalPaletteItems) % totalPaletteItems : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedItem = paletteListItems[paletteSelectedIndex];
        if (selectedItem?.type === 'add') {
          setIsCreatingPalette(true);
          if (!query.trim()) {
            setQuery('');
          }
        } else if (selectedItem?.type === 'palette') {
          const chosen = selectedItem.palette;
          if (chosen) {
            setIsRevealed(false);
            window.electronAPI?.resetAndHideSpotlight?.();
            const shouldOpenBar = e.ctrlKey || isCtrlDown;
            if (shouldOpenBar) {
              if (window.electronAPI?.openPaletteBar) {
                window.electronAPI.openPaletteBar({ paletteId: chosen.id, paletteName: chosen.name });
              }
            } else {
              if (window.electronAPI?.openPaletteDetail) {
                window.electronAPI.openPaletteDetail({ paletteId: chosen.id });
              }
            }
            exitPaletteMode();
          }
        }
        return;
      } else if (e.key === 'Delete') {
        e.preventDefault();
        const selectedItem = paletteListItems[paletteSelectedIndex];
        if (selectedItem?.type === 'palette') {
          handleDeletePalette(selectedItem.palette.id);
          if (paletteSelectedIndex >= totalPaletteItems - 1) {
            setPaletteSelectedIndex(Math.max(0, paletteSelectedIndex - 1));
          }
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitPaletteMode();
        return;
      }
      return;
    }

    // Ctrl+Backspace or Alt+Backspace -> completely clear search query string
    if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault();
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    // F2 -> Edit source item
    if (e.key === 'F2') {
      const currentItem = results[selectedIndex];
      if (currentItem?.actions?.some((a) => a.action === 'edit-source-item') || currentItem?.action === 'edit-source-item') {
        e.preventDefault();
        const origIdx = items.findIndex((orig) => orig.sourceId === currentItem.sourceId && orig.name === currentItem.name);
        const wizardItem: LauncherItem = {
          name: `Upravit: ${currentItem.name}`,
          wizard: SOURCE_ITEM_WIZARD_DEFINITION,
        };
        (wizardItem as any).__wizardInitialValues = {
          __sourceId: currentItem.sourceId,
          __originalIndex: origIdx >= 0 ? origIdx : undefined,
          name: currentItem.name,
          action: (currentItem as any).__originalAction || currentItem.action || 'open',
          location: (currentItem as any).__originalLocation !== undefined ? (currentItem as any).__originalLocation : (currentItem.location || ''),
          icon: currentItem.icon || 'star',
          priority: currentItem.priority !== undefined ? currentItem.priority : 0,
        };
        startWizard(wizardItem);
        return;
      }
    }

    // Shift+Delete -> Delete source item
    if (e.key === 'Delete' && e.shiftKey) {
      const currentItem = results[selectedIndex];
      if (currentItem?.actions?.some((a) => a.action === 'delete-source-item')) {
        e.preventDefault();
        if (window.confirm(`Opravdu chcete smazat záznam „${currentItem.name}“ ze zdroje?`)) {
          if (currentItem.sourceId && window.electronAPI?.deleteSourceItem) {
            window.electronAPI.deleteSourceItem({ sourceId: currentItem.sourceId, itemName: currentItem.name });
          }
        }
        return;
      }
    }

    // Tab or ArrowRight at end of input -> apply predictive ghost-text autocomplete (or expand /db, /ftp, /source commands)
    if (e.key === 'Tab') {
      if (ghostAutocomplete) {
        e.preventDefault();
        setQuery(ghostAutocomplete.fullCompletion);
        return;
      }
      const currentItem = results[selectedIndex];
      if (currentItem?.action === 'enter-db-mode') {
        e.preventDefault();
        refreshLocalDatabases(false);
        setQuery('/db ');
        setSelectedIndex(0);
        return;
      }
      if (currentItem?.action === 'enter-ftp-mode') {
        e.preventDefault();
        setQuery('/ftp ');
        setSelectedIndex(0);
        return;
      }
      if (currentItem?.action === 'enter-source-mode') {
        e.preventDefault();
        const srcName = currentItem.actions?.find((a) => a.action === 'enter-source-mode')?.location || currentItem.name;
        setQuery(`/source "${srcName}" `);
        setSelectedIndex(0);
        return;
      }
    }

    if (
      e.key === 'ArrowRight' &&
      ghostAutocomplete &&
      inputRef.current &&
      inputRef.current.selectionStart === query.length &&
      inputRef.current.selectionEnd === query.length
    ) {
      e.preventDefault();
      setQuery(ghostAutocomplete.fullCompletion);
      return;
    }

    // If inside subitems and search query is empty, Backspace returns to previous main level
    if (e.key === 'Backspace' && query === '' && parentItem) {
      e.preventDefault();
      exitSubitems();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentItem = results[selectedIndex];
      if (!currentItem) return;

      // 1. Shift + Enter -> Enter ACTIONS & INFO mode
      if (e.shiftKey) {
        if (hasItemActionsOrInfo(currentItem)) {
          enterActions(currentItem);
        }
        return;
      }

      // 2. Ctrl + Enter -> Directly execute 1st subitem or original action
      if (e.ctrlKey) {
        if (currentItem.options && currentItem.options.length > 0) {
          handleExecute(currentItem.options[0]);
          return;
        }
        const origAction = currentItem.actions?.find((a) => a.action !== 'edit-source-item' && a.action !== 'delete-source-item');
        if (origAction) {
          handleExecuteAction(currentItem, origAction);
          return;
        }
        return;
      }

      // 3. Alt + Enter -> Enter SUBITEMS navigation (old Shift+Enter behavior, 2nd subitem removed)
      if (e.altKey) {
        if (currentItem.options && currentItem.options.length > 0) {
          enterSubitems(currentItem);
        }
        return;
      }

      // Default Enter -> Execute selected item
      handleExecute(currentItem);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (isDonkeyToolsOpen) {
        setIsDonkeyToolsOpen(false);
      } else if (parentItem) {
        exitSubitems();
      } else {
        handleClose();
      }
    }
  };

  // Predictive inline ghost-text autocomplete for `/db <výraz>` and `/ftp <výraz>`
  const ghostAutocomplete = useMemo((): { ghostSuffix: string; fullCompletion: string } | null => {
    if (actionsParentItem || wizardItem || isPaletteMode || isEasyClipMode || parentItem) {
      return null;
    }
    const allowDbNoSlash = Boolean(ssmsConfig?.allowWithoutSlash);
    const allowFtpNoSlash = Boolean(allowFtpWithoutSlash);

    const dbMatch = isSsmsActive
      ? query.match(
          allowDbNoSlash
            ? /^(\s*\/?(?:db|sql|ssms)\s+)(.+)$/i
            : /^(\s*\/(?:db|sql|ssms)\s+)(.+)$/i
        )
      : null;
    const ftpMatch = !dbMatch && ftpEnabled
      ? query.match(allowFtpNoSlash ? /^(\s*\/?ftp\s+)(.+)$/i : /^(\s*\/ftp\s+)(.+)$/i)
      : null;
    const sourceMatch = !dbMatch && !ftpMatch
      ? query.match(/^(\s*\/(?:source|sources|zdroj|zdroje)\s+)(.+)$/i)
      : null;

    const activeMatch = dbMatch || ftpMatch || sourceMatch;
    if (!activeMatch) return null;

    const prefix = activeMatch[1];
    const rawTypedArg = activeMatch[2];
    const typedArg = rawTypedArg.replace(/^["']/, '');
    if (!typedArg || /\s$/.test(rawTypedArg)) return null;

    const currentItem = results[selectedIndex] || results[0];
    if (!currentItem || !currentItem.name) return null;

    const candidate = currentItem.name;
    if (
      candidate.toLowerCase().startsWith(typedArg.toLowerCase()) &&
      candidate.length > typedArg.length
    ) {
      const fullCompletion = sourceMatch
        ? `${prefix}"${candidate}" `
        : `${prefix}${candidate}`;
      return {
        ghostSuffix: candidate.slice(typedArg.length),
        fullCompletion,
      };
    }
    return null;
  }, [
    query,
    results,
    selectedIndex,
    actionsParentItem,
    wizardItem,
    isPaletteMode,
    isEasyClipMode,
    parentItem,
    isSsmsActive,
    ssmsConfig?.allowWithoutSlash,
    ftpEnabled,
    allowFtpWithoutSlash,
  ]);

  const handleKeyDownRef = useRef(handleKeyDown);
  handleKeyDownRef.current = handleKeyDown;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target !== inputRef.current) {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
        }
        handleKeyDownRef.current(e as unknown as React.KeyboardEvent);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Click on result item (supporting Shift, Ctrl, and Alt modifiers)
  const handleItemClick = (item: LauncherItem, e: React.MouseEvent) => {
    // 1. Shift + Click -> Enter ACTIONS & INFO mode
    if (e.shiftKey) {
      if (hasItemActionsOrInfo(item)) {
        enterActions(item);
      }
      return;
    }

    // 2. Ctrl + Click -> Execute 1st subitem
    if (e.ctrlKey) {
      if (item.options && item.options.length > 0) {
        handleExecute(item.options[0]);
      }
      return;
    }

    // 3. Alt + Click -> Enter SUBITEMS navigation
    if (e.altKey) {
      if (item.options && item.options.length > 0) {
        enterSubitems(item);
      }
      return;
    }

    // Default Click
    handleExecute(item);
  };

  // Subtitle rendering with live modifier highlighting for subitems
  const renderSubtitle = (item: LauncherItem, isSelected: boolean) => {
    if (parentItem) {
      return <span className="text-gray-400 truncate">{item.location || item.name}</span>;
    }
    if (item.sourceId === 'snippet') {
      return (
        <span className="text-gray-400 truncate">
          {item.location ? item.location.replace(/\r?\n/g, ' ↵ ') : '(podpis zatím nevyplněn v Nastavení)'}
        </span>
      );
    }
    if (item.priority === 99) {
      return <span className="text-gray-400 truncate">Aplikace Windows</span>;
    }

    const sub1 = item.options?.[0];

    if (!sub1) {
      return <span className="text-gray-400 truncate">{item.location || ''}</span>;
    }

    const isSub1Active = isSelected && isCtrlDown && Boolean(sub1);
    const isMainActive = !isSub1Active;

    return (
      <div className="flex items-center gap-1.5 min-w-0 w-full overflow-hidden">
        {item.location && (
          <span
            title={item.location}
            className={`transition-colors duration-150 ${
              isMainActive
                ? `shrink-0 whitespace-nowrap ${isSelected ? 'text-white font-medium' : 'text-gray-300 font-medium'}`
                : 'truncate min-w-0 text-gray-500'
            }`}
          >
            {item.location}
          </span>
        )}

        {sub1 && (
          <>
            <span className="text-gray-600 shrink-0 select-none">|</span>
            <span
              title={`${sub1.name}${sub1.location ? `: ${sub1.location}` : ''}`}
              className={`transition-colors duration-150 ${
                isSub1Active
                  ? `shrink-0 whitespace-nowrap ${isSelected ? 'text-white font-medium' : 'text-gray-300 font-medium'}`
                  : 'truncate min-w-0 text-gray-500'
              }`}
            >
              {sub1.name}{sub1.location ? `: ${sub1.location}` : ''}
            </span>
          </>
        )}
      </div>
    );
  };

  const trimmedQuery = query.trim();
  const rawQueryStart = query.trimStart();
  const isGitPrefix = Boolean(trimmedQuery.match(/^git:/i));
  const isMagicGatePrefix = Boolean(trimmedQuery.match(/^(?:magicgate|mg):/i));
  const isDbPrefix = Boolean(
    isSsmsActive &&
      rawQueryStart.match(
        ssmsConfig?.allowWithoutSlash ? /^\/?(?:db|sql|ssms)\s+/i : /^\/(?:db|sql|ssms)\s+/i
      )
  );
  const isFtpPrefix = Boolean(
    ftpEnabled &&
      rawQueryStart.match(allowFtpWithoutSlash ? /^\/?ftp\s+/i : /^\/ftp\s+/i)
  );
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tPrefEsc = escapeRegex((mlogTaskPrefix || 'T').trim());
  const rPrefEsc = escapeRegex((mlogRequestPrefix || 'R').trim());
  const isMlogMode = Boolean(
    mlogBaseUrl?.trim() &&
      trimmedQuery.match(new RegExp(`^(?:taskmanager:|mlog:|(${tPrefEsc}|${rPrefEsc})\\s*\\d+|\\d{3,})$`, 'i'))
  );

  const handleSettingsMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isLongPressRef.current = false;
    settingsHoldStartRef.current = performance.now();
    if (settingsHoldRafRef.current) {
      cancelAnimationFrame(settingsHoldRafRef.current);
    }
    const HOLD_START_DELAY = 120; // Ignore clicks under 120ms to prevent visual flicker
    const HOLD_TOTAL_DURATION = 3000;
    const tick = () => {
      const elapsed = performance.now() - settingsHoldStartRef.current;
      if (elapsed < HOLD_START_DELAY) {
        settingsHoldRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const activeDuration = HOLD_TOTAL_DURATION - HOLD_START_DELAY;
      const pct = Math.min(100, ((elapsed - HOLD_START_DELAY) / activeDuration) * 100);
      setSettingsHoldProgress(pct);
      if (elapsed < HOLD_TOTAL_DURATION) {
        settingsHoldRafRef.current = requestAnimationFrame(tick);
      } else {
        isLongPressRef.current = true;
        setSettingsHoldProgress(0);
        settingsHoldRafRef.current = null;
        window.electronAPI?.openPowerWindow?.();
      }
    };
    settingsHoldRafRef.current = requestAnimationFrame(tick);
  };

  const cancelSettingsHold = () => {
    if (settingsHoldRafRef.current) {
      cancelAnimationFrame(settingsHoldRafRef.current);
      settingsHoldRafRef.current = null;
    }
    const elapsed = performance.now() - settingsHoldStartRef.current;
    if (elapsed > 400) {
      // User was intentionally holding and released before finish
      isLongPressRef.current = true;
    }
    setSettingsHoldProgress(0);
  };

  const handleSettingsMouseUp = () => {
    cancelSettingsHold();
  };

  const handleSettingsMouseLeave = () => {
    cancelSettingsHold();
  };

  const handleSettingsClick = () => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    window.electronAPI?.logAction?.({
      type: 'window',
      title: 'Otevření okna Nastavení',
      details: 'Kliknutí na ozubené kolečko v záhlaví Spotlightu',
      status: 'info',
    });
    setIsRevealed(false);
    window.electronAPI?.openSettingsWindow?.();
    setTimeout(() => {
      window.electronAPI?.hideWindow?.();
    }, 90);
  };

  return (
    <div
      className={`w-full max-w-[740px] mx-auto flex flex-col m3-surface-main text-gray-100 spotlight-card overflow-visible relative ${
        isRevealed ? 'revealed' : ''
      }`}
      onMouseUp={handleRefocusInput}
      onClick={handleRefocusInput}
    >
      {/* Top Search Input Bar - M3 Borderless with soft layer */}
      <div className="flex items-center px-4 py-3 gap-3 bg-transparent">
        <div className="w-9 h-9 rounded-full bg-white/[0.05] shadow-sm flex items-center justify-center shrink-0">
          <span
            className={`material-symbols-outlined select-none text-[20px] transition-colors duration-150 ${
              wizardItem
                ? 'text-purple-400'
                : isPaletteMode
                ? 'text-rose-400'
                : isEasyClipMode
                ? 'text-rose-400'
                : actionsParentItem
                ? 'm3-actions-text'
                : parentItem
                ? 'm3-primary-text'
                : isDbPrefix
                ? 'text-teal-400'
                : isFtpPrefix
                ? 'text-amber-400'
                : isMlogMode
                ? 'text-indigo-400'
                : isGitPrefix
                ? 'text-emerald-400'
                : isMagicGatePrefix
                ? 'text-amber-400'
                : 'text-gray-400'
            }`}
          >
            {wizardItem
              ? getWizardStepIcon(currentWizardStep || undefined, wizardItem.icon || undefined)
              : isPaletteMode
              ? 'palette'
              : isEasyClipMode
              ? 'content_paste'
              : actionsParentItem
              ? 'bolt'
              : parentItem
              ? 'subdirectory_arrow_right'
              : isDbPrefix
              ? 'database'
              : isFtpPrefix
              ? 'folder_shared'
              : isMlogMode
              ? 'support_agent'
              : isGitPrefix
              ? 'folder_code'
              : isMagicGatePrefix
              ? 'security'
              : 'search'}
          </span>
        </div>
        <div className="relative flex-1 flex items-center min-w-0">
          {ghostAutocomplete && !actionsParentItem && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center pointer-events-none overflow-hidden whitespace-pre text-[17px] font-normal tracking-normal select-none"
            >
              <span className="text-transparent">{query}</span>
              <span className="text-gray-500/75">{ghostAutocomplete.ghostSuffix}</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            value={actionsParentItem ? '' : query}
            readOnly={Boolean(actionsParentItem)}
            onChange={(e) => {
              if (!actionsParentItem) setQuery(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              wizardItem
                ? currentWizardStep?.placeholder || `${currentWizardStep?.title || 'Zadejte hodnotu'}...`
                : isPaletteMode
                ? isCreatingPalette
                  ? 'Název nové palety (Enter spustí lištu, Ctrl+Enter otevře detail)...'
                  : 'Hledat v barevných paletách...'
                : isEasyClipMode
                ? 'Hledat v historii schránky (EasyClip)...'
                : actionsParentItem
                ? `Akce položky: „${actionsParentItem.name}“`
                : parentItem
                ? `Hledat v podpoložkách „${parentItem.name}“...`
                : isDbPrefix
                ? 'Hledat v lokálních a MagicGate databázích (Enter otevře dotaz v SSMS)...'
                : isFtpPrefix
                ? 'Hledat FTP adresu instance (Enter zkopíruje do schránky)...'
                : isMlogMode
                ? 'Otevřít v Taskmanageru...'
                : isMagicGatePrefix
                ? 'Hledat v MagicGate instancích...'
                : isGitPrefix
                ? 'Hledat v repozitářích...'
                : 'Hledejte (min. 2 znaky), zadejte výpočet nebo URL...'
            }
            className="w-full bg-transparent text-[17px] text-[#f8fafc] placeholder:text-gray-500 placeholder:font-normal outline-none font-normal tracking-normal relative z-10"
            autoFocus
            spellCheck={false}
          />
        </div>
        {ghostAutocomplete && !actionsParentItem && (
          <button
            type="button"
            onClick={() => {
              setQuery(ghostAutocomplete.fullCompletion);
              inputRef.current?.focus();
            }}
            className="px-2 py-0.5 rounded-full bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 text-[10px] font-mono font-semibold shrink-0 transition cursor-pointer select-none"
            title="Doplnit celý název (Tab)"
          >
            Tab ↹
          </button>
        )}
        {wizardItem ? (
          <div className="flex items-center gap-2">
            <button
              onClick={exitWizard}
              className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-gray-400 hover:text-white transition flex items-center justify-center cursor-pointer shrink-0"
              title="Ukončit průvodce (Esc)"
            >
              <span className="material-symbols-outlined text-[18px] leading-none select-none">close</span>
            </button>
          </div>
        ) : actionsParentItem ? (
          <button
            onClick={exitActions}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-gray-400 hover:text-white transition flex items-center justify-center cursor-pointer shrink-0"
            title="Zavřít nabídku akcí (Esc)"
          >
            <span className="material-symbols-outlined text-[18px] leading-none select-none">close</span>
          </button>
        ) : query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className={`w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] ${
              isEasyClipMode ? 'text-white' : 'text-gray-400 hover:text-white'
            } transition flex items-center justify-center cursor-pointer shrink-0`}
            title="Vymazat dotaz"
          >
            <span className="material-symbols-outlined text-[18px] leading-none select-none">close</span>
          </button>
        ) : null}

        {/* DonkeyTools Quick Tools Button & Subextensions Flyout */}
        {showDonkeyToolsIcon && !wizardItem && (
          <div className="relative shrink-0 self-center" ref={donkeyToolsRef}>
            <button
              type="button"
              onClick={() => {
                const nextState = !isDonkeyToolsOpen;
                setIsDonkeyToolsOpen(nextState);
                window.electronAPI?.logAction?.({
                  type: 'ui',
                  title: nextState ? 'Otevření nabídky DonkeyTools' : 'Zavření nabídky DonkeyTools',
                  details: 'Kliknutí na tlačítko rychlých nástrojů v záhlaví Spotlightu',
                  status: 'info',
                });
              }}
              className={`relative w-8 h-8 rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-sm ${
                isDonkeyToolsOpen
                  ? 'm3-primary-pill shadow-md'
                  : 'bg-white/[0.04] hover:bg-white/[0.09] text-gray-300 hover:text-white'
              }`}
              title="DonkeyTools – Rychlé nástroje"
            >
              <span className="material-symbols-outlined text-[19px] leading-none select-none">
                construction
              </span>
            </button>

            {/* Subextensions vertical buttons list */}
            {isDonkeyToolsOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 flex flex-col items-center gap-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                {/* ColorMaster Subextension - Eyedropper */}
                {isColorMasterActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDonkeyToolsOpen(false);
                      handlePickColor();
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-[#1c1d27] hover:bg-[#282a38] text-gray-200 hover:text-white shadow-lg hover:scale-105 active:scale-95"
                    title="Eyedropper – Kapátko (nabrat barvu z obrazovky)"
                  >
                    <span className="material-symbols-outlined text-[19px] leading-none select-none">
                      colorize
                    </span>
                  </button>
                )}

                {/* PaletteMaster Subextension - Color Palettes */}
                {isColorMasterActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDonkeyToolsOpen(false);
                      enterPaletteMode();
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-[#1c1d27] hover:bg-[#282a38] text-gray-200 hover:text-white shadow-lg hover:scale-105 active:scale-95"
                    title="PaletteMaster – Správa barevných palet"
                  >
                    <span className="material-symbols-outlined text-[19px] leading-none select-none">
                      palette
                    </span>
                  </button>
                )}

                {/* QuickCap Subextension - Snipping tool */}
                {isQuickCapActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDonkeyToolsOpen(false);
                      handleStartQuickCap();
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-[#1c1d27] hover:bg-[#282a38] text-gray-200 hover:text-white shadow-lg hover:scale-105 active:scale-95"
                    title="QuickCap – Výstřižek obrazovky"
                  >
                    <span className="material-symbols-outlined text-[19px] leading-none select-none">
                      crop
                    </span>
                  </button>
                )}

                {/* ScreenRuler Subextension - Ruler & Scale tool */}
                {isScreenRulerActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDonkeyToolsOpen(false);
                      handleStartScreenRuler();
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-[#1c1d27] hover:bg-[#282a38] text-gray-200 hover:text-white shadow-lg hover:scale-105 active:scale-95"
                    title="ScreenRuler – Měřítko a pravítko obrazovky"
                  >
                    <span className="material-symbols-outlined text-[19px] leading-none select-none">
                      straighten
                    </span>
                  </button>
                )}

                {/* EasyClip Subextension - Clipboard History Manager */}
                {isEasyClipActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDonkeyToolsOpen(false);
                      enterEasyClip();
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all bg-[#1c1d27] hover:bg-[#282a38] text-gray-200 hover:text-white shadow-lg hover:scale-105 active:scale-95"
                    title="EasyClip – Historie schránky"
                  >
                    <span className="material-symbols-outlined text-[19px] leading-none select-none">
                      content_paste
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* MagicPlan Standalone Extension Button */}
        {isMagicPlanActive && (
          <button
            type="button"
            onClick={() => openMagicPlan()}
            disabled={isOpeningMagicPlan}
            className="relative w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-white hover:text-white transition flex items-center justify-center cursor-pointer disabled:cursor-default shrink-0 self-center shadow-sm"
            title="MagicPlan – Časová osa a přehled úkolů"
          >
            {isOpeningMagicPlan ? (
              <span className="material-symbols-outlined text-[19px] leading-none select-none animate-spin m3-primary-text">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[19px] leading-none select-none text-white">
                calendar_month
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onRefreshData}
          disabled={syncStatus !== 'idle'}
          className="relative w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.09] text-gray-300 hover:text-white transition flex items-center justify-center cursor-pointer disabled:cursor-default shrink-0 self-center shadow-sm"
          title={
            syncStatus === 'success'
              ? 'Synchronizace proběhla úspěšně'
              : `Znovu načíst data (${lastSyncTime ? `Naposledy: ${formatLastSyncDate(lastSyncTime)}` : 'Zatím neproběhla'})`
          }
        >
          {/* Sync icon wrapper */}
          <div
            onAnimationIteration={handleSyncAnimationIteration}
            className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
              syncStatus === 'spinning'
                ? 'animate-sync-spin m3-primary-text opacity-100 scale-100'
                : syncStatus === 'success'
                ? 'opacity-0 scale-75 pointer-events-none'
                : 'opacity-100 scale-100 text-gray-300 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[19px] leading-none select-none flex items-center justify-center">
              autorenew
            </span>
          </div>

          {/* Green check icon wrapper */}
          <div
            className={`absolute inset-0 flex items-center justify-center transition-all duration-300 text-emerald-400 ${
              syncStatus === 'success'
                ? 'opacity-100 scale-100'
                : 'opacity-0 scale-75 pointer-events-none'
            }`}
          >
            <span className="material-symbols-outlined text-[19px] leading-none select-none flex items-center justify-center">
              check
            </span>
          </div>
        </button>

        <button
          onMouseDown={handleSettingsMouseDown}
          onMouseUp={handleSettingsMouseUp}
          onMouseLeave={handleSettingsMouseLeave}
          onClick={handleSettingsClick}
          className={`relative w-8 h-8 rounded-full transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-sm ${
            settingsHoldProgress > 0
              ? settingsHoldProgress > 60
                ? 'bg-rose-500/25 text-rose-300'
                : 'm3-primary-badge'
              : 'bg-white/[0.04] hover:bg-white/[0.09] text-gray-300 hover:text-white'
          }`}
          title="Otevřít nastavení (podržením 3s otevřete správce ukončení a restartu)"
        >
          {settingsHoldProgress > 0 && (
            <svg
              className="absolute inset-0 w-8 h-8 pointer-events-none"
              viewBox="0 0 32 32"
            >
              <defs>
                <linearGradient id="powerHoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              {/* Background track circle */}
              <circle
                cx="16"
                cy="16"
                r="13"
                fill="none"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="2.5"
              />
              {/* Animated charging progress circle */}
              <circle
                cx="16"
                cy="16"
                r="13"
                fill="none"
                stroke="url(#powerHoldGrad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={81.68}
                strokeDashoffset={81.68 * (1 - settingsHoldProgress / 100)}
                transform="rotate(-90 16 16)"
              />
            </svg>
          )}
          <span
            className="material-symbols-outlined text-[19px] leading-none select-none transition-transform duration-75"
            style={
              settingsHoldProgress > 0
                ? { transform: `rotate(${(settingsHoldProgress / 100) * 180}deg)` }
                : undefined
            }
          >
            settings
          </span>
        </button>

        {IS_DEV && (
          <span
            className="ml-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-amber-500/15 text-amber-300 select-none shrink-0 self-center shadow-xs"
            title={`IADonkey [DEV] v${DISPLAY_APP_VERSION}`}
          >
            DEV
          </span>
        )}
      </div>

      {/* Sync Progress Bar */}
      {syncProgress && !syncProgress.isComplete && (
        <div className="w-full h-1 bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
            style={{ width: `${syncProgress.percentage}%` }}
          />
        </div>
      )}

      {/* Wizard (Stepper) Mode View */}
      {wizardItem ? (
        <>
          {/* Wizard Header & Stepper Progress Banner */}
          <div
            onClick={() => (wizardStepIndex > 0 ? goToWizardStep(wizardStepIndex - 1) : exitWizard())}
            className="m-2 p-2 px-4 flex items-center justify-between text-xs text-gray-300 transition cursor-pointer select-none"
            title={wizardStepIndex > 0 ? 'Předchozí krok (Esc / Backspace)' : 'Zrušit průvodce (Esc)'}
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-base text-white">arrow_back</span>
              <span>
                Průvodce:{' '}
                <strong className="text-white font-medium">{wizardItem.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Stepper circles */}
              <div className="flex items-center gap-1.5">
                {wizardItem.wizard?.steps.map((st, sIdx) => {
                  const isPassed = sIdx < wizardStepIndex;
                  const isCurrent = sIdx === wizardStepIndex;
                  return (
                    <div
                      key={st.id}
                      onClick={(e) => {
                        if (isPassed) {
                          e.stopPropagation();
                          goToWizardStep(sIdx);
                        }
                      }}
                      className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                        isPassed
                          ? 'bg-emerald-500 cursor-pointer hover:bg-emerald-400 hover:scale-125 shadow-sm'
                          : isCurrent
                          ? 'bg-purple-500 shadow-sm ring-2 ring-purple-400/50 scale-125'
                          : 'bg-white/20'
                      }`}
                      style={
                        isCurrent
                          ? { backgroundColor: 'var(--color-actions-hex, #a855f7)' }
                          : undefined
                      }
                      title={`Krok ${sIdx + 1}: ${st.title} (${isPassed ? 'Hotovo' : isCurrent ? 'Aktivní' : 'Čeká'})`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono ml-2">
                <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-white/[0.08] text-gray-200 rounded-full font-mono text-[9px] font-bold leading-none whitespace-nowrap">
                  Esc
                </kbd>
                <span className="text-gray-300">{wizardStepIndex > 0 ? 'Zpět' : 'Zrušit'}</span>
              </div>
            </div>
          </div>

          {/* Current Step Title & Required Badge */}
          <div className="px-4 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="material-symbols-outlined text-purple-400 text-lg">
                {getWizardStepIcon(currentWizardStep || undefined, wizardItem.icon || undefined)}
              </span>
              <span>{currentWizardStep?.title}</span>
              {currentWizardStep?.required ? (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">
                  povinné
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-gray-400">
                  volitelné
                </span>
              )}
            </div>
          </div>

          {/* Validation Error Message */}
          {wizardError && (
            <div className="mx-4 mb-2 p-2.5 px-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <span className="material-symbols-outlined text-rose-400 text-base">error</span>
              <span>{wizardError}</span>
            </div>
          )}

          {/* Main Step Interaction View */}
          <div ref={listRef} className="max-h-[360px] overflow-y-auto px-2 py-1 space-y-2 focus:outline-none relative">
            {/* Information Preview Section ("Dosud zadané údaje") - shown at the top like MagicGate actions */}
            {wizardStepIndex > 0 && (
              <div className="p-3 rounded-2xl bg-white/[0.03] shadow-sm space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-300">
                    <span className="material-symbols-outlined text-sm text-purple-400">task_alt</span>
                    <span>Dosud zadané údaje</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      ({wizardStepIndex} z {wizardItem.wizard?.steps.length})
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    kliknutím upravit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {wizardItem.wizard?.steps.slice(0, wizardStepIndex).map((st, stIdx) => {
                    const val = wizardValues[st.id];
                    let displayVal = '—';
                    let badgeColor = undefined;
                    let badgeIcon = undefined;
                    let imagePreview = undefined;

                    if (st.options) {
                      const matchedOpt = st.options.find((o) => o.value === val);
                      if (matchedOpt) {
                        displayVal = matchedOpt.text;
                        badgeColor = matchedOpt.color;
                        badgeIcon = getWizardOptionIcon(st, matchedOpt);
                      } else if (val === null || val === '') {
                        displayVal = 'Nevybráno';
                        badgeColor = '#9ca3af';
                        badgeIcon = 'block';
                      } else {
                        displayVal = String(val ?? '—');
                      }
                    } else if (st.dynamicOption === 'clipboard') {
                      if (val && typeof val === 'string' && (val.startsWith('data:image') || val.length > 5)) {
                        displayVal = 'Snímek připojen';
                        const matchedOpt = wizardDynamicOptions.find((o) => o.value === val);
                        imagePreview = matchedOpt?.imagePreview || (val.startsWith('data:image') ? val : undefined);
                        badgeIcon = matchedOpt ? getWizardOptionIcon(st, matchedOpt) : 'image';
                      } else {
                        displayVal = 'Nevybráno';
                        badgeColor = '#9ca3af';
                        badgeIcon = 'block';
                      }
                    } else if (st.dynamicOption === 'github-owners') {
                      const rawOwner = String(val ?? '');
                      if (rawOwner.includes(':')) {
                        const [oType, ...oRest] = rawOwner.split(':');
                        const oLogin = oRest.join(':');
                        displayVal = oLogin;
                        badgeIcon = oType === 'org' ? 'corporate_fare' : 'person';
                        badgeColor = oType === 'org' ? '#818cf8' : '#38bdf8';
                      } else {
                        displayVal = rawOwner || '—';
                        badgeIcon = 'account_tree';
                      }
                    } else if (st.dynamicOption) {
                      const matchedOpt = wizardDynamicOptions.find((o) => o.value === val);
                      if (matchedOpt) {
                        displayVal = matchedOpt.text;
                        badgeColor = matchedOpt.color;
                        badgeIcon = getWizardOptionIcon(st, matchedOpt);
                      } else {
                        displayVal = String(val ?? '—');
                        badgeIcon = getWizardOptionIcon(st);
                      }
                    } else {
                      displayVal = val ? String(val) : '—';
                    }

                    return (
                      <div
                        key={st.id}
                        onClick={() => goToWizardStep(stIdx)}
                        title={`Kliknutím se vrátíte ke kroku „${st.title}“`}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-black/30 hover:bg-white/[0.06] text-gray-300 transition cursor-pointer min-w-0"
                      >
                        <span className="text-[11px] text-gray-400 truncate shrink-0 max-w-[45%] select-none font-medium flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">{getWizardStepIcon(st, wizardItem?.icon || undefined)}</span>
                          <span>{st.title}</span>
                        </span>
                        <div className="flex items-center gap-1.5 truncate">
                          {imagePreview ? (
                            <img src={imagePreview} alt="thumb" className="w-5 h-4 object-cover rounded shrink-0 border border-white/10" />
                          ) : null}
                          <span
                            className="text-xs font-mono truncate select-all font-semibold flex items-center gap-1"
                            style={{ color: badgeColor || '#f8fafc' }}
                          >
                            {badgeIcon && <span className="material-symbols-outlined text-[12px]">{badgeIcon}</span>}
                            <span className="truncate">{displayVal}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isWizardSelectStep ? (
              <div className="space-y-1.5">
                {isWizardLoadingDynamic ? (
                  <div className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-purple-400">progress_activity</span>
                    <span>Načítám možnosti...</span>
                  </div>
                ) : filteredWizardOptions.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    Žádná možnost neodpovídá hledání.
                  </div>
                ) : (
                  filteredWizardOptions.map((opt, idx) => {
                    const isSelected = idx === wizardSelectedOptionIndex;
                    return (
                      <div
                        key={`${opt.value}-${idx}`}
                        data-wizard-selected={isSelected}
                        data-selected={isSelected}
                        onClick={() => submitCurrentWizardStep(opt.value)}
                        className={`relative flex items-center px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all duration-150 gap-3.5 overflow-hidden ${
                          isSelected
                            ? 'bg-purple-500/20 text-white shadow-sm'
                            : 'hover:bg-white/[0.04] text-gray-300'
                        }`}
                      >
                        {/* Left vertical indicator */}
                        <div
                          className={`w-[3px] h-7 rounded-full shrink-0 transition-all ${
                            isSelected
                              ? currentWizardStep?.dynamicOption === 'clipboard' || !opt.color
                                ? 'm3-actions-indicator opacity-100 scale-y-100'
                                : 'opacity-100 scale-y-100'
                              : 'opacity-0 scale-y-50'
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? currentWizardStep?.dynamicOption === 'clipboard' || !opt.color
                                ? undefined
                                : opt.color
                              : 'transparent',
                          }}
                        />

                        {/* Icon or image preview */}
                        {opt.imagePreview ? (
                          <div className="w-12 h-9 rounded-lg bg-black/40 overflow-hidden flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
                            <img
                              src={opt.imagePreview}
                              alt={opt.text}
                              className="max-h-full max-w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: opt.color ? `${opt.color}25` : 'rgba(255,255,255,0.06)',
                              color: opt.color || '#a855f7',
                            }}
                          >
                            <span className="material-symbols-outlined text-[20px]">
                              {getWizardOptionIcon(currentWizardStep || undefined, opt)}
                            </span>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${isSelected ? 'text-white font-semibold' : 'text-gray-200'}`}>
                              {opt.text}
                            </span>
                          </div>
                          {opt.description && (
                            <div className="text-xs text-gray-400 truncate">
                              {opt.description}
                            </div>
                          )}
                        </div>

                        {isSelected && (
                          <div className="flex items-center gap-1 text-[11px] font-medium text-purple-300 shrink-0">
                            <kbd className="px-1.5 py-0.5 bg-white/[0.08] rounded-full font-mono text-[9px]">Enter</kbd>
                            <span>Vybrat</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* Text Input Guidance Card */
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="text-xs text-gray-300">
                  {currentWizardStep?.placeholder || 'Zadejte požadovanou hodnotu přímo do vyhledávacího pole výše.'}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono">
                  <span className="material-symbols-outlined text-sm text-purple-400">keyboard_return</span>
                  <span>Stiskněte Enter pro přechod na další krok</span>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer Action Bar */}
          <div className="p-3 px-4 flex items-center justify-between text-xs text-gray-300 border-t border-white/5 select-none">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-purple-400 rounded-full font-mono text-[9px] leading-none select-none">
                  Enter
                </kbd>
                <span className="text-white">
                  {wizardStepIndex === (wizardItem.wizard?.steps.length ?? 0) - 1 ? 'Dokončit a odeslat' : 'Další krok'}
                </span>
              </span>
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
                  Esc
                </kbd>
                <span className="text-gray-400">Zpět</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isSubmittingWizard && (
                <span className="text-xs text-purple-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  <span>Odesílám...</span>
                </span>
              )}
            </div>
          </div>
        </>
      ) : actionsParentItem ? (
        <>
          {/* Actions & Info Banner */}
          <div
            onClick={exitActions}
            className="m-2 p-2 px-4 flex items-center justify-between text-xs text-gray-300 transition cursor-pointer select-none"
            title="Klikněte pro návrat zpět do vyhledávání (Esc)"
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-base text-white">arrow_back</span>
              {actionsParentItem.colorPreview && (
                <div
                  className="w-4 h-4 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.6)] flex items-center justify-center shrink-0"
                  style={{ backgroundColor: actionsParentItem.colorPreview }}
                />
              )}
              <span>
                {hasItemActions(actionsParentItem) && hasItemInfo(actionsParentItem)
                  ? 'Akce a informace:'
                  : hasItemActions(actionsParentItem)
                  ? 'Akce položky:'
                  : 'Informace o položce:'}{' '}
                <strong className="text-white font-medium">{actionsParentItem.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
              <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-white/[0.08] text-gray-200 rounded-full font-mono text-[9px] font-bold leading-none whitespace-nowrap">
                Esc
              </kbd>
              <span className="text-gray-300">Zpět</span>
            </div>
          </div>

          {/* Unified Actions & Info Scrollable View */}
          <div
            ref={listRef}
            className="max-h-[385px] overflow-y-auto px-2 py-1 focus:outline-none space-y-2 relative"
          >
            {/* 1. Screenshot Preview or Compact Info Section (BEFORE actions) */}
            {actionsParentItem?.imagePreview ? (
              <div className="p-3 rounded-2xl bg-white/[0.03] shadow-sm space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-300">
                    <span className="material-symbols-outlined text-sm text-gray-400">crop</span>
                    <span>Náhled výstřižku</span>
                  </div>
                  {actionsParentItem.info?.['Rozměry'] && (
                    <span className="text-[10px] text-gray-400 font-mono bg-white/[0.05] px-2 py-0.5 rounded-full">
                      {actionsParentItem.info['Rozměry']}
                    </span>
                  )}
                </div>
                <div className="w-full flex items-center justify-center p-2 bg-black/40 rounded-xl overflow-hidden shadow-inner">
                  <img
                    src={actionsParentItem.imagePreview}
                    alt={actionsParentItem.name}
                    className="max-h-[190px] max-w-full object-contain rounded-lg select-none shadow-md"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              </div>
            ) : hasItemInfo(actionsParentItem) && (() => {
              const allInfoEntries = Object.entries(actionsParentItem.info!);
              const ITEMS_PER_PAGE = INFO_ITEMS_PER_PAGE;
              const totalPages = Math.ceil(allInfoEntries.length / ITEMS_PER_PAGE);
              const safePage = Math.min(infoPage, Math.max(0, totalPages - 1));
              const visibleEntries = allInfoEntries.slice(safePage * ITEMS_PER_PAGE, (safePage + 1) * ITEMS_PER_PAGE);

              return (
                <div className="p-3 rounded-2xl bg-white/[0.03] shadow-sm space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-300">
                      <span className="material-symbols-outlined text-sm text-gray-400">info</span>
                      <span>Informace o položce</span>
                      {allInfoEntries.length > ITEMS_PER_PAGE && (
                        <span className="text-[10px] text-gray-500 font-mono">
                          ({allInfoEntries.length})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {allInfoEntries.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono bg-black/40 px-2 py-0.5 rounded-full">
                          <span>
                            {safePage + 1} / {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={safePage === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoPage((prev) => Math.max(0, prev - 1));
                            }}
                            className="p-0.5 rounded-full hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center"
                            title="Předchozí strana (←)"
                          >
                            <span className="material-symbols-outlined !text-[12px]" style={{ fontSize: '12px' }}>chevron_left</span>
                          </button>
                          <button
                            type="button"
                            disabled={safePage >= totalPages - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoPage((prev) => Math.min(totalPages - 1, prev + 1));
                            }}
                            className="p-0.5 rounded-full hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer flex items-center"
                            title="Další strana (→)"
                          >
                            <span className="material-symbols-outlined !text-[12px]" style={{ fontSize: '12px' }}>chevron_right</span>
                          </button>
                        </div>
                      )}
                      <span className="text-[10px] text-gray-500 font-mono">
                        kliknutím zkopírovat
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {visibleEntries.map(([key, val]) => {
                      const strVal = val !== null && val !== undefined ? String(val) : '—';
                      const isCopied = copiedInfoKey === key;
                      return (
                        <div
                          key={key}
                          onClick={() => handleCopyInfoValue(key, strVal)}
                          title={`Kliknutím zkopírujete „${strVal}“ do schránky`}
                          className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl transition cursor-pointer min-w-0 ${
                            isCopied
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-black/30 hover:bg-white/[0.06] text-gray-300'
                          }`}
                        >
                          <span className="text-[11px] text-gray-400 truncate shrink-0 max-w-[45%] select-none font-medium">
                            {key}
                          </span>
                          <span
                            className={`text-xs font-mono truncate select-all ${
                              isCopied ? 'text-emerald-400 font-semibold' : 'text-gray-200'
                            }`}
                            title={strVal}
                          >
                            {isCopied ? 'Zkopírováno!' : strVal}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 2. Actions List */}
            {hasItemActions(actionsParentItem) && (
              <div className="space-y-1.5">
                {getItemActions(actionsParentItem).map((action, idx) => {
                  const isSelected = idx === selectedActionIndex;
                  const isVscode = action.settings === 'vscode' || action.action === 'vscode' || action.name.toLowerCase().includes('vs code') || action.name.toLowerCase().includes('vscode');
                  const isAndroid = action.settings === 'android-studio' || action.action === 'android-studio' || action.name.toLowerCase().includes('android');
                  const isPreparation = action.action === 'edit-quickcap';
                  const isPaint = action.action === 'open-paint';
                  const isFolder = action.action === 'show-in-folder';
                  const isClose = action.action === 'close';

                  const itemSelectedClass = isSelected
                    ? isVscode
                      ? 'bg-sky-500/20 text-white shadow-none'
                      : isAndroid
                      ? 'bg-pink-500/20 text-white shadow-none'
                      : isClose
                      ? 'bg-rose-500/20 text-white shadow-none'
                      : 'm3-actions-selected-card text-white'
                    : 'm3-item-card text-gray-300';

                  const indicatorColorClass = isVscode
                    ? 'bg-sky-400'
                    : isAndroid
                    ? 'bg-pink-500'
                    : isClose
                    ? 'bg-rose-500'
                    : 'm3-actions-indicator';

                  const iconColorClass = isClose
                    ? 'text-rose-400'
                    : isVscode
                    ? 'text-sky-400'
                    : isAndroid
                    ? 'text-pink-400'
                    : 'text-gray-400';

                  const badgeClass = isClose
                    ? 'bg-rose-500/15 text-rose-300'
                    : isVscode
                    ? 'bg-sky-500/15 text-sky-300'
                    : isAndroid
                    ? 'bg-pink-500/15 text-pink-300'
                    : 'bg-white/[0.06] text-gray-300';

                  const iconBgClass = isSelected
                    ? isVscode
                      ? 'bg-sky-500/25 text-sky-200'
                      : isAndroid
                      ? 'bg-pink-500/25 text-pink-200'
                      : isClose
                      ? 'bg-rose-500/25 text-rose-200'
                      : 'bg-white/[0.1] text-white'
                    : `bg-white/[0.05] ${iconColorClass}`;

                  const actionTextClass = isVscode
                    ? 'text-sky-400'
                    : isAndroid
                    ? 'text-pink-400'
                    : isClose
                    ? 'text-rose-400'
                    : 'm3-actions-text';

                  return (
                    <div
                      key={`${action.name}-${idx}`}
                      data-selected={isSelected}
                      data-action-selected={isSelected}
                      onClick={() => {
                        setSelectedActionIndex(idx);
                        handleExecuteAction(actionsParentItem, action);
                      }}
                      className={`relative flex items-center px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all duration-150 gap-3.5 overflow-hidden ${itemSelectedClass}`}
                    >
                      {/* Left vertical indicator for selected action */}
                      <div
                        className={`w-[3px] h-7 rounded-full shrink-0 transition-all ${
                          isSelected ? `${indicatorColorClass} opacity-100 scale-y-100` : 'bg-transparent opacity-0 scale-y-50'
                        }`}
                      />

                      <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full transition-colors ${iconBgClass}`}>
                        <span className="material-symbols-outlined text-[19px]">
                          {action.icon || (action.action === 'close' ? 'close' : action.action === 'clone' ? 'download' : action.action === 'clonerecursive' ? 'folder_zip' : action.action === 'mgclone' || action.action === 'mgclonerecursive' ? 'cloud_download' : action.action === 'copy' ? 'content_copy' : 'open_in_new')}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate leading-tight">
                            {action.name}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-medium uppercase ${badgeClass}`}>
                            {isVscode
                              ? 'VS Code'
                              : isAndroid
                              ? 'Android Studio'
                              : isPreparation
                              ? 'Editor'
                              : isPaint
                              ? 'Malování'
                              : isFolder
                              ? 'Složka'
                              : isClose
                              ? 'Zavřít'
                              : action.action === 'mgdownloadcontent'
                              ? 'CMSinFS'
                              : action.action}
                          </span>
                        </div>
                        <div className={`text-xs mt-0.5 font-mono truncate ${isClose ? 'text-rose-300/80 font-medium' : 'text-gray-500'}`}>
                          {action.action === 'mgdownloadcontent' && instanceSourceCodesPath
                            ? `Cíl: ${instanceSourceCodesPath.trim().replace(/[\\/]+$/, '')}\\${actionsParentItem?.name || ''}`
                            : (action.location || actionsParentItem.location || '')}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="flex-shrink-0">
                          {isPreparation ? (
                            <span className="text-gray-400 italic text-[11px]">Připravujeme...</span>
                          ) : (
                            <span className={`${actionTextClass} text-xs font-semibold`}>
                              Provést
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions & Info Floating Action Bar Footer */}
          <div className="mx-2 my-2 px-4 py-2 flex items-center justify-between text-xs text-gray-400 select-none">
            <div className="flex items-center gap-4 flex-wrap">
              {hasItemActions(actionsParentItem) && (
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] m3-actions-text rounded-full font-mono text-[9px] leading-none select-none">
                    Enter
                  </kbd>
                  <span className="text-white">Provést</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasItemActions(actionsParentItem) && (
                <span className="rounded-full px-2.5 py-0.5 bg-white/[0.04] text-gray-400 font-mono text-[11px]">
                  {getItemActions(actionsParentItem).length} akcí
                </span>
              )}
            </div>
          </div>
        </>
      ) : isEasyClipMode ? (
        <>
          {/* EasyClip Header Banner */}
          <div className="m-2 p-2 px-4 flex items-center justify-between text-xs text-gray-300 select-none">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={exitEasyClip}
                className="flex items-center justify-center text-white hover:opacity-80 transition cursor-pointer"
                title="Zpět do vyhledávání"
              >
                <span className="material-symbols-outlined text-base text-white">arrow_back</span>
              </button>
              <div className="flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-rose-400 text-base">content_paste</span>
                <span className="text-white">Historie schránky</span>
                {selectedEasyClipIds.size > 1 && (
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono font-semibold">
                    Vybráno {selectedEasyClipIds.size} položek
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {easyClipItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearEasyClip}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-rose-500/20 text-gray-300 hover:text-rose-200 transition text-xs cursor-pointer"
                  title="Smazat celou historii schránky"
                >
                  <span className="material-symbols-outlined text-sm">delete_sweep</span>
                  <span>Vymazat vše</span>
                </button>
              )}
              <button
                type="button"
                onClick={selectedEasyClipIds.size > 1 ? () => { setSelectedEasyClipIds(new Set()); easyClipAnchorRef.current = easyClipSelectedIndex; } : exitEasyClip}
                className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white font-mono cursor-pointer transition select-none"
                title="Zpět (Esc)"
              >
                <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-white/[0.08] hover:bg-white/[0.14] text-gray-200 rounded-full font-mono text-[9px] font-bold leading-none whitespace-nowrap">
                  Esc
                </kbd>
                <span className="text-gray-300">Zpět</span>
              </button>
            </div>
          </div>

          {/* EasyClip Items List */}
          <div
            ref={listRef}
            className="max-h-[400px] overflow-y-auto space-y-1.5 px-2 py-1 focus:outline-none relative"
          >
            {filteredEasyClipItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-gray-400">
                <span className="material-symbols-outlined text-4xl text-gray-600 mb-2 select-none">
                  content_paste_off
                </span>
                <p className="text-sm font-medium text-gray-300">
                  {query.trim() ? 'Žádné položky neodpovídají hledání' : 'Historie schránky je prázdná'}
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">
                  {query.trim()
                    ? 'Zkuste upravit hledaný výraz nebo vymazat filtr.'
                    : 'Zkopírujte libovolný text nebo obrázek a objeví se zde v historii EasyClip.'}
                </p>
              </div>
            ) : (
              filteredEasyClipItems.map((item, idx) => {
                const isItemMultiSelected = selectedEasyClipIds.has(item.id);
                const isSelected = selectedEasyClipIds.size > 1 ? isItemMultiSelected : idx === easyClipSelectedIndex;
                const isCursor = idx === easyClipSelectedIndex;
                const isImage = item.type === 'image';
                const canOpenImageActions = isImage && Boolean(item.filePath);
                const isShiftActionsActive = isSelected && selectedEasyClipIds.size <= 1 && isShiftDown && canOpenImageActions;
                const charCount = item.charCount ?? (item.text ? item.text.length : 0);
                const lineCount = item.lineCount ?? (item.text ? item.text.split('\n').length : 1);
                const sizeKb = item.sizeBytes ? Math.round(item.sizeBytes / 1024) : 0;

                return (
                  <div
                    key={item.id}
                    data-selected={idx === easyClipSelectedIndex}
                    onClick={(e) => handleEasyClipItemClick(item, idx, e)}
                    className={`group relative flex items-start gap-3.5 px-3.5 py-3 rounded-2xl cursor-pointer transition-all duration-150 select-none overflow-hidden ${
                      isSelected
                        ? 'bg-rose-500/20 text-white shadow-none'
                        : 'm3-item-card text-gray-300'
                    } ${isCursor && selectedEasyClipIds.size > 1 ? 'ring-2 ring-rose-400/50' : ''}`}
                  >
                    {/* Left vertical indicator for selected item in DonkeyTools Rose */}
                    <div
                      className={`w-[3px] h-7 rounded-full shrink-0 transition-all mt-1 ${
                        isSelected ? 'bg-rose-500 opacity-100 scale-y-100' : 'bg-transparent opacity-0 scale-y-50'
                      }`}
                    />

                    {/* Icon or Image Thumbnail */}
                    <div className="shrink-0 mt-0.5">
                      {isImage ? (
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/40 border border-white/10 shadow-inner flex items-center justify-center">
                          {item.dataUrl ? (
                            <img
                              src={item.dataUrl}
                              alt="Clipboard thumbnail"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-base text-rose-400">
                              image
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-rose-500/25 text-rose-200'
                              : 'bg-white/[0.05] text-rose-300'
                          }`}
                        >
                          <span className="material-symbols-outlined text-lg">
                            content_paste
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content details */}
                    <div className="flex-1 min-w-0 pr-20">
                      {isImage ? (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-rose-300 font-mono">
                              Obrázek ({item.width ?? '?'} × {item.height ?? '?'} px)
                            </span>
                            {sizeKb > 0 && (
                              <span className="text-[10px] text-gray-400 font-mono">
                                {sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-2">
                            <span>{formatRelativeTime(item.timestamp)}</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {/* Exact text preview (whitespace preserved) */}
                          <div className="text-xs font-mono text-gray-200 line-clamp-3 whitespace-pre-wrap break-all select-none">
                            {item.text}
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400 font-mono">
                            <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300">
                              {charCount} {charCount === 1 ? 'znak' : charCount >= 2 && charCount <= 4 ? 'znaky' : 'znaků'}
                            </span>
                            {lineCount > 1 && (
                              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300">
                                {lineCount} {lineCount >= 2 && lineCount <= 4 ? 'řádky' : 'řádků'}
                              </span>
                            )}
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-400">{formatRelativeTime(item.timestamp)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions on Item: Copy/Actions badge & Delete button OR Multi-select checkbox */}
                    <div className="absolute right-3 top-3 flex items-center gap-2">
                      {selectedEasyClipIds.size > 1 ? (
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                            isItemMultiSelected
                              ? 'bg-rose-500 text-white shadow-sm'
                              : 'bg-white/10 text-transparent'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px] leading-none font-bold">check</span>
                        </div>
                      ) : (
                        <>
                          {isSelected && (
                            isShiftActionsActive ? (
                              <span className="text-xs font-semibold m3-actions-text hidden sm:inline animate-in fade-in duration-100">
                                Akce
                              </span>
                            ) : (
                              <span className="text-xs font-semibold text-rose-400 hidden sm:inline animate-in fade-in duration-100">
                                {isCtrlDown ? 'Kopírovat' : 'Vložit'}
                              </span>
                            )
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              handleDeleteEasyClipItem(item.id, e);
                            }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                            title="Odstranit ze schránky"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* EasyClip Floating Action Bar Footer */}
          <div className="mx-2 my-2 px-4 py-2 flex items-center justify-between text-xs text-gray-400 select-none">
            <div className="flex items-center gap-4 flex-wrap">
              {selectedEasyClipIds.size > 1 ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      {isCtrlDown ? 'Ctrl+Enter' : 'Enter'}
                    </kbd>
                    <span className="text-white">
                      {isCtrlDown ? 'Kopírovat' : 'Vložit'} vybrané ({selectedEasyClipIds.size})
                    </span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">Del</kbd>
                    <span className="text-white">Smazat</span>
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      {isCtrlDown ? 'Ctrl+Enter' : 'Enter'}
                    </kbd>
                    <span className="text-white">
                      {isCtrlDown ? 'Kopírovat' : 'Vložit'}
                    </span>
                  </span>
                  {filteredEasyClipItems[easyClipSelectedIndex]?.type === 'image' && (
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] m3-actions-text rounded-full font-mono text-[9px] leading-none select-none">Shift+Enter</kbd>
                      <span className="text-white">Akce</span>
                    </span>
                  )}
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">Del</kbd>
                    <span className="text-white">Smazat</span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">Shift+↑↓</kbd>
                    <span className="text-white">Více</span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2.5 py-0.5 bg-white/[0.04] text-gray-400 font-mono text-[11px]">
                {filteredEasyClipItems.length} {filteredEasyClipItems.length === 1 ? 'položka' : filteredEasyClipItems.length >= 2 && filteredEasyClipItems.length <= 4 ? 'položky' : 'položek'}
              </span>
            </div>
          </div>
        </>
      ) : isPaletteMode ? (
        <>
          {/* PaletteMaster Header Banner */}
          <div className="m-2 p-2 px-4 flex items-center justify-between text-xs text-gray-300 select-none">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={isCreatingPalette ? () => { setIsCreatingPalette(false); setQuery(''); } : exitPaletteMode}
                className="flex items-center justify-center text-white hover:opacity-80 transition cursor-pointer"
                title="Zpět"
              >
                <span className="material-symbols-outlined text-base text-white">arrow_back</span>
              </button>
              <div className="flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-rose-400 text-base">palette</span>
                <span className="text-white">
                  {isCreatingPalette ? 'Nová paleta' : 'PaletteMaster – Barevné palety'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={isCreatingPalette ? () => { setIsCreatingPalette(false); setQuery(''); } : exitPaletteMode}
                className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white font-mono cursor-pointer transition select-none"
                title="Zpět (Esc)"
              >
                <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-white/[0.08] hover:bg-white/[0.14] text-gray-200 rounded-full font-mono text-[9px] font-bold leading-none whitespace-nowrap">
                  Esc
                </kbd>
                <span className="text-gray-300">Zpět</span>
              </button>
            </div>
          </div>

          {/* PaletteMaster Content */}
          {isCreatingPalette ? null : (
            <div
              ref={listRef}
              className="max-h-[400px] overflow-y-auto space-y-1.5 px-2 py-1 focus:outline-none relative"
            >
              {/* Palette List Items */}
              {paletteListItems.map((item, idx) => {
                const isSelected = paletteSelectedIndex === idx;

                if (item.type === 'add') {
                  return (
                    <div
                      key="add-new-palette"
                      data-selected={isSelected}
                      onClick={() => {
                        setIsCreatingPalette(true);
                        if (!query.trim()) {
                          setQuery('');
                        }
                        inputRef.current?.focus();
                      }}
                      className={`relative flex items-center px-3.5 py-3 rounded-2xl cursor-pointer transition-all duration-150 gap-3.5 overflow-hidden ${
                        isSelected
                          ? 'bg-rose-500/20 text-white shadow-none'
                          : 'm3-item-card text-gray-300'
                      }`}
                    >
                      <div
                        className={`w-[3px] h-7 rounded-full shrink-0 transition-all ${
                          isSelected ? 'bg-rose-500 opacity-100 scale-y-100' : 'bg-transparent opacity-0 scale-y-50'
                        }`}
                      />
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                          isSelected ? 'bg-rose-500 text-white shadow-md' : 'bg-white/[0.05] text-rose-400'
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">add</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white">Přidat novou paletu</div>
                        <div className="text-[11px] text-gray-400">Založit novou paletu a otevřít lištu pro výběr barev</div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <kbd className="px-2 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[10px]">
                          Enter
                        </kbd>
                      </div>
                    </div>
                  );
                }

                const pal = item.palette;
                const validColors = pal.colors ? pal.colors.filter(Boolean) : [];

                return (
                  <div
                    key={pal.id}
                    data-selected={isSelected}
                    onClick={(e) => {
                      const shouldOpenBar = e.ctrlKey || isCtrlDown;
                      setIsRevealed(false);
                      window.electronAPI?.resetAndHideSpotlight?.();
                      if (shouldOpenBar) {
                        if (window.electronAPI?.openPaletteBar) {
                          window.electronAPI.openPaletteBar({ paletteId: pal.id, paletteName: pal.name });
                        }
                      } else {
                        if (window.electronAPI?.openPaletteDetail) {
                          window.electronAPI.openPaletteDetail({ paletteId: pal.id });
                        }
                      }
                      exitPaletteMode();
                    }}
                    className={`relative flex items-center px-3.5 py-2.5 rounded-2xl cursor-pointer transition-all duration-150 gap-3.5 overflow-hidden ${
                      isSelected
                        ? 'bg-rose-500/20 text-white shadow-none'
                        : 'm3-item-card text-gray-300'
                    }`}
                  >
                    <div
                      className={`w-[3px] h-7 rounded-full shrink-0 transition-all ${
                        isSelected ? 'bg-rose-500 opacity-100 scale-y-100' : 'bg-transparent opacity-0 scale-y-50'
                      }`}
                    />
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                        isSelected ? 'bg-rose-500/25 text-rose-200' : 'bg-white/[0.05] text-rose-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-lg">palette</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{pal.name}</span>
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-white/[0.06] text-gray-400 font-mono">
                          {validColors.length}/5 barev
                        </span>
                      </div>

                      {/* 5 Dots preview */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {[0, 1, 2, 3, 4].map((slotIdx) => {
                          const c = pal.colors && pal.colors[slotIdx] ? pal.colors[slotIdx] : null;
                          return (
                            <div
                              key={slotIdx}
                              className={`w-3.5 h-3.5 rounded-full border ${
                                c
                                  ? 'border-white/30 shadow-inner'
                                  : 'border-dashed border-white/20 bg-white/[0.04]'
                              }`}
                              style={c ? { backgroundColor: c } : undefined}
                              title={c ? `${c} (pravý klik = zkopírovat)` : `Pozice ${slotIdx + 1} prázdná`}
                              onContextMenu={(e) => {
                                if (c) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (window.electronAPI?.copyToClipboard) {
                                    window.electronAPI.copyToClipboard(c, {
                                      title: 'PaletteMaster – Barva zkopírována',
                                      body: `Barva "${c}" z palety „${pal.name}“ byla zkopírována do schránky.`,
                                    });
                                  } else {
                                    navigator.clipboard.writeText(c);
                                  }
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions: Delete button & Enter hint */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isSelected && (
                        <span className="text-xs font-semibold text-rose-400 hidden sm:inline">
                          {isCtrlDown ? 'Spustit' : 'Detail'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeletePalette(pal.id, e)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
                        title="Smazat paletu (Del)"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PaletteMaster Floating Footer */}
          <div className="mx-2 my-2 px-4 py-2 flex items-center justify-between text-xs text-gray-400 select-none">
            <div className="flex items-center gap-4 flex-wrap">
              {isCreatingPalette ? (
                <>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Vytvořit a spustit</span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Ctrl+Enter
                    </kbd>
                    <span className="text-white">Vytvořit a otevřít</span>
                  </span>
                </>
              ) : paletteListItems[paletteSelectedIndex]?.type === 'add' ? (
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                    Enter
                  </kbd>
                  <span className="text-white">Vytvořit novou</span>
                </span>
              ) : (
                <>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Detail</span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Ctrl+Enter
                    </kbd>
                    <span className="text-white">Spustit lištu</span>
                  </span>
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-rose-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Del
                    </kbd>
                    <span className="text-white">Smazat</span>
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2.5 py-0.5 bg-white/[0.04] text-gray-400 font-mono text-[11px]">
                {palettes.length} {palettes.length === 1 ? 'paleta' : palettes.length >= 2 && palettes.length <= 4 ? 'palety' : 'palet'}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Regular Results List & Footer */
        results.length > 0 && (
          <>
            {/* Subitems Parent Back Navigation Banner */}
            {parentItem && (
              <div
                onClick={exitSubitems}
                className="m-2 p-2 px-4 flex items-center justify-between text-xs text-gray-200 cursor-pointer transition select-none"
                title="Klikněte pro návrat zpět (Esc)"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-white">arrow_back</span>
                  <span>Podpoložky položky: <strong className="text-white font-medium">{parentItem.name}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
                  <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-white/[0.08] text-gray-200 rounded-full font-mono text-[9px] leading-none whitespace-nowrap">Esc</kbd>
                  <span>Zpět</span>
                </div>
              </div>
            )}

            <div
              ref={listRef}
              onScroll={(e) => {
                if (renderLimit >= results.length) return;
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
                  setRenderLimit((prev) => Math.min(results.length, prev + 45));
                }
              }}
              className="max-h-[420px] overflow-y-auto px-2 py-1.5 space-y-1.5 focus:outline-none relative"
            >
              {results.slice(0, Math.max(renderLimit, selectedIndex + 10)).map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const hasOptions = Array.isArray(item.options) && item.options.length > 0;
                const hasActions = hasItemActions(item);
                const hasInfo = hasItemInfo(item);
                const hasActionsOrInfo = hasActions || hasInfo;
                const hasAnyChip = Boolean(
                  item.settings === 'git' ||
                  item.settings === 'magicgate' ||
                  item.sourceId === 'snippet' ||
                  item.sourceId === 'donkeytools' ||
                  item.sourceId === 'feedback' ||
                  (item.sourceId === 'magicplan' && Boolean(item.shortcuts && item.shortcuts.length > 0)) ||
                  item.priority === -1.5 ||
                  item.priority === -2 ||
                  item.priority === -1 ||
                  item.priority === 99 ||
                  item.sourceId?.startsWith('engine-')
                );

                const itemCardClass = isSelected
                  ? 'm3-selected-card text-white'
                  : 'bg-white/[0.025] hover:bg-white/[0.06] text-gray-300';

                return (
                  <div
                    key={item.id || `${item.name}-${idx}`}
                    data-selected={isSelected}
                    onClick={(e) => {
                      setSelectedIndex(idx);
                      handleItemClick(item, e);
                    }}
                    className={`m3-item-card rounded-2xl px-3.5 py-2.5 flex items-center gap-3.5 cursor-pointer transition-all select-none ${itemCardClass}`}
                  >
                    {/* Left Accent Indicator in user's color */}
                    <div
                      className={`w-[3px] h-7 rounded-full shrink-0 transition-all ${
                        isSelected ? 'm3-selected-indicator opacity-100 scale-y-100' : 'bg-transparent opacity-0 scale-y-50'
                      }`}
                    />

                    {/* Column 1: Icon or Image with subitems badge */}
                    <div className="relative shrink-0 flex items-center justify-center">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden transition-colors ${
                        isSelected ? 'bg-white/[0.1] shadow-inner' : 'bg-white/[0.04]'
                      }`}>
                        {item.colorPreview ? (
                          <div
                            className="w-7 h-7 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.65)] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: item.colorPreview }}
                          />
                        ) : (
                          <MaterialIcon
                            icon={item.icon?.trim() ? item.icon : parentItem?.icon}
                            image={item.image?.trim() ? item.image : parentItem?.image}
                            location={item.location || parentItem?.location}
                            colorClass={
                              parentItem
                                ? undefined
                                : item.settings === 'git' || item.sourceId === 'github'
                                ? 'text-emerald-400'
                                : item.sourceId === 'magicgate-xml' || item.settings === 'magicgate'
                                ? 'text-amber-400'
                                : undefined
                            }
                            fallbackIcon={
                              parentItem?.icon || (
                                item.sourceId === 'snippet'
                                  ? 'content_paste'
                                  : item.priority === 99
                                  ? 'apps'
                                  : item.priority === -1.5
                                  ? 'mail'
                                  : item.priority === -1
                                  ? 'calculate'
                                  : item.priority === -2
                                  ? 'support_agent'
                                  : 'code'
                              )
                            }
                            className="w-5 h-5 text-gray-300"
                          />
                        )}
                      </div>
                      {hasOptions && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            enterSubitems(item);
                          }}
                          title={`Zobrazit ${item.options!.length} podpoložek (Alt+Enter)`}
                          className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110 select-none m3-primary-pill"
                        >
                          {item.options!.length}
                        </div>
                      )}
                    </div>

                    {/* Column 2: Name & Subtitle */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate leading-tight">
                          {item.name}
                        </span>

                        {/* Standalone action/info chip in rounded-full pill style */}
                        {item.wizard && (
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 shadow-sm flex items-center gap-1 select-none"
                            title="Vícekrokový průvodce (Enter)"
                          >
                            <span className="material-symbols-outlined text-[12px] leading-none">
                              auto_awesome
                            </span>
                            <span>Průvodce</span>
                          </span>
                        )}

                        {hasActionsOrInfo && !hasAnyChip && !item.wizard && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              enterActions(item);
                            }}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-medium m3-actions-badge hover:opacity-90 transition cursor-pointer select-none flex items-center gap-1 shadow-sm"
                            title={hasActions ? 'Zobrazit akce a informace (Shift+Enter)' : 'Zobrazit informace (Shift+Enter)'}
                          >
                            <span className="material-symbols-outlined text-[12px] leading-none">
                              {hasActions ? 'bolt' : 'info'}
                            </span>
                            <span>{hasActions ? 'Akce' : 'Info'}</span>
                          </button>
                        )}

                        {item.settings === 'git' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              if (hasActionsOrInfo) {
                                e.stopPropagation();
                                enterActions(item);
                              }
                            }}
                            className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 shadow-sm flex items-center gap-1 select-none ${
                              hasActionsOrInfo ? 'hover:bg-emerald-500/25 cursor-pointer' : 'cursor-default'
                            }`}
                            title={hasActionsOrInfo ? 'Git položka – klikněte nebo stiskněte Shift+Enter pro akce a informace' : 'Git položka'}
                          >
                            {hasActionsOrInfo && (
                              <span className="material-symbols-outlined text-[12px] leading-none">
                                {hasActions ? 'bolt' : 'info'}
                              </span>
                            )}
                            <span>Git</span>
                          </button>
                        )}

                        {item.sourceId === 'snippet' && item.shortcuts && item.shortcuts.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.shortcuts.map((shortcut) => (
                              <span
                                key={shortcut}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300 font-medium select-none shadow-sm"
                              >
                                {shortcut}
                              </span>
                            ))}
                          </div>
                        ) : item.sourceId === 'snippet' ? (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 font-medium shadow-sm">
                            Snippet
                          </span>
                        ) : null}

                        {item.sourceId === 'donkeytools' && item.shortcuts && item.shortcuts.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.shortcuts.map((shortcut) => (
                              <span
                                key={shortcut}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-medium select-none shadow-sm"
                              >
                                {shortcut}
                              </span>
                            ))}
                          </div>
                        ) : item.sourceId === 'donkeytools' ? (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-medium shadow-sm">
                            DonkeyTools
                          </span>
                        ) : null}
                        {item.sourceId === 'feedback' && item.shortcuts && item.shortcuts.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.shortcuts.slice(0, 2).map((shortcut) => (
                              <span
                                key={shortcut}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-medium select-none shadow-sm"
                              >
                                {shortcut}
                              </span>
                            ))}
                          </div>
                        ) : item.sourceId === 'feedback' ? (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-medium shadow-sm">
                            Feedback
                          </span>
                        ) : null}
                        {item.sourceId === 'magicplan' && item.shortcuts && item.shortcuts.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {item.shortcuts.map((shortcut) => (
                              <span
                                key={shortcut}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-medium select-none shadow-sm"
                              >
                                {shortcut}
                              </span>
                            ))}
                          </div>
                        ) : item.sourceId === 'magicplan' && !hasActionsOrInfo ? (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-medium shadow-sm">
                            MagicPlan
                          </span>
                        ) : null}
                        {(item.sourceId === 'gmail' || item.id?.startsWith('gmail-')) && (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold shadow-sm">
                            Gmail
                          </span>
                        )}
                        {item.priority === -2 && (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-medium shadow-sm">
                            MLog
                          </span>
                        )}
                        {item.priority === -1 && (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/10 text-gray-300 shadow-sm">
                            Kalkulačka
                          </span>
                        )}
                        {item.priority === 99 && (
                          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-medium shadow-sm">
                            Aplikace
                          </span>
                        )}
                        {(() => {
                          if (item.sourceId?.startsWith('engine-')) {
                            const engineId = item.sourceId.replace('engine-', '');
                            const engine = SEARCH_ENGINES.find((e) => e.id === engineId);
                            if (engine) {
                              return (
                                <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-medium shadow-sm ${engine.chipClass}`}>
                                  {engine.chipLabel}
                                </span>
                              );
                            }
                          }
                          return null;
                        })()}
                        {item.settings === 'magicgate' && (
                          canAccessMagicGateExtras && hasActionsOrInfo ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                enterActions(item);
                              }}
                              className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shadow-sm flex items-center gap-1 select-none hover:bg-amber-500/25 cursor-pointer"
                              title="MagicGate položka – klikněte nebo stiskněte Shift+Enter pro akce"
                            >
                              <span className="material-symbols-outlined text-[12px] leading-none">
                                {hasActions ? 'bolt' : 'info'}
                              </span>
                              <span>MagicGate</span>
                            </button>
                          ) : (
                            <span
                              className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 shadow-sm select-none cursor-default"
                              title="MagicGate"
                            >
                              MagicGate
                            </span>
                          )
                        )}
                      </div>
                      <div className="text-xs mt-0.5 font-mono flex items-center gap-1.5 flex-nowrap min-w-0 w-full overflow-hidden text-gray-400">
                        {renderSubtitle(item, isSelected)}
                      </div>
                    </div>

                    {/* Active item Primary Action hint on the right */}
                    {isSelected && (
                      <div className="flex-shrink-0 flex items-center gap-1.5 ml-auto select-none">
                        {isShiftDown && hasActionsOrInfo ? (
                          <span className="text-xs font-semibold m3-actions-text animate-in fade-in duration-100">
                            {hasActions ? 'Akce' : 'Info'}
                          </span>
                        ) : isAltDown && hasOptions ? (
                          <span className="text-xs font-semibold text-sky-400 animate-in fade-in duration-100">
                            Subpoložky
                          </span>
                        ) : item.wizard ? (
                          <span className="text-xs font-semibold text-purple-400 animate-in fade-in duration-100">
                            Spustit průvodce
                          </span>
                        ) : item.action === 'ssms-query' ? (
                          <span className="text-xs font-semibold text-teal-400 animate-in fade-in duration-100">
                            Dotaz v SSMS
                          </span>
                        ) : item.action === 'enter-db-mode' || item.action === 'enter-ftp-mode' ? (
                          <span className="text-xs font-semibold text-teal-400 animate-in fade-in duration-100">
                            Vypsat položky
                          </span>
                        ) : (item.action === 'copy' || item.action === 'paste') ? (
                          <span className="text-xs font-semibold text-emerald-400 animate-in fade-in duration-100">
                            Kopírovat
                          </span>
                        ) : (
                          <span className="text-xs font-semibold m3-primary-text animate-in fade-in duration-100">
                            Otevřít
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Material 3 Floating Action Bar */}
            <div className="m-2.5 p-2 px-3.5 flex items-center justify-between text-xs text-gray-400 select-none">
              <div className="flex items-center gap-4 flex-wrap">
                {results[selectedIndex]?.wizard ? (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-purple-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Spustit průvodce</span>
                  </span>
                ) : results[selectedIndex]?.action === 'ssms-query' ? (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-teal-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Otevřít dotaz v SSMS</span>
                  </span>
                ) : results[selectedIndex]?.action === 'enter-db-mode' || results[selectedIndex]?.action === 'enter-ftp-mode' ? (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-teal-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter / Space
                    </kbd>
                    <span className="text-white">Vypsat seznam</span>
                  </span>
                ) : results[selectedIndex]?.action === 'copy' || results[selectedIndex]?.action === 'paste' ? (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-emerald-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Kopírovat</span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] m3-primary-text rounded-full font-mono text-[9px] leading-none select-none">
                      Enter
                    </kbd>
                    <span className="text-white">Otevřít</span>
                  </span>
                )}
                {ghostAutocomplete && (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-teal-300 rounded-full font-mono text-[9px] leading-none select-none">
                      Tab
                    </kbd>
                    <span className="text-white">Doplnit název</span>
                  </span>
                )}
                {hasItemActionsOrInfo(results[selectedIndex]) && (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] m3-actions-text rounded-full font-mono text-[9px] leading-none select-none">
                      Shift+Enter
                    </kbd>
                    <span className="text-white">
                      {hasItemActions(results[selectedIndex]) && hasItemInfo(results[selectedIndex])
                        ? 'Akce a info'
                        : hasItemActions(results[selectedIndex])
                        ? 'Akce'
                        : 'Info'}
                    </span>
                  </span>
                )}
                {results[selectedIndex]?.options && results[selectedIndex].options!.length > 0 && (
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-sky-400 rounded-full font-mono text-[9px] leading-none select-none">
                      Alt+Enter
                    </kbd>
                    <span className="text-white">Subpoložky ({results[selectedIndex].options!.length})</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {IS_DEV && (
                  <span className="rounded-full px-2 py-0.5 bg-amber-500/15 text-amber-300 font-mono text-[10px]">
                    v{DISPLAY_APP_VERSION}
                  </span>
                )}
                <span className="rounded-full px-2.5 py-0.5 bg-white/[0.04] text-gray-400 font-mono text-[11px]">
                  {results.length} výsledků
                </span>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
};
