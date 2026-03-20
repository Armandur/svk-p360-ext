// mall.js – logik för mallredigeringssidan

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

// Rollkoder för externa kontakter
const KONTAKTROLLER = [
  { value: '9', label: 'Ärendepart' },
  { value: '100001', label: 'Tonsättare' },
  { value: '100002', label: 'Textförfattare' },
  { value: '100003', label: 'Tonsättare och textförfattare' },
];

// Kontaktlista för mallen
let kontakter = [];
// Redigerar vi en befintlig mall? Håll ID:t.
let mallId = null;
// Inlästa alternativ från 360°
let inlästaAlternativ = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  fyllParagrafer('0');

  // Kolla om vi redigerar en befintlig mall (URL: ?id=xxx)
  const params = new URLSearchParams(location.search);
  mallId = params.get('id');
  if (mallId) {
    document.getElementById('sidrubrik').textContent = 'Redigera mall';
    await laddaMall(mallId);
  }

  kopplaHändelser();
});

// ------------------------------------------------------------------
// Händelsehanterare
// ------------------------------------------------------------------
function kopplaHändelser() {
  document.getElementById('btn-spara').addEventListener('click', sparaMall);
  document.getElementById('btn-avbryt').addEventListener('click', () => window.close());
  document.getElementById('btn-las-in').addEventListener('click', läsIn);
  document.getElementById('btn-lagg-till-kontakt').addEventListener('click', () =>
    visaKontaktFormulär(null)
  );

  document.getElementById('mall-skyddskod').addEventListener('change', () => {
    uppdateraSekretessFält();
  });

  document.getElementById('mall-off-titel-val').addEventListener('change', () => {
    const val = document.getElementById('mall-off-titel-val').value;
    document.getElementById('off-titel-falt').style.display = val === '3' ? '' : 'none';
  });
}

// ------------------------------------------------------------------
// Sekretessfält – synlighet och paragrafval
// ------------------------------------------------------------------
function uppdateraSekretessFält() {
  const kod = document.getElementById('mall-skyddskod').value;
  const sekretessDiv = document.getElementById('sekretess-falt');
  sekretessDiv.style.display = kod !== '0' ? '' : 'none';
  if (kod !== '0') {
    fyllParagrafer(kod);
  }
}

function fyllParagrafer(kod) {
  const sel = document.getElementById('mall-paragraf');
  const valt = sel.value;
  sel.innerHTML = '<option value="">– välj paragraf –</option>';
  const lista = kod === '100032' ? OSL_PARAGRAFER : KO_PARAGRAFER;
  lista.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  });
  if (valt) sel.value = valt;
}

// ------------------------------------------------------------------
// Läs in alternativ från 360°
// ------------------------------------------------------------------
async function läsIn() {
  const knapp = document.getElementById('btn-las-in');
  const status = document.getElementById('las-in-status');

  knapp.disabled = true;
  status.textContent = 'Öppnar formuläret i 360°…';

  let tab;
  try {
    tab = await chrome.tabs.create({
      url: 'https://p360.svenskakyrkan.se/locator/DMS/Case/New/61000',
      active: false,
    });
  } catch {
    status.textContent = 'Kunde inte öppna ny flik. Kontrollera behörigheter.';
    knapp.disabled = false;
    return;
  }

  // Vänta tills fliken laddats klart
  await new Promise(resolve => {
    const lyssnare = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(lyssnare);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(lyssnare);
  });

  // Ge content scripts tid att registrera sig
  await new Promise(r => setTimeout(r, 600));

  status.textContent = 'Läser in alternativ…';

  let svar;
  try {
    svar = await chrome.tabs.sendMessage(tab.id, { action: 'läsInAlternativ' });
  } catch {
    // Försök injicera scripts om de inte laddats automatiskt
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['page.js'],
        world: 'MAIN',
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
        world: 'ISOLATED',
      });
      await new Promise(r => setTimeout(r, 400));
      svar = await chrome.tabs.sendMessage(tab.id, { action: 'läsInAlternativ' });
    } catch (err) {
      chrome.tabs.remove(tab.id).catch(() => {});
      status.textContent = 'Misslyckades: ' + err.message;
      knapp.disabled = false;
      return;
    }
  }

  chrome.tabs.remove(tab.id).catch(() => {});

  if (!svar?.success) {
    status.textContent = svar?.fel ?? 'Misslyckades att läsa in alternativ.';
    knapp.disabled = false;
    return;
  }

  inlästaAlternativ = svar.data;
  fyllSelectFrånAlternativ('mall-diarieenhet', inlästaAlternativ.diarieenheter);
  fyllSelectFrånAlternativ('mall-atkomstgrupp', inlästaAlternativ.atkomstgrupper);
  fyllSelectFrånAlternativ('mall-ansvarig-enhet', inlästaAlternativ.ansvarigaEnheter);
  fyllSelectFrånAlternativ('mall-ansvarig-person', inlästaAlternativ.ansvarigaPersoner, true);

  // Återställ sparade val om vi redigerar
  if (mallId) {
    const { mallar } = await chrome.storage.local.get('mallar');
    const mall = (mallar || []).find(m => m.id === mallId);
    if (mall) {
      sättSelectvärde('mall-diarieenhet', mall.diarieenhet?.value);
      sättSelectvärde('mall-atkomstgrupp', mall.atkomstgrupp?.value);
      sättSelectvärde('mall-ansvarig-enhet', mall.ansvarigEnhet?.value);
      sättSelectvärde('mall-ansvarig-person', mall.ansvarigPerson?.value || '');
    }
  }

  status.textContent = `✓ Inläst: ${inlästaAlternativ.diarieenheter.length} diarieenheter, ${inlästaAlternativ.ansvarigaEnheter.length} enheter.`;
  knapp.disabled = false;
  knapp.textContent = 'Läs in igen';
}

