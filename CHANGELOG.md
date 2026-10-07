# Seznam změn (Changelog) - IADonkey

Všechny důležité změny v této aplikaci jsou dokumentovány v tomto souboru. Formát vychází z uživatelsky srozumitelného přehledu novinek.

---

## [2.1.6] - 7. 10. 2026
### MagicPlan Real timeline log v denním pohledu, transparentní překryvy a oprava notifikací plánu
- **MagicPlan – Real timeline log v denním pohledu**: Kliknutím na progress bar worklogu nebo na postranní ikonu napravo se u daného uživatele zobrazí chronologická časová osa odpracovaných intervalů z MLogu.
- **MagicPlan – Jednořádkové zobrazení s překryvy a opacitou**: Všechny časové intervaly leží v jednom řádku. Pozadí bloků má opacitu 0.6, takže se při souběžném logování vrstvy transparentně složí a indikují překryv, zatímco text zůstává s plnou ostrostí (1.0).
- **MagicPlan – Přesná osa 100 % šířky dne**: Časová osa se dynamicky vymezuje od prvního začátku po poslední konec logování v daný den, tvořící čistých 100 % šířky bez rušivých prázdných okrajů a bez záhlaví.
- **MagicPlan – Plovoucí informační tooltip**: Při najetí myši na libovolný úsek se zobrazí plovoucí tooltip v jednotném guideline designu aplikace (časy od–do, hodiny, typ vývoj/servis, název úkolu, projekt, kód úkolu a možnost přímého otevření).
- **MagicPlan – Párování na odkaz úkolu a spolehlivé notifikace**: Podpora pro nový odkaz na nadřazený úkol v HTML buňce MLogu a oprava filtru řešitele zajišťující spolehlivé odesílání notifikací při navýšení i snížení plánu hodin.

## [2.1.5] - 7. 10. 2026
### Spolehlivý Alt+Space interceptor, kopírování z kalkulačky, MagicPlan v nápovědě a ladicí nástroje
- **Klávesové zkratky – Spolehlivý Alt+Space interceptor**: V nízkoúrovňovém jádru Electronu byl nasazen Win32 hook, který při nahrávání i stisku globální zkratky Alt+Space spolehlivě potlačuje systémové okenní menu Windows.
- **Spotlight – Kopírování výsledku z kalkulačky**: Při výběru nebo kopírování výsledku kalkulačky ve Spotlightu se do schránky korektně ukládá vypočtená hodnota z názvu položky.
- **Nápověda – Karta MagicPlan v chytrých funkcích**: Do nápovědy chytrých funkcí v Nastavení byla přidána nová karta s přehledem možností MagicPlanu (příkazy /plan, /magicplan, sledování úkolů a timeline).
- **Dialog aktualizace – Vyladění tlačítka restartu**: Tlačítko „Restartovat a spustit novou verzi“ již není roztažené přes celou šířku dialogu a je elegantně zarovnáno vpravo.
- **Nastavení & Vývojář – Seřazení nástrojů a názvy barev**: Zelené ikony a strukturované seřazení všech ladicích a servisních nástrojů vývojáře, zjednodušené názvy výchozích barev („Indigo“, „Fialová“) a plně zakulacený chip výběru barvy.

## [2.1.4] - 6. 10. 2026
### MagicPlan ukazatele odpracovaného času, extrémní přesahy a rychlý náhled detailů
- **MagicPlan – Ukazatel odpracovaného času (worklog bar)**: Jemný 4px zaoblený indikátor odpracovaných hodin per uživatel v denním (8h) i týdenním (40h) pohledu. Barevná indikace podle poměru k uplynulému času (červená pod 25 %, primární vybraná barva pod 65 %, zelená nad 65 %) a možnost vypnutí/zapnutí v Nastavení.
- **MagicPlan – Přepočet poměru dokončení a extrémní přesahy (> 200 %)**: Výpočet procent u přesahu podle skutečného poměru worklogu vůči plánu (např. 2h/1h = 200 %, 1,4h/1h = 140 %). Při překročení 200 % se indikátor i hodiny automaticky zvýrazní červeně namísto oranžové.
- **MagicPlan – Rychlý náhled detailů v denním pohledu**: Při najetí myši na kartu úkolu déle než 1,2 sekundy se zobrazí bohatá informační karta s kompletními detaily o úkolu a stavu přesahu.
- **Nastavení – Sjednocení barev v MagicPlanu**: Ikona v záhlaví záložky MagicPlan i přepínač propojení s TaskManagerem byly sjednoceny do čistého odstínu rozšíření (cyan).

## [2.1.3] - 6. 10. 2026
### MagicPlan přehled přesahů a hodin, vizuální vyladění karet a tiché OAuth klonování
- **MagicPlan – Přesahy a přesný poměr hodin (`2h/1h`)**: V kartách úkolů na nástěnce i v Seznamu se u úkolů překračujících plán zobrazují hodiny v oranžové barvě včetně poměru k původnímu plánu (např. `2h/1h`).
- **MagicPlan – Čistá procenta bez znamének napříč všemi pohledy**: Všechna procenta přesahů na nástěnce, v denním i týdenním plánu, v přetékajících úkolech i v seznamu jsou uváděna jednotně bez znamének (`+`/`-`).
- **MagicPlan – Přesný výpočet přesahu v týdenním plánu**: Opraven a zpřesněn výpočet procenta u rozpracovaných úkolů překračujících odhad v týdenní časové ose.
- **MagicPlan – Pozice dílu a obarvení kontextového menu**: V kartách úkolů přesahujících do dalšího týdne je badge dílu (např. `2/2`) umístěn vlevo od avatara zpracovatele. Šipky pro posun uživatele nahoru a dolů v kontextovém menu časové osy mají primární barvu uživatele.
- **MagicPlan – Vizuální ladění karet a stavů**: V denním plánu je u splněných úkolů zachována ikona typu s diskrétním indikátorem splnění, sjednocena opacita přesahu a opraven podkres zakončení.
- **Nastavení – Komfortní šířka okna**: Výchozí šířka okna Nastavení byla rozšířena na 1100 px pro pohodlné zobrazení a navigaci v kartách.
- **GitHub OAuth klonování bez vyskakovacích oken**: Přímé předání GitHub tokenu do procesu klonování repozitářů, které spolehlivě zabraňuje otevírání externího Git Credential Manageru.

## [2.1.2] - 4. 10. 2026
### MagicPlan inline správa osob a kontextové menu, kompaktní režim, sjednocení přepínačů a vyladění Nastavení
- **MagicPlan – Inline správa osob a kontextové menu v timeline**: Možnost přidávat i odebírat osoby přímo v časové ose, kontextové menu pro posun uživatelů nahoru/dolů, označení „To jsem já / To nejsem já“ a vymazání ukotvené bezprostředně u avataru s inteligentním otevíráním dle volného prostoru.
- **MagicPlan – Kompaktní režim denního plánu**: Efektivní jednořádkový layout karet s vertikálním centrováním ikon a zadavatele, přehledné zobrazení detailů po najetí myši, jednotná výška 46 px a sladěný borderless poloměr.
- **MagicPlan – Týdenní plán a indikátor aktuálního dne**: Zmenšená výška řádků, čisté zobrazení bez zbytečných chipů pro Servis/Vývoj, zelené zvýraznění splněných úkolů, název projektu těsně pod názvem úkolu v tooltipu a přejmenování dnešního indikátoru na „Nyní“.
- **MagicPlan – Přepínač „Všechny úkoly“ a celkové hodiny**: Ikonové tlačítko ve stálém primárním surface s přehlednou ikonou 2 uživatelů (group), okamžitá synchronizace zobrazení i konfigurace bez nutnosti refreshu a přesný výpočet celkových hodin v patičce s vyloučením absencí a volna.
- **MagicPlan – Odlišení a chytré filtrování avatarů**: Neutrální kruhové avatary pro ostatní kolegy a primární barva pro přihlášeného uživatele; automatické skrytí avataru při zobrazení pouze vlastních úkolů napříč všemi pohledy.
- **Nastavení – Borderless boční panel a sbalování rozšíření**: Odstranění pravého divideru z postranního panelu pro čistý borderless styl a automatické sbalování podpoložek rozšíření (zobrazují se pouze při aktivní sekci Rozšíření nebo daného doplňku).
- **Nastavení – Sjednocení barvy ve vývojářském testu notifikací**: Ikona i aktivní výběr v dropdownu situací u vývojářského testu MagicPlan notifikací sladěny do žluté vývojářské barvy (amber).

## [2.1.1] - 3. 10. 2026
### MagicPlan detekce nového dne a responzivní mřížka, centralizace notifikací a ochrana MagicGate akcí
- **MagicPlan – Automatická detekce nového dne po půlnoci a při probuzení**: Okamžitá aktualizace časové osy a vybraného dne po půlnoci i při obnovení okna. Během víkendu (sobota i neděle) zůstává aktivní pátek s přepnutím na pondělí nového týdne až po nedělní půlnoci, v týdenním přehledu zjednodušen zápis nevyužité kapacity.
- **MagicPlan – Responzivní grid přetékajících úkolů**: Moderní responzivní mřížka pro úkoly přesahující do dalšího týdne škálující od 1 sloupce až po 5 sloupců pro monitory a širokoúhlé displeje s rozlišením od 1921 px.
- **Sjednocení a granularita notifikací v Nastavení**: Všechna nastavení notifikací MagicPlanu byla centralizována do záložky Notifikace s odstraněním duplicit. Přidány granulární přepínače pro všechny 4 typy událostí plánu s vizuálním odsazením podpoložek a dedikovaná testovací tlačítka s neutrálními demo daty.
- **Spotlight & MagicGate – Ochrana při neaktivním GitHubu**: Pokud není zapnuté rozšíření GitHub nebo chybí přihlašovací údaje, u MagicGate položek ve Spotlightu je zcela skryt přechod do nabídky akcí a informací. Položka se zobrazí jako čistý pasivní badge bez klávesové zkratky Shift+Enter.
- **Dynamická akční barva u klonování**: Tlačítko pro spuštění klonování repozitářů MagicGate a ikona složky v dialogu plně respektují dynamickou sekundární akční barvu zvolenou uživatelem v nastavení.

