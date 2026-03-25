// mall.js – Entrypoint och orkestrering för mallredigeringssidan
// Beror på: mall-data.js, mall-kontakter.js, mall-dokument.js
// Dessa laddas via <script>-taggar i mall.html före denna fil.

// Globalt tillstånd (refereras av mall-kontakter.js och mall-dokument.js)
let kontakter = [];
let ärendedokument = [];
let sparadeDokumentmallar = [];
let cachedHandlingstyper = [];
let cachedAnsvarigaPersoner = [];
let cachedAtkomstgrupper = [];
let cachedAnsvarigaEnheter = [];
let mallId = null;
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

  // Lyssna på uppdateringar från dokument-mall.html (instansredigering)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.tempDokInstans) return;
    const nytt = changes.tempDokInstans.newValue;
    if (!nytt?.data || nytt.idx == null) return;
    const idx = nytt.idx;
    if (idx >= 0 && idx < ärendedokument.length) {
      ärendedokument[idx] = nytt.data;
      renderaDokument();
    }
  });
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

  // Omvalidera ärendedokument vid klassificeringsändring
  document.getElementById('mall-klass-select').addEventListener('change', () => renderaDokument());
  document.getElementById('mall-klass-recno').addEventListener('input', () => renderaDokument());
  document.getElementById('mall-klass-display').addEventListener('input', () => renderaDokument());

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
    try {
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
  if (inlästaAlternativ.projekt?.length > 0) {
    cacheUppdatering.cachedProjekt = inlästaAlternativ.projekt;
  }
  if (inlästaAlternativ.fastigheter?.length > 0) {
    cacheUppdatering.cachedFastigheter = inlästaAlternativ.fastigheter;
  }
  if (Object.keys(cacheUppdatering).length > 0) {
    await chrome.storage.local.set(cacheUppdatering);
  }

  // Typeahead-fält
  if (inlästaAlternativ.klassificeringar?.length > 0) {
    fyllTypeaheadSelect(TYPEAHEAD_KLASS, inlästaAlternativ.klassificeringar);
  }
  if (inlästaAlternativ.projekt?.length > 0) {
    fyllTypeaheadSelect(TYPEAHEAD_PROJEKT, inlästaAlternativ.projekt);
  }
  if (inlästaAlternativ.fastigheter?.length > 0) {
    fyllTypeaheadSelect(TYPEAHEAD_FASTIGHET, inlästaAlternativ.fastigheter);
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
  const personAntal = inlästaAlternativ.ansvarigaPersoner?.length ?? 0;
  const projektAntal = inlästaAlternativ.projekt?.length ?? 0;
  const fastighetsAntal = inlästaAlternativ.fastigheter?.length ?? 0;
  status.textContent = `✓ Inläst: ${inlästaAlternativ.diarieenheter.length} diarieenheter, ${delarkivAntal} delarkiv, ${inlästaAlternativ.ansvarigaEnheter.length} enheter, ${personAntal} personer, ${projektAntal} projekt, ${fastighetsAntal} fastigheter.`;
  knapp.disabled = false;
  knapp.textContent = 'Läs in igen';
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
  if (mall.projekt) {
    document.getElementById('mall-projekt-display').value = mall.projekt.display || '';
    document.getElementById('mall-projekt-recno').value = mall.projekt.value || '';
  }
  if (mall.fastighet) {
    document.getElementById('mall-fastighet-display').value = mall.fastighet.display || '';
    document.getElementById('mall-fastighet-recno').value = mall.fastighet.value || '';
  }

  if (mall.diarieenhet?.value) {
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

  // Migrera ärendedokument till instansformat (bakåtkompatibilitet)
  const råDokument = mall.ärendedokument || [];
  ärendedokument = [];
  let behöverSpara = false;
  for (const d of råDokument) {
    if (d.dokumentmallId && (d.titel || d.kategori || d.handlingstyp)) {
      ärendedokument.push(d);
    } else if (d.dokumentmallId) {
      const dm = sparadeDokumentmallar.find(m => m.id === d.dokumentmallId);
      if (dm) {
        const instans = JSON.parse(JSON.stringify(dm));
        instans.dokumentmallId = dm.id;
        delete instans.id;
        delete instans.skapad;
        instans.ändrad = Date.now();
        ärendedokument.push(instans);
        behöverSpara = true;
      } else {
        ärendedokument.push(d);
      }
    } else if (d.titel || d.handlingstyp) {
      const nyMall = {
        id: 'dokmall_migr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        namn: d.titel || '(Migrerad dokumentmall)',
        skapad: Date.now(),
        ändrad: Date.now(),
        ...d,
      };
      sparadeDokumentmallar.push(nyMall);
      const instans = JSON.parse(JSON.stringify(nyMall));
      instans.dokumentmallId = nyMall.id;
      delete instans.id;
      delete instans.skapad;
      ärendedokument.push(instans);
      behöverSpara = true;
    }
  }
  if (behöverSpara) {
    await chrome.storage.local.set({ dokumentmallar: sparadeDokumentmallar });
  }
  renderaDokument();
}
