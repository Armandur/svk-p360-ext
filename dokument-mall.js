// dokument-mall.js – logik för dokumentmallredigeringssidan

// KO-paragrafer
const KO_PARAGRAFER = [
  'Kyrkoordningen 54 kap. 2 §',
  'Kyrkoordningen 54 kap. 3 §',
  'Kyrkoordningen 54 kap. 4 §',
  'Kyrkoordningen 54 kap. 4 a §',
  'Kyrkoordningen 54 kap. 4 b §',
  'Kyrkoordningen 54 kap. 4 c §',
  'Kyrkoordningen 54 kap. 4 d §',
  'Kyrkoordningen 54 kap. 4 e §',
  'Kyrkoordningen 54 kap. 5 §',
  'Kyrkoordningen 54 kap. 6 §',
  'Kyrkoordningen 54 kap. 7 §',
  'Kyrkoordningen 54 kap. 8 §',
  'Kyrkoordningen 54 kap. 8 a §',
  'Kyrkoordningen 54 kap. 8 b §',
  'Kyrkoordningen 54 kap. 9 §',
  'Kyrkoordningen 54 kap. 10 §',
  'Kyrkoordningen 54 kap. 10 a §',
  'Kyrkoordningen 54 kap. 11 a §',
  'Kyrkoordningen 54 kap. 11b §',
  'Kyrkoordningen 54 kap. 11 c §',
  'Kyrkoordningen 54 kap. 11 d §',
  'Kyrkoordningen 54 kap. 12 §',
  'Kyrkoordningen 54 kap. 13 §',
  'Se kommentar',
];

const OSL_PARAGRAFER = [
  'OSL 18 kap. 8 §',
  'OSL 19 kap. 1 §',
  'OSL 19 kap. 3 §',
  'OSL 21 kap. 7 §',
  'OSL 23 kap. 1 §',
  'OSL 40 kap. 7 a §',
  'Lag 2018:218 1 kap. 8 §',
  'Se kommentar',
];

// Cachade alternativ
let cachedHandlingstyper = [];
let cachedAnsvarigaPersoner = [];
let cachedAtkomstgrupper = [];
let cachedAnsvarigaEnheter = [];

// Aktuellt mall-ID (null = ny mall)
let mallId = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Ladda cachade alternativ
  const stored = await chrome.storage.local.get([
    'cachedHandlingstyper', 'cachedAnsvarigaPersoner',
    'cachedAtkomstgrupper', 'cachedAnsvarigaEnheter'
  ]);
  cachedHandlingstyper = stored.cachedHandlingstyper || [];
  cachedAnsvarigaPersoner = stored.cachedAnsvarigaPersoner || [];
  cachedAtkomstgrupper = stored.cachedAtkomstgrupper || [];
  cachedAnsvarigaEnheter = stored.cachedAnsvarigaEnheter || [];

  visaCacheStatus();
  fyllDropdowns();

  // Kolla om vi redigerar en befintlig mall
  const params = new URLSearchParams(location.search);
  mallId = params.get('id');
  if (mallId) {
    document.getElementById('sidrubrik').textContent = 'Redigera dokumentmall';
    await laddaMall(mallId);
  }

  kopplaHändelser();
});

// ------------------------------------------------------------------
// Fyll i dropdowns med cachade värden
// ------------------------------------------------------------------
function fyllDropdowns() {
  fyllSelect('dok-handlingstyp', cachedHandlingstyper.map(h => ({ value: h.value, label: h.text })));
  fyllSelect('dok-atkomstgrupp', cachedAtkomstgrupper);
  fyllSelect('dok-ansvarig-enhet', cachedAnsvarigaEnheter);
  fyllSelect('dok-ansvarig-person', cachedAnsvarigaPersoner);
}

