// content.js – körs i isolerat scope (ISOLATED world)
// Tar emot meddelanden från popup.js och vidarebefordrar till page.js via CustomEvents.

// Skydda mot dubbel-registrering vid programmatisk återinjicering
if (!window.__p360ContentInitierat) {
  window.__p360ContentInitierat = true;

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
   * Timeout efter 12 s för att undvika att meddelandekanalen hänger sig.
   */
  function anropaSidan(action, data = {}) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);

      const timer = setTimeout(() => {
        window.removeEventListener('p360-svar', hanterare);
        reject(new Error('Inget svar från sidan. Prova att ladda om fliken.'));
      }, 12000);

      const hanterare = (event) => {
        if (event.detail.id === id) {
          clearTimeout(timer);
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
}
