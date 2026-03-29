# P360 – Teknisk referens: Ärende

Kartläggning av formulär, fält och flöden för ärendeskapande i Public 360°.

---

## Sätt status (dialog)

360° har **två URL-format** med olika PostBack-nycklar. Detektera via element-ID:

| URL-format | PostBack-nyckel |
|-----------|----------------|
| `/DMS/Case/Details/Simplified/...` | `CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK` |
| `/view.aspx?id=...` (stängda ärenden) | `SetStatusButton_DetailFunctionControl` |

```js
const harDetaljerFormat = document.getElementById(
  'PlaceHolderMain_MainView_CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK'
);
const nyckel = harDetaljerFormat
  ? 'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK'
  : 'ctl00$PlaceHolderMain$MainView$SetStatusButton_DetailFunctionControl';
__doPostBack(nyckel, '');
```

Dialogen laddas som iframe (`/locator/DMS/Dialog/EditCaseStatus`).
- Native select: `select#PlaceHolderMain_MainView_CaseStatusComboControl`
- Sätt värde via `select.selectize.setValue(value)` (eller direkt på `.value` om Selectize ej aktivt)
- OK-knapp: `#PlaceHolderMain_MainView_Finish-Button`

---

## Skapa nytt ärende

### POST-URL

```
POST https://p360.svenskakyrkan.se/locator/DMS/Case/New/61000
```

Dialogen öppnas via:
```
/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf&dialogmode=true&IsDlg=1&context-data=subtype,Primary,61000...
```

### Formulärfält (element-ID → POST-nyckel)

| Element-ID | POST-nyckel | Typ | Obl. | Syfte |
|---|---|---|---|---|
| `PlaceHolderMain_MainView_JournalUnitComboControl` | `ctl00$...JournalUnitComboControl` | SELECT + Selectize | Ja | Diarieenhet* |
| `PlaceHolderMain_MainView_CaseSubArchiveComboControl` | `ctl00$...CaseSubArchiveComboControl` | SELECT + Selectize | Ja | Delarkiv |
| `PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY` | `ctl00$...ClassificationCode1ComboControl_DISPLAY` | INPUT text (typeahead) | Ja | Klassificering – synligt |
| `PlaceHolderMain_MainView_ClassificationCode1ComboControl` | `ctl00$...ClassificationCode1ComboControl` | INPUT hidden | Ja | Klassificering – recno |
| `PlaceHolderMain_MainView_TitleTextBoxControl` | `ctl00$...TitleTextBoxControl` | TEXTAREA | Ja | Ärendetitel |
| `PlaceHolderMain_MainView_PaperDocAllowedComboControl` | `ctl00$...PaperDocAllowedComboControl` | SELECT + Selectize | Nej | Sparat på papper |
| `PlaceHolderMain_MainView_AccessCodeComboControl` | `ctl00$...AccessCodeComboControl` | SELECT + Selectize | Ja | Skyddskod |
| `PlaceHolderMain_MainView_AccessGroupComboControl` | `ctl00$...AccessGroupComboControl` | SELECT + Selectize | Ja | Åtkomstgrupp* |
| `PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl` | `ctl00$...ResponsibleOrgUnitComboControl` | SELECT + Selectize | Ja | Ansvarig enhet* |
| `PlaceHolderMain_MainView_ResponsibleUserComboControl` | `ctl00$...ResponsibleUserComboControl` | SELECT + Selectize | Nej | Ansvarig person* |
| `PlaceHolderMain_MainView_StatusCaseComboControl` | `ctl00$...StatusCaseComboControl` | SELECT + Selectize | Ja | Status |
| `PlaceHolderMain_MainView_NotesStep_Control` | `ctl00$...NotesStep_Control` | TEXTAREA | Nej | Kommentar (flik 5) |

*Instansspecifika – aldrig hårdkoda, läs dynamiskt eller konfigurera per användare.

### Dropdown-värden (generella)

**Skyddskod:**
| Värde | Text |
|-------|------|
| `0` | Offentlig (default) |
| `100031` | Sekretess KO |
| `100032` | Sekretess OSL |

**Delarkiv:** `100009` = Församling/pastorat (troligen generell)

**Sparat på papper:**
| Värde | Text |
|-------|------|
| `0` | Nej (default) |
| `1` | Delvis |
| `-1` | Ja |

### Sekretessfält (KO / OSL)

