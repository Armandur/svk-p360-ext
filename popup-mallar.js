// popup-mallar.js – ärendemallar, dokumentmallar, export/import och klassificeringsvalidering
// Beroenden: visaFel(), döljFelmeddelande(), skicka() från popup.js (laddas före detta skript)

// Mall som håller vald mall inför skapande
let valdMall = null;

// ------------------------------------------------------------------
// Mallhantering
// ------------------------------------------------------------------

/**
 * Laddar och renderar listan med sparade mallar.
 */
async function laddaMallar() {
  const { mallar = [] } = await chrome.storage.local.get('mallar');
  const lista = document.getElementById('malllista');
  const tomText = document.getElementById('tom-malllista');

  // Rensa befintliga rader (men behåll tom-malllista och panel)
  lista.querySelectorAll('.mall-rad').forEach(el => el.remove());

  if (mallar.length === 0) {
    tomText.style.display = '';
    return;
  }
  tomText.style.display = 'none';

  mallar.forEach(mall => {
    const rad = document.createElement('div');
    rad.className = 'mall-rad';
    rad.innerHTML = `
      <span class="mall-namn" title="${escHtml(mall.namn)}">${escHtml(mall.namn)}</span>
      <div class="mall-knappar">
        <button class="btn-använd" data-mall-id="${mall.id}">Använd</button>
        <button data-mall-redigera="${mall.id}" title="Redigera">✎</button>
        <button data-mall-ta-bort="${mall.id}" title="Ta bort">✕</button>
      </div>
    `;
    lista.appendChild(rad);
  });

  // Händelsehanterare för knappar i listan
  lista.querySelectorAll('.btn-använd').forEach(btn => {
    btn.addEventListener('click', () => {
      const mall = mallar.find(m => m.id === btn.dataset.mallId);
      if (mall) visaTitelPanel(mall);
    });
  });

  lista.querySelectorAll('[data-mall-redigera]').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('mall.html') + '?id=' + btn.dataset.mallRedigera,
      });
      window.close();
    });
  });

  lista.querySelectorAll('[data-mall-ta-bort]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { mallar: lista = [] } = await chrome.storage.local.get('mallar');
      const nya = lista.filter(m => m.id !== btn.dataset.mallTaBort);
      await chrome.storage.local.set({ mallar: nya });
      laddaMallar();
    });
  });
}

/**
 * Visar titelpanelen för att justera titel innan skapande.
 */
function visaTitelPanel(mall) {
  valdMall = mall;
  const panel = document.getElementById('mall-titel-panel');
  const input = document.getElementById('mall-titel-input');
  input.value = mall.titel || '';
  panel.style.display = 'block';
  input.focus();
  input.select();
}

// Stäng titelpanelen
document.getElementById('btn-avbryt-panel').addEventListener('click', () => {
  document.getElementById('mall-titel-panel').style.display = 'none';
  valdMall = null;
});

// Skapa ärende från mall
document.getElementById('btn-skapa-ärende').addEventListener('click', async () => {
  if (!valdMall) return;
  döljFelmeddelande();

  const titel = document.getElementById('mall-titel-input').value.trim();
  const mallMedTitel = { ...valdMall, titel };

  // Hitta en befintlig 360°-flik – page.js öppnar formuläret som en overlay-iframe
  // inuti den fliken, vilket kringgår att /locator/DMS/Case/New/61000 avvisar GET-anrop.
  const [tab] = await chrome.tabs.query({ url: 'https://p360.svenskakyrkan.se/*' });
  if (!tab) {
    visaFel('Öppna 360° i en webbläsarflik innan du skapar ärende från mall.');
    return;
  }

  // Aktivera fliken så att användaren ser formuläret fyllas i
  chrome.tabs.update(tab.id, { active: true });

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'skapaFrånMall', mall: mallMedTitel });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'], world: 'ISOLATED' });
      await new Promise(r => setTimeout(r, 400));
      chrome.tabs.sendMessage(tab.id, { action: 'skapaFrånMall', mall: mallMedTitel });
    } catch { /* page.js visar egna felmeddelanden */ }
  }

  window.close();
});

// Ny mall-knappen öppnar mallredigeringssidan
document.getElementById('btn-ny-mall').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('mall.html') });
  window.close();
});

// ------------------------------------------------------------------
// Exportera / importera mallar
// ------------------------------------------------------------------

let importData = null;

