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
// Ärendedokument-lista för mallen
let ärendedokument = [];
// Cachade handlingstyper (från chrome.storage.local)
let cachedHandlingstyper = [];
// Redigerar vi en befintlig mall? Håll ID:t.
let mallId = null;
// Inlästa alternativ från 360°
let inlästaAlternativ = null;

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  fyllParagrafer('0');

  // Ladda cachade handlingstyper
  const stored = await chrome.storage.local.get('cachedHandlingstyper');
  cachedHandlingstyper = stored.cachedHandlingstyper || [];
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
    visaDokumentFormulär(null)
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
  if (cachedHandlingstyper.length > 0) {
    el.textContent = `(${cachedHandlingstyper.length} handlingstyper cachade)`;
    el.style.color = '#2e7d32';
  } else {
    el.textContent = '(Inga handlingstyper cachade – öppna "Nytt dokument" i 360° först)';
    el.style.color = '#b71c1c';
  }
}

function renderaDokument() {
  const lista = document.getElementById('dokumentlista');
  lista.innerHTML = '';
  ärendedokument.forEach((d, idx) => {
    const div = document.createElement('div');
    div.className = 'dokument-kort';
    const kategori = DOKUMENTKATEGORIER.find(k => k.value === d.kategori)?.label || d.kategori || '(ingen kategori)';
    const handlingstyp = d.handlingstyp?.text || '(ingen handlingstyp)';
    div.innerHTML = `
      <div class="dok-rubrik">${escHtml(d.titel || '(Ingen titel)')}</div>
      <div class="dok-knappar">
        <button data-idx="${idx}" data-action="redigera-dok">Redigera</button>
        <button data-idx="${idx}" data-action="ta-bort-dok">✕</button>
      </div>
      <div class="dok-detaljer">${escHtml(kategori)} · ${escHtml(handlingstyp)}</div>
    `;
    lista.appendChild(div);
  });

  lista.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'redigera-dok') {
        visaDokumentFormulär(idx);
      } else if (btn.dataset.action === 'ta-bort-dok') {
        ärendedokument.splice(idx, 1);
        renderaDokument();
      }
    });
  });
}

