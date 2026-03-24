# Refaktoreringsplan: Uppdelning av `page.js` i 5 filer

**Datum:** 2026-03-23  
**Status:** Genomförd 2026-03-24  
**Syfte:** `page.js` hade vuxit till ca 1090 rader och innehöll flera oberoende ansvarsområden.

---

## Genomförd status

- `page-utils.js` skapad och innehåller delade hjälpfunktioner.
- `page-dagboksblad.js` skapad och innehåller `triggerDagboksblad()`.
- `page-status.js` skapad och innehåller statusflöden.
- `page-arende.js` skapad och innehåller mallskapande + externa kontakter.
- `page.js` reducerad till router med IIFE-guard (`_p360PageJsLoaded`).
- `manifest.json` uppdaterad med MAIN-world-körordning för alla fem filer.
- `CLAUDE.md` uppdaterad med ny struktur och agentvänliga riktlinjer.

---

## Målbild (nuvarande struktur)

| Fil | Ungefärlig storlek | Ansvar |
|---|---|---|
| `page-utils.js` | ~80 rader | Hjälpfunktioner som delas av övriga filer |
| `page-dagboksblad.js` | ~90 rader | Öppna dagboksblad och trigga utskrift |
| `page-status.js` | ~120 rader | Sätta och växla ärendestatus |
| `page-arende.js` | ~650 rader | Skapa ärende från mall, hantera externa kontakter |
| `page.js` | ~50 rader | IIFE-skydd och `p360-anrop`-router |

---

## MAIN-world körordning (`manifest.json`)

```json
{
  "matches": ["https://p360.svenskakyrkan.se/*"],
  "js": [
    "page-utils.js",
    "page-dagboksblad.js",
    "page-status.js",
    "page-arende.js",
    "page.js"
  ],
  "world": "MAIN"
}
```

---

## Beroendekedja

```text
page-utils.js
  ├── page-dagboksblad.js  (anropar: anropaPostBack)
  ├── page-status.js       (anropar: sleep, waitForIframe, waitForElement)
  └── page-arende.js       (anropar: sleep, waitForNyIframe, waitForElement,
                            sättSelectize, sättSelectizeTyst)
             └── page.js   (router som anropar funktionerna ovan)
```

---

## Vad som inte ändrades

- Ingen avsiktlig funktionsändring; primärt strukturell uppdelning.
- `content.js` och `background.js` påverkades inte.
- Kommunikationsprotokoll via `p360-anrop`/`p360-svar` är oförändrat.
- `popup.js`, `popup.html` och `help.html` är oförändrade.
- Inga externa beroenden tillkom.

---

## Testplan (efter refaktor)

Verifiera manuellt i Chrome inloggad i 360° på testärende:

1. Ladda om tillägget via `chrome://extensions`.
2. `Alt+Shift+D` – dagboksblad öppnas och utskriftsdialog visas.
3. `Alt+Shift+S` – status växlar mellan Öppet och Avslutat.
4. Skapa ärende från mall via popup – ärende skapas och navigering sker till nytt ärende.
5. Skapa ärende med extern kontakt – flerstegsdialogerna fungerar.
6. Kontrollera DevTools-konsolen för JavaScript-fel.

---

## Nästa förbättring (rekommenderad)

`page-arende.js` är nu största filen. Nästa naturliga steg är att dela upp i exempelvis:

- `page-arende-options.js` (inläsning av alternativ/klassificering)
- `page-arende-create.js` (skapa från mall)
- `page-arende-contacts.js` (externa kontakter)

Det följer riktlinjen i `CLAUDE.md` om att undvika mega-filer för stabilare AI-agentflöde.