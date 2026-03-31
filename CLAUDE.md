# 360° Hjälptillägg – CLAUDE.md

Chrome-tillägg (Manifest V3) som automatiserar repetitiva arbetsmoment i **Public 360°**
(ASP.NET WebForms DMS/P360) hos Svenska kyrkan. Målgrupp: registratorer och handläggare.

## Utvecklingsmodell

- Beskriv önskad funktion → Claude identifierar filer, skriver kod, committar, pushar
- **ROADMAP.md** – planerade funktioner, uppdateras i dialog med Claude
- Håll filer under **~400–500 rader**; dela upp vid flera oberoende ansvar
- Uppdatera alltid `manifest.json` (körordning) och `CLAUDE.md` (filstruktur) vid ändringar

## Teknisk plattform – kritiska fakta

- **URL:** `https://p360.svenskakyrkan.se/*` — ASP.NET WebForms
- Alla åtgärder via `__doPostBack(target, argument)` (global på alla sidor)
- Dropdowns = **Selectize.js** — använd alltid `element.selectize.setValue(val)`, INTE `.value`
- **ALDRIG `form.submit()`** i `IsDlg=1`-läge → `UnhandledError.aspx`. Klicka fysisk knapp eller `__doPostBack`
- Klassificering måste sättas **före** skyddskod – annars nollställs paragraf av UpdatePanel
- Instansspecifika värden (diarieenhet, åtkomstgrupp, ansvarig enhet/person) får **aldrig hårdkodas**

## P360 teknisk referens

Detaljerad kartläggning av formulär, fält och flöden finns i:

- **`docs/p360-arende.md`** – Skapa ärende, sätt status, sekretess, externa kontakter, dialog-close
- **`docs/p360-dokument.md`** – Skapa ärendedokument, filuppladdning, ConnectedDocumentDialog
- **`docs/p360-dagboksblad.md`** – Dagboksblad, Report Viewer, PDF-export via ControlID

## Snabbreferens: PostBack-nycklar (ärendesida)

```js
__doPostBack('ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu', '<nyckel>')
```

| Nyckel | Funktion |
|--------|----------|
| `key_innehallsforteckning` | Dagboksblad |
| `EditCase` | Redigera egenskaper |
| `SetScrapCode` | Gallring |
| `SaveCaseAsNew` | Spara som nytt |
| `CopyHyperLink` | Kopiera hyperlänk |
| `OrderCaseSummary` | Ärendesammanfattning |
| `AddProgressPlan` | Tilldela processplan |

### Statusvärden (StatusCaseComboControl)

| Värde | Text |
|-------|------|
| `5` | B - Öppet |
| `6` | A - Avslutat |
| `8` | M - Makulerat |
| `17` | AH - Avslutat från handläggare |

### Identifiera ärendesida

```js
document.getElementById(
  'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
)
// eller: window.location.pathname.includes('/DMS/Case/Details/')
```

### Identifiera dokumentdetaljsida

```js
window.location.pathname.includes('/DMS/Document/Details/')
// URL: /locator/DMS/Document/Details/Simplified/61000?recno=...
```

### PostBack-nyckel: Redigera egenskaper (dokumentnivå)

```js
__doPostBack('ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu', 'DocumentEdit')
```

Samma target som ärendesidan, nyckeln är `DocumentEdit` (vs `EditCase` på ärendesidan).

## Projektstruktur

```
/
├── manifest.json
├── popup.html / popup.js / popup-mallar.js / popup-fil.js   # Popup-UI + logik
├── content.js                   # ISOLATED world – skickar meddelanden till MAIN world
│                                #   Dagboksblad hanteras direkt här (fetch → ControlID → ny flik + window.print)
├── page-utils.js                # Delade hjälpfunktioner (MAIN world)
├── page-status.js               # Sätt/växla status
├── page-arende-options.js       # Läser formuläralternativ (NY_ÄRENDE_URL, läsInAlternativ)
├── page-arende-contacts.js      # Oregistrerade externa kontakter
├── page-arende-create.js        # Skapa ärende från mall (skapaFrånMall)
├── page-document-options.js     # Passiv caching av handlingstyper m.m.
├── page-document-validate.js    # Validering av dokumentformulär
├── page-document-fill.js        # Fyller dokumentformulärets fält
├── page-document-upload.js      # Filuppladdning (FileUpload.ashx + öppnaDokumentMedFil)
├── page-document-steps.js       # Vänta på steg, triggaDokumentSlutför m.fl.
├── page-document-create.js      # Orkestrering: skapaÄrendedokument m.fl.
├── page.js                      # Router i MAIN world
├── background.js                # Service worker – tangentbordskommandon
├── mall.html / mall-data.js / mall-kontakter.js / mall-dokument.js / mall.js
├── dokument-mall.html / dokument-mall.js   # Dokumentmallredigerare (?instans=1)
├── batch.html / batch-data.js / batch-table.js / batch-utils.js / batch-run.js / batch-export.js / batch-preview.js / batch-dagboksblad.js / batch.js
│                                      # batch-export.js: ZIP-skapande (pure JS) + PDF-merge (pdf-lib)
│                                      # batch-preview.js: förhandsvisningsmodal  |  batch-dagboksblad.js: dagboksblads-PDF:er
├── help.html / help.js          # Inbyggd hjälpsida
├── arendepaus.html              # Paussida vid ärendeskapande
├── ocr-kontakt.html / ocr-kontakt.js  # PDF-visare med OCR: kontakt, datum, titel (kat 110/111)
│                                      # Batch: per-fils navigator + individuella fältvärden
│                                      # Startar dokumentskapande direkt mot öppen P360-flik
├── lib/                         # Bundlade bibliotek (pdf.js v4, Tesseract.js v5 + språkdata)
├── docs/                        # P360 teknisk referens (se ovan)
├── dev/                         # Utvecklingshjälpmedel – ingår EJ i releaser
│   ├── spy.js                   #   Felsökningsspion för DevTools-konsolen
│   ├── loggar/                  #   Inspelade spion-loggar (JSON)
│   └── testfiler/               #   Testdata (CSV, PDF)
├── CLAUDE.md
└── ROADMAP.md
```

