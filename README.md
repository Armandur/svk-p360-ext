# 360° Hjälptillägg – Svenska kyrkan

Webbläsartillägg (Chrome/Edge) som automatiserar repetitiva arbetsmoment i **Public 360°**
hos Svenska kyrkan. Riktar sig till registratorer och handläggare.

## Funktioner

- **Ärendemallar** – skapa ärenden med förifyllda fält, sekretess och externa kontakter med ett klick
- **Ärendedokument** – skapa dokument med filuppladdning som del av ärendeskapandeflödet
- **Massregistrering** – skapa många ärenden från CSV-fil med koppling av filer och OCR-stöd
- **OCR** – extrahera avsändare, datum och titel från PDF-handlingar med Tesseract.js
- **Dagboksblad** – öppna och skriv ut dagboksblad direkt (Alt+Shift+D)
- **Statushantering** – växla Öppet ↔ Avslutat med ett klick eller Alt+Shift+S
- **Snabbkommandon** – redigera egenskaper (Alt+Shift+E), makulera (Alt+Shift+M) m.fl.
- **Export/import av mallar** – dela malluppsättningar som JSON-fil

## Installation

> Tillägget distribueras som en ZIP-fil från [Releases](https://github.com/Armandur/svk-p360-ext/releases).
> Det finns inte i Chrome Web Store eller Edge Add-ons – installation sker via utvecklarläge.

### Steg för steg (Microsoft Edge)

1. **Ladda ned** senaste `extension-X.Y.Z.zip` från [Releases](https://github.com/Armandur/svk-p360-ext/releases).
2. **Packa upp** ZIP-filen till en mapp på din dator, t.ex. `C:\Tillägg\360-hjalptillagg\`.
   Mappen ska innehålla `manifest.json` direkt (inte en undermapp).
3. Öppna **`edge://extensions`** i adressfältet.
4. Aktivera **Utvecklarläge** med reglaget uppe till vänster.
5. Klicka på **Läs in okomprimerat tillägg** och välj den uppackade mappen.
6. Tillägget visas nu i verktygsfältet. Navigera till `https://p360.svenskakyrkan.se` för att börja använda det.

### Steg för steg (Google Chrome)

1–2. Samma som ovan.
3. Öppna **`chrome://extensions`** i adressfältet.
4–6. Samma som ovan.

### Uppdatering

Vid ny version: ladda ned och packa upp den nya ZIP-filen **till samma mapp** (skriv över befintliga filer),
gå sedan till `edge://extensions` och klicka på uppdateringsikonen (⟳) bredvid tillägget –
eller inaktivera och återaktivera det.

> **OBS:** Håll mappen kvar på sin plats. Om du tar bort eller flyttar mappen slutar tillägget fungera.

## Snabbkommandon

| Tangenter | Funktion |
|-----------|----------|
| Alt+Shift+D | Dagboksblad + utskriftsdialog |
| Alt+Shift+S | Växla status Öppet ↔ Avslutat |
| Alt+Shift+E | Redigera egenskaper |
| Alt+Shift+M | Makulera ärende |

Kommandona kan anpassas via `edge://extensions/shortcuts` resp. `chrome://extensions/shortcuts`.

## Krav

- Microsoft Edge eller Google Chrome
- Åtkomst till `https://p360.svenskakyrkan.se`
- Rollen registrator eller huvudregistrator (andra roller är inte testade)

## Teknisk information

Manifestversion 3, vanilla JavaScript (ES2020+), inga externa nätverksberoenden.
Bundlade bibliotek: pdf.js v4, Tesseract.js v5.

Se [ROADMAP.md](ROADMAP.md) för planerade funktioner och kända begränsningar.
