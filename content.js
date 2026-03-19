// content.js – injiceras på p360.svenskakyrkan.se
// Tillhandahåller hjälpfunktioner som anropas från popup.js via chrome.scripting

/**
 * Kontrollerar om den aktiva sidan är en ärendesida i 360°.
 * Returnerar true om dagboksblad-länken finns i DOM.
 */
function ärPåÄrendesida() {
  return !!document.getElementById(
    'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
  );
}

/**
 * Anropar __doPostBack med given nyckel.
 * Förutsätter att vi är på en ärendesida.
 */
function anropaPostBack(nyckel) {
  // __doPostBack är global på alla 360°-sidor (ASP.NET WebForms)
  // eslint-disable-next-line no-undef
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu',
    nyckel
  );
}

// Lyssnar på meddelanden från popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!ärPåÄrendesida()) {
    sendResponse({ success: false, fel: 'Navigera till ett ärende i 360° först.' });
    return;
  }

  const postbackNycklar = {
    dagboksblad:        'key_innehallsforteckning',
    redigeraEgenskaper: 'EditCase',
    registreraUtlaning: 'RegisterLoan',
    gallring:           'SetScrapCode',
    sparaSomNytt:       'SaveCaseAsNew',
    kopieraHyperlank:   'CopyHyperLink',
    arendesammanfattning: 'OrderCaseSummary',
    processplan:        'AddProgressPlan',
  };

  const nyckel = postbackNycklar[request.action];
  if (nyckel) {
    anropaPostBack(nyckel);
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, fel: 'Okänd åtgärd: ' + request.action });
  }
});
