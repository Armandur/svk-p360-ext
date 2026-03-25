# ROADMAP – 360° Hjälptillägg

Planerade, föreslagna och pågående funktioner. Uppdateras löpande i dialog med Claude.
Flytta en punkt till "Klart" när den är implementerad och testad.

---

## Planerat / Prioriterat

### Massregistrering av ärenden från CSV

Funktion för att skapa ett stort antal ärenden i batch utifrån en CSV-fil.
Primär användning: utträdes- och inträdesärenden, men designen är generell
och kan användas för andra ärendetyper.

#### Koncept

Massregistrering kombinerar tre befintliga byggstenar:
- **Ärendemall** – gemensam konfiguration (klassificering, åtkomstgrupp, ansvarig enhet, skyddskod osv.)
- **Dokumentmallar** – konfiguration per ärendedokument (handlingstyp, kategori, sparat på papper osv.)
- **CSV-fil** – radspecifik data (person, filer, överstyrningar av mallvärden)

Varje rad i CSV:en skapar **ett ärende** med kontaktperson, ett eller flera
ärendedokument med bifogade filer, och valfri statusändring.

#### CSV-kolumner

**Obligatoriska:**

| Kolumn | Exempel | Beskrivning |
|--------|---------|-------------|
| `Titel` | `Utträde ur Svenska kyrkan` | Ärendetitel (överstyr mallens titel) |
| `Förnamn` | `Anna` | Kontaktperson – förnamn |
| `Efternamn` | `Andersson` | Kontaktperson – efternamn |

**Valfria – kontaktuppgifter:**

| Kolumn | Exempel | Beskrivning |
|--------|---------|-------------|
| `Personnummer` | `19850101-1234` | Pers/org-nummer |
| `Adress` | `Storgatan 1` | Postadress |
| `Postnummer` | `123 45` | |
| `Ort` | `Storstaden` | |
| `Epost` | `anna@ex.se` | |
| `Telefon` | `070-1234567` | |

**Valfria – filer (en kolumn per dokumentslot):**

| Kolumn | Exempel | Beskrivning |
|--------|---------|-------------|
| `Fil_1` | `utträde_andersson.pdf` | Filnamn för dokumentslot 1 |
| `Fil_2` | `bevis_andersson.pdf` | Filnamn för dokumentslot 2 |
| `Fil_N` | … | Fler efter behov |

Varje `Fil_N`-kolumn kopplas till en befintlig **dokumentmall** i gränssnittet.
Tom cell = det dokumentet hoppas över för den raden.

**Valfria – ärendeöverstyrningar:**

| Kolumn | Exempel | Beskrivning |
|--------|---------|-------------|
| `Diarieenhet` | `KHS` | Överstyr mallens diarieenhet |
| `AnsvarigPerson` | `Kalle Karlsson` | Överstyr mallens ansvariga person |
| `Skyddskod` | `KO` / `OSL` / `Offentlig` | Överstyr mallens skyddskod |
| `Paragraf` | `Kyrkoordningen 54 kap. 2 §` | Krävs om KO/OSL |
| `OffentligTitel` | `Utträde` | Manuell offentlig titel vid sekretess |
| `Kommentar` | `Inkommen via post` | Ärendekommentar (flik 5) |
| `Ankomstdatum` | `2026-03-15` | Datum för inkommande dokument |
| `Status` | `Avslutat` | Överstyr – default Avslutat |

Kolumner som är tomma i en rad → mallens defaultvärde används.

#### Flöde i gränssnittet (extension-sida)

1. **Välj ärendemall** – grund för alla ärenden (klassificering, åtkomstgrupp osv.)
2. **Ladda CSV + välj filmapp** – CSV:en pekar ut filnamn, mappen innehåller filerna
3. **Koppla fil-kolumner till dokumentmallar:**

   | CSV-kolumn | Dokumentmall | Kontaktroll |
   |---|---|---|
   | `Fil_1` | "Inkommande anmälan" | Avsändare |
   | `Fil_2` | "Utgående utträdesbevis" | Mottagare |

   Kontaktroll (avsändare/mottagare) bestäms av dokumentmallens kategori
   (Inkommande → avsändare, Utgående → mottagare).

4. **Inställningar:**
   - [x] Stäng ärende efter skapande (status: Avslutat)
   - [x] Öppna dagboksblad i nya flikar efteråt

5. **Förhandsgranska** – tabell med alla rader, filer, och validering
6. **Starta** – kör raderna sekventiellt

#### Exekveringsflöde per rad

1. Skapa ärende från ärendemallen (med överstyrningar från CSV)
2. Lägg till kontaktperson (oregistrerad extern kontakt med uppgifter från CSV)
3. För varje `Fil_N` som har värde:
   - Skapa ärendedokument från kopplad dokumentmall
   - Bifoga fil
   - Lägg till kontaktpersonen som avsändare/mottagare
4. Stäng ärendet (om inställningen är vald)
5. Spara dagboksbladets URL (för batch-öppning efteråt)

#### Resultatrapport

Visas i gränssnittet och kan laddas ned som CSV:

| # | Titel | Kontakt | Diarienummer | Dok 1 | Dok 2 | Resultat |
|---|---|---|---|---|---|---|
| 1 | Utträde ur Sv kyrkan | Anna Andersson | KHS 2026-0080 | KHS 2026-0080:1 | KHS 2026-0080:2 | OK |
| 2 | Utträde ur Sv kyrkan | Bo Bergström | KHS 2026-0081 | KHS 2026-0081:1 | KHS 2026-0081:2 | OK |
| 3 | Utträde ur Sv kyrkan | Carin Carlsson | KHS 2026-0082 | KHS 2026-0082:1 | *(hoppades över)* | OK |

