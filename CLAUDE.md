# 360° Hjälptillägg – Projektkontextfil för Claude Code

## Utvecklingsmodell

Projektet utvecklas primärt genom **dialog med Claude Code** (Anthropic). Claude läser
hela kodbasen, föreslår och implementerar ändringar, committar och pushar till feature-brancher.

**För att lägga till eller ändra något:**
1. Beskriv önskad funktion eller ändring i klartext för Claude.
2. Claude identifierar relevanta filer, skriver koden och committar.
3. Granska diff/PR och be Claude justera vid behov.

**ROADMAP.md** innehåller planerade och föreslagna funktioner – uppdatera den i dialog
med Claude när nya idéer uppstår eller prioriteringar förändras.

Eftersom Claude har tillgång till hela kontextfilen (CLAUDE.md) och ROADMAP.md behöver
du inte förklara projektstrukturen eller tekniska detaljer – de finns dokumenterade här.

---

## Vad är det här projektet?

Ett Chrome-webbläsartillägg (Manifest V3) som automatiserar repetitiva arbetsmoment i
**360°** – det dokument- och ärendehanteringssystem (DMS/P360) som används av Svenska kyrkan.
Målgruppen är registratorer och handläggare inom Svenska kyrkans pastorat och stift.

Målet är att tillägget ska kunna distribueras till andra inom Svenska kyrkan, varför
koden ska vara välstrukturerad, lättläst och underhållbar.

## Teknisk plattform: 360° (Public 360 / TietoEvry)

- **URL-mönster:** `https://p360.svenskakyrkan.se/*`
- **Teknikstack:** ASP.NET WebForms
- **Formulärhantering:** Sidan använder `__doPostBack(eventTarget, eventArgument)` för
  i princip alla åtgärder. Denna funktion är global på alla sidor och kan anropas direkt
  från injicerat JavaScript utan att simulera klick.
- **Element-ID:n** är stabila och förändras inte mellan ärenden – däremot varierar
  `recno`-parametern i URL:en per ärende/dokument.
- **URL-struktur ärendesida:**
  `https://p360.svenskakyrkan.se/locator/DMS/Case/Details/Simplified/{subtype}?module=Case&subtype={subtype}&recno={recno}`

## Kända PostBack-nycklar (Ärendesida)

Alla anropas via:
```js
__doPostBack('ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu', '<nyckel>')
```

| Nyckel | Funktion |
|--------|----------|
| `key_innehallsforteckning` | Dagboksblad (Dagbok > Dagboksblad) |
| `EditCase` | Redigera egenskaper |
| `RegisterLoan` | Registrera utlåning |
| `SetScrapCode` | Gallring |
| `SaveCaseAsNew` | Spara som (nytt ärende baserat på detta) |
| `CopyHyperLink` | Kopiera hyperlänk |
| `OrderCaseSummary` | Producera ärendesammanfattning |
| `AddProgressPlan` | Tilldela processplan |

## Sätt status (dialog)

360° har **två URL-format** med olika PostBack-nycklar. Detektera via element-ID:

| URL-format | PostBack-nyckel |
|-----------|----------------|
| `/DMS/Case/Details/Simplified/...` | `CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK` |
| `/view.aspx?id=...` (stängda ärenden) | `SetStatusButton_DetailFunctionControl` |

```js
// Detektera format och anropa rätt PostBack
const harDetaljerFormat = document.getElementById(
  'PlaceHolderMain_MainView_CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK'
);
const nyckel = harDetaljerFormat
  ? 'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK'
  : 'ctl00$PlaceHolderMain$MainView$SetStatusButton_DetailFunctionControl';
__doPostBack(nyckel, '');
```

Dialogen laddas som en **iframe** (`/locator/DMS/Dialog/EditCaseStatus`).
Statusfältet är ett `<select>` med Selectize.js som UI-lager:
- Native select: `select#PlaceHolderMain_MainView_CaseStatusComboControl`
- Sätt värde via `select.selectize.setValue(value)` om Selectize är initialiserat,
  annars direkt på `select.value`

