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

- [x] **Aktualizace aplikace: Automatická kontrola na pozadí každých 10 minut a při odemčení PC**: Zkrácení intervalu automatické kontroly nové verze z 24 hodin na 10 minut + kontrola při odemčení obrazovky / probuzení PC (`unlock-screen`, `resume`). Notifikace ve Windows (Toast) a záznam v Logu akcí se pro nově zjištěnou verzi vypíše vždy pouze jednou (`lastNotifiedUpdateVersion`), přičemž dialog aktualizace (`UpdateDialog`) se rovnou připraví do Spotlightu (a otevře po kliknutí na notifikaci nebo při příštím vyvolání Spotlightu).
- [x] **MagicGate: Oprava řazení webových domén (Tier hierarchie a normalizace pomlček)**: Zajištění, že reálné veřejné webové domény (2. řád a www) mají vždy přednost před technickými subdoménami (`.iscontent.cz`, `.magicware.cz`, `dashboard.*.istour.cz`). Opraveno párování názvů instancí s doménami s pomlčkou (např. `marcopolo` -> `marco-polo.cz`, `snailtravel` -> `snail-travel.cz`), takže technické `iscontent` subdomény už nikdy nepředbíhají ostré klientské weby.
- [x] **Spotlight: Ošetření pádu v okně akcí a automatické ignorování akcí u položek bez akcí**: Opraven pád aplikace na `actionsParentItem.actions!.length` v patičce detailu akcí. Funkce `hasItemActions` byla přímo navázána na `getItemActions(item).length > 0`. Pokud tedy položka nemá žádné dostupné akce (např. statické MagicGate položky v JSONu bez git repa, DB, FTP či admin URL), akce se automaticky ignorují a v launcheru se vůbec nenabízí proklik do akcí (`Shift+Enter Akce`), aniž by bylo nutné v JSONu psát `"actions": []`. Pokud je v JSONu `"actions": []` explicitně uvedeno, je také plně respektováno.