Knappar: **[Ladda ned resultat-CSV]** **[Öppna dagboksblad (3 flikar)]**

#### Exempel: utträdesärenden

**Mapp:**
```
Utträden mars 2026/
├── batch.csv
├── utträde_andersson.pdf
├── bevis_andersson.pdf
├── utträde_bergström.pdf
├── bevis_bergström.pdf
└── utträde_carlsson.pdf
```

**batch.csv:**

```csv
Titel;Förnamn;Efternamn;Personnummer;Diarieenhet;AnsvarigPerson;Fil_1;Fil_2;Ankomstdatum
Utträde ur Svenska kyrkan;Anna;Andersson;19850101-1234;KHS;Kalle Karlsson;utträde_andersson.pdf;bevis_andersson.pdf;2026-03-10
Utträde ur Svenska kyrkan;Bo;Bergström;;KHS;Kalle Karlsson;utträde_bergström.pdf;bevis_bergström.pdf;2026-03-12
Utträde ur Svenska kyrkan;Carin;Carlsson;19900303-5678;KHS;;utträde_carlsson.pdf;;2026-03-15
```

Rad 3: Carlsson saknar utgående bevis (Fil_2 tom) → dokument 2 hoppas över.
Rad 2: Bergström saknar personnummer → fältet lämnas tomt i kontakten.
Rad 3: Carlsson saknar AnsvarigPerson → ärendemallens default används.

#### Visuellt gränssnitt (extension-sida)

Batch-gränssnittet är en **redigerbar tabell** i en dedikerad extension-sida.
Tabellen kan fyllas på tre sätt – alla fyller samma tabell:

1. **Manuellt** – klicka "+ Lägg till rad" och fyll i fält direkt i tabellen
2. **CSV-import** – ladda en CSV-fil som fyller tabellen; redigera sedan vid behov
3. **Dra och släpp filer** – se nedan

**Filhantering via dra och släpp:**

- **Dra N filer till tabellen (utanför en specifik cell):** Varje fil skapar en ny
  rad med filen i `Fil_1`-kolumnen. Filnamnet (utan filändelse) föreslås som titel.
  Smidigt för det vanliga fallet "en inkommande fil per ärende".
- **Dra en fil till en specifik fil-cell:** Filen läggs i just den cellen. Används
  för att komplettera en rad med t.ex. `Fil_2` (utgående bevis) eller byta ut en fil.
- **Filväljare (📎):** Varje fil-cell har en klickbar ikon som öppnar en vanlig
  filväljare som alternativ till dra och släpp.

**Valfria kolumner:** Tabellen visar som standard bara grundfälten (Titel, Förnamn,
Efternamn, Fil_1). Extrakolumner (Personnummer, Adress, Diarieenhet, AnsvarigPerson,
Skyddskod osv.) togglas till via knappar ovanför tabellen. Håller gränssnittet rent
när man bara behöver grundinformationen.

**Layout:**

```
┌─ Massregistrering ─────────────────────────────────────────────┐
│                                                                │
│  Ärendemall: [Utträde           ▼]                             │
│  Dokumentslotsar:                                              │
│    Fil_1 → [Inkommande anmälan  ▼]  (avsändare)               │
│    Fil_2 → [Utgående bevis      ▼]  (mottagare)               │
│    [+ Lägg till slot]                                          │
│                                                                │
│  ☐ Stäng ärende   ☐ Dagboksblad                               │
│                                                                │
│  [Importera CSV]  [+ Lägg till rad]                            │
│ ┌───┬──────────┬────────┬───────────┬──────────┬──────────┐    │
│ │ # │ Titel    │Förnamn │ Efternamn │ Fil_1    │ Fil_2    │    │
│ ├───┼──────────┼────────┼───────────┼──────────┼──────────┤    │
│ │ 1 │ Utträde… │ Anna   │ Andersson │ 📎 fil… │ 📎 fil… │    │
│ │ 2 │ Utträde… │ Bo     │ Bergström │ 📎 fil… │ 📎 fil… │    │
│ │ 3 │ Utträde… │ Carin  │ Carlsson  │ 📎 fil… │          │    │
│ └───┴──────────┴────────┴───────────┴──────────┴──────────┘    │
│        ↕ Dra filer hit för att lägga till rader ↕              │
│                                                                │
│  Kolumner: [+Personnr] [+Adress] [+Diarieenhet] [+...]        │
│                                                                │
│  [Förhandsgranska]  [Starta 3 ärenden]                         │
└────────────────────────────────────────────────────────────────┘
```

#### Tekniska utmaningar

- ~~Bifoga PDF-filer programmatiskt~~ → Löst (filuppladdning via FileUpload.ashx + eval i iframe-kontext)
- ~~Skicka stora filer från popup~~ → Löst (chrome.storage.local + unlimitedStorage)
- Hantera fel per rad utan att avbryta hela batchen
- Köhantering så att 360° inte överbelastas (fördröjning mellan ärenden)
- CSV-parsning med stöd för semikolon- och kommaseparering
- Dagboksbladsnerladdning: öppna i nya flikar (manuell utskrift som första steg)
- Dra och släpp: skilja mellan "dra till tabellen" (nya rader) och "dra till cell" (specifik fil)

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
| Batch-uppladdning: en fil per ärendedokument (popup) | 2026-03-25 |