function visaDokumentFormulär(idx) {
  // Ta bort eventuellt öppet dokumentformulär
  document.querySelectorAll('.dokument-formulär').forEach(el => el.remove());

  const d = idx !== null ? ärendedokument[idx] : {};
  const formulär = document.createElement('div');
  formulär.className = 'dokument-formulär';

  // Handlingstyp-options
  const handlingstypOptions = cachedHandlingstyper.length > 0
    ? '<option value="">(Ingen)</option>' + cachedHandlingstyper.map(h =>
        `<option value="${escHtml(h.value)}" ${d.handlingstyp?.value === h.value ? 'selected' : ''}>${escHtml(h.text)}</option>`
      ).join('')
    : '<option value="">(Inga cachade – öppna "Nytt dokument" i 360°)</option>';

  // Dokumentkategori-options
  const kategoriOptions = '<option value="">(Ingen)</option>' + DOKUMENTKATEGORIER.map(k =>
    `<option value="${k.value}" ${d.kategori === k.value ? 'selected' : ''}>${escHtml(k.label)}</option>`
  ).join('');

  // Skyddskod-options
  const skyddskodVal = d.skyddskod || '0';

  // Ansvarig person – använd inlästa alternativ om de finns
  let ansvarigPersonOptions = '<option value="">(Ingen)</option>';
  if (inlästaAlternativ?.ansvarigaPersoner?.length > 0) {
    ansvarigPersonOptions += inlästaAlternativ.ansvarigaPersoner.map(p =>
      `<option value="${escHtml(p.value)}" ${d.ansvarigPerson?.value === p.value ? 'selected' : ''}>${escHtml(p.label)}</option>`
    ).join('');
  } else if (d.ansvarigPerson?.value) {
    ansvarigPersonOptions += `<option value="${escHtml(d.ansvarigPerson.value)}" selected>${escHtml(d.ansvarigPerson.label)}</option>`;
  }

  formulär.innerHTML = `
    <h4>${idx !== null ? 'Redigera ärendedokument' : 'Nytt ärendedokument'}</h4>
    <div class="faltrad">
      <label>Titel</label>
      <input type="text" name="dok-titel" value="${escHtml(d.titel || '')}">
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Handlingstyp</label>
        <select name="dok-handlingstyp">${handlingstypOptions}</select>
      </div>
      <div class="faltrad">
        <label>Dokumentkategori</label>
        <select name="dok-kategori">${kategoriOptions}</select>
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Ansvarig person</label>
        <select name="dok-ansvarig-person">${ansvarigPersonOptions}</select>
      </div>
      <div class="faltrad">
        <label>Skyddskod</label>
        <select name="dok-skyddskod">
          <option value="0" ${skyddskodVal === '0' ? 'selected' : ''}>Offentlig</option>
          <option value="100031" ${skyddskodVal === '100031' ? 'selected' : ''}>Sekretess KO</option>
          <option value="100032" ${skyddskodVal === '100032' ? 'selected' : ''}>Sekretess OSL</option>
        </select>
      </div>
    </div>
    <div class="dok-sekretess" style="display:${skyddskodVal !== '0' ? '' : 'none'};">
      <div class="faltrad">
        <label>Paragraf</label>
        <select name="dok-paragraf"></select>
      </div>
    </div>
    <div class="knappar">
      <button class="ok" data-action="ok">OK</button>
      <button data-action="avbryt">Avbryt</button>
    </div>
  `;

  // Infoga efter dokumentlistan
  const lista = document.getElementById('dokumentlista');
  lista.after(formulär);

  // Fyll i paragraf-dropdown
  const paragrafSel = formulär.querySelector('[name="dok-paragraf"]');
  fyllDokParagrafer(paragrafSel, skyddskodVal);
  if (d.sekretessParag) paragrafSel.value = d.sekretessParag;

  // Visa/dölj sekretessblock vid skyddskod-byte
  const skyddskodSel = formulär.querySelector('[name="dok-skyddskod"]');
  const sekretessDiv = formulär.querySelector('.dok-sekretess');
  skyddskodSel.addEventListener('change', () => {
    const kod = skyddskodSel.value;
    sekretessDiv.style.display = kod !== '0' ? '' : 'none';
    if (kod !== '0') fyllDokParagrafer(paragrafSel, kod);
  });

  formulär.querySelector('[data-action="avbryt"]').addEventListener('click', () => formulär.remove());
  formulär.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const handlingstypSel = formulär.querySelector('[name="dok-handlingstyp"]');
    const ansvarigSel = formulär.querySelector('[name="dok-ansvarig-person"]');
    const kod = skyddskodSel.value;

    const nyttDok = {
      titel: formulär.querySelector('[name="dok-titel"]').value.trim(),
      handlingstyp: handlingstypSel.value
        ? { value: handlingstypSel.value, text: handlingstypSel.options[handlingstypSel.selectedIndex]?.text || '' }
        : null,
      kategori: formulär.querySelector('[name="dok-kategori"]').value,
      ansvarigPerson: ansvarigSel.value
        ? { value: ansvarigSel.value, label: ansvarigSel.options[ansvarigSel.selectedIndex]?.text || '' }
        : null,
      skyddskod: kod,
      sekretessParag: kod !== '0' ? paragrafSel.value : '',
    };

    if (idx !== null) {
      ärendedokument[idx] = nyttDok;
    } else {
      ärendedokument.push(nyttDok);
    }
    formulär.remove();
    renderaDokument();
  });
}

function fyllDokParagrafer(sel, kod) {
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

  ärendedokument = mall.ärendedokument || [];
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

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
