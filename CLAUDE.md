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

### Agentvänlig arbetsmodell (filstorlek och refaktorering)

För att hålla AI-arbete stabilt och undvika långa/tröga sessioner gäller följande:

- Håll filer fokuserade och tematiskt avgränsade.
- När en fil närmar sig **~400–500 rader** eller innehåller flera oberoende ansvar:
  föreslå och genomför uppdelning i mindre filer.
- Prioritera en tunn **router/entrypoint** och flytta domänlogik till separata filer.
- Uppdatera alltid `manifest.json` körordning och `CLAUDE.md` när filstruktur ändras.
- Undvik "mega-filer" där all MAIN-world-logik samlas i en enda `page.js`.

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

Paragraf och Offentlig titel laddas via UpdatePanel och kräver att man väntar på
serversvaret innan man sätter deras värden. **Verifierat beteende (2026-03-20):**

- **AccessCode-UpdatePanel återställer INGA befintliga fält** – titel, sparatPaPapper
  m.m. förblir intakta och kan sättas i valfri ordning relativt skyddskod-blocket.
- **Selectize på paragraf-fältet är initialiserat synkront** med UpdatePanel-svaret –
  ingen `setTimeout`/extra `sleep` behövs innan `setValue` anropas.
- **SelectOfficialTitleComboBoxControl** triggar ett eget nätverksanrop men återställer
  inte heller några befintliga fält.

1. `AccessCodeComboControl.selectize.setValue('100031')` → triggar `onchange` → `__doPostBack` → vänta på UpdatePanel-svar (paragraf-fältet dyker upp i DOM)
2. `AccessCodeAuthorizationComboControl.selectize.setValue('Kyrkoordningen 54 kap. 4 §')` ← Selectize är redo direkt, ingen sleep
3. `UnofficialContactCheckBoxControl.checked = true/false`
4. `SelectOfficialTitleComboBoxControl.selectize.setValue('1'/'2'/'3')` → om `3`: vänta på UpdatePanel → fyll `PublicTitleTextBoxControl.value`
5. Klicka fysisk Slutför-knapp (`PlaceHolderMain_MainView_WizardFinishButton`) – **inte** `form.submit()`, se avsnittet "Spara-knappen"

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

**VIKTIGT – Ordning i tillägget:** Klassificering måste sättas **före** skyddskod-blocket.
`ClassificationCode1ComboControl_OnClick_PostBack` (HiddenButton) triggar en UpdatePanel
som vid fel ordning nollställer paragraf-fältet (`AccessCodeAuthorizationComboControl`)
om skyddskod redan satts. Sätt klassificering via det dolda fältet + dropDownList-elementet
och kör HiddenButton-postbacken *innan* `AccessCodeComboControl` sätts.

### Spara-knappen

Knappen "Slutför" har element-ID `PlaceHolderMain_MainView_WizardFinishButton` och
anropar via `onclick`:
```js
__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish')
```

**KRITISKT:** Anropa **aldrig** `form.submit()` direkt i IsDlg=1/dialogmode-läge.
Det kringgår ASP.NET ScriptManager/PageRequestManager och ger `UnhandledError.aspx`.
Använd istället den fysiska knappen eller `__doPostBack` via PageRequestManager:

