# Plan: OCR-extraktion av avsändare/mottagare från PDF

## Bakgrund och syfte

Vid filuppladdning till ärendedokument med en dokumentmall (kategori 110 Inkommande / 111 Utgående)
ska användaren kunna extrahera avsändarens/mottagarens namn direkt från den uppladdade PDF-filen,
istället för att manuellt skriva in det i `oregistreradKontakt`-fältet i dokumentmallen.

### Vald ansats: Hybridlösning med manuell markering

Tre nivåer, i prioritetsordning:

1. **pdf.js textextraktion** (automatisk, för digitala PDF:er) – kör `page.getTextContent()`
   och visa klickbara textrader som användaren kan välja bland.
2. **Rektangel-OCR med Tesseract.js** (manuell, för skannade dokument) – användaren ritar
   en rektangel kring avsändarnamnet på en renderad PDF-bild, varefter Tesseract.js kör OCR
   på det beskurna området.
3. **Manuell inmatning** – användaren kan alltid redigera/skriva in namnet för hand.

### Scope

- **Enskild filuppladdning** ("Ladda upp fil(er) till nytt ärendedokument") – OCR-steg erbjuds
  innan dokumentskapande startar.
- **Batch-uppladdning** ("Batch: en fil per ärendedokument") – OCR-sidan öppnas sekventiellt
  per PDF-fil i batchen innan batch-körningen startar.

---

## Referensimplementation

Repot `Armandur/svk-had-gravregister` använder samma teknik i filen
`static/gravplatser-ocr.js`. Nyckelkoncept att återanvända:

- **`startOcrOverlay()`** – skapar ett genomskinligt overlay-div ovanpå bilden med
  `mousedown`/`mousemove`/`mouseup` för rektangelritning.
- **Koordinatskalning** – rektangelkoordinater omvandlas från skärmkoordinater till
  naturliga bildkoordinater via `scaleX = img.naturalWidth / imgRect.width`.
- **`runOcr(imageUrl, rect)`** – beskär utvald region till en offscreen-canvas och kör
  `Tesseract.recognize(canvas, 'swe+eng')`.

---

## Steg-för-steg implementation

### Steg 1: Ladda ner och bundla bibliotek lokalt

Manifest V3 tillåter inte CDN-laddning (CSP: `script-src 'self'`). Alla bibliotek måste
bundlas i tillägget.

Skapa katalog `lib/` i projektets rot med följande filer:

