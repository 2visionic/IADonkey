import React from 'react';
import { CURRENT_APP_VERSION, DISPLAY_APP_VERSION, IS_DEV } from '../changelog';
import appLogo from '../assets/icon.png';

export const SplashScreen: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-transparent p-9 flex items-center justify-center select-none overflow-hidden font-sans">
      <div
        className="w-full h-full m3-surface-main text-gray-200 rounded-[20px] flex flex-col items-start justify-between p-8 relative outline-none border-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div>
          {/* Large icon */}
          <img
            src={appLogo}
            alt="IADonkey"
            className="w-[60px] h-[60px] object-contain mb-4 drop-shadow-xl"
          />

          {/* Title & Version */}
          <div className="flex items-center gap-2.5 mb-1">
            <span className="font-extrabold text-[26px] text-white tracking-tight leading-tight">
              IADonkey
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono tracking-wider whitespace-nowrap shrink-0 ${
                IS_DEV
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-indigo-500/20 text-indigo-300'
              }`}
            >
              v{DISPLAY_APP_VERSION}
            </span>
          </div>
        </div>

        {/* Space */}
        <div className="flex-1 min-h-[14px]" />

        {/* Brief description */}
        <p className="text-[12px] text-gray-400 leading-relaxed mb-8">
          Rychlý a inteligentní spouštěč pro vaše každodenní úkoly a produktivitu. Sjednocuje vyhledávání, pracovní nástroje a automatizaci do jednoho přehledného prostředí.
        </p>

        {/* Bottom footer */}
        <div className="flex items-center justify-between w-full text-[11px] text-gray-500">
          <div>© 2026 Petr Coolhanek</div>
          <div className="flex items-center gap-1.5 text-indigo-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span>Spouštění...</span>
          </div>
        </div>
      </div>
    </div>
  );
};