```js
// Rekommenderat – klicka den fysiska Slutför-knappen:
const slutförBtn = iDoc.querySelector(
  'input[onclick*="WizardNavigationButton"][onclick*="finish"]'
);
slutförBtn?.click();

// Alternativt – anropa __doPostBack direkt (PageRequestManager hanterar det):
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
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
| Klassificering – ordning | HiddenButton-postback nollställer paragraf om skyddskod redan satts | Sätt klassificering **före** skyddskod-blocket – se notering i klassificeringsavsnittet |
| `form.submit()` i IsDlg=1 | Kringgår ScriptManager → `UnhandledError.aspx` | Klicka fysisk knapp eller anropa `__doPostBack` så PageRequestManager hanterar det |
| Selectize.js | Native `<select>` är dolt | Anropa `element.selectize.setValue(val)` |
| `Wizard_CheckSum` | Skickas som `%5Bobject%20HTMLTableElement%5D` | Skicka rakt av – verkar ej strikt validerat |
| Sekretessfält | Paragraf och offentlig titel laddas via UpdatePanel | Trigga postbacks i rätt ordning – se implementeringsflöde ovan |
| Dialog close / navigering | 360° anropar `get_childDialog()` → `Resize()` → läser `IsLoading` – hur navigering sker efter finish är ännu ej fullständigt kartlagt | Se avsnittet "Dialog close-mekanism" nedan |

### Dialog close-mekanism efter finish-postback (verifierat 2026-03-23)

När `finish`-postbacken skickas via PageRequestManager anropar 360°:s interna
`ResizeDialogAuto(t)`-funktion `get_childDialog()` på `iWin.SI.UI.ModalDialog`.
Returvärdet (`t`) förväntas ha minst dessa egenskaper/metoder:

| Egenskap/metod | Vad 360° gör med den |
|---|---|
| `t.Resize()` | Anropas direkt – **måste finnas**, annars TypeError som avbryter sekvensen |
| `t.IsLoading` | Läses – om `true` väntar 360° ytterligare, om `false` fortsätter det |
| `t.commitPopup(returnValue)` | Anropas med returnvärde (recno/URL) när ärende är sparat |
| `t.cancelPopup()` | Anropas vid avbryt |

I tillägget: sätt `iframe.Resize = () => {}` (no-op) och `iframe.IsLoading = true`
så att 360° inte avbryter på TypeError. `commitPopup` på iframe-elementet anropas när
360°-dialogen är klar:

```js
iframe.Resize = () => {};
iframe.IsLoading = true;
iframe.commitPopup = (returnVal) => {
  const s = String(returnVal || '');
  if (s.includes('recno=') || s.includes('/DMS/')) {
    window.location.href = s;
  } else if (/^\d{5,}$/.test(s)) {
    window.location.href =
      `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${s}`;
  }
};
```

`get_childDialog()` måste patcas för att returnera iframe-elementet:
```js
const origGet = iWin.SI.UI.ModalDialog.get_childDialog?.bind(iWin.SI.UI.ModalDialog);
iWin.SI.UI.ModalDialog.get_childDialog = function() {
  return origGet?.() ?? iframe;
};
```

**Verifierat beteende (2026-03-23):** UpdatePanel-svaret från `view.aspx` (finish) innehåller
recno direkt i svarstexten som strängen `recno=<nummer>`. `commitPopup` anropas **inte** i
praktiken – `get_childDialog()` returnerar `undefined` i 360°:s interna kod och navigeringen
sker aldrig via det spåret. Tillägget läser recno ur XHR-svaret och navigerar direkt:

```js
// XHR-interceptor i iframe-fönstret:
const m = responseText.match(/recno[=:](\d+)/i);
if (m) window.top.location.href =
  `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${m[1]}`;
```

`commitPopup`, `cancelPopup` och `CloseCallback` finns kvar i koden som fallbacks
om 360° ändrar beteende i framtida versioner.

---

## Flikar och externa kontakter i ärendeskapande-dialogen

### Flikar i guiden

Ärendeskapande-dialogen är en wizard med 5 flikar. Alla flikar använder samma
`__EVENTTARGET` (`WizardNavigationButton`) och styr med `__EVENTARGUMENT`.

**Validering sker INTE vid flikbyte** – man kan fritt navigera mellan alla flikar med
tomma obligatoriska fält. Validering sker **enbart vid "Slutför"** (`finish`).

| Flik-LI-ID | Span-ID (rubrik) | Fliktext | `__EVENTARGUMENT` |
|---|---|---|---|
| `PlaceHolderMain_MainView_WizardView_TopMenu_tab_1` | `PlaceHolderMain_MainView_BIFWizard_step_0` | Generellt * | `GeneralStep` |
| `PlaceHolderMain_MainView_WizardView_TopMenu_tab_2` | `PlaceHolderMain_MainView_BIFWizard_step_1` | Externa kontakter | `ContactsStep` |
| `PlaceHolderMain_MainView_WizardView_TopMenu_tab_3` | `PlaceHolderMain_MainView_BIFWizard_step_2` | Interna kontakter | `OurTeamStep` |
| `PlaceHolderMain_MainView_WizardView_TopMenu_tab_4` | `PlaceHolderMain_MainView_BIFWizard_step_3` | Fastighet | `EstateStep` |
| `PlaceHolderMain_MainView_WizardView_TopMenu_tab_5` | `PlaceHolderMain_MainView_BIFWizard_step_4` | Kommentar | `NotesStep` |

Navigationsknapparna "Nästa" / "Slutför" använder samma mekanism:

| Knapp | `__EVENTARGUMENT` |
|---|---|
| Nästa | `next` |
| Slutför | `finish` |

**Kommentar-fältet (flik 5):**

| Element-ID | POST-nyckel | Typ |
|---|---|---|
| `PlaceHolderMain_MainView_NotesStep_Control` | `ctl00$PlaceHolderMain$MainView$NotesStep_Control` | TEXTAREA |

`onclick`-mönster på flik-`<li>`:
```js
SetCheckSumDetails(
  'PlaceHolderMain_MainView_Wizard_CheckSum',
  'PlaceHolderMain_MainView_WizardView_MainTable'
);
ChecksumEventHandler();
__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'ContactsStep');
```

POST-URL vid flikbyte är samma som formulärets:
```
POST https://p360.svenskakyrkan.se/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf
  &dialogmode=true&IsDlg=1&context-data=subtype,Primary,61000;...
