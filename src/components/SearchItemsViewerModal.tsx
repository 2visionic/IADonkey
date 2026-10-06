import React, { useState, useMemo, useEffect } from 'react';
import { LauncherItem, DataSource, BannedItem, SnippetsConfig } from '../types';
import { MaterialIcon } from './MaterialIcon';
import { getDynamicSnippets } from '../utils/snippets';
import { removeDiacritics } from '../utils/text';

interface SearchItemsViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: LauncherItem[];
  sources?: DataSource[];
  snippetsConfig?: SnippetsConfig;
  banlist?: BannedItem[];
  onBanItem?: (item: LauncherItem) => void;
  onUnbanItem?: (banned: BannedItem) => void;
}

export const SearchItemsViewerModal: React.FC<SearchItemsViewerModalProps> = ({
  isOpen,
  onClose,
  items,
  sources = [],
  snippetsConfig,
  banlist = [],
  onBanItem,
  onUnbanItem,
}) => {
  const [viewTab, setViewTab] = useState<'items' | 'banlist'>('items');
  const [filterQuery, setFilterQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [renderedLimit, setRenderedLimit] = useState(50);
  const [banningKey, setBanningKey] = useState<string | null>(null);
  const [unbanningKey, setUnbanningKey] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Copy location helper
  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 1800);
  };

  // Open external location helper with silent favicon revalidation
  const handleOpen = (location?: string | null) => {
    if (!location) return;
    const trimmed = location.trim();
    if (isUrlOrPath(trimmed) && /^https?:\/\//i.test(trimmed)) {
      try {
        const origin = new URL(trimmed).origin;
        window.electronAPI?.fetchFaviconForUrl?.(trimmed).then((dataUrl) => {
          if (dataUrl) {
            const current = localStorage.getItem(`favicon:${origin}`);
            if (dataUrl !== current) {
              try {
                localStorage.setItem(`favicon:${origin}`, dataUrl);
                window.dispatchEvent(new CustomEvent('favicon-cached', { detail: { origin, dataUrl } }));
              } catch {}
            }
          }
        });
      } catch {}
    }

    if (window.electronAPI?.openExternal && /^https?:\/\//i.test(location)) {
      window.electronAPI.openExternal(location);
    } else if (window.electronAPI?.openPath) {
      window.electronAPI.openPath(location);
    } else {
      window.open(location, '_blank');
    }
  };

  // Resolve source display name
  const getSourceName = (item: LauncherItem): string => {
    if (item.settings === 'magicgate') return 'MagicGate';
    if (item.settings === 'git' || item.sourceId === 'github') return 'Git';
    if (item.priority === 99 || item.sourceId === 'apps') return 'Aplikace';
    if (item.sourceId === 'snippet') return 'Snippet';
    if (item.sourceId?.startsWith('engine-')) return 'Vyhledávač';
    if (item.sourceId) {
      const matched = sources.find((s) => s.id === item.sourceId);
      if (matched) return matched.name;
    }
    return item.sourceId || 'Zdroje';
  };

  const isUrlOrPath = (str?: string | null) => {
    if (!str) return false;
    return /^https?:\/\//i.test(str) || /^[a-zA-Z]:[\\\/]/i.test(str);
  };

  // Combine all launcher items with dynamic system snippets
  const allCombinedItems = useMemo(() => {
    const dynamicSnippets = getDynamicSnippets(':', snippetsConfig);
    return [...dynamicSnippets, ...items];
  }, [items, snippetsConfig]);

  // Sort items primarily by priority ascending (same as Spotlight) then alphabetically by name
  const sortedItems = useMemo(() => {
    const list = [...allCombinedItems];
    list.sort((a, b) => {
      const pA = a.priority ?? 0;
      const pB = b.priority ?? 0;
      if (pA !== pB) return pA - pB;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [allCombinedItems]);

  // Filter items and subitems based on search query
  const filteredData = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) {
      return sortedItems.map((item) => ({
        item,
        subitems: item.options
          ? [...item.options].sort((a, b) => {
              const pA = a.priority ?? 0;
              const pB = b.priority ?? 0;
              if (pA !== pB) return pA - pB;
              return (a.name || '').localeCompare(b.name || '');
            })
          : [],
      }));
    }

    const normQ = removeDiacritics(q);
    const results: { item: LauncherItem; subitems: LauncherItem[] }[] = [];

    for (const item of sortedItems) {
      const itemNameMatch = removeDiacritics(item.name?.toLowerCase() || '').includes(normQ);
      const itemLocMatch = item.location ? removeDiacritics(item.location.toLowerCase()).includes(normQ) : false;
      const itemActionMatch = item.action ? item.action.toLowerCase().includes(q) : false;
      const itemSourceMatch = item.sourceId ? item.sourceId.toLowerCase().includes(q) : false;
      const itemShortcutMatch = item.shortcuts?.some((sc) => removeDiacritics(sc.toLowerCase()).includes(normQ));
      const isParentMatch = itemNameMatch || itemLocMatch || itemActionMatch || itemSourceMatch || Boolean(itemShortcutMatch);

      const matchedSubitems = (item.options || []).filter((sub) => {
        const subName = removeDiacritics(sub.name?.toLowerCase() || '').includes(normQ);
        const subLoc = sub.location ? removeDiacritics(sub.location.toLowerCase()).includes(normQ) : false;
        const subAction = sub.action ? sub.action.toLowerCase().includes(q) : false;
        return subName || subLoc || subAction;
      });

      if (isParentMatch || matchedSubitems.length > 0) {
        // If parent matched, show all its subitems (or only matched ones if filter active)
        const subList = isParentMatch ? item.options || [] : matchedSubitems;
        const sortedSubs = [...subList].sort((a, b) => {
          const pA = a.priority ?? 0;
          const pB = b.priority ?? 0;
          if (pA !== pB) return pA - pB;
          return (a.name || '').localeCompare(b.name || '');
        });

        results.push({
          item,
          subitems: sortedSubs,
        });
      }
    }

    return results;
  }, [sortedItems, filterQuery]);

  // Counts calculation
  const totalSnippetCount = useMemo(() => {
    return allCombinedItems.filter((it) => it.sourceId === 'snippet').length;
  }, [allCombinedItems]);

  const totalGitCount = useMemo(() => {
    return allCombinedItems.filter((it) => it.settings === 'git' || it.sourceId === 'github').length;
  }, [allCombinedItems]);

  const totalMainOnlyCount = useMemo(() => {
    return allCombinedItems.filter(
      (it) => it.sourceId !== 'snippet' && !(it.settings === 'git' || it.sourceId === 'github')
    ).length;
  }, [allCombinedItems]);

  const totalSubCount = useMemo(() => {
    return allCombinedItems.reduce((acc, it) => acc + (it.options?.length || 0), 0);
  }, [allCombinedItems]);

  const filteredSnippetCount = useMemo(() => {
    return filteredData.filter((d) => d.item.sourceId === 'snippet').length;
  }, [filteredData]);

  const filteredGitCount = useMemo(() => {
    return filteredData.filter((d) => d.item.settings === 'git' || d.item.sourceId === 'github').length;
  }, [filteredData]);

  const filteredMainOnlyCount = useMemo(() => {
    return filteredData.filter(
      (d) => d.item.sourceId !== 'snippet' && !(d.item.settings === 'git' || d.item.sourceId === 'github')
    ).length;
  }, [filteredData]);

  const filteredSubCount = useMemo(() => {
    return filteredData.reduce((acc, it) => acc + it.subitems.length, 0);
  }, [filteredData]);

  const totalIndexedAll = totalMainOnlyCount + totalGitCount + totalSnippetCount + totalSubCount;
  const filteredIndexedAll = filteredMainOnlyCount + filteredGitCount + filteredSnippetCount + filteredSubCount;

  // Filter banlist based on search query
  const filteredBanlist = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return banlist;
    return banlist.filter((b) =>
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.location && b.location.toLowerCase().includes(q)) ||
      (b.sourceId && b.sourceId.toLowerCase().includes(q))
    );
  }, [banlist, filterQuery]);

  // Reset progressive rendering on tab, query or open state change
  useEffect(() => {
    setRenderedLimit(50);
  }, [viewTab, filterQuery, isOpen]);

  // Progressively expand rendered items in lightweight background intervals
  useEffect(() => {
    if (!isOpen || viewTab !== 'items') return;
    if (renderedLimit >= filteredData.length) return;

    const timer = setTimeout(() => {
      setRenderedLimit((prev) => Math.min(prev + 80, filteredData.length));
    }, 60);

    return () => clearTimeout(timer);
  }, [renderedLimit, filteredData.length, isOpen, viewTab]);

  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      if (renderedLimit < filteredData.length) {
        setRenderedLimit((prev) => Math.min(prev + 100, filteredData.length));
      }
    }
  };

  const visibleData = useMemo(() => {
    return filteredData.slice(0, renderedLimit);
  }, [filteredData, renderedLimit]);

  const handleBan = (item: LauncherItem, key: string) => {
    setBanningKey(key);
    try {
      onBanItem?.(item);
    } finally {
      setTimeout(() => {
        setBanningKey(null);
      }, 1200);
    }
  };

  const handleUnban = (b: BannedItem, key: string) => {
    setUnbanningKey(key);
    try {
      onUnbanItem?.(b);
    } finally {
      setTimeout(() => {
        setUnbanningKey(null);
      }, 1200);
    }
  };

  // Toggle collapse state for an item
  const toggleCollapse = (id: string) => {
    setCollapsedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const areAllCollapsed = useMemo(() => {
    const parentIds = filteredData.filter((d) => d.subitems.length > 0).map((d) => d.item.id || d.item.name);
    return parentIds.length > 0 && parentIds.every((id) => collapsedItems.has(id));
  }, [filteredData, collapsedItems]);

  const toggleAllCollapse = () => {
    if (areAllCollapsed) {
      setCollapsedItems(new Set());
    } else {
      const allParentIds = filteredData.filter((d) => d.subitems.length > 0).map((d) => d.item.id || d.item.name);
      setCollapsedItems(new Set(allParentIds));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150 window-modal-overlay">
      <div className="m3-surface-main modal-card rounded-[28px] w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl overflow-hidden text-gray-200 border-none">
        {/* Header */}
        <header className="p-5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
              <span className="material-symbols-outlined text-2xl">format_list_bulleted</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-semibold text-white tracking-tight">
                  Položky ve vyhledávání
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 m3-primary-badge">
                    {filterQuery ? `${filteredMainOnlyCount} z ${totalMainOnlyCount}` : totalMainOnlyCount} hlavních
                  </span>
                  {totalGitCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300">
                      {filterQuery ? `${filteredGitCount} z ${totalGitCount}` : totalGitCount} z Gitu
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-gray-300">
                    {filterQuery ? `${filteredSnippetCount} z ${totalSnippetCount}` : totalSnippetCount} snippetů
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/[0.06] text-gray-300">
                    {filterQuery ? `${filteredSubCount} z ${totalSubCount}` : totalSubCount} subpoložek
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/15 text-purple-300 m3-actions-badge">
                    {filterQuery ? `${filteredIndexedAll} celkem` : `${totalIndexedAll} celkem`}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                Kompletní přehled všech načtených položek řazených dle priority (shodně s vyhledávačem Spotlight).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer self-center shrink-0 flex items-center justify-center"
            title="Zavřít okno (Esc)"
          >
            <span className="material-symbols-outlined text-xl leading-none select-none">close</span>
          </button>
        </header>

        {/* Filter Toolbar */}
        <div className="px-5 pb-3 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-full shrink-0">
            <button
              type="button"
              onClick={() => setViewTab('items')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                viewTab === 'items'
                  ? 'bg-indigo-500/20 m3-primary-surface text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-indigo-400 m3-primary-text">format_list_bulleted</span>
              <span>Kompletní položky</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                  viewTab === 'items'
                    ? 'bg-indigo-500/30 text-indigo-200 m3-primary-badge'
                    : 'bg-indigo-500/15 text-indigo-300 m3-primary-badge'
                }`}
              >
                {filteredIndexedAll}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('banlist')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                viewTab === 'banlist'
                  ? 'bg-rose-500/20 text-white shadow-sm font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="material-symbols-outlined text-sm text-rose-400">block</span>
              <span>Banlist</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold transition-colors ${
                  viewTab === 'banlist'
                    ? 'bg-rose-500/30 text-rose-200'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {filterQuery ? filteredBanlist.length : banlist.length}
              </span>
            </button>
          </div>

          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={viewTab === 'items' ? "Filtrovat v názvech, odkazech, akcích či zdrojích..." : "Filtrovat zabanované položky..."}
              className="w-full bg-white/[0.04] focus:bg-white/[0.07] rounded-full pl-10 pr-9 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none transition"
              autoFocus
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 rounded-full transition"
                title="Vymazat filtr"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          {viewTab === 'items' && filteredSubCount > 0 && (
            <button
              onClick={toggleAllCollapse}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 hover:text-white text-xs font-medium transition cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-sm">
                {areAllCollapsed ? 'unfold_more' : 'unfold_less'}
              </span>
              <span>{areAllCollapsed ? 'Rozbalit všechny subpoložky' : 'Sbalit všechny subpoložky'}</span>
            </button>
          )}
        </div>

        {viewTab === 'banlist' ? (
          <>
            {/* Banlist Table Column Headers */}
            <div className="grid grid-cols-[2fr_2fr_120px_150px_100px] items-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 bg-transparent">
              <div>Název položky</div>
              <div>Cíl / Umístění (Location)</div>
              <div>Zdroj / Typ</div>
              <div>Datum zabanování</div>
              <div className="text-right">Akce</div>
            </div>

            {/* Banlist Content */}
            <div className="flex-1 overflow-y-auto space-y-1 p-2">
              {filteredBanlist.length === 0 ? (
                <div className="p-12 text-center text-gray-400 space-y-2">
                  <span className="material-symbols-outlined text-4xl text-gray-500">
                    {filterQuery ? 'search_off' : 'verified_user'}
                  </span>
                  <p className="text-sm font-medium text-gray-300">
                    {filterQuery ? `Žádná zabanovaná položka neodpovídá "${filterQuery}"` : 'Žádné položky nejsou na banlistu'}
                  </p>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    {filterQuery ? 'Zkuste upravit hledaný výraz.' : 'Položky můžete zabanovat v záložce Kompletní položky kliknutím na ikonu zákazu. Zabanované položky se vynechají z importu i vyhledávače.'}
                  </p>
                </div>
              ) : (
                filteredBanlist.map((b, idx) => (
                  <div
                    key={b.id || `${b.name}-${idx}`}
                    className="grid grid-cols-[2fr_2fr_120px_150px_100px] items-center px-4 py-2.5 gap-2 text-[13px] bg-white/[0.02] hover:bg-white/[0.05] rounded-2xl transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="material-symbols-outlined text-rose-400 text-lg shrink-0 select-none">
                        block
                      </span>
                      <span className="font-semibold text-white truncate" title={b.name}>
                        {b.name}
                      </span>
                    </div>

                    <div className="min-w-0 pr-2">
                      {b.location ? (
                        <div
                          className="font-mono text-xs text-gray-400 truncate select-all"
                          title={b.location}
                        >
                          {b.location}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs italic">-</span>
                      )}
                    </div>

                    <div className="truncate text-xs text-gray-400 font-medium">
                      {b.sourceId || 'Obecné'}
                    </div>

                    <div className="font-mono text-xs text-gray-400">
                      {b.bannedAt ? new Date(b.bannedAt).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </div>

                    <div className="flex justify-end">
                      {(() => {
                        const bKey = b.id || `${b.name}-${b.location || ''}`;
                        const isUnbanning = unbanningKey === bKey;
                        return (
                          <button
                            disabled={isUnbanning}
                            onClick={() => handleUnban(b, bKey)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer ${
                              isUnbanning
                                ? 'bg-amber-500/15 text-amber-400 cursor-wait'
                                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                            }`}
                            title="Odbanovat položku a obnovit její import"
                          >
                            {isUnbanning ? (
                              <>
                                <span className="material-symbols-outlined text-[15px] leading-none animate-spin">progress_activity</span>
                                <span>Odbanovávám...</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[15px] leading-none">restore</span>
                                <span>Odbanovat</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Table Column Headers (Sticky) */}
            <div className="grid grid-cols-[70px_44px_1.5fr_2fr_80px_110px_90px] items-center px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0 bg-transparent">
              <div className="text-center">Priorita</div>
              <div className="text-center">Ikona</div>
              <div>Název položky</div>
              <div>Cíl / URL (Location)</div>
              <div className="text-center">Akce</div>
              <div>Zdroj</div>
              <div className="text-right">Možnosti</div>
            </div>

            {/* Items List */}
            <div onScroll={handleListScroll} className="flex-1 overflow-y-auto space-y-1 p-2">
              {filteredData.length === 0 ? (
                <div className="p-12 text-center text-gray-400 space-y-2">
                  <span className="material-symbols-outlined text-4xl text-gray-500">search_off</span>
                  <p className="text-sm font-medium text-gray-300">
                    {filterQuery ? `Žádné položky neodpovídají výrazu "${filterQuery}"` : 'Žádné položky nebyly načteny'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {filterQuery ? 'Zkuste zadat jiný hledaný výraz.' : 'Zkontrolujte konfiguraci zdrojů dat v nastavení.'}
                  </p>
                </div>
              ) : (
                <>
                  {visibleData.map(({ item, subitems }, idx) => {
                  const itemKey = item.id || `${item.name}-${idx}`;
                  const hasSubitems = subitems.length > 0;
                  const isCollapsed = collapsedItems.has(itemKey);
                  const isCopied = copiedKey === itemKey;

                  return (
                    <div key={itemKey} className="group bg-white/[0.02] hover:bg-white/[0.05] rounded-2xl transition-colors">
                      {/* Main Item Row */}
                      <div className="grid grid-cols-[70px_44px_1.5fr_2fr_80px_110px_90px] items-center px-4 py-2.5 gap-2 text-[13px]">
                        {/* Column 1: Priority */}
                        <div className="flex justify-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold select-none ${
                              (item.priority ?? 0) < 0
                                ? 'bg-purple-500/20 text-purple-300'
                                : (item.priority ?? 0) === 0
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : (item.priority ?? 0) === 99
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-indigo-500/20 text-indigo-300'
                            }`}
                            title={`Priorita: ${item.priority ?? 0}`}
                          >
                            {item.priority ?? 0}
                          </span>
                        </div>

                        {/* Column 2: Icon or Favicon */}
                        <div className="flex items-center justify-center">
                          <div className="w-7 h-7 rounded-xl bg-white/[0.04] flex items-center justify-center overflow-hidden">
                            <MaterialIcon
                              icon={item.icon}
                              image={item.image}
                              location={item.location}
                              colorClass={
                                item.settings === 'git' || item.sourceId === 'github'
                                  ? 'text-emerald-400'
                                  : item.settings === 'magicgate' || item.sourceId === 'magicgate-xml'
                                  ? 'text-amber-400'
                                  : undefined
                              }
                              fallbackIcon={
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
                              }
                              className="w-5 h-5 flex items-center justify-center"
                              size={16}
                            />
                          </div>
                        </div>

                        {/* Column 3: Name & Tags */}
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-white truncate text-[13px]" title={item.name}>
                              {item.name}
                            </span>

                            {hasSubitems && (
                              <button
                                onClick={() => toggleCollapse(itemKey)}
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition cursor-pointer select-none"
                                title={isCollapsed ? 'Rozbalit subpoložky' : 'Sbalit subpoložky'}
                              >
                                <span>{subitems.length} {subitems.length === 1 ? 'subpoložka' : subitems.length < 5 ? 'subpoložky' : 'subpoložek'}</span>
                                <span className="material-symbols-outlined text-[13px] leading-none">
                                  {isCollapsed ? 'expand_more' : 'expand_less'}
                                </span>
                              </button>
                            )}

                            {item.settings === 'magicgate' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 select-none flex items-center gap-1">
                                {(item.actions?.length || (item.info && Object.keys(item.info).length > 0)) && (
                                  <span className="material-symbols-outlined text-[11px] leading-none">
                                    {item.actions?.length ? 'bolt' : 'info'}
                                  </span>
                                )}
                                <span>MagicGate</span>
                              </span>
                            )}

                            {item.settings === 'git' && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 select-none flex items-center gap-1">
                                {(item.actions?.length || (item.info && Object.keys(item.info).length > 0)) && (
                                  <span className="material-symbols-outlined text-[11px] leading-none">
                                    {item.actions?.length ? 'bolt' : 'info'}
                                  </span>
                                )}
                                <span>Git</span>
                              </span>
                            )}

                            {(item.actions?.length || (item.info && Object.keys(item.info).length > 0)) && !item.settings && (!item.shortcuts || item.shortcuts.length === 0) && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300 select-none flex items-center gap-1">
                                <span className="material-symbols-outlined text-[11px] leading-none">
                                  {item.actions?.length ? 'bolt' : 'info'}
                                </span>
                                <span>{item.actions?.length ? 'Akce' : 'Info'}</span>
                              </span>
                            )}

                            {item.shortcuts && item.shortcuts.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {item.shortcuts.map((sc) => (
                                  <span
                                    key={sc}
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-teal-500/15 text-teal-300 select-none"
                                  >
                                    {sc}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Column 4: Location / URL */}
                        <div className="min-w-0 pr-2">
                          {item.location ? (
                            <div
                              onClick={() => handleCopy(item.location!, itemKey)}
                              className="font-mono text-xs text-gray-400 hover:text-indigo-300 truncate cursor-pointer transition select-all"
                              title={`Kliknutím zkopírovat: ${item.location}`}
                            >
                              {item.location}
                            </div>
                          ) : (
                            <span className="text-gray-600 text-xs italic">-</span>
                          )}
                        </div>

                        {/* Column 5: Action */}
                        <div className="flex justify-center">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-white/5 text-gray-300 uppercase">
                            {item.action || 'open'}
                          </span>
                        </div>

                        {/* Column 6: Source */}
                        <div className="truncate text-xs text-gray-400 font-medium" title={getSourceName(item)}>
                          {getSourceName(item)}
                        </div>

                        {/* Column 7: Quick Actions */}
                        <div className="flex items-center justify-end gap-1">
                          {item.location && (
                            <>
                              <button
                                onClick={() => handleCopy(item.location!, itemKey)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                                title={isCopied ? 'Zkopírováno!' : 'Zkopírovat do schránky'}
                              >
                                <span className={`material-symbols-outlined text-[16px] ${isCopied ? 'text-emerald-400' : ''}`}>
                                  {isCopied ? 'check' : 'content_copy'}
                                </span>
                              </button>
                              {isUrlOrPath(item.location) && (
                                <button
                                  onClick={() => handleOpen(item.location)}
                                  className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                                  title="Otevřít odkaz"
                                >
                                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                                </button>
                              )}
                            </>
                          )}
                          {onBanItem && item.sourceId !== 'snippet' && item.priority !== -1 && item.priority !== -1.5 && item.priority !== -2 && !item.sourceId?.startsWith('engine-') && (
                            <button
                              disabled={banningKey === itemKey}
                              onClick={() => handleBan(item, itemKey)}
                              className={`p-1.5 rounded-full transition cursor-pointer ${
                                banningKey === itemKey
                                  ? 'bg-rose-500/20 text-rose-400 cursor-wait'
                                  : 'hover:bg-rose-500/15 text-gray-500 hover:text-rose-400'
                              }`}
                              title={banningKey === itemKey ? 'Zabanovávám...' : 'Zabanovat položku (vyřadit z importu i vyhledávání)'}
                            >
                              <span className={`material-symbols-outlined text-[16px] ${banningKey === itemKey ? 'animate-spin' : ''}`}>
                                {banningKey === itemKey ? 'progress_activity' : 'block'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subitems (Options) Indented List */}
                      {hasSubitems && !isCollapsed && (
                        <div className="bg-black/20 rounded-xl m-1.5 divide-y divide-white/[0.02]">
                          {subitems.map((sub, sIdx) => {
                            const subKey = `${itemKey}-sub-${sIdx}`;
                            const isSubCopied = copiedKey === subKey;

                            return (
                              <div
                                key={subKey}
                                className="grid grid-cols-[70px_44px_1.5fr_2fr_80px_110px_90px] items-center px-4 py-2 gap-2 text-[12px] hover:bg-white/[0.03] transition-colors"
                              >
                                {/* Column 1: Priority */}
                                <div className="flex justify-center items-center gap-1 pl-4">
                                  <span className="text-gray-500 font-mono text-xs select-none">└─</span>
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[10px] font-mono text-gray-400 bg-white/5 select-none"
                                    title={`Priorita subpoložky: ${sub.priority ?? item.priority ?? 0}`}
                                  >
                                    {sub.priority ?? item.priority ?? 0}
                                  </span>
                                </div>

                                {/* Column 2: Subitem Icon / Favicon */}
                                <div className="flex items-center justify-center">
                                  <div className="w-6 h-6 rounded-lg bg-white/[0.03] flex items-center justify-center overflow-hidden">
                                    <MaterialIcon
                                      icon={sub.icon?.trim() ? sub.icon : item.icon}
                                      image={sub.image?.trim() ? sub.image : item.image}
                                      location={sub.location || item.location}
                                      fallbackIcon={item.icon || "public"}
                                      className="w-4 h-4 flex items-center justify-center"
                                      size={13}
                                    />
                                  </div>
                                </div>

                                {/* Column 3: Subitem Name & Chip */}
                                <div className="min-w-0 pr-2 pl-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-gray-300 truncate text-[12px]" title={sub.name}>
                                      {sub.name}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono text-sky-300 bg-sky-500/15 select-none">
                                      Subpoložka
                                    </span>
                                  </div>
                                </div>

                                {/* Column 4: Subitem Location */}
                                <div className="min-w-0 pr-2">
                                  {sub.location ? (
                                    <div
                                      onClick={() => handleCopy(sub.location!, subKey)}
                                      className="font-mono text-[11px] text-gray-400 hover:text-indigo-300 truncate cursor-pointer transition select-all"
                                      title={`Kliknutím zkopírovat: ${sub.location}`}
                                    >
                                      {sub.location}
                                    </div>
                                  ) : (
                                    <span className="text-gray-600 text-xs italic">-</span>
                                  )}
                                </div>

                                {/* Column 5: Subitem Action */}
                                <div className="flex justify-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-gray-400 bg-white/5 uppercase">
                                    {sub.action || item.action || 'open'}
                                  </span>
                                </div>

                                {/* Column 6: Source label */}
                                <div className="truncate text-[11px] text-gray-500 italic">
                                  subpoložka
                                </div>

                                {/* Column 7: Quick Actions */}
                                <div className="flex items-center justify-end gap-1">
                                  {sub.location && (
                                    <>
                                      <button
                                        onClick={() => handleCopy(sub.location!, subKey)}
                                        className="p-1.5 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition cursor-pointer"
                                        title={isSubCopied ? 'Zkopírováno!' : 'Zkopírovat odkaz'}
                                      >
                                        <span className={`material-symbols-outlined text-[15px] ${isSubCopied ? 'text-emerald-400' : ''}`}>
                                          {isSubCopied ? 'check' : 'content_copy'}
                                        </span>
                                      </button>
                                      {isUrlOrPath(sub.location) && (
                                        <button
                                          onClick={() => handleOpen(sub.location)}
                                          className="p-1.5 rounded-full hover:bg-white/10 text-gray-500 hover:text-white transition cursor-pointer"
                                          title="Otevřít odkaz"
                                        >
                                          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {renderedLimit < filteredData.length && (
                  <div className="py-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-sm animate-spin text-indigo-400">progress_activity</span>
                    <span>Načítání dalších položek ({visibleData.length} z {filteredData.length})...</span>
                  </div>
                )}
              </>
            )}
            </div>
          </>
        )}

        {/* Footer info */}
        <footer className="px-5 py-3 flex items-center justify-between text-xs text-gray-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-gray-400">info</span>
            <span>Pořadí položek odpovídá přesně prioritě zobrazení výsledků ve Spotlight vyhledávání.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-white/[0.08] hover:bg-white/[0.14] text-white rounded-full font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Zavřít (Esc)"
          >
            <span>Zavřít</span>
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
              Esc
            </kbd>
          </button>
        </footer>
      </div>
    </div>
  );
};
