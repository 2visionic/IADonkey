import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppConfig, FeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackType } from '../types';
import { CURRENT_APP_VERSION, IS_DEV } from '../changelog';

interface FeedbackWindowProps {
  config: AppConfig;
  onSaveConfig: (newConfig: AppConfig) => void;
  initialMode?: 'user' | 'dev';
}

export const FeedbackWindow: React.FC<FeedbackWindowProps> = ({
  config,
  onSaveConfig,
  initialMode = 'user',
}) => {
  const [mode, setMode] = useState<'user' | 'dev'>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const m = urlParams.get('mode');
    if (m === 'dev' || m === 'user') return m;
    return initialMode;
  });

  const isDevAvailable = useMemo(() => {
    if (IS_DEV) return true;
    if (initialMode === 'dev' || mode === 'dev') return true;
    try {
      if (localStorage.getItem('iadonkey_develop_mode') === 'true') return true;
    } catch {}
    if (config?.developMode) return true;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('mode') === 'dev') return true;
      const hash = window.location.hash;
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1 && new URLSearchParams(hash.slice(qIdx + 1)).get('mode') === 'dev') return true;
    } catch {}
    return false;
  }, [initialMode, mode]);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtry a vyhledávání
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [prioritySort, setPrioritySort] = useState<'none' | 'desc'>('none');

  // Modální okna a detaily
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeedbackItem | null>(null);
  const [detailItem, setDetailItem] = useState<FeedbackItem | null>(null);
  const [detailScreenshotUrl, setDetailScreenshotUrl] = useState<string | null>(null);
  const [loadingScreenshot, setLoadingScreenshot] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Formulář nového/editovaného feedbacku
  const [formType, setFormType] = useState<FeedbackType>('bug');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<FeedbackPriority>('normal');
  const [formAuthor, setFormAuthor] = useState('');
  const [formScreenshot, setFormScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog pro dokončení úkolu (zadání verze)
  const [resolvingItem, setResolvingItem] = useState<FeedbackItem | null>(null);
  const [targetVersionInput, setTargetVersionInput] = useState('');
  const [devNoteInput, setDevNoteInput] = useState('');

  // Notifikace o zkopírování do schránky
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  const sharedFolder = config.feedback?.sharedFolder?.trim() || '';
  const currentAuthor = config.feedback?.authorName?.trim() || formAuthor || 'Uživatel';

  // Načtení feedbacků ze souborů
  const loadFeedbacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (window.electronAPI?.listFeedbacks) {
        const res = await window.electronAPI.listFeedbacks(sharedFolder || undefined);
        if (res.success) {
          setItems(res.items || []);
        } else {
          setError(res.error || 'Nepodařilo se načíst záznamy zpětné vazby.');
        }
      } else {
        // Fallback pro prohlížeč / test
        setItems([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Chyba při komunikaci se systémem.');
    } finally {
      setLoading(false);
    }
  }, [sharedFolder]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  // Posluchač změny režimu z Electronu
  useEffect(() => {
    if (window.electronAPI?.onFeedbackModeChanged) {
      const unsub = window.electronAPI.onFeedbackModeChanged((newMode) => {
        setMode(newMode);
      });
      return () => unsub();
    }
  }, []);

  // Výběr sdílené složky
  const handleSelectFolder = async () => {
    if (window.electronAPI?.selectFeedbackFolder) {
      const folder = await window.electronAPI.selectFeedbackFolder();
      if (folder) {
        const newCfg: AppConfig = {
          ...config,
          feedback: {
            ...config.feedback,
            sharedFolder: folder,
          },
        };
        onSaveConfig(newCfg);
      }
    }
  };

  // Načtení screenshotu pro detail
  useEffect(() => {
    if (detailItem && detailItem.screenshotFilename && detailItem.hasScreenshot) {
      setLoadingScreenshot(true);
      if (window.electronAPI?.getFeedbackScreenshot) {
        window.electronAPI
          .getFeedbackScreenshot({
            folderPath: sharedFolder || undefined,
            filename: detailItem.screenshotFilename,
          })
          .then((res) => {
            if (res.success && res.dataUrl) {
              setDetailScreenshotUrl(res.dataUrl);
            } else {
              setDetailScreenshotUrl(null);
            }
          })
          .catch(() => setDetailScreenshotUrl(null))
          .finally(() => setLoadingScreenshot(false));
      }
    } else {
      setDetailScreenshotUrl(null);
      setLoadingScreenshot(false);
    }
  }, [detailItem, sharedFolder]);

  // Otevření formuláře pro nový feedback
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormType('bug');
    setFormTitle('');
    setFormDescription('');
    setFormPriority('normal');
    setFormAuthor(config.feedback?.authorName || '');
    setFormScreenshot(null);
    setIsCreateOpen(true);
  };

  // Otevření formuláře pro editaci (pouze pro stav 'new')
  const handleOpenEdit = (item: FeedbackItem) => {
    if (item.status !== 'new') return;
    setEditingItem(item);
    setFormType(item.type);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormPriority(item.priority);
    setFormAuthor(item.author);
    setFormScreenshot(null);
    setIsCreateOpen(true);
  };

  // Uložení formuláře (vytvoření nebo editace)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingItem) {
        // Editace
        const updated: FeedbackItem = {
          ...editingItem,
          type: formType,
          title: formTitle.trim(),
          description: formDescription.trim(),
          priority: formPriority,
          author: formAuthor.trim() || editingItem.author,
        };

        if (window.electronAPI?.updateFeedback) {
          const res = await window.electronAPI.updateFeedback({
            folderPath: sharedFolder || undefined,
            item: updated,
            screenshotBase64: formScreenshot || undefined,
          });
          if (res.success) {
            setIsCreateOpen(false);
            loadFeedbacks();
          } else {
            alert(res.error || 'Chyba při ukládání úprav.');
          }
        }
      } else {
        // Vytvoření nového
        if (window.electronAPI?.createFeedback) {
          const res = await window.electronAPI.createFeedback({
            folderPath: sharedFolder || undefined,
            data: {
              type: formType,
              title: formTitle.trim(),
              description: formDescription.trim(),
              priority: formPriority,
              author: formAuthor.trim() || undefined,
              appVersion: CURRENT_APP_VERSION,
            },
            screenshotBase64: formScreenshot || undefined,
          });

          if (res.success) {
            // Uložíme si zadané jméno do konfigurace, pokud ještě nebylo
            if (formAuthor.trim() && formAuthor.trim() !== config.feedback?.authorName) {
              onSaveConfig({
                ...config,
                feedback: {
                  ...config.feedback,
                  authorName: formAuthor.trim(),
                },
              });
            }
            setIsCreateOpen(false);
            loadFeedbacks();
          } else {
            alert(res.error || 'Chyba při zakládání zpětné vazby.');
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Smazání feedbacku
  const handleDelete = async (item: FeedbackItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isOwner = isItemOwnedByMe(item);
    if (!isOwner && mode !== 'dev') {
      alert('Můžete mazat pouze své vlastní záznamy.');
      return;
    }
    if (item.status !== 'new' && mode !== 'dev') {
      alert('Požadavek je již ve zpracování a nelze jej smazat.');
      return;
    }

    if (!confirm(`Opravdu chcete smazat požadavek "${item.title}"?`)) return;

    if (window.electronAPI?.deleteFeedback) {
      const res = await window.electronAPI.deleteFeedback({
        folderPath: sharedFolder || undefined,
        feedbackId: item.id,
      });
      if (res.success) {
        if (detailItem?.id === item.id) setDetailItem(null);
        await loadFeedbacks();
      } else {
        alert(res.error || 'Chyba při mazání.');
      }
    }
  };

  // Změna stavu vývojářem
  const handleUpdateStatus = async (
    item: FeedbackItem,
    newStatus: FeedbackStatus,
    targetVersion?: string,
    devNote?: string
  ) => {
    const updated: FeedbackItem = {
      ...item,
      status: newStatus,
      targetVersion: targetVersion !== undefined ? targetVersion : item.targetVersion,
      devNote: devNote !== undefined ? devNote : item.devNote,
      resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : item.resolvedAt,
      resolvedBy: newStatus === 'resolved' ? (currentAuthor || 'Vývojář') : item.resolvedBy,
    };

    if (window.electronAPI?.updateFeedback) {
      const res = await window.electronAPI.updateFeedback({
        folderPath: sharedFolder || undefined,
        item: updated,
      });
      if (res.success && res.item) {
        if (detailItem?.id === item.id) setDetailItem(res.item);
        loadFeedbacks();
      } else {
        alert(res.error || 'Chyba při změně stavu.');
      }
    }
  };

  // Otevření dialogu pro označení jako hotovo (výběr verze)
  const handleOpenResolveDialog = async (item: FeedbackItem) => {
    setResolvingItem(item);
    let nextVer = `v${CURRENT_APP_VERSION}`;
    if (window.electronAPI?.getFeedbackNextVersion) {
      nextVer = await window.electronAPI.getFeedbackNextVersion(CURRENT_APP_VERSION);
    }
    setTargetVersionInput(item.targetVersion || nextVer);
    setDevNoteInput(item.devNote || '');
  };

  const handleConfirmResolve = async () => {
    if (!resolvingItem) return;
    await handleUpdateStatus(resolvingItem, 'resolved', targetVersionInput.trim(), devNoteInput.trim());
    setResolvingItem(null);
  };

  // Změna priority vývojářem
  const handleUpdatePriority = async (item: FeedbackItem, newPriority: FeedbackPriority) => {
    if (item.priority === newPriority) return;
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, priority: newPriority } : it)));
    const updated: FeedbackItem = {
      ...item,
      priority: newPriority,
    };
    if (window.electronAPI?.updateFeedback) {
      const res = await window.electronAPI.updateFeedback({
        folderPath: sharedFolder || undefined,
        item: updated,
      });
      if (res.success && res.item) {
        if (detailItem?.id === item.id) setDetailItem(res.item);
        loadFeedbacks();
      }
    }
  };

  // Zkopírování do schránky jako markdown úkol
  const handleCopyToClipboard = (item: FeedbackItem) => {
    const md = `- [ ] **${item.title}** (${item.type === 'bug' ? 'Chyba' : item.type === 'idea' ? 'Nápad' : 'Dotaz'}, zadal ${item.author})\n  - ${item.description.replace(/\n/g, '\n  - ')}`;
    navigator.clipboard.writeText(md);
    setCopiedNotification(`Úkol byl zkopírován ve formátu TODOlistu!`);
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  // Globální a spolehlivé vkládání screenshotu ze schránky (Ctrl+V) ve formuláři
  const processClipboardForImage = useCallback(async (clipboardData?: DataTransfer | null) => {
    // 1. Zkusíme standardní DataTransfer položky (ze syntetického paste eventu)
    if (clipboardData?.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setFormScreenshot(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
      }
    }

    // 2. Přímé nativní čtení z Electron schránky (podporuje DIB / bitmapy z Windows Výstřižků a PrtScn)
    if (window.electronAPI?.getClipboardImage) {
      try {
        const dataUrl = await window.electronAPI.getClipboardImage();
        if (dataUrl) {
          setFormScreenshot(dataUrl);
          return true;
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback přes browser Clipboard API
    if (navigator.clipboard?.read) {
      try {
        const clipItems = await navigator.clipboard.read();
        for (const cItem of clipItems) {
          for (const t of cItem.types) {
            if (t.startsWith('image/')) {
              const blob = await cItem.getType(t);
              const reader = new FileReader();
              reader.onload = (event) => {
                if (event.target?.result) {
                  setFormScreenshot(event.target.result as string);
                }
              };
              reader.readAsDataURL(blob);
              return true;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return false;
  }, []);

  // Globální listener Ctrl+V pro otevřený modal
  useEffect(() => {
    if (!isCreateOpen) return;

    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      const handled = await processClipboardForImage(e.clipboardData);
      if (handled && !isInput) {
        e.preventDefault();
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [isCreateOpen, processClipboardForImage]);

  // Ruční vložení kliknutím na tlačítko schránky
  const handlePasteFromClipboardButton = async () => {
    await processClipboardForImage(null);
  };

  // Výběr souboru obrázku
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormScreenshot(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Pomocné funkce pro zjištění vlastnictví
  const isItemOwnedByMe = (item: FeedbackItem) => {
    if (!currentAuthor) return false;
    return item.author.trim().toLowerCase() === currentAuthor.trim().toLowerCase();
  };

  // Filtrování a řazení položek
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((it) => it.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((it) => it.type === typeFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q) ||
          it.author.toLowerCase().includes(q) ||
          (it.targetVersion && it.targetVersion.toLowerCase().includes(q))
      );
    }

    // Priority sort
    if (prioritySort === 'desc') {
      const priorityOrder: Record<FeedbackPriority, number> = {
        critical: 4,
        high: 3,
        normal: 2,
        low: 1,
      };
      result.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    }

    return result;
  }, [items, statusFilter, typeFilter, searchQuery, prioritySort]);

  // Statistiky počtu
  const counts = useMemo(() => {
    return {
      all: items.length,
      new: items.filter((i) => i.status === 'new').length,
      in_progress: items.filter((i) => i.status === 'in_progress').length,
      postponed: items.filter((i) => i.status === 'postponed').length,
      resolved: items.filter((i) => i.status === 'resolved').length,
    };
  }, [items]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0e0f12] text-gray-200 select-none overflow-hidden font-sans">
      {/* Horní ovládací lišta */}
      <div className="px-6 py-4 flex items-center justify-between gap-4 bg-[#12131a]/90 backdrop-blur-md shrink-0 min-h-[68px]">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${mode === 'dev' ? 'bg-amber-500/15 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'} flex items-center justify-center shrink-0`}>
            <span className="material-symbols-outlined text-2xl">
              {mode === 'dev' ? 'terminal' : 'rate_review'}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">
                {mode === 'dev' ? 'Správce zpětné vazby' : 'Zpětná vazba a nápady'}
              </h1>
              {mode === 'dev' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
                  DEV MODE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tlačítka v záhlaví */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Přepínač Uživatel / DEV dostupný pokud je povolen DEV režim */}
          {isDevAvailable && (
            <div className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-full shrink-0">
              <button
                type="button"
                onClick={() => setMode('user')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                  mode === 'user'
                    ? 'm3-primary-pill text-white shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                title="Pohled běžného uživatele"
              >
                <span className="material-symbols-outlined text-[15px]">person</span>
                <span>Uživatel</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('dev')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                  mode === 'dev'
                    ? 'bg-amber-500/25 text-amber-200 font-semibold shadow-md'
                    : 'text-gray-400 hover:text-amber-300 hover:bg-white/5'
                }`}
                title="Vývojářský pohled se správou všech podnětů"
              >
                <span className={`material-symbols-outlined text-[15px] ${mode === 'dev' ? 'text-amber-300' : 'text-amber-400/80'}`}>terminal</span>
                <span>DEV</span>
              </button>
            </div>
          )}

          {/* Obnovit (zarovnáno přesně na h-[38px] w-[38px]) */}
          <button
            type="button"
            onClick={loadFeedbacks}
            disabled={loading}
            className="w-[38px] h-[38px] rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer disabled:opacity-50 shrink-0"
            title="Znovu načíst záznamy (F5)"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>

          {/* Tlačítko Nový feedback */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="h-[38px] px-4 rounded-full m3-primary-pill text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-base">add</span>
            <span>Napsat připomínku</span>
          </button>
        </div>
      </div>

      {/* Upozornění na nenastavenou složku */}
      {!sharedFolder && (
        <div className="bg-amber-500/10 px-6 py-2.5 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">warning</span>
            <span>Není vybrána sdílená síťová složka pro ukládání feedbacku. Záznamy se ukládají lokálně.</span>
          </div>
          <button
            type="button"
            onClick={handleSelectFolder}
            className="underline font-bold hover:text-white cursor-pointer"
          >
            Vybrat sdílenou složku
          </button>
        </div>
      )}

      {/* Notifikace o zkopírování do schránky */}
      {copiedNotification && (
        <div className="bg-emerald-500/20 px-6 py-2 text-xs font-semibold text-emerald-300 flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Filtrovací lišta */}
      <div className="relative px-6 py-3 bg-[#12131a]/60 flex items-center justify-between gap-4 flex-wrap shrink-0 min-h-[62px]">
        {/* Status filtry - Material 3 pill bar (bez borderů) */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] rounded-full w-fit shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
              statusFilter === 'all'
                ? 'm3-primary-pill text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Vše</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none transition ${
                statusFilter === 'all'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'bg-white/[0.08] text-gray-400'
              }`}
            >
              {counts.all}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('new')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
              statusFilter === 'new'
                ? 'bg-amber-500/25 text-amber-200 shadow-md'
                : 'text-gray-400 hover:text-amber-300 hover:bg-white/5'
            }`}
          >
            <span>Nové</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none transition ${
                statusFilter === 'new'
                  ? 'bg-amber-500/30 text-amber-100 font-semibold'
                  : 'bg-white/[0.08] text-gray-400'
              }`}
            >
              {counts.new}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
              statusFilter === 'in_progress'
                ? 'bg-indigo-500/25 text-indigo-200 shadow-md'
                : 'text-gray-400 hover:text-indigo-300 hover:bg-white/5'
            }`}
          >
            <span>Ve zpracování</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none transition ${
                statusFilter === 'in_progress'
                  ? 'bg-indigo-500/30 text-indigo-100 font-semibold'
                  : 'bg-white/[0.08] text-gray-400'
              }`}
            >
              {counts.in_progress}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('postponed')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
              statusFilter === 'postponed'
                ? 'bg-white/15 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span>Odloženo</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none transition ${
                statusFilter === 'postponed'
                  ? 'bg-white/20 text-white font-semibold'
                  : 'bg-white/[0.08] text-gray-400'
              }`}
            >
              {counts.postponed}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-2 cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-emerald-500/25 text-emerald-200 shadow-md'
                : 'text-gray-400 hover:text-emerald-300 hover:bg-white/5'
            }`}
          >
            <span>Hotovo</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono leading-none transition ${
                statusFilter === 'resolved'
                  ? 'bg-emerald-500/30 text-emerald-100 font-semibold'
                  : 'bg-white/[0.08] text-gray-400'
              }`}
            >
              {counts.resolved}
            </span>
          </button>
        </div>

        {/* Pravé nástroje: Typový filtr jako switch + řazení dle priority + circle tlačítko vyhledávání */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Výběr typu pomocí switche (segmented switch, bez borderů) */}
          <div className="flex items-center gap-1 p-1 bg-white/[0.04] rounded-full shrink-0">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                typeFilter === 'all'
                  ? 'm3-primary-pill text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Všechny typy
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('bug')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'bug'
                  ? 'bg-rose-500/25 text-rose-200 shadow-md'
                  : 'text-gray-400 hover:text-rose-300 hover:bg-white/5'
              }`}
              title="Chyby"
            >
              <span className="material-symbols-outlined text-[15px]">bug_report</span>
              <span>Chyby</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('idea')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'idea'
                  ? 'bg-purple-500/25 text-purple-200 shadow-md'
                  : 'text-gray-400 hover:text-purple-300 hover:bg-white/5'
              }`}
              title="Nápady"
            >
              <span className="material-symbols-outlined text-[15px]">lightbulb</span>
              <span>Nápady</span>
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('other')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                typeFilter === 'other'
                  ? 'bg-sky-500/25 text-sky-200 shadow-md'
                  : 'text-gray-400 hover:text-sky-300 hover:bg-white/5'
              }`}
              title="Dotazy a jiné"
            >
              <span className="material-symbols-outlined text-[15px]">chat</span>
              <span>Dotazy</span>
            </button>
          </div>

          {/* Řazení dle priority pro dev (bez borderu, fullrounded) */}
          {mode === 'dev' && (
            <button
              type="button"
              onClick={() => setPrioritySort(prioritySort === 'desc' ? 'none' : 'desc')}
              className={`h-[38px] px-3.5 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                prioritySort === 'desc'
                  ? 'bg-indigo-500/25 text-indigo-300 shadow-sm'
                  : 'bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08]'
              }`}
              title="Řadit podle priority (Kritická -> Nízká)"
            >
              <span className="material-symbols-outlined text-sm">sort</span>
              <span>Dle priority</span>
            </button>
          )}

          {/* Circle ikona vyhledávání */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={`w-[38px] h-[38px] rounded-full flex items-center justify-center transition cursor-pointer shrink-0 ${
              searchQuery
                ? 'bg-indigo-500/25 text-indigo-300 shadow-sm'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white'
            }`}
            title={searchQuery ? `Aktivní hledání: "${searchQuery}"` : 'Hledat v připomínkách'}
          >
            <span className="material-symbols-outlined text-[18px]">search</span>
          </button>
        </div>

        {/* Vyhledávací input překrývající celý řádek s circle křížkem */}
        {isSearchOpen && (
          <div className="absolute inset-0 bg-[#12131a] flex items-center px-6 z-20 gap-3 animate-fade-in">
            <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat v připomínkách (název, popis, autor, verze)..."
              className="flex-1 h-[38px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-indigo-500 outline-none transition"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="w-[38px] h-[38px] rounded-full bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer shrink-0"
                title="Vymazat hledání"
              >
                <span className="material-symbols-outlined text-sm">backspace</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className="w-[38px] h-[38px] rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-gray-300 hover:text-white transition cursor-pointer shrink-0"
              title="Zavřít hledání (Esc)"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}
      </div>

      {/* Hlavní obsah - Seznam karet */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <span className="material-symbols-outlined text-3xl animate-spin">refresh</span>
            <span className="text-xs">Načítám připomínky...</span>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-red-500/10 text-red-300 text-xs text-center space-y-2">
            <span className="material-symbols-outlined text-2xl text-red-400">error</span>
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={handleSelectFolder}
              className="h-[38px] px-4 rounded-full bg-red-500/20 hover:bg-red-500/30 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 mx-auto"
            >
              <span className="material-symbols-outlined text-base">folder_open</span>
              <span>Zvolit jinou složku</span>
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3 rounded-2xl bg-white/[0.015]">
            <span className="material-symbols-outlined text-4xl opacity-40">rate_review</span>
            <div className="text-center">
              <p className="text-sm font-semibold text-zinc-300">Žádná zpětná vazba nebyla nalezena</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Zkuste změnit nastavení filtrů nebo vyhledávání.'
                  : 'Buďte první a napište připomínku nebo nápad na vylepšení!'}
              </p>
            </div>
            {!searchQuery && statusFilter === 'all' && (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="mt-2 h-[38px] px-5 rounded-full m3-primary-pill text-white text-xs font-semibold shadow-md hover:brightness-110 transition flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>Přidat první připomínku</span>
              </button>
            )}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isOwner = isItemOwnedByMe(item);
            const isLockedForUser = item.status !== 'new';

            return (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className={`group p-4 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col gap-2.5 relative shadow-sm hover:shadow-md ${
                  item.status === 'resolved'
                    ? 'bg-emerald-950/25 hover:bg-emerald-950/40'
                    : item.status === 'in_progress'
                    ? 'bg-indigo-950/30 hover:bg-indigo-950/45'
                    : item.status === 'postponed'
                    ? 'bg-zinc-900/50 hover:bg-zinc-900/70 opacity-80'
                    : 'bg-[#151622]/90 hover:bg-[#1a1b2a]'
                }`}
              >
                {/* Horní řádek: Typ, Priorita, Stav a Datum */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {/* Typ */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        item.type === 'bug'
                          ? 'bg-red-500/20 text-red-300'
                          : item.type === 'idea'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-blue-500/20 text-blue-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {item.type === 'bug'
                          ? 'bug_report'
                          : item.type === 'idea'
                          ? 'lightbulb'
                          : 'help'}
                      </span>
                      <span>{item.type === 'bug' ? 'Chyba' : item.type === 'idea' ? 'Nápad' : 'Dotaz'}</span>
                    </span>

                    {/* Priorita - viditelná vždy pro všechny uživatele */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        item.priority === 'critical'
                          ? 'bg-rose-500/25 text-rose-300 animate-pulse'
                          : item.priority === 'high'
                          ? 'bg-amber-500/20 text-amber-300'
                          : item.priority === 'low'
                          ? 'bg-white/5 text-gray-400'
                          : 'bg-white/10 text-gray-300'
                      }`}
                      title={`Priorita: ${
                        item.priority === 'critical'
                          ? 'Kritická'
                          : item.priority === 'high'
                          ? 'Vysoká'
                          : item.priority === 'low'
                          ? 'Nízká'
                          : 'Normální'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px] leading-none">
                        {item.priority === 'critical'
                          ? 'priority_high'
                          : item.priority === 'high'
                          ? 'arrow_upward'
                          : item.priority === 'low'
                          ? 'arrow_downward'
                          : 'remove'}
                      </span>
                      <span>
                        {item.priority === 'critical'
                          ? 'Kritická'
                          : item.priority === 'high'
                          ? 'Vysoká'
                          : item.priority === 'low'
                          ? 'Nízká'
                          : 'Normální'}
                      </span>
                    </span>

                    {/* Stav */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                        item.status === 'new'
                          ? 'bg-amber-500/20 text-amber-300'
                          : item.status === 'in_progress'
                          ? 'bg-indigo-500/25 text-indigo-300 animate-pulse'
                          : item.status === 'postponed'
                          ? 'bg-zinc-700/30 text-zinc-400'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px]">
                        {item.status === 'new'
                          ? 'fiber_new'
                          : item.status === 'in_progress'
                          ? 'pending'
                          : item.status === 'postponed'
                          ? 'schedule'
                          : 'check_circle'}
                      </span>
                      <span>
                        {item.status === 'new'
                          ? 'Nové'
                          : item.status === 'in_progress'
                          ? 'Ve zpracování'
                          : item.status === 'postponed'
                          ? 'Odloženo'
                          : item.targetVersion
                          ? `Hotovo (${item.targetVersion})`
                          : 'Hotovo'}
                      </span>
                    </span>

                    {/* Indikátor screenshotu */}
                    {item.hasScreenshot && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/10 text-zinc-300 flex items-center gap-1"
                        title="Přiložen snímek obrazovky"
                      >
                        <span className="material-symbols-outlined text-[13px]">image</span>
                        <span>Snímek</span>
                      </span>
                    )}
                  </div>

                  {/* Datum a Autor */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                    <span className="font-semibold text-zinc-300">{item.author}</span>
                    <span>•</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                {/* Titulek */}
                <h3 className="text-sm font-bold text-white leading-snug group-hover:text-indigo-300 transition">
                  {item.title}
                </h3>

                {/* Zkrácený popis */}
                <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                  {item.description || <span className="italic text-zinc-500">Bez textového popisu</span>}
                </p>

                {/* Poznámka vývojáře (pokud je) */}
                {item.devNote && (
                  <div className="text-[11px] bg-indigo-500/10 px-3 py-1.5 text-indigo-200 italic rounded-xl">
                    <span className="font-bold font-sans not-italic text-indigo-300">Vývojář: </span>
                    {item.devNote}
                  </div>
                )}

                {/* Spodní lišta akcí */}
                <div
                  className="mt-1 pt-1.5 flex items-center justify-between text-xs text-zinc-400"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <span>v{item.appVersion}</span>
                    {item.osVersion && <span>• {item.osVersion}</span>}
                  </div>

                  {/* Akční tlačítka */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {/* Dev ovládání stavu */}
                    {mode === 'dev' ? (
                      <>
                        {/* Přepínač priority (switch) */}
                        <div className="flex items-center p-0.5 bg-white/[0.04] rounded-full">
                          <button
                            type="button"
                            onClick={() => handleUpdatePriority(item, 'low')}
                            className={`h-[24px] px-2 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                              item.priority === 'low'
                                ? 'bg-white/20 text-white shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                            }`}
                            title="Nízká priorita"
                          >
                            Nízká
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePriority(item, 'normal')}
                            className={`h-[24px] px-2 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                              item.priority === 'normal'
                                ? 'm3-primary-pill text-white shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                            }`}
                            title="Normální priorita"
                          >
                            Normální
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePriority(item, 'high')}
                            className={`h-[24px] px-2 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                              item.priority === 'high'
                                ? 'bg-amber-500/25 text-amber-200 shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                            }`}
                            title="Vysoká priorita"
                          >
                            Vysoká
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePriority(item, 'critical')}
                            className={`h-[24px] px-2 rounded-full text-[10px] font-semibold transition-all cursor-pointer ${
                              item.priority === 'critical'
                                ? 'bg-rose-500/25 text-rose-200 shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                            }`}
                            title="Kritická priorita"
                          >
                            Kritická
                          </button>
                        </div>

                        {/* Přepínání stavů */}
                        {item.status === 'new' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(item, 'in_progress')}
                            className="h-[28px] px-3 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
                            title="Nastavit stav Ve zpracování"
                          >
                            <span className="material-symbols-outlined text-[13px]">pending</span>
                            <span>Zpracovat</span>
                          </button>
                        )}

                        {item.status === 'in_progress' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenResolveDialog(item)}
                              className="h-[28px] px-3 rounded-full bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
                              title="Označit jako hotovo a nastavit verzi"
                            >
                              <span className="material-symbols-outlined text-[13px]">check</span>
                              <span>Hotovo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item, 'postponed')}
                              className="h-[28px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-zinc-300 text-[11px] font-semibold cursor-pointer transition"
                              title="Odložit řešení"
                            >
                              Odložit
                            </button>
                          </>
                        )}

                        {item.status === 'postponed' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(item, 'in_progress')}
                            className="h-[28px] px-3 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 text-[11px] font-semibold cursor-pointer transition"
                          >
                            Vrátit do zpracování
                          </button>
                        )}

                        {item.status === 'resolved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(item, 'in_progress')}
                            className="h-[28px] px-3 rounded-full bg-white/10 hover:bg-white/15 text-zinc-300 hover:text-white text-[11px] cursor-pointer transition"
                            title="Znovu otevřít"
                          >
                            Znovu otevřít
                          </button>
                        )}

                        {/* Zkopírovat do TODO */}
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(item)}
                          className="w-[28px] h-[28px] rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                          title="Zkopírovat jako úkol do schránky (TODO.md formát)"
                        >
                          <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>

                        {/* Smazat pro dev */}
                        <button
                          type="button"
                          onClick={(e) => handleDelete(item, e)}
                          className="w-[28px] h-[28px] rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                          title="Smazat feedback"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </>
                    ) : (
                      /* Uživatelské akce */
                      <>
                        {isOwner && !isLockedForUser && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(item);
                              }}
                              className="h-[28px] px-3 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition"
                              title="Upravit svůj požadavek"
                            >
                              <span className="material-symbols-outlined text-[13px]">edit</span>
                              <span>Upravit</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDelete(item, e)}
                              className="w-[28px] h-[28px] rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 flex items-center justify-center transition cursor-pointer"
                              title="Smazat svůj požadavek"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                          </>
                        )}

                        {isOwner && isLockedForUser && (
                          <span
                            className="text-[10px] text-zinc-500 italic flex items-center gap-1 cursor-default"
                            title="Požadavek je již ve zpracování a nelze jej upravovat"
                          >
                            <span className="material-symbols-outlined text-[12px]">lock</span>
                            <span>Zamčeno pro úpravy</span>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DETAIL DRAWER / MODAL */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] bg-[#14151f] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Záhlaví detailu */}
            <div className="px-6 py-4 flex items-center justify-between bg-[#181a26] flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                    detailItem.type === 'bug'
                      ? 'bg-rose-500/20 text-rose-300'
                      : detailItem.type === 'idea'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-sky-500/20 text-sky-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">
                    {detailItem.type === 'bug' ? 'bug_report' : detailItem.type === 'idea' ? 'lightbulb' : 'chat'}
                  </span>
                  <span>{detailItem.type === 'bug' ? 'Chyba' : detailItem.type === 'idea' ? 'Nápad' : 'Dotaz'}</span>
                </span>

                {/* Priorita v detailu */}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                    detailItem.priority === 'critical'
                      ? 'bg-rose-500/25 text-rose-300 animate-pulse'
                      : detailItem.priority === 'high'
                      ? 'bg-amber-500/20 text-amber-300'
                      : detailItem.priority === 'low'
                      ? 'bg-white/5 text-gray-400'
                      : 'bg-white/10 text-gray-300'
                  }`}
                  title={`Priorita: ${detailItem.priority}`}
                >
                  <span className="material-symbols-outlined text-sm leading-none">
                    {detailItem.priority === 'critical'
                      ? 'priority_high'
                      : detailItem.priority === 'high'
                      ? 'arrow_upward'
                      : detailItem.priority === 'low'
                      ? 'arrow_downward'
                      : 'remove'}
                  </span>
                  <span>
                    Priorita:{' '}
                    {detailItem.priority === 'critical'
                      ? 'Kritická'
                      : detailItem.priority === 'high'
                      ? 'Vysoká'
                      : detailItem.priority === 'low'
                      ? 'Nízká'
                      : 'Normální'}
                  </span>
                </span>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                    detailItem.status === 'new'
                      ? 'bg-amber-500/20 text-amber-300'
                      : detailItem.status === 'in_progress'
                      ? 'bg-indigo-500/25 text-indigo-300'
                      : detailItem.status === 'postponed'
                      ? 'bg-zinc-700/30 text-zinc-400'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  <span>
                    {detailItem.status === 'new'
                      ? 'Nové'
                      : detailItem.status === 'in_progress'
                      ? 'Ve zpracování'
                      : detailItem.status === 'postponed'
                      ? 'Odloženo'
                      : detailItem.targetVersion
                      ? `Hotovo (${detailItem.targetVersion})`
                      : 'Hotovo'}
                  </span>
                </span>

                <span className="text-xs font-semibold text-gray-400 ml-1">
                  od {detailItem.author} {detailItem.authorHost && `(${detailItem.authorHost})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                title="Zavřít detail (Esc)"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Obsah detailu */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              <div>
                <h2 className="text-lg font-bold text-white leading-snug">{detailItem.title}</h2>
                <div className="flex items-center gap-3 text-xs text-gray-400 font-mono mt-1">
                  <span>Zadáno: {new Date(detailItem.createdAt).toLocaleString()}</span>
                  <span>•</span>
                  <span>Verze aplikace: v{(detailItem.appVersion || CURRENT_APP_VERSION).replace(/^v/, '')}</span>
                </div>
              </div>

              {/* Status & Version alert */}
              {detailItem.status === 'resolved' && (
                <div className="p-3.5 rounded-xl bg-emerald-500/15 text-emerald-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
                    <div>
                      <p className="font-bold">Vyřešeno</p>
                      {detailItem.targetVersion && (
                        <p className="text-[11px] text-emerald-300">
                          Bude obsaženo v nadcházející verzi: <strong className="font-mono">{detailItem.targetVersion}</strong>
                        </p>
                      )}
                    </div>
                  </div>
                  {detailItem.resolvedAt && (
                    <span className="text-[10px] text-emerald-400/80 font-mono">
                      {new Date(detailItem.resolvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}

              {/* Text popisu */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Popis</label>
                <div className="p-4 rounded-xl bg-black/40 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap select-text">
                  {detailItem.description || <span className="italic text-zinc-500">Bez textového popisu</span>}
                </div>
              </div>

              {/* Poznámka vývojáře */}
              {detailItem.devNote && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Poznámka vývojáře</label>
                  <div className="p-3.5 rounded-xl bg-indigo-500/10 text-xs text-indigo-200 italic leading-relaxed select-text">
                    {detailItem.devNote}
                  </div>
                </div>
              )}

              {/* Snímek obrazovky */}
              {detailItem.hasScreenshot && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Přiložený snímek obrazovky</label>
                  {loadingScreenshot ? (
                    <div className="h-40 rounded-xl bg-black/40 flex items-center justify-center text-xs text-zinc-500 gap-2">
                      <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                      <span>Načítám obrázek...</span>
                    </div>
                  ) : detailScreenshotUrl ? (
                    <div
                      className="group relative rounded-xl overflow-hidden bg-black/40 cursor-pointer max-h-72 flex items-center justify-center"
                      onClick={() => setLightboxImage(detailScreenshotUrl)}
                    >
                      <img
                        src={detailScreenshotUrl}
                        alt="Screenshot"
                        className="object-contain max-h-72 w-full transition group-hover:scale-[1.01]"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 text-xs font-bold text-white">
                        <span className="material-symbols-outlined text-lg">zoom_in</span>
                        <span>Klikněte pro zvětšení na celou obrazovku</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-zinc-900 text-xs text-zinc-500 italic">
                      Snímek obrazovky se nepodařilo načíst ze souboru.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Patička detailu */}
            <div className="px-6 py-3.5 flex items-center justify-between bg-[#181a26]">
              <div className="flex items-center gap-2">
                {mode === 'dev' && (
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(detailItem)}
                    className="h-[38px] px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    <span>Zkopírovat do TODO</span>
                  </button>
                )}
                {(mode === 'dev' || (isItemOwnedByMe(detailItem) && detailItem.status === 'new')) && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(detailItem, e)}
                    className="h-[38px] px-3.5 rounded-full hover:bg-red-500/15 text-zinc-400 hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    title="Smazat feedback"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                    <span>Smazat</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {mode === 'dev' ? (
                  detailItem.status === 'in_progress' ? (
                    <button
                      type="button"
                      onClick={() => handleOpenResolveDialog(detailItem)}
                      className="h-[38px] px-4 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">check</span>
                      <span>Označit jako hotovo</span>
                    </button>
                  ) : detailItem.status === 'new' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(detailItem, 'in_progress')}
                      className="h-[38px] px-4 rounded-full m3-primary-pill text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">pending</span>
                      <span>Vzít do zpracování</span>
                    </button>
                  ) : null
                ) : (
                  isItemOwnedByMe(detailItem) &&
                  detailItem.status === 'new' && (
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenEdit(detailItem);
                        setDetailItem(null);
                      }}
                      className="h-[38px] px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">edit</span>
                      <span>Upravit</span>
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  className="h-[38px] px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 text-xs font-semibold transition cursor-pointer"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FORMULÁŘOVÝ MODAL (VYTVOŘENÍ / EDITACE) */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onPaste={(e) => processClipboardForImage(e.clipboardData)}
        >
          <div className="w-full max-w-xl max-h-[90vh] bg-[#14151f] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 flex items-center justify-between bg-[#181a26]">
              <h2 className="text-base font-bold text-white">
                {editingItem ? 'Upravit připomínku' : 'Nová připomínka či nápad'}
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
                title="Zavřít formulář (Esc)"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Typ feedbacku (switch přepínač bez borderů) */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Typ hlášení
                </label>
                <div className="p-1 bg-white/[0.04] rounded-full flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFormType('bug')}
                    className={`flex-1 py-1.5 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formType === 'bug'
                        ? 'bg-rose-500/25 text-rose-200 shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-rose-400">bug_report</span>
                    <span>Chyba</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('idea')}
                    className={`flex-1 py-1.5 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formType === 'idea'
                        ? 'bg-purple-500/25 text-purple-200 shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-purple-400">lightbulb</span>
                    <span>Nápad</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('other')}
                    className={`flex-1 py-1.5 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formType === 'other'
                        ? 'bg-sky-500/25 text-sky-200 shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-sky-400">chat</span>
                    <span>Dotaz / Jiné</span>
                  </button>
                </div>
              </div>

              {/* Priorita (switch přepínač bez borderů) */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Priorita
                </label>
                <div className="p-1 bg-white/[0.04] rounded-full flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFormPriority('low')}
                    className={`flex-1 py-1.5 px-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'low'
                        ? 'bg-white/20 text-white shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-gray-400">arrow_downward</span>
                    <span>Nízká</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('normal')}
                    className={`flex-1 py-1.5 px-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'normal'
                        ? 'm3-primary-pill text-white shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-indigo-300">remove</span>
                    <span>Normální</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('high')}
                    className={`flex-1 py-1.5 px-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'high'
                        ? 'bg-amber-500/25 text-amber-200 shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-amber-400">arrow_upward</span>
                    <span>Vysoká</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('critical')}
                    className={`flex-1 py-1.5 px-2.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'critical'
                        ? 'bg-rose-500/25 text-rose-200 shadow-md'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-rose-400">priority_high</span>
                    <span>Kritická</span>
                  </button>
                </div>
              </div>

              {/* Jméno odesílatele */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Vaše jméno
                </label>
                <input
                  type="text"
                  required
                  value={formAuthor}
                  onChange={(e) => setFormAuthor(e.target.value)}
                  placeholder="např. Petr Kulhánek"
                  className="w-full h-[38px] px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Název / Titulek */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Název / Stručné shrnutí
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="např. Špatně zarovnaný text v denní timeline"
                  className="w-full h-[38px] px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Popis */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Podrobný popis
                </label>
                <textarea
                  rows={4}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Popište co přesně se stalo, jak problém vyvolat nebo jak by měla nová funkce fungovat..."
                  className="w-full p-3 rounded-lg border border-white/10 bg-black/30 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed transition"
                />
              </div>

              {/* Snímek obrazovky */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Snímek obrazovky (volitelné)
                  </label>
                  <span className="text-[11px] text-gray-500">
                    Lze vložit klávesou <strong className="font-mono text-gray-300">Ctrl+V</strong>
                  </span>
                </div>

                {formScreenshot ? (
                  <div className="relative rounded-xl overflow-hidden bg-black/40 max-h-48 flex items-center justify-center group">
                    <img src={formScreenshot} alt="Náhled screenshotu" className="object-contain max-h-48 w-full" />
                    <button
                      type="button"
                      onClick={() => setFormScreenshot(null)}
                      className="absolute top-2 right-2 px-3 py-1.5 rounded-full bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 shadow cursor-pointer transition"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      <span>Odstranit</span>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 bg-white/[0.02]">
                    <span className="material-symbols-outlined text-2xl text-gray-500">add_photo_alternate</span>
                    <p className="text-xs text-gray-400 text-center">
                      Stiskněte <strong className="text-white">Ctrl+V</strong> pro vložení snímku ze schránky nebo použijte tlačítka:
                    </p>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <button
                        type="button"
                        onClick={handlePasteFromClipboardButton}
                        className="h-[34px] px-3.5 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Vložit obrázek přímo ze schránky systému"
                      >
                        <span className="material-symbols-outlined text-base">content_paste</span>
                        <span>Vložit ze schránky (Ctrl+V)</span>
                      </button>
                      <label className="h-[34px] px-3.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer">
                        <span className="material-symbols-outlined text-base">folder_open</span>
                        <span>Vybrat soubor</span>
                        <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="h-[38px] px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 text-xs font-semibold transition cursor-pointer"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formTitle.trim()}
                  className="h-[38px] px-5 rounded-full m3-primary-pill text-white text-xs font-semibold shadow-md active:scale-95 disabled:opacity-50 transition cursor-pointer"
                >
                  {isSubmitting ? 'Ukládám...' : editingItem ? 'Uložit změny' : 'Odeslat připomínku'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG PRO VYŘEŠENÍ / BUDOUCÍ VERZI (DEV) */}
      {resolvingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#14151f] rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 animate-zoom-in">
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="material-symbols-outlined text-2xl">task_alt</span>
              <h3 className="text-base font-bold text-white">Označit jako hotovo</h3>
            </div>

            <p className="text-xs text-gray-300">
              Požadavek <strong className="text-white">"{resolvingItem.title}"</strong> bude označen jako vyřešený. Zadejte verzi, ve které bude oprava/novinka dostupná.
            </p>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Budoucí verze (vydání)
              </label>
              <input
                type="text"
                required
                value={targetVersionInput}
                onChange={(e) => setTargetVersionInput(e.target.value)}
                placeholder="např. v1.2.4"
                className="w-full h-[38px] px-3 py-2 rounded-lg border border-white/10 bg-black/30 text-sm text-white font-mono font-bold focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                Poznámka vývojáře pro uživatele (volitelné)
              </label>
              <textarea
                rows={2}
                value={devNoteInput}
                onChange={(e) => setDevNoteInput(e.target.value)}
                placeholder="např. Opraveno ve vývojové větvi, přidán filtr..."
                className="w-full p-3 rounded-lg border border-white/10 bg-black/30 text-sm text-white focus:outline-none focus:border-emerald-500 resize-none transition"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResolvingItem(null)}
                className="h-[38px] px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 text-xs font-semibold cursor-pointer transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                className="h-[38px] px-5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                Dokončit a uložit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PRO PLNÉ ZOBRAZENÍ SCREENSHOTU */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Zvětšený screenshot"
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