```

### Felmeddelanden vid validering

Valideringsfel renderas som `<span class="ms-formvalidation">` (utan eget `id`) i en
extra `<tr>` inuti `[FältID]_MainTable`. Hitta dem programmatiskt:

```js
// Felmeddelande för ett specifikt fält:
const table = doc.getElementById(
  'PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl_MainTable'
);
const errorSpan = table.querySelector('span.ms-formvalidation:not([id*="mandatory"])');
// errorSpan.textContent => "Du måste ange paragraf"

// Generell detektering av alla felmeddelanden:
const allErrors = doc.querySelectorAll('span.ms-formvalidation');
const actualErrors = Array.from(allErrors)
  .filter(el => !el.id.includes('mandatory') && el.textContent.trim().length > 2)
  .map(el => el.textContent.trim());
```

### Externa kontakter (oregistrerade)

Flödet för att lägga till en oregistrerad extern kontakt sker i **upp till fyra steg**
med syskoniframes direkt under `document.body` i huvud-dokumentet.

#### DOM-struktur för dialoger – verifierat

**Kritisk insikt:** Alla dialoger är **syskoniframes på top-level** – inte nästlade i
varandra och inte separata popup-fönster. `document.querySelectorAll('iframe')` ger
alla aktiva iframes. Antalet växer steg för steg:

```
document.body
  iframe[0]  /locator/DMS/Case/New/61000                              (ärendeformulär)
  iframe[1]  /locator/DMS/Dialog/NewActivityContact                   (välj-typ-dialog)
  iframe[2]  /locator.aspx → /locator/DMS/Dialog/JournalCaseContactNew (kontaktformulär)
  iframe[3]  /locator/CRM/Contact/Dialog/DuplicateContactsAllFieldsDialog (dubblettvarning, om kollision)
```

Ärendeformulärets iframe (iframe[0]) innehåller alltid två inre iframes:
- `PlaceHolderMain_MainView_ContactContainer_ContactListControl_printframe` (tom src)
- `keepviewaliveframe` → `/keepViewAlive.aspx`

#### Knappar på Externa kontakter-fliken

| Knapp-ID | Text | Mekanism |
|---|---|---|
| `PlaceHolderMain_MainView_ContactContainer_AddRoleButtonDropDownButton_anchor` | Lägg till existerande kontakt | Dropdown |
| `PlaceHolderMain_MainView_ContactContainer_DeleteRowButton` | Ta bort | `__doPostBack('...DeleteRowButton', '')` |
| `PlaceHolderMain_MainView_ContactContainer_EditRowButton` | Redigera egenskaper | `__doPostBack('...EditRowButton', '')` |
| `PlaceHolderMain_MainView_AddUnregCasePartMenuButtonControl_DropDownButton_anchor` | Ny kontakt | Dropdown-meny |

#### "Ny kontakt"-dropdownmenyn

Dropdown-listan `PlaceHolderMain_MainView_AddUnregCasePartMenuButtonControl_DropDownMenu`
innehåller roller. Varje val triggar:

```js
__doPostBack(
  'ctl00$PlaceHolderMain$MainView$AddUnregCasePartMenuButtonControl_DropDownMenu',
  '9'  // 9 = Ärendepart; se rollkoder nedan
);
```

| Länk-ID (suffix) | Text | `__EVENTARGUMENT` |
|---|---|---|
| `...MenuItemAnchor_9` | Ärendepart | `9` |
| `...MenuItemAnchor_100001` | Tonsättare | `100001` |
| `...MenuItemAnchor_100002` | Textförfattare | `100002` |
| `...MenuItemAnchor_100003` | Tonsättare och textförfattare | `100003` |

#### Steg 1 – Typ-dialog: `NewActivityContact`

PostBack lägger till iframe[1] i DOM:en via GET:
```
GET /locator/DMS/Dialog/NewActivityContact
  ?entity=Case&role=9&rolecode=%C3%84rendepart
  &acccode=0&subtype=61000&dialogTitle=360°
  &dialog=modal&dialogOpenMode=spdialog&dialogCloseMode=spdialog&IsDlg=1