## [2.1.0] - 1. 10. 2026
### MagicPlan Timeline novinky, inteligentní párování notifikací úkolů a moderní Material 3 ikony oznámení
- **MagicPlan – Inteligentní párování přechodů úkolů**: Pokročilá detekce pohybů úkolů mezi frontou nepřiřazených a osobním plánem. Zamezení duplicitním notifikacím při přesunu úkolu do plánu, automatické upozornění při vrácení do fronty a detekce vyřešení při zmizení z plánu bez návratu.
- **MagicPlan – Sledování kolegů v plánu**: Notifikace o přiřazení a dokončení úkolů pro sledované kolegy v týmu přímo ve Windows toastech se jménem uživatele.
- **Nová sada 13 moderních ikon oznámení (Material 3)**: Kompletně přepracované minimalistické kruhové ikony pro všechny systémové notifikace (vývoj, servis, dokončeno, kritický úkol, fronta, QuickCap, ColorMaster, ScreenRuler, synchronizace, aktualizace, schránka, chyba a test).
- **Testování notifikací v Nastavení**: Vývojářská tlačítka TEST pro okamžité otestování všech variant systémových notifikací v záložkách Notifikace a MagicPlan.
- **MagicPlan Timeline – Interaktivní rozsah osy a přesné tikání**: Možnost přímé editace počátečního i konečného času v záhlaví osy, přesný vteřinový přepočet a plynulý pohyb čárkovaného časového ukazatele s dynamickým zarovnáním pillu.
- **MagicPlan Timeline – Čisté ploché barvy a průhlednost**: Karty úkolů mají ploché barvy s jemnou průhledností pro zachování čitelnosti podkladu a mřížky, dynamické barvy vývoje i servisu z nastavení a novou položku pro volno a absenci v legendě.
- **MagicPlan Timeline – Vizuální vyladění a fokus**: Odstranění outline focus efektů při přepínání dnů a týdne, transparentní záhlaví vybraného dne, výrazně červené označení kritických úkolů a okamžitý návrat na dnešní den po kliknutí.

## [2.0.0] - 28. 9. 2026
### Generace 2.0: Modernizace správy aplikace, servisní nástroje, vyladění DonkeyTools a sjednocený design
- **Generace 2.0 – Oficiální ostré vydání**: Přechod na novou generaci aplikace IADonkey přinášející celkovou modernizaci rozhraní, ladicí a servisní vývojářské nástroje a pokročilou integraci systémových utilit.
- **Správa aplikace s kruhovými ikonami**: Kompletně přepracované okno Správy aplikace s velkými centrálními kruhovými ikonami, čistou patičkou s klávesovou zkratkou Esc a plnou integrací do vývojářských i servisních nástrojů.
- **DonkeyTools – ScreenRuler přehledné nastavení**: Nové rozvržení sekce ScreenRuler s oddělenými řádky pro výchozí jednotku (px, %, dp) i barvu vodítek a měřítka pro maximální přehlednost.
- **ColorMaster – Spolehlivé předání systémového popředí**: Nativní řešení předání fokusu (Foreground Lock bypass) po nabrání barvy kapátkem pro okamžitou klávesovou navigaci v akcích a přirozené zavření přes Escape.
- **Globální sjednocení klávesových zkratek**: Standardizovaný moderní vizuál klávesových zkratek Esc a Enter napříč všemi dialogovými tlačítky a modálními okny aplikace.
- **Vývojářské servisní nástroje**: Rozšířené dropdown nabídky pro testování a simulaci chybových i reálných stavů (GitHub repozitáře, MagicGate instance a CMSinFS zdroje), plus rychlé spuštění úvodního SplashScreenu.
- **Vyladění SplashScreenu a synchronizace**: Realistické stínování okna SplashScreenu, zvýšení odsazení úvodního textu od spodního okraje a nová synchronizační ikona rotující po směru hodinových ručiček.
- **CMSinFS zdroje dat**: Tlačítko „Zkusit znovu“ v sekundární fialové barvě akcí a automatické vyvolání Spotlightu při zrušení dialogu.

## [1.1.26] - 24. 9. 2026
### EasyClip historie schránky, automatické vložení (auto-paste) do aplikací a okamžitý reset Spotlightu
- **EasyClip – Pokročilá historie schránky v DonkeyTools**: Nové systémové rozšíření pro sledování a správu historie schránky (text i obrázky) s možností rychlého vyvolání globální zkratkou i příkazy `/easyclip`, `/clip`, `/schranka`, `/clipboard`.
- **Hromadný výběr a mazání ve schránce**: Podpora výběru rozsahu položek přes Shift + šipky / Shift + klik myší. Smazání označených položek klávesou Delete a zkopírování více položek odspodu nahoru s oddělením novým řádkem.
- **Automatické vložení (Auto-paste) pro EasyClip a Snippety**: Po výběru položky ze schránky nebo snippetu se Spotlight okamžitě skryje a text se automaticky vloží přímo do původně aktivní aplikace (Notepad, VS Code, Word, prohlížeč atd.).
- **Spolehlivé navrácení zaměření (focusu)**: Robustní aktivace cílového okna a simulace vložení pomocí C# pomocníka s ošetřením DWM TopMost vrstev, bez nežádoucí aktivace menu baru a s automatickým uvolněním visících kláves.
- **Okamžitý reset stavu bez problikávání**: Synchronní reset stavu Spotlightu ještě před skrytím okna zabraňuje problikávání předchozího obsahu při opětovném otevření.

## [1.1.25] - 24. 9. 2026
### Sjednocení záhlaví záložek v Nastavení a odstranění duplicitních nadpisů
- **Sjednocení záhlaví záložek v Nastavení**: Titulky v záhlaví pravého panelu (`<h2>`) byly globálně sjednoceny tak, aby přesně odpovídaly názvům v levém navigačním menu (*DonkeyTools*, *Zdroje dat*, *Rozšíření*, *MagicGate*, *Taskmanager*, *GitHub*, *VS Code*, *Android Studio*, *Snippety*, *Obecné*, *Systém*, *Nápověda*, *Vývojář*).
- **Odstranění duplicit v záložce DonkeyTools**: Záhlaví zjednodušeno na „DonkeyTools“ a úvodní nadpis v obsahu upraven na „Systémové nástroje a utility“ bez opakování názvu nástroje.
- **Přehlednější nadpisy editorů a IDE**: Úvodní nadpis obsahu záložky VS Code změněn na „Propojení s editorem kódu“ a Android Studio na „Propojení s vývojovým prostředím“ pro zamezení duplicity s názvem záložky.

## [1.1.24] - 24. 9. 2026
### ScreenRuler zrušení výběru a spolehlivé notifikace schránky, QuickCap zkratka P a vyladění kapátka
- **ScreenRuler – Zrušení výběru přes ESC**: První stisk klávesy Esc při aktivním obdélníkovém výběru zruší pouze rozpracovaný výběr bez uzavření pravítka, další stisk Esc pravítko zavře.
- **Spolehlivé nativní notifikace při kopírování**: Zkopírování naměřených rozměrů (klikem na bar i klávesou C) spolehlivě zobrazí Windows toast banner; odstraněn systémový stav QUNS_BUSY, který toastové notifikace ve Windows potlačoval.
- **Vyladění nástrojové lišty ScreenRuleru**: V přepínači režimů nasazena ikona `crop_free` pro obdélníkový výběr, odstraněna redundantní ikona klávesnice u lišty zkratek a nastaveno pevné neprůhledné grafitové pozadí bez nežádoucího průhledu.
- **QuickCap – Okamžitý snímek celé obrazovky zkratkou P**: Přidáno tlačítko „Vyfotit celou obrazovku“ s klávesovou zkratkou P v bublině pro pořízení kompletního screenshotu jedním stiskem.
- **QuickCap – Reset tažení výběru přes ESC**: Stisk klávesy Esc během tažení myší zruší aktuální výběr a umožní ihned provést nový výběr bez nutnosti restartu nástroje.
- **Plynulé přechody mezi nástroji bez problikávání**: Odstraněny černé a bílé záblesky při rychlém střídání QuickCapu a ScreenRuleru díky přednačtení snímků obrazovky a vzájemnému korektnímu uzavírání oken.
- **Kapátko (ColorMaster) – Dokonale ostrý vnější rámeček**: Odstraněn rámeček z vnitřního okénka lupy, opraveno oříznutí vnějšího rámečku celého plovoucího okna v GDI a sjednoceny texty zkratek na malá písmena.
- **Nastavení – Zobecnění notifikací schránky**: Popisek volby „Kopírování do schránky“ v Nastavení byl rozšířen a zobecněn pro všechny nástroje (Spotlight, ScreenRuler apod.).