### MAIN-world körordning (manifest.json)

1. `page-utils.js`
2. `page-status.js`
3. `page-arende-options.js`
4. `page-arende-contacts.js`
5. `page-arende-create.js`
6. `page-document-options.js`
7. `page-document-validate.js`
8. `page-document-fill.js`
9. `page-document-upload.js`
10. `page-document-steps.js`
11. `page-document-create.js`
12. `page.js` (router)

## Dokumentmallar och instansmodell

- Mallar lagras i `chrome.storage.local` under `dokumentmallar`
- Ärendemallar innehåller djupkopior (instanser) i `ärendedokument`-arrayen
- Instansformat: `{ dokumentmallId, namn, titel, handlingstyp, kategori, ..., ärvKontaktFrånÄrende? }`
  - `ärvKontaktFrånÄrende: true` → dokumentets `oregistreradKontakt` sätts automatiskt till ärendets externa kontakt
- Redigering: `tempDokInstans` → `dokument-mall.html?instans=1` → `onChanged` uppdaterar listan
- Bakåtkompatibilitet: gamla referenser utan egna fältvärden expanderas i `laddaMall()`

## Ärendemall – kontaktprompt

- `mall.promptaKontakt: true` → `visaKontaktInmatning()` visas i 360°-sidan innan ärendet skapas
  - Stöder max en kontakt; befintlig kontakt i mallen används som förifyllning
  - Promptad kontakt skickas via CustomEvent `p360-kontakt-för-dokument` (MAIN→ISOLATED) för injicering i `pendingÄrendedokument`
- Utan prompt (`promptaKontakt: false`): förregistrerade kontakter injiceras direkt vid pre-sparning i `content.js`
- `pendingÄrendedokument`-flöde: contact.js lyssnar på `p360-kontakt-för-dokument` och sätter `oregistreradKontakt` på berörda docs

## Snabbkommandon

| Kommando | Tangenter | Funktion |
|----------|-----------|----------|
| `dagboksblad-skriv-ut` | Alt+Shift+D | Dagboksblad + utskriftsdialog |
| `växla-status` | Alt+Shift+S | Växla Öppet ↔ Avslutat |
| `redigera-egenskaper` | Alt+Shift+E | Redigera egenskaper |
| `makulera` | Alt+Shift+M | Statusdialog → Makulerat |
| `spara-som-nytt` | *(ingen)* | Spara som nytt ärende |

Chrome tillåter max 4 `suggested_key`. Konfigureras via `chrome://extensions/shortcuts`.

## Kodstil

- Vanilla JavaScript (ES2020+), inga externa beroenden (undantag: `lib/` med pdf.js + Tesseract.js)
- Kommentarer och texter på **svenska**
- Felmeddelanden ska vara tydliga och icke-tekniska
- Kontrollera alltid rätt sida är aktiv innan åtgärd

## Säkerhet

- Lagra/skicka aldrig känslig information externt
- Inga externa API-anrop (`host_permissions` täcker enbart `p360.svenskakyrkan.se`)

## Att lägga till nya funktioner

1. Identifiera `__doPostBack`-nyckeln (högerklicka i 360° → inspektera `onclick`)
2. Knapp i `popup.html` + hanterare i `popup.js`
3. Implementera i relevant `page-*.js` (ny fil om logiken är stor)
4. Uppdatera PostBack-tabellen i `docs/p360-arende.md` om ny nyckel hittas

## Testning

Testa inloggad i 360° med testärende. Kontrollera: knapp synlig, rätt dialog öppnas,
felmeddelande visas utanför ärendesida.