```

Dialogen innehåller enbart ett val (verifierat – enda option):

| Element-ID | POST-nyckel | Typ | Alternativ |
|---|---|---|---|
| `PlaceHolderMain_MainView_ContactTypeComboBoxControl` | `ctl00$PlaceHolderMain$MainView$ContactTypeComboBoxControl` | SELECT + Selectize | `0`=Oregistrerad kontakt, `1`=Organisation, `2`=Kontaktperson |

OK-knapp: `__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish')`

#### Steg 2 – Kontaktformulär: `JournalCaseContactNew`

OK-klick lägger till iframe[2] i DOM:en. Laddas via `/locator.aspx` som redirectar till:
```
GET /locator/DMS/Dialog/JournalCaseContactNew
  ?role=9&rolecode=%C3%84rendepart
  &acccode=0&totdomain=0&subtype=61000
  &dialogCaption=Ny%20oregistrerad%20kontakt
  &dialog=modal&IsDlg=1
```

Formuläret innehåller **dolda kontrollknappar** (display:none) – dessa triggas av
systemet i rätt ordning, anropa dem inte direkt:
- `PlaceHolderMain_MainView_CheckDuplicateContactsAllFieldsControl` → `__doPostBack(...CheckDuplicate...,'')` – körs automatiskt vid OK
- `PlaceHolderMain_MainView_SaveNewContactControl` → `__doPostBack(...SaveNewContact...,'')` – körs om ingen dubblett
- `PlaceHolderMain_MainView_ContactConnection_DialogFinishControl` → `__doPostBack(...DialogFinishControl,'')` – avslutningssteg

Synliga formulärfält i `JournalCaseContactNew`:

| Element-ID | POST-nyckel | Typ | Obl. | Etikett |
|---|---|---|---|---|
| `PlaceHolderMain_MainView_PersonNumberTextBoxControl` | `ctl00$...PersonNumberTextBoxControl` | INPUT text | Nej | Pers/Org-nummer |
| `PlaceHolderMain_MainView_ContactNameControl` | `ctl00$...ContactNameControl` | INPUT text | **Ja** | Namn |
| `PlaceHolderMain_MainView_ContactName2Control` | `ctl00$...ContactName2Control` | INPUT text | Nej | Kontaktperson |
| `PlaceHolderMain_MainView_ContactAddressControl` | `ctl00$...ContactAddressControl` | TEXTAREA | Nej | Adress |
| `PlaceHolderMain_MainView_Country` | `ctl00$PlaceHolderMain$MainView$Country` | SELECT + Selectize | Nej | Land (default: `50078`=Sverige) |
| `PlaceHolderMain_MainView_ZipCode_zipCode_zip_code` | `ctl00$...ZipCode_zipCode_zip_code` | INPUT text | Nej | Postnummer |
| `PlaceHolderMain_MainView_ZipCode_zipPlace_zip_place` | `ctl00$...ZipCode_zipPlace_zip_place` | INPUT text | Nej | Ort |
| `PlaceHolderMain_MainView_ContactEmailControl` | `ctl00$...ContactEmailControl` | INPUT email | Nej | E-post |
| `PlaceHolderMain_MainView_Phone_AreaCodeTextBox` | `ctl00$...Phone_AreaCodeTextBox` | INPUT text | Nej | Telefon riktnummer (default: `+46`) |
| `PlaceHolderMain_MainView_Phone` | `ctl00$PlaceHolderMain$MainView$Phone` | INPUT tel | Nej | Telefon nummer |
| `PlaceHolderMain_MainView_Fax_AreaCodeTextBox` | `ctl00$...Fax_AreaCodeTextBox` | INPUT text | Nej | Fax riktnummer (default: `+46`) |
| `PlaceHolderMain_MainView_Fax` | `ctl00$PlaceHolderMain$MainView$Fax` | INPUT tel | Nej | Fax nummer |
| `PlaceHolderMain_MainView_ContactNotesControl` | `ctl00$...ContactNotesControl` | TEXTAREA | Nej | Kommentar |
| `PlaceHolderMain_MainView_UnofficialContactCheckBoxControl` | `ctl00$...UnofficialContactCheckBoxControl` | INPUT checkbox | Nej | Skyddad |

