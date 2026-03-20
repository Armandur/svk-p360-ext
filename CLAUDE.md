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
