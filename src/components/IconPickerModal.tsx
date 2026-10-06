import React, { useState, useMemo, useEffect, useRef } from 'react';
import { POPULAR_MATERIAL_ICONS } from '../constants/materialIcons';
import { MaterialIconDef } from '../types';
import { removeDiacritics } from '../utils/text';

interface IconPickerModalProps {
  isOpen: boolean;
  selectedIcon?: string;
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  isOpen,
  selectedIcon,
  onSelect,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [cachedIcons, setCachedIcons] = useState<MaterialIconDef[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(120);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load cached icons on open if available
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setVisibleCount(120);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);

      if (window.electronAPI?.getMaterialIcons) {
        window.electronAPI.getMaterialIcons().then((icons) => {
          if (Array.isArray(icons) && icons.length > 0) {
            setCachedIcons(icons);
          }
        }).catch(() => {});
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clean and deduplicate all icons
  const allIcons: MaterialIconDef[] = useMemo(() => {
    const rawList = (cachedIcons && cachedIcons.length > 0) ? cachedIcons : POPULAR_MATERIAL_ICONS;
    const map = new Map<string, MaterialIconDef>();
    for (const item of rawList) {
      if (!item.name) continue;
      const key = item.name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...item, name: key });
      } else {
        const existing = map.get(key)!;
        if (item.tags && item.tags.length > 0) {
          existing.tags = Array.from(new Set([...existing.tags, ...item.tags]));
        }
      }
    }
    return Array.from(map.values());
  }, [cachedIcons]);

  useEffect(() => {
    setVisibleCount(120);
  }, [searchQuery]);

  // Ranked relevance search
  const filteredIcons = useMemo(() => {
    const rawQuery = searchQuery.trim().toLowerCase();
    const q = removeDiacritics(rawQuery);
    if (!q) {
      return allIcons;
    }

    const scored: { item: MaterialIconDef; score: number }[] = [];

    for (const item of allIcons) {
      const normName = removeDiacritics(item.name.toLowerCase());
      let score = 0;

      if (normName === q) {
        score = 10000;
      } else if (normName.startsWith(q)) {
        score = 8000 - normName.length;
      } else {
        const words = normName.split('_');
        if (words.some((w) => w.startsWith(q))) {
          score = 6000 - normName.length;
        } else if (normName.includes(q)) {
          score = 4000 - normName.length;
        } else if (item.tags && item.tags.length > 0) {
          const normTags = item.tags.map((t) => removeDiacritics(t.toLowerCase()));
          if (normTags.some((t) => t === q)) {
            score = 2000;
          } else if (normTags.some((t) => t.startsWith(q))) {
            score = 1000;
          } else if (normTags.some((t) => t.split(' ').some((w) => w.startsWith(q)))) {
            score = 500;
          }
        }
      }

      if (score > 0) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [allIcons, searchQuery]);

  const displayedIcons = useMemo(() => {
    return filteredIcons.slice(0, visibleCount);
  }, [filteredIcons, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 250) {
      if (visibleCount < filteredIcons.length) {
        setVisibleCount((prev) => Math.min(prev + 120, filteredIcons.length));
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in window-modal-overlay"
      onClick={onClose}
    >
      <div
        className="m3-surface-main modal-card rounded-[28px] shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden max-h-[85vh] text-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full m3-primary-badge flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-lg">interests</span>
            </div>
            <div>
              <h3 className="font-semibold text-base text-white leading-tight">Výběr ikony</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Vyberte ikonu ze seznamu nebo vyhledejte podle klíčových slov
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer shrink-0"
            title="Zavřít (Esc)"
          >
            <span className="material-symbols-outlined text-[20px] leading-none">close</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-2">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-4 text-gray-400 text-xl pointer-events-none">
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hledat ikonu (např. code, folder, terminal, mail, settings, košík)..."
              className="w-full bg-white/[0.05] hover:bg-white/[0.08] focus:bg-white/[0.08] rounded-full pl-12 pr-10 py-2.5 text-sm text-white placeholder-gray-500 outline-none font-sans transition shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 text-gray-400 hover:text-white p-1 rounded-full cursor-pointer"
                title="Vymazat dotaz"
              >
                <span className="material-symbols-outlined text-base leading-none">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Icons Grid (6 columns) */}
        <div
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 min-h-[280px] max-h-[460px]"
        >
          {filteredIcons.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {displayedIcons.map((iconDef) => {
                const isSelected = selectedIcon === iconDef.name;
                return (
                  <button
                    key={iconDef.name}
                    type="button"
                    onClick={() => {
                      onSelect(iconDef.name);
                      onClose();
                    }}
                    title={`${iconDef.name} (${iconDef.category})`}
                    className={`group flex flex-col items-center justify-center p-3 rounded-2xl transition cursor-pointer text-center relative ${
                      isSelected
                        ? 'm3-selected-card text-white shadow-md'
                        : 'm3-item-card text-gray-300 hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform mb-1.5 select-none leading-none">
                      {iconDef.name}
                    </span>
                    <span className="text-[11px] font-mono truncate w-full text-gray-300 group-hover:text-white select-none leading-tight">
                      {iconDef.name}
                    </span>
                  </button>
                );
              })}

              {visibleCount < filteredIcons.length && (
                <div className="col-span-full py-2.5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => Math.min(prev + 160, filteredIcons.length))}
                    className="px-5 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-xs m3-primary-text rounded-full transition font-semibold cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">expand_more</span>
                    <span>Načíst další ({visibleCount} z {filteredIcons.length.toLocaleString('cs-CZ')})</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-gray-600">search_off</span>
              <p className="text-xs text-gray-400">
                V katalogu nebyla nalezena žádná ikona odpovídající „{searchQuery}“.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 text-xs bg-transparent">
          <div>
            {selectedIcon && (
              <button
                type="button"
                onClick={() => {
                  onSelect('');
                  onClose();
                }}
                className="px-3 py-1.5 rounded-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-medium flex items-center gap-1 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                <span>Odebrat ikonu (bez ikony)</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-[11px] font-mono mr-2">
              Nalezeno: {filteredIcons.length.toLocaleString('cs-CZ')} ikon
              {filteredIcons.length > visibleCount ? ` (zobrazeno ${visibleCount})` : ''}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="m3-primary-pill px-5 py-2 rounded-full text-xs font-semibold transition cursor-pointer shadow-md flex items-center gap-1.5"
              title="Zavřít výběr ikon (Esc)"
            >
              <span>Zavřít</span>
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-black/30 text-white/90 rounded-full font-mono text-[9px] leading-none select-none">
                Esc
              </kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
