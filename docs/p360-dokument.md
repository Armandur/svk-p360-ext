# P360 – Teknisk referens: Ärendedokument

Kartläggning av formulär, fält och flöden för dokumentskapande i Public 360°.
Kartlagt 2026-03-24 via spy.js-loggning.

---

## Öppna dokumentformuläret

```js
__doPostBack(
  'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$DocumentActionMenuControl_DropDownMenu',
  '61000'
);
```

Formuläret laddas som iframe:
```
GET https://p360.svenskakyrkan.se/locator/DMS/Document/New/61000
  ?subtype=61000&dialogHeight=600px&dialogWidth=960px&IsDlg=1
```

Underliggande `view.aspx`-id: `70158b84-a8eb-492a-a546-277ee96e16f9` (`name=DMS.Document.New.61000`)

---

## Formulärfält

| Element-ID | Typ | Triggar UpdatePanel | Syfte |
|---|---|---|---|
| `PlaceHolderMain_MainView_TitleTextBoxControl` | TEXTAREA | Nej | Titel (maxlength 254) |
| `PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl` | SELECT + Selectize | **Ja** | Dokumentkategori |
| `PlaceHolderMain_MainView_ProcessRecordTypeControl` | SELECT + Selectize | **Ja** | Handlingstyp (instansspecifikt) |
| `PlaceHolderMain_MainView_AccessCodeComboControl` | SELECT + Selectize | **Ja** | Skyddskod |
| `PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl` | SELECT + Selectize | **Ja** | Sekretesslagrum (vid KO/OSL) |
| `PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl` | SELECT + Selectize | **Ja** | Val för offentlig titel |
| `PlaceHolderMain_MainView_ReceivedDateControl_si_datepicker` | Datumväljare | **Ja** | Ankomstdatum (Inkommande) |
| `PlaceHolderMain_MainView_DispatchedDateControl_si_datepicker` | Datumväljare | **Ja** | Brevdatum/Expedieringsdatum |
| `PlaceHolderMain_MainView_AccessGroupComboControl` | SELECT + Selectize | Nej | Åtkomstgrupp (instansspecifikt) |
| `PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl` | SELECT + Selectize | Nej | Ansvarig enhet (instansspecifikt) |
| `PlaceHolderMain_MainView_ResponsibleUserComboControl` | SELECT + Selectize | **Ja** | Ansvarig person |
| `PlaceHolderMain_MainView_PaperControl` | SELECT + Selectize | **Ja** | Sparat på papper |
| `PlaceHolderMain_MainView_Custom_QuickUnregContactText` | INPUT text | Nej | Oregistrerad kontakt |
| `PlaceHolderMain_MainView_Custom_QuickUnregContactButton` | Knapp | Nej | Lägg till oregistrerad kontakt |
| `PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY` | INPUT text | Nej | Projekt (typeahead) |

### Dokumentkategorivärden (TypeJournalDocumentInsertComboControl)

| Värde | Text |
|---|---|
| `110` | Inkommande |
| `111` | Utgående |
| `60005` | Upprättat |
| `118` | Kallelse |
| `60006` | Protokollsutdrag |
| `218` | Tjänsteutlåtande |
| `101001` | Delegationsbeslut |
| `112` | Protokoll |

### Fältskillnader per kategori

| Fält | Inkommande | Utgående | Upprättat | Protokoll |
|---|:---:|:---:|:---:|:---:|
| `ReceivedDateControl` (Ankomstdatum) | **Ja** | Nej | Nej | Nej |
| `DispatchedDateControl` (exp-datum) | Ja | Ja | Ja | Ja |
| `ProcessRecordTypeControl` (Handlingstyp) | Ja | Ja | Ja | Ja |
| `ToContactQuickSearchControl` | Ja | Ja | **Nej** | Ja |

> Handlingstyp-defaultvärde byts automatiskt av servern vid kategori-byte (instansspecifikt).

---

## Kontaktfält – Inkommande vs Utgående

| | Inkommande | Utgående |
|---|---|---|
| Triggar | `SenderCaseProjectContactsImgControl` | `RecipientCaseProjectContactsImgControl` |
| `role` | `5` | `6` |
| Callback | `FindSenderCaseProjectContacts_Operation_POSTBACK` | `FindRecipientCaseProjectContacts_Operation_POSTBACK` |

Dialogen: `GET /locator/DMS/Dialog/AddCasePartsDialog?caseRecno={recno}&role={5|6}&standalonemode=true&IsDlg=1`

---

## Spara dokumentet

```js
// Slutför:
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
// → servern triggar automatiskt CompleteWizardHiddenEventControl → RepeatWizardDialog
```

### RepeatWizardDialog

Öppnas som iframe efter sparning. Dokumentnumret finns URL-kodat i `dialogCaption`:
```js
const url = new URL(repeatIframe.contentDocument.location.href);
const caption = decodeURIComponent(url.searchParams.get('dialogCaption') || '');
const docNr = caption.replace('Dokumentet ', '').replace(' är skapad', '').trim();
// => "KHS 2026-0062:1"
```

Stäng: `iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish')`

---

## Filuppladdning – föredraget flöde via ärendesidans upload-yta

**Rekommenderat:** Ladda upp via ärendesidans drag-and-drop-yta (ConnectedDocumentDialog).
Ingen FileStep-navigering inne i dokumentguiden behövs.

### Element-ID:n på ärendesidan

| Element | ID |
|---|---|
| Hidden path-fält | `ctl00$...LeftFolderView1_ViewControl$UploadControl_DocumentMultiFileUploadControl_hiddenUploadedFilesPath` |
| Hidden upload-knapp | `ctl00$...LeftFolderView1_ViewControl$UploadControl_DocumentMultiFileUploadControl_hiddenUploadButton` |

### Flöde (verifierat 2026-03-29)

```
1. POST /FileUpload.ashx?userSession={id}
   FormData-nyckel = filnamnet, body = filinnehållet
   → svar: filnamnet som text

2. hiddenUploadedFilesPath.value = "{userSession}|{filnamn}"
   Flera filer: "{session1}|{namn1}|||{session2}|{namn2}|||..."

3. __doPostBack('...hiddenUploadButton', '')
   → UpdatePanel → ConnectedDocumentDialog läggs till i DOM

4. ConnectedDocumentDialog: välj radio value="3" (Ärendedokument → Document/New/61000)
   __doPostBack('...ArchiveAndTemplateComboBox$2', '')  ← RadioPostBack
   __doPostBack('...DialogButton', 'finish')

5. Document/New/61000 öppnas med filen REDAN registrerad
6. Fyll i fält, slutför
7. Inget RepeatWizardDialog – Document/New-iframen tas bort direkt
```

### Filuppladdning direkt i dokumentguiden (FileStep)

Äldre metod, används inte i primärt flöde men kan behövas:

```js
// Navigera till Filer-fliken:
iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'FileStep');

// Steg 1 – POST filen:
const userSession = Math.floor(Math.random() * 1000000000);
const formData = new FormData();
formData.append(file.name, file);
await fetch(`/FileUpload.ashx?userSession=${userSession}`, { method: 'POST', body: formData });

// Steg 2 – Sätt hidden field:
iDoc.getElementById('...DocumentMultiFileUploadControl_hiddenUploadedFilesPath').value =
  `${userSession}|${file.name}`;

// Steg 3 – Trigga PostBack:
iDoc.getElementById('...DocumentMultiFileUploadControl_hiddenUploadButton').click();
```

> Ingen chunking behövs – hela filen skickas i ett POST (testat med 6.2 MB PDF).