document.getElementById('btn-exportera-mallar').addEventListener('click', async () => {
  döljFelmeddelande();
  const data = await chrome.storage.local.get(['mallar', 'dokumentmallar']);
  const mallar = data.mallar || [];
  const dokumentmallar = data.dokumentmallar || [];
  if (!mallar.length && !dokumentmallar.length) {
    visaFel('Inga mallar att exportera.');
    return;
  }
  const json = JSON.stringify({ mallar, dokumentmallar }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `360-mallar-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('btn-importera-mallar').addEventListener('click', () => {
  döljFelmeddelande();
  document.getElementById('import-fil-input').click();
});

document.getElementById('import-fil-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    visaFel('Filen är inte giltig JSON.');
    return;
  }

  if (!Array.isArray(data.mallar) && !Array.isArray(data.dokumentmallar)) {
    visaFel('Filen verkar inte vara en exportfil från 360° Hjälptillägg.');
    return;
  }

  importData = data;
  const nrM = (data.mallar || []).length;
  const nrD = (data.dokumentmallar || []).length;
  document.getElementById('import-info').textContent =
    `${nrM} ärendemallar och ${nrD} dokumentmallar hittades i filen. ` +
    '"Slå samman" lägger till nya och behåller befintliga. "Ersätt allt" tar bort allt befintligt.';
  document.getElementById('import-panel').style.display = '';
});

document.getElementById('btn-import-avbryt').addEventListener('click', () => {
  importData = null;
  document.getElementById('import-panel').style.display = 'none';
});

document.getElementById('btn-import-samman').addEventListener('click', async () => {
  if (!importData) return;
  await slutförImport(importData, 'samman');
});

document.getElementById('btn-import-ersätt').addEventListener('click', async () => {
  if (!importData) return;
  await slutförImport(importData, 'ersätt');
});

async function slutförImport(data, läge) {
  let mallar, dokumentmallar;

  if (läge === 'ersätt') {
    mallar = data.mallar || [];
    dokumentmallar = data.dokumentmallar || [];
  } else {
    const befintliga = await chrome.storage.local.get(['mallar', 'dokumentmallar']);
    const befMallar = befintliga.mallar || [];
    const befDokMallar = befintliga.dokumentmallar || [];
    const befMallIds = new Set(befMallar.map(m => m.id));
    const befDokIds = new Set(befDokMallar.map(m => m.id));
    mallar = [...befMallar, ...(data.mallar || []).filter(m => !befMallIds.has(m.id))];
    dokumentmallar = [...befDokMallar, ...(data.dokumentmallar || []).filter(m => !befDokIds.has(m.id))];
  }

  await chrome.storage.local.set({ mallar, dokumentmallar });
  importData = null;
  document.getElementById('import-panel').style.display = 'none';
  await laddaMallar();
  await laddaDokumentmallar();
}

// ------------------------------------------------------------------
// Dokumentmallhantering
// ------------------------------------------------------------------

/**
 * Laddar och renderar listan med sparade dokumentmallar.
 */
async function laddaDokumentmallar() {
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const lista = document.getElementById('dokumentmalllista');
  const tomText = document.getElementById('tom-dokumentmalllista');

  lista.querySelectorAll('.mall-rad').forEach(el => el.remove());

  if (dokumentmallar.length === 0) {
    tomText.style.display = '';
    return;
  }
  tomText.style.display = 'none';

  dokumentmallar.forEach(dm => {
    const tomma = tommaObligatoriska(dm);
    const rad = document.createElement('div');
    rad.className = 'mall-rad';
    rad.innerHTML = `
      <span class="mall-namn" title="${escHtml(dm.namn)}${tomma.length ? '\n⚠ Saknar: ' + tomma.join(', ') : ''}">
        ${escHtml(dm.namn)}${tomma.length ? ' <span style="color:#b36b00;font-size:11px;">⚠</span>' : ''}
      </span>
      <div class="mall-knappar">
        <button class="btn-använd" data-dokmall-id="${dm.id}">Använd</button>
        <button data-dokmall-redigera="${dm.id}" title="Redigera">✎</button>
        <button data-dokmall-ta-bort="${dm.id}" title="Ta bort">✕</button>
      </div>
    `;
    lista.appendChild(rad);
  });

  // Använd – skapa dokument på aktuellt ärende
  lista.querySelectorAll('.btn-använd[data-dokmall-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      döljFelmeddelande();
      const dm = dokumentmallar.find(m => m.id === btn.dataset.dokmallId);
      if (!dm) return;
      // Skicka dokumentmallen som ett dokument att skapa
      await skicka({ action: 'skapaÄrendedokument', dokument: [dm] });
    });
  });

  lista.querySelectorAll('[data-dokmall-redigera]').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('dokument-mall.html') + '?id=' + btn.dataset.dokmallRedigera,
      });
      window.close();
    });
  });

  lista.querySelectorAll('[data-dokmall-ta-bort]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { dokumentmallar: lista = [] } = await chrome.storage.local.get('dokumentmallar');
      const nya = lista.filter(m => m.id !== btn.dataset.dokmallTaBort);
      await chrome.storage.local.set({ dokumentmallar: nya });
      laddaDokumentmallar();
    });
  });
}

// Ny dokumentmall-knappen
document.getElementById('btn-ny-dokumentmall').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dokument-mall.html') });
  window.close();
});

// Ladda mallar direkt vid start
laddaMallar();
laddaDokumentmallar();

// ------------------------------------------------------------------
// Klassificeringsvalidering för dokumentmallar
// ------------------------------------------------------------------

/**
 * Läser ärendets klassificering från den aktiva 360°-fliken.
 * Kör ett litet script i sidans DOM för att hämta texten.
 * @returns {string|null} Klassificeringskod (t.ex. "2.4") eller null.
 */
async function hämtaÄrendeKlassificering() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith('https://p360.svenskakyrkan.se/')) return null;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const el = document.getElementById(
          'PlaceHolderMain_MainView_RightFolderView1_ViewControl_EditClassCodeTextFieldControl'
        );
        return el ? el.textContent.trim() : null;
      },
    });
    if (!result?.result) return null;

    // "2.4 - Administrera IT och telefoni" → "2.4"
    const match = result.result.match(/^([\d.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Uppdaterar dokumentmallistan med varningar om handlingstypen
 * inte matchar ärendets klassificering.
 */
async function visaKlassificeringsvarningar() {
  const ärendeKlass = await hämtaÄrendeKlassificering();
  if (!ärendeKlass) return; // Detaljpanelen ihopfälld eller inte på ärendesida

  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  const lista = document.getElementById('dokumentmalllista');

  for (const dm of dokumentmallar) {
    if (!dm.handlingstyp?.text) continue;

    // Extrahera klassificeringskod ur handlingstyp-text: "2.4-8 (...)" → "2.4"
    const match = dm.handlingstyp.text.match(/^([\d.]+)/);
    const mallKlass = match ? match[1] : null;
    if (!mallKlass || mallKlass === ärendeKlass) continue;

    // Hitta raden för denna mall
    const btn = lista.querySelector(`[data-dokmall-id="${dm.id}"]`);
    if (!btn) continue;
    const rad = btn.closest('.mall-rad');
    if (!rad) continue;

    // Lägg till varningsrad under mallnamnet
    if (!rad.querySelector('.ht-varning')) {
      const varning = document.createElement('div');
      varning.className = 'ht-varning';
      varning.style.cssText =
        'font-size:11px;color:#b36b00;margin-top:2px;line-height:1.3;';
      varning.textContent =
        `⚠ Handlingstyp (${mallKlass}) matchar inte ärendet (${ärendeKlass})`;
      const namnEl = rad.querySelector('.mall-namn');
      if (namnEl) namnEl.appendChild(varning);
    }
  }
}

// Kör klassificeringsvalidering efter att dokumentmallar laddats
setTimeout(async () => {
  const klass = await hämtaÄrendeKlassificering();
  if (klass) {
    visaKlassificeringsvarningar();
  } else {
    // Detaljpanelen kan vara ihopfälld – visa tips
    const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
    if (dokumentmallar.some(dm => dm.handlingstyp?.text)) {
      const lista = document.getElementById('dokumentmalllista');
      if (lista && !lista.querySelector('.klass-tips')) {
        const tips = document.createElement('div');
        tips.className = 'klass-tips';
        tips.style.cssText =
          'font-size:11px;color:#777;padding:4px 8px;margin-top:4px;' +
          'border-top:1px solid #eee;line-height:1.3;';
        tips.textContent = 'Tips: Fäll ut detaljpanelen på ärendet för att se varningar om handlingstyp.';
        lista.appendChild(tips);
      }
    }
  }
}, 100);

// ------------------------------------------------------------------
// Hjälpfunktioner
// ------------------------------------------------------------------

/**
 * Returnerar lista med obligatoriska dokumentfält som saknar värde.
 */
function tommaObligatoriska(dm) {
  const t = [];
  if (!dm.titel) t.push('Titel');
  if (!dm.handlingstyp?.value) t.push('Handlingstyp');
  if (!dm.kategori) t.push('Dokumentkategori');
  if (!dm.atkomstgrupp?.value) t.push('Åtkomstgrupp');
  if (!dm.ansvarigEnhet?.value) t.push('Ansvarig enhet');
  if (dm.skyddskod && dm.skyddskod !== '0' && !dm.sekretessParag) t.push('Paragraf');
  return t;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
