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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 window-modal-overlay">
      <div className="m3-surface-main modal-card rounded-[28px] shadow-2xl w-full max-w-xl max-h-[520px] p-6 flex flex-col gap-4 text-gray-200 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-2">
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
                      onDismiss();
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
          <button
            onClick={onDismiss}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition shrink-0 cursor-pointer ml-2"
          >
            <span className="material-symbols-outlined text-lg leading-none select-none">close</span>
          </button>
        </div>

        {/* Highlights List - only the latest version items */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1 py-1">
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
        <div className="pt-2 flex items-center justify-end">
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
      </div>
    </div>
  );
};