Spara kontakten (triggar dupblettkontrollen automatiskt):
```
__EVENTTARGET  = ctl00$PlaceHolderMain$MainView$DialogButton
__EVENTARGUMENT = finish
```

> **OBS:** Kontaktdialogen har ett **eget BIFViewState** (nytt GUID, separat från
> ärendeformulärets ViewState). Hämta det från kontaktdialog-iframe:ns DOM.

#### Steg 3 (villkorligt) – Dubblettvarning: `DuplicateContactsAllFieldsDialog`

Om det inmatade namnet matchar en befintlig kontakt i systemet läggs iframe[3] till:
```
GET /locator/CRM/Contact/Dialog/DuplicateContactsAllFieldsDialog
  ?dialogbuttons=YesNoCancel&SelectContact=-1
  &finishcaption=Spara/Skapa+ny&dialogHeight=450px
  &dialog=modal&dialogOpenMode=spdialog&dialogCloseMode=spdialog&IsDlg=1
```

Knappar i dubblettdialogen:

| Element-ID | Text | `__EVENTARGUMENT` |
|---|---|---|
| `PlaceHolderMain_MainView_Yes-Button` | Använd kontakt (välj befintlig) | `yes` |
| `PlaceHolderMain_MainView_No-Button` | Spara/Skapa ny (fortsätt som oregistrerad) | `no` |
| `PlaceHolderMain_MainView_Cancel-Button` | Avbryt | `cancel` |

Alla via: `__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', '<yes|no|cancel>')`

#### Hur ärendeformuläret vet att kontakten är sparad

Kommunikation tillbaka till ärendeformuläret sker via **dolt hidden field + postback-länk**
i ärendeformulärets iframe (iframe[0]):

```js
// Dolt hidden field som fylls med returvärdet:
// id: PlaceHolderMain_MainView_returnvalueOpenNewUnregisteredCasePartDialogOperation
// name: ctl00$...$returnvalueOpenNewUnregisteredCasePartDialogOperation
// value: "0" → fylls med kontaktens recno när sparad

// Dold postback-länk (display:none) som triggas av dialogen:
// id: PlaceHolderMain_MainView_OpenNewUnregisteredCasePartDialogOperation_POSTBACK
// onclick: __doPostBack('ctl00$...$OpenNewUnregisteredCasePartDialogOperation_POSTBACK', '')
```

Flödet efter att kontakten sparas:
1. Dialogen anropar `SI.UI.ModalDialog.CloseCallback()` (intern 360°-funktion)
2. `window._returnValueElementID` pekar på hidden field-id:t
3. Värdet sätts i hidden field + den dolda postback-länken klickas
4. Ärendeformuläret postar till `view.aspx` och uppdaterar kontaktlistan via UpdatePanel
5. iframe[1] och iframe[2] (och iframe[3] om den fanns) tas bort ur DOM:en

> **Timing-varning:** iframe[1] (`NewActivityContact`) tas bort ur DOM:en **efter** att
> UpdatePanel-svaret kommit tillbaka från servern (steg 4), inte direkt när kontaktformuläret
> stängs. Vid snabb iteration med flera kontakter kan `NewActivityContact` fortfarande ligga
> kvar i DOM:en när nästa kontakts `waitForNyIframe('NewActivityContact')` anropas – och
> den gamla iframen hittas då istället för den nya. Lösning: vänta på att **både**
> `NewActivityContact` och `JournalCaseContactNew` försvinner ur DOM:en innan nästa
> kontakt påbörjas.

