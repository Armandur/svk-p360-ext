// mall-data.js – Konstanter, spara/ladda mall, hjälpfunktioner
// Laddas före mall.js i mall.html.

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
  { value: '112', label: 'Protokoll' },
];

// Konfigurationer för typeahead-fält (klassificering, projekt, fastighet)
const TYPEAHEAD_KLASS = {
  selectId: 'mall-klass-select', manuellRadId: 'klass-manuell-rad',
  displayId: 'mall-klass-display', recnoId: 'mall-klass-recno',
  hjalpId: 'klass-hjalp', tomOption: '– välj klassificering –', etikett: 'klassificeringar',
};
const TYPEAHEAD_PROJEKT = {
  selectId: 'mall-projekt-select', manuellRadId: 'projekt-manuell-rad',
  displayId: 'mall-projekt-display', recnoId: 'mall-projekt-recno',
  hjalpId: 'projekt-hjalp', tomOption: '– välj projekt –', etikett: 'projekt',
};
const TYPEAHEAD_FASTIGHET = {
  selectId: 'mall-fastighet-select', manuellRadId: 'fastighet-manuell-rad',
  displayId: 'mall-fastighet-display', recnoId: 'mall-fastighet-recno',
  hjalpId: 'fastighet-hjalp', tomOption: '– välj fastighet –', etikett: 'fastigheter',
};

// ------------------------------------------------------------------
// Hjälpfunktioner
// ------------------------------------------------------------------
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function visaFel(meddelande) {
  const el = document.getElementById('felruta');
  el.textContent = meddelande;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function läggTillSelectAlternativ(elId, alternativ) {
  const sel = document.getElementById(elId);
  if (!Array.from(sel.options).some(o => o.value === alternativ.value)) {
    const opt = document.createElement('option');
    opt.value = alternativ.value;
    opt.textContent = alternativ.label;
    sel.appendChild(opt);
  }
  sel.value = alternativ.value;
}

/**
 * Generisk funktion: fyller en typeahead-dropdown och döljer manuella textfält.
 */
function fyllTypeaheadSelect(config, items) {
  const sel = document.getElementById(config.selectId);
  const manuellRad = document.getElementById(config.manuellRadId);
  const hjalp = document.getElementById(config.hjalpId);

  const nuvarandeDisplay = document.getElementById(config.displayId).value.trim();
  const nuvarandeRecno  = document.getElementById(config.recnoId).value.trim();

  sel.innerHTML = `<option value="">${config.tomOption}</option>`;
  items.forEach(k => {
    const opt = document.createElement('option');
    opt.value = (k.value || '') + '||' + (k.display || '');
    opt.textContent = k.display;
    sel.appendChild(opt);
  });

  if (nuvarandeRecno || nuvarandeDisplay) {
    const träff = items.find(
      k => k.value === nuvarandeRecno || k.display === nuvarandeDisplay
    );
    if (träff) sel.value = (träff.value || '') + '||' + (träff.display || '');
  }

  sel.style.display = '';
  manuellRad.style.display = 'none';
  hjalp.textContent = `${items.length} ${config.etikett} inlästa.`;
}

/**
 * Generisk funktion: läser typeahead-värde från dropdown eller manuella fält.
 */
function läsTypeahead(config) {
  const sel = document.getElementById(config.selectId);
  if (sel.style.display !== 'none' && sel.value) {
    const [value, ...rest] = sel.value.split('||');
    return { value: value.trim(), display: rest.join('||').trim() };
  }
  const recno   = document.getElementById(config.recnoId).value.trim();
  const display = document.getElementById(config.displayId).value.trim();
  return recno ? { value: recno, display } : null;
}

/** Läser klassificeringsvärdet. */
function läsKlassificering() { return läsTypeahead(TYPEAHEAD_KLASS); }

/**
 * Hämtar klassificeringskoden (t.ex. "2.7") från mallens klassificering.
 */
function hämtaKlassificeringskod() {
  const klass = läsKlassificering();
  if (!klass?.display) return null;
  const match = klass.display.match(/^([\d.]+)/);
  return match ? match[1] : null;
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
  if (!dm.ansvarigEnhet?.value) tomma.push('Ansvarig enhet');
  if (dm.skyddskod && dm.skyddskod !== '0' && !dm.sekretessParag) tomma.push('Paragraf');
  return tomma;
}

/**
 * Kopplar HTML5 drag-and-drop på kort inuti en lista-container.
 * Ändrar ordning i arrayReferens och anropar renderFn efter drop.
 */
function kopplaDragDrop(listaEl, arrayReferens, renderFn) {
  let dragIdx = null;

  for (const kort of listaEl.children) {
    kort.addEventListener('dragstart', (e) => {
      dragIdx = parseInt(kort.dataset.idx, 10);
      kort.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragIdx));
    });

    kort.addEventListener('dragend', () => {
      kort.classList.remove('dragging');
      listaEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragIdx = null;
    });

    kort.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const överIdx = parseInt(kort.dataset.idx, 10);
      if (dragIdx !== null && överIdx !== dragIdx) {
        kort.classList.add('drag-over');
      }
    });

    kort.addEventListener('dragleave', () => {
      kort.classList.remove('drag-over');
    });

    kort.addEventListener('drop', (e) => {
      e.preventDefault();
      kort.classList.remove('drag-over');
      const dropIdx = parseInt(kort.dataset.idx, 10);
      if (dragIdx === null || dragIdx === dropIdx) return;

      const [flyttat] = arrayReferens.splice(dragIdx, 1);
      arrayReferens.splice(dropIdx, 0, flyttat);
      dragIdx = null;
      renderFn();
    });
  }
}

// ------------------------------------------------------------------
// Spara mall till chrome.storage.local
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
    projekt: läsTypeahead(TYPEAHEAD_PROJEKT),
    fastighet: läsTypeahead(TYPEAHEAD_FASTIGHET),
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
