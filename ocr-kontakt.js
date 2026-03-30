// ocr-kontakt.js – PDF-rendering, textextraktion och rektangel-OCR
// Körs som ES-modul i ocr-kontakt.html

// --- Initiera pdf.js ---
const pdfjsLib = await import(chrome.runtime.getURL('lib/pdf.min.mjs'));
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

// --- Läs URL-parametrar ---
const params = new URLSearchParams(location.search);
const storageKey = params.get('storageKey') || 'tempOcrFil';
const kategori = params.get('kategori') || '110';

// Hämta OCR-kontext (innehåller lista över alla filer för uppladdning)
const { ocrContext } = await chrome.storage.local.get('ocrContext');

// Anpassa etiketter efter kategori
const ärInkommande = kategori === '110';
document.getElementById('huvud-rubrik').textContent =
  ärInkommande ? 'Hämta information från PDF – Inkommande' : 'Hämta information från PDF – Utgående';
document.getElementById('kontakt-etikett').textContent =
  ärInkommande ? 'Avsändare:' : 'Mottagare:';
document.getElementById('faltknapp-kontakt').textContent =
  ärInkommande ? 'Avsändare' : 'Mottagare';
document.getElementById('datum-etikett').textContent =
  ärInkommande ? 'Ankomstdatum:' : 'Datum:';

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

let pdfDok;
let aktuelltSidnummer = 1;
let antalSidor = 0;

async function öppnaPdf(base64Str) {
  const b64 = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
  const binär = atob(b64);
  const bytes = new Uint8Array(binär.length);
  for (let i = 0; i < binär.length; i++) bytes[i] = binär.charCodeAt(i);
  try {
    pdfDok = await pdfjsLib.getDocument({ data: bytes }).promise;
  } catch (e) {
    document.getElementById('ocr-status').textContent = 'Fel: Kunde inte öppna PDF.';
    document.getElementById('ocr-status').style.color = '#c0392b';
    throw e;
  }
  aktuelltSidnummer = 1;
  antalSidor = pdfDok.numPages;
  await renderaSida(1);
}

