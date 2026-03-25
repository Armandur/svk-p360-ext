// popup.js – hanterar knappklick i popup-fönstret

// Mall som håller vald mall inför skapande
let valdMall = null;

/**
 * Visar ett felmeddelande i popupen istället för alert.
 */
function visaFel(meddelande) {
  const el = document.getElementById('felmeddelande');
  el.textContent = meddelande;
  el.style.display = 'block';
}

function döljFelmeddelande() {
  document.getElementById('felmeddelande').style.display = 'none';
}

/**
 * Hämtar aktiv flik och kontrollerar att vi är på rätt domän.
 * Returnerar tab-objektet eller null.
 */
async function hämtaAktivFlik() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    visaFel('Kunde inte hämta aktiv flik.');
    return null;
  }
  if (!tab.url || !tab.url.startsWith('https://p360.svenskakyrkan.se/')) {
    visaFel('Öppna ett ärende i 360° innan du använder det här verktyget.');
    return null;
  }
  return tab;
}

/**
 * Skickar ett meddelande till content.js via tabs.sendMessage och
 * hanterar svaret. Stänger popupen vid lyckat resultat.
 *
 * Om content.js inte är aktivt (t.ex. direkt efter sidladdning) injiceras
 * scripts programmatiskt och ett nytt försök görs automatiskt.
 */
async function skicka(meddelande) {
  const tab = await hämtaAktivFlik();
  if (!tab) return;

  let svar;
  try {
    svar = await chrome.tabs.sendMessage(tab.id, meddelande);
  } catch (err1) {
    // Content script saknas – injicera content.js (MAIN-world-filer laddas av manifest)
    console.log('[p360-popup] sendMessage misslyckades:', err1.message, '– försöker injicera content.js');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
        world: 'ISOLATED',
      });
      console.log('[p360-popup] content.js injicerad, väntar 300ms…');
      await new Promise(r => setTimeout(r, 300));
      svar = await chrome.tabs.sendMessage(tab.id, meddelande);
    } catch (err2) {
      console.error('[p360-popup] Fallback misslyckades:', err2.message);
      visaFel('Kunde inte kommunicera med sidan: ' + err2.message);
      return;
    }
  }

  if (svar?.success) {
    window.close();
  } else {
    visaFel(svar?.fel ?? 'Något gick fel. Kontrollera att du är på ett ärende.');
  }
}

// Koppla alla knappar via data-action-attributet
document.querySelectorAll('button[data-action]').forEach((knapp) => {
  knapp.addEventListener('click', () => {
    döljFelmeddelande();
    skicka({ action: knapp.dataset.action });
  });
});

// Sätt status-knappen skickar med valt statusvärde
document.getElementById('btn-sätt-status').addEventListener('click', () => {
  döljFelmeddelande();
  const statusVärde = document.getElementById('status-val').value;
  skicka({ action: 'sättStatus', statusVärde });
});


// Hjälplänken öppnar help.html i en ny flik
document.getElementById('hjalp-lank').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
});

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
// Hjälpfunktion
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

document.getElementById('btn-ladda-upp-filer').addEventListener('click', () => {
  döljFelmeddelande();
  document.getElementById('fil-input').click();
});

document.getElementById('fil-input').addEventListener('change', async (e) => {
  const filer = Array.from(e.target.files);
  if (filer.length === 0) return;

  const filStatus = document.getElementById('fil-status');
  filStatus.style.display = '';
  filStatus.textContent = `Förbereder ${filer.length} fil(er)…`;

  try {
    const filData = [];
    for (const f of filer) {
      filStatus.textContent = `Läser ${f.name}…`;
      const base64 = await filTillBase64(f);
      filData.push({ namn: f.name, typ: f.type, base64 });
    }

    filStatus.textContent = `Skickar ${filer.length} fil(er) till 360°…`;
    await skickaFilDokument([{ filerBase64: filData }]);

    filStatus.textContent = '';
    filStatus.style.display = 'none';
  } catch (err) {
    filStatus.textContent = 'Fel: ' + err.message;
    filStatus.style.color = '#c0392b';
  }

  e.target.value = '';
});

// ------------------------------------------------------------------
// Batch-uppladdning: en fil per ärendedokument
// ------------------------------------------------------------------

let batchFiler = [];

document.getElementById('btn-batch-upload').addEventListener('click', () => {
  döljFelmeddelande();
  document.getElementById('batch-fil-input').click();
});

document.getElementById('batch-fil-input').addEventListener('change', async (e) => {
  batchFiler = Array.from(e.target.files);
  if (batchFiler.length === 0) return;

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

  e.target.value = '';
});

document.getElementById('btn-batch-avbryt').addEventListener('click', () => {
  document.getElementById('batch-panel').style.display = 'none';
  batchFiler = [];
});

document.getElementById('btn-batch-starta').addEventListener('click', async () => {
  if (batchFiler.length === 0) return;
  döljFelmeddelande();

  const filStatus = document.getElementById('fil-status');
  filStatus.style.display = '';
  filStatus.style.color = '#555';

  const mallId = document.getElementById('batch-mall-val').value;
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

  const dokument = [];
  for (let i = 0; i < batchFiler.length; i++) {
    const f = batchFiler[i];
    filStatus.textContent = `Läser fil ${i + 1}/${batchFiler.length}: ${f.name}…`;
    const base64 = await filTillBase64(f);

    const dok = {
      ...mallData,
      filerBase64: [{ namn: f.name, typ: f.type, base64 }],
    };
    if (!dok.titel) {
      dok.titel = f.name.replace(/\.[^.]+$/, '');
    }
    dokument.push(dok);
  }

  filStatus.textContent = `Skickar ${dokument.length} ärendedokument till 360°…`;

  document.getElementById('batch-panel').style.display = 'none';
  batchFiler = [];

  try {
    await skickaFilDokument(dokument);
    filStatus.textContent = '';
    filStatus.style.display = 'none';
  } catch (err) {
    filStatus.textContent = 'Fel: ' + err.message;
    filStatus.style.color = '#c0392b';
  }
});
