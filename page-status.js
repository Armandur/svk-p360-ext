// page-status.js – Sätta och växla ärendestatus
// Körs i sidans MAIN world. Beror på: sleep, waitForIframe, waitForElement (page-utils.js)

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

  // Vänta tills Selectize hunnit initialiseras (max 2 s extra)
  const selectize = await new Promise(resolve => {
    const t = Date.now();
    const poll = setInterval(() => {
      if (select?.selectize) { clearInterval(poll); resolve(select.selectize); }
      if (Date.now() - t > 2000) { clearInterval(poll); resolve(null); }
    }, 50);
  });

  if (!select || !selectize) {
    alert('Statusfältet hittades inte.');
    return;
  }

  selectize.setValue(statusVärde);
  await sleep(400);

  const okBtn = iframe.contentDocument.getElementById('PlaceHolderMain_MainView_Finish-Button');
  if (!okBtn) {
    alert('OK-knappen hittades inte.');
    return;
  }
  okBtn.click();
}

/**
 * Växlar ärendets status mellan Öppet (5) och Avslutat (6).
 *
 * Öppnar statusdialogen, läser nuvarande värde och sätter det motsatta.
 * Om nuvarande status är något annat än Öppet sätts det alltid till Avslutat.
 */
async function växlaStatus() {
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

  const selectize = await new Promise(resolve => {
    const t = Date.now();
    const poll = setInterval(() => {
      if (select?.selectize) { clearInterval(poll); resolve(select.selectize); }
      if (Date.now() - t > 2000) { clearInterval(poll); resolve(null); }
    }, 50);
  });

  if (!select || !selectize) {
    alert('Statusfältet hittades inte.');
    return;
  }

  // Läs nuvarande värde och sätt det motsatta
  const nuvarandeVärde = select.value;
  const nyttVärde = nuvarandeVärde === '5' ? '6' : '5';
  selectize.setValue(nyttVärde);
  await sleep(400);

  const okBtn = iframe.contentDocument.getElementById('PlaceHolderMain_MainView_Finish-Button');
  if (!okBtn) {
    alert('OK-knappen hittades inte.');
    return;
  }
  okBtn.click();
}
