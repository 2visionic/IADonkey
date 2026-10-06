import React, { useState } from 'react';
import { CURRENT_APP_VERSION, DISPLAY_APP_VERSION, IS_DEV } from '../changelog';

export const UninstallerModal: React.FC = () => {
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [done, setDone] = useState(false);

  const handleConfirmUninstall = async () => {
    setIsUninstalling(true);
    try {
      if (window.electronAPI?.installerPerformUninstall) {
        await window.electronAPI.installerPerformUninstall();
      }
      setDone(true);
    } catch (err) {
      console.error('[Uninstaller] Error:', err);
    }
  };

  const handleCancel = () => {
    window.electronAPI?.closeWindow?.() || window.close();
  };

  return (
    <div className="w-screen h-screen bg-[#14151b] text-gray-200 flex flex-col select-none overflow-hidden font-sans rounded-[28px] shadow-2xl">
      {/* Draggable Titlebar */}
      <div className="h-11 bg-[#181926]/90 flex items-center justify-between px-5" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-rose-400">delete</span>
          </div>
          <span className="text-xs font-semibold text-gray-300">
            {IS_DEV ? 'IADonkey [DEV] – Odinstalace' : 'IADonkey – Odinstalace'}
          </span>
          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 text-gray-400 font-mono">v{DISPLAY_APP_VERSION}</span>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition"
        >
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center space-y-5 my-auto">
        {!done ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 flex items-center justify-center text-rose-400">
              <span className="material-symbols-outlined text-4xl">delete_forever</span>
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="text-lg font-bold text-white">Odinstalovat aplikaci IADonkey?</h2>
              <p className="text-xs text-gray-400">
                Opravdu si přejete odebrat aplikaci IADonkey a její zástupce z tohoto počítače?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                disabled={isUninstalling}
                onClick={handleCancel}
                className="px-5 py-2 text-xs font-semibold text-gray-300 bg-white/10 hover:bg-white/20 rounded-full transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={isUninstalling}
                onClick={handleConfirmUninstall}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-full transition flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
                {isUninstalling ? 'Odinstalovávám...' : 'Odinstalovat'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-4xl">check_circle</span>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">Aplikace byla odinstalována</h2>
              <p className="text-xs text-gray-400">Všechny součásti programu byly úspěšně odebrány.</p>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 rounded-full transition mt-4"
            >
              Zavřít
            </button>
          </>
        )}
      </div>
    </div>
  );
};