Byte av `AccessCodeComboControl` triggar UpdatePanel som injicerar nya fält. Ordning:

1. `AccessCodeComboControl.selectize.setValue('100031')` → vänta på UpdatePanel
2. `AccessCodeAuthorizationComboControl.selectize.setValue('<paragraf>')` — Selectize redo direkt
3. `UnofficialContactCheckBoxControl.checked = true/false` (default: förbockad)
4. `SelectOfficialTitleComboBoxControl.selectize.setValue('1'/'2'/'3')` → om `3`: vänta → fyll `PublicTitleTextBoxControl`

**Paragraf-fält:**

| Element-ID | `PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl` |
|---|---|
| POST-nyckel | `ctl00$PlaceHolderMain$MainView$AccessCodeAuthorizationComboControl` |

KO-paragrafer (urval):
`Kyrkoordningen 54 kap. 2 §` … `Kyrkoordningen 54 kap. 13 §`, `Se kommentar`

OSL-paragrafer:
`OSL 18 kap. 8 §`, `OSL 19 kap. 1 §`, `OSL 19 kap. 3 §`, `OSL 21 kap. 7 §`,
`OSL 23 kap. 1 §`, `OSL 40 kap. 7 a §`, `Lag 2018:218 1 kap. 8 §`, `Se kommentar`

**Offentlig titel-fält:**
| Element-ID | `PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl` |
|---|---|
| Värde `1` | Sätt offentlig titel lika med titel |
| Värde `2` | Skydda hela offentliga titeln |
| Värde `3` | Skriv in offentlig titel manuellt → `PublicTitleTextBoxControl` |

> AccessCode-UpdatePanel återställer **inga** befintliga fält – titel m.m. förblir intakta.

### Klassificering (typeahead)

- Display-fält: `ClassificationCode1ComboControl_DISPLAY`
- Hidden recno: `ClassificationCode1ComboControl`
- Triggar sökning via: `__doPostBack('...ClassificationCode1ComboControl_OnClick_PostBack', '')`
- **Ordning:** Sätt klassificering **före** skyddskod – annars nollställer UpdatePanel paragraf-fältet

### Projekt och Fastighet (typeahead)

Identiskt mönster för båda. Sökning med `%` ger alla alternativ.

**Projekt:** `ProjectQuickSearchControl_DISPLAY` / `_DISPLAY` / `_dropDownList` / `_OnClick_PostBack` / `HiddenButton`

**Fastighet:** `EstateGeneralTabSearchControl_DISPLAY` / `_DISPLAY` / `_dropDownList` / `_OnClick_PostBack` / `HiddenButton`

> Sätt efter klassificering och före skyddskod.

### Spara-knappen

```js
// Klicka fysisk knapp (rekommenderat):
iDoc.querySelector('input[onclick*="WizardNavigationButton"][onclick*="finish"]')?.click();

// Alternativt:
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
```

### Diarienumret efter skapande

```js
// Läs ur DOM:
const diarieNr = document.getElementById('PlaceHolderMain_MainView_DetailDescription')
  ?.textContent.replace('Ärende: ', '').trim(); // => "P 2022-0076"

// Eller ur URL:
const recno = new URLSearchParams(window.location.search).get('recno');
```

XHR-interceptorn läser recno ur UpdatePanel-svaret:
```js
const m = responseText.match(/recno[=:](\d+)/i);
if (m) window.top.location.href =
  `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${m[1]}`;
```

### Tekniska hinder

| Hinder | Lösning |
|--------|---------|
| `__VIEWSTATE` (~55 kB) – sessions- och tidsberoende | Hämta från `iframe.contentDocument` precis innan POST |
| `BIFViewState` (GUID per formulärinstans) | Hämta från `[name*="BIFViewState"]` |
| Klassificering – ordning | Sätt **före** skyddskod-blocket |
| `form.submit()` i IsDlg=1 | Klicka fysisk knapp eller `__doPostBack` |
| Selectize.js | Anropa `.selectize.setValue(val)` |

### Dialog close-mekanism (verifierat 2026-03-23)

Patcha `get_childDialog()` och sätt `Resize`/`IsLoading` på iframe:
```js
iframe.Resize = () => {};
iframe.IsLoading = true;
iframe.commitPopup = (returnVal) => { /* navigera */ };

const origGet = iWin.SI.UI.ModalDialog.get_childDialog?.bind(iWin.SI.UI.ModalDialog);
iWin.SI.UI.ModalDialog.get_childDialog = function() { return origGet?.() ?? iframe; };
```

