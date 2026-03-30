// popup-fil.js – enskild filuppladdning, batch-uppladdning och OCR-återupptagning
// Beroenden: skicka(), visaFel(), döljFelmeddelande() från popup.js (laddas före detta skript)

// ------------------------------------------------------------------
// Filuppladdning
// ------------------------------------------------------------------

/**
 * Konverterar en File till base64-sträng.
 */
function filTillBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Kunde inte läsa filen.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Sparar fildata i chrome.storage.local och skickar ett lättviktigt meddelande
 * till content.js. Undviker 64 MB-gränsen på chrome.tabs.sendMessage.
 *
 * @param {Object[]} dokument – dokument-array (med filerBase64-fält)
 */
async function skickaFilDokument(dokument) {
  // Extrahera fildata → storage, ersätt med referens
  const filStorage = {};
  for (let i = 0; i < dokument.length; i++) {
    if (dokument[i].filerBase64?.length) {
      const nyckel = `tempFiler_${i}`;
      filStorage[nyckel] = dokument[i].filerBase64;
      dokument[i] = { ...dokument[i], filerStorageNyckel: nyckel };
      delete dokument[i].filerBase64;
    }
  }

  // Spara fildata i storage (inga storleksbegränsningar i chrome.storage.local)
  if (Object.keys(filStorage).length > 0) {
    await chrome.storage.local.set(filStorage);
  }

  try {
    await skicka({ action: 'skapaÄrendedokument', dokument });
  } finally {
    // Rensa temporär fildata oavsett resultat
    const nycklar = Object.keys(filStorage);
    if (nycklar.length > 0) {
      await chrome.storage.local.remove(nycklar);
    }
  }
}

let uppladdningsFiler = [];
let restoredFilData = null;   // Återupptagen fildata efter OCR-flöde (enskild fil)

let batchFiler = [];
let restoredBatchData = null; // Återupptagen fildata efter OCR-flöde (batch)

// Returnerar true om fil verkar vara PDF
function ärPdf(f) {
  return f.type === 'application/pdf' || (f.name || f.namn || '').toLowerCase().endsWith('.pdf');
}

// Hjälp: visa OCR-sektionens etiketter beroende på kategori
function uppdateraOcrEtiketter(prefix, kategori) {
  const ärInk = kategori === '110';
  const kontaktEl = document.getElementById(`${prefix}-ocr-label`);
  const datumEl   = document.getElementById(`${prefix}-ocr-datum-label`);
  if (kontaktEl) kontaktEl.textContent = ärInk ? 'Avsändare:' : 'Mottagare:';
  if (datumEl)   datumEl.textContent   = ärInk ? 'Ankomstdatum (ÅÅÅÅ-MM-DD):' : 'Datum (ÅÅÅÅ-MM-DD):';
}

// Visa/dölj OCR-sektion och uppdatera etiketter
function visaOcrSektion(prefix, mall, harPdf) {
  const ocrSektion = document.getElementById(`${prefix}-ocr-sektion`);
  if (mall && ['110', '111'].includes(mall.kategori) && harPdf) {
    ocrSektion.style.display = '';
    uppdateraOcrEtiketter(prefix, mall.kategori);
  } else {
    ocrSektion.style.display = 'none';
  }
}

// Rensa OCR-fält
function rensaOcrFält(prefix) {
  ['kontakt', 'datum', 'titel'].forEach(f => {
    const el = document.getElementById(`${prefix}-ocr-${f}`);
    if (el) el.value = '';
  });
  const res = document.getElementById(`${prefix}-ocr-resultat`);
  if (res) res.style.display = 'none';
}

