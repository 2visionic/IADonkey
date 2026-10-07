import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppConfig, FeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackType } from '../types';
import { CURRENT_APP_VERSION } from '../changelog';

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

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtry a vyhledávání
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
  const handleDelete = async (item: FeedbackItem) => {
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
        loadFeedbacks();
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

  // Vložení screenshotu ze schránky (Ctrl+V) ve formuláři
  const handlePasteScreenshot = (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;

    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.indexOf('image') !== -1) {
        const file = clipItems[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setFormScreenshot(event.target?.result as string);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    }
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
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between gap-4 bg-[#12131a]/90 backdrop-blur-md shrink-0 min-h-[68px]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
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
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  DEV MODE
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {sharedFolder ? (
                <span className="truncate max-w-[360px] inline-block font-mono text-[11px]" title={sharedFolder}>
                  Složka: {sharedFolder}
                </span>
              ) : (
                <span className="text-amber-400">Složka není nastavena (ukládá se lokálně)</span>
              )}
            </p>
          </div>
        </div>

        {/* Tlačítka v záhlaví */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Tlačítko změny složky */}
          <button
            type="button"
            onClick={handleSelectFolder}
            className="h-[38px] px-3.5 rounded-full border border-white/10 hover:border-white/20 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-gray-300 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            title="Změnit cílovou sdílenou složku pro feedback"
          >
            <span className="material-symbols-outlined text-base text-amber-400">folder_open</span>
            <span>Složka</span>
          </button>

          {/* Přepínač Dev / User pohledu pro vývojáře */}
          <button
            type="button"
            onClick={() => setMode(mode === 'dev' ? 'user' : 'dev')}
            className={`h-[38px] px-3.5 rounded-full border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
              mode === 'dev'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                : 'bg-white/[0.04] border-white/10 text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Přepnout zobrazení pro vývojáře / běžného uživatele"
          >
            <span className="material-symbols-outlined text-base">
              {mode === 'dev' ? 'person' : 'code'}
            </span>
            <span>{mode === 'dev' ? 'Pohled uživatele' : 'DEV pohled'}</span>
          </button>

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
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-300">
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
        <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-6 py-2 text-xs font-semibold text-emerald-300 flex items-center gap-2 animate-fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Filtrovací lišta */}
      <div className="px-6 py-3 border-b border-white/[0.06] bg-[#12131a]/60 flex items-center justify-between gap-4 flex-wrap shrink-0">
        {/* Status filtry - Material 3 pill bar */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] rounded-full w-fit shrink-0">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'all'
                ? 'm3-primary-pill text-white shadow-md'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Vše</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.all})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('new')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'new'
                ? 'bg-amber-500/25 text-amber-200 border border-amber-500/30 shadow-md'
                : 'text-gray-400 hover:text-amber-300 hover:bg-white/5'
            }`}
          >
            <span>Nové</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.new})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('in_progress')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'in_progress'
                ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/30 shadow-md'
                : 'text-gray-400 hover:text-indigo-300 hover:bg-white/5'
            }`}
          >
            <span>Ve zpracování</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.in_progress})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('postponed')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'postponed'
                ? 'bg-white/15 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <span>Odloženo</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.postponed})</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('resolved')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              statusFilter === 'resolved'
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/30 shadow-md'
                : 'text-gray-400 hover:text-emerald-300 hover:bg-white/5'
            }`}
          >
            <span>Hotovo</span>
            <span className="text-[10px] opacity-80 font-mono">({counts.resolved})</span>
          </button>
        </div>

        {/* Vyhledávací pole + typový filtr + řazení dle priority */}
        <div className="flex items-center gap-2 flex-1 justify-end max-w-lg">
          {/* Typ filtru */}
          <div className="relative shrink-0">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="h-[38px] pl-3.5 pr-8 rounded-full border border-white/10 bg-white/[0.04] text-xs text-gray-300 focus:outline-none focus:border-indigo-500 cursor-pointer appearance-none transition"
            >
              <option value="all">Všechny typy</option>
              <option value="bug">Chyba</option>
              <option value="idea">Nápad</option>
              <option value="other">Dotaz / Jiné</option>
            </select>
            <span className="material-symbols-outlined text-sm text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* Řazení dle priority pro dev */}
          {mode === 'dev' && (
            <button
              type="button"
              onClick={() => setPrioritySort(prioritySort === 'desc' ? 'none' : 'desc')}
              className={`h-[38px] px-3.5 rounded-full border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 ${
                prioritySort === 'desc'
                  ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                  : 'bg-white/[0.04] border-white/10 text-gray-400 hover:text-white'
              }`}
              title="Řadit podle priority (Kritická -> Nízká)"
            >
              <span className="material-symbols-outlined text-sm">sort</span>
              <span>Dle priority</span>
            </button>
          )}

          {/* Hledání */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat v připomínkách..."
              className="w-full h-[38px] pl-9 pr-8 rounded-full border border-white/10 bg-white/[0.04] text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        </div>
      </div>
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hlavní obsah - Seznam karet */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <span className="material-symbols-outlined text-3xl animate-spin">refresh</span>
            <span className="text-xs">Načítám připomínky...</span>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs text-center space-y-2">
            <span className="material-symbols-outlined text-2xl text-red-400">error</span>
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={handleSelectFolder}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-medium cursor-pointer"
            >
              Zvolit jinou složku
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
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
                className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition cursor-pointer"
              >
                + Přidat první připomínku
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
                className={`group p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col gap-2.5 relative ${
                  item.status === 'resolved'
                    ? 'bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40'
                    : item.status === 'in_progress'
                    ? 'bg-indigo-950/15 border-indigo-500/25 hover:border-indigo-500/45'
                    : item.status === 'postponed'
                    ? 'bg-zinc-900/40 border-zinc-700/30 hover:border-zinc-600/50 opacity-80'
                    : 'bg-[#14151e]/80 border-white/[0.08] hover:border-white/[0.18] hover:bg-[#181924]'
                }`}
              >
                {/* Horní řádek: Typ, Priorita, Stav a Datum */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {/* Typ */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        item.type === 'bug'
                          ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                          : item.type === 'idea'
                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
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
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 animate-pulse'
                          : item.priority === 'high'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : item.priority === 'low'
                          ? 'bg-white/5 text-gray-400 border border-white/5'
                          : 'bg-white/10 text-gray-300 border border-white/10'
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
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : item.status === 'in_progress'
                          ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 animate-pulse'
                          : item.status === 'postponed'
                          ? 'bg-zinc-700/30 text-zinc-400 border border-zinc-700/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
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
                          : 'Hotovo'}
                      </span>
                    </span>

                    {/* Zobrazení verze u dokončeného */}
                    {item.status === 'resolved' && item.targetVersion && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                        Verze: {item.targetVersion}
                      </span>
                    )}

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
                  <div className="text-[11px] bg-indigo-500/10 border-l-2 border-indigo-400 px-2.5 py-1 text-indigo-200 italic rounded-r">
                    <span className="font-bold font-sans not-italic text-indigo-300">Vývojář: </span>
                    {item.devNote}
                  </div>
                )}

                {/* Spodní lišta akcí */}
                <div
                  className="mt-1 pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    <span>v{item.appVersion}</span>
                    {item.osVersion && <span>• {item.osVersion}</span>}
                  </div>

                  {/* Akční tlačítka */}
                  <div className="flex items-center gap-1.5">
                    {/* Dev ovládání stavu */}
                    {mode === 'dev' ? (
                      <>
                        {/* Změna priority */}
                        <select
                          value={item.priority}
                          onChange={(e) => handleUpdatePriority(item, e.target.value as FeedbackPriority)}
                          className="px-2 py-0.5 rounded-lg border border-white/10 bg-[#1e202d] text-[11px] text-zinc-200 cursor-pointer"
                        >
                          <option value="low">Nízká</option>
                          <option value="normal">Normální</option>
                          <option value="high">Vysoká</option>
                          <option value="critical">Kritická</option>
                        </select>

                        {/* Přepínání stavů */}
                        {item.status === 'new' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(item, 'in_progress')}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
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
                              className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              title="Označit jako hotovo a nastavit verzi"
                            >
                              <span className="material-symbols-outlined text-[13px]">check</span>
                              <span>Hotovo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item, 'postponed')}
                              className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer"
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
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[11px] font-semibold cursor-pointer"
                          >
                            Vrátit do zpracování
                          </button>
                        )}

                        {item.status === 'resolved' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(item, 'in_progress')}
                            className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[11px] cursor-pointer"
                            title="Znovu otevřít"
                          >
                            Znovu otevřít
                          </button>
                        )}

                        {/* Zkopírovat do TODO */}
                        <button
                          type="button"
                          onClick={() => handleCopyToClipboard(item)}
                          className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                          title="Zkopírovat jako úkol do schránky (TODO.md formát)"
                        >
                          <span className="material-symbols-outlined text-sm">content_copy</span>
                        </button>

                        {/* Smazat pro dev */}
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition cursor-pointer"
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
                              onClick={() => handleOpenEdit(item)}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              title="Upravit svůj požadavek"
                            >
                              <span className="material-symbols-outlined text-[13px]">edit</span>
                              <span>Upravit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="p-1 rounded-lg hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition cursor-pointer"
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
            className="w-full max-w-2xl max-h-[85vh] bg-[#14151f] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Záhlaví detailu */}
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#181a26] flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                    detailItem.type === 'bug'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : detailItem.type === 'idea'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
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
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 animate-pulse'
                      : detailItem.priority === 'high'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : detailItem.priority === 'low'
                      ? 'bg-white/5 text-gray-400 border border-white/5'
                      : 'bg-white/10 text-gray-300 border border-white/10'
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
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : detailItem.status === 'in_progress'
                      ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                      : detailItem.status === 'postponed'
                      ? 'bg-zinc-700/30 text-zinc-400 border border-zinc-700/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  <span>
                    {detailItem.status === 'new'
                      ? 'Nové'
                      : detailItem.status === 'in_progress'
                      ? 'Ve zpracování'
                      : detailItem.status === 'postponed'
                      ? 'Odloženo'
                      : 'Vyřešeno'}
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
                <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
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
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap select-text">
                  {detailItem.description || <span className="italic text-zinc-500">Bez textového popisu</span>}
                </div>
              </div>

              {/* Poznámka vývojáře */}
              {detailItem.devNote && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Poznámka vývojáře</label>
                  <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 italic leading-relaxed select-text">
                    {detailItem.devNote}
                  </div>
                </div>
              )}

              {/* Snímek obrazovky */}
              {detailItem.hasScreenshot && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Přiložený snímek obrazovky</label>
                  {loadingScreenshot ? (
                    <div className="h-40 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center text-xs text-zinc-500 gap-2">
                      <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                      <span>Načítám obrázek...</span>
                    </div>
                  ) : detailScreenshotUrl ? (
                    <div
                      className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/40 cursor-pointer max-h-72 flex items-center justify-center"
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
                    <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-xs text-zinc-500 italic">
                      Snímek obrazovky se nepodařilo načíst ze souboru.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Patička detailu */}
            <div className="px-6 py-3.5 border-t border-white/[0.08] flex items-center justify-between bg-[#181a26]">
              <div className="flex items-center gap-2">
                {mode === 'dev' && (
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(detailItem)}
                    className="px-3 py-1.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    <span>Zkopírovat do TODO</span>
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
          onPaste={handlePasteScreenshot}
        >
          <div className="w-full max-w-xl max-h-[90vh] bg-[#14151f] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-zoom-in">
            <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#181a26]">
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
              {/* Typ feedbacku (3 přepínače s Material Symbols) */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Typ hlášení
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('bug')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                      formType === 'bug'
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base text-rose-400">bug_report</span>
                    <span>Chyba</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('idea')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                      formType === 'idea'
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base text-purple-400">lightbulb</span>
                    <span>Nápad</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('other')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                      formType === 'other'
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base text-sky-400">chat</span>
                    <span>Dotaz / Jiné</span>
                  </button>
                </div>
              </div>

              {/* Priorita (uživatel si volí a jasně vidí zvolenou prioritu) */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Priorita
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormPriority('low')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'low'
                        ? 'bg-white/15 border-white/30 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-gray-400">arrow_downward</span>
                    <span>Nízká</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('normal')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'normal'
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-indigo-400">remove</span>
                    <span>Normální</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('high')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'high'
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] leading-none text-amber-400">arrow_upward</span>
                    <span>Vysoká</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormPriority('critical')}
                    className={`py-2 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      formPriority === 'critical'
                        ? 'bg-rose-500/25 border-rose-500/40 text-rose-200 shadow-sm'
                        : 'bg-white/[0.02] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.05]'
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
                  <div className="relative rounded-xl border border-white/10 overflow-hidden bg-black/40 max-h-48 flex items-center justify-center group">
                    <img src={formScreenshot} alt="Náhled screenshotu" className="object-contain max-h-48 w-full" />
                    <button
                      type="button"
                      onClick={() => setFormScreenshot(null)}
                      className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1 shadow cursor-pointer transition"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      <span>Odstranit</span>
                    </button>
                  </div>
                ) : (
                  <div className="border border-dashed border-white/15 rounded-xl p-4 flex flex-col items-center justify-center gap-2 bg-white/[0.01]">
                    <span className="material-symbols-outlined text-2xl text-gray-500">add_photo_alternate</span>
                    <p className="text-xs text-gray-400 text-center">
                      Stiskněte <strong className="text-white">Ctrl+V</strong> pro vložení snímku ze schránky nebo:
                    </p>
                    <label className="h-[34px] px-3.5 rounded-full border border-indigo-500/40 hover:border-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer">
                      <span className="material-symbols-outlined text-base">folder_open</span>
                      <span>Vybrat soubor obrázku</span>
                      <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                    </label>
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
      {/* DIALOG PRO VYŘEŠENÍ / BUDOUCÍ VERZI (DEV) */}
      {resolvingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-[#14151f] border border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-4 animate-zoom-in">
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
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl border border-white/10"
          />
        </div>
      )}
    </div>
  );
};