function fyllSelect(elId, alternativ) {
  const sel = document.getElementById(elId);
  // Behåll första option (placeholder)
  const förstaTxt = sel.options[0]?.text || '(Ingen)';
  sel.innerHTML = `<option value="">${escHtml(förstaTxt)}</option>`;
  for (const a of alternativ) {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    sel.appendChild(opt);
  }
}

function visaCacheStatus() {
  const el = document.getElementById('cache-status-text');
  const delar = [];
  if (cachedHandlingstyper.length > 0) delar.push(`${cachedHandlingstyper.length} handlingstyper`);
  if (cachedAnsvarigaPersoner.length > 0) delar.push(`${cachedAnsvarigaPersoner.length} personer`);
  if (cachedAtkomstgrupper.length > 0) delar.push(`${cachedAtkomstgrupper.length} åtkomstgrupper`);
  if (cachedAnsvarigaEnheter.length > 0) delar.push(`${cachedAnsvarigaEnheter.length} enheter`);
  if (delar.length > 0) {
    el.textContent = `(${delar.join(', ')} cachade)`;
    el.style.color = '#2e7d32';
  } else {
    el.textContent = '(Inga data cachade)';
    el.style.color = '#b71c1c';
  }
}

// ------------------------------------------------------------------
// Händelsehanterare
// ------------------------------------------------------------------
function kopplaHändelser() {
  // Skyddskod → visa/dölj sekretessfält
  const skyddskodSel = document.getElementById('dok-skyddskod');
  skyddskodSel.addEventListener('change', () => uppdateraSekretessFält());

  // Val av offentlig titel → visa/dölj manuell titel
  document.getElementById('dok-off-titel-val').addEventListener('change', () => {
    document.getElementById('off-titel-falt').style.display =
      document.getElementById('dok-off-titel-val').value === '3' ? '' : 'none';
  });

  // Spara
  document.getElementById('btn-spara').addEventListener('click', sparaMall);
  document.getElementById('btn-avbryt').addEventListener('click', () => window.close());
}

function uppdateraSekretessFält() {
  const kod = document.getElementById('dok-skyddskod').value;
  const block = document.getElementById('sekretess-falt');
  block.style.display = kod !== '0' ? '' : 'none';
  if (kod !== '0') fyllParagrafer(kod);
}

function fyllParagrafer(kod) {
  const sel = document.getElementById('dok-paragraf');
  const valt = sel.value;
  sel.innerHTML = '<option value="">– välj paragraf –</option>';
  const lista = kod === '100032' ? OSL_PARAGRAFER : KO_PARAGRAFER;
  for (const p of lista) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  }
  if (valt) sel.value = valt;
}