| Värde | Text |
|-------|------|
| `5`   | B - Öppet |
| `6`   | A - Avslutat |
| `8`   | M - Makulerat |
| `17`  | AH - Avslutat från handläggare |

OK-knapp: `#PlaceHolderMain_MainView_Finish-Button` (type=submit)
Avbryt: `__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'cancel')`

## Skapa nytt ärende – teknisk kartläggning

### POST-URL och formulärstruktur

Formuläret "Nytt ärende" laddas i en iframe inuti en modal dialog. Subtype 61000 = "Ärende".

```
POST https://p360.svenskakyrkan.se/locator/DMS/Case/New/61000
Content-Type: application/x-www-form-urlencoded
```

Dialogen öppnas initialt via en `GET`/`POST` mot:
```
/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf&dialogmode=true&IsDlg=1&context-data=subtype,Primary,61000...
```

### Formulärfält (element-ID → POST-nyckel)

| Element-ID | POST-nyckel (namn) | Typ | Obl. | Syfte |
|---|---|---|---|---|
| `PlaceHolderMain_MainView_JournalUnitComboControl` | `ctl00$...JournalUnitComboControl` | SELECT + Selectize | Ja | Diarieenhet |
| `PlaceHolderMain_MainView_CaseSubArchiveComboControl` | `ctl00$...CaseSubArchiveComboControl` | SELECT + Selectize | Ja | Delarkiv |
| `PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY` | `ctl00$...ClassificationCode1ComboControl_DISPLAY` | INPUT text (typeahead) | Ja | Klassificering – synligt |
| `PlaceHolderMain_MainView_ClassificationCode1ComboControl` | `ctl00$...ClassificationCode1ComboControl` | INPUT hidden | Ja | Klassificering – recno-värde |
| `PlaceHolderMain_MainView_PaperDocAllowedComboControl` | `ctl00$...PaperDocAllowedComboControl` | SELECT + Selectize | Nej | Sparat på papper |
| `PlaceHolderMain_MainView_AccessCodeComboControl` | `ctl00$...AccessCodeComboControl` | SELECT + Selectize | Ja | Skyddskod |
| `PlaceHolderMain_MainView_AccessGroupComboControl` | `ctl00$...AccessGroupComboControl` | SELECT + Selectize | Ja | Åtkomstgrupp |
| `PlaceHolderMain_MainView_TitleTextBoxControl` | `ctl00$...TitleTextBoxControl` | TEXTAREA | Ja | Ärendetitel |
| `PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl` | `ctl00$...ResponsibleOrgUnitComboControl` | SELECT + Selectize | Ja | Ansvarig enhet |
| `PlaceHolderMain_MainView_ResponsibleUserComboControl` | `ctl00$...ResponsibleUserComboControl` | SELECT + Selectize | Nej | Ansvarig person |
| `PlaceHolderMain_MainView_StatusCaseComboControl` | `ctl00$...StatusCaseComboControl` | SELECT + Selectize | Ja | Status |

Alla synliga dropdowns använder **Selectize.js** (jQuery 3.6.1). Sätt värden via:
```js
element.selectize.setValue('200171')
```

### Dropdown-värden

> **Instansspecifika värden:** Följande fält varierar **per enhet inom Svenska kyrkan**
> (pastorat, stift, samfällighet) och ska **aldrig hårdkodas** i tillägget:
> - `JournalUnitComboControl` – Diarieenhet
> - `AccessGroupComboControl` – Åtkomstgrupp
> - `ResponsibleOrgUnitComboControl` – Ansvarig enhet
> - `ResponsibleUserComboControl` – Ansvarig person
>
> Dessa värden måste antingen läsas dynamiskt från formulärets `<select>`-element
> eller konfigureras per användare i mallinställningarna.
> Skyddskod, status, delarkiv och paragraflistor är generella och stabila.