**Nätverksanrop som genereras vid sparning (alla POST, HTTP 200, ingen 302):**
- `POST view.aspx?id=5A2974B2-...` (sparar kontakten, `name=DMS.Dialog.JournalCaseContactNew`)
- `POST view.aspx?id=1ce52598-...` (stänger typ-dialogen, `name=DMS.Dialog.NewActivityContact`)
- `POST view.aspx?id=cf7c6540-...` (uppdaterar ärendeformuläret, `name=DMS.Case.New.61000`)

#### Summering – kritiska POST-nycklar

| Syfte | `__EVENTTARGET` | `__EVENTARGUMENT` |
|---|---|---|
| Byt till Generellt | `ctl00$...$WizardNavigationButton` | `GeneralStep` |
| Byt till Externa kontakter | `ctl00$...$WizardNavigationButton` | `ContactsStep` |
| Byt till Interna kontakter | `ctl00$...$WizardNavigationButton` | `OurTeamStep` |
| Byt till Fastighet | `ctl00$...$WizardNavigationButton` | `EstateStep` |
| Byt till Kommentar | `ctl00$...$WizardNavigationButton` | `NotesStep` |
| Spara ärende | `ctl00$...$WizardNavigationButton` | `finish` |
| Lägg till oregistrerad Ärendepart | `ctl00$...$AddUnregCasePartMenuButtonControl_DropDownMenu` | `9` |
| Välj kontakttyp (OK) | `ctl00$...$DialogButton` | `finish` |
| Spara oregistrerad kontakt | `ctl00$...$DialogButton` | `finish` |
| Dubblettvarning – välj befintlig | `ctl00$...$DialogButton` | `yes` |
| Dubblettvarning – spara ny ändå | `ctl00$...$DialogButton` | `no` |
| Dubblettvarning – avbryt | `ctl00$...$DialogButton` | `cancel` |

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

### Flöde i `triggerDagboksblad()` (`page-dagboksblad.js`)

1. **Fånga popup-referensen** – `window.open` patchas tillfälligt för att fånga
   fönsterobjektet som 360° skapar. Återställs direkt efter första anropet.

2. **Vänta på Report Viewer** – Polla tills `popup.$find('ctl00_PlaceHolderMain_MainView_ReportView')`
   returnerar en instans (max 10 s). `$find` är en global ASP.NET-funktion i popup-fönstret.

3. **Visa utskriftsdialogen** – `rv.invokePrintDialog()` renderar MSRS utskriftsdialog
   i popup-fönstret. Dialogen innehåller bl.a. `.msrs-printdialog-divprintbutton`.

4. **Klicka Print-knappen** – `.msrs-printdialog-divprintbutton` klickas programmatiskt.
   MSRS utskriftsdialog är nu synlig i popup-fönstret och användaren skriver ut eller
   sparar som PDF därifrån. Flödet är klart.

### Kända begränsningar

- Popup-fönster måste vara tillåtna för `p360.svenskakyrkan.se` i Chrome.
- Tillägget måste laddas om (`chrome://extensions`) efter kodändringar för att
  content scripts och service worker ska uppdateras.

## Snabbkommandon

| Kommando | Standardtangenter | Funktion |
|----------|------------------|----------|
| `dagboksblad-skriv-ut` | **Alt+Shift+D** | Öppnar dagboksblad och visar utskriftsdialog |
| `växla-status`         | **Alt+Shift+S** | Växlar status mellan Öppet och Avslutat |
| `redigera-egenskaper`  | **Alt+Shift+E** | Öppnar Redigera egenskaper-dialogen |
| `makulera`             | **Alt+Shift+M** | Öppnar statusdialogen förinställd på Makulerat |
| `spara-som-nytt`       | *(ingen standard)* | Spara som nytt ärende – tilldelas manuellt vid behov |

Chrome tillåter max 4 `suggested_key` per tillägg. Alla kommandon är konfigurerbara via `chrome://extensions/shortcuts`.

---

## Skapa nytt ärendedokument – teknisk kartläggning

