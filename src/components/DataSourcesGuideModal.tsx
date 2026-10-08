// POZNÁMKA PRO VÝVOJÁŘE: Jakmile dojde k rozšíření JSON modelu (LauncherItem, DataSource nebo LauncherAction),
// je NUTNÉ aktualizovat tento průvodce "Jak na zdroje dat" (DataSourcesGuideModal.tsx)!

import React, { useState, useEffect, useRef } from 'react';

interface DataSourcesGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  magicGateEnabled?: boolean;
  githubEnabled?: boolean;
}

type GuideTab = 'schema' | 'actions' | 'snippets' | 'magicgate';

export const DataSourcesGuideModal: React.FC<DataSourcesGuideModalProps> = ({
  isOpen,
  onClose,
  magicGateEnabled = true,
  githubEnabled = true,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('schema');
  const [copiedSnippetId, setCopiedSnippetId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scrollbar when switching tabs
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopySnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippetId(id);
    setTimeout(() => {
      setCopiedSnippetId(null);
    }, 2000);
  };

  const SNIPPET_BASIC = `[
  {
    "id": "docs-react",
    "name": "React Dokumentace",
    "location": "https://react.dev",
    "action": "open",
    "icon": "public",
    "image": "{favicon}",
    "priority": 10,
    "shortcuts": ["react", "reactjs", "docs"]
  }
]`;

  const SNIPPET_ADVANCED = `{
  "id": "project-portal",
  "name": "Firemní portál",
  "location": "https://portal.company.cz",
  "action": "open",
  "icon": "language",
  "image": "{favicon}",
  "priority": 5,
  "shortcuts": ["portal", "intranet"],
  "info": {
    "Prostředí": "Produkce",
    "Verze": "2.4.1",
    "Správce": "Jan Novák",
    "Server": "web-prod-01"
  },
  "actions": [
    {
      "name": "Otevřít dokumentaci API",
      "action": "open",
      "location": "https://portal.company.cz/api/docs",
      "icon": "api"
    },
    {
      "name": "Zkopírovat produkční URL",
      "action": "copy",
      "location": "https://portal.company.cz",
      "icon": "content_copy"
    }
  ],
  "options": [
    {
      "id": "portal-stage",
      "name": "Staging prostředí",
      "location": "https://stage.portal.company.cz",
      "action": "open",
      "icon": "science"
    },
    {
      "id": "portal-admin",
      "name": "Administrace",
      "location": "https://portal.company.cz/admin",
      "action": "open",
      "icon": "admin_panel_settings"
    }
  ]
}`;

  const SNIPPET_GIT = `{
  "id": "repo-frontend",
  "name": "frontend-app",
  "location": "https://github.com/company/frontend-app",
  "action": "open",
  "icon": "code",
  "settings": "git",
  "priority": 15,
  "shortcuts": ["fe", "react", "app"],
  "info": {
    "Větev": "main",
    "Typ": "TypeScript / React",
    "Organizace": "company"
  }
}`;

  const SNIPPET_MAGICGATE = `{
  "id": "instance-production",
  "name": "IS Tour - Produkce",
  "location": "https://app.company.cz/admin",
  "action": "open",
  "icon": "security",
  "settings": "magicgate",
  "priority": 20,
  "info": {
    "Server": "SRV-PRD-01",
    "Instance": "Produkce",
    "DB Server": "SQL-PROD-01",
    "Požadavek": "R54201"
  },
  "options": [
    {
      "name": "Web",
      "location": "https://app.company.cz",
      "action": "open",
      "image": "{favicon}"
    },
    {
      "name": "API",
      "location": "https://app.company.cz/api",
      "action": "open",
      "image": "{favicon}"
    }
  ]
}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 window-modal-overlay">
      <div className="m3-surface-main modal-card rounded-[28px] w-full max-w-4xl h-[calc(100%-40px)] max-h-[calc(100%-40px)] p-6 shadow-2xl flex flex-col gap-4 text-gray-200 animate-in fade-in zoom-in-95 duration-150 select-none">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-1 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-2xl">menu_book</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Jak na zdroje dat</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-indigo-500/20 text-indigo-300">
                  JSON Model & API
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Kompletní specifikace podporovaných atributů, akcí, subpoložek a příkladů pro IADonkey.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer self-center shrink-0 flex items-center justify-center"
            title="Zavřít (Esc)"
          >
            <span className="material-symbols-outlined text-lg leading-none select-none">close</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'schema'
                ? 'm3-primary-pill text-white shadow-sm'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-base">data_object</span>
            <span>Struktura a atributy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'actions'
                ? 'm3-primary-pill text-white shadow-sm'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-base">bolt</span>
            <span>Podporované akce</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('snippets')}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'snippets'
                ? 'm3-primary-pill text-white shadow-sm'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-base">content_copy</span>
            <span>Kopírovatelné ukázky (JSON)</span>
          </button>

          {magicGateEnabled && (
            <button
              type="button"
              onClick={() => setActiveTab('magicgate')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'magicgate'
                  ? 'bg-amber-400 text-gray-950 font-bold shadow-sm'
                  : 'bg-amber-500/10 text-amber-300 hover:text-white hover:bg-amber-500/20'
              }`}
            >
              <span className="material-symbols-outlined text-base">security</span>
              <span>MagicGate XML Model</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div ref={contentRef} className="flex-1 overflow-y-auto pr-1 space-y-4 text-xs select-text">

          {/* TAB 1: SCHEMA */}
          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div className="p-4 bg-white/[0.03] rounded-2xl text-gray-300 leading-relaxed">
                Každý datový zdroj (místní JSON soubor nebo REST API) vrací pole objektů položek <code className="text-indigo-300 font-mono">[ &#123; ... &#125; ]</code> nebo objekt s polem pod klíčem <code className="text-indigo-300 font-mono">data</code>, <code className="text-indigo-300 font-mono">items</code> či <code className="text-indigo-300 font-mono">results</code>.
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-indigo-400 text-base">tune</span>
                  Atributy položky (LauncherItem)
                </h4>

                <div className="divide-y divide-white/5 rounded-2xl bg-white/[0.02] overflow-hidden">
                  
                  {/* name */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold flex items-center gap-1.5">
                      <span>name</span>
                      <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full font-sans font-semibold uppercase tracking-wider">povinné</span>
                    </div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Zobrazovaný název položky</span>. Hlavní textový titulek ve vyhledávači, podle kterého se primárně filtruje.
                    </div>
                  </div>

                  {/* location */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">location</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Cílová hodnota, adresa nebo cesta</span>. Může to být webová adresa (<code className="font-mono text-gray-200">https://...</code>), lokální cesta (<code className="font-mono text-gray-200">C:\...</code>) nebo text ke zkopírování.
                    </div>
                  </div>

                  {/* action */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">action</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Výchozí chování po stisku Enter</span>. Možné hodnoty: <code className="font-mono text-indigo-200">"open"</code> (otevřít URL/soubor), <code className="font-mono text-indigo-200">"copy"</code> / <code className="font-mono text-indigo-200">"snippet"</code> (zkopírovat do schránky){githubEnabled ? <>, <code className="font-mono text-emerald-400">"clone"</code> (Git klonování), <code className="font-mono text-emerald-400">"clonerecursive"</code></> : null}. Výchozí je <code className="font-mono text-gray-200">"open"</code>.
                    </div>
                  </div>

                  {/* icon */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">icon</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Název Google Material ikony</span>. Např. <code className="font-mono text-gray-200">"public"</code>, <code className="font-mono text-gray-200">"terminal"</code>, <code className="font-mono text-gray-200">"folder"</code>, <code className="font-mono text-gray-200">"database"</code>, <code className="font-mono text-gray-200">"api"</code>, <code className="font-mono text-gray-200">"code"</code>, <code className="font-mono text-gray-200">"settings"</code>. Výchozí je <code className="font-mono text-gray-200">"code"</code>.
                    </div>
                  </div>

                  {/* image */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">image</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">URL adresa obrázku nebo loga</span>. Pokud zadáte hodnotu <code className="font-mono text-emerald-300 font-bold">"&#123;favicon&#125;"</code>, IADonkey automaticky stáhne a uloží favikonu z domény uvedené v <code className="font-mono text-gray-200">location</code>.
                    </div>
                  </div>

                  {/* priority */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">priority</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Priorita řazení</span> (číslo, výchozí 0). Položky s vyšší prioritou se při rovnosti vyhledávací relevance zobrazují na vyšších pozicích.
                    </div>
                  </div>

                  {/* settings */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">settings</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Systémové napojení</span>:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-400">
                        {githubEnabled && (
                          <li><code className="font-mono text-emerald-400">"git"</code> — zapojí automatické Git akce (Klonovat repozitář, Otevřít na GitHubu).</li>
                        )}
                        {magicGateEnabled && (
                          <li><code className="font-mono text-amber-300">"magicgate"</code> — aktivuje tiché přihlašování přes MagicGate a stahování sekcí instance.</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* options */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">options</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Pole vnořených subpoložek</span>. Do subpoložek se vstupuje stiskem <kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-gray-200">Alt + Enter</kbd>. Lze také okamžitě spustit 1. subpoložku přes <kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-gray-200">Ctrl + Enter</kbd>. Subpoložky mají stejnou strukturu <code className="font-mono text-indigo-300">LauncherItem</code> a mohou se dále rekurzivně větvit.
                    </div>
                  </div>

                  {/* actions */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">actions</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Doplňkové akce položky</span> nabízené v menu akcí (<kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-gray-200">Shift + Enter</kbd>). Každá akce obsahuje <code className="font-mono text-gray-200">name</code>, <code className="font-mono text-gray-200">action</code>, volitelnou vlastní <code className="font-mono text-gray-200">location</code> a <code className="font-mono text-gray-200">icon</code>.
                    </div>
                  </div>

                  {/* info */}
                  <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">info</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Klíč-hodnota metadata</span> (<code className="font-mono text-gray-200">&#123; "Klíč": "Hodnota" &#125;</code>). Zobrazují se v přehledném informačním panelu nad akcemi v detailu položky (např. Server, Databáze, Verze, Zodpovědná osoba).
                    </div>
                  </div>

                  {/* shortcuts */}
                  <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">shortcuts</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Alternativní klíčová slova</span> (<code className="font-mono text-gray-200">["alias1", "alias2"]</code>). Umožňují rychlé dohledání položky i podle zkratek nebo synonym.
                    </div>
                  </div>

                  {/* wizard */}
                  <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="font-mono text-indigo-300 font-semibold">wizard</div>
                    <div className="md:col-span-3 text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">Definice vícekrokového průvodce (Stepper)</span> (<code className="font-mono text-gray-200">&#123; "action": "createfeedback", "steps": [...] &#125;</code>). Po výběru položky se spustí formulářový průvodce s kroky (textový vstup, výběrový seznam <code className="font-mono text-gray-200">options</code> nebo dynamické možnosti <code className="font-mono text-gray-200">dynamicOption: "clipboard"</code>), validací a následným spuštěním navázané akce.
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ACTIONS */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              <div className="p-4 bg-white/[0.03] rounded-2xl text-gray-300 leading-relaxed">
                Akce definují, co se stane při stisku klávesy <kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-gray-200">Enter</kbd> na položce nebo při výběru v menu akcí <kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-gray-200">Shift + Enter</kbd>.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* open */}
                <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300 text-sm">"open"</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold uppercase tracking-wider">Výchozí</span>
                  </div>
                  <p className="text-gray-300 leading-relaxed">
                    Otevře webovou stránku ve výchozím prohlížeči, spustí lokální program (<code className="font-mono text-gray-200">.exe</code>), nebo otevře složku v Průzkumníku souborů Windows.
                  </p>
                </div>

                {/* copy */}
                <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300 text-sm">"copy" / "snippet"</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">Schránka</span>
                  </div>
                  <p className="text-gray-300 leading-relaxed">
                    Zkopíruje hodnotu z <code className="font-mono text-gray-200">location</code> do schránky (clipboardu) a zobrazí notifikaci o zkopírování.
                  </p>
                </div>

                {githubEnabled && (
                  <>
                    {/* clone */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-emerald-400 text-sm">"clone"</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">Git</span>
                      </div>
                      <p className="text-gray-300 leading-relaxed">
                        Otevře samostatné okno pro klonování Git repozitáře s výběrem cílové složky a možností volby rekurze.
                      </p>
                    </div>

                    {/* clonerecursive */}
                    <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-emerald-400 text-sm">"clonerecursive"</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider">Git</span>
                      </div>
                      <p className="text-gray-300 leading-relaxed">
                        Otevře okno klonování s předvybraným zaškrtávátkem pro rekurzivní stažení submodulů (<code className="font-mono text-gray-200">git clone --recursive</code>).
                      </p>
                    </div>
                  </>
                )}

                {magicGateEnabled && (
                  <>
                    {/* mgclone */}
                    <div className="p-4 bg-amber-500/10 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-300 text-sm">"mgclone"</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase tracking-wider">MagicGate</span>
                      </div>
                      <p className="text-gray-300 leading-relaxed">
                        Získá seznam repozitářů sekcí instance přes Administraci a otevře hromadné klonování všech sekcí.
                      </p>
                    </div>

                    {/* mgclonerecursive */}
                    <div className="p-4 bg-amber-500/10 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-300 text-sm">"mgclonerecursive"</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase tracking-wider">MagicGate</span>
                      </div>
                      <p className="text-gray-300 leading-relaxed">
                        Hromadně stáhne všechny repozitáře sekcí vybrané instance včetně rekurzivních submodulů.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SNIPPETS */}
          {activeTab === 'snippets' && (
            <div className="space-y-4">
              {/* Snippet 1 */}
              <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs">1. Základní webový odkaz s favikonou</h5>
                    <p className="text-gray-400 text-[11px]">Rychlá položka s automatickým stažením ikony webu.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet('basic', SNIPPET_BASIC)}
                    className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copiedSnippetId === 'basic' ? 'check' : 'content_copy'}
                    </span>
                    <span>{copiedSnippetId === 'basic' ? 'Zkopírováno!' : 'Kopírovat snippet'}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-black/40 rounded-xl font-mono text-[11px] text-gray-300 overflow-x-auto">
                  {SNIPPET_BASIC}
                </pre>
              </div>

              {/* Snippet 2 */}
              <div className="p-4 bg-white/[0.03] rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs">2. Pokročilá položka: Subpoložky, Akce a Metadata</h5>
                    <p className="text-gray-400 text-[11px]">Využívá Alt+Enter subpoložky, Shift+Enter akce a informační panel.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySnippet('advanced', SNIPPET_ADVANCED)}
                    className="px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copiedSnippetId === 'advanced' ? 'check' : 'content_copy'}
                    </span>
                    <span>{copiedSnippetId === 'advanced' ? 'Zkopírováno!' : 'Kopírovat snippet'}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-black/40 rounded-xl font-mono text-[11px] text-gray-300 overflow-x-auto">
                  {SNIPPET_ADVANCED}
                </pre>
              </div>

              {/* Snippet 3 */}
              {githubEnabled && (
                <div className="p-4 bg-emerald-500/10 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-emerald-300 text-xs">3. Git repozitář se systémovou integrací</h5>
                      <p className="text-gray-400 text-[11px]">Díky "settings": "git" automaticky získá akce pro klonování i otevření na GitHubu.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySnippet('git', SNIPPET_GIT)}
                      className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copiedSnippetId === 'git' ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedSnippetId === 'git' ? 'Zkopírováno!' : 'Kopírovat snippet'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 bg-black/40 rounded-xl font-mono text-[11px] text-gray-300 overflow-x-auto">
                    {SNIPPET_GIT}
                  </pre>
                </div>
              )}

              {/* Snippet 4: MagicGate */}
              {magicGateEnabled && (
                <div className="p-4 bg-amber-500/10 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-amber-300 text-xs">4. MagicGate instance se systémovým přihlášením</h5>
                      <p className="text-gray-400 text-[11px]">S "settings": "magicgate" se provede automatické tiché přihlášení do IS Tour.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopySnippet('magicgate', SNIPPET_MAGICGATE)}
                      className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-full font-medium transition flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {copiedSnippetId === 'magicgate' ? 'check' : 'content_copy'}
                      </span>
                      <span>{copiedSnippetId === 'magicgate' ? 'Zkopírováno!' : 'Kopírovat snippet'}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 bg-black/40 rounded-xl font-mono text-[11px] text-gray-300 overflow-x-auto">
                    {SNIPPET_MAGICGATE}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MAGICGATE MODEL */}
          {magicGateEnabled && activeTab === 'magicgate' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-200 leading-relaxed">
                Rozšíření MagicGate automaticky načítá konfigurace serverů a instancí z XML deploy souboru. Níže je popsáno, jak se XML struktura transformuje do výsledných položek IADonkey.
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-400 text-base">account_tree</span>
                  Mapování XML elementů
                </h4>

                <div className="space-y-2">
                  <div className="p-3.5 bg-white/[0.03] rounded-2xl space-y-1">
                    <span className="font-semibold text-white">1. Server & Instance</span>
                    <p className="text-gray-400 leading-relaxed">
                      Značky <code className="font-mono text-gray-300">&lt;Server Name="..."&gt;</code> a <code className="font-mono text-gray-300">&lt;Instance Name="..."&gt;</code>. Servery i instance obsahující v názvu slovo <em>bench</em> jsou automaticky vynechány.
                    </p>
                  </div>

                  <div className="p-3.5 bg-white/[0.03] rounded-2xl space-y-1">
                    <span className="font-semibold text-white">2. Aplikace a Subpoložky</span>
                    <p className="text-gray-400 leading-relaxed">
                      Uvnitř instance se projdou všechny tagy <code className="font-mono text-gray-300">&lt;App Name="..." Url="..." /&gt;</code>:
                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-gray-400">
                        <li>První platná aplikace (např. Administrace <code className="font-mono text-gray-300">A</code>) se stane <strong>hlavní položkou</strong>.</li>
                        <li>Další aplikace (<code className="font-mono text-gray-300">Web</code>, <code className="font-mono text-gray-300">API</code>, <code className="font-mono text-gray-300">BO</code>) se automaticky vloží do <strong>subpoložek (<kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-[10px]">Alt+Enter</kbd>)</strong> s favikonou.</li>
                      </ul>
                    </p>
                  </div>

                  <div className="p-3.5 bg-white/[0.03] rounded-2xl space-y-1">
                    <span className="font-semibold text-white">3. Automatická metadata (info)</span>
                    <p className="text-gray-400 leading-relaxed">
                      Z XML se do informačního panelu položky (<kbd className="px-2 py-0.5 bg-white/10 rounded-full font-mono text-[10px]">Shift+Enter</kbd>) automaticky načítají <strong>všechny dostupné XML atributy a parametry</strong> daného serveru i instance (např. Server, Instance, DB Server, Umístění serveru, Provider, Požadavek, Root Path, FTP, Zálohy a další). Veškerá tato metadata lze jedním kliknutím zkopírovat do schránky a slouží také pro vyhledávání.
                    </p>
                  </div>

                  <div className="p-3.5 bg-white/[0.03] rounded-2xl space-y-1">
                    <span className="font-semibold text-white">4. Klonování repozitářů sekcí</span>
                    <p className="text-gray-400 leading-relaxed">
                      Z Administrace se automaticky vygeneruje akce <code className="font-mono text-amber-300">mgclone</code>. Ta přes CmsFs endpoint načte všechny repozitáře sekcí v instanci a umožní jejich stažení do podsložek (s volitelnou rekurzí přes checkbox).
                    </p>
                  </div>

                  <div className="p-3.5 bg-white/[0.03] rounded-2xl space-y-1">
                    <span className="font-semibold text-white">5. Rychlé vyhledávání instancí (prefix magicgate: / mg:)</span>
                    <p className="text-gray-400 leading-relaxed">
                      Zadáním prefixu <code className="font-mono text-amber-300">magicgate:</code> nebo <code className="font-mono text-amber-300">mg:</code> ve vyhledávači (např. <code className="font-mono text-gray-300">magicgate:</code> pro zobrazení všech nebo <code className="font-mono text-gray-300">magicgate: produkce</code>) filtrujete výhradně v instancích MagicGate bez míchání ostatních zdrojů.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="pt-3 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-gray-500">
            Při úpravě nebo rozšíření JSON schématu v aplikaci je nutné aktualizovat i tuto dokumentaci.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
            title="Zavřít průvodce (Esc)"
          >
            <span>Zavřít průvodce</span>
            <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[9px] leading-none select-none">
              Esc
            </kbd>
          </button>
        </div>

      </div>
    </div>
  );
};
