# IADonkey – TODO List

Aktuální seznam úkolů projektu rozdělený na otevřené k realizaci s podrobnými technickými analýzami a dokončené čekající na revizi.

---

## 📋 Otevřené úkoly (k realizaci)

- [ ] **1. MagicGate: Přepínač mezi lokálním XML souborem a vzdáleným API GET (MagicWare Deploy)**
  - **Popis**: Přepínač způsobu získávání instancí MagicGate – buď z lokálního XML souboru (`applications.xml`), nebo dynamickým stažením přes REST API z **MagicWare Deploy** (`https://deploy.magicware.cz/api/ui/agents`).
  - **Odkaz na analýzu**: [Technická analýza MagicWare Deploy API](docs/deploy-magicware-api-analyza.md)
  - **Datový model & Konfigurace**:
    - Rozšíření `MagicGateSettings` o `sourceMode: 'xml' | 'api'`, `apiUrl?: string` (default: `https://deploy.magicware.cz/api/ui/agents`), `authMode?: 'google_sso' | 'cookie' | 'desktop_token'`.
    - Výchozí hodnota `sourceMode: 'xml'` pro 100% zpětnou kompatibilitu.
  - **Implementace API GET & Mapování**:
    - Napojení na endpoint `/api/ui/agents` vracející servery flotily a jejich běžící instance Magicu (`agent.instances`).
    - Autentizace přes Google Workspace SSO (`@magicware.cz`), session cookie `.AspNetCore.Cookies` nebo desktop token z palety MagicGate (`/api/ui/desktop-tokens`).
    - Mapovač data převede na standardní `LauncherItem[]` s `sourceId: 'magicgate-api'`.
    - Fixní sada Material ikon pro aplikace: Administrace (`admin_panel_settings`), Web (`language`), API (`api`), BackOffice/SIS (`desktop_windows`), Klient (`apartment`).
  - **Uživatelské rozhraní v Nastavení (`SettingsModal.tsx`)**:
    - Přepínač režimu: *„Lokální soubor XML“* vs. *„MagicWare Deploy API“*.
    - V režimu XML: výběr cesty k souboru na disku s validací existence.
    - V režimu API: URL endpointu, tlačítko *„Přihlásit přes Google SSO“* / vložení tokenu, tlačítko *„Otestovat připojení k API“*.

- [ ] **2. Analýza dodatečné shortcut lišty (rychlého panelu zástupců)**
  - **Popis**: Možnost připnout si vyhledané položky ze Spotlightu i jejich konkrétní akce jako zástupce (zkratky / shortcuts) do rychlého panelu pro okamžité spuštění.
  - **K zamyšlení & UX/UI analýza**:
    - **Umístění a vizuál lišty**: Kompaktní dock panel (např. lišta pod vyhledávacím řádkem, boční panel, nebo konfigurovatelná plovoucí lišta).
    - **Způsob připínání**: Akce v nabídce položky (*„Připnout na rychlý panel“* / klávesová zkratka), drag & drop, nebo správa v Nastavení.
    - **Reprezentace zástupců**: Miniatury ikon s badge indikátorem, tooltip s plným názvem a akcí, rychlé spuštění přes klávesy (např. 1–9 nebo Alt+1–9).
    - **Datový model & Konfigurace**: Ukládání seznamu zástupců v konfiguraci aplikace (`pinnedShortcuts: { id, name, icon, action, location, settings }[]`).

