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

- [ ] **3. MagicPlan: Integrace zobrazení víkendů**
  - **Popis**: Zobrazení víkendových dnů v plánu, defaultně indikovaných jako 8h volno.
  - **Požadavky**: Údaje o volnu/kapacitě přebírat dynamicky z dat plánu (ne hardcoded).

- [ ] **4. Integrace MLog Frog API: Zakládání úkolů přes příkaz `/task` ve Spotlightu**
  - **Popis**: Využití nového moderního REST API serveru MLogu („Frog“ – Vladimír Tintěra) pro rychlé zakládání úkolů přímo ze Spotlight dialogu s následným otevřením přes `LinkOpenner`.
  - **Odkaz na analýzu**: [Technická analýza Frog MLog API](docs/frog-mlog-api-analyza.md)
  - **Klíčové kroky**:
    - Získání DTO modelů z repozitáře `magicware/KMPMlog` a domluva autentizace (PAT / API token).
    - Implementace servisy pro volání `https://frog.magicware.cz/api/v1/sub-requirements` a načítání uživatelů (`/api/v1/users`).
    - Spotlight dialog pro příkaz `/task` (název, závažnost, zkratka řešitele např. MCH, projekt).

- [ ] **5. MagicGate: Oprava stahování packages při rekurzivním klonování repozitářů**
  - **Popis**: Při rekurzivním klonování sekčních repozitářů v MagicGate (volba `--recursive`) se nestáhnou balíčky/packages (submoduly repozitáře).
  - **Klíčové body k analýze a realizaci**:
    - **Propagace autentizace do submodulů**: Při klonování s GitHub tokenem přes `-c http.${origin}/.extraheader=...` se autentizační hlavička v `git clone --recursive` nepředává automaticky do git submodulů klonovaných v subprocesech. Ověřit a doplnit explicitní `git submodule update --init --recursive` s předáním auth hlaviček pro všechny domény submodulů.
    - **Konfigurace a flagy**: Doplnit konfiguraci pro submoduly (např. `submodule.recurse true` nebo předání do kontextu repozitáře).
    - **NuGet / packages závislosti**: Prověřit, zda projekt nepoužívá specifické packages úložiště / NuGet balíčky, a zajistit jejich správné stažení po naklonování repozitáře.
    - **Diagnostický log**: Rozšířit logování výstupu klonování v `GitCloneModal`, aby bylo zřetelně vidět volání a výsledek stahování jednotlivých submodulů a packages.

- [ ] **6. MagicPlan: Oprava párování logů nesouvisejících s T a korekce výpočtu Overburnu**
  - **Popis**: U požadavků dochází k chybné aplikaci výkazů práce (worklogů), které nesouvisí s konkrétním úkolem/bublinou (T), a následně k chybnému výpočtu přesahu (Overburnu).
  - **Klíčové body k analýze a nápravě**:
    - **Striktní vazba logů na úkol T**: Zajistit, aby se k úkolům v plánu párovaly pouze výkazy práce skutečně náležející danému úkolu (SubRequirement / T). Logy vykázané na úrovni celého požadavku (Requirement / R) nebo na jiná T nesmí zkreslovat odpracovaný čas konkrétního úkolu.
    - **Přezkum párovacích pravidel v `magicPlanService.ts`**: Revize logiky párování podle názvu/kódu, aby nedocházelo k falešným shodám u úkolů bez explicitního kódu T nebo při pouhé shodě čísla R.
    - **Korekce výpočtu Overburnu**: Přepočet vzorce a indikace přesahu – poměr skutečného worklogu vůči plánovanému odhadu (hodiny i procenta), zohlednění stavu úkolu (vyřešený / rozpracovaný / nepřekročený) a jednotný výpočet napříč denním, týdenním pohledem i přetékajícími úkoly.
    - **Vizuální konzistence**: Ověřit zobrazování worklog baru, zobrazení poměru hodin (např. `2h/1h`) a barevného zvýraznění při extrémním přesahu (> 200 %).

---

## ✅ Dokončené úkoly (čekající na kontrolu / revizi)

*Žádné dokončené úkoly nečekají na kontrolu.*
