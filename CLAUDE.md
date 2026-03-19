# 360° Hjälptillägg – Projektkontextfil för Claude Code

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

## Hur man identifierar att man är på en ärendesida
```js
// Finns detta element → vi är på en ärendesida
document.getElementById(
  'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
)

// Alternativt: kolla URL-mönstret
window.location.pathname.includes('/DMS/Case/Details/')
```

## Projektstruktur
```
/
├── manifest.json          # Chrome Manifest V3
├── popup.html             # Tilläggets popup-UI
├── popup.js               # Logik för popup-knappar
├── content.js             # Injiceras på p360.svenskakyrkan.se
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── CLAUDE.md              # Den här filen
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