**Skyddskod (AccessCodeComboControl):**
| Värde | Text |
|-------|------|
| `0` | Offentlig (default) |
| `100031` | Sekretess KO |
| `100032` | Sekretess OSL |

#### Sekretessfält – KO och OSL

Att byta `AccessCodeComboControl` till KO (`100031`) eller OSL (`100032`) triggar en
server-side UpdatePanel-uppdatering via:
```js
// onchange-attributet på AccessCodeComboControl:
javascript:setTimeout('__doPostBack(\'ctl00$PlaceHolderMain$MainView$AccessCodeComboControl\',\'\')', 0)
```
Servern returnerar ett partiellt HTML-svar (ASP.NET ScriptManager UpdatePanel) som
injicerar tre–fyra nya fält i formuläret. Det är **inte** klientside-JS som visar/döljer
element – det är ett fullt tur-retur-POST till samma `/view.aspx`-URL.

**Fält 1 – Paragraf** *(obligatorisk)*

| Egenskap | Värde |
|---|---|
| Element-ID | `PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl` |
| POST-nyckel | `ctl00$PlaceHolderMain$MainView$AccessCodeAuthorizationComboControl` |
| Typ | SELECT + Selectize.js |
| onchange | `__doPostBack('ctl00$PlaceHolderMain$MainView$AccessCodeAuthorizationComboControl', '')` |

KO-paragrafer (urval av 25 alternativ):

| value | text |
|---|---|
| `Kyrkoordningen 54 kap. 2 §` | K - 54 kap. 2 § - Enskilds personliga förhållanden i kyrkans församlingsvårdande verksamhet |
| `Kyrkoordningen 54 kap. 3 §` | K - 54 kap. 3 § - Enskild givare i kyrkans insamlingsverksamhet |
| `Kyrkoordningen 54 kap. 4 §` | K - 54 kap. 4 § - Anställds eller förtroendevalds personliga förhållanden inom kyrkans personaladministration |
| `Kyrkoordningen 54 kap. 4 a §` | K - 54 kap. 4 a § - Enskilds personliga förhållanden i kyrkans tillsyns- och överprövningsverksamhet |
| `Kyrkoordningen 54 kap. 4 b §` | K - 54 kap. 4 b § - Enskilds personliga förhållanden... |
| `Kyrkoordningen 54 kap. 4 c §` | K - 54 kap. 4 c § - Enskilds bostadsadress eller annan jämförbar uppgift |
| `Kyrkoordningen 54 kap. 4 d §` | K - 54 kap. 4 d § - Enskilds personliga eller ekonomiska förhållanden i statistikverksamhet |
| `Kyrkoordningen 54 kap. 4 e §` | K - 54 kap. 4 e § - Förbud i familjerådgivning mot att röja uppgifter |
| `Kyrkoordningen 54 kap. 5 §` | K - 54 kap. 5 § - Förbud i affärsverksamhet mot att röja driftsförhållanden |
| `Kyrkoordningen 54 kap. 6 §` | K - 54 kap. 6 § - Uppgifter som hänför sig till ärende om förvärv m.m. |
| `Kyrkoordningen 54 kap. 7 §` | K - 54 kap. 7 § - Uppgifter om affärs- och driftsförhållanden |
| `Kyrkoordningen 54 kap. 8 §` | K - 54 kap. 8 § - Uppgifter om samarbetspartners förhållanden i kyrkans internationella verksamhet |
| `Kyrkoordningen 54 kap. 8 a §` | K - 54 kap. 8 a § - Uppgifter om enskilds personliga förhållanden i klagomålshantering |
| `Kyrkoordningen 54 kap. 8 b §` | K - 54 kap. 8 b § - Uppgifter om ekumeniska och interreligiösa förbindelser |
| `Kyrkoordningen 54 kap. 9 §` | K - 54 kap. 9 § - Uppgifter om enskilda personer i kyrkobokföringen |
| `Kyrkoordningen 54 kap. 10 §` | K - 54 kap. 10 § - Uppgifter om säkerhets- och bevakningsåtgärder |
| `Kyrkoordningen 54 kap. 10 a §` | K - 54 kap. 10 a § - Förbud mot att röja uppgifter som avser Svenska kyrkans beredskap |
| `Kyrkoordningen 54 kap. 11 a §` | K - 54 kap. 11 a § - Uppgifter som har tillkommit för facklig förhandling |
| `Kyrkoordningen 54 kap. 11b §` | K - 54 kap. 11 b § - Personuppgifter i strid med dataskyddsförordningen |
| `Kyrkoordningen 54 kap. 11 c §` | K - 54 kap. 11 c § - Uppgifter i forskningsverksamhet direkt hänförliga till enskilde |
| `Kyrkoordningen 54 kap. 11 d §` | K - 54 kap. 11 d § - Uppgift om hur en väljare har röstat vid val |
| `Kyrkoordningen 54 kap. 12 §` | K - 54 kap. 12 § - Uppgifter som en myndighet har anförtrott kyrkan |
| `Kyrkoordningen 54 kap. 13 §` | K - 54 kap. 13 § - Uppgift gäller hos den som tar emot uppgiften i revision/tillsyn |
| `Se kommentar` | Se kommentar |

