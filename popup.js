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
 * Skickar en åtgärd till content.js på aktiv flik och stänger popupen.
 */
async function skickaÅtgärd(action) {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    visaFel('Kunde inte hämta aktiv flik.');
    return;
  }

  // Kontrollera att vi är på rätt domän
  if (!tab.url || !tab.url.startsWith('https://p360.svenskakyrkan.se/')) {
    visaFel('Öppna ett ärende i 360° innan du använder det här verktyget.');
    return;
  }

  let svar;
  try {
    [svar] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (actionName) => {
        // Skickar meddelande till content.js som redan är injicerat
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: actionName }, resolve);
        });
      },
      args: [action],
    });
  } catch {
    visaFel('Kunde inte kommunicera med sidan. Är du på en ärendesida?');
    return;
  }

  if (svar?.result?.success) {
    window.close();
  } else {
    visaFel(svar?.result?.fel ?? 'Något gick fel. Kontrollera att du är på ett ärende.');
  }
}

/**
 * Skickar sätt-status-åtgärd med valt statusvärde.
 */
async function skickaStatusÅtgärd() {
  const statusVärde = document.getElementById('status-val').value;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    visaFel('Kunde inte hämta aktiv flik.');
    return;
  }

  if (!tab.url || !tab.url.startsWith('https://p360.svenskakyrkan.se/')) {
    visaFel('Öppna ett ärende i 360° innan du använder det här verktyget.');
    return;
  }

  let svar;
  try {
    [svar] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (värde) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'sättStatus', statusVärde: värde }, resolve);
        });
      },
      args: [statusVärde],
    });
  } catch {
    visaFel('Kunde inte kommunicera med sidan. Är du på en ärendesida?');
    return;
  }

  if (svar?.result?.success) {
    window.close();
  } else {
    visaFel(svar?.result?.fel ?? 'Något gick fel. Kontrollera att du är på ett ärende.');
  }
}

// Koppla alla knappar via data-action-attributet
document.querySelectorAll('button[data-action]').forEach((knapp) => {
  knapp.addEventListener('click', () => {
    skickaÅtgärd(knapp.dataset.action);
  });
});

// Sätt status-knappen har eget flöde med dropdown
document.getElementById('btn-sätt-status').addEventListener('click', skickaStatusÅtgärd);