Kartlagt 2026-03-24 via spy.js-loggning (två körningar: Inkommande och Utgående handling).
Ingen fil bifogad i något av fallen.

### Öppna formuläret

```js
__doPostBack(
  'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$DocumentActionMenuControl_DropDownMenu',
  '61000'
);
```

Formuläret laddas som en iframe i DOM:en:
```
GET https://p360.svenskakyrkan.se/locator/DMS/Document/New/61000
  ?subtype=61000&dialogHeight=600px&dialogWidth=960px
  &dialogTitle=360°&dialog=modal&dialogOpenMode=spdialog&dialogCloseMode=spdialog&IsDlg=1
```

Underliggande view.aspx-id: `70158b84-a8eb-492a-a546-277ee96e16f9`
(`name=DMS.Document.New.61000`)

### Formulärfält (kända)

| Element-ID | Typ | Triggar UpdatePanel | Syfte |
|---|---|---|---|
| `PlaceHolderMain_MainView_ProcessRecordTypeControl` | SELECT + Selectize | **Ja** | Handlingstyp (t.ex. `101749` = "Annan handlingstyp" – instansspecifikt) |
| `PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl` | SELECT + Selectize | **Ja** | Dokumentkategori (Inkommande / Utgående / Upprättat m.fl.) |
| `PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl` | SELECT + Selectize | **Ja** | Val för offentlig titel (samma som ärendeformulär) |
| `PlaceHolderMain_MainView_AccessCodeComboControl` | SELECT + Selectize | **Ja** | Skyddskod |
| `PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl` | SELECT + Selectize | **Ja** | Sekretesslagrum (visas vid KO/OSL) |
| `PlaceHolderMain_MainView_ReceivedDateControl_si_datepicker` | Datumväljare | **Ja** | Ankomstdatum *(Inkommande)* |
| `PlaceHolderMain_MainView_DispatchedDateControl_si_datepicker` | Datumväljare | **Ja** | Brevdatum / Expedieringsdatum *(Utgående)* |
| `PlaceHolderMain_MainView_AccessGroupComboControl` | SELECT + Selectize | Nej | Åtkomstgrupp (instansspecifikt) |
| `PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl` | SELECT + Selectize | Nej | Ansvarig enhet (instansspecifikt) |
| `PlaceHolderMain_MainView_PaperControl` | SELECT + Selectize | **Ja** | Sparat på papper |
| `PlaceHolderMain_MainView_ResponsibleUserComboControl` | SELECT + Selectize | **Ja** | Ansvarig person |
| `PlaceHolderMain_MainView_UnregisteredSenderTextBoxControl` | INPUT text | Nej | Oregistrerad kontakt (avsändare) |
| `PlaceHolderMain_MainView_AddUnregisteredSenderButtonControl` | Knapp (bock) | Nej | Bekräfta oregistrerad avsändare |
| `PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY` | INPUT text | Nej | Projekt (typeahead, synligt) |

> **`ProcessRecordTypeControl`** = **Handlingstyp** – vilken sorts handling det är (t.ex.
> "Annan handlingstyp" = `101749`). Tillgängliga handlingstyper varierar per ärende och
> beror på ärendets klassificering. Värdet är instansspecifikt och måste läsas dynamiskt
> eller konfigureras per mall.
>
> **`TypeJournalDocumentInsertComboControl`** = **Dokumentkategori** – avgör om dokumentet
> är Inkommande, Utgående, Upprättat m.fl. Värdet triggar UpdatePanel vid ändring.
>
> | Värde | Text |
> |---|---|
> | `` (tom) | *(ingen vald)* |
> | `110` | Inkommande |
> | `111` | Utgående |
> | `60005` | Upprättat |
> | `118` | Kallelse |
> | `60006` | Protokollsutdrag |
> | `218` | Tjänsteutlåtande |
> | `101001` | Delegationsbeslut |
> | `112` | Protokoll |

> **Titelfältet:** `PlaceHolderMain_MainView_TitleTextBoxControl` — TEXTAREA, maxlength 254.
> Samma element-ID som i ärendeformuläret. Triggar inte UpdatePanel.

### Kontaktfält – Inkommande vs Utgående