## [1.1.23] - 24. 9. 2026
### ScreenRuler pravítko, nativní Windows notifikace a vizuální sjednocení DonkeyTools se Spotlightem
- **ScreenRuler (Měřítko a pravítko obrazovky) v DonkeyTools**: Nové rozšíření pro přesné měření na obrazovce v obdélníkovém režimu (šířka, výška, poměr stran, plocha px²) a celoobrazovkovém režimu kříže (vzdálenosti ke 4 okrajům monitoru). Podpora jednotek px, % i dp, klávesové zkratky a rychlé vyvolání příkazy `/ruler`, `/pravitko`, `/meritko`, `/scale`.
- **Nativní Windows notifikace při kopírování rozměrů**: Při zkopírování rozměrů do schránky se namísto interního toastu na obrazovce spolehlivě zobrazí systémová notifikace Windows a akce je zalogována do Protokolu akcí (Action Log).
- **Stabilní zobrazení čísel v Ruler baru bez poskakování**: Kontejnery čísel mají pevnou šířku pro 4místná čísla (`tabular-nums`), takže lišta při změně hodnot zůstává naprosto stabilní.
- **Sjednocení výšek ovládacích prvků v Ruler baru**: Všechny komponenty, přepínače a tlačítka nástrojové lišty ScreenRuleru mají striktně sjednocenou výšku `h-8` (32 px) a dokonale sedí na jedné lince.
- **Vizuální sjednocení ScreenRuleru se Spotlightem**: Grafitový skleněný podklad `bg-[#1c1d24]/90` s `backdrop-blur-2xl`, zaoblení `rounded-2xl` s `border border-white/10`, vnitřní karty `rounded-xl` a klávesové badgy ve stylu Spotlight `<kbd>`.
- **Vizuální sjednocení QuickCap (Crop bar)**: Horní nápověda přepracována do zaoblené `rounded-2xl` karty s grafitovým sklem a Spotlight `<kbd>Esc</kbd>` badgem, štítek rozměrů výstřižku v moderním `rounded-xl` skleněném provedení.
- **Vizuální sjednocení Kapátka (ColorMaster)**: Nativní Windows okno lupy má fyzicky zaoblené rohy (`rounded-2xl` / 20 px rádius), grafitové pozadí `#1c1d24`, zaoblenou vnitřní mřížku pixelů, Rose zaměřovač a Spotlight kbd badgy pro `[Klik]` a `[Esc]`.
- **Dynamické Tray menu a striktní Rose identita (`#f43f5e`)**: Nástroje DonkeyTools se v Tray menu zobrazují pouze tehdy, když jsou povolené a aktivní, a celá sada DonkeyTools striktně ctí Rose barvu.

## [1.1.22] - 23. 9. 2026
### Vývojářský režim, nová záložka Systém, přesun chybových protokolů a tray zkratky nástrojů
- **Vývojářský a diagnostický režim (isDevelop)**: Nový skrytý režim odemykaný easter eggem – 10násobným kliknutím na číslo verze v záložce Systém. Zobrazuje počítadlo zbývajících kliknutí od 5. kliknutí, po aktivaci odemkne novou záložku „Vývojář“ v bočním menu a při opakovaném kliknutí upozorní, že režim je již aktivní.
- **Nová záložka Vývojář v Nastavení**: Obsahuje hlavní přepínač pro okamžitou deaktivaci a skrytí režimu, přímé tlačítko pro otevření Chrome DevTools vývojářské konzole, generátor testovacího crashlogu pro ověření diagnostiky a kompletní auditní Protokol prováděných akcí (Action Log).
- **Trvalý běh nahrávání akcí na pozadí**: Služba zaznamenávání akcí běží nepřetržitě na pozadí nezávisle na vývojářském režimu, což zaručuje kompletní časovou osu událostí při každém exportu crashlogu.
- **Přejmenování záložky Aktualizace na „Systém“**: Záložka byla přejmenována na „Systém“ s ikonou systému a přesunem kompletní diagnostiky a správy chybových protokolů (Crashlogs) ze záložky Nápověda.
- **Duální indikátor na záložce Systém**: Tlačítko záložky Systém disponuje dvěma souběžnými indikátory – štítkem nové verze v uživatelsky zvolené primární barvě motivu aplikace a červeným číselným štítkem počtu zachycených chybových protokolů.
- **Větší výška okna Nastavení (+100 px)**: Výchozí výška okna Nastavení byla navýšena ze 720 px na 820 px (minimální výška 660 px) pro komfortnější procházení dlouhých seznamů a konfigurací bez nutnosti častého rolování.
- **Rychlé vyvolání QuickCap a Kapátka z Tray ikony**: Kontextová nabídka ikony v oznamovací oblasti Windows (systémový tray) byla rozšířena o přímé akce pro spuštění výstřižku obrazovky a kapátka barev ColorMaster.
- **Oprava synchronizační notifikace z Traye**: Po kliknutí na položku „Synchronizovat data nyní“ v tray menu se po úspěšném dokončení spolehlivě zobrazí systémová notifikace Windows s počtem načtených záznamů.
- **Dynamický čip DonkeyTools v záložce Rozšíření**: V přehledu rozšíření se pro DonkeyTools zobrazuje zelený stavový štítek s počtem aktivních nástrojů, nebo výrazný červený štítek „Nenakonfigurováno“ v případě nulové konfigurace.
- **Optimalizace stahování a odstraňování duplicit**: Odstraněn duplicitní ukazatel průběhu synchronizace v záložce Zdroje dat a stisk klávesy Enter po dokončení stahování (Git, MagicGate, CMSinFS) otevře cílovou složku v Průzkumníku, zavře dialog a korektně resetuje vyhledávač.
- **Kompaktnější výška SplashScreenu**: Výška úvodní obrazovky byla zmenšena o cca 50 px (na 350 px) pro optimální vycentrování na všech typech displejů.

## [1.1.21] - 22. 9. 2026
### Stažení CMSinFS zdrojáků, dedikované okno stahování a vyladění akcí Spotlightu
- **Stažení zdrojových kódů CMSinFS (pro PRG)**: Pro instance MagicGate přibylo v Nastavení pole pro určení cílové kořenové složky zdrojových kódů. Ve Spotlightu se u instancí MagicGate nabízí nová akce „Stáhnout CMSinFS zdrojáky (pro PRG)“, která stáhne kompletní obsah z `CmsFsContentHandler.ashx` a bezpečně jej rozbalí do podsložky s názvem instance.
- **Dedikované okno stahování CMSinFS**: Pro stahování zdrojových kódů bylo vytvořeno samostatné modální okno (`CmsDownloadModal`) s živým protokolem kroků, rotujícím spinnerem v barvě akcí a tlačítky v zápatí: „Otevřít ve VS Code“, „Otevřít v průzkumníku“ a „Zavřít“.
- **Vyladění chování stahovacích oken**:
  - Ve všech třech stahovacích oknech (GitHub repozitář, MagicGate instance, CMSinFS zdrojáky) stisk klávesy `Enter` po úspěšném dokončení operace automaticky simuluje kliknutí na tlačítko „Zavřít“.
  - Tlačítko „Zavřít“ v patičce zavře okno a resetuje Spotlight bez jeho nežádoucího obnovení na obrazovce (vyvolání Spotlightu je vyhrazeno pro klávesu Escape nebo křížek v záhlaví).
  - Tlačítko „Otevřít složku v průzkumníku“ otevírá cílovou složku a ponechává modální okno otevřené.
- **Oddělení hoveru myši od klávesového výběru ve Spotlightu**: Přejíždění myší nad seznamem položek ve Spotlightu již neposouvá automaticky scroll okna a nekoliduje s navigací šipkami. Vizuální hover stav funguje zcela samostatně.
- **Přesné označení akce VS Code u MagicGate**: V akcích položek se pro instance MagicGate akce přejmenovala na „Otevřít repozitáře ve VS Code“, čímž se jasně odlišuje od zdrojových kódů CMSinFS. U běžných repozitářů GitHubu zůstává původní „Otevřít ve VS Code“.
- **Vyladění akcí ColorMaster a QuickCap**:
  - V akcích ColorMasteru byla zrušena nadbytečná akce „Zavřít“ (vyhledávač se pohodlně zavírá stiskem klávesy Esc) a opravena nesprávná indikace štítku `Gmail`.
  - V akcích QuickCapu má první položka („Zavřít“) výstižný popis „Již zkopírováno ve schránce“ a je zvýrazněna systémovou červenou barvou (`rose-500` / `#f43f5e`).
- **Optimalizace rozměrů SplashScreenu**: Šířka úvodního okna aplikace byla zmenšena o 20 px (na 380 px) a vnitřní odsazení o 10 px pro čistší a vyváženější proporce.
- **Zjednodušená nápověda DonkeyTools**: V nápovědě nastavení ColorMasteru i QuickCapu jsou zjednodušeny doporučené příkazy na `/color` a `/cap` spolu s informací o použití klávesové zkratky nebo kliknutí na ikonku nástrojů.

## [1.1.20] - 22. 9. 2026
### Nativní systémové notifikace Windows, Photoshop-style SplashScreen a rychlé akce nástrojů
- **Nativní systémové notifikace Windows**: Integrace notifikací Windows s dynamickou registrací AppUserModelId. Aplikace zobrazuje systémové bannery pro klíčové události:
  - *QuickCap*: Upozornění na uložení výstřižku s možností přímého otevření ve složce kliknutím na banner.
  - *ColorMaster*: Upozornění s kódem nabrané barvy zkopírované do schránky.
  - *Schránka*: Notifikace při zkopírování položky ze Spotlightu nebo z historie výstřižků.
  - *Synchronizace*: Upozornění na úspěšnou synchronizaci dat a počet načtených položek.
  - *Aktualizace*: Informace o dostupnosti nové verze programu.
  - *Chyby a pády*: Speciální chybová notifikace s vyhrazenou ikonou a možností otevření složky chybových protokolů.
- **Nastavení notifikací**: V záložce Nastavení -> Obecné lze notifikace globálně vypnout, aktivovat tichý režim (bez systémového zvuku Windows), individuálně přepínat jednotlivé typy událostí a otestovat chování tlačítky pro úspěšnou i chybovou notifikaci.
- **Akce „Zavřít“ na první pozici**: Po dokončení výstřižku (QuickCap) i nabrání barvy (ColorMaster) je na 1. pozici v nabídce akcí ve Spotlightu zařazena akce „Zavřít“, která je ihned vybraná a umožňuje okamžité skrytí i reset vyhledávače stiskem klávesy Enter.
- **Izolace kapátka v Nastavení**: Při výběru primární barvy nebo barvy akcí v Nastavení kapátko nekopíruje barvu do schránky, nezobrazuje toast notifikaci ani neotevírá nabídku akcí ve Spotlightu – hodnota se pouze nastaví a okno si udrží fokus.
- **Plovoucí dialog novinek (Release Notes)**: Odstraněn ostrý černý obdélníkový backdrop. Okno novinek má zaoblené rohy (16px), vlastní stín, podkladový vyhledávač je skryt a dialog lze pohodlně zavřít klávesou Escape.
- **Nový vertikální SplashScreen (Photoshop-style layout)**: Úvodní obrazovka aplikace přepracována do formátu (400 × 400 px) se zarovnáním vlevo, velkorysejším odsazením, velkou ikonou (58 px), výrazným bílým názvem, barevnou verzí, obecným popisem a spodním copyrightem `© 2026 Petr Coolhanek`. Rámeček i zaoblení jsou sladěny se stylem Spotlightu.
- **Sjednocení barev ikon a vyladění Nápovědy**: Všechny ikony notifikací v Nastavení mají primární barvu motivu (s výjimkou chyb) a text chybových protokolů v Nápovědě byl zobecněn.

