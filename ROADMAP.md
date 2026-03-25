# ROADMAP – 360° Hjälptillägg

Planerade, föreslagna och pågående funktioner. Uppdateras löpande i dialog med Claude.
Flytta en punkt till "Klart" när den är implementerad och testad.

---

## Planerat / Prioriterat

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
- ~~Bifoga PDF-filer programmatiskt~~ → Löst (filuppladdning via FileUpload.ashx + eval i iframe-kontext)
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

## Långsiktigt

### Batchuppladdning (mapp → ett ärendedokument per fil)

Möjlighet att välja en mapp i popup och automatiskt skapa ett ärendedokument
per fil. Varje fil skapar ett nytt dokument med filen bifogad. Kräver
filuppladdning (implementerad) och en loop i popup som itererar filerna.

### Arbetsdokument och Avtalsdokument

Utöka stödet till fler dokumenttyper (andra subtype-värden än 61000).

### Kontakter från ärende/projekt i ärendedokument

När stöd för registrerade kontakter (Kontaktperson, Organisation) läggs till
på ärendenivå, bör man även kunna välja "Hämta kontakt från ärende" i
dokumentmallen. Då väljs en eller flera av de kontakter som definierats i
ärendemallen som avsändare/mottagare på dokumentnivå.

### Stöd för registrerade kontakter (Kontaktperson/Organisation)

Externa kontakter stöder för närvarande bara typen Oregistrerad kontakt.
Kontaktperson och Organisation kräver ytterligare kartläggning och
implementation. Registrerade kontakter delar samma post och uppdateras
centralt, vilket löser problemet med att oregistrerade kontakter är
fristående kopior.

---

## Kända begränsningar

- **Testad roll:** Tillägget är hittills enbart testat med rollen **registrator /
  huvudregistrator**. Beteendet för rollerna **Handläggare**, **Handläggare+**,
  **Mötessekreterare** och **Ansökan KAE** är okänt – dessa kan ha annorlunda
  behörigheter, andra tillgängliga fält eller annorlunda PostBack-nycklar.
- **Oregistrerade kontakter är fristående kopior:** En oregistrerad kontakt som
  skapas på ärendenivå och sedan hämtas in som avsändare/mottagare på ett
  ärendedokument blir en helt separat kopia. Ändringar på ärendenivån påverkar
  inte dokumentkontakten och vice versa. Detta är en begränsning i 360°.
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
| Mall-ärenden med förifyllda fält (mallredigerare, popup, automatisk formulärifyllning) | 2026-03-20 |
| Sekretessfält i mallredigeraren (skyddskod, paragraf, offentlig titel) | 2026-03-20 |
| Mall-ärenden: stöd för externa kontakter (oregistrerade) | 2026-03-24 |
| Ärendedokument – fristående dokumentmallar med egen redigeringssida | 2026-03-24 |
| Ärendedokument – instansmodell (djupkopierade dokumentmallar i ärendemallar) | 2026-03-24 |
| Passiv caching av handlingstyper, åtkomstgrupper, enheter och personer | 2026-03-24 |
| Automatiskt skapande av ärendedokument som del av ärendeskapandeflödet | 2026-03-24 |
| Fristående dokumentskapande från popup på befintligt ärende | 2026-03-24 |
| Drag-and-drop-sortering av externa kontakter och ärendedokument | 2026-03-24 |
| Stöd för Utgående, Upprättat och Protokoll i dokumentskapande | 2026-03-25 |
| Explicit skyddskod (Offentlig) när ärendet har annan default | 2026-03-25 |
| Validering av handlingstyp mot ärendets klassificering (popup + formulär) | 2026-03-25 |
| Projekt och Fastighet i ärendemallar och dokumentmallar (typeahead med %-sökning) | 2026-03-25 |
| Polling istället för fasta väntetider mellan ärendedokument | 2026-03-25 |
| Fullständigt flöde ärendeskapande → ärendedokument testat och verifierat | 2026-03-25 |
| Filuppladdning till ärendedokument (popup + ärendemallsflöde) | 2026-03-25 |
| Refaktorering: page-document-create.js → validate/fill/upload/create | 2026-03-25 |
| Refaktorering: mall.js → mall-data/mall-kontakter/mall-dokument/mall | 2026-03-25 |
