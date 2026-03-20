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
  } catch {
    // Content script saknas – injicera och försök en gång till
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
      // Ge scripts tid att registrera sina lyssnare
      await new Promise(r => setTimeout(r, 300));
      svar = await chrome.tabs.sendMessage(tab.id, meddelande);
    } catch {
      visaFel('Kunde inte kommunicera med sidan. Prova att ladda om fliken.');
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
  panel.style.display = '';
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

  let tab;
  try {
    tab = await chrome.tabs.create({
      url: 'https://p360.svenskakyrkan.se/locator/DMS/Case/New/61000',
    });
  } catch {
    visaFel('Kunde inte öppna ny flik.');
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

  // Skicka malldatan och lös in svar (fire-and-forget – sidan visar egna felmeddelanden)
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'skapaFrånMall', mall: mallMedTitel });
  } catch {
    // Scripts kanske inte hann – injicera och försök igen
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
      chrome.tabs.sendMessage(tab.id, { action: 'skapaFrånMall', mall: mallMedTitel });
    } catch { /* sidan visar eventuella fel */ }
  }

  window.close();
});

// Ny mall-knappen öppnar mallredigeringssidan
document.getElementById('btn-ny-mall').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('mall.html') });
  window.close();
});

// Ladda mallar direkt vid start
laddaMallar();

// ------------------------------------------------------------------
// Hjälpfunktion
// ------------------------------------------------------------------
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
