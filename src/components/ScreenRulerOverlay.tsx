import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Ruler,
  Crosshair,
  Lock,
  Unlock,
  Copy,
  Check,
  X,
} from 'lucide-react';
import {
  getActiveAspectLock,
  calculateAspectBox,
  formatAspectRatio,
  AspectRatioType,
} from '../utils/aspectRatio';

export type RulerMode = 'box' | 'crosshair';
export type RulerUnit = 'px' | '%' | 'dp';

interface RulerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenRulerInitData {
  width: number;
  height: number;
  color: string;
  defaultUnit: string;
}

export const ScreenRulerOverlay: React.FC = () => {
  const [initData, setInitData] = useState<ScreenRulerInitData>({
    width: window.innerWidth || 1920,
    height: window.innerHeight || 1080,
    color: '#f43f5e',
    defaultUnit: 'px',
  });

  const [mode, setMode] = useState<RulerMode>('box');
  const [unit, setUnit] = useState<RulerUnit>('px');
  const [accentColor, setAccentColor] = useState<string>('#f43f5e');

  // Mouse / Box state
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState<RulerBox | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeRatioLock, setActiveRatioLock] = useState<AspectRatioType | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isLockedRef = useRef(false);
  const boxRef = useRef<RulerBox | null>(null);
  const modeRef = useRef<RulerMode>('box');
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeRatioLockRef = useRef<AspectRatioType | null>(null);

  isDraggingRef.current = isDragging;
  dragStartRef.current = dragStart;
  isLockedRef.current = isLocked;
  boxRef.current = box;
  modeRef.current = mode;
  mousePosRef.current = mousePos;
  activeRatioLockRef.current = activeRatioLock;

  // Sound effect / Audio beep if available
  const playCopyFeedback = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.onended = () => {
        audioCtx.close().catch(() => {});
      };
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {}
  };

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      if (window.electronAPI?.copyScreenRulerDimensions) {
        await window.electronAPI.copyScreenRulerDimensions(text);
      } else {
        await navigator.clipboard?.writeText(text);
      }
    } catch (err) {
      console.error('[ScreenRuler] Copy error:', err);
    }
    playCopyFeedback();
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 1200);
  }, []);

  const handleClose = useCallback(() => {
    if (window.electronAPI?.closeScreenRuler) {
      window.electronAPI.closeScreenRuler();
    } else {
      window.close();
    }
  }, []);

  // Format value by unit
  const formatVal = useCallback(
    (pxValue: number, isHeight = false): string => {
      if (unit === '%') {
        const total = isHeight ? (initData.height || 1080) : (initData.width || 1920);
        return `${((pxValue / total) * 100).toFixed(1)}%`;
      }
      if (unit === 'dp') {
        const factor = window.devicePixelRatio || 1;
        return `${Math.round(pxValue / factor)} dp`;
      }
      return `${Math.round(pxValue)} px`;
    },
    [unit, initData.width, initData.height]
  );

  // Format numeric part only (without unit suffix) for toolbar/badge display
  const formatNumVal = useCallback(
    (pxValue: number, isHeight = false): string => {
      if (unit === '%') {
        const total = isHeight ? (initData.height || 1080) : (initData.width || 1920);
        return ((pxValue / total) * 100).toFixed(1);
      }
      if (unit === 'dp') {
        const factor = window.devicePixelRatio || 1;
        return String(Math.round(pxValue / factor));
      }
      return String(Math.round(pxValue));
    },
    [unit, initData.width, initData.height]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Live modifier update while dragging (Shift = 16:9, Ctrl = 4:3, Alt = 1:1)
      if (['Shift', 'Control', 'Alt'].includes(e.key) && isDraggingRef.current && dragStartRef.current && !isLockedRef.current && modeRef.current === 'box') {
        const lock = getActiveAspectLock(e);
        setActiveRatioLock(lock ? lock.label : null);
        const newBox = calculateAspectBox(dragStartRef.current, mousePosRef.current, lock, {
          width: initData.width || window.innerWidth,
          height: initData.height || window.innerHeight,
        });
        setBox(newBox);
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (boxRef.current && (boxRef.current.width > 3 || boxRef.current.height > 3)) {
          setBox(null);
          setIsDragging(false);
          setDragStart(null);
          setIsLocked(false);
          setActiveRatioLock(null);
          return;
        }
        handleClose();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsLocked((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (modeRef.current === 'box' && boxRef.current && boxRef.current.width > 0 && boxRef.current.height > 0) {
          const w = formatNumVal(boxRef.current.width, false);
          const h = formatNumVal(boxRef.current.height, true);
          copyToClipboard(`${w}×${h} ${unit}`);
        } else {
          const x = formatNumVal(mousePosRef.current.x, false);
          const y = formatNumVal(mousePosRef.current.y, true);
          copyToClipboard(`${x} / ${y} ${unit}`);
        }
        return;
      }

      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMode((prev) => {
          const next = prev === 'box' ? 'crosshair' : 'box';
          if (next === 'crosshair') {
            setBox(null);
            setIsDragging(false);
            setDragStart(null);
            setActiveRatioLock(null);
          }
          return next;
        });
        return;
      }

      if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        setUnit((prev) => {
          if (prev === 'px') return '%';
          if (prev === '%') return 'dp';
          return 'px';
        });
        return;
      }

      // Arrow keys for nudging box position
      if (boxRef.current && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        setBox((prev) => {
          if (!prev) return null;
          let { x, y, width, height } = prev;
          if (e.key === 'ArrowLeft') x = Math.max(0, x - delta);
          if (e.key === 'ArrowRight') x = Math.min(initData.width - width, x + delta);
          if (e.key === 'ArrowUp') y = Math.max(0, y - delta);
          if (e.key === 'ArrowDown') y = Math.min(initData.height - height, y + delta);
          return { x, y, width, height };
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Live modifier update when releasing Shift / Ctrl / Alt while dragging
      if (['Shift', 'Control', 'Alt'].includes(e.key) && isDraggingRef.current && dragStartRef.current && !isLockedRef.current && modeRef.current === 'box') {
        const lock = getActiveAspectLock(e);
        setActiveRatioLock(lock ? lock.label : null);
        const newBox = calculateAspectBox(dragStartRef.current, mousePosRef.current, lock, {
          width: initData.width || window.innerWidth,
          height: initData.height || window.innerHeight,
        });
        setBox(newBox);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleClose, copyToClipboard, initData.width, initData.height, unit, formatNumVal]);

  // IPC Initial Data & Cleanup
  useEffect(() => {
    const fetchInit = window.electronAPI?.getScreenRulerInitData;
    if (fetchInit) {
      fetchInit().then((data) => {
        if (data) {
          setInitData(data);
          if (data.color) setAccentColor(data.color);
          if (data.defaultUnit) setUnit(data.defaultUnit as RulerUnit);
        }
      });
    }

    let unsubscribeInit: (() => void) | undefined;
    if (window.electronAPI?.onScreenRulerInit) {
      unsubscribeInit = window.electronAPI.onScreenRulerInit((data) => {
        setInitData(data);
        if (data.color) setAccentColor(data.color);
        if (data.defaultUnit) setUnit(data.defaultUnit as RulerUnit);
        setBox(null);
        setIsLocked(false);
      });
    }

    let unsubscribeCleanup: (() => void) | undefined;
    if (window.electronAPI?.onScreenRulerCleanup) {
      unsubscribeCleanup = window.electronAPI.onScreenRulerCleanup(() => {
        setBox(null);
        setIsDragging(false);
        setIsLocked(false);
      });
    }

    return () => {
      if (unsubscribeInit) unsubscribeInit();
      if (unsubscribeCleanup) unsubscribeCleanup();
    };
  }, []);

  const handleSetMode = (newMode: 'box' | 'crosshair') => {
    setMode(newMode);
    if (newMode === 'crosshair') {
      setBox(null);
      setIsDragging(false);
      setDragStart(null);
    }
  };

  // Mouse handlers for dragging bounding box
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    if (isLocked) return;
    if (mode !== 'box') return;

    const x = e.clientX;
    const y = e.clientY;
    setIsDragging(true);
    setDragStart({ x, y });
    const lock = getActiveAspectLock(e);
    setActiveRatioLock(lock ? lock.label : null);
    setBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    setMousePos({ x, y });

    if (isDragging && dragStart && !isLocked && mode === 'box') {
      const lock = getActiveAspectLock(e);
      setActiveRatioLock(lock ? lock.label : null);
      const newBox = calculateAspectBox(dragStart, { x, y }, lock, {
        width: initData.width || window.innerWidth,
        height: initData.height || window.innerHeight,
      });
      setBox(newBox);
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setActiveRatioLock(null);
    }
  };

  const boxW = box ? Math.round(box.width) : 0;
  const boxH = box ? Math.round(box.height) : 0;
  const hasBox = box !== null && (boxW > 3 || boxH > 3);
  const isSelection = mode === 'box' && box !== null && hasBox;
  const val1 = isSelection ? formatNumVal(box!.width, false) : formatNumVal(mousePos.x, false);
  const val2 = isSelection ? formatNumVal(box!.height, true) : formatNumVal(mousePos.y, true);
  const separator = isSelection ? '×' : '/';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-screen h-screen overflow-hidden select-none cursor-crosshair bg-transparent"
      style={{ userSelect: 'none' }}
    >
      {/* SVG Canvas for precision guides, bounding boxes and edge distance lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <defs>
          {/* Arrow markers */}
          <marker
            id="ruler-arrow-start"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={accentColor} />
          </marker>
          <marker
            id="ruler-arrow-end"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill={accentColor} />
          </marker>
        </defs>

        {/* ================= MODE: CROSSHAIR ================= */}
        {mode === 'crosshair' && (
          <g>
            {/* Fullscreen Crosshair lines */}
            <line
              x1={0}
              y1={mousePos.y}
              x2={initData.width || window.innerWidth}
              y2={mousePos.y}
              stroke={accentColor}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.85"
            />
            <line
              x1={mousePos.x}
              y1={0}
              x2={mousePos.x}
              y2={initData.height || window.innerHeight}
              stroke={accentColor}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeOpacity="0.85"
            />

            {/* Solid distance lines from cursor to edges */}
            {/* Top guide line */}
            <line
              x1={mousePos.x}
              y1={0}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke={accentColor}
              strokeWidth="2"
              markerEnd="url(#ruler-arrow-end)"
            />
            {/* Bottom guide line */}
            <line
              x1={mousePos.x}
              y1={mousePos.y}
              x2={mousePos.x}
              y2={initData.height || window.innerHeight}
              stroke={accentColor}
              strokeWidth="2"
              markerEnd="url(#ruler-arrow-end)"
            />
            {/* Left guide line */}
            <line
              x1={0}
              y1={mousePos.y}
              x2={mousePos.x}
              y2={mousePos.y}
              stroke={accentColor}
              strokeWidth="2"
              markerEnd="url(#ruler-arrow-end)"
            />
            {/* Right guide line */}
            <line
              x1={mousePos.x}
              y1={mousePos.y}
              x2={initData.width || window.innerWidth}
              y2={mousePos.y}
              stroke={accentColor}
              strokeWidth="2"
              markerEnd="url(#ruler-arrow-end)"
            />
          </g>
        )}

        {/* ================= MODE: BOUNDING BOX ================= */}
        {mode === 'box' && hasBox && box && (
          <g>
            {/* Semi-transparent filled rectangle with accent border */}
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              fill={accentColor}
              fillOpacity="0.12"
              stroke={accentColor}
              strokeWidth="2"
            />

            {/* Corner accent handles */}
            <rect x={box.x - 3} y={box.y - 3} width="6" height="6" fill={accentColor} />
            <rect x={box.x + box.width - 3} y={box.y - 3} width="6" height="6" fill={accentColor} />
            <rect x={box.x - 3} y={box.y + box.height - 3} width="6" height="6" fill={accentColor} />
            <rect x={box.x + box.width - 3} y={box.y + box.height - 3} width="6" height="6" fill={accentColor} />

            {/* Horizontal dimension line (Top) */}
            <line
              x1={box.x}
              y1={Math.max(16, box.y - 12)}
              x2={box.x + box.width}
              y2={Math.max(16, box.y - 12)}
              stroke={accentColor}
              strokeWidth="1.5"
              markerStart="url(#ruler-arrow-start)"
              markerEnd="url(#ruler-arrow-end)"
            />

            {/* Vertical dimension line (Left) */}
            <line
              x1={Math.max(16, box.x - 12)}
              y1={box.y}
              x2={Math.max(16, box.x - 12)}
              y2={box.y + box.height}
              stroke={accentColor}
              strokeWidth="1.5"
              markerStart="url(#ruler-arrow-start)"
              markerEnd="url(#ruler-arrow-end)"
            />
          </g>
        )}
      </svg>

      {/* ================= CROSSHAIR BADGES (HTML Overlays) ================= */}
      {mode === 'crosshair' && (
        <>
          {/* Top distance badge */}
          {mousePos.y > 30 && (
            <div
              className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: mousePos.x,
                top: mousePos.y / 2,
                backgroundColor: 'rgba(28, 29, 36, 0.95)',
                color: accentColor,
                border: `1px solid ${accentColor}50`,
                zIndex: 20,
              }}
            >
              {formatVal(mousePos.y, true)}
            </div>
          )}

          {/* Bottom distance badge */}
          {(initData.height || window.innerHeight) - mousePos.y > 30 && (
            <div
              className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: mousePos.x,
                top: mousePos.y + ((initData.height || window.innerHeight) - mousePos.y) / 2,
                backgroundColor: 'rgba(28, 29, 36, 0.95)',
                color: accentColor,
                border: `1px solid ${accentColor}50`,
                zIndex: 20,
              }}
            >
              {formatVal((initData.height || window.innerHeight) - mousePos.y, true)}
            </div>
          )}

          {/* Left distance badge */}
          {mousePos.x > 30 && (
            <div
              className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: mousePos.x / 2,
                top: mousePos.y,
                backgroundColor: 'rgba(28, 29, 36, 0.95)',
                color: accentColor,
                border: `1px solid ${accentColor}50`,
                zIndex: 20,
              }}
            >
              {formatVal(mousePos.x, false)}
            </div>
          )}

          {/* Right distance badge */}
          {(initData.width || window.innerWidth) - mousePos.x > 30 && (
            <div
              className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: mousePos.x + ((initData.width || window.innerWidth) - mousePos.x) / 2,
                top: mousePos.y,
                backgroundColor: 'rgba(28, 29, 36, 0.95)',
                color: accentColor,
                border: `1px solid ${accentColor}50`,
                zIndex: 20,
              }}
            >
              {formatVal((initData.width || window.innerWidth) - mousePos.x, false)}
            </div>
          )}

          {/* Center Coordinates Tooltip */}
          <div
            className="absolute pointer-events-none px-3 py-1.5 rounded-xl text-xs font-mono font-medium shadow-2xl backdrop-blur-xl"
            style={{
              left: Math.min(window.innerWidth - 130, mousePos.x + 12),
              top: Math.min(window.innerHeight - 50, mousePos.y + 12),
              backgroundColor: 'rgba(28, 29, 36, 0.95)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              zIndex: 25,
            }}
          >
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="text-gray-400">X:</span>
              <span className="text-white font-semibold">{Math.round(mousePos.x)}</span>
              <span className="text-gray-400 ml-1.5">Y:</span>
              <span className="text-white font-semibold">{Math.round(mousePos.y)}</span>
            </div>
          </div>
        </>
      )}

      {/* ================= BOX BADGES ================= */}
      {mode === 'box' && hasBox && box && (
        <>
          {/* Top Width Badge */}
          <div
            className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: box.x + box.width / 2,
              top: Math.max(16, box.y - 12),
              backgroundColor: 'rgba(28, 29, 36, 0.95)',
              color: accentColor,
              border: `1px solid ${accentColor}50`,
              zIndex: 25,
            }}
          >
            {formatVal(box.width, false)}
          </div>

          {/* Left Height Badge */}
          <div
            className="absolute pointer-events-none px-2 py-0.5 rounded-lg text-[11px] font-mono font-medium shadow-xl backdrop-blur-md tabular-nums transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: Math.max(16, box.x - 12),
              top: box.y + box.height / 2,
              backgroundColor: 'rgba(28, 29, 36, 0.95)',
              color: accentColor,
              border: `1px solid ${accentColor}50`,
              zIndex: 25,
            }}
          >
            {formatVal(box.height, true)}
          </div>

          {/* Bottom Box Info Card (W × H, Ratio, Area) */}
          <div
            className="absolute pointer-events-none px-3.5 py-1.5 rounded-xl text-xs font-mono shadow-2xl backdrop-blur-xl flex items-center gap-3 border border-white/10"
            style={{
              left: Math.min(window.innerWidth - 240, Math.max(12, box.x)),
              top: Math.min(window.innerHeight - 50, box.y + box.height + 10),
              backgroundColor: 'rgba(28, 29, 36, 0.95)',
              color: '#f8fafc',
              zIndex: 25,
            }}
          >
            <div className="flex items-center gap-1.5 font-bold tabular-nums" style={{ color: accentColor }}>
              <span>{formatNumVal(box.width, false)}</span>
              <span className="opacity-60">×</span>
              <span>{formatNumVal(box.height, true)}</span>
              <span className="text-[10px] uppercase font-normal opacity-80">{unit}</span>
            </div>
            <div className="h-3.5 w-px bg-white/15" />
            <div className="text-[11px] text-gray-300 flex items-center gap-1.5">
              <span className="text-gray-400">Ratio: </span>
              <span className={`font-mono ${activeRatioLock ? 'text-rose-400 font-semibold' : ''}`}>
                {activeRatioLock || formatAspectRatio(box.width, box.height)}
              </span>
              {activeRatioLock && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[9px] font-mono leading-none">
                  {activeRatioLock}
                </span>
              )}
            </div>
            <div className="h-3.5 w-px bg-white/15" />
            <div className="text-[11px] text-gray-300">
              <span className="text-gray-400">Plocha: </span>
              {(Math.round(box.width) * Math.round(box.height)).toLocaleString()} px²
            </div>
          </div>
        </>
      )}

      {/* ================= FLOATING TOP TOOLBAR (Material 3 Expressive Pill) ================= */}
      <div
        className="fixed top-5 left-1/2 transform -translate-x-1/2 flex items-center gap-2.5 p-2 px-4 rounded-full transition-all pointer-events-auto bg-[#15161c]/95 backdrop-blur-xl text-gray-100"
        style={{
          zIndex: 50,
          boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 2px 8px -2px rgba(0, 0, 0, 0.25)',
        }}
        onMouseDown={(e) => e.stopPropagation()} // don't trigger canvas drag
      >
        {/* App Title / Icon */}
        <div className="h-8 flex items-center gap-2.5 pr-1 shrink-0">
          <div className="w-8 h-8 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-400 shadow-sm shrink-0">
            <Ruler className="w-4 h-4 text-rose-400" />
          </div>
          <div className="hidden sm:block text-xs font-semibold text-white tracking-wide">
            ScreenRuler
          </div>
        </div>

        {/* Mode Selector */}
        <div className="h-8 flex items-center bg-white/[0.05] rounded-full p-1 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleSetMode('box')}
            className={`h-6 flex items-center gap-1.5 px-3 rounded-full text-xs font-medium transition-all ${
              mode === 'box'
                ? 'bg-rose-500/20 text-rose-300 shadow-sm font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            title="Obdélníkový výběr (M)"
          >
            <span className="material-symbols-outlined text-[15px] leading-none">crop_free</span>
            <span>Výběr</span>
          </button>
          <button
            type="button"
            onClick={() => handleSetMode('crosshair')}
            className={`h-6 flex items-center gap-1.5 px-3 rounded-full text-xs font-medium transition-all ${
              mode === 'crosshair'
                ? 'bg-rose-500/20 text-rose-300 shadow-sm font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            title="Kříž a vzdálenost k okrajům (M)"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Kříž</span>
          </button>
        </div>

        {/* Unit Selector */}
        <div className="h-8 flex items-center bg-white/[0.05] rounded-full p-1 gap-1 shrink-0">
          {(['px', '%', 'dp'] as RulerUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={`w-6 h-6 p-0 rounded-full text-[11px] font-mono font-medium transition-all flex items-center justify-center ${
                unit === u
                  ? 'bg-white/20 text-white font-bold shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              title={`Jednotka měření: ${u} (U)`}
            >
              {u}
            </button>
          ))}
        </div>

        {/* Dimension display & Copy Button */}
        <button
          type="button"
          onClick={() => {
            if (isSelection) {
              const text = `${val1}×${val2} ${unit}`;
              copyToClipboard(text);
            } else {
              const text = `${val1} / ${val2} ${unit}`;
              copyToClipboard(text);
            }
          }}
          className="h-8 flex items-center gap-2 px-3.5 bg-white/[0.05] hover:bg-white/10 text-white rounded-full text-xs font-mono transition-all active:scale-95 cursor-pointer shrink-0"
          title="Kliknutím zkopírujte rozměr do schránky (C)"
        >
          {isCopied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          )}
          <div className="flex items-center gap-1 font-mono text-xs tabular-nums select-none">
            <span className="w-11 text-right font-semibold text-white inline-block">
              {val1}
            </span>
            <span className="text-gray-500 font-normal mx-0.5">{separator}</span>
            <span className="w-11 text-left font-semibold text-white inline-block">
              {val2}
            </span>
            <span className="text-[10px] text-gray-400 uppercase ml-0.5">{unit}</span>
          </div>
        </button>

        {/* Lock / Freeze Button */}
        <button
          type="button"
          onClick={() => setIsLocked((prev) => !prev)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${
            isLocked
              ? 'bg-amber-500/20 text-amber-300 shadow-sm'
              : 'bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/10'
          }`}
          title={isLocked ? 'Odemknout výběr (Mezerník)' : 'Zmrazit výběr (Mezerník)'}
        >
          {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>

        {/* Keyboard hints pill */}
        <div className="h-8 hidden lg:flex items-center gap-1.5 px-3 text-[11px] text-gray-400 font-sans shrink-0">
          <kbd className="h-5 px-2 bg-white/10 text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center">Esc</kbd>
          <span>konec</span>
          <kbd className="h-5 px-2 bg-white/10 text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center ml-1">Space</kbd>
          <span>zámek</span>
          <kbd className="h-5 px-2 bg-white/10 text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center ml-1">C</kbd>
          <span>kopírovat</span>
          {mode === 'box' && (
            <div className="hidden xl:flex items-center gap-1.5 pl-2 ml-1 border-l border-white/10 text-[10px]">
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
          )}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="w-8 h-8 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-100 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ml-0.5"
          title="Zavřít pravítko (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
export default ScreenRulerOverlay;