function fyllSelectFrånAlternativ(elId, alternativ, läggTillTom = false) {
  const sel = document.getElementById(elId);
  const gammaltVärde = sel.value;
  sel.innerHTML = '';
  if (läggTillTom) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Ingen)';
    sel.appendChild(opt);
  }
  (alternativ || []).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    sel.appendChild(opt);
  });
  if (gammaltVärde) sel.value = gammaltVärde;
}

function sättSelectvärde(elId, värde) {
  if (!värde) return;
  const sel = document.getElementById(elId);
  sel.value = värde;
}

// ------------------------------------------------------------------
// Kontakthantering
// ------------------------------------------------------------------
function renderaKontakter() {
  const lista = document.getElementById('kontaktlista');
  lista.innerHTML = '';
  kontakter.forEach((k, idx) => {
    const div = document.createElement('div');
    div.className = 'kontakt-kort';
    const roll = KONTAKTROLLER.find(r => r.value === k.roll)?.label || k.roll;
    div.innerHTML = `
      <div class="kontakt-rubrik">${escHtml(k.namn) || '(Namnlös)'} <span style="font-weight:normal;color:#888;font-size:12px">– ${escHtml(roll)}</span></div>
      <div class="kontakt-knappar">
        <button data-idx="${idx}" data-action="redigera">Redigera</button>
        <button data-idx="${idx}" data-action="ta-bort">✕</button>
      </div>
      <div class="kontakt-detaljer">${[k.epost, k.telefon, k.ort].filter(Boolean).map(escHtml).join(' · ')}</div>
    `;
    lista.appendChild(div);
  });

  lista.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'redigera') {
        visaKontaktFormulär(idx);
      } else {
        kontakter.splice(idx, 1);
        renderaKontakter();
      }
    });
  });
}