## [1.1.19] - 19. 9. 2026
### Subrozšíření QuickCap pro výstřižky obrazovky, správce výstřižků a sjednocený design nástrojů
- **Subrozšíření QuickCap (výstřižky obrazovky)**: Nový vestavěný nástroj v rámci rozšíření DonkeyTools pro bleskové pořízení výstřižku libovolné části obrazovky.
- **Celoobrazovkový interaktivní výběr**: Výběr obdélníkové oblasti pokrývá celou plochu monitoru včetně lišty Windows se ztmaveným pozadím a živým odečtem rozměrů v pixelech.
- **Automatické uložení a vložení do schránky**: Pořízený snímek se ihned zkopíruje do schránky pro vložení (Ctrl+V) a uloží jako PNG do vybrané složky (výchozí: `Obrázky\IADonkey Screenshots\QuickCap_YYYY-MM-DD_HH-mm-ss.png`).
- **Globální klávesová zkratka & příkazy**: Volitelná globální klávesová zkratka s interaktivním nahráváním a ochranou proti kolizím. Podpora příkazů ve Spotlightu: `/quickcap`, `/cap`, `/vystrizek`, `/snip`, `/screenshot`, `/snap`.
- **Správce výstřižků v Nastavení**: Možnost volby vlastní cílové složky pro ukládání, přímé tlačítko pro otevření složky v Průzkumníku Windows a galerie posledních 10 výstřižků (náhled, rozměry, datum pořízení, zkopírovat znovu, otevřít v Průzkumníku, smazat).
- **Plynulé skrytí Spotlightu**: Při aktivaci nástrojů (QuickCap, kapátko) se okno Spotlightu plynule animovaně skryje, čímž se zamezí nechtěnému probliknutí při dalším vyvolání.
- **Sjednocený design ikonek nástrojů**: Ikonky aktivních subnástrojů v rozbalovacím menu DonkeyTools ve Spotlightu mají stejné zaoblení (`rounded-lg`) jako ostatní ovládací prvky Spotlightu.
- **Výchozí stav subextensions**: Jednotlivá subrozšíření v DonkeyTools jsou ve výchozím stavu vypnutá (opt-in) a aplikace spolehlivě pamatuje volbu uživatele.

## [1.1.18] - 18. 9. 2026
### Diagnostický Crashlog systém s exportem časové osy, auditní Action Log a oprava kapátka v Release
- **Oprava systémového kapátka v produkčním balíčku**: Doplněna konfigurace asarUnpack pro nativní color-picker.exe a záložní automatická extrakce do systémové složky aplikace – kapátko v Release verzi již neproblikává a spolehlivě snímá barvy.
- **Diagnostický crashlog systém (složka crashlog/)**: Automatické zachytávání pádů, systémových chyb a neobsloužených výjimek do dedikované složky s detailním časem, kontextem a stack tracem.
- **Automaticky navázaná časová osa akcí (Action Log Timeline)**: Každý crashlog v sobě obsahuje chronologický snímek akcí před selháním se zvýrazněním momentu, kdy k chybě došlo.
- **Export chybových protokolů do souboru (.txt / .log)**: U každého záznamu v Nápovědě je tlačítko Exportovat pro uložení formátovaného diagnostického balíčku.
- **Průběžný auditní Action Log**: Zaznamenávání provedených uživatelských akcí (výběr položky, otevření nabídky akcí, vstup do podpoložek, spuštění nástrojů, kopírování z infokarty, synchronizace) v 50prvkovém FIFO ring-bufferu.
- **Nové uspořádání Nápovědy**: V záložce Nápověda (Help) je nejprve přehledný Action Log a pod ním Chybové protokoly s možností zobrazení detailu a vyčištění historie.
- **Ochrana podpoložek před AutoLoginem**: Podpoložky (např. Web, API, BO) u instancí IS Tour již nezdědí nastavení magicgate, takže se otevírají okamžitě bez chybného handshake a falešných pádů.

