import React, { useEffect } from 'react';
import { VersionEntry } from '../changelog';

interface WhatsNewModalProps {
  release: VersionEntry;
  onDismiss: () => void;
  onOpenFullChangelog?: () => void;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  release,
  onDismiss,
  onOpenFullChangelog,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <main className="w-full h-full bg-[#14151b] p-6 flex flex-col justify-between gap-4 text-gray-200 select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full m3-primary-badge flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-2xl select-none leading-none">auto_awesome</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white whitespace-nowrap tracking-tight">Co je nového</h3>
              <button
                type="button"
                onClick={() => {
                  if (onOpenFullChangelog) {
                    onOpenFullChangelog();
                  }
                }}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium font-mono bg-white/[0.06] text-gray-300 transition shrink-0 shadow-sm ${
                  onOpenFullChangelog ? 'hover:bg-white/[0.12] hover:text-white cursor-pointer' : ''
                }`}
                title={onOpenFullChangelog ? 'Zobrazit kompletní historii verzí (Changelog)' : undefined}
              >
                v{release.version}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{release.title}</p>
          </div>
        </div>
      </div>

      {/* Highlights List - only the latest version items */}
      <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 py-1">
        {release.highlights.map((item, idx) => (
          <div
            key={idx}
            className="m3-item-card flex items-start gap-3 p-3 rounded-2xl"
          >
            <span className="material-symbols-outlined m3-primary-text text-base mt-0.5 shrink-0">
              check_circle
            </span>
            <span className="text-xs text-gray-200 leading-relaxed font-normal">
              {item}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-1 flex items-center justify-end shrink-0">
        <button
          onClick={onDismiss}
          className="px-6 py-2.5 text-xs font-semibold text-gray-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] rounded-full transition cursor-pointer shadow-sm flex items-center gap-1.5"
          title="Rozumím a zavřít okno (Esc)"
        >
          <span>Rozumím</span>
          <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
            Esc
          </kbd>
        </button>
      </div>
    </main>
  );
};