// Visa PDF-väljare om kontexten innehåller flera PDF-filer
const allaPdfFiler = (ocrContext?.filerData || []).filter(
  f => f.typ === 'application/pdf' || (f.namn || '').toLowerCase().endsWith('.pdf')
);
if (allaPdfFiler.length > 1) {
  const valjareDiv = document.createElement('div');
  valjareDiv.style.cssText =
    'padding:6px 12px;border-bottom:1px solid #eee;background:#fafafa;';
  const rubrik = document.createElement('div');
  rubrik.style.cssText =
    'font-size:10px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:3px;';
  rubrik.textContent = 'Välj PDF att visa';
  const sel = document.createElement('select');
  sel.id = 'pdf-val-select';
  sel.style.cssText =
    'width:100%;padding:4px 6px;font-size:11px;border:1px solid #ccc;border-radius:3px;';
  allaPdfFiler.forEach((f, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = f.namn;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', async () => {
    const vald = allaPdfFiler[parseInt(sel.value, 10)];
    if (vald) {
      document.getElementById('ocr-status').textContent = 'Laddar PDF…';
      await öppnaPdf(vald.base64);
      document.getElementById('ocr-status').textContent = '';
    }
  });
  valjareDiv.appendChild(rubrik);
  valjareDiv.appendChild(sel);
  const hogerKolumn = document.querySelector('.hoger-kolumn');
  const sidnav = document.querySelector('.sidnav');
  hogerKolumn.insertBefore(valjareDiv, sidnav);
}

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

  // Gruppera textitems till rader baserat på Y-koordinat
  const radMap = new Map();
  for (const item of textInnehall.items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5]);
    if (!radMap.has(y)) radMap.set(y, []);
    radMap.get(y).push(item.str);
  }

  // Sortera rader uppifrån ned (högre Y = högre upp i PDF-koordinatsystem)
  const rader = [...radMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, delar]) => delar.join(' ').trim())
    .filter(rad => rad.length > 0);

  if (rader.length > 0) {
    ocrTips.style.display = 'none';
    rader.forEach(rad => {
      const div = document.createElement('div');
      div.className = 'text-rad';
      div.textContent = rad;
      div.addEventListener('click', () => {
        fyllAktivtFält(rad);
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

// --- Fältväljare ---
// Vilket inputfält som text-klick och OCR-resultat fyller
let aktivtFältId = 'resultat-kontakt';

const fältKartläggning = {
  kontakt: 'resultat-kontakt',
  datum:   'resultat-datum',
  titel:   'resultat-titel',
};

function väljtFält(faltNyckel) {
  aktivtFältId = fältKartläggning[faltNyckel];

  // Uppdatera knapp-styling
  document.querySelectorAll('.falt-knapp').forEach(btn => {
    btn.classList.toggle('aktiv', btn.dataset.falt === faltNyckel);
  });

  // Markera aktivt inputfält visuellt
  Object.values(fältKartläggning).forEach(id => {
    document.getElementById(id).classList.toggle('aktivt-falt', id === aktivtFältId);
  });

  document.getElementById(aktivtFältId).focus();
}

document.querySelectorAll('.falt-knapp').forEach(btn => {
  btn.addEventListener('click', () => väljtFält(btn.dataset.falt));
});

// Fokusering av ett inputfält väljer det automatiskt som aktivt
Object.entries(fältKartläggning).forEach(([nyckel, id]) => {
  document.getElementById(id).addEventListener('focus', () => väljtFält(nyckel));
});

// --- Datumnormalisering ---
// Försöker tolka vanliga datumformat (inklusive OCR-fel med blandade separatorer)
// och returnerar YYYY-MM-DD, eller originaltexten om inget format känns igen.
function normaliseraDatum(text) {
  const t = text.trim();

  // YYYY-MM-DD (med valfria separatorer inkl. blanktecken, t.ex. "2026 03-30")
  const ååååFörst = t.match(/^(\d{4})[\s\-./](\d{1,2})[\s\-./](\d{1,2})$/);
  if (ååååFörst) {
    const [, å, m, d] = ååååFörst;
    const dt = new Date(+å, +m - 1, +d);
    if (dt.getFullYear() === +å && dt.getMonth() === +m - 1 && dt.getDate() === +d) {
      return `${å}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // DD[-/ .]MM[-/ .]YYYY — europeiskt format
  const ddFörst = t.match(/^(\d{1,2})[\s\-./](\d{1,2})[\s\-./](\d{4})$/);
  if (ddFörst) {
    const [, d, m, å] = ddFörst;
    const dt = new Date(+å, +m - 1, +d);
    if (dt.getFullYear() === +å && dt.getMonth() === +m - 1 && dt.getDate() === +d) {
      return `${å}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // YYYYMMDD — kompakt format
  const kompakt = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (kompakt) {
    const [, å, m, d] = kompakt;
    const dt = new Date(+å, +m - 1, +d);
    if (dt.getFullYear() === +å && dt.getMonth() === +m - 1 && dt.getDate() === +d) {
      return `${å}-${m}-${d}`;
    }
  }

  // "30 mars 2026", "30 mar 2026" o.dyl. — svenska månadsnamn
  const månader = {
    jan: 1, januari: 1, feb: 2, februari: 2,
    mar: 3, mars: 3, apr: 4, april: 4, maj: 5,
    jun: 6, juni: 6, jul: 7, juli: 7,
    aug: 8, augusti: 8, sep: 9, sept: 9, september: 9,
    okt: 10, oktober: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const svenMånad = t.toLowerCase().match(/^(\d{1,2})[\s\-.]([a-zåäö]+)[\s\-.](\d{4})$/);
  if (svenMånad) {
    const [, d, månStr, å] = svenMånad;
    const m = månader[månStr];
    if (m) {
      const dt = new Date(+å, m - 1, +d);
      if (dt.getFullYear() === +å && dt.getMonth() === m - 1 && dt.getDate() === +d) {
        return `${å}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
  }

  return text; // okänt format – returnera oförändrat
}

function fyllAktivtFält(text) {
  const värde = aktivtFältId === 'resultat-datum' ? normaliseraDatum(text) : text;
  document.getElementById(aktivtFältId).value = värde;
  // Markera vald textrad visuellt
  document.querySelectorAll('.text-rad').forEach(el => el.classList.remove('vald'));
  document.querySelectorAll('.text-rad').forEach(el => {
    if (el.textContent === text) el.classList.add('vald');
  });
}

// Normalisera datum även vid manuell inmatning (blur)
document.getElementById('resultat-datum').addEventListener('blur', (e) => {
  const norm = normaliseraDatum(e.target.value);
  if (norm !== e.target.value) e.target.value = norm;
});

// --- Nivå 2: Rektangel-OCR med Tesseract ---
let aktuelltOverlay = null;

function startaRektangelLäge() {
  if (aktuelltOverlay) aktuelltOverlay.remove();

  const canvas = document.getElementById('pdf-canvas');
  const wrapper = document.getElementById('pdf-wrapper');

  const overlay = document.createElement('div');
  overlay.className = 'ocr-overlay';
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
    rektEl.style.cssText =
      `left:${startX}px;top:${startY}px;width:0;height:0`;
    overlay.appendChild(rektEl);
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!ritar) return;
    const rect = overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    rektEl.style.left   = Math.min(startX, x) + 'px';
    rektEl.style.top    = Math.min(startY, y) + 'px';
    rektEl.style.width  = Math.abs(x - startX) + 'px';
    rektEl.style.height = Math.abs(y - startY) + 'px';
  });

  overlay.addEventListener('mouseup', async () => {
    ritar = false;
    const bredd = parseFloat(rektEl.style.width);
    const höjd  = parseFloat(rektEl.style.height);
    if (bredd < 5 || höjd < 5) {
      overlay.remove();
      aktuelltOverlay = null;
      rektangelKnapp.classList.remove('aktiv');
      return;
    }

    // Skala från visningskoordinater till canvas-pixelkoordinater
    const scaleX = canvas.width / overlay.offsetWidth;
    const scaleY = canvas.height / overlay.offsetHeight;
    const bx = parseFloat(rektEl.style.left)   * scaleX;
    const by = parseFloat(rektEl.style.top)    * scaleY;
    const bw = bredd * scaleX;
    const bh = höjd  * scaleY;

    // Beskär till offscreen-canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = bw;
    tempCanvas.height = bh;
    tempCanvas.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);

    overlay.remove();
    aktuelltOverlay = null;
    rektangelKnapp.classList.remove('aktiv');

    await körOCR(tempCanvas);
  });

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

  // MV3-patch: Tesseract.js skapar ett blob-URL-worker med importScripts(workerPath)
  // inuti bloben. Blob-workerns CSP blockerar anrop till chrome-extension://-URL:er.
  // Vi patchar window.Worker så att blob-URL:er omdirigeras direkt till extension-filen,
  // vilket ger workern korrekt extension-origin och rätt CSP.
  if (!window._tesseractWorkerPatched) {
    const _OriginalWorker = window.Worker;
    const _workerUrl = chrome.runtime.getURL('lib/tesseract-worker.min.js');
    window.Worker = function PatchadWorker(url, options) {
      if (typeof url === 'string' && url.startsWith('blob:')) url = _workerUrl;
      return new _OriginalWorker(url, options);
    };
    window.Worker.prototype = _OriginalWorker.prototype;
    window._tesseractWorkerPatched = true;
  }

  // Tesseract.js laddas som klassiskt skript (UMD-bundle)
  // Vi måste ladda det dynamiskt eftersom ocr-kontakt.js är en modul
  await laddaSkript(chrome.runtime.getURL('lib/tesseract.min.js'));

  // langPath utelämnas → Tesseract.js hämtar från jsDelivr CDN vid första användning
  // och cachar resultatet i IndexedDB (cacheMethod 'write' är standard)
  tesseractWorker = await Tesseract.createWorker('swe+eng', 1, {
    workerPath: chrome.runtime.getURL('lib/tesseract-worker.min.js'),
    corePath: chrome.runtime.getURL('lib/tesseract-core-simd.wasm.js'),
    lstmOnly: true,   // använder 4.0.0_best_int (~2.9 MB eng + ~2.4 MB swe, cachas i IndexedDB)
    logger: (m) => {
      if (m.status === 'loading language traineddata') {
        const pct = Math.round((m.progress || 0) * 100);
        statusEl.textContent = pct < 100
          ? `Laddar ned språkdata första gången… ${pct}%`
          : 'Förbereder OCR…';
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

async function körOCR(canvas) {
  const statusEl = document.getElementById('ocr-status');
  statusEl.style.color = '#0078d4';
  try {
    const worker = await hämtaTesseractWorker();
    statusEl.textContent = 'Kör OCR…';
    const resultat = await worker.recognize(canvas);
    const text = resultat.data.text.trim();
    if (text) {
      fyllAktivtFält(text);
      statusEl.textContent = '';
    } else {
      statusEl.textContent = 'Ingen text hittades – prova en större rektangel.';
      statusEl.style.color = '#b36b00';
    }
  } catch (e) {
    statusEl.textContent = 'OCR-fel: ' + e.message;
    statusEl.style.color = '#c0392b';
  }
}

// --- Starta uppladdning direkt från OCR-sidan ---
// Bygger dokument-arrayen från ocrContext + OCR-värden och skickar till P360-fliken.
// Returnerar true om meddelandet skickades, false om ingen P360-flik hittades.
async function startaUppladning(kontakt, ankomstdatum, titel) {
  const { ocrContext } = await chrome.storage.local.get('ocrContext');
  if (!ocrContext) return false;

  // Kräver en öppen P360-flik
  const [tab] = await chrome.tabs.query({ url: 'https://p360.svenskakyrkan.se/*' });
  if (!tab) return false;

  const { mallId, filerData, typ } = ocrContext;

  // Hämta och förbered malldata
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const dm = dokumentmallar.find(m => m.id === mallId);
  let mallData = {};
  if (dm) {
    mallData = { ...dm };
    delete mallData.id;
    delete mallData.skapad;
  }
  if (kontakt)    mallData.oregistreradKontakt = kontakt;
  if (ankomstdatum) mallData.datum = ankomstdatum;
  if (titel && !mallData.titel) mallData.titel = titel;

  // Bygg dokument-array (enskild fil = alla filer i ett dok, batch = ett dok per fil)
  const dokument = [];
  if (typ === 'fil') {
    const filerBase64 = filerData.map(f => ({
      namn: f.namn, typ: f.typ,
      base64: f.base64.includes(',') ? f.base64.split(',')[1] : f.base64,
    }));
    const dok = { ...mallData, filerBase64 };
    if (!dok.titel) dok.titel = filerData.length === 1
      ? filerData[0].namn.replace(/\.[^.]+$/, '') : '';
    dokument.push(dok);
  } else {
    for (const f of filerData) {
      const base64 = f.base64.includes(',') ? f.base64.split(',')[1] : f.base64;
      const dok = { ...mallData, filerBase64: [{ namn: f.namn, typ: f.typ, base64 }] };
      if (!dok.titel) dok.titel = f.namn.replace(/\.[^.]+$/, '');
      if (titel && !mallData.titel) dok.titel = titel;
      dokument.push(dok);
    }
  }

  // Spara stora filer till storage (undviker 64 MB-gränsen på sendMessage)
  const filStorage = {};
  for (let i = 0; i < dokument.length; i++) {
    if (dokument[i].filerBase64?.length) {
      const nyckel = `tempFiler_${i}`;
      filStorage[nyckel] = dokument[i].filerBase64;
      dokument[i] = { ...dokument[i], filerStorageNyckel: nyckel };
      delete dokument[i].filerBase64;
    }
  }
  if (Object.keys(filStorage).length > 0) {
    await chrome.storage.local.set(filStorage);
  }

  // Skicka meddelandet utan att invänta hela dokumentskapandet (fire-and-forget).
  // Promise.race fångar anslutningsfel (infaller omedelbart) men väntar inte på svar.
  const skicka = (tabId) => {
    const p = chrome.tabs.sendMessage(tabId, { action: 'skapaÄrendedokument', dokument });
    p.catch(() => {}); // tysta obehandlad avvisning om timern vinner
    return Promise.race([p, new Promise(r => setTimeout(r, 400))]);
  };

  let lyckades = false;
  try {
    chrome.tabs.update(tab.id, { active: true });
    try {
      await skicka(tab.id);
      lyckades = true;
    } catch {
      // content.js kanske inte är laddat – injicera och försök igen
      await chrome.scripting.executeScript({
        target: { tabId: tab.id }, files: ['content.js'], world: 'ISOLATED',
      });
      await new Promise(r => setTimeout(r, 300));
      await skicka(tab.id);
      lyckades = true;
    }
  } catch {
    lyckades = false;
    // Rensa fildata om meddelandet inte gick fram (content.js hinner inte städa)
    await chrome.storage.local.remove(Object.keys(filStorage));
  }

  if (lyckades) {
    await chrome.storage.local.remove(['ocrContext', 'ocrResultat', storageKey]);
  }
  return lyckades;
}

// --- Bekräfta och starta uppladdning ---
document.getElementById('btn-anvand').addEventListener('click', async () => {
  const kontakt      = document.getElementById('resultat-kontakt').value.trim();
  const ankomstdatum = document.getElementById('resultat-datum').value.trim();
  const titel        = document.getElementById('resultat-titel').value.trim();

  if (!kontakt && !ankomstdatum && !titel) {
    document.getElementById(aktivtFältId).focus();
    return;
  }

  const statusEl = document.getElementById('ocr-status');
  statusEl.style.color = '#0078d4';
  statusEl.textContent = 'Startar uppladdning…';

  // Försök skicka direkt till P360-fliken (om ocrContext finns och P360 är öppet)
  const lyckades = await startaUppladning(kontakt, ankomstdatum, titel);

  if (!lyckades) {
    // Ingen P360-flik – spara resultat och låt popup ta vid vid nästa öppning
    await chrome.storage.local.set({
      ocrResultat: { kontakt, ankomstdatum, titel, tid: Date.now() },
    });
    await chrome.storage.local.remove(storageKey);
    statusEl.textContent = '';
  }

  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch { /* ignorera */ }
  }
  window.close();
});

document.getElementById('btn-avbryt').addEventListener('click', async () => {
  await chrome.storage.local.remove([storageKey, 'ocrContext', 'ocrResultat']);
  if (tesseractWorker) {
    try { await tesseractWorker.terminate(); } catch { /* ignorera */ }
  }
  window.close();
});

// --- Ladda och rendera första sidan ---
await öppnaPdf(filBase64);
