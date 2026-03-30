// ocr-kontakt.js – PDF-rendering, textextraktion och rektangel-OCR
// Körs som ES-modul i ocr-kontakt.html

// --- Initiera pdf.js ---
const pdfjsLib = await import(chrome.runtime.getURL('lib/pdf.min.mjs'));
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

// --- Läs URL-parametrar ---
const params = new URLSearchParams(location.search);
const storageKey = params.get('storageKey') || 'tempOcrFil';
const kategori = params.get('kategori') || '110';

// Anpassa etiketter efter kategori
const ärAvsändare = kategori === '110';
document.getElementById('huvud-rubrik').textContent =
  ärAvsändare ? 'Hämta avsändare från PDF' : 'Hämta mottagare från PDF';
document.getElementById('resultat-etikett').textContent =
  ärAvsändare ? 'Avsändare:' : 'Mottagare:';

// --- Hämta PDF-data från storage ---
const storageData = await chrome.storage.local.get(storageKey);
const filBase64 = storageData[storageKey];

if (!filBase64) {
  document.getElementById('ocr-status').textContent = 'Fel: Ingen fildata hittades.';
  document.getElementById('ocr-status').style.color = '#c0392b';
  document.getElementById('btn-rita-rektangel').disabled = true;
  document.getElementById('btn-anvand').disabled = true;
  throw new Error('Ingen fildata i storage');
}

// Konvertera base64 → ArrayBuffer
const base64Sträng = filBase64.includes(',') ? filBase64.split(',')[1] : filBase64;
const binär = atob(base64Sträng);
const bytes = new Uint8Array(binär.length);
for (let i = 0; i < binär.length; i++) bytes[i] = binär.charCodeAt(i);

// Ladda PDF
let pdfDok;
try {
  pdfDok = await pdfjsLib.getDocument({ data: bytes }).promise;
} catch (e) {
  document.getElementById('ocr-status').textContent = 'Fel: Kunde inte öppna PDF.';
  document.getElementById('ocr-status').style.color = '#c0392b';
  throw e;
}

let aktuelltSidnummer = 1;
const antalSidor = pdfDok.numPages;

// Uppdatera sidnavigering
function uppdateraSidnav() {
  document.getElementById('sidnav-text').textContent =
    `${aktuelltSidnummer} / ${antalSidor}`;
  document.getElementById('sid-text').textContent =
    `Sida ${aktuelltSidnummer} av ${antalSidor}`;
  document.getElementById('btn-foreg').disabled = aktuelltSidnummer <= 1;
  document.getElementById('btn-nasta').disabled = aktuelltSidnummer >= antalSidor;
}

// --- Rendera en PDF-sida ---
async function renderaSida(sidnum) {
  const sida = await pdfDok.getPage(sidnum);
  const viewport = sida.getViewport({ scale: 1.5 });
  const canvas = document.getElementById('pdf-canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await sida.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;

  uppdateraSidnav();
  await extraheraText(sida);
}

// --- Nivå 1: Automatisk textextraktion ---
async function extraheraText(sida) {
  const textInnehall = await sida.getTextContent();
  const textLista = document.getElementById('text-lista');
  const ocrTips = document.getElementById('ocr-tips');
  textLista.innerHTML = '';

  // Gruppera textitems till rader baserat på Y-koordinat (avrundas till heltal)
  const radMap = new Map();
  for (const item of textInnehall.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5]);
    if (!radMap.has(y)) radMap.set(y, []);
    radMap.get(y).push(item.str);
  }

  // Sortera rader uppifrån ned (högre Y = högre upp i PDF-koordinatsystem)
  const sorterade = [...radMap.entries()].sort((a, b) => b[0] - a[0]);
  const rader = sorterade
    .map(([, delar]) => delar.join(' ').trim())
    .filter(rad => rad.length > 0);

  if (rader.length > 0) {
    ocrTips.style.display = 'none';
    rader.forEach(rad => {
      const div = document.createElement('div');
      div.className = 'text-rad';
      div.textContent = rad;
      div.addEventListener('click', () => {
        // Avmarkera tidigare val
        textLista.querySelectorAll('.text-rad.vald').forEach(el => el.classList.remove('vald'));
        div.classList.add('vald');
        document.getElementById('resultat-namn').value = rad;
      });
      textLista.appendChild(div);
    });
  } else {
    ocrTips.style.display = '';
  }
}

// --- Sidnavigering ---
document.getElementById('btn-foreg').addEventListener('click', async () => {
  if (aktuelltSidnummer > 1) {
    aktuelltSidnummer--;
    await renderaSida(aktuelltSidnummer);
  }
});

document.getElementById('btn-nasta').addEventListener('click', async () => {
  if (aktuelltSidnummer < antalSidor) {
    aktuelltSidnummer++;
    await renderaSida(aktuelltSidnummer);
  }
});

// --- Nivå 2: Rektangel-OCR med Tesseract ---
let rektangelLägeAktivt = false;
let aktuelltOverlay = null;

