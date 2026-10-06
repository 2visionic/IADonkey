import React, { useState, useEffect } from 'react';
import {
  parseColorQuery,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbaToHex8,
  deriveSingleColorSurfaces,
  DerivedColorToken,
} from '../utils/colorMaster';

interface TuneColorModalProps {
  initialColor?: string;
}

export const TuneColorModal: React.FC<TuneColorModalProps> = ({ initialColor = '#6366f1' }) => {
  // Parse initial color
  const initialParsed = parseColorQuery(initialColor) || {
    hex: '#6366F1',
    hex8: '#6366F1FF',
    hexNoHash: '6366F1',
    rgb: 'rgb(99, 102, 241)',
    rgba: 'rgba(99, 102, 241, 1)',
    hsl: 'hsl(239, 84%, 67%)',
    hsla: 'hsla(239, 84%, 67%, 1)',
    r: 99,
    g: 102,
    b: 241,
    a: 1,
  };

  const [r, setR] = useState(initialParsed.r);
  const [g, setG] = useState(initialParsed.g);
  const [b, setB] = useState(initialParsed.b);
  const [a, setA] = useState(initialParsed.a);
  const [source, setSource] = useState<'spotlight' | 'palette' | 'dev'>('spotlight');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal for format options (Point 3)
  const [activeOptionsColor, setActiveOptionsColor] = useState<{
    name: string;
    token: DerivedColorToken;
  } | null>(null);

  // Read params from URL search if available
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const colorParam = params.get('color');
    const sourceParam = params.get('source') as 'spotlight' | 'palette' | 'dev' | null;
    if (sourceParam) {
      setSource(sourceParam);
    }
    if (colorParam) {
      const parsed = parseColorQuery(colorParam);
      if (parsed) {
        setR(parsed.r);
        setG(parsed.g);
        setB(parsed.b);
        setA(parsed.a);
      }
    }

    if (window.electronAPI?.onTuneColorInit) {
      return (window.electronAPI as any).onTuneColorInit?.((data: any) => {
        if (data.source) setSource(data.source);
        if (data.color) {
          const parsed = parseColorQuery(data.color);
          if (parsed) {
            setR(parsed.r);
            setG(parsed.g);
            setB(parsed.b);
            setA(parsed.a);
          }
        }
      });
    }
  }, []);

  // Compute derived formats
  const hex = rgbToHex(r, g, b);
  const hex8 = rgbaToHex8(r, g, b, a);
  const hslObj = rgbToHsl(r, g, b);
  const rgbString = `rgb(${r}, ${g}, ${b})`;
  const rgbaString = `rgba(${r}, ${g}, ${b}, ${a})`;
  const hslString = `hsl(${hslObj.h}, ${hslObj.s}%, ${hslObj.l}%)`;

  // Derived surfaces for original vs new color
  const originalSurfaces = deriveSingleColorSurfaces(initialParsed.hex);
  const newSurfaces = deriveSingleColorSurfaces(hex);

  const handleCopyText = (text: string, key: string, notif?: { title?: string; body?: string }) => {
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {
      console.warn('[TuneColor] navigator.clipboard error:', e);
    }
    if (window.electronAPI?.copyToClipboard) {
      window.electronAPI.copyToClipboard(text, notif).catch((err) => {
        console.error('[TuneColor] copyToClipboard IPC error:', err);
      });
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleSave = async () => {
    // If alpha is 1, default to hex, else rgba
    const finalColor = a < 1 ? rgbaString : hex;
    if (window.electronAPI?.saveTuneColor) {
      await window.electronAPI.saveTuneColor(finalColor);
    } else {
      window.close();
    }
  };

  const handleCancel = async () => {
    if (window.electronAPI?.closeTuneColorWindow) {
      await window.electronAPI.closeTuneColorWindow();
    } else {
      window.close();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeOptionsColor) {
          // If options modal is open, Esc closes only the options modal
          setActiveOptionsColor(null);
        } else {
          handleCancel();
        }
      } else if (e.key === 'Enter' && !activeOptionsColor && (e.ctrlKey || e.metaKey || !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [r, g, b, a, activeOptionsColor]);

  return (
    <div className="w-full h-full flex flex-col m3-surface-main rounded-none text-gray-200 select-none overflow-hidden font-sans relative">
      {/* Main Content (scrollable if window height is small, includes Header) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-600/20 flex items-center justify-center text-rose-400 shrink-0">
              <span className="material-symbols-outlined text-2xl">tune</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Doladění barvy</h2>
              <p className="text-xs text-gray-400">Přesné nastavení odstínu, složek a průhlednosti</p>
            </div>
          </div>
          {source === 'palette' && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20">
              PaletteMaster
            </span>
          )}
        </div>

        {/* Swatches comparison */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-white/[0.03] rounded-2xl">
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Původní</span>
            <div
              className="h-14 rounded-2xl shadow-inner flex items-center justify-center transition overflow-hidden"
              style={{ backgroundColor: initialParsed.hex }}
            >
              <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[11px] font-mono font-semibold text-white">
                {initialParsed.hex}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Nová barva</span>
            <div
              className="h-14 rounded-2xl shadow-inner flex items-center justify-center transition overflow-hidden"
              style={{ backgroundColor: rgbaString }}
            >
              <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[11px] font-mono font-semibold text-white">
                {a < 1 ? rgbaString : hex}
              </span>
            </div>
          </div>
        </div>

        {/* Sliders Section */}
        <div className="space-y-3 bg-white/[0.03] rounded-2xl p-4">
          {/* Red Slider */}
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="w-16 shrink-0 text-rose-400 font-bold whitespace-nowrap">R ({r})</span>
            <input
              type="range"
              min={0}
              max={255}
              value={r}
              onChange={(e) => setR(Number(e.target.value))}
              className="flex-1 accent-rose-500 cursor-pointer h-1.5 bg-white/10 rounded-full"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={r}
              onChange={(e) => setR(Math.max(0, Math.min(255, Number(e.target.value))))}
              className="w-14 bg-black/40 rounded-full px-2 py-1 text-center font-mono text-xs text-white focus:outline-none"
            />
          </div>

          {/* Green Slider */}
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="w-16 shrink-0 text-emerald-400 font-bold whitespace-nowrap">G ({g})</span>
            <input
              type="range"
              min={0}
              max={255}
              value={g}
              onChange={(e) => setG(Number(e.target.value))}
              className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-white/10 rounded-full"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={g}
              onChange={(e) => setG(Math.max(0, Math.min(255, Number(e.target.value))))}
              className="w-14 bg-black/40 rounded-full px-2 py-1 text-center font-mono text-xs text-white focus:outline-none"
            />
          </div>

          {/* Blue Slider */}
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="w-16 shrink-0 text-blue-400 font-bold whitespace-nowrap">B ({b})</span>
            <input
              type="range"
              min={0}
              max={255}
              value={b}
              onChange={(e) => setB(Number(e.target.value))}
              className="flex-1 accent-blue-500 cursor-pointer h-1.5 bg-white/10 rounded-full"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={b}
              onChange={(e) => setB(Math.max(0, Math.min(255, Number(e.target.value))))}
              className="w-14 bg-black/40 rounded-full px-2 py-1 text-center font-mono text-xs text-white focus:outline-none"
            />
          </div>

          {/* Alpha Slider */}
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="w-16 shrink-0 text-gray-300 font-bold whitespace-nowrap">A ({Math.round(a * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(a * 100)}
              onChange={(e) => setA(Number((Number(e.target.value) / 100).toFixed(2)))}
              className="flex-1 accent-gray-300 cursor-pointer h-1.5 bg-white/10 rounded-full"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(a * 100)}
              onChange={(e) => setA(Number((Math.max(0, Math.min(100, Number(e.target.value))) / 100).toFixed(2)))}
              className="w-14 bg-black/40 rounded-full px-2 py-1 text-center font-mono text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Quick Format Cards - Entire box clickable to copy (Point 2) */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
            Rychlé zkopírování hodnoty (kliknutím)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
            {[
              { label: 'HEX', value: hex, key: 'quick-hex' },
              { label: 'HEX8', value: hex8, key: 'quick-hex8' },
              { label: 'RGB', value: rgbString, key: 'quick-rgb' },
              { label: 'RGBA', value: rgbaString, key: 'quick-rgba' },
              { label: 'HSL', value: hslString, key: 'quick-hsl', spanCol: true },
            ].map((fmt) => {
              const isCopied = copiedKey === fmt.key;
              return (
                <div
                  key={fmt.key}
                  onClick={() =>
                    handleCopyText(fmt.value, fmt.key, {
                      title: source === 'palette' ? 'PaletteMaster – Barva zkopírována' : 'ColorMaster – Barva zkopírována',
                      body: `${fmt.label}: ${fmt.value} byl zkopírován do schránky.`,
                    })
                  }
                  className={`bg-white/[0.03] hover:bg-white/[0.07] active:bg-white/[0.12] rounded-2xl p-3 flex items-center justify-between cursor-pointer transition group select-none ${
                    fmt.spanCol ? 'col-span-2 sm:col-span-1' : ''
                  }`}
                  title={`Kliknutím zkopírovat ${fmt.label} (${fmt.value})`}
                >
                  <div className="flex flex-col min-w-0 pr-1">
                    <span className="text-gray-400 font-sans text-[10px] uppercase font-bold tracking-wider">{fmt.label}</span>
                    <span className="font-semibold text-white text-xs truncate select-all">{fmt.value}</span>
                  </div>
                  <div className="shrink-0 text-gray-400 group-hover:text-rose-400 transition">
                    <span className="material-symbols-outlined text-[16px]">
                      {isCopied ? 'check' : 'content_copy'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Derived Colors Section: 2 Columns strictly side-by-side with 3 grouped pairs */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Náhled komponent a povrchů (Původní vs Nová)
            </span>
            <span className="text-[10px] text-gray-500">Kliknutím zkopírovat barvu</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Column 1: Původní barva */}
            <div className="bg-white/[0.02] rounded-2xl p-2.5 space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-gray-300">Původní barva</span>
                <span className="text-[11px] font-mono text-gray-400">{initialParsed.hex}</span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    title: 'Plné tlačítko',
                    icon: 'smart_button',
                    light: originalSurfaces[0],
                    dark: originalSurfaces[1],
                  },
                  {
                    title: 'Povrch / Surface',
                    icon: 'layers',
                    light: originalSurfaces[2],
                    dark: originalSurfaces[3],
                  },
                  {
                    title: 'Tónovaný kontejner',
                    icon: 'crop_square',
                    light: originalSurfaces[4],
                    dark: originalSurfaces[5],
                  },
                ].map((group, gIdx) => (
                  <div key={gIdx} className="bg-white/[0.02] rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold text-gray-400">
                      <span className="material-symbols-outlined text-[12px] text-gray-400">{group.icon}</span>
                      <span>{group.title}</span>
                    </div>

                    {/* Světlý (nahoře) */}
                    <div
                      onClick={() => setActiveOptionsColor({ name: `Původní • ${group.light.name}`, token: group.light })}
                      className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group flex flex-col gap-1 shadow-sm"
                      style={{ backgroundColor: group.light.bgPreview }}
                      title={`Světlý režim: ${group.light.hex}`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                        <span className="font-semibold text-gray-600">Světlý</span>
                        <span className="font-bold text-gray-900">{group.light.hex}</span>
                      </div>
                      <div
                        className="w-full py-1 px-1.5 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
                        style={{ backgroundColor: group.light.hex, color: group.light.fgText }}
                      >
                        <span className="material-symbols-outlined text-[12px]">{group.icon}</span>
                        <span className="truncate">
                          {group.light.previewType === 'surface' ? 'Povrch' : group.light.previewType === 'container' ? 'Kontejner' : 'Tlačítko'}
                        </span>
                      </div>
                    </div>

                    {/* Tmavý (dole) */}
                    <div
                      onClick={() => setActiveOptionsColor({ name: `Původní • ${group.dark.name}`, token: group.dark })}
                      className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group flex flex-col gap-1 shadow-sm"
                      style={{ backgroundColor: group.dark.bgPreview }}
                      title={`Tmavý režim: ${group.dark.hex}`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                        <span className="font-semibold text-gray-400">Tmavý</span>
                        <span className="font-bold text-gray-100">{group.dark.hex}</span>
                      </div>
                      <div
                        className="w-full py-1 px-1.5 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
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

            {/* Column 2: Nová barva */}
            <div className="bg-white/[0.02] rounded-2xl p-2.5 space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-rose-300">Nová barva</span>
                <span className="text-[11px] font-mono text-rose-400">{hex}</span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    title: 'Plné tlačítko',
                    icon: 'smart_button',
                    light: newSurfaces[0],
                    dark: newSurfaces[1],
                  },
                  {
                    title: 'Povrch / Surface',
                    icon: 'layers',
                    light: newSurfaces[2],
                    dark: newSurfaces[3],
                  },
                  {
                    title: 'Tónovaný kontejner',
                    icon: 'crop_square',
                    light: newSurfaces[4],
                    dark: newSurfaces[5],
                  },
                ].map((group, gIdx) => (
                  <div key={gIdx} className="bg-white/[0.02] rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold text-gray-400">
                      <span className="material-symbols-outlined text-[12px] text-rose-400">{group.icon}</span>
                      <span>{group.title}</span>
                    </div>

                    {/* Světlý (nahoře) */}
                    <div
                      onClick={() => setActiveOptionsColor({ name: `Nová • ${group.light.name}`, token: group.light })}
                      className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group flex flex-col gap-1 shadow-sm"
                      style={{ backgroundColor: group.light.bgPreview }}
                      title={`Světlý režim: ${group.light.hex}`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                        <span className="font-semibold text-gray-600">Světlý</span>
                        <span className="font-bold text-gray-900">{group.light.hex}</span>
                      </div>
                      <div
                        className="w-full py-1 px-1.5 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
                        style={{ backgroundColor: group.light.hex, color: group.light.fgText }}
                      >
                        <span className="material-symbols-outlined text-[12px]">{group.icon}</span>
                        <span className="truncate">
                          {group.light.previewType === 'surface' ? 'Povrch' : group.light.previewType === 'container' ? 'Kontejner' : 'Tlačítko'}
                        </span>
                      </div>
                    </div>

                    {/* Tmavý (dole) */}
                    <div
                      onClick={() => setActiveOptionsColor({ name: `Nová • ${group.dark.name}`, token: group.dark })}
                      className="p-1.5 rounded-lg transition cursor-pointer hover:opacity-90 active:scale-[0.98] group flex flex-col gap-1 shadow-sm"
                      style={{ backgroundColor: group.dark.bgPreview }}
                      title={`Tmavý režim: ${group.dark.hex}`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
                        <span className="font-semibold text-gray-400">Tmavý</span>
                        <span className="font-bold text-gray-100">{group.dark.hex}</span>
                      </div>
                      <div
                        className="w-full py-1 px-1.5 rounded-md flex items-center justify-center gap-1 text-[11px] font-semibold shadow-sm"
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
          </div>
        </div>
      </div>

      {/* Fixed Footer Buttons */}
      <div className="shrink-0 flex items-center justify-between p-5">
        <button
          type="button"
          onClick={handleCancel}
          className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
          title="Zrušit a zavřít okno (Esc)"
        >
          <span>Zrušit</span>
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
            Esc
          </kbd>
        </button>

        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white"
          title="Uložit barvu (Enter)"
        >
          <span className="material-symbols-outlined text-sm">check</span>
          <span>Uložit barvu</span>
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-black/30 text-white/90 rounded-full font-mono text-[9px] leading-none select-none">
            Enter
          </kbd>
        </button>
      </div>

      {/* Options Modal Dialog for Derived Swatch (Point 3) */}
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
                      handleCopyText(fmt.value, `opt-${fmt.label}`, {
                        title: source === 'palette' ? 'PaletteMaster – Formát zkopírován' : 'ColorMaster – Formát zkopírován',
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