OSL-paragrafer (9 alternativ):

| value | text |
|---|---|
| `OSL 18 kap. 8 §` | OSL 18 kap. 8 § - Säkerhets- eller bevakningsåtgärd |
| `OSL 19 kap. 1 §` | OSL 19 kap. 1 § - Affärs- och driftförhållanden |
| `OSL 19 kap. 3 §` | OSL 19 kap. 3 § - Upphandling m.m. |
| `OSL 21 kap. 7 §` | OSL 21 kap. 7 § - Behandling i strid med dataskyddsregleringen |
| `OSL 23 kap. 1 §` | OSL 23 kap. 1 § - Förskola och viss annan pedagogisk verksamhet |
| `OSL 40 kap. 7 a §` | OSL 40 kap. 7 a § - Begravningsverksamhet |
| `Lag 2018:218 1 kap. 8 §` | Lag 2018:218 1 kap. 8 § - Tystnadsplikt för dataskyddsombud |
| `Se kommentar` | Se kommentar |

**Fält 2 – Skydda kontakter** *(checkbox, ej obligatorisk)*

| Egenskap | Värde |
|---|---|
| Element-ID | `PlaceHolderMain_MainView_UnofficialContactCheckBoxControl` |
| POST-nyckel | `ctl00$PlaceHolderMain$MainView$UnofficialContactCheckBoxControl` |
| Typ | INPUT[type=checkbox] |
| Default | **Förbockad** (checked=true vid KO/OSL-val) |
| POST-värde checked | `on` |
| POST-värde unchecked | *skickas inte alls* (standard HTML-beteende) |

**Fält 3 – Val för offentlig titel** *(obligatorisk)*

| Egenskap | Värde |
|---|---|
| Element-ID | `PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl` |
| POST-nyckel | `ctl00$PlaceHolderMain$MainView$SelectOfficialTitleComboBoxControl` |
| Typ | SELECT + Selectize.js |
| onchange | `__doPostBack('ctl00$PlaceHolderMain$MainView$SelectOfficialTitleComboBoxControl', '')` |

| value | text |
|---|---|
| `1` | Sätt offentlig titel lika med titel |
| `2` | Skydda hela offentliga titeln |
| `3` | Skriv in offentlig titel manuellt |

**Fält 4 – Offentlig titel** *(visas bara om val = 3)*

| Egenskap | Värde |
|---|---|
| Element-ID | `PlaceHolderMain_MainView_PublicTitleTextBoxControl` |
| POST-nyckel | `ctl00$PlaceHolderMain$MainView$PublicTitleTextBoxControl` |
| Typ | TEXTAREA |
| Villkor | Visas **endast** när `SelectOfficialTitleComboBoxControl = 3` |
| Visas via | Server-side postback + UpdatePanel |

