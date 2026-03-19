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

/**
 * Öppnar "Sätt status"-dialogen (iframe) och väljer angett statusvärde.
 * Dialogen laddas asynkront, så vi pollar tills iframen är redo.
 */
async function sättStatus(statusVärde) {
  // Öppna dialogen via dold PostBack-länk (ej MainContextMenu)
  // eslint-disable-next-line no-undef
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK',
    ''
  );

  // Vänta på att iframen med EditCaseStatus laddas färdigt (max 10 s)
  const iframe = await new Promise((resolve, reject) => {
    const startTid = Date.now();
    const kontroll = setInterval(() => {
      const funnen = Array.from(document.querySelectorAll('iframe'))
        .find(f => f.src && f.src.includes('EditCaseStatus'));
      if (funnen && funnen.contentDocument?.readyState === 'complete') {
        clearInterval(kontroll);
        resolve(funnen);
      } else if (Date.now() - startTid > 10000) {
        clearInterval(kontroll);
        reject(new Error('Dialogen laddades inte i tid.'));
      }
    }, 200);
  });

  const doc = iframe.contentDocument;
  const select = doc.getElementById('PlaceHolderMain_MainView_CaseStatusComboControl');

  if (!select) {
    throw new Error('Hittade inte statusfältet i dialogen.');
  }

  // Selectize.js wrapprar native select – sätt värdet via API:et om möjligt
  if (select.selectize) {
    select.selectize.setValue(statusVärde);
  } else {
    select.value = statusVärde;
  }

  // Klicka OK-knappen för att spara
  doc.getElementById('PlaceHolderMain_MainView_Finish-Button')?.click();
}

// Lyssnar på meddelanden från popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!ärPåÄrendesida()) {
    sendResponse({ success: false, fel: 'Navigera till ett ärende i 360° först.' });
    return;
  }

  // Sätt status är ett asynkront flöde med iframe
  if (request.action === 'sättStatus') {
    sättStatus(request.statusVärde)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, fel: err.message }));
    return true; // Håller meddelandekanalen öppen för async svar
  }

  const postbackNycklar = {
    dagboksblad:          'key_innehallsforteckning',
    redigeraEgenskaper:   'EditCase',
    registreraUtlaning:   'RegisterLoan',
    gallring:             'SetScrapCode',
    sparaSomNytt:         'SaveCaseAsNew',
    kopieraHyperlank:     'CopyHyperLink',
    arendesammanfattning: 'OrderCaseSummary',
    processplan:          'AddProgressPlan',
  };

  const nyckel = postbackNycklar[request.action];
  if (nyckel) {
    anropaPostBack(nyckel);
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, fel: 'Okänd åtgärd: ' + request.action });
  }
});
