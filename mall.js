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

// Dokumentkategorier (hårdkodad lista – generell i 360°)
const DOKUMENTKATEGORIER = [
  { value: '110', label: 'Inkommande' },
  { value: '111', label: 'Utgående' },
  { value: '60005', label: 'Upprättat' },
  { value: '118', label: 'Kallelse' },
  { value: '60006', label: 'Protokollsutdrag' },
  { value: '218', label: 'Tjänsteutlåtande' },
  { value: '101001', label: 'Delegationsbeslut' },
  { value: '112', label: 'Protokoll' },
];

// Kontaktlista för mallen
let kontakter = [];
// Ärendedokument-lista för mallen – referenser till dokumentmallar: [{ dokumentmallId, namn }]
let ärendedokument = [];
// Alla sparade dokumentmallar (laddas vid init)
let sparadeDokumentmallar = [];
// Cachade handlingstyper (från chrome.storage.local)
let cachedHandlingstyper = [];
// Cachade ansvariga personer (från chrome.storage.local)
let cachedAnsvarigaPersoner = [];
// Cachade åtkomstgrupper (från chrome.storage.local)
let cachedAtkomstgrupper = [];
// Cachade ansvariga enheter (från chrome.storage.local)
let cachedAnsvarigaEnheter = [];
// Redigerar vi en befintlig mall? Håll ID:t.
let mallId = null;
// Inlästa alternativ från 360°
let inlästaAlternativ = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  fyllParagrafer('0');

  // Ladda cachade alternativ och sparade dokumentmallar
  const stored = await chrome.storage.local.get([
    'cachedHandlingstyper', 'cachedAnsvarigaPersoner',
    'cachedAtkomstgrupper', 'cachedAnsvarigaEnheter',
    'dokumentmallar'
  ]);
  cachedHandlingstyper = stored.cachedHandlingstyper || [];
  cachedAnsvarigaPersoner = stored.cachedAnsvarigaPersoner || [];
  cachedAtkomstgrupper = stored.cachedAtkomstgrupper || [];
  cachedAnsvarigaEnheter = stored.cachedAnsvarigaEnheter || [];
  sparadeDokumentmallar = stored.dokumentmallar || [];
  visaDokCacheStatus();

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
  document.getElementById('btn-lagg-till-dokument').addEventListener('click', () =>
    visaDokumentväljare()
  );
  document.getElementById('btn-ny-dokumentmall').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dokument-mall.html') });
  });

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
  status.textContent = 'Söker efter öppen 360°-flik…';

  // Hitta en befintlig 360°-flik att köra åtgärden i.
  // page.js öppnar ett dolt iframe med formuläret inuti den fliken
  // – det kringgår problemet att /locator/DMS/Case/New/61000 avvisar direkta GET-anrop.
  const [tab] = await chrome.tabs.query({ url: 'https://p360.svenskakyrkan.se/*' });
  if (!tab) {
    status.textContent = 'Öppna 360° i en webbläsarflik och försök igen.';
    knapp.disabled = false;
    return;
  }

  status.textContent = 'Läser in alternativ från 360°…';

  let svar;
  try {
    svar = await chrome.tabs.sendMessage(tab.id, { action: 'läsInAlternativ' });
  } catch {
    // Scripts kanske inte registrerats – injicera och försök igen
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page.js'], world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'], world: 'ISOLATED' });
      await new Promise(r => setTimeout(r, 400));
      svar = await chrome.tabs.sendMessage(tab.id, { action: 'läsInAlternativ' });
    } catch (err) {
      status.textContent = 'Misslyckades: ' + err.message;
      knapp.disabled = false;
      return;
    }
  }

  if (!svar?.success) {
    status.textContent = svar?.fel ?? 'Misslyckades att läsa in alternativ.';
    knapp.disabled = false;
    return;
  }

  inlästaAlternativ = svar.data;
  fyllSelectFrånAlternativ('mall-diarieenhet', inlästaAlternativ.diarieenheter, true);
  fyllSelectFrånAlternativ('mall-delarkiv', inlästaAlternativ.delarkiv, true);
  fyllSelectFrånAlternativ('mall-atkomstgrupp', inlästaAlternativ.atkomstgrupper, true);
  fyllSelectFrånAlternativ('mall-ansvarig-enhet', inlästaAlternativ.ansvarigaEnheter, true);
  fyllSelectFrånAlternativ('mall-ansvarig-person', inlästaAlternativ.ansvarigaPersoner, true);

  // Cacha instansspecifika alternativ för ärendedokument-formuläret
  const cacheUppdatering = {};
  if (inlästaAlternativ.ansvarigaPersoner?.length > 0) {
    cachedAnsvarigaPersoner = inlästaAlternativ.ansvarigaPersoner;
    cacheUppdatering.cachedAnsvarigaPersoner = cachedAnsvarigaPersoner;
  }
  if (inlästaAlternativ.atkomstgrupper?.length > 0) {
    cachedAtkomstgrupper = inlästaAlternativ.atkomstgrupper;
    cacheUppdatering.cachedAtkomstgrupper = cachedAtkomstgrupper;
  }
  if (inlästaAlternativ.ansvarigaEnheter?.length > 0) {
    cachedAnsvarigaEnheter = inlästaAlternativ.ansvarigaEnheter;
    cacheUppdatering.cachedAnsvarigaEnheter = cachedAnsvarigaEnheter;
  }
  if (Object.keys(cacheUppdatering).length > 0) {
    await chrome.storage.local.set(cacheUppdatering);
  }

  // Klassificeringar – visa dropdown om vi fick in data, annars behåll manuella fält
  if (inlästaAlternativ.klassificeringar?.length > 0) {
    fyllKlassificeringSelect(inlästaAlternativ.klassificeringar);
  }

  // Återställ sparade val om vi redigerar
  if (mallId) {
    const { mallar } = await chrome.storage.local.get('mallar');
    const mall = (mallar || []).find(m => m.id === mallId);
    if (mall) {
      sättSelectvärde('mall-diarieenhet', mall.diarieenhet?.value);
      sättSelectvärde('mall-delarkiv', mall.delarkiv?.value);
      sättSelectvärde('mall-atkomstgrupp', mall.atkomstgrupp?.value);
      sättSelectvärde('mall-ansvarig-enhet', mall.ansvarigEnhet?.value);
      sättSelectvärde('mall-ansvarig-person', mall.ansvarigPerson?.value || '');
    }
  }

  const delarkivAntal = inlästaAlternativ.delarkiv?.length ?? 0;
  status.textContent = `✓ Inläst: ${inlästaAlternativ.diarieenheter.length} diarieenheter, ${delarkivAntal} delarkiv, ${inlästaAlternativ.ansvarigaEnheter.length} enheter.`;
  knapp.disabled = false;
  knapp.textContent = 'Läs in igen';
}

