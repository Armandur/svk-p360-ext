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
let cachedProjekt = [];
let cachedFastigheter = [];

// Aktuellt mall-ID (null = ny mall)
let mallId = null;
// Instansläge – redigerar en kopia kopplad till en ärendemall
let instansLäge = false;
let instansIdx = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Ladda cachade alternativ
  const stored = await chrome.storage.local.get([
    'cachedHandlingstyper', 'cachedAnsvarigaPersoner',
    'cachedAtkomstgrupper', 'cachedAnsvarigaEnheter',
    'cachedProjekt', 'cachedFastigheter'
  ]);
  cachedHandlingstyper = stored.cachedHandlingstyper || [];
  cachedAnsvarigaPersoner = stored.cachedAnsvarigaPersoner || [];
  cachedAtkomstgrupper = stored.cachedAtkomstgrupper || [];
  cachedAnsvarigaEnheter = stored.cachedAnsvarigaEnheter || [];
  cachedProjekt = stored.cachedProjekt || [];
  cachedFastigheter = stored.cachedFastigheter || [];

  visaCacheStatus();
  fyllDropdowns();

  // Kolla om vi redigerar en instans (kopplad till ärendemall) eller en befintlig mall
  const params = new URLSearchParams(location.search);
  if (params.get('instans') === '1') {
    instansLäge = true;
    document.getElementById('sidrubrik').textContent = 'Redigera dokumentinstans';
    // Dölj mallnamn-fältet – instansens namn ärvs från originalmallen
    const namnFält = document.getElementById('dok-namn');
    const namnRad = namnFält.closest('.faltrad');
    if (namnRad) namnRad.style.display = 'none';
    // Uppdatera spara-knappen
    document.getElementById('btn-spara').textContent = 'Spara instans';
    const { tempDokInstans } = await chrome.storage.local.get('tempDokInstans');
    if (tempDokInstans?.data) {
      instansIdx = tempDokInstans.idx;
      await laddaInstansData(tempDokInstans.data);
    }
  } else {
    mallId = params.get('id');
    if (mallId) {
      document.getElementById('sidrubrik').textContent = 'Redigera dokumentmall';
      await laddaMall(mallId);
    }
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
  fyllSelect('dok-projekt', cachedProjekt.map(p => ({ value: p.value, label: p.display })));
  fyllSelect('dok-fastighet', cachedFastigheter.map(f => ({ value: f.value, label: f.display })));
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
  if (cachedProjekt.length > 0) delar.push(`${cachedProjekt.length} projekt`);
  if (cachedFastigheter.length > 0) delar.push(`${cachedFastigheter.length} fastigheter`);
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

  // Datum – visa/dölj datumfält
  document.getElementById('dok-datum-typ').addEventListener('change', () => {
    const typ = document.getElementById('dok-datum-typ').value;
    document.getElementById('dok-datum-värde').style.display = typ === 'datum' ? '' : 'none';
  });

  // Kategori – uppdatera etiketter för datum och kontakt
  document.getElementById('dok-kategori').addEventListener('change', uppdateraKategoriEtiketter);
  uppdateraKategoriEtiketter();

  // Återställ bekräftelse vid fältändringar
  for (const el of document.querySelectorAll('input, select, textarea')) {
    el.addEventListener('change', () => { sparaMall._bekräftad = false; });
  }

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

function uppdateraKategoriEtiketter() {
  const kat = document.getElementById('dok-kategori').value;
  const datumEtikett = document.getElementById('dok-datum-etikett');
  const kontaktEtikett = document.getElementById('dok-kontakt-etikett');

  if (kat === '110') {
    datumEtikett.textContent = 'Ankomstdatum';
    kontaktEtikett.textContent = 'Oregistrerad kontakt (avsändare)';
  } else if (kat === '111') {
    datumEtikett.textContent = 'Färdigst/exp-datum';
    kontaktEtikett.textContent = 'Oregistrerad kontakt (mottagare)';
  } else if (kat === '60005') {
    datumEtikett.textContent = 'Färdigst/exp-datum';
    kontaktEtikett.textContent = 'Oregistrerad kontakt';
  } else if (kat === '112') {
    datumEtikett.textContent = 'Färdigst/exp-datum';
    kontaktEtikett.textContent = 'Oregistrerad kontakt (mottagare)';
  } else {
    datumEtikett.textContent = 'Datum';
    kontaktEtikett.textContent = 'Oregistrerad kontakt (avsändare/mottagare)';
  }
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
  const varningsruta = document.getElementById('varningsruta');
  varningsruta.style.display = 'none';

  const namn = document.getElementById('dok-namn').value.trim();
  if (!namn && !instansLäge) {
    visaFel('Ange ett mallnamn.');
    document.getElementById('dok-namn').focus();
    return;
  }

  // Kontrollera obligatoriska fält och varna (men tillåt sparande)
  const tomma = [];
  if (!document.getElementById('dok-titel').value.trim()) tomma.push('Titel');
  if (!document.getElementById('dok-handlingstyp').value) tomma.push('Handlingstyp');
  if (!document.getElementById('dok-kategori').value) tomma.push('Dokumentkategori');
  if (!document.getElementById('dok-atkomstgrupp').value) tomma.push('Åtkomstgrupp');
  if (!document.getElementById('dok-ansvarig-enhet').value) tomma.push('Ansvarig enhet');
  const skyddskodVärde = document.getElementById('dok-skyddskod').value;
  if (skyddskodVärde && skyddskodVärde !== '0' && !document.getElementById('dok-paragraf').value) {
    tomma.push('Paragraf (sekretess)');
  }

  if (tomma.length > 0 && !sparaMall._bekräftad) {
    varningsruta.innerHTML =
      `<strong>Obligatoriska fält saknas:</strong> ${escHtml(tomma.join(', '))}<br>` +
      'Användaren kommer att behöva fylla i dessa manuellt vid skapande. ' +
      '<strong>Klicka Spara igen</strong> för att bekräfta.';
    varningsruta.style.display = 'block';
    varningsruta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    sparaMall._bekräftad = true;
    return;
  }
  sparaMall._bekräftad = false;

  const data = hämtaFormulärData(namn);

  if (instansLäge) {
    // Bevara ursprungsreferensen
    const { tempDokInstans: orig } = await chrome.storage.local.get('tempDokInstans');
    if (orig?.data?.dokumentmallId) {
      data.dokumentmallId = orig.data.dokumentmallId;
    }
    // Spara tillbaka till temp-storage – mall.js:s onChanged-lyssnare fångar upp
    await chrome.storage.local.set({
      tempDokInstans: { data, idx: instansIdx }
    });
    window.close();
    return;
  }

  // Vanligt mallsparande
  const mall = {
    id: mallId || 'dokmall_' + Date.now(),
    skapad: mallId ? undefined : Date.now(),
    ...data,
  };

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

/**
 * Läser ut alla formulärfält som ett dataobjekt.
 */
function hämtaFormulärData(namn) {
  const skyddskod = document.getElementById('dok-skyddskod').value;
  const handlingstypSel = document.getElementById('dok-handlingstyp');
  const atkomstgruppSel = document.getElementById('dok-atkomstgrupp');
  const ansvarigEnhetSel = document.getElementById('dok-ansvarig-enhet');
  const ansvarigPersonSel = document.getElementById('dok-ansvarig-person');

  return {
    namn,
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
    datum: (() => {
      const typ = document.getElementById('dok-datum-typ').value;
      if (typ === 'idag') return 'idag';
      if (typ === 'datum') return document.getElementById('dok-datum-värde').value || '';
      return '';
    })(),
    ansvarigEnhet: ansvarigEnhetSel.value
      ? { value: ansvarigEnhetSel.value, label: ansvarigEnhetSel.options[ansvarigEnhetSel.selectedIndex]?.text || '' }
      : null,
    ansvarigPerson: ansvarigPersonSel.value
      ? { value: ansvarigPersonSel.value, label: ansvarigPersonSel.options[ansvarigPersonSel.selectedIndex]?.text || '' }
      : null,
    projekt: (() => {
      const sel = document.getElementById('dok-projekt');
      return sel.value ? { value: sel.value, display: sel.options[sel.selectedIndex]?.text || '' } : null;
    })(),
    fastighet: (() => {
      const sel = document.getElementById('dok-fastighet');
      return sel.value ? { value: sel.value, display: sel.options[sel.selectedIndex]?.text || '' } : null;
    })(),
    sparatPaPapper: document.getElementById('dok-sparat-papper').value,
  };
}

// ------------------------------------------------------------------
// Ladda befintlig mall
// ------------------------------------------------------------------
async function laddaMall(id) {
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const mall = dokumentmallar.find(m => m.id === id);
  if (!mall) return;
  fyllFormulärFrånData(mall);
}

/**
 * Laddar instansdata (kopia kopplad till ärendemall) i formuläret.
 */
async function laddaInstansData(data) {
  fyllFormulärFrånData(data);
}

/**
 * Fyller formuläret med data från en dokumentmall eller instans.
 */
function fyllFormulärFrånData(d) {
  document.getElementById('dok-namn').value = d.namn || '';
  document.getElementById('dok-titel').value = d.titel || '';
  document.getElementById('dok-kategori').value = d.kategori || '';
  document.getElementById('dok-skyddskod').value = d.skyddskod || '0';
  document.getElementById('dok-oregistrerad-kontakt').value = d.oregistreradKontakt || '';
  document.getElementById('dok-sparat-papper').value = d.sparatPaPapper || '0';
  // Datum – "idag", "YYYY-MM-DD" eller "" (bakåtkompatibel med ankomstdatum)
  const datumVärde = d.datum || d.ankomstdatum || '';
  if (datumVärde === 'idag') {
    document.getElementById('dok-datum-typ').value = 'idag';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(datumVärde)) {
    document.getElementById('dok-datum-typ').value = 'datum';
    document.getElementById('dok-datum-värde').value = datumVärde;
    document.getElementById('dok-datum-värde').style.display = '';
  } else {
    document.getElementById('dok-datum-typ').value = '';
  }

  // Uppdatera etiketter baserat på kategori
  uppdateraKategoriEtiketter();

  if (d.handlingstyp?.value) {
    säkertVälj('dok-handlingstyp', d.handlingstyp.value, d.handlingstyp.text);
  }
  if (d.atkomstgrupp?.value) {
    säkertVälj('dok-atkomstgrupp', d.atkomstgrupp.value, d.atkomstgrupp.label);
  }
  if (d.ansvarigEnhet?.value) {
    säkertVälj('dok-ansvarig-enhet', d.ansvarigEnhet.value, d.ansvarigEnhet.label);
  }
  if (d.ansvarigPerson?.value) {
    säkertVälj('dok-ansvarig-person', d.ansvarigPerson.value, d.ansvarigPerson.label);
  }
  if (d.projekt?.value) {
    säkertVälj('dok-projekt', d.projekt.value, d.projekt.display);
  }
  if (d.fastighet?.value) {
    säkertVälj('dok-fastighet', d.fastighet.value, d.fastighet.display);
  }

  uppdateraSekretessFält();
  if (d.skyddskod !== '0') {
    document.getElementById('dok-paragraf').value = d.sekretessParag || '';
    document.getElementById('dok-off-titel-val').value = d.offentligTitelVal || '1';
    if (d.offentligTitelVal === '3') {
      document.getElementById('off-titel-falt').style.display = '';
      document.getElementById('dok-off-titel').value = d.offentligTitel || '';
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
