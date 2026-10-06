import React, { useState, useEffect } from 'react';
import { ColorPalette } from '../types';
import {
  parseColorQuery,
  deriveSingleColorSurfaces,
  DerivedColorToken,
  generateMaterial3Scheme,
  exportToAndroidStudioKotlin,
  exportToCssVariables,
} from '../utils/colorMaster';

const PALETTE_ROLES = [
  { name: 'Primary', desc: 'Hlavní barva' },
  { name: 'Secondary', desc: 'Doplňková barva' },
  { name: 'Tertiary', desc: 'Akcentní barva' },
  { name: 'Error', desc: 'Chybová barva' },
  { name: 'Surface', desc: 'Neutrální / Povrch' },
];

export const PaletteDetailModal: React.FC = () => {
  const [paletteId, setPaletteId] = useState<string>('');
  const [palette, setPalette] = useState<ColorPalette | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeOptionsColor, setActiveOptionsColor] = useState<{
    name: string;
    token: DerivedColorToken;
  } | null>(null);
  const [showPreviews, setShowPreviews] = useState<boolean>(false);
  const [slotPreviews, setSlotPreviews] = useState<Record<number, boolean>>({});

  const handleToggleAllPreviews = () => {
    const next = !showPreviews;
    setShowPreviews(next);
    setSlotPreviews({});
  };

  // Load palette from URL search or IPC
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idFromUrl = params.get('paletteId') || '';
    if (idFromUrl) {
      setPaletteId(idFromUrl);
      loadPalette(idFromUrl);
    }

    if (window.electronAPI?.onPaletteDetailInit) {
      return window.electronAPI.onPaletteDetailInit((data) => {
        setPaletteId(data.paletteId);
        loadPalette(data.paletteId);
      });
    }
  }, []);

  const loadPalette = async (id: string) => {
    if (window.electronAPI?.getPalettes) {
      const list: ColorPalette[] = await window.electronAPI.getPalettes();
      const found = list.find((p) => p.id === id);
      if (found) {
        setPalette(found);
      }
    }
  };

  // Listen for palette updates from other windows / TuneColor
  useEffect(() => {
    if (window.electronAPI?.onPalettesUpdated) {
      return window.electronAPI.onPalettesUpdated((palettes: ColorPalette[]) => {
        if (paletteId) {
          const found = palettes.find((p) => p.id === paletteId);
          if (found) setPalette(found);
        }
      });
    }
  }, [paletteId]);

  // Listen for direct tune color updates with slotIndex
  useEffect(() => {
    if (window.electronAPI?.onTuneColorApplied) {
      return window.electronAPI.onTuneColorApplied(async ({ color, slotIndex }) => {
        if (slotIndex !== undefined && palette) {
          const newColors = [...palette.colors];
          newColors[slotIndex] = color;
          const updated = { ...palette, colors: newColors, updatedAt: Date.now() };
          setPalette(updated);
          await window.electronAPI?.savePalette?.(updated);
        }
      });
    }
  }, [palette]);

  const handleCopy = (text: string, key: string, notif?: { title?: string; body?: string }) => {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {
      console.warn('[PaletteDetail] navigator.clipboard error:', e);
    }
    if (window.electronAPI?.copyToClipboard) {
      window.electronAPI.copyToClipboard(text, notif).catch((err) => {
        console.error('[PaletteDetail] copyToClipboard IPC error:', err);
      });
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleOpenBar = async () => {
    if (!palette) return;
    if (window.electronAPI?.openPaletteBar) {
      await window.electronAPI.openPaletteBar({
        paletteId: palette.id,
        paletteName: palette.name,
      });
    }
    // Automatically close detail window when opening bar
    await handleClose();
  };

  const handleClose = async () => {
    if (window.electronAPI?.closePaletteDetail) {
      await window.electronAPI.closePaletteDetail();
    } else {
      window.close();
    }
  };

  const handleTuneColor = (initialColor: string, slotIndex: number) => {
    if (window.electronAPI?.openTuneColorWindow) {
      window.electronAPI.openTuneColorWindow({
        initialColor,
        source: 'palette',
        slotIndex,
      });
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeOptionsColor) {
          setActiveOptionsColor(null);
        } else {
          handleClose();
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleOpenBar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [palette, activeOptionsColor]);

  const colors = palette?.colors || [null, null, null, null, null];
  const filledCount = colors.filter(Boolean).length;

  return (
    <div className="w-full h-full flex flex-col m3-surface-main rounded-none text-gray-200 select-none overflow-hidden font-sans">
      {/* Main Content (scrollable if window height is small, includes Header) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <span className="material-symbols-outlined text-2xl">palette</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>{palette?.name || 'Barevná paleta'}</span>
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-white/[0.06] text-gray-300">
                  {filledCount}/5 barev
                </span>
              </h2>
              <p className="text-xs text-gray-400">Přehled a export barevných odstínů</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle náhledů komponent */}
            <button
              type="button"
              onClick={handleToggleAllPreviews}
              className={`px-3 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                showPreviews
                  ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 hover:text-white'
              }`}
              title={showPreviews ? 'Skrýt všechny náhledy komponent' : 'Zobrazit všechny náhledy komponent'}
            >
              <span className="material-symbols-outlined text-sm">
                {showPreviews ? 'visibility' : 'visibility_off'}
              </span>
              <span>{showPreviews ? 'Skrýt náhledy' : 'Zobrazit náhledy'}</span>
            </button>

            {/* Action: Upravit v liště */}
            <button
              type="button"
              onClick={handleOpenBar}
              className="px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm"
              title="Otevřít plovoucí lištu pro výběr a úpravu barev (Ctrl+Enter)"
            >
              <span className="material-symbols-outlined text-sm">tune</span>
              <span>Upravit barvy v liště</span>
            </button>
          </div>
        </div>

        {/* Color Cards List */}
        <div className="space-y-3">
          {colors.map((color, idx) => {
            const role = PALETTE_ROLES[idx] || { name: `Pozice ${idx + 1}`, desc: '' };
            const isSlotExpanded = slotPreviews[idx] !== undefined ? slotPreviews[idx] : showPreviews;

            if (!color) {
              return (
                <div
                  key={idx}
                  onClick={handleOpenBar}
                  className="p-3.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-2xl flex items-center justify-between transition cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center text-gray-500 group-hover:text-rose-400 group-hover:bg-rose-500/10 transition">
                      <span className="text-sm font-mono font-bold">{idx + 1}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition">
                          Pozice {idx + 1} ({role.name})
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-rose-300">
                          {role.desc}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">Kliknutím otevřete lištu a naberte barvu</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/[0.04] group-hover:bg-rose-500/20 text-gray-400 group-hover:text-rose-300 flex items-center justify-center transition">
                    <span className="material-symbols-outlined text-sm">colorize</span>
                  </div>
                </div>
              );
            }

            const parsed = parseColorQuery(color);
            const hex = parsed ? parsed.hex : color;
            const rgb = parsed ? parsed.rgb : color;
            const hsl = parsed ? parsed.hsl : '';
            const derived = deriveSingleColorSurfaces(hex);

            return (
              <div
                key={idx}
                className="p-3.5 bg-white/[0.03] hover:bg-white/[0.05] rounded-2xl space-y-2.5 transition shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Large Swatch */}
                    <div
                      className="w-12 h-12 rounded-xl shadow-inner flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition"
                      style={{ backgroundColor: color }}
                      onClick={() => handleTuneColor(color, idx)}
                      title="Kliknutím doladit barvu"
                    >
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
                        {idx + 1}
                      </span>
                    </div>

                    {/* Values & Role */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-white select-all">{hex}</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(hex, `hex-${idx}`, {
                              title: 'PaletteMaster – Barva zkopírována',
                              body: `Kód barvy ${hex} byl zkopírován do schránky.`,
                            })
                          }
                          className="p-0.5 text-gray-400 hover:text-white transition cursor-pointer"
                          title="Kopírovat HEX"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {copiedKey === `hex-${idx}` ? 'check' : 'content_copy'}
                          </span>
                        </button>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-mono">
                          {role.name}
                        </span>
                        <span className="text-[11px] text-gray-400 inline">• {role.desc}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-gray-400 font-mono flex-wrap">
                        <span className="select-all">{rgb}</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(rgb, `rgb-${idx}`, {
                              title: 'PaletteMaster – Barva zkopírována',
                              body: `Odstín ${rgb} byl zkopírován do schránky.`,
                            })
                          }
                          className="p-0.5 text-gray-500 hover:text-white transition cursor-pointer"
                          title="Kopírovat RGB"
                        >
                          <span className="material-symbols-outlined text-[13px]">
                            {copiedKey === `rgb-${idx}` ? 'check' : 'content_copy'}
                          </span>
                        </button>
                        {hsl && (
                          <>
                            <span className="text-gray-600">•</span>
                            <span className="select-all text-gray-400">{hsl}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTuneColor(color, idx)}
                      className="px-3 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-gray-200 hover:text-white transition flex items-center gap-1 cursor-pointer"
                      title="Doladit odstín a složky barvy"
                    >
                      <span className="material-symbols-outlined text-[15px] text-rose-400">tune</span>
                      <span>Doladit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSlotPreviews((prev) => ({
                          ...prev,
                          [idx]: !isSlotExpanded,
                        }))
                      }
                      className={`p-1.5 rounded-full transition flex items-center justify-center cursor-pointer ${
                        isSlotExpanded
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-white/[0.06] hover:bg-white/[0.12] text-gray-400 hover:text-white'
                      }`}
                      title={isSlotExpanded ? 'Skrýt náhledy komponent' : 'Zobrazit náhledy komponent'}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isSlotExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Derived Surface & Button Previews (toggleable, default hidden) */}
                {isSlotExpanded && (
                  <div className="pt-2 animate-fade-in">
                    <div className="flex items-center justify-between mb-2 px-0.5">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                        Náhled komponent a povrchů ({role.name})
                      </span>
                      <span className="text-[10px] text-gray-500">Kliknutím zkopírovat barvu</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                      {[
                        {
                          title: 'Plné tlačítko',
                          icon: 'smart_button',
                          light: derived[0],
                          dark: derived[1],
                        },
                        {
                          title: 'Povrch / Surface',
                          icon: 'layers',
                          light: derived[2],
                          dark: derived[3],
                        },
                        {
                          title: 'Tónovaný kontejner',
                          icon: 'crop_square',
                          light: derived[4],
                          dark: derived[5],
                        },
                      ].map((group, gIdx) => (
                        <div key={gIdx} className="bg-white/[0.02] rounded-xl p-2 space-y-1.5 flex flex-col justify-between">
                          <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold text-gray-400">
                            <span className="material-symbols-outlined text-[13px] text-rose-400">{group.icon}</span>
                            <span>{group.title}</span>
                          </div>

                          {/* Světlý náhled (nahoře) */}
                          <div
                            onClick={() => setActiveOptionsColor({ name: `${role.name} – ${group.light.name}`, token: group.light })}
                            className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group relative flex flex-col gap-1 shadow-sm"
                            style={{ backgroundColor: group.light.bgPreview }}
                            title={`Světlý režim: ${group.light.hex} – Kliknutím zkopírovat`}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                              <span className="font-semibold text-gray-600">Světlý</span>
                              <span className="font-bold text-gray-900">{group.light.hex}</span>
                            </div>
                            <div
                              className="w-full py-1 px-2 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
                              style={{ backgroundColor: group.light.hex, color: group.light.fgText }}
                            >
                              <span className="material-symbols-outlined text-[12px]">{group.icon}</span>
                              <span className="truncate">
                                {group.light.previewType === 'surface' ? 'Povrch' : group.light.previewType === 'container' ? 'Kontejner' : 'Tlačítko'}
                              </span>
                            </div>
                          </div>

                          {/* Tmavý náhled (dole) */}
                          <div
                            onClick={() => setActiveOptionsColor({ name: `${role.name} – ${group.dark.name}`, token: group.dark })}
                            className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group relative flex flex-col gap-1 shadow-sm"
                            style={{ backgroundColor: group.dark.bgPreview }}
                            title={`Tmavý režim: ${group.dark.hex} – Kliknutím zkopírovat`}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                              <span className="font-semibold text-gray-400">Tmavý</span>
                              <span className="font-bold text-gray-100">{group.dark.hex}</span>
                            </div>
                            <div
                              className="w-full py-1 px-2 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
                              style={{ backgroundColor: group.dark.hex, color: group.dark.fgText }}
                            >
                              <span className="material-symbols-outlined text-[12px]">{group.icon}</span>
                              <span className="truncate">
                                {group.dark.previewType === 'surface' ? 'Povrch' : group.dark.previewType === 'container' ? 'Kontejner' : 'Tlačítko'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const text = exportToAndroidStudioKotlin(colors);
              handleCopy(text, 'android-studio', {
                title: 'PaletteMaster – Android Studio kód',
                body: 'Definice 35 barev motivu pro Android Studio byla zkopírována do schránky.',
              });
            }}
            className="px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 hover:text-white rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Zkopírovat barvy nastavené v paletě pro Android Studio (Kotlin Color tokeny)"
          >
            <span className="material-symbols-outlined text-sm text-emerald-400">android</span>
            <span>{copiedKey === 'android-studio' ? 'Zkopírováno v Kotlinu!' : 'Kopírovat pro Android Studio'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const text = exportToCssVariables(colors);
              handleCopy(text, 'all-css', {
                title: 'PaletteMaster – CSS proměnné',
                body: 'Definice 35 CSS proměnných motivu byla zkopírována do schránky.',
              });
            }}
            className="px-3.5 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 hover:text-white rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Zkopírovat barvy nastavené v paletě jako CSS proměnné"
          >
            <span className="material-symbols-outlined text-sm text-rose-400">code</span>
            <span>{copiedKey === 'all-css' ? 'Zkopírováno v CSS!' : 'Kopírovat CSS proměnné'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1"
          title="Zavřít okno (Esc)"
        >
          <span>Zavřít</span>
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
            Esc
          </kbd>
        </button>
      </div>

      {/* Options Modal Dialog for Derived Swatch */}
      {activeOptionsColor && (
        <div
          className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveOptionsColor(null)}
        >
          <div
            className="w-full max-w-sm bg-[#181926] border border-white/15 rounded-3xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header without divider */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-2xl border border-white/20 shrink-0 shadow-inner flex items-center justify-center"
                  style={{ backgroundColor: activeOptionsColor.token.hex }}
                >
                  <span className="material-symbols-outlined text-sm" style={{ color: activeOptionsColor.token.isDark ? '#FFF' : '#000' }}>
                    colorize
                  </span>
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{activeOptionsColor.name}</h4>
                  <p className="text-[10px] text-gray-400 truncate">{activeOptionsColor.token.role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveOptionsColor(null)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer transition"
                title="Zavřít nabídku (Esc)"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* List of formats to copy */}
            <div className="space-y-1.5">
              {[
                { label: 'HEX', value: activeOptionsColor.token.hex },
                { label: 'HEX8', value: activeOptionsColor.token.hex8 },
                { label: 'RGB', value: activeOptionsColor.token.rgb },
                { label: 'RGBA', value: activeOptionsColor.token.rgba },
                { label: 'HSL', value: activeOptionsColor.token.hsl },
              ].map((fmt) => {
                const isCopied = copiedKey === `opt-${fmt.label}`;
                return (
                  <button
                    key={fmt.label}
                    type="button"
                    onClick={() =>
                      handleCopy(fmt.value, `opt-${fmt.label}`, {
                        title: 'PaletteMaster – Formát zkopírován',
                        body: `${fmt.label}: ${fmt.value} byl zkopírován do schránky.`,
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] active:bg-white/[0.12] transition flex items-center justify-between cursor-pointer border border-transparent hover:border-white/10 group text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-white/[0.06] text-gray-300 w-12 text-center">
                        {fmt.label}
                      </span>
                      <span className="text-xs font-mono text-white truncate">{fmt.value}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-gray-400 group-hover:text-rose-400 text-xs font-sans">
                      {isCopied ? (
                        <>
                          <span className="material-symbols-outlined text-sm text-emerald-400">check</span>
                          <span className="text-emerald-400 text-[11px] font-medium">Zkopírováno</span>
                        </>
                      ) : (
                        <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition">
                          content_copy
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Modal Footer with Esc button */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveOptionsColor(null)}
                className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                title="Zavřít (Esc)"
              >
                <span>Zavřít</span>
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.1] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
                  Esc
                </kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
