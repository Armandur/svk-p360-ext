// popup.js – hanterar knappklick i popup-fönstret

/**
 * Visar ett felmeddelande i popupen istället för alert.
 */
function visaFel(meddelande) {
  const el = document.getElementById('felmeddelande');
  el.textContent = meddelande;
  el.style.display = 'block';
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
 */
async function skicka(meddelande) {
  const tab = await hämtaAktivFlik();
  if (!tab) return;

  let svar;
  try {
    svar = await chrome.tabs.sendMessage(tab.id, meddelande);
  } catch {
    visaFel('Kunde inte kommunicera med sidan. Prova att ladda om fliken.');
    return;
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
    skicka({ action: knapp.dataset.action });
  });
});

// Sätt status-knappen skickar med valt statusvärde
document.getElementById('btn-sätt-status').addEventListener('click', () => {
  const statusVärde = document.getElementById('status-val').value;
  skicka({ action: 'sättStatus', statusVärde });
});