## [1.1.17] - 17. 9. 2026
### Rozšíření DonkeyTools, ColorMaster se systémovým kapátkem, okno doladění barvy a rychlé nástroje ve Spotlightu
- **Nové rozšíření DonkeyTools**: Přidána sada integrovaných pomocných nástrojů DonkeyTools s vínovým motivem a možností centrálního zapnutí/vypnutí v nastavení rozšíření.
- **Rychlé nástroje DonkeyTools ve Spotlightu**: Před tlačítkem aktualizace ve Spotlightu se při aktivním DonkeyTools zobrazuje ikona nástrojů, která po kliknutí vysune svislou nabídku zapnutých subextensions v kolečkách (včetně ikony kapátka).
- **ColorMaster (správa a převod barev)**: První nástroj ze sady DonkeyTools pro práci s barvami. Umožňuje přímé zadávání barev v různých formátech (#HEX, rgb, rgba, hsl), okamžitý náhled barvy v pruhu Spotlightu a nabídku akcí (Shift+Enter) pro zkopírování v požadovaném formátu (včetně akce pro RGBA) nebo nastavení jako barvy motivu aplikace.
- **Systémové kapátko (EyeDropper)**: Spolehlivé nabrání barvy odkudkoliv z obrazovky s nativním kurzorem kapátka a zvětšovací lupou přes globální zkratku, nabídku rychlých nástrojů ve Spotlightu, příkazy `/kapatko`, `/picker` i přímo z nastavení barev motivu aplikace. Po nasátí barvy se automaticky otevře nabídka akcí barvy ve Spotlightu a hodnota se zkopíruje do schránky.
- **Okno pro doladění barvy**: Nová akce „Doladit barvu...“ v nabídce akcí otevře samostatné okno v hlavním panelu Windows (taskbar) s posuvníky složek RGB, průhlednosti a odstínu. Po stisku tlačítka Uložit se aplikace vrátí rovnou do nabídky akcí k upravené barvě.
- **Interaktivní nahrávání zkratky kapátka**: Nastavení zkratky pro kapátko v DonkeyTools přebírá plnou funkcionalitu nahrávání jako launcher, včetně ochrany proti kolizím se zkratkou launcheru i rezervovanými klávesami s automatickým pozastavením zkratek při nahrávání.
- **Lomítkové příkazy (/)**: Podpora rychlých příkazů začínajících znakem `/` ve vyhledávacím poli Spotlightu s našeptávačem dostupných akcí (`/kapatko`, `/color`, `/picker`, `/barva`).
- **Optimalizace rozvržení detailu akcí**: Výška seznamu akcí byla přizpůsobena tak, aby se spodní okraj karty Spotlightu nikdy neořezával o hranice okna.
- **Širší obdélníkový Splash Screen**: Splash okno bylo rozšířeno na obdélníkový formát (380 × 230 px) pro vyváženější a modernější vizuální dojem při startu.
- **Dynamická nápověda podle aktivních rozšíření**: Seznam klávesových zkratek i karet chytrých funkcí v nápovědě se automaticky přizpůsobuje zapnutým či vypnutým rozšířením a jejich podnástrojům (DonkeyTools, ColorMaster).

## [1.1.16] - 17. 9. 2026
### Přejmenování na Taskmanager, plynulejší zobrazení položek a dialog správy aplikace
- **Přejmenování MLog na Taskmanager**: Rozšíření bylo v celé aplikaci přejmenováno na obecný Taskmanager se všemi popisy, ukázkovými doménami (např. company.com) i nápovědou.
- **Vlastní prefixy pro Úkoly a Požadavky**: V nastavení Taskmanageru lze libovolně nastavit prefix pro úkoly (výchozí T) i požadavky (výchozí R) s živým náhledem bubliny přímo v konfiguraci.
- **Chytré vyhledávání podle čísla**: Při zadání 3 a více číslic (např. 12345) Spotlight automaticky nabídne otevření jak úkolu, tak požadavku.
- **Okamžité otevření seznamu položek bez zamrzání**: Modální okno s přehledem načtených položek ve vyhledávání používá progresivní vykreslování v dávkách – otevření i přepínání záložek reaguje okamžitě a bez prodlevy.
- **Vizuální indikátor banování**: Tlačítka pro vyřazení a obnovení položek z vyhledávání nyní zobrazují točící se spinner během provádění akce.
- **Dialog pro restart a ukončení**: Dlouhým podržením (3 sekundy) ikony ozubeného kolečka ve Spotlightu se otevře okno správy aplikace na hlavním panelu Windows.
- **Kruhový indikátor průběhu držení nastavení**: Při držení tlačítka nastavení se kolem ikony plynule vykresluje gradientní kruhový progress ring a ozubené kolečko se jemně otáčí, dokud se neotevře dialog pro restart a ukončení.
- **Čistý Splash Screen bez stínů a ohraničení**: Odstraněn veškerý stín (box-shadow) i transparentní okraj kolem splash screenu – zobrazuje se čistá zaoblená karta bez jakéhokoliv tmavého oparu či backdropu.
- **Zachování navigace v podpoložkách**: Otevření a zavření nastavení již neruší rozbalené zobrazení subpoložek ve Spotlightu.
- **Přehlednější nastavení zdrojů**: Odstraněn nadbytečný oddělovač a barevně odlišeny štítky FILE, API a Mapováno.

## [1.1.15] - 17. 9. 2026
### Bezrámečkový zaoblený Splash Screen a plynulý reset Spotlightu při kliknutí vedle
- **Okamžité zobrazení Splash Screenu bez prodlevy**: Splash screen se zobrazí rovnou s kompletním obsahem (ikonou i textem) bez předchozího zobrazení prázdného tmavého okna.
- **Čistý bezrámečkový design s výraznějším zaoblením**: Odstraněn jakýkoliv rámeček, okraj i ohraničení (borderless card) a rohy byly elegantně zaobleny (poloměr 28 px) pro moderní styl.
- **Plynulé zavírání a reset Spotlightu při kliknutí vedle**: Vyřešeno probliknutí při opětovném vyvolání Spotlightu klávesovou zkratkou po předchozím kliknutí mimo okno. Stav skrytí se okamžitě a spolehlivě resetuje.
- **Optimalizace náběhu procesoru**: Skenování aplikací a síťová synchronizace se spouští až s odstupem po otevření Spotlightu, takže start programu je maximálně plynulý.

## [1.1.14] - 17. 9. 2026
### Okamžitý náběh Splash Screenu a synchronizovaný 5s odpočet
- **Okamžité zobrazení Splash Screenu**: Přechod na nativní neprůhledné Win32 okno s tmavým pozadím `#141520` eliminuje vrstvené DWM kompozice a zpoždění. Okno se zobrazí čistě a spolehlivě ihned po spuštění.
- **Synchronizovaný 5sekundový odpočet**: Časovač 5 sekund začíná běžet až ve chvíli, kdy je splash screen skutečně fyzicky vykreslen a viditelný na monitoru. Uživatel má garantováno celých 5 sekund zobrazení bez jakéhokoliv problikávání.
- **Bleskový start bez přetížení procesoru**: Náročné úlohy na pozadí (skenování nainstalovaných aplikací a datová synchronizace) jsou odloženy až po zobrazení úvodní obrazovky, takže nezatěžují CPU při prvním vykreslení.
- **Plynulé otevření Spotlightu**: Po uplynutí 5 sekund a dokončení inicializace se splash screen plynule skryje a vyhledávací okno Spotlight se automaticky zobrazí a získá okamžitý fokus.

## [1.1.13] - 17. 9. 2026
### Spolehlivé zobrazení Splash Screenu v produkci a podpora RDP/virtuálních prostředí
- **Spolehlivé zobrazení Splash Screenu v produkčním .exe**: Složka `electron/assets` byla explicitně přidána do balíčku `app.asar` v konfiguraci `package.json` a doplněna o přímou vestavěnou Base64 zálohu ikony. Splash screen se tak vykreslí bleskově a bez jakékoliv závislosti na externích souborech.
- **Plná podpora zobrazení v RDP a softwarovém vykreslování**: Odstranění závislosti na průhlednosti oken (`transparent: false`) a nastavení plného tmavého pozadí `#141520` zajišťuje spolehlivé zobrazení i ve virtuálních prostředích, vzdálené ploše (RDP) a při softwarovém vykreslování (SwiftShader).
- **Garantovaný 5sekundový čas běhu Splash Screenu**: Úvodní obrazovka zůstává zobrazená minimálně 5 sekund, i když je načtení aplikace v paměti bleskové.
- **Automatická aktivace Spotlightu po startu**: Po uplynutí 5 sekund a dokončení inicializace se splash screen plynule skryje a vyhledávací okno Spotlight se automaticky zobrazí, vycentruje na monitoru s kurzorem myši a získá okamžitý fokus pro psaní.

## [1.1.12] - 17. 9. 2026
### Okamžité zobrazení Splash Screenu na frame 0 a garantovaný 5s start
- **Okamžité zobrazení Splash Screenu (Frame 0)**: Okno je vykresleno přímo z paměti pomocí samostatného odlehčeného HTML namísto čekání na objemný React bundle. Zobrazí se bleskově během 2 ms.
- **Garantovaný 5sekundový čas běhu**: Splash screen zůstává zobrazen po dobu minimálně 5 sekund, aby uživatel jasně viděl, že aplikace startuje.
- **Plynulá aktivace Spotlightu**: Po uplynutí 5 sekund a ověření připravenosti se splash okno plynule zavře a Spotlight automaticky vyskočí s aktivním fokusem.

## [1.1.11] - 16. 9. 2026
### Photoshop-style čtvercový Splash Screen a automatická aktivace Spotlightu
- **Čistý čtvercový Splash Screen ve stylu Photoshopu**: Minimalistické tmavé čtvercové okno (260 × 260 px) se zaoblenými rohy, dominantní 48px ikonou maskota IADonkey uprostřed, názvem aplikace a štítkem verze.
- **Garantovaný 5sekundový čas zobrazení**: Splash screen běží minimálně 5 sekund, takže si uživatel stihne všimnout spuštění aplikace. Pokud načítání trvá déle, splash počká na skutečné dokončení.
- **Automatická aktivace Spotlightu po startu**: Jakmile uplyne 5s a aplikace je plně načtena v paměti, splash plynule zmizí a Spotlight se automaticky zobrazí, vycentruje na monitoru s myší a získá okamžitý fokus pro psaní dotazu.
- **Tichý start se systémem Windows**: Při spuštění na pozadí s Windows (`--background`, `--silent`, `--hidden`) se splash nezobrazuje a Spotlight zůstává skrytý v oznamovací oblasti.

## [1.1.10] - 16. 9. 2026
### 100% tichý restart po aktualizaci a nový Startup Splash Screen
- **100% tichý In-App restart bez probliknutí okna příkazové řádky**: Spuštění výměnného skriptu nově obstarává Windows Script Host (`wscript.exe` / `.vbs`) v GUI subsystému s příznakem `SW_HIDE`. Při restartu po aktualizaci již nikdy nedojde k alokaci ani probliknutí černé konzole cmd.exe.
- **Nový Startup Splash Screen**: Při spuštění aplikace (i po dokončení aktualizace) se zobrazí kompaktní elegantní mini-okno ve stylu IADonkey s oficiální ikonou maskota, verzí programu a indikátorem průběhu startu.
- **Živá indikace fází spouštění**: Plynulý indigovo-fialový progress bar a stavový text informují o fázích inicializace (načítání konfigurace, registrace klávesové zkratky `Ctrl+Alt+Space`, start služeb na pozadí a připravenost v oznamovací oblasti).
- **Plynulé skrytí do oznamovací oblasti**: Po dokončení inicializace mini-okno automaticky a plynule zmizí, přičemž aplikace běží připravena v tray liště pro okamžité vyvolání.
- **Chytré potlačení na pozadí**: Při automatickém startu se systémem Windows v tichém režimu (`--background`, `--silent`, `--hidden`) se splash okno nezobrazuje a uživatele neruší.

## [1.1.9] - 16. 9. 2026
### Full-Width layout instalačního průvodce a spolehlivá instalace
- **Full-Width moderní layout instalátoru**: Hlavička i patička nového instalátoru jsou roztaženy přes celou šířku okna pro čistý, prémiový a vzdušný vzhled.
- **Miniatura loga IADonkey v záhlaví**: Do horní lišty instalátoru byla doplněna miniatura oficiálního maskota IADonkey vedle názvu průvodce.
- **Přesun odznaku instalace bez UAC**: Odznak „Instalace bez UAC práv“ byl přesunut z bočního panelu do levé části globální patičky okna.
- **Bezpečné zamykání asar archivu**: Vyřešeno zamykání souboru `resources/app.asar` při instalaci náhradou monkey-patched `fs` za `original-fs`.
- **Atomický rename-swap a bezpečné ukončení instancí**: Pokročilé filtrování běžících instancí zabraňuje nechtěnému pádu instalátoru.

## [1.1.8] - 16. 9. 2026
### Vyladěný design instalátoru a oprava stability instalace
- **Větší a prostornější okno instalátoru**: Šířka zvětšena na 860 px a výška na 580 px pro optimální čitelnost a vzdušnost.
- **Oficiální ikona IADonkey**: V záhlaví instalátoru je umístěno oficiální logo aplikace IADonkey namísto obecné ikony rakety.
- **Čistý design kroků bez rušivých prvků**: Odstraněna vertikální spojovací čára a záře (glow) kolem aktivního kroku. Zvýšeno vertikální odsazení mezi jednotlivými kroky.
- **Větší a lépe čitelná typografie**: Zvětšeny fonty názvů a popisů kroků v postranním panelu, texty informačních bublin i popisky možností instalace.
- **Oprava pádu v kroku 3 (Instalace)**: Vyřešeno ukončování procesů v systému Windows, které v předchozí verzi nechtěně zasáhlo renderer instalátoru. Instalace nyní probíhá zcela plynule a spolehlivě od 0 do 100 %.

## [1.1.7] - 16. 9. 2026
### Moderní 4-krokový instalátor a blesková In-App aktualizace bez prodlevy
- **Samostatný moderní instalátor (React + Tailwind)**: Kompletní opuštění zastaralého Win32 NSIS. Nový instalátor je plnohodnotné tmavé frameless okno ve vizuálním stylu aplikace s vlastním záhlavím, ikonou s fialovou září a 4 přehlednými kroky (Vítejte → Nastavení cílové složky a zástupců → Průběh instalace s živým progress barem → Dokončeno se zaškrtávacím polem pro spuštění).
- **Plná systémová integrace do Windows**: Instalátor vytváří zástupce na Ploše a v nabídce Start pomocí Windows Script Host a registruje aplikaci do systémového Nastavení Windows (Přidat nebo odebrat programy) včetně korektní možnosti odinstalace.
- **Blesková In-App aktualizace (0.5s swap)**: Stažení i rozbalení aktualizace probíhá přímo v běžícím okně aplikace s živým tmavým progress barem a zobrazením fází rozbalování. Samotná výměna souborů při restartu trvá pouze 0,5 sekundy díky bleskovému swapu – uživatel již nikdy nečeká do prázdna ani nevidí žádná bílá okna.
- **Moderní odinstalátor**: Při odinstalaci přes systémové Nastavení se otevře moderní potvrzovací okno s čistým odebráním všech součástí programu a zástupců.

## [1.1.6] - 16. 9. 2026
### 100% tichý instalátor bez systémových oken a okamžitý start aplikace
- **Úplné potlačení systémového dialogu instalátoru**: Do jádra NSIS instalátoru byla přímo začleněna direktiva `SilentInstall silent`. Ani při ručním spuštění poklepáním v Průzkumníku Windows se již nezobrazuje žádné malé bílé systémové okénko s nápisem „Instaluje se, prosím vyčkejte...“ ani zelený proužek.
- **Okamžitý a plynulý start aplikace**: Po tichém rozbalení souborů na pozadí (cca 1–2 sekundy) instalátor rovnou spustí novou verzi aplikace IADonkey.
- **Bezpečné spuštění ze starších verzí**: Zajištěna plná zpětná kompatibilita při aktualizaci ze starších sestavení, která nepředávají tichý parametr – instalátor sám vynucuje tichý režim.

## [1.1.5] - 16. 9. 2026
### Tichá aktualizace na pozadí a moderní 1-Click instalátor
- **Tichá aktualizace na pozadí (Silent Background Update)**: Při kliknutí na „Restartovat a spustit novou verzi“ se již nezobrazuje zastaralý vícekrokový Win32 průvodce instalací. Aplikace se ukončí, instalátor během 1–2 sekund zcela tiše a neviditelně přepíše soubory (`/S --force-run --updated`) a novou verzi automaticky spustí.
- **Přechod na moderní 1-Click instalátor (`oneClick: true`)**: Při ručním spuštění nově staženého instalátoru (`.exe`) z GitHubu se aplikace nainstaluje na jediné kliknutí přímo do profilu uživatele bez zdržujících dialogů, bílých rámů a systémových tlačítek. Pro vlastní umístění je k dispozici Portable verze.
- **Čistý a nerušený zážitek**: Veškerá vizuální prezentace, novinky a seznam změn verze jsou zobrazovány přímo v nativním a plně přizpůsobeném tmavém prostředí aplikace (okno „Co je nového“ s barevnými akcenty a animacemi).

## [1.1.4] - 16. 9. 2026
### Kompletní vizuální redesign instalátoru Windows (NSIS) do tmavého motivu
- **Vizuální redesign instalačního průvodce Windows (NSIS)**: Instalační okno (`.exe`), které se spouští při ruční instalaci i po automatickém stažení aktualizace, bylo kompletně přestylováno do tmavého motivu odpovídajícího oknu Nastavení aplikace (`#1E1E28`).
- **Bezešvé bitmapové podklady**: Podkladové grafické prvky levého panelu (`installerSidebar.bmp`) i záhlaví (`installerHeader.bmp`) mají přesnou barvu `#1E1E28` a plynule navazují na podklad dialogu, čímž vzniká jednolitý a vizuálně čistý celek bez bílých okrajů.
- **Zaoblená karta s ikonou a ambientní záře**: Ikona IADonkey je na bočním panelu i v záhlaví prezentována v elegantní zaoblené kartě s jemnou indigo září (`#6366F1`) a vertikálním akcentním žebrem.
- **Tmavé ladění dialogů a ovládacích prvků**: Klientská plocha, výběr cílové složky i instalační ukazatel průběhu jsou sladěny do tmavých odstínů s indigo ukazatelem instalace.
- **Odstranění rušivých prvků**: Skryty ostré šedé Win32 horizontální linky a upraven brandingový text.

## [1.1.3] - 16. 9. 2026
### Vlastní snippety, import/export, katalog Material Symbols, plynulá synchronizace a vyladění UI
- **MLog číselné dotazy již od 3 číslic**: Zadání např. `123` do Spotlightu při aktivním MLogu automaticky nabídne úkol `T123` na 1. místě a požadavek `R123` na 2. místě.
- **Odstranění štítku „Aktuální sestavení“**: V záložce *Aktualizace* odstraněn nadbytečný badge pod nainstalovanou verzí.
- **Zpřesnění textu v okně aktualizace**: Úprava textu na *„Přehled všech změn po aktualizaci naleznete v aplikaci v záložce Nastavení -> Kompletní changelog.“*.
- **Oprava ikony v okně „Co je nového“**: Ikona hvězdiček se již při dlouhém titulku verze nezmenšuje ani nedeformuje.
- **Zdroje dat – tlačítko „Znovu načíst pole“**: Přidána ochrana proti nechtěnému zalomení textu tlačítka (`whitespace-nowrap`).
- **Průvodce „Jak na zdroje dat“**:
  - Ukázka č. 3 (Git) přestylována do zelené barvy rozšíření GitHub.
  - Bod 3 u MagicGate XML modelu upraven tak, že popisuje načítání všech dostupných atributů a metadat z XML.
  - Svislé vycentrování zavíracího křížku v záhlaví okna.
- **MagicGate XML model – podpora elementů `<Alias>`**: Při načítání podpoložek instancí MagicGate jsou nově kromě elementů `<App>` a `<Check>` načítány i elementy `<Alias Name="..." Url="..." />` se stejným mapováním a funkcionalitou (otevření URL, načítání favicony atd.).
- **Nastavení – záložka Obecné**:
  - Popisek formulářového pole zkrácen na *Adresa*.
  - Nápověda snippetů zpřesněna o informaci, že hodnota se přímo zkopíruje do schránky.
- **Historie verzí (Changelog)**: Stručný popis verze přesunut na samostatný řádek nad seznam odrážek pro vyšší čitelnost.
- **Zdroje dat – barva ikony v mapování**: Ikona u nadpisu sekce *Mapování polí JSONu* sladěna do vybrané primární barvy motivu.
- **Osobní snippety**: Přidáno nové pole *Moje Jméno* (zkratky `:jmeno`, `:jméno`, `:name`), *Moje DIČ* (`:dic`, `:dič`, `:vat`) a *Můj E-mail* (`:email`, `:mail`, `:e-mail`). Všechny osobní snippety jsou sjednoceny v Nastavení i Spotlightu na *Moje IČO*, *Moje DIČ*, *Moje Jméno*, *Můj E-mail*, *Můj Telefon*, *Můj Podpis* a *Moje Adresa*.
- **Karta výsledku testu GitHubu nad tlačítkem**: Výsledek testu i čárkovaný placeholder přesunuty přímo nad tlačítko *Otestovat připojení*. Zrušen samostatný řádek organizací a štítky přesunuty přímo za jméno profilu; vpravo přidán svisle vycentrovaný přehled počtu repozitářů s velkou číslicí; profilová fotka svisle vycentrována s celou kartou.
- **Věrná simulace Spotlight náhledu ve zdrojích dat**: Náhled 1. položky s aktuálním mapováním v JSON zdrojích nyní přesně simuluje vzhled skutečného řádku Spotlightu včetně ikony položky, štítku akce a klávesy provést.
- **Ochrana před kolizí globální zkratky**: V záložce *Obecné* je zamezeno nastavení rezervovaných klávesových zkratek uvedených v nápovědě (`Shift+Enter`, `Alt+Enter`, `Ctrl+Enter`, `Ctrl/Alt+Backspace`, šipky, `Escape`). V případě kolize se nová zkratka nezapíše, zůstane zachována původní funkční a uživateli se zobrazí červená chybová hláška s důvodem kolize.
- **Komponenta výběru ikon a vylepšení vyhledávání Material Symbols**:
  - Všechna vstupní pole pro zadání ikony vybavena komponentou `IconPickerInput`.
  - V modálu výběru ikon zrušeno zbytečné filtrování kategorií pro čisté a rychlé vyhledávání.
  - Implementováno inteligentní relevanční vyhledávání ikon (přesná shoda na 1. místě, prefix názvu, slova v názvu, tagy) – hledání např. výrazu „book“ již netlačí nesouvisející ikony dopředu a prioritně vrací `book`, `bookmark`, `bookmarks` atd.
  - Odstraněny veškeré duplicity ikon v katalogu i mezipaměti (vyloučeny nekompatibilní staré rodiny fontů a zavedena striktní deduplikace dle názvu).
  - Tlačítko pro ruční stažení kompletního online katalogu Material Symbols z Google Fonts s evidencí data, času a počtu ikon přesunuto na konec záložky *Nastavení -> Zdroje dat* do nové sekce *Externí nástroje* a jeho vizuální styl (velikosti písma, štítky, tlačítko) sjednocen s kartami v záložce *Rozšíření*.
  - Vyladěn layout modálu výběru ikon: zvětšen font vyhledávacího pole (14px), zvětšena velikost ikon na 32px (`text-3xl`), zvětšen font popisků ikon (`text-[11px]`) a mřížka nastavena na 6 ikon na řádek.
- **Primární barva ikon pro podpoložky (Alt+Enter)**: Ve Spotlightu se ikony podpoložek vždy vykreslují ve vybrané primární barvě motivu z Nastavení. Z rozšíření (např. MagicGate nebo Git) se přebírá pouze příslušný štítek (chip); výchozí či převzaté ikony (např. při nenačtené faviconě) se již nezbarvují do žluté ani zelené barvy rozšíření.
- **Vertikální vycentrování křížku zavření v okně Kompletního seznamu**: Zavírací tlačítko v hlavičce modálu `SearchItemsViewerModal` je nyní přesně vertikálně vycentrováno (`self-center`, fixní rozměr 36x36 px, vycentrovaná ikona `close`).
- **Zpřesnění výpočtu a zobrazení součtu položek (Kompletní seznam a Nastavení)**:
  - Odstraněna optická chyba součtu způsobená tím, že položky z Gitu byly dříve započítány dvakrát (v hlavních položkách i v samostatném čipu z Gitu).
  - Všechny kategorie jsou nyní striktně disjunktní a jejich součet přesně odpovídá celku: `[hlavních] + [z Gitu] + [snippetů] + [subpoložek] = [celkem]` (např. 405 hlavních + 87 z Gitu + 16 snippetů + 175 subpoložek = 683 celkem).
  - V záložce *Nastavení -> Zdroje dat* zobrazen čistý celkový počet načtených položek bez nadbytečných závorek.
- **Plynulý stav synchronizace a progress bar ve Zdrojích dat**:
  - Při spuštění synchronizace dat se v banneru skryje bublina s časem poslední aktualizace a na jejím místě se zobrazí živý stav (název synchronizovaného zdroje, procenta a plynulý barevný progress bar).
  - Průběh je plynule animován s minimální dobou trvání 2 sekundy (stejně jako u synchronizace přes ikonu ve Spotlightu), po dokončení krátce potvrdí úspěch a následně znovu zobrazí bublinu s čerstvě aktualizovaným časem.
- **Resetování posuvníku při přepínání záložek v Nastavení**: Při přechodu na jakoukoliv záložku v levém menu se posuvník obsahu automaticky vrátí na začátek (`scrollTop = 0`).
- **Kompaktní tlačítko automatické detekce (VS Code a Android Studio)**: U konfigurace cesty k VS Code i Android Studiu byl text tlačítka *Automaticky detekovat* nahrazen kompaktní čtvercovou ikonkou hvězdiček (`auto_awesome`) s vysvětlujícím tooltipem.
- **Samostatná záložka „Snippety“ v Nastavení**:
  - Původní sekce osobních snippetů přejmenována na **Předdefinované osobní údaje** (vlastní podpis, IČO, DIČ, jméno, e-mail, telefon, adresa).
  - Přidána zcela nová sekce **Vlastní snippety** umožňující vytvářet libovolné textové zkratky a šablony s rozhraním: výběr ikony z Material Symbols, název snippetu, víceřádkový text k rychlému zkopírování do schránky a dynamické štítky zkratek (`shortcuts[]`) s fixní dvojtečkou `:` a tlačítkem pro přidání/odebrání.
  - Vlastní snippety plně sdílejí jednotný model systémových snippetů (`action: 'copy'`, `sourceId: 'snippet'`), okamžitě reagují ve Spotlightu pod dvojtečkou a automaticky se započítávají do celkových indexovaných položek.
  - Tlačítko *Přidat snippet* nyní vkládá nový záznam vždy na začátek seznamu (prepend) pro okamžitou editaci bez nutnosti scrollovat dolů.
  - Přidána tlačítka pro **Exportovat** a **Importovat** vlastní snippety ve formátu JSON: export ukládá čistou strukturu s názvy, obsahem, ikonami a zkratkami, zatímco import načte data ze souboru, přiřadí nová ID, zvaliduje zkratky a bezpečně snippety přidá do konfigurace bez nutnosti vytvářet databázovou či souborovou vazbu zdroje. Akční tlačítka (Importovat, Exportovat, Přidat snippet) jsou umístěna na samostatném řádku pod popiskem a zarovnána doleva.
  - Vyladěn řádek zkratek u snippetů: zvětšena ikona štítku (`17px`), zvětšen font popisků, štítků zkratek i vstupního pole na čitelnější velikost (`text-xs`) a všechny prvky sjednoceny na jednotnou výšku (`h-7`) s nulovým offsetem linky (`leading-none`) pro dokonalé vertikální vycentrování v ose Y.
- **Odstranění zápatí v menu Nastavení**: Z levého navigačního sloupce Nastavení bylo odstraněno duplicitní zápatí s informací o poslední aktualizaci dat (tato informace je přehledně zobrazena přímo v záložce *Zdroje dat*).
- **Tlačítka „Procházet...“ otevírají průzkumník v aktuální cestě**: Všechna tlačítka pro výběr souborů i složek (JSON datové zdroje, MagicGate XML konfigurace, výchozí složka repozitářů GitHubu, dialog klonování repozitářů, spustitelné soubory VS Code a Android Studio) nyní berou v potaz již vyplněnou cestu (`defaultPath`). Nativní dialog souborového průzkumníka se otevře přímo ve vybrané složce či u daného souboru (případně v nadřazené existující složce) a je vždy korektně modálně navázán na aktivní okno.
- **Příprava grafického designu instalátoru**: Vytvořeny bitmapy pro hlavičku a uvítací panel Windows NSIS instalátoru v tmavém motivu IADonkey.
- **Oprava ukončení aplikace při instalaci aktualizace**: Při instalaci nové verze se nyní korektně uvolní zámek instance Electronu, zničí okna i ikona v oznamovací oblasti (Tray) a starý proces se čistě ukončí před spuštěním instalátoru, což spolehlivě zabrání nežádoucímu opětovnému otevření staré verze.

---

## [1.1.2] - 15. 9. 2026
### Rozšíření Android Studio, vylepšení MLog číselných dotazů, editor statických dat a vyladění UI
- **Rozšíření Android Studio**: Vyhrazená integrace pro prostředí Android Studio s růžovou identitou (`pink`), možností automatické detekce standardních cest / JetBrains Toolboxu nebo ručního nastavení cesty ke `studio64.exe`.
- **Inteligentní volba editoru (Android Studio vs VS Code)**: Aplikace nabízí buď VS Code, nebo Android Studio – nikdy oboje současně. Pokud GitHub repozitář používá programovací jazyk Kotlin nebo Java, zobrazí se tlačítko *Otevřít v Android Studiu*. Pro webové repozitáře a instance MagicGate se vždy nabízí VS Code.
- **Tlačítko Android Studia v nabídce Akcí i v okně klonování**: Možnost okamžitého otevření mobilního projektu přímo z akcí položky (<kbd>Shift+Enter</kbd>) nebo po dokončení stahování repozitáře.
- **Číselné dotazy MLogu na 4+ číslic (např. `2111`)**: Pokud je zapnuté rozšíření MLog a dotaz ve Spotlightu obsahuje pouze 4 nebo více číslic, automaticky se nabídne na 1. místě úkol **T2111** (*Otevřít úkol T2111 v MLogu*) a na 2. místě požadavek **R2111** (*Otevřít požadavek R2111 v MLogu*) včetně vizuální aktivace MLog režimu s ikonou `support_agent`.
- **Sjednocení cílové složky MagicGate repozitářů**: Klonované repozitáře sekcí instancí MagicGate se nyní stahují a detekují v přehledné podsložce `{defaultCloneDir}/magicgate/{instanceName}`.
- **Plynulý reset vyhledávače při otevření v editoru**: Po kliknutí na otevření repozitáře ve VS Code nebo Android Studiu z okna klonování se Spotlight kompletně skryje a zresetuje do výchozího stavu.
- **Zachování fokusu při návratu ze subpoložek (Alt+Enter)**: Při zavření subpoložek zpět do vyhledávače zůstane vybraná původní položka namísto přeskočení na začátek seznamu.
- **Zpřehlednění nabídky akcí repozitářů**: Odstraněna redundantní položka rekurzivního klonování (obslouženo přepínačem v dialogu stahování) a akce *Otevřít na GitHubu* je umístěna na konec nabídky.
- **Editor položek statických dat**: Pole *Název* i pole *Cesta / URL / Obsah* (`location`) roztaženo na 100 % šířky; pole `location` změněno na víceřádkový editor (`textarea`) akceptující a zachovávající odřádkování.
- **Resetování posuvníku v průvodci "Jak na zdroje dat"**: Při přepínání mezi záložkami v modálním okně průvodce se posuvník automaticky vrátí na začátek obsahu.
- **Vyladění barevného design systému**: Důsledné dodržení sekundární barvy v okně klonování repozitářů i v informačním boxu vyhledávače.

---

## [1.1.1] - 14. 9. 2026
### Rozšíření (GitHub, VS Code), systém akcí a informací, klonování repozitářů a barevný design systém
- **Záložka Rozšíření**: Nová vyhrazená sekce v Nastavení pro zapínání/vypínání modulů MagicGate, MLog, GitHub a VS Code bez ztráty existující konfigurace.
- **Integrace GitHubu**: Automatické načtení osobních i organizačních repozitářů přes GitHub Personal Access Token s podporou vlastní GitHub API URL.
- **Systém Akcí položek (Shift+Enter)**: Nové rozšířené menu pro položky nabízející přímé akce (otevření repozitáře na webu, klonování i rekurzivní stažení repozitáře).
- **Samostatné okno pro klonování repozitářů**: Klonování repozitářů (GitHub i MagicGate) se otevírá v samostatném systémovém okně s možností minimalizace a zavření křížkem, výběrem cílové složky a živým streamováním průběhu.
- **Potvrzení stažení klávesou Enter**: V okně klonování repozitářů lze stahování okamžitě spustit stiskem klávesy <kbd>Enter</kbd>.
- **Sjednocené barvy dialogu klonování**: Stavový box průběhu, spinner, tlačítko výběru složky i tlačítko pro otevření složky v Průzkumníku jsou sladěny do sekundární barvy motivu bez rušivých glow efektů.
- **Klonování repozitářů instance MagicGate**: Nové akce na <kbd>Shift+Enter</kbd> u MagicGate instancí (*Klonovat repozitáře instance...* a *Klonovat repozitáře rekurzivně...*). Aplikace se dotáže Administrace instance přes `CmsFsContentHandler.ashx`, zjistí repozitáře sekcí, automaticky odvodí názvy podsložek a nabídne hromadné stažení s vytvořením `repos.json`.
- **Rozšíření Visual Studio Code (VS Code)**: Nová vyhrazená integrace v Nastavení s možností zadání cesty a automatické detekce spustitelného souboru `Code.exe` / `code.cmd`.
- **Blesková tichá detekce existujících repozitářů**: Okamžitá kontrola stažených projektů ve výchozí cílové složce bez blokování uživatelského rozhraní (< 1 ms).
- **Akce Otevřít ve VS Code**: Pokud již repozitář ve výchozí cílové složce existuje a rozšíření VS Code je aktivní, nabídne se v akcích položky (<kbd>Shift+Enter</kbd>) možnost okamžitého otevření ve VS Code se specifickým petrolejovým zvýrazněním.
- **Chytré otevření ve VS Code při chybě klonování**: Pokud se uživatel pokusí stáhnout repozitář do již existující neprázdné složky, zobrazí se v chybovém hlášení i v patičce tlačítko pro okamžité otevření ve VS Code.
- **Rychlá zkratka Ctrl+Backspace**: Ve Spotlight vyhledávači stisk <kbd>Ctrl+Backspace</kbd> okamžitě kompletně vymaže vyhledávací pole.
- **Systém Informací (info) u položek**: Zobrazení podrobných parametrů (databáze, server, mlog požadavek, cesty k souborům, zálohy apod.) v kompaktním panelu přímo nad akcemi na <kbd>Shift+Enter</kbd> s možností okamžitého zkopírování hodnoty do schránky.
- **Oprava posuvníku a plynulé scrollování akcí**: Při navigaci šipkami na klávesnici v nabídce akcí se okno automaticky plynule posouvá i při zobrazených informacích o položce.
- **Přesun subpoložek na Alt+Enter**: Původní zobrazení subpoložek (options) přesunuto na klávesovou zkratku <kbd>Alt+Enter</kbd>; u Git repozitářů byla odstraněna stará logika klonování z voleb ve prospěch nového menu Akcí.
- **Rychlé prefixy `git:` a `magicgate:` (`mg:`)**: Zadáním prefixu okamžitě filtrujete výhradně v repozitářích nebo instancích s dynamickou změnou ikony a nápovědy.
- **Vizuální aktivace MLog režimu**: Při zadání kódu požadavku či úkolu (např. `T1`, `T12`, `R123`) nebo prefixu `mlog:` se vyhledávací pole okamžitě vizuálně přepne do indigo režimu s ikonou `support_agent`.
- **Závazná pravidla barevného systému (`docs/COLOR_RULES.md`)**: Striktní pravidla: semafor pro stavy (zelená, červená, žlutá), stálé vyhrazené barvy rozšíření (Git = fialová, MLog = indigo, MagicGate = zlatá/jantarová, VS Code = petrolejová) a přepracovaná paleta 10 vybraných moderních designových odstínů pro uživatelský výběr motivu.
- **Banování položek a správa Banlistu**: V Kompletním seznamu lze libovolnou položku jedním kliknutím zabanovat a v nové záložce *Banlist* spravovat zabanované položky s možností jejich obnovení.
- **Nový interaktivní průvodce "Jak na zdroje dat"**: V Nápovědě dostupné modální okno s kompletní specifikací JSON/TypeScript schématu položek, podporovaných akcí a ukázek.
- **Plynulý návrat do vyhledávače (Spotlight)**: Po zavření okna klonování se automaticky znovu aktivuje a zaměří vyhledávač se zachovaným dotazem i pozicí.



---

## [1.0.1] - 11. 9. 2026
### Kompletní seznam položek, vyhledávání bez diakritiky a MagicGate XML
- **Kompletní seznam položek**: Nové přehledné modální okno v Nastavení zobrazující všechny indexované položky seřazené prioritně (shodně se Spotlightem) s filtry a počítadly.
- **Vyhledávání bez diakritiky**: Plná podpora psaní s diakritikou i bez (např. `prik` okamžitě vyhledá `Příkazový řádek`) s inteligentním řazením podle začátků slov.
- **Import MagicGate z deploy XML**: Možnost nahrát XML konfiguraci ze serveru a automaticky vygenerovat instance a dílčí aplikace (Administrace, Web, API, BO) pro tichý login.
- **Globální zástupný symbol {favicon}**: Možnost použít `{favicon}` v poli pro ikonu s automatickým stahováním a ukládáním do mezipaměti.
- **Vyhledávač Centrum.cz**: Integrace vyhledávače Centrum.cz s prefixy `c:` a `centrum:`.
- **Vylepšené systémové snippety**: Snippety s prefixem `:` (čas, datum, rok, guid, podpis) s prioritou 0 a tyrkysovými čipy klíčových slov.
- **Sjednocení a vycentrování ikon**: Zmenšení a perfektní vycentrování Material ikon v přehledech tak, aby přesně odpovídaly rozměrům favicon a obrázků.
- **Plynulejší UX**: Automatické vrácení fokusu do vyhledávacího pole po zavření okna nastavení.

---

## [0.1.7] - 11. 9. 2026
### Samostatné aktualizace, detekce a mapování JSON zdrojů
- **Samostatná záložka Aktualizace**: Vyhrazená záložka v nastavení s ruční kontrolou nových verzí a zobrazením historie změn.
- **Detekce a mapování struktury JSON**: Inteligentní průzkumník struktury JSON s mapováním vlastních polí (název, odkaz, ikona, priorita apod.) na libovolné klíče JSONu.
- **Fixní hodnoty pro zdroje**: Možnost zadat fixní hodnotu pro položky zdroje (např. jednotnou ikonu) s živým náhledem prvního záznamu.
- **Rychlé kopírování URL API**: Tlačítko pro okamžité zkopírování adresy API endpointu do schránky v seznamu zdrojů.
- **Český formát času synchronizace**: Přehledné formátování v genitivu (např. *5. května 11:24:24*) v levém menu.
- **Automatické ukládání**: Všechny změny v nastavení se ukládají ihned v reálném čase.

---

## [0.1.6] - 11. 9. 2026
### Nativní programy Windows, Google Search a vylepšení UI
- **Prohledávání nainstalovaných aplikací**: Automatický scanner nabídek Start vyhledá klasické i moderní UWP/MSIX Store aplikace (Adobe XD, Kalkulačka, Windows Terminal apod.) s prioritou 99.
- **Nativní ikony**: Přímá extrakce originálních plnobarevných ikon programů ze spustitelných souborů i balíčků UWP.
- **Word boundary řazení**: Hledání podle začátků slov – např. zadáním `XD` se na 1. pozici okamžitě zobrazí `Adobe XD`.
- **Integrace Google Search**: Možnost okamžitého vyhledání dotazu na Google (priorita 100) i přímý prefix `google:`.
- **Předvolby v Nastavení**: Přepínače pro zapnutí/vypnutí vyhledávání programů a Google Search v záložce Obecné.
- **Oprava barev motivu**: Ikona API zdroje v seznamu zdrojů nyní správně přebírá zvolený barevný motiv.
- **Podpora podpoložek v MagicGate**: Záložka MagicGate se v Nastavení korektně zobrazí i tehdy, pokud je přihlášení nastaveno pouze u vnořených podvoleb.

---

## [0.1.5] - 10. 9. 2026
### Integrace MLog, Gmail, nová ikona a vylepšení UI
- **Automatické zobrazení při startu**: Vyhledávací pole (spotlight) okamžitě po spuštění aplikace vyskočí na obrazovku a zaměří textový kurzor.
- **Vlastní ikona aplikace**: Oficiální ikona IADonkey v hlavním panelu Windows (taskbaru), systémovém panelu (tray) i záhlaví všech oken.
- **Integrace helpdesku MLog**: Rychlé vyhledávání a otevírání požadavků (např. `R1234`) i úkolů (např. `T5678`) přímo z vyhledávače podle nastavené adresy v nové záložce MLog.
- **Integrace Gmailu**: Zadáním libovolné e-mailové adresy bez okolního textu (např. `alzbeta.radova@magicware.cz`) se okamžitě vygeneruje odkaz pro otevření nového konceptu zprávy v Gmailu s předvyplněným příjemcem.
- **Zpřehlednění ovládání**: Odstraněna redundantní tlačítka; kliknutím na chip s číslem verze se kdekoliv v aplikaci otevře historie změn.
- **Sjednocení šířky**: Záložka MLog nyní využívá plnou 100% šířku okna nastavení.
- **In-App aktualizace**: Přímé stahování nových verzí přímo v okně aplikace s ukazatelem průběhu v MB a možností okamžitého restartu do stažené verze.

---

## [0.1.2] - 10. 9. 2026
### Automatické aktualizace a distribuce
- **Automatická kontrola aktualizací**: Integrovaná kontrola nových verzí aplikace přes GitHub s automatickým stažením instalátoru a upozorněním v okně.
- **Okno novinek po aktualizaci**: Po prvním spuštění po aktualizaci se uživateli zobrazí srozumitelný přehled novinek.
- **Automatizace releasů**: Přidán skript pro jednokrokové sestavení, verzování, tagování a publikaci na GitHub.

## [0.1.1] - 10. 9. 2026
### Vlastní barvy, bezpečné zkratky a správa zdrojů
- **Vlastní barva aplikace**: Přidána možnost volby vlastní barvy aplikace v nastavení (včetně hex kódu i rychlých paletek) s okamžitým živým náhledem bez nutnosti restartu.
- **Bezpečné nastavení zkratky**: Při nahrávání klávesové zkratky je vyžadována minimálně dvojkombinace kláves. Stisk a puštění jediné klávesy vrátí původní zkratku a zobrazí upozornění.
- **Nerušivé zadávání**: Dočasné pozastavení původní zkratky během editace pole v nastavení (nedochází k nechtěnému vyvolání launcheru).
- **Přehlednější ikony**: Nové ikony pro lokální JSON soubory a tlačítko přidání souboru v nastavení.
- **Bleskový start okna**: Optimalizace startu okna nastavení bez problikávání výchozích barev.
- **Uživatelský changelog**: Přehledná historie verzí a zobrazení novinek po aktualizaci.

---

## [0.1.0] - 8. 9. 2026
### První verze launcheru IADonkey
- Rychlé vyhledávání a spouštění aplikací, webových adres a záložek.
- Globální vyvolání launcheru pomocí konfigurovatelné klávesové zkratky.
- Import dat z lokálních JSON souborů na disku a externích API endpointů.
- Podpora pro tichý a bezpečný login do MagicGate (systémy IS Tour).
- Podpora pro vnořené podpoložky (Shift+Enter pro rozbalení, Ctrl+Enter pro rychlé spuštění první volby).
- Integrovaná chytrá kalkulačka a přímé otevírání URL adres.
- Automatická synchronizace dat na pozadí s přehledným ukazatelem průběhu.