/**
 * Visar klassificerings-dropdown och döljer de manuella textfälten.
 * Bevarar eventuellt redan valt värde (vid redigering).
 */
function fyllKlassificeringSelect(klassificeringar) {
  const sel = document.getElementById('mall-klass-select');
  const manuellRad = document.getElementById('klass-manuell-rad');
  const hjalp = document.getElementById('klass-hjalp');

  // Hämta nuvarande manuella värden för att kunna förväljas i dropdown
  const nuvarandeDisplay = document.getElementById('mall-klass-display').value.trim();
  const nuvarandeRecno  = document.getElementById('mall-klass-recno').value.trim();

  sel.innerHTML = '<option value="">– välj klassificering –</option>';
  klassificeringar.forEach(k => {
    const opt = document.createElement('option');
    // value-formatet: "recno||display" – lätt att dela upp vid inläsning
    opt.value = (k.value || '') + '||' + (k.display || '');
    opt.textContent = k.display;
    sel.appendChild(opt);
  });

  // Förvälj om vi redigerar och redan har ett värde
  if (nuvarandeRecno || nuvarandeDisplay) {
    const träff = klassificeringar.find(
      k => k.value === nuvarandeRecno || k.display === nuvarandeDisplay
    );
    if (träff) sel.value = (träff.value || '') + '||' + (träff.display || '');
  }

  sel.style.display = '';
  manuellRad.style.display = 'none';
  hjalp.textContent = `${klassificeringar.length} klassificeringar inlästa.`;
}

