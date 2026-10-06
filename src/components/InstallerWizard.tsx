import React, { useState, useEffect } from 'react';
import { CURRENT_APP_VERSION, DISPLAY_APP_VERSION, IS_DEV } from '../changelog';
import appLogo from '../assets/icon.png';

interface InstallProgress {
  percent: number;
  phase: string;
  detail?: string;
}

export interface InstallerWizardProps {
  previewMode?: boolean;
  onClose?: () => void;
}

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ checked, onChange, label, description }) => {
  return (
    <label className="group flex items-center gap-3.5 p-3.5 bg-white/[0.04] hover:bg-white/[0.07] rounded-2xl cursor-pointer transition-all duration-150 border border-white/[0.04] hover:border-white/10 select-none">
      <div className="relative flex items-center justify-center shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all duration-200 ${
            checked
              ? 'bg-indigo-600 border border-indigo-500 shadow-sm shadow-indigo-600/30 text-white'
              : 'bg-white/[0.05] border border-white/20 group-hover:border-white/40 text-transparent'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[15px] font-bold leading-none transition-transform duration-150 ${
              checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}
          >
            check
          </span>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-white group-hover:text-indigo-200 transition-colors">
          {label}
        </span>
        <span className="text-xs text-gray-400">
          {description}
        </span>
      </div>
    </label>
  );
};

