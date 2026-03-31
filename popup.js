// popup.js – kärnlogik: felvisning, flikvalidering, meddelandeskickning och knapphantering
// Mallhantering, dokumentmallar, export/import och klassificering: popup-mallar.js
// Filuppladdning (enskild och batch): popup-fil.js

/**
 * Visar ett felmeddelande fixerat längst upp i popupen.
 */
function visaFel(meddelande) {
  const el = document.getElementById('felmeddelande');
  document.getElementById('felmeddelande-text').textContent = meddelande;
  el.style.display = 'block';
}

function döljFelmeddelande() {
  document.getElementById('felmeddelande').style.display = 'none';
}

document.getElementById('felmeddelande-stang').addEventListener('click', döljFelmeddelande);

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
    // Content script saknas – injicera content.js (MAIN-world-filer laddas av manifest)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
        world: 'ISOLATED',
      });
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

// Massregistrering – öppna batch.html
document.getElementById('btn-massregistrering').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('batch.html') });
});