#### Implementeringsflöde för sekretess i Chrome-tillägget

Eftersom Paragraf och Offentlig titel laddas via UpdatePanel måste postbacks triggas
i rätt ordning – värden kan inte sättas direkt utan att vänta på serversvaret:

1. Öppna formuläret → hämta iframe och initialt ViewState
2. `AccessCodeComboControl.selectize.setValue('100031')` → triggar `onchange` → `__doPostBack` → vänta på UpdatePanel-svar (nya fält laddas)
3. `AccessCodeAuthorizationComboControl.selectize.setValue('Kyrkoordningen 54 kap. 4 §')`
4. `UnofficialContactCheckBoxControl.checked = true/false`
5. `SelectOfficialTitleComboBoxControl.selectize.setValue('1'/'2'/'3')` → om `3`: vänta på UpdatePanel → fyll `PublicTitleTextBoxControl.value`
6. Anropa `__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish')`

**Sparat på papper (PaperDocAllowedComboControl):**
| Värde | Text |
|-------|------|
| `0` | Nej (default) |
| `1` | Delvis |
| `-1` | Ja |

**Status (StatusCaseComboControl):** Se tabell i avsnittet "Sätt status" ovan.

**Delarkiv (CaseSubArchiveComboControl):** `100009` = Församling/pastorat (default, troligen generell)

### Klassificering (typeahead)

Klassificering är ett typeahead-fält. Sökning sker via PostBack:
```
__doPostBack('ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl_OnClick_PostBack', '')
```
mot `/Services/AjaxReaderService.asmx`. Det synliga fältet (`_DISPLAY`) sätts till
textrepresentationen (t.ex. `2.5 - Ge internt verksamhetsstöd`) och det dolda fältet
sätts till recno-koden.

> **Klassificeringskoder är generella** – de följer KSA (Kommunala Sektorns
> Arkivrekommendation) och bör vara desamma i alla Svenska kyrkans installationer av
> 360°. Recno-koden per klassificering kan däremot variera. I mall-gränssnittet låter
> man användaren söka och välja klassificering när mallen skapas, och sparar både
> visningsvärde och recno i `chrome.storage.local`.

### Spara-knappen

```js
// Knappen "Slutför" anropar:
__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish')
// vilket sätter __EVENTTARGET och __EVENTARGUMENT och submittar form1
```

I tillägget – anropa detta i iframe-kontexten:
```js
const doc = iframe.contentDocument;
doc.getElementById('__EVENTTARGET').value =
  'ctl00$PlaceHolderMain$MainView$WizardNavigationButton';
doc.getElementById('__EVENTARGUMENT').value = 'finish';
doc.getElementById('form1').submit();
```

### Diarienumret efter skapande

Servern returnerar 302 redirect till:
```
/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=[RECNO]
```

Diarienumret kan läsas på tre sätt i DOM efter redirect:

| Element-ID | Innehåll | Rekommenderat |
|---|---|---|
| `PlaceHolderMain_MainView_DetailDescription` | `Ärende: P 2022-0076` | Ja – enklast att parsa |
| `PlaceHolderMain_MainView_DetailTitle_generic` | `testärende` | Nej |
| `TopHeaderTitle` | `testärende\nÄrende: P 2022-0076` | Nej |

```js
// Läs diarienummer från DOM:
const diarieNr = document.getElementById('PlaceHolderMain_MainView_DetailDescription')
  ?.textContent.replace('Ärende: ', '').trim(); // => "P 2022-0076"

// Alternativt recno ur URL:
const recno = new URLSearchParams(window.location.search).get('recno');
```

### Tekniska hinder

