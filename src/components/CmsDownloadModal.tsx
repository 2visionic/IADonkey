import React, { useState, useEffect, useRef } from 'react';

interface CmsDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceName: string;
  adminUrl: string;
  targetDir: string;
  vscodeEnabled?: boolean;
}

type DownloadStatus = 'downloading' | 'purging' | 'extracting' | 'success' | 'error';

export const CmsDownloadModal: React.FC<CmsDownloadModalProps> = ({
  isOpen,
  onClose,
  instanceName,
  adminUrl,
  targetDir,
  vscodeEnabled = false,
}) => {
  const [status, setStatus] = useState<DownloadStatus>('downloading');
  const [currentStep, setCurrentStep] = useState<string>('Připojování k instanci...');
  const [percent, setPercent] = useState<number | undefined>(undefined);
  const [loadedBytes, setLoadedBytes] = useState<number | undefined>(undefined);
  const [totalBytes, setTotalBytes] = useState<number | undefined>(undefined);
  const [fileCount, setFileCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const hasStartedRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const startDownload = async () => {
    if (!adminUrl || !targetDir) {
      setStatus('error');
      setErrorMessage('Chybí adresa administrace instance nebo cílová složka.');
      return;
    }

    setStatus('downloading');
    setErrorMessage('');
    setPercent(undefined);
    setLoadedBytes(undefined);
    setTotalBytes(undefined);
    setCurrentStep('Zahajuji stahování...');
    setLogs(['[Start] Zahájení stahování CMSinFS zdrojových kódů...']);

    try {
      if (!window.electronAPI?.downloadInstanceCmsContent) {
        setStatus('error');
        setErrorMessage('Rozhraní ElectronAPI není k dispozici.');
        return;
      }

      const res = await window.electronAPI.downloadInstanceCmsContent({
        instanceName,
        adminUrl,
        targetDir,
      });

      if (res.success) {
        setStatus('success');
        setFileCount(res.fileCount ?? 0);
        setCurrentStep('Dokončeno!');
        setLogs((prev) => [...prev, `[Úspěch] Rozbaleno ${res.fileCount ?? 0} souborů do ${res.targetPath || targetDir}`]);
      } else {
        setStatus('error');
        setErrorMessage(res.error || 'Nastala neznámá chyba při stahování zdrojových kódů.');
        setLogs((prev) => [...prev, `[Chyba] ${res.error || 'Neznámá chyba'}`]);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Chyba při komunikaci se serverem.');
      setLogs((prev) => [...prev, `[Chyba] ${err?.message || 'Chyba spojení'}`]);
    }
  };

  // Subscribe to real-time progress events
  useEffect(() => {
    if (window.electronAPI?.onCmsDownloadProgress) {
      const unsubscribe = window.electronAPI.onCmsDownloadProgress((data) => {
        if (data.step === 'connecting') {
          setCurrentStep('Připojování k instanci...');
        } else if (data.step === 'downloading') {
          setCurrentStep('Stahování webového archivu ze serveru...');
          if (typeof data.percent === 'number') setPercent(data.percent);
          if (typeof data.loadedBytes === 'number') setLoadedBytes(data.loadedBytes);
          if (typeof data.totalBytes === 'number') setTotalBytes(data.totalBytes);
        } else if (data.step === 'purging') {
          setStatus('purging');
          setCurrentStep('Čištění cílové složky instance...');
        } else if (data.step === 'extracting') {
          setStatus('extracting');
          setCurrentStep('Rozbalování souborů do cílové složky...');
        } else if (data.step === 'done') {
          setCurrentStep('Dokončeno!');
        }
        if (data.log) {
          setLogs((prev) => [...prev, data.log!]);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Auto-start download on first open
  useEffect(() => {
    if (isOpen && adminUrl && targetDir && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startDownload();
    }
  }, [isOpen, adminUrl, targetDir]);

  const handleFooterClose = async () => {
    if (window.electronAPI?.closeAndResetSpotlight) {
      await window.electronAPI.closeAndResetSpotlight();
    } else {
      onClose();
    }
  };

  const handleOpenInExplorer = () => {
    if (targetDir && window.electronAPI?.openPath) {
      window.electronAPI.openPath(targetDir);
    }
  };

  // Keyboard shortcut: Escape to close, Enter on success to open in Explorer, close and reset spotlight
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (status === 'success') {
          e.preventDefault();
          handleOpenInExplorer();
          handleFooterClose();
        } else if (status === 'error') {
          e.preventDefault();
          startDownload();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, onClose, targetDir]);

  const handleOpenInVscode = async () => {
    if (targetDir && window.electronAPI?.openInVscode) {
      if (window.electronAPI?.closeCmsDownloadWindow) {
        await window.electronAPI.openInVscode(targetDir);
        await window.electronAPI.closeCmsDownloadWindow(false);
      } else {
        await window.electronAPI?.resetAndHideSpotlight?.();
        await window.electronAPI.openInVscode(targetDir);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <main className="w-full h-full m3-surface-main rounded-none flex flex-col justify-between text-gray-200 select-none overflow-hidden font-sans">
      {/* Header - Native titlebar has close button, so no duplicate [X] here */}
      <div className="p-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
            <span className="material-symbols-outlined text-xl">folder_zip</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white text-base">Stažení CMSinFS zdrojáků</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 font-medium">
                CMSinFS
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate max-w-[480px]">
              Instance: <span className="font-medium text-gray-200">{instanceName || 'Neznámá instance'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Body Content - no page scrollbar, generous space for protocol with safe zone */}
      <div className="flex-1 px-6 pt-2 pb-5 flex flex-col gap-3.5 min-h-0 overflow-hidden">
        {/* Target directory info card */}
        <div className="bg-white/[0.03] rounded-2xl p-4 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
            <span className="flex items-center gap-1.5 text-gray-300">
              <span className="material-symbols-outlined text-[15px] text-purple-400">folder_open</span>
              Cílová složka instance:
            </span>
            <span className="text-[11px] text-gray-500">Čistý přepis složky</span>
          </div>
          <div className="font-mono text-[12px] text-gray-200 bg-black/40 px-3.5 py-2 rounded-xl break-all select-all">
            {targetDir || 'Není zadána cílová složka'}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-0.5">
            <span className="material-symbols-outlined text-[13px] text-purple-400">info</span>
            <span>Před rozbalením se složka instance kompletně vyčistí – nezůstanou v ní staré soubory.</span>
          </div>
        </div>

        {/* Status / Progress view */}
        {(status === 'downloading' || status === 'purging' || status === 'extracting') && (
          <div className="bg-white/[0.03] rounded-2xl p-4 space-y-3 text-center shrink-0">
            {/* SVG rotating ring spinner with STATIC upright icon inside */}
            <div className="relative w-11 h-11 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
              <svg className="animate-spin w-11 h-11 text-purple-400 absolute inset-0" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="21" stroke="currentColor" strokeWidth="1" className="opacity-20" />
                <circle
                  cx="22"
                  cy="22"
                  r="21"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeDasharray="36 96"
                  strokeLinecap="round"
                  className="opacity-90"
                />
              </svg>
              <span className="material-symbols-outlined text-lg text-purple-400 select-none">download</span>
            </div>

            <div>
              <h3 className="font-medium text-white text-sm">{currentStep}</h3>
              {loadedBytes !== undefined && (
                <p className="text-xs font-mono text-gray-400 mt-0.5">
                  {totalBytes
                    ? `${(loadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
                    : `${(loadedBytes / 1024 / 1024).toFixed(1)} MB staženo`}
                </p>
              )}
            </div>

            {/* Progress bar */}
            {percent !== undefined ? (
              <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-200 rounded-full"
                  style={{ width: `${percent}%` }}
                />
              </div>
            ) : (
              <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div className="h-full w-1/3 bg-purple-600/80 rounded-full animate-[indeterminate_1.5s_infinite_linear]" />
              </div>
            )}

            {/* Steps indicator */}
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className={`p-1.5 rounded-full text-center font-medium ${status === 'downloading' ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/15 text-emerald-400'}`}>
                1. Stažení ZIP
              </div>
              <div className={`p-1.5 rounded-full text-center font-medium ${status === 'purging' ? 'bg-purple-500/20 text-purple-300' : status === 'extracting' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.03] text-gray-500'}`}>
                2. Čištění složky
              </div>
              <div className={`p-1.5 rounded-full text-center font-medium ${status === 'extracting' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.03] text-gray-500'}`}>
                3. Rozbalení
              </div>
            </div>
          </div>
        )}

        {/* Success View */}
        {status === 'success' && (
          <div className="bg-emerald-500/10 rounded-2xl p-4 text-center space-y-2.5 shrink-0">
            <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">check_circle</span>
            </div>
            <div>
              <h3 className="font-semibold text-white text-base">CMSinFS zdrojáky úspěšně staženy!</h3>
              <p className="text-xs text-gray-300 mt-1">
                V cílové složce bylo úspěšně rozbaleno celkem <strong className="text-emerald-300 font-mono">{fileCount} souborů</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Error View */}
        {status === 'error' && (
          <div className="bg-rose-500/10 rounded-2xl p-3.5 text-center space-y-2 shrink-0">
            <div className="w-11 h-11 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">error</span>
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Chyba při stahování</h3>
              <p className="text-xs text-rose-300 mt-1 leading-relaxed break-words font-mono">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Console / Log box - takes full remaining height with bottom safe zone */}
        <div className="flex-1 flex flex-col min-h-0 space-y-1.5 pb-1">
          <div className="text-[11px] font-medium text-gray-400">Protokol operace:</div>
          <div
            ref={logContainerRef}
            className="flex-1 min-h-[85px] overflow-y-auto bg-black/40 rounded-2xl p-3.5 font-mono text-[11px] text-gray-300 space-y-0.5 leading-tight select-text"
          >
            {logs.map((log, idx) => (
              <div key={idx} className="whitespace-pre-wrap">{log}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 flex items-center justify-between gap-3 shrink-0">
        {status === 'success' ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenInExplorer}
                className="px-4 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 transition cursor-pointer bg-white/[0.08] hover:bg-white/[0.14] text-white"
              >
                <span className="material-symbols-outlined text-base text-purple-400">folder</span>
                <span>Otevřít v Průzkumníku</span>
              </button>
              {vscodeEnabled && (
                <button
                  type="button"
                  onClick={handleOpenInVscode}
                  className="px-4 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 rounded-full text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">code</span>
                  <span>Otevřít ve VS Code</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handleFooterClose}
              className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
              title="Zavřít okno (Enter / Esc)"
            >
              <span>Zavřít</span>
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
                Enter
              </kbd>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-full text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
              title="Zrušit a zavřít okno (Esc)"
            >
              <span>Zrušit</span>
              <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
                Esc
              </kbd>
            </button>

            {status === 'error' ? (
              <button
                type="button"
                onClick={startDownload}
                className="m3-actions-pill bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white px-5 py-2.5 rounded-full text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-md"
                title="Zkusit znovu (Enter)"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Zkusit znovu</span>
                <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-black/30 text-white/90 rounded-full font-mono text-[9px] leading-none select-none">
                  Enter
                </kbd>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-300 font-mono">
                <span className="material-symbols-outlined text-sm animate-spin text-white">
                  progress_activity
                </span>
                <span>Stahuji CMSinFS...</span>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
};
