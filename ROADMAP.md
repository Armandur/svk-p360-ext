# ROADMAP – 360° Hjälptillägg

Planerade, föreslagna och pågående funktioner. Uppdateras löpande i dialog med Claude.
Flytta en punkt till "Klart" när den är implementerad och testad.

---

## Under arbete

### Ärendedokument – mall och filuppladdning

**Var vi är (2026-03-24):**

- ✅ Ärendedokument-formuläret är fullständigt kartlagt i CLAUDE.md (formulärfält,
  PostBack-nycklar, Inkommande/Utgående-kontakter, spara-sekvens, RepeatWizardDialog,
  dokumentnummer-extraktion).
- ✅ Passiv caching av Handlingstyp-alternativ (`ProcessRecordTypeControl`) implementerad:
  `page-document-options.js` detekterar automatiskt när dokumentformuläret öppnas och
  sparar tillgängliga handlingstyper (Selectize-alternativ) i `chrome.storage.local`
  under nyckeln `cachedHandlingstyper`. Cachen är ackumulerande och dedupliceras på `value`.

**Implementerat:**

- ✅ Ärendedokument-sektion i mallredigeraren (mall.html/mall.js) med fält per
  dokument: handlingstyp, dokumentkategori, titel, ansvarig person, skyddskod/paragraf.
- ✅ Automatiskt skapande av ärendedokument (`page-document-create.js`) som del av
  mallflödet – efter att ärendet skapats sparas pending-dokument i
  `chrome.storage.local`, och efter navigering till ärendesidan skapas dokumenten
  ett i taget med statusfält.

**Återstår att testa/verifiera:**

- Hela flödet ärendeskapande → ärendedokument i faktisk 360°-miljö
- Att UpdatePanel-ordningen för handlingstyp/kategori fungerar korrekt
- Felhantering vid valideringsfel i dokumentformuläret

**Långsiktigt:**

1. **Filuppladdning** – möjlighet att ladda upp en fil (t.ex. PDF) till ett
   ärendedokument. Kräver kartläggning av hur 360° hanterar fil-upload
   (troligen multipart/form-data eller en separat dialog).

2. **Arbetsdokument och Avtalsdokument** – utöka stödet till fler dokumenttyper
   (andra subtype-värden än 61000).

---

## Planerat / Prioriterat

---

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

**Återstår att kartlägga / implementera:**
- Sekretessfältens element-ID och beteende (extra fält vid val av KO/OSL):
  paragraf-/skyddskodsfältet samt alternativ för ärendetitelns sekretesshantering
  (skyddad / manuell / samma som ärendetitel)
- **Projekt och Fastighet i mallredigeraren** – fälten finns på respektive flik i
  ärendeformuläret och ser ut som klassificering (typeahead med synligt visningsvärde
  + dolt recno-fält). Inläsning av tillgängliga alternativ och sättning av värdet
  bör kunna göras på samma sätt som klassificering (PostBack + hidden field + display
  field). Kartlägg element-ID:n och PostBack-nycklar, lägg sedan till stöd i
  mallredigeraren och i fyll-i-flödet.

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

### Import av mallar från fil (TSV/CSV/Excel)

Möjlighet att importera mallärenden från en tabbseparerad, kommaseparerad eller
Excel-fil (`.txt`, `.csv`, `.xls`, `.xlsx`). Varje rad i filen representerar en mall
med namngivna kolumner som motsvarar mallfälten (titel, diarieenhet, klassificering,
skyddskod, ansvarig enhet osv.).

**Användningsfall:**
- Snabb uppsättning av många mallar på en gång
- Dela mallkonfigurationer mellan kollegor (exportera → skicka fil → importera)
- Versionsstyra mallar utanför tillägget (t.ex. i ett kalkylblad)

**Förväntade kolumner:** samma fält som i mallformuläret – `namn`, `titel`,
`diarieenhet`, `klassificering`, `skyddskod`, `paragraf`, `ansvarigEnhet`,
`ansvarigPerson`, `status`, `sparatPaPapper`, `kommentar` m.fl.

**Flöde:**
1. Användaren laddar upp filen i mallinställningssidan
2. Tillägget parsar filen och visar en förhandsgranskning av mallarna
3. Befintliga mallar kan behållas, slås samman eller ersättas
4. Möjlighet att även exportera befintliga mallar till samma filformat

**Tekniska noteringar:**
- Excel-parsning kräver ett externt bibliotek (t.ex. SheetJS/xlsx) eller
  begränsning till CSV/TSV för att undvika beroenden
- Fältvärden för dropdowns (diarieenhet, ansvarig enhet m.m.) är instansspecifika –
  import av värde-ID:n fungerar bara inom samma 360°-installation

---

## Kända begränsningar / ej testat

- **Testad roll:** Tillägget är hittills enbart testat med rollen **registrator /
  huvudregistrator**. Beteendet för rollerna **Handläggare**, **Handläggare+**,
  **Mötessekreterare** och **Ansökan KAE** är okänt – dessa kan ha annorlunda
  behörigheter, andra tillgängliga fält eller annorlunda PostBack-nycklar.
- **Kontakttyp:** Externa kontakter stöder för närvarande bara typen
  **Oregistrerad kontakt**. Kontaktperson och Organisation kräver ytterligare
  kartläggning och implementation.
- **Dubblettvarning:** Om namnet liknar en befintlig kontakt i 360° visas dialogen
  "Möjliga dubbletter i kontaktlistan". Tillägget svarar alltid med "Spara/Skapa ny"
  och skapar alltså alltid en ny oregistrerad kontakt, oavsett om en matchande
  registrerad kontakt finns.

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
| Mall-ärenden: stöd för externa kontakter (oregistrerade) | 2026-03-24 |
| Buggfix: andra kontakten lades inte till vid flera kontakter i mall | 2026-03-24 |
| Ärendedokument-formuläret kartlagt i CLAUDE.md | 2026-03-24 |
| Passiv caching av Handlingstyp-alternativ (page-document-options.js) | 2026-03-24 |