// ------------------------------------------------------------------
// Spara
// ------------------------------------------------------------------
async function sparaMall() {
  const felruta = document.getElementById('felruta');
  felruta.style.display = 'none';

  const namn = document.getElementById('dok-namn').value.trim();
  if (!namn) {
    visaFel('Ange ett mallnamn.');
    document.getElementById('dok-namn').focus();
    return;
  }

  const skyddskod = document.getElementById('dok-skyddskod').value;

  const handlingstypSel = document.getElementById('dok-handlingstyp');
  const atkomstgruppSel = document.getElementById('dok-atkomstgrupp');
  const ansvarigEnhetSel = document.getElementById('dok-ansvarig-enhet');
  const ansvarigPersonSel = document.getElementById('dok-ansvarig-person');

  const mall = {
    id: mallId || 'dokmall_' + Date.now(),
    namn,
    skapad: mallId ? undefined : Date.now(),
    ändrad: Date.now(),
    titel: document.getElementById('dok-titel').value.trim(),
    handlingstyp: handlingstypSel.value
      ? { value: handlingstypSel.value, text: handlingstypSel.options[handlingstypSel.selectedIndex]?.text || '' }
      : null,
    kategori: document.getElementById('dok-kategori').value,
    skyddskod,
    sekretessParag: skyddskod !== '0' ? document.getElementById('dok-paragraf').value : '',
    offentligTitelVal: skyddskod !== '0' ? document.getElementById('dok-off-titel-val').value : '1',
    offentligTitel: skyddskod !== '0' && document.getElementById('dok-off-titel-val').value === '3'
      ? document.getElementById('dok-off-titel').value.trim() : '',
    atkomstgrupp: atkomstgruppSel.value
      ? { value: atkomstgruppSel.value, label: atkomstgruppSel.options[atkomstgruppSel.selectedIndex]?.text || '' }
      : null,
    oregistreradKontakt: document.getElementById('dok-oregistrerad-kontakt').value.trim(),
    ankomstdatum: document.getElementById('dok-ankomstdatum').value,
    ansvarigEnhet: ansvarigEnhetSel.value
      ? { value: ansvarigEnhetSel.value, label: ansvarigEnhetSel.options[ansvarigEnhetSel.selectedIndex]?.text || '' }
      : null,
    ansvarigPerson: ansvarigPersonSel.value
      ? { value: ansvarigPersonSel.value, label: ansvarigPersonSel.options[ansvarigPersonSel.selectedIndex]?.text || '' }
      : null,
  };

  // Hämta befintliga dokumentmallar och uppdatera/lägg till
  const { dokumentmallar: befintliga = [] } = await chrome.storage.local.get('dokumentmallar');
  const index = befintliga.findIndex(m => m.id === mall.id);
  if (index >= 0) {
    mall.skapad = befintliga[index].skapad;
    befintliga[index] = mall;
  } else {
    befintliga.push(mall);
  }

  await chrome.storage.local.set({ dokumentmallar: befintliga });
  window.close();
}

// ------------------------------------------------------------------
// Ladda befintlig mall
// ------------------------------------------------------------------
async function laddaMall(id) {
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === id);
  if (!mall) return;

  document.getElementById('dok-namn').value = mall.namn || '';
  document.getElementById('dok-titel').value = mall.titel || '';
  document.getElementById('dok-kategori').value = mall.kategori || '';
  document.getElementById('dok-skyddskod').value = mall.skyddskod || '0';
  document.getElementById('dok-oregistrerad-kontakt').value = mall.oregistreradKontakt || '';
  document.getElementById('dok-ankomstdatum').value = mall.ankomstdatum || '';

  if (mall.handlingstyp?.value) {
    säkertVälj('dok-handlingstyp', mall.handlingstyp.value, mall.handlingstyp.text);
  }
  if (mall.atkomstgrupp?.value) {
    säkertVälj('dok-atkomstgrupp', mall.atkomstgrupp.value, mall.atkomstgrupp.label);
  }
  if (mall.ansvarigEnhet?.value) {
    säkertVälj('dok-ansvarig-enhet', mall.ansvarigEnhet.value, mall.ansvarigEnhet.label);
  }
  if (mall.ansvarigPerson?.value) {
    säkertVälj('dok-ansvarig-person', mall.ansvarigPerson.value, mall.ansvarigPerson.label);
  }

  uppdateraSekretessFält();
  if (mall.skyddskod !== '0') {
    document.getElementById('dok-paragraf').value = mall.sekretessParag || '';
    document.getElementById('dok-off-titel-val').value = mall.offentligTitelVal || '1';
    if (mall.offentligTitelVal === '3') {
      document.getElementById('off-titel-falt').style.display = '';
      document.getElementById('dok-off-titel').value = mall.offentligTitel || '';
    }
  }
}

/**
 * Väljer ett värde i en select – lägger till alternativet om det saknas.
 */
function säkertVälj(elId, value, label) {
  const sel = document.getElementById(elId);
  if (!Array.from(sel.options).some(o => o.value === value)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = value;
}

// ------------------------------------------------------------------
// Hjälpfunktioner
// ------------------------------------------------------------------
function visaFel(meddelande) {
  const el = document.getElementById('felruta');
  el.textContent = meddelande;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