// ------------------------------------------------------------------
// Återupptagning av OCR-flöde
// Chrome stänger popup när en ny flik öppnas. Filkontexten sparas
// till storage innan OCR-fliken öppnas, och återuptas här vid nästa
// popup-öppning om ocrResultat finns.
// ------------------------------------------------------------------
async function kontrolleraOcrÅterupptagning() {
  const { ocrContext, ocrResultat } =
    await chrome.storage.local.get(['ocrContext', 'ocrResultat']);
  if (!ocrContext) return;

  if (!ocrResultat) {
    // OCR-sidan kanske fortfarande öppen – rensa kontext om > 30 min gammal
    if (Date.now() - (ocrContext.tid || 0) > 30 * 60 * 1000) {
      await chrome.storage.local.remove('ocrContext');
    }
    return;
  }

  // OCR klar – återupprätta panel och fyll i resultat
  const { mallId, filerData, typ } = ocrContext;
  const prefix = typ === 'batch' ? 'batch' : 'fil';

  if (typ === 'batch') {
    restoredBatchData = { mallId, filerData };
  } else {
    restoredFilData = { mallId, filerData };
  }

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');

  // Fyll malllistan
  const sel = document.getElementById(`${prefix}-mall-val`);
  sel.innerHTML = '<option value="">(ingen mall – enbart fil)</option>';
  dokumentmallar.forEach(dm => {
    const opt = document.createElement('option');
    opt.value = dm.id;
    opt.textContent = dm.namn;
    sel.appendChild(opt);
  });
  if (mallId) sel.value = mallId;

  // Panel-info
  const infoId = prefix === 'fil' ? 'fil-panel-info' : 'batch-fil-info';
  document.getElementById(infoId).textContent =
    `${filerData.length} fil(er) – OCR klar, klicka "${prefix === 'fil' ? 'Ladda upp' : 'Starta batch'}" för att fortsätta.`;

  // OCR-resultat
  const mall = dokumentmallar.find(m => m.id === mallId);
  if (mall && ['110', '111'].includes(mall.kategori)) {
    document.getElementById(`${prefix}-ocr-sektion`).style.display = '';
    uppdateraOcrEtiketter(prefix, mall.kategori);
    document.getElementById(`${prefix}-ocr-kontakt`).value = ocrResultat.kontakt || '';
    document.getElementById(`${prefix}-ocr-datum`).value   = ocrResultat.ankomstdatum || '';
    document.getElementById(`${prefix}-ocr-titel`).value   = ocrResultat.titel || '';
    document.getElementById(`${prefix}-ocr-resultat`).style.display = '';
  }

  document.getElementById(`${prefix}-panel`).style.display = '';

  // Rensa storage – data lever vidare i restoredFilData / restoredBatchData
  await chrome.storage.local.remove(['ocrContext', 'ocrResultat']);
}

kontrolleraOcrÅterupptagning();

// ------------------------------------------------------------------
// Enskild filuppladdning
// ------------------------------------------------------------------

document.getElementById('btn-ladda-upp-filer').addEventListener('click', () => {
  döljFelmeddelande();
  document.getElementById('fil-input').click();
});

document.getElementById('fil-input').addEventListener('change', async (e) => {
  uppladdningsFiler = Array.from(e.target.files);
  if (uppladdningsFiler.length === 0) return;
  restoredFilData = null;

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const sel = document.getElementById('fil-mall-val');
  sel.innerHTML = '<option value="">(ingen mall – enbart fil)</option>';
  dokumentmallar.forEach(dm => {
    const opt = document.createElement('option');
    opt.value = dm.id;
    opt.textContent = dm.namn;
    sel.appendChild(opt);
  });

  document.getElementById('fil-panel-info').textContent =
    `${uppladdningsFiler.length} fil(er) valda – skapas som ett ärendedokument.`;
  document.getElementById('fil-panel').style.display = '';
  document.getElementById('fil-ocr-sektion').style.display = 'none';
  rensaOcrFält('fil');

  e.target.value = '';
});

document.getElementById('btn-fil-avbryt').addEventListener('click', () => {
  document.getElementById('fil-panel').style.display = 'none';
  uppladdningsFiler = [];
  restoredFilData = null;
  document.getElementById('fil-ocr-sektion').style.display = 'none';
  rensaOcrFält('fil');
});

// Visa/dölj OCR-sektion vid mallbyte
document.getElementById('fil-mall-val').addEventListener('change', async (e) => {
  const mallId = e.target.value;
  if (!mallId) { document.getElementById('fil-ocr-sektion').style.display = 'none'; return; }

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const harPdf = uppladdningsFiler.some(ärPdf) ||
    (restoredFilData?.filerData || []).some(ärPdf);

  visaOcrSektion('fil', mall, harPdf);
  rensaOcrFält('fil');
});

// Öppna OCR-sida – spara hela filkontexten till storage eftersom popup stängs
document.getElementById('btn-fil-ocr').addEventListener('click', async () => {
  const pdfFil = uppladdningsFiler.find(ärPdf);
  if (!pdfFil) return;

  const mallId = document.getElementById('fil-mall-val').value;
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const kategori = mall?.kategori || '110';

  // Konvertera ALLA filer till base64 (inkl. data:-prefix) och spara kontext.
  // Popup stängs när OCR-fliken öppnas; filkontexten återuptas vid nästa öppning.
  const filerData = [];
  for (const f of uppladdningsFiler) {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('Kunde inte läsa ' + f.name));
      r.readAsDataURL(f);
    });
    filerData.push({ namn: f.name, typ: f.type, base64 });
  }

  const pdfData = filerData.find(ärPdf);
  await chrome.storage.local.set({
    ocrContext: { mallId, filerData, typ: 'fil', tid: Date.now() },
    tempOcrFil: pdfData?.base64 || filerData[0].base64,
  });

  chrome.tabs.create({
    url: chrome.runtime.getURL(`ocr-kontakt.html?storageKey=tempOcrFil&kategori=${kategori}`),
  });
  // Chrome stänger popup automatiskt när ny flik öppnas
});