function visaKontaktFormulär(idx) {
  // Ta bort eventuellt öppet formulär
  document.querySelectorAll('.kontakt-formulär').forEach(el => el.remove());

  const k = idx !== null ? kontakter[idx] : {};
  const formulär = document.createElement('div');
  formulär.className = 'kontakt-formulär';

  const rollOptions = KONTAKTROLLER.map(r =>
    `<option value="${r.value}" ${k.roll === r.value ? 'selected' : ''}>${escHtml(r.label)}</option>`
  ).join('');

  formulär.innerHTML = `
    <h4>${idx !== null ? 'Redigera kontakt' : 'Ny extern kontakt'}</h4>
    <div class="tvakol">
      <div class="faltrad">
        <label class="obligatorisk">Namn</label>
        <input type="text" name="namn" value="${escHtml(k.namn || '')}">
      </div>
      <div class="faltrad">
        <label>Roll</label>
        <select name="roll">${rollOptions}</select>
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Kontaktperson</label>
        <input type="text" name="kontaktperson" value="${escHtml(k.kontaktperson || '')}">
      </div>
      <div class="faltrad">
        <label>E-post</label>
        <input type="email" name="epost" value="${escHtml(k.epost || '')}">
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Telefon</label>
        <input type="tel" name="telefon" value="${escHtml(k.telefon || '')}">
      </div>
      <div class="faltrad">
        <label>Adress</label>
        <input type="text" name="adress" value="${escHtml(k.adress || '')}">
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Postnummer</label>
        <input type="text" name="postnummer" value="${escHtml(k.postnummer || '')}">
      </div>
      <div class="faltrad">
        <label>Ort</label>
        <input type="text" name="ort" value="${escHtml(k.ort || '')}">
      </div>
    </div>
    <div class="faltrad">
      <label>Kommentar</label>
      <textarea name="kommentar" rows="2">${escHtml(k.kommentar || '')}</textarea>
    </div>
    <div class="knappar">
      <button class="ok" data-action="ok">OK</button>
      <button data-action="avbryt">Avbryt</button>
    </div>
  `;

  // Infoga efter kontaktlistan
  const lista = document.getElementById('kontaktlista');
  lista.after(formulär);

  formulär.querySelector('[data-action="avbryt"]').addEventListener('click', () => formulär.remove());
  formulär.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const namnFält = formulär.querySelector('[name="namn"]');
    if (!namnFält.value.trim()) {
      namnFält.focus();
      return;
    }
    const nyKontakt = {
      namn: formulär.querySelector('[name="namn"]').value.trim(),
      roll: formulär.querySelector('[name="roll"]').value,
      kontaktperson: formulär.querySelector('[name="kontaktperson"]').value.trim(),
      epost: formulär.querySelector('[name="epost"]').value.trim(),
      telefon: formulär.querySelector('[name="telefon"]').value.trim(),
      adress: formulär.querySelector('[name="adress"]').value.trim(),
      postnummer: formulär.querySelector('[name="postnummer"]').value.trim(),
      ort: formulär.querySelector('[name="ort"]').value.trim(),
      kommentar: formulär.querySelector('[name="kommentar"]').value.trim(),
    };
    if (idx !== null) {
      kontakter[idx] = nyKontakt;
    } else {
      kontakter.push(nyKontakt);
    }
    formulär.remove();
    renderaKontakter();
  });
}

// ------------------------------------------------------------------
// Spara mall
// ------------------------------------------------------------------
async function sparaMall() {
  const felruta = document.getElementById('felruta');
  felruta.style.display = 'none';

  const namn = document.getElementById('mall-namn').value.trim();
  if (!namn) {
    visaFel('Ange ett mallnamn.');
    document.getElementById('mall-namn').focus();
    return;
  }

  const diarieenhetSel = document.getElementById('mall-diarieenhet');
  const diarieenhetVärde = diarieenhetSel.value;
  const diarieenhetLabel = diarieenhetSel.options[diarieenhetSel.selectedIndex]?.text || '';

  const atkomstgruppSel = document.getElementById('mall-atkomstgrupp');
  const atkomstgruppVärde = atkomstgruppSel.value;
  const atkomstgruppLabel = atkomstgruppSel.options[atkomstgruppSel.selectedIndex]?.text || '';

  const ansvarigEnhetSel = document.getElementById('mall-ansvarig-enhet');
  const ansvarigEnhetVärde = ansvarigEnhetSel.value;
  const ansvarigEnhetLabel = ansvarigEnhetSel.options[ansvarigEnhetSel.selectedIndex]?.text || '';

  const ansvarigPersonSel = document.getElementById('mall-ansvarig-person');
  const ansvarigPersonVärde = ansvarigPersonSel.value;
  const ansvarigPersonLabel = ansvarigPersonSel.options[ansvarigPersonSel.selectedIndex]?.text || '';

  const skyddskod = document.getElementById('mall-skyddskod').value;

  const mall = {
    id: mallId || 'mall_' + Date.now(),
    namn,
    skapad: mallId ? undefined : Date.now(),
    ändrad: Date.now(),
    titel: document.getElementById('mall-titel').value.trim(),
    diarieenhet: diarieenhetVärde ? { value: diarieenhetVärde, label: diarieenhetLabel } : null,
    delarkiv: { value: document.getElementById('mall-delarkiv').value, label: '' },
    atkomstgrupp: atkomstgruppVärde ? { value: atkomstgruppVärde, label: atkomstgruppLabel } : null,
    ansvarigEnhet: ansvarigEnhetVärde ? { value: ansvarigEnhetVärde, label: ansvarigEnhetLabel } : null,
    ansvarigPerson: ansvarigPersonVärde ? { value: ansvarigPersonVärde, label: ansvarigPersonLabel } : null,
    klassificering: (document.getElementById('mall-klass-recno').value.trim())
      ? {
          value: document.getElementById('mall-klass-recno').value.trim(),
          display: document.getElementById('mall-klass-display').value.trim(),
        }
      : null,
    sparatPaPapper: document.getElementById('mall-sparat-papper').value,
    skyddskod,
    sekretessParag: skyddskod !== '0' ? document.getElementById('mall-paragraf').value : '',
    skyddaKontakter: skyddskod !== '0' ? document.getElementById('mall-skydda-kontakter').checked : false,
    offentligTitelVal: skyddskod !== '0' ? document.getElementById('mall-off-titel-val').value : '1',
    offentligTitel: skyddskod !== '0' && document.getElementById('mall-off-titel-val').value === '3'
      ? document.getElementById('mall-off-titel').value.trim()
      : '',
    status: document.getElementById('mall-status').value,
    kommentar: document.getElementById('mall-kommentar').value.trim(),
    externaKontakter: kontakter,
  };

  // Hämta befintliga mallar och uppdatera/lägg till
  const { mallar: befintliga = [] } = await chrome.storage.local.get('mallar');
  const index = befintliga.findIndex(m => m.id === mall.id);
  if (index >= 0) {
    mall.skapad = befintliga[index].skapad;
    befintliga[index] = mall;
  } else {
    befintliga.push(mall);
  }

  await chrome.storage.local.set({ mallar: befintliga });
  window.close();
}

