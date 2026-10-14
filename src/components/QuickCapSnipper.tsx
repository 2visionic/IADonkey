import React, { useState, useEffect, useRef } from 'react';
import { Crop, Monitor, MousePointer, X } from 'lucide-react';
import {
  getActiveAspectLock,
  calculateAspectBox,
  AspectRatioType,
} from '../utils/aspectRatio';
import { QuickCapEditor } from './QuickCapEditor';

interface QuickCapInitData {
  screenshotUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  mode?: 'crop' | 'edit';
  editFilePath?: string;
}

export const QuickCapSnipper: React.FC = () => {
  const [initData, setInitData] = useState<QuickCapInitData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [isFinished, setIsFinished] = useState(false);
  const [activeRatioLock, setActiveRatioLock] = useState<AspectRatioType | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;
  const startPosRef = useRef(startPos);
  startPosRef.current = startPos;
  const currentPosRef = useRef(currentPos);
  currentPosRef.current = currentPos;
  const initDataRef = useRef(initData);
  initDataRef.current = initData;
  const activeRatioLockRef = useRef<AspectRatioType | null>(null);
  activeRatioLockRef.current = activeRatioLock;

  const resetState = () => {
    setInitData(null);
    setIsFinished(false);
    setIsDragging(false);
    setStartPos(null);
    setCurrentPos(null);
    setActiveRatioLock(null);
    isDraggingRef.current = false;
    startPosRef.current = null;
    currentPosRef.current = null;
    initDataRef.current = null;
    activeRatioLockRef.current = null;
  };

  const handleCancel = () => {
    resetState();
    if (window.electronAPI?.cancelQuickCap) {
      window.electronAPI.cancelQuickCap();
    } else if (window.electronAPI?.cancelFastSnap) {
      window.electronAPI.cancelFastSnap();
    }
  };

  const handleCaptureFullScreen = async () => {
    const width = Math.round(initDataRef.current?.width || window.innerWidth);
    const height = Math.round(initDataRef.current?.height || window.innerHeight);
    const payload = {
      x: 0,
      y: 0,
      width,
      height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
    resetState();
    const finishFn = window.electronAPI?.finishQuickCap || window.electronAPI?.finishFastSnap;
    if (finishFn) {
      await finishFn(payload);
    }
  };

  useEffect(() => {
    const applyInitData = (data: QuickCapInitData) => {
      if (!data?.screenshotUrl) {
        setInitData(data);
        return;
      }
      const img = new Image();
      img.onload = () => {
        setInitData(data);
        setIsFinished(false);
        setIsDragging(false);
        setStartPos(null);
        setCurrentPos(null);
      };
      img.onerror = () => {
        setInitData(data);
      };
      img.src = data.screenshotUrl;
    };

    // Okamžité vyžádání dat při prvním mountu komponenty (řeší možný race condition)
    const fetchInit = window.electronAPI?.getQuickCapInitData || window.electronAPI?.getFastSnapInitData;
    if (fetchInit) {
      fetchInit().then((data) => {
        if (data) {
          applyInitData(data);
        }
      });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (initDataRef.current?.mode === 'edit') return;

      // Live modifier update while dragging (Shift = 16:9, Ctrl = 4:3, Alt = 1:1)
      if (['Shift', 'Control', 'Alt'].includes(e.key) && isDraggingRef.current) {
        const lock = getActiveAspectLock(e);
        setActiveRatioLock(lock ? lock.label : null);
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        // Pokud uživatel právě provádí výběr tažením, ESC pouze zruší rozpracovaný výběr
        if (isDraggingRef.current || (startPosRef.current && currentPosRef.current)) {
          setIsDragging(false);
          setStartPos(null);
          setCurrentPos(null);
          setActiveRatioLock(null);
          isDraggingRef.current = false;
          startPosRef.current = null;
          currentPosRef.current = null;
          return;
        }
        handleCancel();
        return;
      }

      // Klávesová zkratka 'P' pro vyfocení celé obrazovky
      if (!isDraggingRef.current && e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleCaptureFullScreen();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (initDataRef.current?.mode === 'edit') return;
      if (['Shift', 'Control', 'Alt'].includes(e.key) && isDraggingRef.current) {
        const lock = getActiveAspectLock(e);
        setActiveRatioLock(lock ? lock.label : null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let unsubscribeInit: (() => void) | undefined;
    const listenInit = window.electronAPI?.onQuickCapInitData || window.electronAPI?.onFastSnapInitData;
    if (listenInit) {
      unsubscribeInit = listenInit((data) => {
        applyInitData(data);
      });
    }

    let unsubscribeCleanup: (() => void) | undefined;
    const listenCleanup = window.electronAPI?.onQuickCapCleanup || window.electronAPI?.onFastSnapCleanup;
    if (listenCleanup) {
      unsubscribeCleanup = listenCleanup(() => {
        resetState();
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (unsubscribeInit) unsubscribeInit();
      if (unsubscribeCleanup) unsubscribeCleanup();
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isFinished) return; // pouze levé tlačítko
    setIsDragging(true);
    const lock = getActiveAspectLock(e);
    setActiveRatioLock(lock ? lock.label : null);
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos || isFinished) return;
    const lock = getActiveAspectLock(e);
    setActiveRatioLock(lock ? lock.label : null);
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = async (e?: React.MouseEvent) => {
    if (!isDragging || !startPos || !currentPos || isFinished) return;
    setIsDragging(false);

    const lock = activeRatioLockRef.current
      ? {
          ratio:
            activeRatioLockRef.current === '16:9'
              ? 16 / 9
              : activeRatioLockRef.current === '4:3'
              ? 4 / 3
              : 1.0,
          label: activeRatioLockRef.current,
        }
      : e
      ? getActiveAspectLock(e)
      : null;

    const box = calculateAspectBox(startPos, currentPos, lock, {
      width: initDataRef.current?.width || window.innerWidth,
      height: initDataRef.current?.height || window.innerHeight,
    });

    // Pokud je výběr příliš malý (náhodný klik), ignorujeme nebo zrušíme
    if (box.width < 8 || box.height < 8) {
      setStartPos(null);
      setCurrentPos(null);
      setActiveRatioLock(null);
      return;
    }

    const payload = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };

    // Okamžitý kompletní reset stavu výstřižku (výběr, náhled, souřadnice),
    // aby v paměti a komponentě nezůstal předchozí stav a nedocházelo k probliknutí
    resetState();

    const finishFn = window.electronAPI?.finishQuickCap || window.electronAPI?.finishFastSnap;
    if (finishFn) {
      await finishFn(payload);
    }
  };

  // Výpočet obdélníku výběru
  let selectionBox: { x: number; y: number; w: number; h: number } | null = null;
  if (startPos && currentPos) {
    const lock = activeRatioLock
      ? {
          ratio: activeRatioLock === '16:9' ? 16 / 9 : activeRatioLock === '4:3' ? 4 / 3 : 1.0,
          label: activeRatioLock,
        }
      : null;
    const box = calculateAspectBox(startPos, currentPos, lock, {
      width: initData?.width || window.innerWidth,
      height: initData?.height || window.innerHeight,
    });
    selectionBox = { x: box.x, y: box.y, w: box.width, h: box.height };
  }

  if (!initData?.screenshotUrl) {
    return null;
  }

  if (initData.mode === 'edit' && initData.editFilePath) {
    return (
      <QuickCapEditor
        imageUrl={initData.screenshotUrl}
        filePath={initData.editFilePath}
        imageWidth={initData.width}
        imageHeight={initData.height}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 select-none overflow-hidden cursor-crosshair z-50 bg-transparent"
      style={{ width: '100vw', height: '100vh' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => {
        e.preventDefault();
        resetState();
        if (window.electronAPI?.cancelQuickCap) {
          window.electronAPI.cancelQuickCap();
        } else {
          window.electronAPI?.cancelFastSnap?.();
        }
      }}
    >
      {/* 1. Podkladový screenshot přes celou obrazovku */}
      {initData?.screenshotUrl && (
        <img
          src={initData.screenshotUrl}
          alt="Desktop Background"
          className="absolute inset-0 w-full h-full object-fill pointer-events-none"
          style={{ width: '100vw', height: '100vh', objectFit: 'fill' }}
          draggable={false}
          onError={(err) => {
            console.error('[QuickCap] Image load error:', err);
          }}
        />
      )}

      {/* 2. Ztmavení celé obrazovky když není žádný aktivní výběr */}
      {(!selectionBox || selectionBox.w <= 0 || selectionBox.h <= 0) && (
        <div className="absolute inset-0 bg-black/45 pointer-events-none transition-opacity duration-150" />
      )}

      {/* 3. Plovoucí horní panel (Spotlight Visual Style – sjednoceno s ScreenRuler) */}
      {!isDragging && (!selectionBox || selectionBox.w <= 0 || selectionBox.h <= 0) && (
        <div
          className="fixed top-5 left-1/2 transform -translate-x-1/2 flex items-center gap-2.5 p-2 px-4 rounded-full transition-all pointer-events-auto bg-[#15161c] text-gray-100 select-none z-50 animate-fade-in"
          style={{
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 2px 8px -2px rgba(0, 0, 0, 0.25)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* App Title / Icon (Unified h-8) */}
          <div className="h-8 flex items-center gap-2 pr-1 shrink-0">
            <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 shadow-sm shrink-0">
              <Crop className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xs font-semibold text-white tracking-wide">
              QuickCap
            </div>
          </div>

          {/* Action: Vyfotit celou obrazovku (Unified h-8) */}
          <button
            type="button"
            onClick={handleCaptureFullScreen}
            className="h-8 flex items-center gap-1.5 px-3.5 bg-white/[0.06] hover:bg-white/[0.12] text-white rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
            title="Vyfotit celou obrazovku (P)"
          >
            <Monitor className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            <span>Vyfotit celou obrazovku</span>
          </button>

          {/* Shortcuts pill (Spotlight kbd badges, Unified h-8) */}
          <div className="h-8 flex items-center gap-1.5 px-2 text-[11px] text-gray-400 font-sans shrink-0">
            <kbd className="h-[20px] px-2 bg-white/[0.08] text-gray-300 rounded-full text-[10px] leading-none flex items-center justify-center shrink-0">
              <MousePointer className="w-2.5 h-2.5 text-gray-300" />
            </kbd>
            <span>tažením vyberte</span>
            <kbd className="h-[20px] px-2 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center ml-1">
              Esc
            </kbd>
            <span>konec</span>
            <div className="hidden md:flex items-center gap-1.5 pl-2 ml-1 border-l border-white/10 text-[10px]">
              <span className="text-gray-400">Poměr:</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono transition-colors ${activeRatioLock === '16:9' ? 'bg-rose-500/25 text-rose-300 font-semibold' : 'bg-white/[0.06] text-gray-300'}`}>
                <kbd className="text-[9px]">Shift</kbd> 16:9
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono transition-colors ${activeRatioLock === '4:3' ? 'bg-rose-500/25 text-rose-300 font-semibold' : 'bg-white/[0.06] text-gray-300'}`}>
                <kbd className="text-[9px]">Ctrl</kbd> 4:3
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono transition-colors ${activeRatioLock === '1:1' ? 'bg-rose-500/25 text-rose-300 font-semibold' : 'bg-white/[0.06] text-gray-300'}`}>
                <kbd className="text-[9px]">Alt</kbd> 1:1
              </span>
            </div>
          </div>

          {/* Close Button (Unified h-8 w-8) */}
          <button
            type="button"
            onClick={handleCancel}
            className="w-8 h-8 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
            title="Zavřít výstřižek (Escape)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Ostrý průhledný výřez nad ztmavením pomocí box-shadow (dokonalé zarovnání bez duplicitního obrazu) */}
      {selectionBox && selectionBox.w > 0 && selectionBox.h > 0 && (
        <div
          className="absolute pointer-events-none border-2 border-rose-500"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.w,
            height: selectionBox.h,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Rohové úchyty */}
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-white border border-rose-500 rounded-sm shadow-sm" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white border border-rose-500 rounded-sm shadow-sm" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-white border border-rose-500 rounded-sm shadow-sm" />
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-white border border-rose-500 rounded-sm shadow-sm" />

          {/* Badge s rozměry (Spotlight Visual Style) */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#15161c]/95 text-white font-mono text-xs shadow-2xl backdrop-blur-xl pointer-events-none flex items-center gap-1.5 whitespace-nowrap tabular-nums ${
              selectionBox.y > 40 ? '-top-9' : 'bottom-3'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shrink-0" />
            <span className="font-semibold text-white">{Math.round(selectionBox.w)}</span>
            <span className="text-gray-500 font-normal">×</span>
            <span className="font-semibold text-white">{Math.round(selectionBox.h)}</span>
            <span className="text-[10px] text-gray-400 uppercase font-sans ml-0.5">px</span>
            {activeRatioLock && (
              <>
                <span className="text-gray-500 font-normal mx-0.5">•</span>
                <span className="text-rose-400 font-semibold text-[11px]">{activeRatioLock}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
