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

> Tillägget finns inte i Chrome Web Store eller Edge Add-ons Store – det distribueras som en
> `.crx`-fil (rekommenderat) eller som en okomprimerad ZIP (alternativ).

### Metod 1 – via webbsida med .crx (rekommenderat)

Om din organisation hostar en nedladdningssida: öppna den i webbläsaren, ladda ned `.crx`-filen
och följ stegen nedan.

**Microsoft Edge**

1. Öppna **`edge://extensions`** i adressfältet.
2. Klicka på **Tillåt tillägg från andra butiker** längst ned till vänster och bekräfta.
   *(Engångssteg – behöver bara göras en gång.)*
3. Dra och släpp `.crx`-filen till `edge://extensions`-sidan.
4. Klicka **Lägg till tillägg** i dialogen.

**Google Chrome**

1. Öppna **`chrome://extensions`** i adressfältet.
2. Aktivera **Utvecklarläge** med reglaget uppe till höger.
3. Dra och släpp `.crx`-filen till `chrome://extensions`-sidan.
4. Klicka **Lägg till tillägg** i dialogen.

**Uppdatering:** ladda ned den nya `.crx`-filen och dra in den på tilläggssidan igen.
Edge/Chrome ersätter den gamla versionen automatiskt.

---

### Metod 2 – okomprimerad ZIP via GitHub Releases

Används om `.crx`-distribution inte är uppsatt.

1. **Ladda ned** senaste `extension-X.Y.Z.zip` från [Releases](https://github.com/Armandur/svk-p360-ext/releases).
2. **Packa upp** ZIP-filen till en mapp på din dator, t.ex. `C:\Tillägg\360-hjalptillagg\`.
   Mappen ska innehålla `manifest.json` direkt (inte en undermapp).
3. Öppna **`edge://extensions`** (Edge) eller **`chrome://extensions`** (Chrome).
4. Aktivera **Utvecklarläge** med reglaget uppe till vänster/höger.
5. Klicka på **Läs in okomprimerat tillägg** och välj den uppackade mappen.

**Uppdatering:** packa upp den nya ZIP-filen till **samma mapp** (skriv över), gå sedan till
tilläggssidan och klicka på uppdateringsikonen (⟳) – eller inaktivera och återaktivera tillägget.

> **OBS:** Håll mappen kvar på sin plats. Om du tar bort eller flyttar mappen slutar tillägget fungera.

---

## Distribuera med webbsida (för IT-ansvariga)

Varje [release](https://github.com/Armandur/svk-p360-ext/releases) innehåller en färdig `index.html`
(nedladdningssida med installationsguide). Lägg den tillsammans med en signerad `svk-p360-ext.crx`
på valfri intern webbserver.

Källmall finns i [`hosting/index.html`](hosting/index.html) med platshållarna `{{VERSION}}` och
`{{DATE}}` som ersätts automatiskt av GitHub Actions vid varje release.

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
