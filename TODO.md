# IADonkey – TODO List

Aktuální seznam úkolů projektu rozdělený na otevřené k realizaci s podrobnými technickými analýzami a dokončené čekající na revizi.

---

## 📋 Otevřené úkoly (k realizaci)

- [ ] **1. MagicGate: Přepínač mezi lokálním XML souborem a vzdáleným API GET**
  - **Popis**: Přepínač způsobu získávání instancí MagicGate – buď z lokálního deploy XML souboru, nebo dynamickým stažením přes REST API s autentizací.
  - **Datový model & Konfigurace**:
    - Rozšíření `MagicGateSettings` o `sourceMode: 'xml' | 'api'`, `apiUrl?: string`, `apiUsername?: string`, `apiPassword?: string`, `apiAuthType?: 'basic' | 'bearer' | 'credentials'`.
    - Výchozí hodnota `sourceMode: 'xml'` pro 100% zpětnou kompatibilitu.
  - **Implementace API GET & Mapování**:
    - Podpora přihlášení buď sdílenými přihlašovacími údaji MagicGate (IS Tour credentials), nebo dedikovaným API klíčem.
    - Endpoint vrací strukturu serverů a instancí; mapovač data převede na standardní `LauncherItem[]` s `sourceId: 'magicgate-api'`.
    - Fixní sada Material ikon pro aplikace: Administrace (`admin_panel_settings`), Web (`language`), API (`api`), BackOffice/SIS (`desktop_windows`), Klient (`apartment`).
  - **Uživatelské rozhraní v Nastavení (`SettingsModal.tsx`)**:
    - Přepínač režimu: *„Lokální soubor XML“* vs. *„Vzdálené API GET“*.
    - V režimu XML: výběr cesty k souboru na disku s validací existence.
    - V režimu API: URL endpointu, volba typu autentizace, tlačítko *„Otestovat připojení k API“*.

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

- [x] **MagicPlan Nastavení: Barva extensionu (cyan) a přepínač propojení s TaskManagerem**
  - V nastavení MagicPlanu sladěna barva ikony v prvním nadpisu do barvy extensionu (`text-cyan-400`) a přepínač propojení s TaskManagerem přepnut do stejného cyan odstínu (`peer-checked:bg-cyan-600`).