document.getElementById('btn-fil-starta').addEventListener('click', async () => {
  const harRestoredData = restoredFilData !== null;
  if (!harRestoredData && uppladdningsFiler.length === 0) return;
  döljFelmeddelande();

  document.getElementById('fil-panel').style.display = 'none';

  const filStatus = document.getElementById('fil-status');
  filStatus.style.display = '';
  filStatus.style.color = '#555';

  const mallId = restoredFilData?.mallId || document.getElementById('fil-mall-val').value;
  let mallData = {};
  if (mallId) {
    const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
    const dm = dokumentmallar.find(m => m.id === mallId);
    if (dm) {
      mallData = { ...dm };
      delete mallData.id;
      delete mallData.skapad;
    }
  }

  // OCR-fält åsidosätter mallens värden (om ifyllda).
  // Undantag: om mallen redan har en titel används den – OCR-titel är bara fallback.
  const ocrKontakt = document.getElementById('fil-ocr-kontakt')?.value?.trim();
  const ocrDatum   = document.getElementById('fil-ocr-datum')?.value?.trim();
  const ocrTitel   = document.getElementById('fil-ocr-titel')?.value?.trim();
  if (ocrKontakt) mallData.oregistreradKontakt = ocrKontakt;
  if (ocrDatum)   mallData.datum = ocrDatum;
  if (ocrTitel && !mallData.titel) mallData.titel = ocrTitel;

  try {
    const filData = [];
    if (harRestoredData) {
      // Använd förkonverterade base64-data från OCR-flödet
      for (const f of restoredFilData.filerData) {
        const b64 = f.base64.includes(',') ? f.base64.split(',')[1] : f.base64;
        filData.push({ namn: f.namn, typ: f.typ, base64: b64 });
      }
    } else {
      for (const f of uppladdningsFiler) {
        filStatus.textContent = `Läser ${f.name}…`;
        const base64 = await filTillBase64(f);
        filData.push({ namn: f.name, typ: f.type, base64 });
      }
    }

    const förstaNamn = harRestoredData
      ? (restoredFilData.filerData[0]?.namn || '')
      : (uppladdningsFiler[0]?.name || '');

    const dok = { ...mallData, filerBase64: filData };
    if (!dok.titel) dok.titel = filData.length === 1
      ? förstaNamn.replace(/\.[^.]+$/, '')
      : '';

    filStatus.textContent = 'Skickar till 360°…';
    await skickaFilDokument([dok]);

    filStatus.textContent = '';
    filStatus.style.display = 'none';
  } catch (err) {
    filStatus.textContent = 'Fel: ' + err.message;
    filStatus.style.color = '#c0392b';
  }

  uppladdningsFiler = [];
  restoredFilData = null;
});

// ------------------------------------------------------------------
// Batch-uppladdning: en fil per ärendedokument
// ------------------------------------------------------------------

document.getElementById('btn-batch-upload').addEventListener('click', () => {
  döljFelmeddelande();
  document.getElementById('batch-fil-input').click();
});

document.getElementById('batch-fil-input').addEventListener('change', async (e) => {
  batchFiler = Array.from(e.target.files);
  if (batchFiler.length === 0) return;
  restoredBatchData = null;

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const sel = document.getElementById('batch-mall-val');
  sel.innerHTML = '<option value="">(ingen mall – enbart fil)</option>';
  dokumentmallar.forEach(dm => {
    const opt = document.createElement('option');
    opt.value = dm.id;
    opt.textContent = dm.namn;
    sel.appendChild(opt);
  });

  document.getElementById('batch-fil-info').textContent =
    `${batchFiler.length} fil(er) valda – varje fil blir ett eget ärendedokument.`;
  document.getElementById('batch-panel').style.display = '';
  document.getElementById('batch-ocr-sektion').style.display = 'none';
  rensaOcrFält('batch');

  e.target.value = '';
});