function fyllSelectFrånAlternativ(elId, alternativ, läggTillTom = false) {
  const sel = document.getElementById(elId);
  const gammaltVärde = sel.value;
  sel.innerHTML = '';
  if (läggTillTom) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(Ej satt – välj manuellt)';
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
// Ärendedokument-hantering
// ------------------------------------------------------------------
function visaDokCacheStatus() {
  const el = document.getElementById('dok-cache-status');
  if (!el) return;
  if (sparadeDokumentmallar.length > 0) {
    el.textContent = `(${sparadeDokumentmallar.length} dokumentmallar sparade)`;
    el.style.color = '#2e7d32';
  } else {
    el.textContent = '(Inga dokumentmallar – skapa via popupen eller knappen nedan)';
    el.style.color = '#b71c1c';
  }
}

function renderaDokument() {
  const lista = document.getElementById('dokumentlista');
  lista.innerHTML = '';
  ärendedokument.forEach((ref, idx) => {
    // Slå upp dokumentmallen för att visa detaljer
    const dm = sparadeDokumentmallar.find(m => m.id === ref.dokumentmallId);
    const div = document.createElement('div');
    div.className = 'dokument-kort';
    const namn = dm?.namn || ref.namn || '(okänd mall)';
    const kategori = dm ? (DOKUMENTKATEGORIER.find(k => k.value === dm.kategori)?.label || '') : '';
    const handlingstyp = dm?.handlingstyp?.text || '';
    const detaljer = [kategori, handlingstyp].filter(Boolean);

    // Kontrollera om handlingstypen matchar ärendets klassificering
    const klassKod = hämtaKlassificeringskod();
    const handlTypText = dm?.handlingstyp?.text || '';
    const klassMismatch = klassKod && handlTypText && !handlTypText.startsWith(klassKod);

    // Kontrollera tomma obligatoriska fält
    const tommaObl = dm ? hittaTommaObligatoriskaFältDokMall(dm) : [];

    div.innerHTML = `
      <div class="dok-rubrik">${escHtml(namn)}</div>
      <div class="dok-knappar">
        ${dm ? `<button data-idx="${idx}" data-action="redigera-dok" title="Redigera dokumentmall">✎</button>` : ''}
        <button data-idx="${idx}" data-action="ta-bort-dok" title="Ta bort från ärendemall">✕</button>
      </div>
      ${detaljer.length ? `<div class="dok-detaljer">${escHtml(detaljer.join(' · '))}</div>` : ''}
      ${!dm ? '<div class="dok-detaljer" style="color:#c0392b;">Dokumentmallen hittades inte i lagringen.</div>' : ''}
      ${klassMismatch ? `<div class="dok-detaljer" style="color:#c0392b;">⚠ Handlingstypen (${escHtml(handlTypText.split(' ')[0])}) matchar inte ärendets klassificering (${escHtml(klassKod)})</div>` : ''}
      ${tommaObl.length ? `<div class="dok-detaljer" style="color:#b36b00;">⚠ Användaren måste fylla i: ${escHtml(tommaObl.join(', '))}</div>` : ''}
    `;
    lista.appendChild(div);
  });

  lista.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'redigera-dok') {
        const ref = ärendedokument[idx];
        chrome.tabs.create({
          url: chrome.runtime.getURL('dokument-mall.html') + '?id=' + ref.dokumentmallId,
        });
      } else if (btn.dataset.action === 'ta-bort-dok') {
        ärendedokument.splice(idx, 1);
        renderaDokument();
      }
    });
  });
}

/**
 * Visar en väljare för att lägga till sparade dokumentmallar i ärendemallen.
 */