- [ ] **3. Analýza funkce „Odeslat zpětnou vazbu“ (Feedback / Hlášení problémů)**
  - **Popis**: Návrh mechanismu pro jednoduché a rychlé odeslání uživatelské zpětné vazby, nápadů na vylepšení nebo nahlášení chyb přímo z aplikace IADonkey.
  - **K zamyšlení & Technická / UX analýza**:
    - **Uživatelské rozhraní**:
      - Modální okno nebo dedikovaná sekce v Nastavení (záložka Nápověda / Systém) a rychlá volba v tray menu i Spotlightu (`/feedback`, `/zpetnavazba`).
      - Typ zpětné vazby: výběr kategorie (Chyba / Nápad na vylepšení / Dotaz / Jiné).
      - Textové pole pro popis + volitelné zadání kontaktního e-mailu / uživatele.
    - **Přílohy a diagnostická data**:
      - Možnost přiložit snímek obrazovky (přímé napojení na QuickCap snipper).
      - Volitelné automatické připojení systémových diagnostických informací (verze IADonkey, verze Windows, anonymizovaný výpis posledních událostí z Action Logu / Crashlogu).
    - **Backend & Způsob doručení**:
      - Odeslání přes interní API / Helpdesk (např. MLog API jako požadavek Rxxxx), GitHub Issues REST API, nebo centrální webhook (Slack/Teams/e-mail).
      - Ošetření offline stavu (uložení do fronty k odeslání po obnovení připojení).

- [ ] **4. MagicPlan: Integrace zobrazení víkendů**
  - **Popis**: Zobrazení víkendových dnů v plánu, defaultně indikovaných jako 8h volno.
  - **Požadavky**: Údaje o volnu/kapacitě přebírat dynamicky z dat plánu (ne hardcoded).

- [ ] **5. Integrace MLog Frog API: Zakládání úkolů přes příkaz `/task` ve Spotlightu**
  - **Popis**: Využití nového moderního REST API serveru MLogu („Frog“ – Vladimír Tintěra) pro rychlé zakládání úkolů přímo ze Spotlight dialogu s následným otevřením přes `LinkOpenner`.
  - **Odkaz na analýzu**: [Technická analýza Frog MLog API](docs/frog-mlog-api-analyza.md)
  - **Klíčové kroky**:
    - Získání DTO modelů z repozitáře `magicware/KMPMlog` a domluva autentizace (PAT / API token).
    - Implementace servisy pro volání `https://frog.magicware.cz/api/v1/sub-requirements` a načítání uživatelů (`/api/v1/users`).
    - Spotlight dialog pro příkaz `/task` (název, závažnost, zkratka řešitele např. MCH, projekt).

## ✅ Dokončené úkoly (čekající na kontrolu / revizi)

- [x] **MagicPlan: Oprava výpočtu worklog baru (vyloučení budoucích dnů a naplánovaných bloků)**
  - Worklog progress bar čerpá výhradně reálné denní výkazy z MLogu podle data dne. Odstraněn chybný fallback na naplánované bloky a budoucí dny (středa–pátek) mají striktně 0 h.

- [x] **MagicPlan: Sjednocení a sčítání worklogů pro daný úkol napříč týdnem**
  - Tasky v plánu agregují veškeré své worklogy napříč celým týdnem pro stejné číslo Txx/Rxx (např. 1,08h v Po + 1,72h v Út = 2,8h celkem). Správný výpočet a zobrazení overburnu (1h plán + 1,8h pruh ve 2h bloku) bez narušení řazení plánu.

- [x] **Automatické označení DEV režimu v aplikaci**
  - Automatické doplnění [DEV] do záhlaví všech oken, tray menu, spouštěče i verze aplikace (např. 2.1.3 dev) během vývojového běhu.

- [x] **Splash screen: Čistý titulek a žlutý surface čipu verze pro DEV**
  - Ve splash okně ponechán čistý název IADonkey, zabráněno zalamování textu verze (whitespace-nowrap) a při IS_DEV nastaven žlutý surface čipu.

- [x] **MagicPlan: Plně zaoblené pilulky T a R v tooltipu a červený overburn od 201 %**
  - V plovoucím tooltipu mají identifikátory Txx, Rxx i godday zaoblení rounded-full. V denním i týdenním plánu se overburn bar při překročení nad 200 % automaticky přebarví na červenou.