| Fil | Källa | Storlek (ca) |
|-----|-------|-------------|
| `pdf.min.mjs` | [pdf.js v4](https://github.com/nicolo-ribaudo/pdfjs-dist) | ~800 KB |
| `pdf.worker.min.mjs` | Samma paket | ~700 KB |
| `tesseract.min.js` | [Tesseract.js v5](https://github.com/naptha/tesseract.js) | ~170 KB |
| `tesseract-worker.min.js` | Samma paket | ~50 KB |
| `tesseract-core-simd.wasm.js` | Samma paket | ~1.2 MB |
| `eng.traineddata.gz` | tessdata_fast | ~1.5 MB |

**Valfritt:** `swe.traineddata.gz` (~500 KB fast-variant) kan laddas vid första användning
och cachas i `chrome.storage.local` för att hålla nere startstorleken.

**Total storlek:** ~3–4 MB tillägg (nuvarande extension ~3.3 MB).

**MV3-kompatibilitet:**
- pdf.js v4 och Tesseract.js v5 använder inte `eval()` eller `new Function()`.
- Workers måste peka på lokala filer:
  ```js
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');
  ```
- Tesseract.js konfigureras med `workerPath` och `corePath`:
  ```js
  const worker = await Tesseract.createWorker('eng+swe', 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract-worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core-simd.wasm.js'),
    langPath: chrome.runtime.getURL('lib/'),
  });
  ```

### Steg 2: Uppdatera `manifest.json`

Lägg till `web_accessible_resources` så att workers och språkdata kan laddas:

```json
"web_accessible_resources": [{
  "resources": ["lib/*"],
  "matches": ["<all_urls>"]
}]
```

### Steg 3: Skapa `ocr-kontakt.html` (NY FIL)

Följ befintligt mönster från `batch.html` / `dokument-mall.html`.

**HTML-struktur:**

```
┌──────────────────────────────────────────────┐
│  Hämta avsändare från PDF          [Sida 1/3]│
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │                                      │    │
│  │   PDF renderad som canvas            │    │
│  │   (med overlay för rektangelritning) │    │
│  │                                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌─ Extraherad text ────────────────────┐    │  ← Klickbar lista (textextraktion)
│  │  rad 1 från PDF                      │    │    ELLER rektangel-OCR-resultat
│  │  rad 2 från PDF                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Namn: [____________________________]        │  ← Redigerbart resultatfält
│                                              │
│  [ Rita rektangel för OCR ]                  │  ← Aktiverar rektangelläge
│  [◄ Föreg.] [Nästa ►]                       │  ← Sidnavigering
│                                              │
│  [    Använd    ]  [ Avbryt ]                │  ← Bekräfta eller avbryt
└──────────────────────────────────────────────┘
```

**Laddar skript:** `<script src="lib/pdf.min.mjs" type="module">` och
`<script src="lib/tesseract.min.js">` samt `<script src="ocr-kontakt.js">`.

**Etiketter anpassas dynamiskt:**
- Kategori 110 → rubrik "Hämta avsändare", fältetikett "Avsändare"
- Kategori 111 → rubrik "Hämta mottagare", fältetikett "Mottagare"

### Steg 4: Skapa `ocr-kontakt.js` (NY FIL)

Huvudlogik, ca 200–300 rader. Följande funktioner:

#### 4a. Initiering

```js
// Läs URL-parametrar
const params = new URLSearchParams(location.search);
const storageKey = params.get('storageKey');  // t.ex. 'tempOcrFil'
const kategori = params.get('kategori');       // '110' eller '111'

// Hämta fildata
const data = await chrome.storage.local.get(storageKey);
const filBase64 = data[storageKey];  // data:application/pdf;base64,...

// Initiera pdf.js
const pdfjsLib = await import(chrome.runtime.getURL('lib/pdf.min.mjs'));
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

const pdfDoc = await pdfjsLib.getDocument({ data: atob(filBase64.split(',')[1]) }).promise;
let currentPage = 1;
```

#### 4b. PDF-rendering

```js
async function renderPage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.getElementById('pdf-canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  // Uppdatera sidindikator
  document.getElementById('page-info').textContent = `Sida ${pageNum} av ${pdfDoc.numPages}`;

  // Försök extrahera text
  await extractText(page);
}
```

#### 4c. Automatisk textextraktion (Nivå 1)

```js
async function extractText(page) {
  const textContent = await page.getTextContent();
  const textList = document.getElementById('text-list');
  textList.innerHTML = '';

  const lines = [];
  let currentLine = '';
  // Gruppera textitems till rader baserat på Y-koordinat
  // ... (gruppera items med samma transform[5]-värde)

  if (lines.length > 0) {
    lines.forEach(line => {
      const li = document.createElement('div');
      li.className = 'text-rad';
      li.textContent = line;
      li.addEventListener('click', () => {
        document.getElementById('resultat-namn').value = line.trim();
      });
      textList.appendChild(li);
    });
    document.getElementById('text-section').style.display = '';
  } else {
    // Ingen text hittades – skannat dokument, visa OCR-instruktion
    document.getElementById('text-section').style.display = 'none';
    document.getElementById('ocr-hint').style.display = '';
  }
}
```

#### 4d. Rektangel-OCR (Nivå 2)

Mönster från `svk-had-gravregister/static/gravplatser-ocr.js`:

```js
function startRectangleMode() {
  const canvas = document.getElementById('pdf-canvas');
  const overlay = document.createElement('div');
  overlay.className = 'ocr-overlay';
  // Placera overlay exakt ovanpå canvas
  // ...

  const rectEl = document.createElement('div');
  rectEl.className = 'ocr-rektangel';

  let startX, startY, dragging = false;

  overlay.addEventListener('mousedown', (e) => {
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    dragging = true;
    overlay.appendChild(rectEl);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    rectEl.style.left = Math.min(startX, x) + 'px';
    rectEl.style.top = Math.min(startY, y) + 'px';
    rectEl.style.width = Math.abs(x - startX) + 'px';
    rectEl.style.height = Math.abs(y - startY) + 'px';
  });

  overlay.addEventListener('mouseup', async (e) => {
    dragging = false;
    // Beräkna rektangel i canvas-koordinater
    const scaleX = canvas.width / overlay.offsetWidth;
    const scaleY = canvas.height / overlay.offsetHeight;
    const cropRect = {
      x: parseFloat(rectEl.style.left) * scaleX,
      y: parseFloat(rectEl.style.top) * scaleY,
      w: parseFloat(rectEl.style.width) * scaleX,
      h: parseFloat(rectEl.style.height) * scaleY,
    };

    // Visa "Kör OCR..."
    document.getElementById('ocr-status').textContent = 'Kör OCR…';

    // Beskär till offscreen-canvas och kör Tesseract
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropRect.w;
    croppedCanvas.height = cropRect.h;
    croppedCanvas.getContext('2d').drawImage(
      canvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h,
      0, 0, cropRect.w, cropRect.h
    );

    const result = await Tesseract.recognize(croppedCanvas, 'swe+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          document.getElementById('ocr-status').textContent =
            `OCR: ${Math.round(m.progress * 100)}%`;
        }
      }
    });

    document.getElementById('resultat-namn').value = result.data.text.trim();
    document.getElementById('ocr-status').textContent = '';
    overlay.remove();
  });

  // Escape avbryter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });

  canvas.parentElement.appendChild(overlay);
}
```

#### 4e. Bekräfta och returnera resultat

```js
document.getElementById('btn-anvand').addEventListener('click', async () => {
  const namn = document.getElementById('resultat-namn').value.trim();
  if (!namn) return;

  await chrome.storage.local.set({ ocrResultat: { namn, tid: Date.now() } });
  // Rensa temporär fildata
  await chrome.storage.local.remove(storageKey);
  window.close();
});

document.getElementById('btn-avbryt').addEventListener('click', async () => {
  await chrome.storage.local.remove(storageKey);
  window.close();
});
```

### Steg 5: Ändra `popup.html`

**I `fil-panel`** (efter `<select id="fil-mall-val">`, rad 217–219, före knapparna rad 220):

```html
<!-- OCR-kontaktsektion – visas om vald mall har kategori 110/111 -->
<div id="fil-ocr-sektion" style="display:none;margin-bottom:6px;">
  <div style="display:flex;gap:4px;align-items:center;">
    <button id="btn-fil-ocr" type="button"
      style="flex:1;margin:0;padding:5px;font-size:11px;background:#fff3e0;border-color:#ffb74d;">
      Hämta avsändare/mottagare från PDF
    </button>
  </div>
  <div id="fil-ocr-resultat" style="display:none;margin-top:4px;">
    <label style="font-size:10px;color:#555;" id="fil-ocr-label">Avsändare:</label>
    <input id="fil-ocr-namn" type="text"
      style="width:100%;padding:4px;font-size:12px;border:1px solid #ccc;border-radius:3px;box-sizing:border-box;">
  </div>
</div>
```

**I `batch-panel`** (efter `<select id="batch-mall-val">`, rad 231–233):

Samma struktur men med `batch-`-prefix på id:n (`batch-ocr-sektion`, `btn-batch-ocr`, etc.).

### Steg 6: Ändra `popup.js`

#### 6a. Visa/dölj OCR-sektionen baserat på vald mall

Lägg till change-lyssnare efter befintlig `fil-input` change-handler (rad 575–595):

```js
// Visa OCR-sektion om vald mall har kategori 110/111 och fil är PDF
document.getElementById('fil-mall-val').addEventListener('change', async (e) => {
  const mallId = e.target.value;
  const ocrSektion = document.getElementById('fil-ocr-sektion');

  if (!mallId) { ocrSektion.style.display = 'none'; return; }

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const harPdf = uppladdningsFiler.some(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

  if (mall && ['110', '111'].includes(mall.kategori) && harPdf) {
    ocrSektion.style.display = '';
    document.getElementById('fil-ocr-label').textContent =
      mall.kategori === '110' ? 'Avsändare:' : 'Mottagare:';
  } else {
    ocrSektion.style.display = 'none';
  }
});
```

#### 6b. Öppna OCR-sida och lyssna på resultat

```js
document.getElementById('btn-fil-ocr').addEventListener('click', async () => {
  const pdfFil = uppladdningsFiler.find(f =>
    f.type === 'application/pdf' || f.name.endsWith('.pdf'));
  if (!pdfFil) return;

  // Konvertera till base64 och spara
  const base64 = await filTillBase64(pdfFil);
  await chrome.storage.local.set({ tempOcrFil: base64 });

  // Läs kategori från vald mall
  const mallId = document.getElementById('fil-mall-val').value;
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const kategori = mall?.kategori || '110';

  // Öppna OCR-sidan i ny flik
  chrome.tabs.create({
    url: chrome.runtime.getURL(`ocr-kontakt.html?storageKey=tempOcrFil&kategori=${kategori}`)
  });
});

// Lyssna på OCR-resultat (samma mönster som tempDokInstans i dokument-mall.js)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.ocrResultat?.newValue) {
    const { namn } = changes.ocrResultat.newValue;
    document.getElementById('fil-ocr-namn').value = namn;
    document.getElementById('fil-ocr-resultat').style.display = '';
    chrome.storage.local.remove('ocrResultat');
  }
});
```

#### 6c. Inkludera OCR-resultat vid dokumentskapande

I `btn-fil-starta` click-handler (rad 602), efter rad 621 (`if (dm) { mallData = { ...dm }; ...}`):

```js
// Lägg till OCR-resultat om det finns
const ocrNamn = document.getElementById('fil-ocr-namn')?.value?.trim();
if (ocrNamn) {
  mallData.oregistreradKontakt = ocrNamn;
}
```

#### 6d. Batch-stöd

I `btn-batch-starta` click-handler, om mallen har kat 110/111:

```js
// Före batch-körning: öppna OCR-sida sekventiellt per PDF-fil
const batchOcrResultat = {};

if (['110', '111'].includes(mall?.kategori)) {
  for (let i = 0; i < batchFiler.length; i++) {
    const fil = batchFiler[i];
    if (fil.type !== 'application/pdf' && !fil.name.endsWith('.pdf')) continue;

    const base64 = await filTillBase64(fil);
    const key = `tempOcrFil_batch_${i}`;
    await chrome.storage.local.set({ [key]: base64 });

    // Öppna OCR-sidan och vänta på resultat
    const resultat = await new Promise((resolve) => {
      const listener = (changes) => {
        if (changes.ocrResultat?.newValue) {
          chrome.storage.onChanged.removeListener(listener);
          chrome.storage.local.remove('ocrResultat');
          resolve(changes.ocrResultat.newValue.namn);
        }
      };
      chrome.storage.onChanged.addListener(listener);

      chrome.tabs.create({
        url: chrome.runtime.getURL(
          `ocr-kontakt.html?storageKey=${key}&kategori=${mall.kategori}`
        )
      });
    });

    batchOcrResultat[i] = resultat;
  }
}

// Vid skapande av varje dokument i batchen:
// dok.oregistreradKontakt = batchOcrResultat[i] || '';
```

---

## Befintliga filer och mönster att återanvända

| Mönster | Källa | Relevans |
|---------|-------|----------|
| Rektangelritning + OCR | `svk-had-gravregister/static/gravplatser-ocr.js` (`startOcrOverlay`, `runOcr`) | Direkt applicerbart |
| Storage-kommunikation popup↔sida | `dokument-mall.js` rad 276–289 (`tempDokInstans` + `onChanged`) | Exakt samma mönster |
| `oregistreradKontakt`-konsumtion | `page-document-fill.js` rad 217–233 | **Ingen ändring behövs** – tar emot `dok.oregistreradKontakt` och fyller fältet |
| `filTillBase64()` | `popup.js` (befintlig hjälpfunktion) | Återanvänd direkt |
| HTML-sidstruktur | `batch.html` (sektioner, knappar, inbäddad CSS) | Följ samma struktur |

## Filer att ändra/skapa

| Fil | Åtgärd | Beskrivning |
|-----|--------|-------------|
| `lib/` | **NY KATALOG** | pdf.js + Tesseract.js bundlade filer |
| `ocr-kontakt.html` | **NY FIL** | PDF-visare med OCR-gränssnitt |
| `ocr-kontakt.js` | **NY FIL** | PDF-rendering, textextraktion, rektangel-OCR |
| `popup.html` | ÄNDRA | Lägg till OCR-sektioner i fil-panel och batch-panel |
| `popup.js` | ÄNDRA | OCR-trigger, storage-lyssnare, integrera resultat |
| `manifest.json` | ÄNDRA | Lägg till `web_accessible_resources` för `lib/*` |
| `CLAUDE.md` | ÄNDRA | Uppdatera filstruktur med nya filer |

## Verifiering

1. **Enskild fil:** Välj PDF i popup → välj mall med kategori 110 → OCR-knapp syns →
   klicka → `ocr-kontakt.html` öppnas med renderad PDF → klicka textrad ELLER rita
   rektangel → namn fylls i → klicka "Använd" → popup visar namn → "Ladda upp" →
   dokument skapas med `oregistreradKontakt` ifyllt.

2. **Batch:** Välj flera PDF:er → mall med kat 110 → klicka "Starta batch" → OCR-sida
   öppnas per fil → namn extraheras → alla dokument skapas med respektive kontaktnamn.

3. **Skannad PDF:** Textextraktion ger tomt → instruktion visas → rita rektangel kring
   namn → Tesseract kör OCR → resultat visas i fält → redigera vid behov → "Använd".

4. **Digital PDF:** Textextraktion ger textrader → klicka på rätt rad → namn fylls i →
   "Använd".

5. **Avbryt-flöde:** Klicka "Avbryt" i OCR-sidan → popup behåller tom kontakt → manuell
   inmatning vid behov (validering fångar saknad kontakt som vanligt).
