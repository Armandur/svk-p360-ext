// content.js – injiceras på p360.svenskakyrkan.se (körs i isolerat scope)
// Sidans egna JS-funktioner (t.ex. __doPostBack) nås via script-injektion i sidans DOM.

/**
 * Injicerar och kör JavaScript-kod i sidans eget scope (MAIN world).
 * Används för att anropa sidfunktioner som __doPostBack och Selectize.
 */
function körIPageScope(kod, doc = document) {
  const script = doc.createElement('script');
  script.textContent = kod;
  doc.documentElement.appendChild(script);
  script.remove();
}

/**
 * Kontrollerar om den aktiva sidan är en ärendesida i 360°.
 */
function ärPåÄrendesida() {
  return !!document.getElementById(
    'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
  );
}

/**
 * Triggar en åtgärd via huvudmenyn i 360° (MainContextMenu).
 */
function anropaPostBack(nyckel) {
  körIPageScope(
    `__doPostBack(
      'ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu',
      ${JSON.stringify(nyckel)}
    )`
  );
}

/**
 * Öppnar "Sätt status"-dialogen (iframe) och väljer angett statusvärde.
 */
async function sättStatus(statusVärde) {
  // Öppna dialogen – anropas via en dold länk, inte MainContextMenu
  körIPageScope(
    `__doPostBack(
      'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK',
      ''
    )`
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
  if (!doc.getElementById('PlaceHolderMain_MainView_CaseStatusComboControl')) {
    throw new Error('Hittade inte statusfältet i dialogen.');
  }

  // Sätt värdet via Selectize.js (körs i iframens page scope) och klicka OK
  körIPageScope(
    `(function() {
      var select = document.getElementById('PlaceHolderMain_MainView_CaseStatusComboControl');
      if (select && select.selectize) {
        select.selectize.setValue(${JSON.stringify(statusVärde)});
      } else if (select) {
        select.value = ${JSON.stringify(statusVärde)};
      }
      var okKnapp = document.getElementById('PlaceHolderMain_MainView_Finish-Button');
      if (okKnapp) okKnapp.click();
    })()`,
    doc
  );
}

// Lyssnar på meddelanden från popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!ärPåÄrendesida()) {
    sendResponse({ success: false, fel: 'Navigera till ett ärende i 360° först.' });
    return;
  }

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
