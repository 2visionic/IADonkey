import React, { useState, useEffect } from 'react';
import { UpdateInfo, DownloadProgress } from '../types';

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onAccept?: () => void;
  onDecline: () => void;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  updateInfo,
  onDecline,
}) => {
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'completed' | 'error'>(() => {
    return updateInfo.isSimulated ? 'downloading' : 'idle';
  });
  const [progress, setProgress] = useState<DownloadProgress>({ percent: 0, transferred: 0, total: 0 });
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDecline();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onUpdateDownloadProgress && !updateInfo.isSimulated) {
      unsubscribe = window.electronAPI.onUpdateDownloadProgress((p: DownloadProgress) => {
        setProgress(p);
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (unsubscribe) unsubscribe();
    };
  }, [onDecline, updateInfo.isSimulated]);

  // Simulation mode: fake download progress over ~2 seconds
  useEffect(() => {
    if (!updateInfo.isSimulated || downloadState !== 'downloading') return;

    let currentPercent = 0;
    const totalBytes = 28.5 * 1024 * 1024; // ~28.5 MB package
    setProgress({ percent: 0, transferred: 0, total: totalBytes });

    const interval = setInterval(() => {
      currentPercent += Math.floor(Math.random() * 8) + 14;
      if (currentPercent >= 100) {
        currentPercent = 100;
        clearInterval(interval);
        setProgress({ percent: 100, transferred: totalBytes, total: totalBytes });
        setTimeout(() => {
          setDownloadedPath('simulated_update_package.exe');
          setDownloadState('completed');
        }, 500);
      } else {
        const transferred = Math.round((currentPercent / 100) * totalBytes);
        setProgress({ percent: currentPercent, transferred, total: totalBytes });
      }
    }, 280);

    return () => clearInterval(interval);
  }, [updateInfo.isSimulated, downloadState]);

  const handleStartDownload = async () => {
    if (updateInfo.isSimulated) {
      setDownloadState('downloading');
      return;
    }

    if (!updateInfo.downloadUrl) {
      setErrorMessage('Není k dispozici platná adresa ke stažení aktualizace.');
      setDownloadState('error');
      return;
    }

    if (!window.electronAPI?.downloadUpdate) {
      window.electronAPI?.openExternal?.(updateInfo.downloadUrl);
      return;
    }

    setDownloadState('downloading');
    setErrorMessage(null);

    try {
      const filePath = await window.electronAPI.downloadUpdate(updateInfo.downloadUrl);
      setDownloadedPath(filePath);
      setDownloadState('completed');
    } catch (err: any) {
      console.error('[UpdateDialog] Download error:', err);
      setErrorMessage(err?.message || 'Nastala neočekávaná chyba při stahování souboru.');
      setDownloadState('error');
    }
  };

  const handleInstallAndRestart = () => {
    if (updateInfo.isSimulated) {
      onDecline();
      return;
    }
    if (downloadedPath && window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate(downloadedPath);
    }
  };

  const handleFallbackBrowser = () => {
    if (updateInfo.isSimulated) {
      onDecline();
      return;
    }
    if (updateInfo.downloadUrl && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(updateInfo.downloadUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 window-modal-overlay">
      <div className="m3-surface-main modal-card rounded-[28px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 text-gray-200 select-none">
        
        {/* Header section based on state */}
        {downloadState === 'completed' ? (
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-sm">
              <span className="material-symbols-outlined text-3xl">task_alt</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Aktualizace připravena!</h3>
              <p className="text-xs text-emerald-300">
                Verze <span className="font-mono font-bold text-white">{updateInfo.latestVersion}</span> je připravena k instalaci
              </p>
            </div>
          </div>
        ) : downloadState === 'downloading' ? (
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full m3-primary-badge flex items-center justify-center animate-pulse shadow-sm">
              <span className="material-symbols-outlined text-3xl">
                {progress.percent >= 90 ? 'inventory_2' : 'cloud_download'}
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {progress.percent >= 90 ? 'Příprava aktualizace...' : 'Stahování aktualizace...'}
              </h3>
              <p className="text-xs m3-primary-text">
                Verze <span className="font-mono font-bold text-white">{updateInfo.latestVersion}</span>
              </p>
            </div>
          </div>
        ) : downloadState === 'error' ? (
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 shadow-sm">
              <span className="material-symbols-outlined text-3xl">error</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Chyba při stahování</h3>
              <p className="text-xs text-rose-300">Nepodařilo se stáhnout novou verzi</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full m3-primary-badge flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-3xl">upgrade</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">K dispozici je nová verze!</h3>
              <p className="text-xs m3-primary-text">
                Verze <span className="font-mono font-bold text-white">{updateInfo.latestVersion}</span> (aktuální: {updateInfo.currentVersion})
              </p>
            </div>
          </div>
        )}

        {/* Content body based on state */}
        {downloadState === 'idle' && (
          <>
            {updateInfo.releaseNotes && (
              <div className="p-4 bg-white/[0.03] rounded-2xl max-h-40 overflow-y-auto text-xs text-gray-300 space-y-1 shadow-inner">
                <p className="font-semibold text-gray-400">Co je nového:</p>
                <p className="whitespace-pre-line leading-relaxed">{updateInfo.releaseNotes}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 leading-relaxed">
              Chcete nyní stáhnout a nainstalovat aktualizaci přímo v aplikaci? V případě odložení vám aktualizaci znovu nabídneme za 24 hodin.
            </p>
          </>
        )}

        {downloadState === 'downloading' && (
          <div className="space-y-3 py-2">
            <div className="w-full bg-black/40 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div
                className="h-full m3-primary-pill rounded-full transition-all duration-300 ease-out flex items-center justify-end"
                style={{ width: `${Math.max(5, progress.percent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono font-bold text-white">{progress.percent} %</span>
              <span className="text-gray-400 font-mono">
                {progress.percent >= 90
                  ? 'Rozbalování souborů...'
                  : progress.total > 0
                  ? `${(progress.transferred / (1024 * 1024)).toFixed(1)} MB / ${(progress.total / (1024 * 1024)).toFixed(1)} MB`
                  : `${(progress.transferred / (1024 * 1024)).toFixed(1)} MB`}
              </span>
            </div>
            <p className="text-xs text-gray-400 text-center">
              {progress.percent >= 90
                ? 'Připravuji a rozbaluji aktualizaci na pozadí...'
                : 'Stahování probíhá přímo v aplikaci, prosím chvíli vyčkejte...'}
            </p>
          </div>
        )}

        {downloadState === 'completed' && (
          <div className="space-y-2 py-2">
            <p className="text-xs text-gray-300 leading-relaxed">
              Balíček byl úspěšně připraven. Kliknutím na tlačítko níže dojde k okamžitému bleskovému restartu do nové verze.
            </p>
          </div>
        )}

        {downloadState === 'error' && (
          <div className="space-y-2 py-1">
            <p className="text-xs text-rose-300 bg-rose-500/15 p-3 rounded-2xl shadow-sm">
              {errorMessage}
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Můžete stahování zkusit znovu, nebo soubor stáhnout přímo přes váš webový prohlížeč.
            </p>
          </div>
        )}

        {/* Footer actions based on state */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          {downloadState === 'idle' && (
            <>
              <button
                type="button"
                onClick={onDecline}
                className="px-5 py-2.5 text-xs font-semibold text-gray-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] rounded-full transition shadow-sm cursor-pointer"
              >
                Připomenout za 24h
              </button>
              <button
                type="button"
                onClick={handleStartDownload}
                className="m3-primary-pill flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold rounded-full transition shadow-md cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Aktualizovat nyní
              </button>
            </>
          )}

          {downloadState === 'downloading' && (
            <button
              type="button"
              onClick={handleFallbackBrowser}
              className="px-4 py-2 text-xs text-gray-400 hover:text-white transition rounded-full hover:bg-white/[0.06] cursor-pointer"
            >
              Stáhnout v prohlížeči místo toho
            </button>
          )}

          {downloadState === 'completed' && (
            <button
              type="button"
              onClick={handleInstallAndRestart}
              className="w-full flex items-center justify-center gap-1.5 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-full transition shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">restart_alt</span>
              Restartovat a spustit novou verzi
            </button>
          )}

          {downloadState === 'error' && (
            <>
              <button
                type="button"
                onClick={() => setDownloadState('idle')}
                className="px-5 py-2.5 text-xs font-semibold text-gray-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] rounded-full transition shadow-sm cursor-pointer"
              >
                Zpět
              </button>
              <button
                type="button"
                onClick={handleFallbackBrowser}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-white/[0.08] hover:bg-white/[0.14] rounded-full transition shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">open_in_browser</span>
                Stáhnout v prohlížeči
              </button>
              <button
                type="button"
                onClick={handleStartDownload}
                className="m3-primary-pill flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold rounded-full transition shadow-md cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Zkusit znovu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

