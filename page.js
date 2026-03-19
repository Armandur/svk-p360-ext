// page.js – körs i sidans eget JS-scope (MAIN world)
// Har direkt tillgång till sidans globala funktioner som __doPostBack och Selectize.
// Kommunicerar med content.js (ISOLATED world) via CustomEvents.

/**
 * Triggar en åtgärd via huvudmenyn i 360°.
 */
function anropaPostBack(nyckel) {
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu',
    nyckel
  );
}

/**
 * Öppnar dagboksbladet och triggar webbläsarens utskriftsdialog automatiskt.
 *
 * 360° öppnar rapporten via window.open med en URL som innehåller "Innehallsforteckning".
 * Vi fångar popup-referensen genom att tillfälligt patcha window.open, och väntar sedan
 * på att Report Viewer-elementet laddats klart innan popup.print() anropas.
 */
async function triggerDagboksblad() {
  // Patcha window.open för att fånga popup-referensen.
  // Återställs direkt vid första anropet så att övrig kod inte påverkas.
  let popup = null;
  const originalOpen = window.open;
  window.open = function (url, ...rest) {
    window.open = originalOpen;
    popup = originalOpen.call(window, url, ...rest);
    return popup;
  };

  anropaPostBack('key_innehallsforteckning');

  // Vänta tills window.open anropats (max 5 s) – sker via PostBack-svar
  const väntatPåOpen = await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      if (popup !== null) { clearInterval(check); resolve(true); }
      else if (Date.now() - start > 5000) {
        window.open = originalOpen; // säkerställ återställning vid timeout
        clearInterval(check); resolve(false);
      }
    }, 100);
  });

  if (!väntatPåOpen || !popup) {
    alert('Dagboksbladsfönstret öppnades inte. Kontrollera att popup-fönster är tillåtna i webbläsaren.');
    return;
  }

  // Vänta på att popup laddats klart och att Report Viewer-elementet finns.
  // Intervall: 300 ms, max timeout: 10 s
  const redo = await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      try {
        if (
          popup.document.readyState === 'complete' &&
          popup.document.getElementById('ctl00_PlaceHolderMain_MainView_ReportView')
        ) {
          clearInterval(check);
          resolve(true);
        } else if (Date.now() - start > 10000) {
          clearInterval(check);
          resolve(false);
        }
      } catch {
        // Popup stängd eller cross-origin-fel
        clearInterval(check);
        resolve(false);
      }
    }, 300);
  });

  if (!redo) {
    alert('Dagboksbladet laddades inte inom rimlig tid.');
    return;
  }

  popup.print();
}

/**
 * Öppnar "Sätt status"-dialogen via rätt PostBack beroende på URL-format.
 * Returnerar true om dialogen kunde triggas, annars false.
 *
 * 360° har två URL-format med olika PostBack-nycklar:
 * - /DMS/Case/Details/Simplified/... → CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK
 * - /view.aspx?id=...                → SetStatusButton_DetailFunctionControl
 */
function triggerSetStatusDialog() {
  if (document.getElementById(
    'PlaceHolderMain_MainView_CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK'
  )) {
    __doPostBack(
      'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK',
      ''
    );
    return true;
  }
  if (document.getElementById(
    'PlaceHolderMain_MainView_SetStatusButton_DetailFunctionControl'
  )) {
    __doPostBack(
      'ctl00$PlaceHolderMain$MainView$SetStatusButton_DetailFunctionControl',
      ''
    );
    return true;
  }
  return false;
}

/**
 * Väntar på att en iframe vars src innehåller urlFragment laddas färdigt.
 * Returnerar iframen eller null vid timeout.
 */
function waitForIframe(urlFragment, timeout = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const f = Array.from(document.querySelectorAll('iframe'))
        .find(f => f.src?.includes(urlFragment));
      if (f && f.contentDocument?.readyState === 'complete') {
        clearInterval(check);
        resolve(f);
      } else if (Date.now() - start > timeout) {
        clearInterval(check);
        resolve(null);
      }
    }, 200);
  });
}

/**
 * Väntar på att ett element matchar selector inuti ett givet document.
 * Returnerar elementet eller null vid timeout.
 */
function waitForElement(doc, selector, timeout = 3000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const el = doc.querySelector(selector);
      if (el) {
        clearInterval(check);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(check);
        resolve(null);
      }
    }, 100);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Öppnar "Sätt status"-dialogen och sätter valt statusvärde.
 *
 * Statusvärden: '5' = Öppet, '6' = Avslutat, '8' = Makulerat, '17' = Avslutat från handläggare
 */
async function sättStatus(statusVärde) {
  const opened = triggerSetStatusDialog();
  if (!opened) {
    alert('Hittade inte "Sätt status"-knappen på den här sidan.');
    return;
  }

  const iframe = await waitForIframe('EditCaseStatus', 8000);
  if (!iframe) {
    alert('Dialogen laddades inte inom rimlig tid.');
    return;
  }

  const select = await waitForElement(
    iframe.contentDocument,
    '#PlaceHolderMain_MainView_CaseStatusComboControl',
    3000
  );
  if (!select || !select.selectize) {
    alert('Statusfältet hittades inte.');
    return;
  }

  select.selectize.setValue(statusVärde);
  await sleep(400);

  const okBtn = iframe.contentDocument.getElementById('PlaceHolderMain_MainView_Finish-Button');
  if (!okBtn) {
    alert('OK-knappen hittades inte.');
    return;
  }
  okBtn.click();
}

// Tar emot anrop från content.js och skickar tillbaka svar
window.addEventListener('p360-anrop', async (event) => {
  const { id, action, data } = event.detail;

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

  try {
    if (action === 'sättStatus') {
      await sättStatus(data.statusVärde);
    } else if (action === 'dagboksblad') {
      await triggerDagboksblad();
    } else if (postbackNycklar[action]) {
      anropaPostBack(postbackNycklar[action]);
    } else {
      throw new Error('Okänd åtgärd: ' + action);
    }
    window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: true } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: false, fel: err.message } }));
  }
});