| Hinder | Beskrivning | Lösning |
|--------|-------------|---------|
| `__VIEWSTATE` (~55 kB) | Måste hämtas färskt från formuläret – sessions- och tidsberoende | Hämta via `iframe.contentDocument.getElementById('__VIEWSTATE').value` precis innan POST |
| `BIFViewState` (GUID) | Session-GUID genereras per formulärinstans | Hämta från `[name*="BIFViewState"]` |
| `keepViewAlive`-pingning | Servern pingar var 30:e sekund – session dör annars | Håll formuläret öppet tills POST skickas |
| Klassificering | Kräver giltigt recno i hidden-fältet | Hårdkoda kända klassificeringskoder per mall |
| Selectize.js | Native `<select>` är dolt | Anropa `element.selectize.setValue(val)` |
| `Wizard_CheckSum` | Skickas som `%5Bobject%20HTMLTableElement%5D` | Skicka rakt av – verkar ej strikt validerat |
| Sekretessfält | Paragraf och offentlig titel laddas via UpdatePanel | Trigga postbacks i rätt ordning – se implementeringsflöde ovan |

---

## Flikar och externa kontakter i ärendeskapande-dialogen

> **Ej kartlagt – behöver undersökas via Chrome DevTools.**

### Flikar i guiden

Ärendeskapande-dialogen är troligen uppbyggd som en wizard med flikar eller steg.
Byte av flik sker sannolikt via postback – element-ID och mekanism behöver kartläggas.

**Känt:** Paragraf (`AccessCodeAuthorizationComboControl`) och Val för offentlig titel
(`SelectOfficialTitleComboBoxControl`) är sannolikt obligatoriska för att kunna gå
vidare till nästa flik vid KO/OSL-sekretess – servern blockerar förmodligen
flikbytet om dessa inte är ifyllda.

**Att kartlägga:**
- Element-ID och postback-nyckel för fliknavigering
- Hur servern signalerar valideringsfel vid flikbyte (felmeddelande-element?)
- Vilka flikar som finns och i vilken ordning

### Externa kontakter (oregistrerade)

Primär användning: lägga till **oregistrerade** externa kontakter (t.ex. privatpersoner
eller externa aktörer som inte finns i systemet). Att söka bland befintliga interna
kontakter bedöms som för omständigt för automatisering.

**Känt beteende:** Om en oregistrerad kontakt läggs till med samma namn som en befintlig
intern kontakt kan systemet varna och fråga om man avser den interna personen eller
vill fortsätta med den oregistrerade.

**Att kartlägga:**
- Flik/steg där kontakter läggs till
- Element-ID och postback-nyckel för att öppna "Lägg till oregistrerad kontakt"-dialog
- Formulärfält i kontaktdialogen (namn, adress, e-post m.m.) och deras element-ID
- Hur varningsdialogen (intern/oregistrerad) ser ut och hanteras
- POST-struktur för att spara en oregistrerad kontakt

---

## Hur man identifierar att man är på en ärendesida
```js
// Finns detta element → vi är på en ärendesida
document.getElementById(
  'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
)

// Alternativt: kolla URL-mönstret
window.location.pathname.includes('/DMS/Case/Details/')
```

## Dagboksblad – utskrift via Report Viewer

Dagboksbladet öppnas via PostBack-nyckeln `key_innehallsforteckning`. 360° anropar
`window.open()` med en URL till en rapport-sida som innehåller Microsoft Report Services
(MSRS) Report Viewer.

### Flöde i `triggerDagboksblad()` (page.js)

1. **Fånga popup-referensen** – `window.open` patchas tillfälligt för att fånga
   fönsterobjektet som 360° skapar. Återställs direkt efter första anropet.

2. **Vänta på Report Viewer** – Polla tills `popup.$find('ctl00_PlaceHolderMain_MainView_ReportView')`
   returnerar en instans (max 10 s). `$find` är en global ASP.NET-funktion i popup-fönstret.

3. **Visa utskriftsdialogen** – `rv.invokePrintDialog()` renderar MSRS utskriftsdialog
   i popup-fönstret. Dialogen innehåller:
   - `.msrs-printdialog-divprintbutton` – den röda Print-knappen
   - `.msrs-printdialog-downloadlink` – en `<a href="" download="">` med **tom** href

