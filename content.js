// content.js – körs i isolerat scope (ISOLATED world)
// Tar emot meddelanden från popup.js och vidarebefordrar till page.js via CustomEvents.

/**
 * Kontrollerar om den aktiva sidan är en ärendesida i 360°.
 */
function ärPåÄrendesida() {
  return !!document.getElementById(
    'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
  );
}

/**
 * Skickar ett anrop till page.js (MAIN world) och väntar på svar via CustomEvent.
 */
function anropaSidan(action, data = {}) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);

    const hanterare = (event) => {
      if (event.detail.id === id) {
        window.removeEventListener('p360-svar', hanterare);
        resolve(event.detail);
      }
    };

    window.addEventListener('p360-svar', hanterare);
    window.dispatchEvent(new CustomEvent('p360-anrop', { detail: { id, action, data } }));
  });
}

// Tar emot meddelanden från popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!ärPåÄrendesida()) {
    sendResponse({ success: false, fel: 'Navigera till ett ärende i 360° först.' });
    return;
  }

  const data = request.action === 'sättStatus' ? { statusVärde: request.statusVärde } : {};

  anropaSidan(request.action, data)
    .then(svar => sendResponse(svar))
    .catch(err => sendResponse({ success: false, fel: err.message }));

  return true; // Håller meddelandekanalen öppen för async svar
});