I praktiken: recno läses ur XHR-svaret (se ovan), `commitPopup` anropas aldrig av 360°.

---

## Flikar i ärendeskapande-guiden

| Fliktext | `__EVENTARGUMENT` |
|---|---|
| Generellt | `GeneralStep` |
| Externa kontakter | `ContactsStep` |
| Interna kontakter | `OurTeamStep` |
| Fastighet | `EstateStep` |
| Kommentar | `NotesStep` |
| Slutför | `finish` |

> Validering sker **enbart vid "finish"** – fritt att navigera med tomma obligatoriska fält.

Felmeddelanden:
```js
const allErrors = doc.querySelectorAll('span.ms-formvalidation');
const actualErrors = Array.from(allErrors)
  .filter(el => !el.id.includes('mandatory') && el.textContent.trim().length > 2)
  .map(el => el.textContent.trim());
```

---

## Externa kontakter (oregistrerade)

Alla dialoger är **syskoniframes på top-level** (inte nästlade):

```
document.body
  iframe[0]  /locator/DMS/Case/New/61000              (ärendeformulär)
  iframe[1]  /locator/DMS/Dialog/NewActivityContact   (välj typ)
  iframe[2]  /locator/DMS/Dialog/JournalCaseContactNew (kontaktformulär)
  iframe[3]  /locator/CRM/Contact/Dialog/DuplicateContactsAllFieldsDialog (om dubblett)
```

### Steg 1 – Öppna kontakt-dropdown

```js
__doPostBack(
  'ctl00$PlaceHolderMain$MainView$AddUnregCasePartMenuButtonControl_DropDownMenu',
  '9'  // 9 = Ärendepart
);
```

### Steg 2 – Välj typ (NewActivityContact)

| Element-ID | Alternativ |
|---|---|
| `PlaceHolderMain_MainView_ContactTypeComboBoxControl` | `0`=Oregistrerad, `1`=Organisation, `2`=Kontaktperson |

OK: `__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish')`

### Steg 3 – Kontaktformulär (JournalCaseContactNew)

| Element-ID | Typ | Etikett |
|---|---|---|
| `PlaceHolderMain_MainView_ContactNameControl` | INPUT | **Namn** (obligatorisk) |
| `PlaceHolderMain_MainView_ContactName2Control` | INPUT | Kontaktperson |
| `PlaceHolderMain_MainView_ContactAddressControl` | TEXTAREA | Adress |
| `PlaceHolderMain_MainView_Country` | SELECT + Selectize | Land (default: `50078`=Sverige) |
| `PlaceHolderMain_MainView_ZipCode_zipCode_zip_code` | INPUT | Postnummer |
| `PlaceHolderMain_MainView_ZipCode_zipPlace_zip_place` | INPUT | Ort |
| `PlaceHolderMain_MainView_ContactEmailControl` | INPUT | E-post |
| `PlaceHolderMain_MainView_Phone` | INPUT | Telefon |
| `PlaceHolderMain_MainView_ContactNotesControl` | TEXTAREA | Kommentar |

Spara (triggar dubblettkontrollen automatiskt):
`__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish')`

> Kontaktdialogen har **eget BIFViewState** (separat GUID).

### Steg 4 (villkorligt) – Dubblettvarning

| Knapp | `__EVENTARGUMENT` |
|---|---|
| Använd befintlig | `yes` |
| Spara/Skapa ny | `no` |
| Avbryt | `cancel` |

Via: `__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', '<yes|no|cancel>')`

### Timing-varning

iframe[1] tas bort **efter** UpdatePanel-svaret – inte direkt när kontakten sparats.
Vänta på att **både** `NewActivityContact` och `JournalCaseContactNew` försvinner ur DOM
innan nästa kontakt påbörjas.

### Summering – POST-nycklar

| Syfte | `__EVENTTARGET` | `__EVENTARGUMENT` |
|---|---|---|
| Lägg till oregistrerad Ärendepart | `...AddUnregCasePartMenuButtonControl_DropDownMenu` | `9` |
| Välj kontakttyp (OK) | `...DialogButton` | `finish` |
| Spara kontakt | `...DialogButton` | `finish` |
| Dubblettvarning – spara ny | `...DialogButton` | `no` |
