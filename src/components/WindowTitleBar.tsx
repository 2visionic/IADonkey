import React, { useState, useEffect, useRef } from 'react';
import appLogo from '../assets/icon.png';

export interface WindowTitleBarProps {
  title: string;
  subtitle?: string;
  icon?: string;
  allowMinimize?: boolean;
  allowMaximize?: boolean;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: (isMaximized: boolean) => void;
  className?: string;
}

export const WindowTitleBar: React.FC<WindowTitleBarProps> = ({
  title,
  subtitle,
  icon,
  allowMinimize = true,
  allowMaximize = true,
  onClose,
  isMaximized: controlledMaximized,
  onToggleMaximize,
  className = '',
}) => {
  const isDev = import.meta.env.DEV;
  const displayTitle = isDev && title && !title.includes('[DEV]')
    ? title.replace(/IADonkey(?!\s*\[DEV\])/g, 'IADonkey [DEV]')
    : title;

  useEffect(() => {
    if (displayTitle) {
      document.title = displayTitle;
    }
  }, [displayTitle]);

  const [internalMaximized, setInternalMaximized] = useState(false);
  const isMaximized = controlledMaximized !== undefined ? controlledMaximized : internalMaximized;

  const [snapZone, setSnapZone] = useState<'top' | 'left' | 'right' | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef<{
    clientX: number;
    clientY: number;
    screenX: number;
    screenY: number;
    gripRatioX: number;
    gripOffsetY: number;
  } | null>(null);
  const latestMovePointRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!allowMaximize) return;

    if (window.electronAPI?.isWindowMaximized) {
      window.electronAPI.isWindowMaximized().then((max) => {
        setInternalMaximized(Boolean(max));
        onToggleMaximize?.(Boolean(max));
      });
    }

    if (window.electronAPI?.onWindowMaximizeChanged) {
      const unsub = window.electronAPI.onWindowMaximizeChanged((max: boolean) => {
        setInternalMaximized(max);
        onToggleMaximize?.(max);
      });
      return () => unsub();
    }
  }, [allowMaximize, onToggleMaximize]);

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.();
  };

  const handleMaximize = async () => {
    if (!allowMaximize) return;
    if (window.electronAPI?.maximizeWindow) {
      const state = await window.electronAPI.maximizeWindow();
      setInternalMaximized(Boolean(state));
      onToggleMaximize?.(Boolean(state));
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.electronAPI?.closeWindow?.() || window.close();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [data-no-drag]')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const gripRatioX = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
    const gripOffsetY = Math.max(0, e.clientY - rect.top);

    dragStartPosRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      gripRatioX,
      gripOffsetY,
    };
    isDraggingRef.current = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragStartPosRef.current) return;

    if (e.buttons === 0) {
      handlePointerUp(e);
      return;
    }

    const start = dragStartPosRef.current;

    if (!isDraggingRef.current) {
      const dist = Math.hypot(e.screenX - start.screenX, e.screenY - start.screenY);
      if (dist > 4) {
        isDraggingRef.current = true;
        window.electronAPI?.startWindowDrag?.({
          screenX: e.screenX,
          screenY: e.screenY,
          gripRatioX: start.gripRatioX,
          gripOffsetY: start.gripOffsetY,
          isMaximized,
          allowMaximize,
        });
      } else {
        return;
      }
    }

    latestMovePointRef.current = { screenX: e.screenX, screenY: e.screenY };

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(async () => {
        rafIdRef.current = null;
        if (latestMovePointRef.current && isDraggingRef.current) {
          const res = await window.electronAPI?.moveWindowDrag?.(latestMovePointRef.current);
          if (res && res.snapZone !== undefined) {
            setSnapZone(res.snapZone);
          }
        }
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (isDraggingRef.current) {
      window.electronAPI?.endWindowDrag?.({
        screenX: e.screenX,
        screenY: e.screenY,
      });
      isDraggingRef.current = false;
      setSnapZone(null);
    }

    dragStartPosRef.current = null;
  };

  return (
    <header
      className={`h-10 w-full bg-[#121319] flex items-center justify-between px-3.5 select-none shrink-0 border-b border-white/[0.04] transition-colors relative cursor-default ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
      onDoubleClick={(e) => {
        if (isDraggingRef.current) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea, a, [data-no-drag]')) return;
        if (allowMaximize) {
          handleMaximize();
        }
      }}
    >
      {/* Left: App Logo / Icon & Title */}
      <div className="flex items-center gap-2.5 min-w-0 pr-3 pointer-events-none">
        {icon ? (
          <span className="material-symbols-outlined text-[17px] text-gray-300 shrink-0">
            {icon}
          </span>
        ) : (
          <img
            src={appLogo}
            alt="IADonkey"
            className="w-4 h-4 object-contain shrink-0"
          />
        )}
        <span className="text-xs font-semibold text-gray-300 tracking-wide truncate">
          {displayTitle}
        </span>
        {subtitle && (
          <span className="text-[11px] text-gray-500 font-mono hidden sm:inline-block truncate">
            {subtitle}
          </span>
        )}
      </div>

      {/* Center: Visual Snap Zone feedback pill while dragging */}
      {snapZone && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-[11px] font-medium shadow-lg backdrop-blur-md pointer-events-none animate-pulse">
          <span className="material-symbols-outlined text-xs">
            {snapZone === 'top' ? 'crop_square' : snapZone === 'left' ? 'dock_to_left' : 'dock_to_right'}
          </span>
          <span>
            {snapZone === 'top' ? 'Maximalizovat' : snapZone === 'left' ? 'Přichytit doleva (50%)' : 'Přichytit doprava (50%)'}
          </span>
        </div>
      )}

      {/* Right: Window Controls */}
      <div
        className="flex items-center gap-1 shrink-0"
        data-no-drag
        onPointerDown={(e) => e.stopPropagation()}
      >
        {allowMinimize && (
          <button
            type="button"
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            title="Minimalizovat"
          >
            <span className="material-symbols-outlined text-sm">remove</span>
          </button>
        )}
        {allowMaximize && (
          <button
            type="button"
            onClick={handleMaximize}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            title={isMaximized ? 'Obnovit velikost' : 'Maximalizovat'}
          >
            <span className="material-symbols-outlined text-xs">
              {isMaximized ? 'filter_none' : 'crop_square'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-600 text-gray-400 hover:text-white transition cursor-pointer"
          title="Zavřít"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    </header>
  );
};
