# ROADMAP – 360° Hjälptillägg

Planerade, föreslagna och pågående funktioner. Uppdateras löpande i dialog med Claude.
Flytta en punkt till "Klart" när den är implementerad och testad.

---

## Under arbete

_(ingenting just nu)_

---

## Planerat / Prioriterat

### Mall-ärenden med förifyllda fält

Möjlighet att skapa nya ärenden utifrån sparade mallar där fält som ärendetyp, status,
handläggare, enhet m.m. redan är förifyllda. Användaren väljer en mall i popupen och
tillägget fyller i formuläret automatiskt.

- Mallarna lagras lokalt i `chrome.storage.local` (inga externa API-anrop)
- Gränssnitt för att skapa, redigera och ta bort mallar (inställningssida)
- Stöd för valfritt antal mallar med egna namn

**Teknisk ansats (kartlagd 2026-03-20):**
Formuläret öppnas via dialog-iframe, fält fylls med `element.selectize.setValue()` och
`textarea.value`, sedan anropas `__doPostBack('...WizardNavigationButton', 'finish')` i
iframe-kontexten. Se CLAUDE.md → "Skapa nytt ärende" för komplett teknisk spec.

**Återstår att kartlägga:**
- Sekretessfältens element-ID och beteende (extra fält vid val av KO/OSL):
  paragraf-/skyddskodsfältet samt alternativ för ärendetitelns sekretesshantering
  (skyddad / manuell / samma som ärendetitel)

### Massregistrering av in-/utträdesärenden från Excel/CSV

Funktion för att skapa ett stort antal ärenden i batch utifrån en Excel- eller CSV-fil.
Primär användning: utträdesärenden (och inträden) från exportfiler ur pastoratets system.

**Förväntade kolumner i CSV/Excel:**

| Kolumn | Beskrivning |
|--------|-------------|
| `Diarium` | Diarienummer (om känt) eller lämnas tomt |
| `Ankomstdatum` | Ärendets ankomstdatum (ÅÅÅÅ-MM-DD) |
| `Förnamn` | Kontaktpersonens förnamn |
| `Efternamn` | Kontaktpersonens efternamn |
| `In/utträde` | `I` för inträde, `U` för utträde |
| `PDF-fil` | Filnamn på bifogad PDF (skannat dokument) |

**Flöde:**
1. Användaren laddar upp CSV/Excel-filen i en dedikerad sida (extension-page)
2. Tillägget visar en förhandsgranskning av raderna
3. Vid bekräftelse skapas ärendena ett i taget i 360° via automatisering
4. Tillägget fångar upp det tilldelade diarienumret för varje skapat ärende
5. En resultatrapport visas och kan laddas ned som CSV:
   `Förnamn, Efternamn, In/utträde, Diarienummer, Skapad`

**Tekniska utmaningar att lösa:**
- Identifiera hur 360° returnerar det nya diarienumret efter att ett ärende skapats
  (URL-redirect, DOM-element eller response-header)
- Bifoga PDF-filer programmatiskt (kräver troligen access till File API + formulär-upload)
- Hantera fel per rad utan att avbryta hela batchen
- Köhantering så att 360° inte överbelastas (fördröjning mellan ärenden)

---

## Idéer och förslag

Funktioner som diskuterats men ännu inte prioriterats.

- **Snabbsökning från popup** – sökfält i popup för att söka ärenden direkt utan att
  navigera till sökformuläret
- **Kopiera ärendenummer** – en-knapps-kopiering av ärendets diarienummer till urklipp
- **Visa ärendeinfo i popup** – visa titel, status och diarienummer direkt i popupen
  när man är på ett ärende (kräver att content.js läser DOM och returnerar data)
- **Konfigurerbar statusväxling** – låt användaren välja vilka statusvärden som ska
  ingå i växlingen (t.ex. Öppet ↔ Avslutat från handläggare istället)
- **Stöd för dokumentsidor** – utöka tillägget till att fungera även på dokumentvyer,
  inte bara ärendesidor
- **Inställningssida** – chrome-extension-sida för att konfigurera tillägget utan att
  redigera koden

---

## Klart

| Funktion | Implementerad |
|----------|--------------|
| Dagboksblad – öppna som PDF | 2025 |
| Sätt status (valfritt värde) | 2025 |
| Redigera egenskaper, utlåning, gallring, spara som nytt, kopiera hyperlänk, ärendesammanfattning, processplan | 2025 |
| Växla status (Öppet ↔ Avslutat) + snabbkommando Alt+Shift+S | 2026-03-20 |
| Inbyggd hjälpsida (help.html) | 2026-03-20 |