4. **Klicka Print-knappen** – `.msrs-printdialog-divprintbutton` klickas programmatiskt.
   Därefter populerar MSRS `href` på download-länken med en URL till
   `/Reserved.ReportViewerWebControl.axd` med dynamiskt `ControlID` och `rc:PrintOnOpen=true`.

5. **Polla tills href finns** – När `.msrs-printdialog-downloadlink` har ett `href`
   som innehåller `.axd` är PDF:en redo (max 20 s).

6. **Hämta som blob** – `fetch(pdfUrl, { credentials: 'include' })` hämtar PDF:en med
   sessionscookies. Servern sätter `Content-Disposition: attachment` vilket tvingar
   nedladdning om URL:en öppnas direkt. Blob-URL saknar detta header.

7. **Öppna i Chrome** – `URL.createObjectURL(blob)` skapar en blob-URL som öppnas med
   `window.open(blobUrl, '_blank')`. Chrome öppnar blob-URL:er alltid i inbyggd PDF-visare.

### Kända begränsningar

- Popup-fönster måste vara tillåtna för `p360.svenskakyrkan.se` i Chrome.
- Tillägget måste laddas om (`chrome://extensions`) efter kodändringar för att
  content scripts och service worker ska uppdateras.

## Snabbkommandon

| Kommando | Standardtangenter | Funktion |
|----------|------------------|----------|
| `dagboksblad-skriv-ut` | **Alt+Shift+D** | Hämtar och öppnar dagboksblad som PDF |
| `växla-status`         | **Alt+Shift+S** | Växlar status mellan Öppet och Avslutat |

Alla snabbkommandon är konfigurerbara via `chrome://extensions/shortcuts`.

## Projektstruktur
```
/
├── manifest.json          # Chrome Manifest V3
├── popup.html             # Tilläggets popup-UI
├── popup.js               # Logik för popup-knappar
├── content.js             # Injiceras på p360.svenskakyrkan.se (ISOLATED world)
├── page.js                # Injiceras i sidans eget scope (MAIN world) – har tillgång
│                          # till sidans globala JS-funktioner (t.ex. __doPostBack)
├── background.js          # Service worker – hanterar tangentbordskommandon
├── help.html              # Inbyggd hjälpsida (öppnas via "? Hjälp" i popup)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── CLAUDE.md              # Den här filen – projektkontextfil för Claude Code
└── ROADMAP.md             # Planerade och föreslagna funktioner
```

## Kodstil och konventioner

- Skriv vanilla JavaScript (ES2020+), inga externa beroenden eller bundlers
- Kommentera på **svenska** (användarna är svenska, koden ska vara tillgänglig för
  kyrkan som helhet)
- Alla användarsynliga texter ska vara på svenska
- Felmeddelanden ska vara tydliga och icke-tekniska
- Kontrollera alltid att rätt sida är aktiv innan en åtgärd utförs

## Säkerhet och begränsningar

- Tillägget ska **aldrig** lagra eller skicka iväg känslig information
- Inga externa API-anrop
- `content_scripts` matchar **enbart** `https://p360.svenskakyrkan.se/*`
- Tillägget ska inte störa normal användning av systemet

## Att lägga till nya funktioner

1. Identifiera `__doPostBack`-nyckeln för den aktuella funktionen (högerklicka på
   menyalternativet i 360° och inspektera `onclick`-attributet)
2. Lägg till knappen i `popup.html`
3. Lägg till klick-hanterare i `popup.js` som anropar `content.js` via
   `chrome.scripting.executeScript`
4. Uppdatera tabellen "Kända PostBack-nycklar" i den här filen

## Testning

Testa alltid tillägget inloggad i 360° på en ärendesida med ett testärende.
Kontrollera att:
- Knappen är synlig i popup
- Rätt dialog/sida öppnas i 360°
- Felmeddelande visas om man försöker använda funktionen utanför en ärendesida