// ------------------------------------------------------------------
// Ladda befintlig mall för redigering
// ------------------------------------------------------------------
async function laddaMall(id) {
  const { mallar = [] } = await chrome.storage.local.get('mallar');
  const mall = mallar.find(m => m.id === id);
  if (!mall) {
    visaFel('Mallen hittades inte.');
    return;
  }

  document.getElementById('mall-namn').value = mall.namn || '';
  document.getElementById('mall-titel').value = mall.titel || '';
  document.getElementById('mall-sparat-papper').value = mall.sparatPaPapper || '0';
  document.getElementById('mall-skyddskod').value = mall.skyddskod || '0';
  document.getElementById('mall-status').value = mall.status || '5';
  document.getElementById('mall-kommentar').value = mall.kommentar || '';

  if (mall.klassificering) {
    document.getElementById('mall-klass-display').value = mall.klassificering.display || '';
    document.getElementById('mall-klass-recno').value = mall.klassificering.value || '';
  }

  if (mall.diarieenhet?.value) {
    // Lägg till alternativet så det syns – rätt val laddas vid läs in
    const sel = document.getElementById('mall-diarieenhet');
    const opt = document.createElement('option');
    opt.value = mall.diarieenhet.value;
    opt.textContent = mall.diarieenhet.label;
    sel.appendChild(opt);
    sel.value = mall.diarieenhet.value;
  }
  if (mall.atkomstgrupp?.value) {
    läggTillSelectAlternativ('mall-atkomstgrupp', mall.atkomstgrupp);
  }
  if (mall.ansvarigEnhet?.value) {
    läggTillSelectAlternativ('mall-ansvarig-enhet', mall.ansvarigEnhet);
  }
  if (mall.ansvarigPerson?.value) {
    läggTillSelectAlternativ('mall-ansvarig-person', mall.ansvarigPerson);
  }

  uppdateraSekretessFält();
  if (mall.skyddskod !== '0') {
    document.getElementById('mall-paragraf').value = mall.sekretessParag || '';
    document.getElementById('mall-skydda-kontakter').checked = !!mall.skyddaKontakter;
    document.getElementById('mall-off-titel-val').value = mall.offentligTitelVal || '1';
    if (mall.offentligTitelVal === '3') {
      document.getElementById('off-titel-falt').style.display = '';
      document.getElementById('mall-off-titel').value = mall.offentligTitel || '';
    }
  }

  kontakter = mall.externaKontakter || [];
  renderaKontakter();
}

function läggTillSelectAlternativ(elId, alternativ) {
  const sel = document.getElementById(elId);
  // Kontrollera om alternativet redan finns
  if (!Array.from(sel.options).some(o => o.value === alternativ.value)) {
    const opt = document.createElement('option');
    opt.value = alternativ.value;
    opt.textContent = alternativ.label;
    sel.appendChild(opt);
  }
  sel.value = alternativ.value;
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