| | Inkommande | Utgående |
|---|---|---|
| Triggande kontroll | `SenderCaseProjectContactsImgControl` | `RecipientCaseProjectContactsImgControl` |
| `caseprojectcontactlist` | `SenderCaseProjectContactsList` | `RecipientCaseProjectContactsList` |
| `showexternalcontacts` | `1` | `2` |
| `role` | `5` | `6` |
| Callback i formulär-iframe | `FindSenderCaseProjectContacts_Operation_POSTBACK` | `FindRecipientCaseProjectContacts_Operation_POSTBACK` |

Båda öppnar samma dialog-typ:
```
GET /locator/DMS/Dialog/AddCasePartsDialog
  ?caseRecno={recno}&projectRecno=&showexternalcontacts={1|2}
  &supervisionobjectRecno={5}&caseprojectcontactlist={...List}
  &role={5|6}&standalonemode=true&IsDlg=1
```

Stängs med:
```js
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');
```

### Spara dokumentet

```js
// Steg 1 – Slutför (eller klicka fysisk knapp):
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');

// Steg 2 – Triggas automatiskt av servern:
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$CompleteWizardHiddenEventControl', '');
// → öppnar RepeatWizardDialog
```

### RepeatWizardDialog – dokumentnummer och avslut

Efter att dokumentet sparats öppnas en bekräftelsedialog:
```
GET /locator/DMS/Dialog/RepeatWizardDialog
  ?dialogCaption=Dokumentet+KHS+2026-0062%3A1+är+skapad&...&IsDlg=1
```

**Dokumentnumret** (`KHS 2026-0062:1`) finns URL-kodat i `dialogCaption`-parametern.

```js
// Extrahera ur iframe-URL:
const url = new URL(repeatIframe.contentDocument.location.href);
const caption = decodeURIComponent(url.searchParams.get('dialogCaption') || '');
const docNr = caption.replace('Dokumentet ', '').replace(' är skapad', '').trim();
// => "KHS 2026-0062:1"
```

Stäng dialogen:
```js
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');
```

Därefter triggar formulär-iframen automatiskt (i tur och ordning):
1. `AskToRepeatOperation_POSTBACK` — bekräftar att inga fler dokument ska skapas
2. `NewDocumentOperation_POSTBACK` — uppdaterar ärendesidan (top-frame)
3. `NewDocumentCaseBrokerListener` — laddar om ärendets dokumentlista

### Återstår att kartlägga

- ~~Titelfältets element-ID~~ ✓ `TitleTextBoxControl` (TEXTAREA, maxlength 254)
- ~~Värden för `TypeJournalDocumentInsertComboControl`~~ ✓ kartlagt
- Filuppladdning (flik "Filer")

---

## Projektstruktur
```
/
├── manifest.json          # Chrome Manifest V3
├── popup.html             # Tilläggets popup-UI
├── popup.js               # Logik för popup-knappar
├── content.js             # Injiceras på p360.svenskakyrkan.se (ISOLATED world)
├── page-utils.js          # Delade hjälpfunktioner för MAIN-world-filer
├── page-dagboksblad.js    # Dagboksblad + utskriftsdialog
├── page-status.js         # Sätt/växla status
├── page-arende-options.js # Inläsning av formuläralternativ (NY_ÄRENDE_URL, läsInAlternativ)
├── page-arende-contacts.js # Lägg till oregistrerade externa kontakter
├── page-arende-create.js  # Skapa ärende från mall (skapaFrånMall)
├── page-document-options.js # Passiv caching av Handlingstyp-alternativ
├── page-document-create.js  # Skapa ärendedokument från mall (skapaÄrendedokument)
├── page.js                # Router i MAIN world (lyssnar på p360-anrop och dispatchar)
├── background.js          # Service worker – hanterar tangentbordskommandon
├── help.html              # Inbyggd hjälpsida (öppnas via "? Hjälp" i popup)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── CLAUDE.md              # Den här filen – projektkontextfil för Claude Code
└── ROADMAP.md             # Planerade och föreslagna funktioner
```

### MAIN-world körordning (manifest)

Filerna injiceras i denna ordning:

1. `page-utils.js`
2. `page-dagboksblad.js`
3. `page-status.js`
4. `page-arende-options.js`
5. `page-arende-contacts.js`
6. `page-arende-create.js`
7. `page-document-options.js`
8. `page-document-create.js`
9. `page.js` (router)

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