document.getElementById('btn-batch-avbryt').addEventListener('click', () => {
  document.getElementById('batch-panel').style.display = 'none';
  batchFiler = [];
  restoredBatchData = null;
  document.getElementById('batch-ocr-sektion').style.display = 'none';
  rensaOcrFält('batch');
});

// Visa/dölj OCR-sektion vid mallbyte för batch
document.getElementById('batch-mall-val').addEventListener('change', async (e) => {
  const mallId = e.target.value;
  if (!mallId) { document.getElementById('batch-ocr-sektion').style.display = 'none'; return; }

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const harPdf = batchFiler.some(ärPdf) ||
    (restoredBatchData?.filerData || []).some(ärPdf);

  visaOcrSektion('batch', mall, harPdf);
  rensaOcrFält('batch');
});

// Öppna OCR-sida för batch – spara alla filer som base64 och kontext
document.getElementById('btn-batch-ocr').addEventListener('click', async () => {
  const pdfFil = batchFiler.find(ärPdf);
  if (!pdfFil) return;

  const mallId = document.getElementById('batch-mall-val').value;
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === mallId);
  const kategori = mall?.kategori || '110';

  const filerData = [];
  for (const f of batchFiler) {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('Kunde inte läsa ' + f.name));
      r.readAsDataURL(f);
    });
    filerData.push({ namn: f.name, typ: f.type, base64 });
  }

  const pdfData = filerData.find(ärPdf);
  await chrome.storage.local.set({
    ocrContext: { mallId, filerData, typ: 'batch', tid: Date.now() },
    tempOcrFil: pdfData?.base64 || filerData[0].base64,
  });

  chrome.tabs.create({
    url: chrome.runtime.getURL(`ocr-kontakt.html?storageKey=tempOcrFil&kategori=${kategori}`),
  });
});

document.getElementById('btn-batch-starta').addEventListener('click', async () => {
  const harRestoredData = restoredBatchData !== null;
  if (!harRestoredData && batchFiler.length === 0) return;
  döljFelmeddelande();

  const filStatus = document.getElementById('fil-status');
  filStatus.style.display = '';
  filStatus.style.color = '#555';

  const mallId = restoredBatchData?.mallId || document.getElementById('batch-mall-val').value;
  let mallData = {};
  if (mallId) {
    const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
    const dm = dokumentmallar.find(m => m.id === mallId);
    if (dm) {
      mallData = { ...dm };
      delete mallData.id;
      delete mallData.skapad;
    }
  }

  // OCR-fält (gemensamma för alla filer i batchen) åsidosätter mallens värden om ifyllda.
  // Undantag: om mallen redan har en titel används den – OCR-titel är bara fallback.
  const ocrKontakt = document.getElementById('batch-ocr-kontakt')?.value?.trim();
  const ocrDatum   = document.getElementById('batch-ocr-datum')?.value?.trim();
  const ocrTitel   = document.getElementById('batch-ocr-titel')?.value?.trim();

  const dokument = [];
  const källFiler = harRestoredData ? restoredBatchData.filerData : null;
  const antal = harRestoredData ? källFiler.length : batchFiler.length;

  for (let i = 0; i < antal; i++) {
    let namn, typ, base64;

    if (harRestoredData) {
      const f = källFiler[i];
      namn  = f.namn;
      typ   = f.typ;
      base64 = f.base64.includes(',') ? f.base64.split(',')[1] : f.base64;
    } else {
      const f = batchFiler[i];
      namn  = f.name;
      typ   = f.type;
      filStatus.textContent = `Läser fil ${i + 1}/${antal}: ${namn}…`;
      base64 = await filTillBase64(f);
    }

    const dok = {
      ...mallData,
      filerBase64: [{ namn, typ, base64 }],
    };
    if (!dok.titel) dok.titel = namn.replace(/\.[^.]+$/, '');

    if (ocrKontakt) dok.oregistreradKontakt = ocrKontakt;
    if (ocrDatum)   dok.datum = ocrDatum;
    if (ocrTitel && !mallData.titel) dok.titel = ocrTitel;

    dokument.push(dok);
  }

  filStatus.textContent = `Skickar ${dokument.length} ärendedokument till 360°…`;
  document.getElementById('batch-panel').style.display = 'none';
  batchFiler = [];
  restoredBatchData = null;

  try {
    await skickaFilDokument(dokument);
    filStatus.textContent = '';
    filStatus.style.display = 'none';
  } catch (err) {
    filStatus.textContent = 'Fel: ' + err.message;
    filStatus.style.color = '#c0392b';
  }
});