function startaRektangelLäge() {
  if (aktuelltOverlay) aktuelltOverlay.remove();

  const canvas = document.getElementById('pdf-canvas');
  const wrapper = document.getElementById('pdf-wrapper');

  const overlay = document.createElement('div');
  overlay.className = 'ocr-overlay';
  // Matcha exakt canvas-dimensioner
  overlay.style.width = canvas.offsetWidth + 'px';
  overlay.style.height = canvas.offsetHeight + 'px';

  const rektEl = document.createElement('div');
  rektEl.className = 'ocr-rektangel';

  let startX = 0, startY = 0, ritar = false;

  overlay.addEventListener('mousedown', (e) => {
    const rect = overlay.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    ritar = true;
    rektEl.style.left = startX + 'px';
    rektEl.style.top = startY + 'px';
    rektEl.style.width = '0';
    rektEl.style.height = '0';
    overlay.appendChild(rektEl);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!ritar) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    rektEl.style.left = Math.min(startX, x) + 'px';
    rektEl.style.top = Math.min(startY, y) + 'px';
    rektEl.style.width = Math.abs(x - startX) + 'px';
    rektEl.style.height = Math.abs(y - startY) + 'px';
  });

  overlay.addEventListener('mouseup', async () => {
    ritar = false;
    const bredd = parseFloat(rektEl.style.width);
    const höjd = parseFloat(rektEl.style.height);
    if (bredd < 5 || höjd < 5) {
      overlay.remove();
      aktuelltOverlay = null;
      rektangelKnapp.classList.remove('aktiv');
      return;
    }

    // Skala från visningskoordinater till canvas-pixelkoordinater
    const scaleX = canvas.width / overlay.offsetWidth;
    const scaleY = canvas.height / overlay.offsetHeight;
    const beskärning = {
      x: parseFloat(rektEl.style.left) * scaleX,
      y: parseFloat(rektEl.style.top) * scaleY,
      w: bredd * scaleX,
      h: höjd * scaleY,
    };

    // Beskär till offscreen-canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = beskärning.w;
    tempCanvas.height = beskärning.h;
    tempCanvas.getContext('2d').drawImage(
      canvas,
      beskärning.x, beskärning.y, beskärning.w, beskärning.h,
      0, 0, beskärning.w, beskärning.h
    );

    overlay.remove();
    aktuelltOverlay = null;
    rektangelKnapp.classList.remove('aktiv');

    // Kör OCR
    await kördOCR(tempCanvas);
  });

  // Escape avbryter rektangelläge
  const escLyssnare = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      aktuelltOverlay = null;
      rektangelKnapp.classList.remove('aktiv');
      document.removeEventListener('keydown', escLyssnare);
    }
  };
  document.addEventListener('keydown', escLyssnare);

  wrapper.appendChild(overlay);
  aktuelltOverlay = overlay;
}

const rektangelKnapp = document.getElementById('btn-rita-rektangel');
rektangelKnapp.addEventListener('click', () => {
  if (aktuelltOverlay) {
    aktuelltOverlay.remove();
    aktuelltOverlay = null;
    rektangelKnapp.classList.remove('aktiv');
  } else {
    rektangelKnapp.classList.add('aktiv');
    startaRektangelLäge();
  }
});

// Initialisera Tesseract-worker (lazy, vid första användning)
let tesseractWorker = null;

async function hämtaTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;

  const statusEl = document.getElementById('ocr-status');
  statusEl.textContent = 'Laddar OCR-motor…';
  statusEl.style.color = '#0078d4';

  // Tesseract.js laddas som klassiskt skript (UMD-bundle) i html
  // Vi måste ladda det dynamiskt eftersom ocr-kontakt.js är en modul
  await laddaSkript(chrome.runtime.getURL('lib/tesseract.min.js'));

  tesseractWorker = await Tesseract.createWorker('swe+eng', 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract-worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core-simd.wasm.js'),
    langPath: chrome.runtime.getURL('lib/'),
    cacheMethod: 'none',
    logger: (m) => {
      if (m.status === 'loading language traineddata') {
        statusEl.textContent = `Laddar språkdata… ${Math.round((m.progress || 0) * 100)}%`;
      } else if (m.status === 'recognizing text') {
        statusEl.textContent = `OCR: ${Math.round((m.progress || 0) * 100)}%`;
      } else if (m.status === 'initialized api') {
        statusEl.textContent = '';
      }
    },
  });

  return tesseractWorker;
}

function laddaSkript(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Kunde inte ladda: ' + url));
    document.head.appendChild(script);
  });
}

async function kördOCR(canvas) {
  const statusEl = document.getElementById('ocr-status');
  statusEl.style.color = '#0078d4';

  try {
    const worker = await hämtaTesseractWorker();
    statusEl.textContent = 'Kör OCR…';
    const resultat = await worker.recognize(canvas);
    const text = resultat.data.text.trim();
    document.getElementById('resultat-namn').value = text;
    statusEl.textContent = text ? '' : 'Ingen text hittades – prova en större rektangel.';
    if (!text) statusEl.style.color = '#b36b00';
  } catch (e) {
    statusEl.textContent = 'OCR-fel: ' + e.message;
    statusEl.style.color = '#c0392b';
  }
}

// --- Bekräfta och returnera resultat ---
document.getElementById('btn-anvand').addEventListener('click', async () => {
  const namn = document.getElementById('resultat-namn').value.trim();
  if (!namn) {
    document.getElementById('resultat-namn').focus();
    return;
  }
  await chrome.storage.local.set({ ocrResultat: { namn, tid: Date.now() } });
  await chrome.storage.local.remove(storageKey);
  // Avsluta Tesseract-worker om aktiv
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch { /* ignorera */ }
  }
  window.close();
});

document.getElementById('btn-avbryt').addEventListener('click', async () => {
  await chrome.storage.local.remove(storageKey);
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch { /* ignorera */ }
  }
  window.close();
});

// --- Starta rendering av första sidan ---
await renderaSida(1);
