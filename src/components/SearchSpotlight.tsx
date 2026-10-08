import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DISPLAY_APP_VERSION, IS_DEV } from '../changelog';
import { LauncherItem, LauncherAction, SyncProgress, SnippetsConfig, ColorMasterSettings, QuickCapSettings, FastSnapSettings, ScreenRulerSettings, EasyClipSettings, EasyClipItem, ColorPalette, AppConfig, MagicPlanSettings, MagicPlanData, PlanTaskItem, LauncherWizard, WizardStep, WizardOption } from '../types';
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
}

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
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [parentItem, setParentItem] = useState<LauncherItem | null>(null);
  const [actionsParentItem, setActionsParentItem] = useState<LauncherItem | null>(null);
  const [selectedActionIndex, setSelectedActionIndex] = useState<number>(0);
  const [infoPage, setInfoPage] = useState<number>(0);
  const [existingClonedRepos, setExistingClonedRepos] = useState<Set<string>>(new Set());
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
    setIsSubmittingWizard(false);
    setQuery('');
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
              color: '#6366f1',
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
                color: '#3b82f6',
                imagePreview: it.dataUrl,
                description: new Date(it.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              });
            });
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
    } else {
      setWizardDynamicOptions([]);
    }
  };

  const startWizard = async (item: LauncherItem) => {
    if (!item?.wizard || !Array.isArray(item.wizard.steps) || item.wizard.steps.length === 0) return;
    setIsDonkeyToolsOpen(false);
    setActionsParentItem(null);
    setParentItem(null);
    setIsEasyClipMode(false);
    setIsPaletteMode(false);
    setWizardItem(item);
    setWizardStepIndex(0);
    setWizardValues({});
    setWizardSelectedOptionIndex(0);
    setWizardError(null);
    setIsSubmittingWizard(false);
    setQuery('');
    loadStepDynamicOptions(item.wizard.steps[0]);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const goToWizardStep = (targetIndex: number) => {
    if (!wizardItem) return;
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
        chosenValue = textVal || null;
      }
    }

    setWizardError(null);
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
              name: 'Upravit (v přípravě)',
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

    const unsubFocus = window.electronAPI?.onFocusInput?.(handleFocus);
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
      unsubFocus?.();
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
      window.electronAPI.getExistingClonedRepos(defaultCloneDir).then((repos) => {
        if (repos && Array.isArray(repos)) {
          setExistingClonedRepos(new Set(repos.map((r) => r.toLowerCase())));
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
      setQuery('');
      setSelectedIndex(0);
      setParentItem(null);
      setActionsParentItem(null);
      setIsEasyClipMode(false);
      savedParentItemRef.current = null;
      restoringIndexRef.current = null;
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
    if (isMagicGateItem(item) && !canCloneGit) {
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

    return baseActions;
  };

  const hasItemActions = (item?: LauncherItem | null) => {
    if (isMagicGateItem(item) && !canCloneGit) return false;
    return Boolean(getItemActions(item).length > 0);
  };

  const hasItemInfo = (item?: LauncherItem | null) => {
    if (isMagicGateItem(item) && !canCloneGit) return false;
    return Boolean(item?.info && typeof item.info === 'object' && Object.keys(item.info).length > 0);
  };

  const hasItemActionsOrInfo = (item?: LauncherItem | null) => {
    if (isMagicGateItem(item) && !canCloneGit) return false;
    return hasItemActions(item) || hasItemInfo(item);
  };

  // Enter actions / info mode for an item
  const enterActions = (item: LauncherItem) => {
    if (isMagicGateItem(item) && !canCloneGit) return;
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
          const nameNorm = removeDiacritics(item.name).toLowerCase();
          const locNorm = removeDiacritics(item.location).toLowerCase();
          return nameNorm.includes(normQuery) || locNorm.includes(normQuery);
        }
        return false;
      });
      return [...dynamicSnippets, ...customSnippets];
    }

    // Special slash commands: DonkeyTools & MagicPlan
    // Commands are ONLY shown when query starts with a slash and DonkeyTools or MagicPlan is enabled
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
      const slashCmd = trimmed.slice(1).trim().toLowerCase();
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

      const allSlash = [...dtCommands, ...planCommands, ...feedbackCommands];
      if (allSlash.length > 0) {
        return allSlash;
      }
      return [];
    }

    // Prefix "git:": searches exclusively in git repositories
    const gitPrefixMatch = trimmed.match(/^git:\s*(.*)$/i);
    if (gitPrefixMatch) {
      const gitQuery = gitPrefixMatch[1].trim();
      const gitItems = items.filter(
        (item) => item.settings === 'git' || item.sourceId === 'github' || item.sourceId === 'git'
      );

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
        const itemNameNorm = removeDiacritics(item.name || '').toLowerCase();
        const itemLocNorm = removeDiacritics(item.location || '').toLowerCase();
        const nameMatch = itemNameNorm.includes(normGitQuery);
        const locMatch = itemLocNorm.includes(normGitQuery);
        const optionsMatch = item.options?.some((opt) => {
          const optNameNorm = removeDiacritics(opt.name || '').toLowerCase();
          const optLocNorm = removeDiacritics(opt.location || '').toLowerCase();
          return optNameNorm.includes(normGitQuery) || optLocNorm.includes(normGitQuery);
        });
        const infoMatch =
          item.info &&
          Object.values(item.info).some((v) => {
            if (typeof v === 'string') {
              return removeDiacritics(v).toLowerCase().includes(normGitQuery);
            }
            return false;
          });
        return nameMatch || locMatch || Boolean(optionsMatch) || Boolean(infoMatch);
      });

      matchedGit.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const aNorm = removeDiacritics(a.name || '').toLowerCase();
        const bNorm = removeDiacritics(b.name || '').toLowerCase();

        const aStarts = aNorm.startsWith(normGitQuery);
        const bStarts = bNorm.startsWith(normGitQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = aNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normGitQuery));
        const bWordStarts = bNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normGitQuery));
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
      const mgItems = items.filter(
        (item) =>
          item.settings === 'magicgate' ||
          item.sourceId === 'magicgate' ||
          Boolean(item.id?.startsWith('mg-')) ||
          Boolean(item.options?.some((opt) => opt.settings === 'magicgate' || opt.id?.startsWith('mg-')))
      );

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
        const itemNameNorm = removeDiacritics(item.name || '').toLowerCase();
        const itemLocNorm = removeDiacritics(item.location || '').toLowerCase();
        const nameMatch = itemNameNorm.includes(normMgQuery);
        const locMatch = itemLocNorm.includes(normMgQuery);
        const shortcutsMatch = item.shortcuts?.some((sc) =>
          removeDiacritics(sc).toLowerCase().includes(normMgQuery)
        );
        const optionsMatch = item.options?.some((opt) => {
          const optNameNorm = removeDiacritics(opt.name || '').toLowerCase();
          const optLocNorm = removeDiacritics(opt.location || '').toLowerCase();
          return optNameNorm.includes(normMgQuery) || optLocNorm.includes(normMgQuery);
        });
        const infoMatch =
          item.info &&
          Object.values(item.info).some((v) => {
            if (typeof v === 'string') {
              return removeDiacritics(v).toLowerCase().includes(normMgQuery);
            }
            return false;
          });
        return nameMatch || locMatch || Boolean(shortcutsMatch) || Boolean(optionsMatch) || Boolean(infoMatch);
      });

      matchedMg.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const aNorm = removeDiacritics(a.name || '').toLowerCase();
        const bNorm = removeDiacritics(b.name || '').toLowerCase();

        const aStarts = aNorm.startsWith(normMgQuery);
        const bStarts = bNorm.startsWith(normMgQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        const aWordStarts = aNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normMgQuery));
        const bWordStarts = bNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normMgQuery));
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
          const n = removeDiacritics(it.name || '').toLowerCase();
          const l = removeDiacritics(it.location || '').toLowerCase();
          const infoM =
            it.info &&
            Object.values(it.info).some(
              (v) => typeof v === 'string' && removeDiacritics(v).toLowerCase().includes(norm)
            );
          return (
            (it.sourceId === 'mlog' || it.settings === 'mlog' || n.includes('mlog') || n.includes('taskmanager') || Boolean(infoM)) &&
            (n.includes(norm) || l.includes(norm) || Boolean(infoM))
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
        if (it.info) {
          const hasInfoTicket = Object.values(it.info).some((v) => {
            if (typeof v === 'string') {
              const cleaned = removeDiacritics(v.replace(/\s+/g, '')).toLowerCase();
              return cleaned.includes(normTicket);
            }
            return false;
          });
          if (hasInfoTicket) return true;
        }
        return false;
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
      const referencingItems = items.filter((it) => {
        if (it.info) {
          const hasInfoTicket = Object.values(it.info).some((v) => {
            if (typeof v === 'string') {
              const cleaned = removeDiacritics(v.replace(/\s+/g, '')).toLowerCase();
              return (
                cleaned.includes(`${tPref.toLowerCase()}${numId}`) ||
                cleaned.includes(`${rPref.toLowerCase()}${numId}`) ||
                cleaned.includes(numId)
              );
            }
            return false;
          });
          if (hasInfoTicket) return true;
        }
        const nameNorm = removeDiacritics(it.name || '').toLowerCase();
        return nameNorm.includes(numId);
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
        const itemNameNorm = removeDiacritics(item.name).toLowerCase();
        const itemLocNorm = removeDiacritics(item.location).toLowerCase();

        const nameMatch = itemNameNorm.includes(normQuery);
        const locMatch = itemLocNorm.includes(normQuery);
        const optionsMatch = item.options?.some((opt) => {
          const optNameNorm = removeDiacritics(opt.name).toLowerCase();
          const optLocNorm = removeDiacritics(opt.location).toLowerCase();
          return optNameNorm.includes(normQuery) || optLocNorm.includes(normQuery);
        });
        return nameMatch || locMatch || Boolean(optionsMatch);
      });

      // Sort according to priority ascending (smaller number = higher priority, default 0)
      matched.sort((a, b) => {
        const pA = a.priority ?? 0;
        const pB = b.priority ?? 0;
        if (pA !== pB) return pA - pB;

        const aNorm = removeDiacritics(a.name).toLowerCase();
        const bNorm = removeDiacritics(b.name).toLowerCase();

        // Sub-sort: exact start match comes first
        const aStarts = aNorm.startsWith(normQuery);
        const bStarts = bNorm.startsWith(normQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Sub-sort: word boundary match (e.g. "Adobe XD" when searching "xd", "Příkazový řádek" when searching "rad")
        const aWordStarts = aNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normQuery));
        const bWordStarts = bNorm.split(/[\s\-_\/]+/).some((w) => w.startsWith(normQuery));
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
  }, [query, items, parentItem, searchGoogle, defaultSearchEngine, mlogBaseUrl, mlogTaskPrefix, mlogRequestPrefix, engineFavicons, magicPlanEnabled, magicPlanData, magicPlanConfig, currentMagicPlanConfig]);

  // Keep selected index within bounds or restore saved index when returning from subitems
  useEffect(() => {
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
        setSelectedIndex(Math.max(0, Math.min(targetIndex, results.length - 1)));
        return;
      }
    }
    setSelectedIndex(0);
  }, [results]);

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

    window.electronAPI?.logAction?.({
      type: 'action',
      title: `Vybrána položka: ${item.name}`,
      details: `Akce: ${item.action || 'open'}, cíl: ${isCalculator ? item.name : (item.location || item.name)}`,
      status: 'info',
    });

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
      const toCopy = isCalculator ? item.name : (item.location || item.name);
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
      if (!isSnippet) {
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

    handleClose();
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
        initialRecursive: actionType === 'mgclonerecursive',
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
      // V přípravě – momentálně nic nedělá
      window.electronAPI?.logAction?.({
        type: 'action',
        title: 'Akce v přípravě: Upravit výstřižek',
        details: 'Tato funkce bude dostupná v další aktualizaci',
        status: 'info',
      });
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
      const totalInfoPages = Math.ceil(allInfoEntries.length / 8);

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

      // 2. Ctrl + Enter -> Directly execute 1st subitem
      if (e.ctrlKey) {
        if (currentItem.options && currentItem.options.length > 0) {
          handleExecute(currentItem.options[0]);
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
  const isGitPrefix = Boolean(trimmedQuery.match(/^git:/i));
  const isMagicGatePrefix = Boolean(trimmedQuery.match(/^(?:magicgate|mg):/i));
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
              ? getWizardStepIcon(currentWizardStep, wizardItem.icon)
              : isPaletteMode
              ? 'palette'
              : isEasyClipMode
              ? 'content_paste'
              : actionsParentItem
              ? 'bolt'
              : parentItem
              ? 'subdirectory_arrow_right'
              : isMlogMode
              ? 'support_agent'
              : isGitPrefix
              ? 'folder_code'
              : isMagicGatePrefix
              ? 'security'
              : 'search'}
          </span>
        </div>
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
              : isMlogMode
              ? 'Otevřít v Taskmanageru...'
              : isMagicGatePrefix
              ? 'Hledat v MagicGate instancích...'
              : isGitPrefix
              ? 'Hledat v repozitářích...'
              : 'Hledejte (min. 2 znaky), zadejte výpočet nebo URL...'
          }
          className="flex-1 bg-transparent text-[17px] text-[#f8fafc] placeholder:text-gray-500 placeholder:font-normal outline-none font-normal tracking-normal"
          autoFocus
          spellCheck={false}
        />
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
                {getWizardStepIcon(currentWizardStep, wizardItem.icon)}
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
                            isSelected ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'
                          }`}
                          style={{
                            backgroundColor: isSelected ? (opt.color || '#a855f7') : 'transparent',
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
                              {getWizardOptionIcon(currentWizardStep, opt)}
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

            {/* Information Preview Section ("Dosud zadané údaje") */}
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
                          <span className="material-symbols-outlined text-[13px]">{getWizardStepIcon(st, wizardItem?.icon)}</span>
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
              const ITEMS_PER_PAGE = 8;
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
                              ? 'V přípravě'
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
                  {actionsParentItem.actions!.length} akcí
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

                    {/* Actions on Item: Copy badge & Delete button OR Multi-select checkbox */}
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
                            <span className="text-xs font-semibold text-rose-400 hidden sm:inline">
                              {isCtrlDown ? 'Kopírovat' : 'Vložit'}
                            </span>
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
              className="max-h-[420px] overflow-y-auto px-2 py-1.5 space-y-1.5 focus:outline-none relative"
            >
              {results.map((item, idx) => {
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
                          canCloneGit && hasActionsOrInfo ? (
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
