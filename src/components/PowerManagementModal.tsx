import React, { useEffect } from 'react';

interface PowerManagementModalProps {
  onClose: () => void;
}

export const PowerManagementModal: React.FC<PowerManagementModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleRestart = () => {
    window.electronAPI?.restartApp?.();
  };

  const handleQuit = () => {
    window.electronAPI?.quitApp?.();
  };

  return (
    <main className="w-full h-full bg-[#14151b] flex flex-col justify-between p-5 text-gray-200 select-none">
      {/* Description */}
      <div className="text-center pt-1">
        <p className="text-xs text-gray-400 leading-relaxed">
          Zvolte požadovanou systémovou akci pro aplikaci IADonkey:
        </p>
      </div>

      {/* Big Circle Action Buttons in center */}
      <div className="flex items-center justify-center gap-10 my-auto py-2">
        <button
          type="button"
          onClick={handleRestart}
          className="group flex flex-col items-center gap-2 cursor-pointer focus:outline-none"
          title="Restartovat aplikaci"
        >
          <div className="w-16 h-16 rounded-full bg-indigo-600/20 group-hover:bg-indigo-600/40 text-indigo-400 group-hover:text-white border border-indigo-500/30 group-hover:border-indigo-400/60 flex items-center justify-center transition-all duration-200 shadow-md group-hover:scale-105 active:scale-95">
            <span className="material-symbols-outlined text-3xl group-hover:rotate-180 transition-transform duration-500">
              refresh
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition">
            Restartovat
          </span>
        </button>

        <button
          type="button"
          onClick={handleQuit}
          className="group flex flex-col items-center gap-2 cursor-pointer focus:outline-none"
          title="Ukončit aplikaci"
        >
          <div className="w-16 h-16 rounded-full bg-rose-600/20 group-hover:bg-rose-600/40 text-rose-400 group-hover:text-white border border-rose-500/30 group-hover:border-rose-400/60 flex items-center justify-center transition-all duration-200 shadow-md group-hover:scale-105 active:scale-95">
            <span className="material-symbols-outlined text-3xl">
              power_settings_new
            </span>
          </div>
          <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition">
            Ukončit
          </span>
        </button>
      </div>

      {/* Footer: Zrušit right-aligned */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-full text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center gap-1.5"
          title="Zrušit a zavřít okno (Esc)"
        >
          <span>Zrušit</span>
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
            Esc
          </kbd>
        </button>
      </div>
    </main>
  );
};