function visaDokumentväljare() {
  document.querySelectorAll('.dokument-formulär').forEach(el => el.remove());

  if (sparadeDokumentmallar.length === 0) {
    // Öppna dokumentmall-redigeraren direkt
    chrome.tabs.create({ url: chrome.runtime.getURL('dokument-mall.html') });
    return;
  }

  // Filtrera bort redan tillagda
  const tillagdaIds = new Set(ärendedokument.map(d => d.dokumentmallId));
  const tillgängliga = sparadeDokumentmallar.filter(m => !tillagdaIds.has(m.id));

  if (tillgängliga.length === 0) {
    const info = document.createElement('div');
    info.className = 'dokument-formulär';
    info.innerHTML = '<p style="margin:0;font-size:13px;color:#555;">Alla dokumentmallar är redan tillagda.</p>';
    document.getElementById('dokumentlista').after(info);
    setTimeout(() => info.remove(), 3000);
    return;
  }

  const klassKod = hämtaKlassificeringskod();

  const formulär = document.createElement('div');
  formulär.className = 'dokument-formulär';
  formulär.innerHTML = `
    <h4>Välj dokumentmall</h4>
    <div class="faltrad">
      <select name="dok-mall-val">
        ${tillgängliga.map(m => {
          const kat = DOKUMENTKATEGORIER.find(k => k.value === m.kategori)?.label || '';
          const detalj = [kat, m.handlingstyp?.text].filter(Boolean).join(' · ');
          const htText = m.handlingstyp?.text || '';
          const varning = klassKod && htText && !htText.startsWith(klassKod) ? ' ⚠' : '';
          return `<option value="${escHtml(m.id)}">${escHtml(m.namn)}${detalj ? ' (' + escHtml(detalj) + ')' : ''}${varning}</option>`;
        }).join('')}
      </select>
    </div>
    ${klassKod ? '<p style="font-size:11px;color:#888;margin:0 0 8px;">⚠ = handlingstypen matchar inte klassificeringen ' + escHtml(klassKod) + '</p>' : ''}
    <div class="knappar">
      <button class="ok" data-action="ok">Lägg till</button>
      <button data-action="avbryt">Avbryt</button>
    </div>
  `;

  document.getElementById('dokumentlista').after(formulär);

  formulär.querySelector('[data-action="avbryt"]').addEventListener('click', () => formulär.remove());
  formulär.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const valt = formulär.querySelector('[name="dok-mall-val"]').value;
    const dm = sparadeDokumentmallar.find(m => m.id === valt);
    if (dm) {
      ärendedokument.push({ dokumentmallId: dm.id, namn: dm.namn });
      formulär.remove();
      renderaDokument();
    }
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
    delarkiv: (() => { const s = document.getElementById('mall-delarkiv'); return { value: s.value, label: s.options[s.selectedIndex]?.text || '' }; })(),
    atkomstgrupp: atkomstgruppVärde ? { value: atkomstgruppVärde, label: atkomstgruppLabel } : null,
    ansvarigEnhet: ansvarigEnhetVärde ? { value: ansvarigEnhetVärde, label: ansvarigEnhetLabel } : null,
    ansvarigPerson: ansvarigPersonVärde ? { value: ansvarigPersonVärde, label: ansvarigPersonLabel } : null,
    klassificering: läsKlassificering(),
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
    debugPauseKlassificering: document.getElementById('mall-debug-pause-klass').checked,
    externaKontakter: kontakter,
    ärendedokument: ärendedokument,
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

/**
 * Läser klassificeringsvärdet från antingen dropdown (om inläst) eller manuella fält.
 */
function läsKlassificering() {
  const sel = document.getElementById('mall-klass-select');
  if (sel.style.display !== 'none' && sel.value) {
    const [value, ...rest] = sel.value.split('||');
    return { value: value.trim(), display: rest.join('||').trim() };
  }
  const recno   = document.getElementById('mall-klass-recno').value.trim();
  const display = document.getElementById('mall-klass-display').value.trim();
  return recno ? { value: recno, display } : null;
}

/**
 * Hämtar klassificeringskoden (t.ex. "2.7") från mallens klassificering.
 * Används för att filtrera handlingstyper i ärendedokument-formuläret.
 */
function hämtaKlassificeringskod() {
  const klass = läsKlassificering();
  if (!klass?.display) return null;
  // Klassificerings-display ser ut som "2.7 - Ge internt verksamhetsstöd"
  // Extrahera koden före " - "
  const match = klass.display.match(/^([\d.]+)/);
  return match ? match[1] : null;
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
  document.getElementById('mall-debug-pause-klass').checked = !!mall.debugPauseKlassificering;

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

  // Migrera gamla inline-dokument till dokumentmallar (bakåtkompatibilitet)
  const råDokument = mall.ärendedokument || [];
  ärendedokument = [];
  for (const d of råDokument) {
    if (d.dokumentmallId) {
      // Redan en referens
      ärendedokument.push(d);
    } else if (d.titel || d.handlingstyp) {
      // Gammalt inline-format – skapa en dokumentmall automatiskt
      const nyMall = {
        id: 'dokmall_migr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        namn: d.titel || '(Migrerad dokumentmall)',
        skapad: Date.now(),
        ändrad: Date.now(),
        ...d,
      };
      sparadeDokumentmallar.push(nyMall);
      ärendedokument.push({ dokumentmallId: nyMall.id, namn: nyMall.namn });
    }
  }
  // Spara eventuellt migrerade dokumentmallar
  if (råDokument.some(d => !d.dokumentmallId && (d.titel || d.handlingstyp))) {
    await chrome.storage.local.set({ dokumentmallar: sparadeDokumentmallar });
  }
  renderaDokument();
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

/**
 * Returnerar lista med etiketter för obligatoriska dokumentfält som saknar värde.
 */
function hittaTommaObligatoriskaFältDokMall(dm) {
  const tomma = [];
  if (!dm.titel) tomma.push('Titel');
  if (!dm.handlingstyp?.value) tomma.push('Handlingstyp');
  if (!dm.kategori) tomma.push('Dokumentkategori');
  if (!dm.atkomstgrupp?.value) tomma.push('Åtkomstgrupp');
  if (dm.skyddskod && dm.skyddskod !== '0' && !dm.sekretessParag) tomma.push('Paragraf');
  return tomma;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