export const InstallerWizard: React.FC<InstallerWizardProps> = ({ previewMode = false, onClose }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [targetDir, setTargetDir] = useState<string>('');
  const [desktopShortcut, setDesktopShortcut] = useState<boolean>(true);
  const [startMenuShortcut, setStartMenuShortcut] = useState<boolean>(true);
  const [autoStart, setAutoStart] = useState<boolean>(false);
  const [runOnFinish, setRunOnFinish] = useState<boolean>(true);

  const [installProgress, setInstallProgress] = useState<InstallProgress>({
    percent: 0,
    phase: 'Příprava instalace',
    detail: '',
  });
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    // Load default install path from electron main process
    if (window.electronAPI?.installerGetDefaultPath) {
      window.electronAPI.installerGetDefaultPath().then((defaultPath: string) => {
        if (defaultPath) setTargetDir(defaultPath);
      });
    } else if (previewMode) {
      setTargetDir('C:\\Program Files\\IADonkey');
    }

    if (window.electronAPI?.onInstallerProgress) {
      const unsubscribe = window.electronAPI.onInstallerProgress((p: InstallProgress) => {
        setInstallProgress(p);
      });
      return () => unsubscribe();
    }
  }, [previewMode]);

  const handleBrowseFolder = async () => {
    if (previewMode) {
      return;
    }
    if (!window.electronAPI?.installerBrowseFolder) return;
    const selected = await window.electronAPI.installerBrowseFolder(targetDir);
    if (selected) {
      setTargetDir(selected);
    }
  };

  const handleStartInstallation = async () => {
    setStep(3);
    setInstallError(null);
    setInstallProgress({ percent: 5, phase: 'Zahajuji instalaci...', detail: 'Příprava složek' });

    if (previewMode) {
      // Simulation for preview mode without executing real install
      for (let i = 15; i <= 100; i += 15) {
        await new Promise((r) => setTimeout(r, 220));
        setInstallProgress({
          percent: i,
          phase: i < 50 ? 'Příprava a simulace souborů (náhled)' : i < 85 ? 'Kopírování součástí (náhled)' : 'Dokončování instalace (náhled)',
          detail: `Simulace kroku ${i}% (žádné systémové změny)`,
        });
      }
      setStep(4);
      return;
    }

    try {
      if (window.electronAPI?.installerPerformInstall) {
        const result = await window.electronAPI.installerPerformInstall({
          targetDir,
          createDesktopShortcut: desktopShortcut,
          createStartMenuShortcut: startMenuShortcut,
          autoStartWithWindows: autoStart,
        });

        if (result && !result.success) {
          setInstallError(result.error || 'Nastala chyba při instalaci aplikace.');
          return;
        }
      } else {
        // Fallback simulation for dev mode preview
        for (let i = 10; i <= 100; i += 15) {
          await new Promise((r) => setTimeout(r, 200));
          setInstallProgress({
            percent: i,
            phase: i < 80 ? 'Kopírování souborů' : 'Vytváření zástupců',
            detail: `Součást ${i}%`,
          });
        }
      }
      setStep(4);
    } catch (err: any) {
      console.error('[Installer] Installation error:', err);
      setInstallError(err?.message || 'Nastala neočekávaná chyba při instalaci.');
    }
  };

  const handleFinish = () => {
    if (previewMode) {
      if (onClose) onClose();
      else window.close();
      return;
    }
    if (window.electronAPI?.installerLaunchAndFinish) {
      window.electronAPI.installerLaunchAndFinish(targetDir, runOnFinish);
    } else {
      window.close();
    }
  };

  const handleMinimize = () => {
    if (previewMode) return;
    window.electronAPI?.minimizeWindow?.();
  };

  const handleClose = () => {
    if (previewMode && onClose) {
      onClose();
      return;
    }
    window.electronAPI?.closeWindow?.() || window.close();
  };

  const STEPS = [
    { num: 1, label: 'Úvod', desc: 'Vítejte v instalátoru' },
    { num: 2, label: 'Nastavení', desc: 'Umístění a předvolby' },
    { num: 3, label: 'Instalace', desc: 'Průběh kopírování' },
    { num: 4, label: 'Dokončeno', desc: 'Shrnutí a spuštění' },
  ] as const;

  return (
    <div className="installer-wizard-isolated w-full h-full bg-[#121319] text-gray-200 flex flex-col select-none overflow-hidden font-sans rounded-[28px] shadow-2xl relative">
      {/* Scoped CSS reset to guarantee pristine default Indigo colors in preview/simulation mode */}
      <style>{`
        .installer-wizard-isolated .bg-indigo-600 {
          background-color: #4f46e5 !important;
        }
        .installer-wizard-isolated .bg-indigo-500 {
          background-color: #6366f1 !important;
        }
        .installer-wizard-isolated .hover\\:bg-indigo-500:hover,
        .installer-wizard-isolated .hover\\:bg-indigo-600:hover {
          background-color: #4338ca !important;
        }
        .installer-wizard-isolated .text-indigo-400 {
          color: #818cf8 !important;
        }
        .installer-wizard-isolated .text-indigo-300 {
          color: #a5b4fc !important;
        }
        .installer-wizard-isolated .text-indigo-200 {
          color: #c7d2fe !important;
        }
        .installer-wizard-isolated .border-indigo-500,
        .installer-wizard-isolated .border-indigo-600 {
          border-color: #6366f1 !important;
        }
        .installer-wizard-isolated .bg-indigo-500\\/10,
        .installer-wizard-isolated .bg-indigo-500\\/15,
        .installer-wizard-isolated .bg-indigo-500\\/20 {
          background-color: rgba(99, 102, 241, 0.15) !important;
        }
      `}</style>

      {/* 1. TOP FULL-WIDTH HEADER WITH MINIATURE IADONKEY ICON */}
      <div
        className="h-11 w-full bg-[#121319] flex items-center justify-between px-5 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2.5">
          <img src={appLogo} alt="IADonkey" className="w-5 h-5 object-contain" />
          <span className="text-xs font-semibold text-gray-300 tracking-wide">
            {IS_DEV ? 'IADonkey [DEV] – Průvodce instalací' : 'IADonkey – Průvodce instalací'}
          </span>
          {previewMode && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold tracking-wider">
              NÁHLED / TEST
            </span>
          )}
        </div>

        {/* Window control buttons */}
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            type="button"
            onClick={handleMinimize}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            title="Minimalizovat"
          >
            <span className="material-symbols-outlined text-sm">remove</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-600 text-gray-400 hover:text-white transition cursor-pointer"
            title="Zavřít"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* 2. MIDDLE AREA (SIDEBAR + MAIN CONTENT) */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR: Branding and Steps */}
        <div className="w-72 bg-[#121319] flex flex-col justify-start p-6 flex-shrink-0 space-y-8">
          {/* Top Header in Sidebar with official IADonkey icon */}
          <div>
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <img
                  src={appLogo}
                  alt="IADonkey"
                  className="w-10 h-10 object-contain drop-shadow-md"
                />
              </div>
              <div>
                <div className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  IADonkey
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/15 px-2.5 py-0.5 rounded-full">
                    v{DISPLAY_APP_VERSION}
                  </span>
                </div>
                <p className="text-xs text-gray-400">Instalátor aplikace</p>
              </div>
            </div>
          </div>

          {/* Vertical Steps List: Current = outline primary, Completed = full primary */}
          <div className="space-y-7 py-2">
            {STEPS.map((s) => {
              const isCompleted = step > s.num;
              const isCurrent = step === s.num;

              return (
                <div key={s.num} className="relative flex items-center gap-3.5">
                  {/* Step Circle Indicator */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 flex-shrink-0 ${
                      isCompleted
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/35 font-bold shadow-sm'
                        : isCurrent
                        ? 'border-2 border-indigo-500 bg-indigo-500/15 text-indigo-300 font-bold'
                        : 'border border-white/10 bg-white/[0.03] text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-base font-bold text-indigo-300">check</span>
                    ) : (
                      s.num
                    )}
                  </div>

                  {/* Step Text Label */}
                  <div className="flex flex-col">
                    <span
                      className={`text-sm font-semibold transition-colors ${
                        isCurrent
                          ? 'text-white'
                          : isCompleted
                          ? 'text-gray-200'
                          : 'text-gray-500'
                      }`}
                    >
                      {s.label}
                    </span>
                    <span className={`text-xs leading-tight mt-0.5 ${isCurrent ? 'text-gray-400' : 'text-gray-500'}`}>
                      {s.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT MAIN CONTENT AREA - Unified background with the rest of app */}
        <div className="flex-1 bg-[#121319] p-8 overflow-y-auto space-y-6">
          {/* STEP 1: ÚVOD / VÍTEJTE */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Vítejte v instalátoru <span className="text-indigo-400">IADonkey</span>
                </h1>
                <p className="text-sm text-gray-300 leading-relaxed">
                  Váš rychlý AI asistent, inteligentní vyhledávač a rozcestník pro každodenní práci na projektech.
                </p>
              </div>

              {/* Informative feature items - Clean list without wrapping box */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-400 text-lg">auto_awesome</span>
                  Co vám IADonkey přináší:
                </p>
                <div className="grid grid-cols-1 gap-2.5 text-sm text-gray-300">
                  <div className="flex items-center gap-3 p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.04]">
                    <span className="material-symbols-outlined text-indigo-400 text-lg flex-shrink-0">search</span>
                    <span>Bleskové vyhledávání souborů, repozitářů, požadavků a nástrojů klávesou Ctrl+Alt+Space</span>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.04]">
                    <span className="material-symbols-outlined text-indigo-400 text-lg flex-shrink-0">integration_instructions</span>
                    <span>Přímá integrace s VS Code, Android Studio a GitHubem</span>
                  </div>
                  <div className="flex items-center gap-3 p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.04]">
                    <span className="material-symbols-outlined text-indigo-400 text-lg flex-shrink-0">widgets</span>
                    <span>Integrované IADonkey Tools: chytrá schránka historie kopírování, snímky obrazovky, pravítko, kapátko barev i denní plánování</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: NASTAVENÍ A UMÍSTĚNÍ */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Nastavení instalace</h2>
                <p className="text-sm text-gray-300">
                  Zvolte cílové umístění na disku a možnosti pro integraci do systému Windows.
                </p>
              </div>

              {/* Folder Picker Section */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-200 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-indigo-400">folder_open</span>
                  Cílová složka instalace
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={targetDir}
                    onChange={(e) => setTargetDir(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 rounded-full transition cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-base text-indigo-400">drive_file_move</span>
                    Procházet...
                  </button>
                </div>
              </div>

              {/* Checkboxes List with custom UI checkboxes */}
              <div className="space-y-3 pt-2">
                <p className="text-sm font-semibold text-gray-200">Zástupci a spouštění:</p>

                <CustomCheckbox
                  checked={desktopShortcut}
                  onChange={setDesktopShortcut}
                  label="Vytvořit zástupce na Ploše"
                  description="Rychlý přístup přímo z vaší pracovní plochy"
                />

                <CustomCheckbox
                  checked={startMenuShortcut}
                  onChange={setStartMenuShortcut}
                  label="Vytvořit zástupce v nabídce Start"
                  description="Snadné spuštění přes vyhledávání v systému Windows"
                />

                <CustomCheckbox
                  checked={autoStart}
                  onChange={setAutoStart}
                  label="Spouštět automaticky při startu Windows"
                  description="IADonkey bude ihned k dispozici na klávesovou zkratku"
                />
              </div>
            </div>
          )}

          {/* STEP 3: PRŮBĚH INSTALACE */}
          {step === 3 && (
            <div className="space-y-6 my-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">Probíhá instalace IADonkey</h2>
                <p className="text-sm text-indigo-300 font-medium">
                  {installProgress.phase}
                </p>
              </div>

              {/* Progress Bar Container */}
              <div className="bg-white/[0.04] border border-white/[0.04] rounded-2xl p-6 space-y-4">
                <div className="w-full bg-black/50 h-3.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out flex items-center justify-end"
                    style={{ width: `${Math.max(5, installProgress.percent)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span className="font-mono font-bold text-white text-base">{installProgress.percent} %</span>
                  <span className="truncate max-w-[340px] text-right font-mono text-xs text-gray-400">
                    {installProgress.detail || 'Zpracovávám součásti...'}
                  </span>
                </div>
              </div>

              {installError ? (
                <div className="p-4 bg-rose-500/10 rounded-2xl text-sm text-rose-300 flex items-center gap-3 border border-rose-500/20">
                  <span className="material-symbols-outlined text-rose-400 text-xl flex-shrink-0">error</span>
                  <span>{installError}</span>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center">
                  Instalátor připravuje aplikaci, vytváří systémové zástupce a konfiguruje prostředí...
                </p>
              )}
            </div>
          )}

          {/* STEP 4: DOKONČENO */}
          {step === 4 && (
            <div className="space-y-6 my-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <span className="material-symbols-outlined text-3xl font-bold">task_alt</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-white">Instalace byla úspěšně dokončena!</h2>
                  <p className="text-sm text-gray-300">
                    Aplikace IADonkey byla v pořádku nainstalována a je připravena k použití.
                  </p>
                </div>
              </div>

              {/* Run Application Checkbox Card */}
              <CustomCheckbox
                checked={runOnFinish}
                onChange={setRunOnFinish}
                label="Spustit aplikaci IADonkey nyní"
                description="Otevře vyhledávací okno a umístí ikonu do systémové lišty"
              />

              <div className="p-4 bg-white/[0.04] border border-white/[0.04] rounded-2xl text-sm text-gray-300 flex items-center gap-3">
                <span className="material-symbols-outlined text-indigo-400 text-lg flex-shrink-0">keyboard</span>
                <span>Aplikaci můžete kdykoliv vyvolat klávesovou zkratkou <kbd className="px-2.5 py-0.5 bg-white/10 rounded-full font-mono text-white text-xs">Ctrl+Alt+Space</kbd></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. FULL-WIDTH FIXED BOTTOM ACTION FOOTER */}
      <div className="h-16 w-full bg-[#121319] border-t border-white/[0.04] flex items-center justify-between px-6 flex-shrink-0">
        {/* Left side of footer: UAC indicator */}
        <div className="text-xs text-gray-400 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-base text-indigo-400">verified_user</span>
          <span>Instalace bez UAC práv</span>
        </div>

        {/* Right side of footer: Action buttons */}
        <div className="flex items-center gap-3">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition cursor-pointer"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition cursor-pointer flex items-center gap-1.5"
              >
                Další krok
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Zpět
              </button>
              <button
                type="button"
                onClick={handleStartInstallation}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-full transition cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">install_desktop</span>
                Instalovat
              </button>
            </>
          )}

          {step === 3 && (
            <>
              {installError ? (
                <button
                  type="button"
                  onClick={handleStartInstallation}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-full transition cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">refresh</span>
                  Zkusit znovu
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-6 py-2.5 text-sm font-medium text-gray-400 bg-white/5 rounded-full flex items-center gap-2 cursor-not-allowed"
                >
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  Instaluji...
                </button>
              )}
            </>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={handleFinish}
              className="px-7 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-full transition cursor-pointer flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              Dokončit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
