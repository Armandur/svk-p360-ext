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

  // Vänta på att popup laddats klart och att $find returnerar Report Viewer-instansen.
  // $find är en global funktion i popup-fönstret (inte i huvudfönstret).
  // Intervall: 300 ms, max timeout: 10 s
  const rv = await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      try {
        if (popup.document.readyState === 'complete' && typeof popup.$find === 'function') {
          const instans = popup.$find('ctl00_PlaceHolderMain_MainView_ReportView');
          if (instans) { clearInterval(check); resolve(instans); }
        }
        if (Date.now() - start > 10000) { clearInterval(check); resolve(null); }
      } catch {
        // Popup stängd eller cross-origin-fel
        clearInterval(check);
        resolve(null);
      }
    }, 300);
  });

  if (!rv) {
    alert('Dagboksbladet laddades inte inom rimlig tid.');
    return;
  }

  // Visa utskriftsdialogen – skapar .msrs-printdialog-downloadlink med tom href
  rv.invokePrintDialog();

  // Vänta på att Print-knappen och download-länken renderats (max 8 s)
  const printKnapp = await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      try {
        const btn = popup.document.querySelector('.msrs-printdialog-divprintbutton');
        if (btn) { clearInterval(check); resolve(btn); }
      } catch { /* popup stängd */ }
      if (Date.now() - start > 8000) { clearInterval(check); resolve(null); }
    }, 150);
  });

  if (!printKnapp) {
    alert('Kunde inte hitta utskriftsknappen i dagboksbladet.');
    return;
  }

  // Klicka Print – MSRS genererar PDF:en och populerar download-länkens href
  printKnapp.click();

  // Polla tills download-länken har fått ett href med PDF-URL:en (max 20 s)
  const pdfUrl = await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      try {
        const dl = popup.document.querySelector('.msrs-printdialog-downloadlink');
        if (dl?.href?.includes('.axd')) { clearInterval(check); resolve(dl.href); }
      } catch { /* popup stängd */ }
      if (Date.now() - start > 20000) { clearInterval(check); resolve(null); }
    }, 150);
  });

  if (!pdfUrl) {
    alert('Kunde inte hämta PDF:en från dagboksbladet.');
    return;
  }

  // Hämta PDF:en som blob med sessionscookies – kringgår Content-Disposition: attachment
  // som servern sätter på .axd-URL:en. Blob-URL:er öppnas alltid inline i Chrome.
  let blobUrl;
  try {
    const resp = await fetch(pdfUrl, { credentials: 'include' });
    const blob = await resp.blob();
    blobUrl = URL.createObjectURL(blob);
  } catch {
    alert('Kunde inte ladda PDF:en.');
    return;
  }

  popup.close();
  window.open(blobUrl, '_blank');
}

/**
 * Sätter status på ärendet direkt via HTTP GET + POST mot dialog-URL:en,
 * utan att öppna den synliga dialogen. Laddar om sidan efter lyckat sparande.
 *
 * Flöde:
 *   1. GET dialog-URL → hämtar formulär med VIEWSTATE och alla dolda fält
 *   2. POST tillbaka med nytt statusvärde + simulerat OK-klick
 *   3. Kontrollera att svaret innehåller commonModalDialogClose → ladda om sidan
 *
 * Statusvärden: '5' = Öppet, '6' = Avslutat, '8' = Makulerat, '17' = Avslutat från handläggare
 */
async function sättStatus(statusVärde) {
  const params = new URLSearchParams(window.location.search);
  const recno = params.get('recno');
  if (!recno) {
    alert('Kunde inte läsa ärendets recno från URL:en.');
    return;
  }

  // Extrahera subtype från query-parametern eller URL-sökvägen
  const subtype = params.get('subtype') ||
    window.location.pathname.match(/Simplified\/([^/?]+)/)?.[1] || '';

  // UUID för dialog-vyn "Sätt status" i P360 (troligen stabil för Svenska kyrkan).
  const dialogUuid = '886CBB26-06CA-4BDB-B3F7-09D19094B426';

  const kontextData = [
    `subtype,Primary,${subtype}`,
    `recno,Primary,${recno}`,
    `dialogHeight,Primary,450px`,
    `dialogCaption,Primary,Sätt status`,
    `dialogTitle,Primary,360°`,
    `dialog,Primary,modal`,
    `dialogOpenMode,Primary,spdialog`,
    `dialogCloseMode,Primary,spdialog`,
    `IsDlg,Primary,1`,
    `name,Primary,DMS.Dialog.EditCaseStatus`,
  ].join(';');

  const dialogUrl = `/view.aspx?id=${dialogUuid}` +
    `&dialogmode=true&IsDlg=1&dialogOpenMode=spdialog&dialogHeight=450px` +
    `&dialogTitle=360%c2%b0&dialog=modal&dialogCloseMode=spdialog` +
    `&context-data=${encodeURIComponent(kontextData)}`;

  // Steg 1: GET – hämta formuläret med VIEWSTATE och alla dolda fält
  let html;
  try {
    const svar = await fetch(dialogUrl, { credentials: 'include' });
    if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
    html = await svar.text();
  } catch (err) {
    alert(`Kunde inte ladda statusdialogen: ${err.message}`);
    return;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form');
  if (!form) {
    alert('Hittade inte formuläret i statusdialogen.');
    return;
  }

  // Steg 2: Bygg POST-body från formulärets alla fält (VIEWSTATE m.fl. fångas automatiskt)
  const body = new URLSearchParams();
  for (const el of form.querySelectorAll('input, select, textarea')) {
    if (el.name) body.set(el.name, el.value ?? '');
  }

  // Sätt rätt statusvärde och simulera klick på OK-knappen
  body.set('ctl00$PlaceHolderMain$MainView$CaseStatusComboControl', statusVärde);
  body.set('__EVENTTARGET', 'ctl00$PlaceHolderMain$MainView$Finish-Button');
  body.set('__EVENTARGUMENT', '');
  body.set('ctl00$PlaceHolderMain$MainView$Finish-Button', 'OK');

  // Steg 3: POST
  let respText;
  try {
    const svar = await fetch(dialogUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
    respText = await svar.text();
  } catch (err) {
    alert(`Statusändringen misslyckades: ${err.message}`);
    return;
  }

  // 360° returnerar SP.UI.ModalDialog.commonModalDialogClose(...) vid lyckat sparande
  if (!respText.includes('commonModalDialogClose')) {
    alert('Statusändringen verkar inte ha sparats. Kontrollera ärendet manuellt.');
    return;
  }

  location.reload();
}

// Skydda mot dubbel-registrering vid programmatisk återinjicering
if (!window.__p360Initierat) {
  window.__p360Initierat = true;

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
} // slut: window.__p360Initierat
