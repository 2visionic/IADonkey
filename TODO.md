# IADonkey – TODO List

Aktuální seznam úkolů projektu rozdělený na otevřené k realizaci s podrobnými technickými analýzami a dokončené čekající na revizi.

---

## 📋 Otevřené úkoly (k realizaci)

- [ ] **1. Analýza dodatečné shortcut lišty (rychlého panelu zástupců)**
  - **Popis**: Možnost připnout si vyhledané položky ze Spotlightu i jejich konkrétní akce jako zástupce (zkratky / shortcuts) do rychlého panelu pro okamžité spuštění.
  - **K zamyšlení & UX/UI analýza**:
    - **Umístění a vizuál lišty**: Kompaktní dock panel (např. lišta pod vyhledávacím řádkem, boční panel, nebo konfigurovatelná plovoucí lišta).
    - **Způsob připínání**: Akce v nabídce položky (*„Připnout na rychlý panel“* / klávesová zkratka), drag & drop, nebo správa v Nastavení.
    - **Reprezentace zástupců**: Miniatury ikon s badge indikátorem, tooltip s plným názvem a akcí, rychlé spuštění přes klávesy (např. 1–9 nebo Alt+1–9).
    - **Datový model & Konfigurace**: Ukládání seznamu zástupců v konfiguraci aplikace (`pinnedShortcuts: { id, name, icon, action, location, settings }[]`).

- [ ] **2. MagicPlan: Integrace zobrazení víkendů**
  - **Popis**: Zobrazení víkendových dnů v plánu, defaultně indikovaných jako 8h volno.
  - **Požadavky**: Údaje o volnu/kapacitě přebírat dynamicky z dat plánu (ne hardcoded).

- [ ] **3. Integrace MLog Frog API: Zakládání úkolů přes příkaz `/task` ve Spotlightu**
  - **Popis**: Využití nového moderního REST API serveru MLogu („Frog“) pro rychlé zakládání úkolů přímo ze Spotlight dialogu s následným otevřením přes `LinkOpenner`.
  - **Odkaz na analýzu**: [Technická analýza Frog MLog API](docs/frog-mlog-api-analyza.md)
  - **Klíčové kroky**:
    - Získání DTO modelů a domluva autentizace (PAT / API token).
    - Implementace servisy pro volání REST endpointů pro zakládání požadavků a načítání uživatelů.
    - Spotlight dialog pro příkaz `/task` (název, závažnost, zkratka řešitele, projekt).

- [ ] **4. Vylepšení úvodní obrazovky (Splash screen)**
  - **Popis**: Modernizace, vizuální doladění a technické vylepšení Splash screenu zobrazovaného při startu aplikace a simulaci.
  - **Klíčové body k realizaci**:
    - **Dynamický průběh načítání (Progress & Status text)**: Napojení komponenty `SplashScreen.tsx` na IPC událost `splash-status` (předávanou z backendu `windowManager.updateSplashStatus`), zobrazení reálného textu aktuálního kroku inicializace (např. *Načítání konfigurace*, *Synchronizace dat*, *Příprava oken*...) namísto statického nápisu *Spouštění...*.
    - **Vizuální indikátor postupu**: Doplnění tenkého elegantního progress baru se zaoblením dle M3 stylu v dolní části karty.
    - **Vizuální styl a sladění**: Sjednocení s primární barvou aplikace, plynulé animace náběhu a ukončení (fade in/out), případně dynamické barevné zvýraznění verze (dev vs produkce).
    - **Plynulý přechod do hlavního okna**: Zajištění hladkého předání fokusu a zobrazení hlavního okna/Spotlightu bez probliknutí.

---

## ✅ Dokončené úkoly (čekající na kontrolu / revizi)

- [x] **Spotlight: Příkazový režim `/source`, průvodce (wizard) pro přidání/úpravu položek a správa zdrojů**:
  - Implementován příkaz `/source` (a aliasy `/sources`, `/zdroj`, `/zdroje`) pro okamžitý přehled všech nakonfigurovaných zdrojů dat s možností interaktivního výběru nebo přímého zadání (`/source "<název zdroje>"`, `/source add`).
  - Inteligentní doplňování (ghost text a Tab klávesa) s automatickým uzavíráním do uvozovek.
  - V režimu zdroje se filtrují pouze položky daného zdroje a na konci seznamu se nabízí karta `➕ Přidat záznam do zdroje...` spouštějící multi-step wizarda.
  - Položky mají v tomto režimu dedikované akce pro **Úpravu** (spustí wizarda s předvyplněnými hodnotami a správou podpoložek `options`, klávesa `F2`) a **Smazání** (klávesová zkratka `Shift+Delete`).
  - Podpora přímých příkazů `/source <název> add` i `/source <název> delete`.
  - API endpointy jsou striktně chráněny jako read-only (pouze filtrace, bez akcí pro přidání/úpravu/smazání položek).
  - Backendová služba `SourceManagerService` s atomickým zápisem souborů, automatickými `.bak` zálohami, detekcí obalovacích struktur (`data`, `items`, atd.) a automatickým spuštěním synchronizace.




