import React, { useState, useEffect } from 'react';
import { WindowTitleBar } from './WindowTitleBar';

export interface WindowFrameProps {
  title: string;
  subtitle?: string;
  icon?: string;
  allowMinimize?: boolean;
  allowMaximize?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export const WindowFrame: React.FC<WindowFrameProps> = ({
  title,
  subtitle,
  icon,
  allowMinimize = true,
  allowMaximize = true,
  onClose,
  children,
  className = '',
  containerClassName = '',
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [snapState, setSnapState] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    if (!allowMaximize) return;

    if (window.electronAPI?.isWindowMaximized) {
      window.electronAPI.isWindowMaximized().then((max) => {
        setIsMaximized(Boolean(max));
      });
    }

    if (window.electronAPI?.onWindowMaximizeChanged) {
      const unsub = window.electronAPI.onWindowMaximizeChanged((max: boolean) => {
        setIsMaximized(max);
      });
      return () => unsub();
    }
  }, [allowMaximize]);

  useEffect(() => {
    if (window.electronAPI?.onWindowSnapChanged) {
      const unsub = window.electronAPI.onWindowSnapChanged((snap) => {
        setSnapState(snap);
      });
      return () => unsub();
    }
  }, []);

  const isFramelessFull = isMaximized || Boolean(snapState);

  return (
    <div
      data-window-frame
      data-maximized={isFramelessFull}
      className={`w-screen h-screen bg-[#15161c] text-gray-200 flex flex-col select-none overflow-hidden font-sans transition-[border-radius] duration-150 relative [contain:paint] ${
        isFramelessFull
          ? 'rounded-none border-0'
          : 'rounded-[24px] border border-white/10 shadow-2xl'
      } ${containerClassName}`}
      style={{
        '--window-frame-radius': isFramelessFull ? '0px' : '24px',
        borderRadius: isFramelessFull ? '0px' : '24px',
      } as React.CSSProperties}
    >
      <WindowTitleBar
        title={title}
        subtitle={subtitle}
        icon={icon}
        allowMinimize={allowMinimize}
        allowMaximize={allowMaximize}
        onClose={onClose}
        isMaximized={isMaximized}
        onToggleMaximize={(max) => setIsMaximized(max)}
        className={className}
      />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col [&>main]:rounded-none [&>main]:shadow-none">
        {children}
      </div>
    </div>
  );
};
