// page-document-upload.js – Filuppladdning till ärendedokument
// Körs i sidans MAIN world. Beror på: sleep, waitForElement (page-utils.js)
// Laddas före page-document-create.js.

/**
 * Laddar upp filer till ett öppet dokumentformulär.
 * Navigerar till Filer-fliken, laddar upp via XHR till FileUpload.ashx,
 * sätter hidden field och triggar PostBack. Navigerar sedan tillbaka till
 * Generellt-fliken.
 *
 * VIKTIGT: Anropa FÖRE formulärifyllning – flikbyte via PostBack kan
 * nollställa fält som redan fyllts i.
 *
 * @param {HTMLIFrameElement} iframe - dokumentformulärets iframe-element
 * @param {File[]} filer - Array av File-objekt att ladda upp
 * @param {Function} visaStatus - Callback för statustext
 * @returns {Promise<{ lyckade: string[], misslyckade: string[] }>}
 */
async function laddaUppFiler(iframe, filer, visaStatus) {
  if (!filer || filer.length === 0) return { lyckade: [], misslyckade: [] };

  const hämtaDoc = () => iframe.contentDocument;
  const hämtaWin = () => iframe.contentWindow;

  visaStatus('Navigerar till Filer-fliken…');

  hämtaWin().__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'FileStep');

  // Vänta på att drag-drop-containern dyker upp (Filer-fliken laddad)
  let dragDrop = null;
  for (let poll = 0; poll < 60; poll++) {
    await sleep(200);
    try {
      dragDrop = hämtaDoc().querySelector(
        '[id$="DocumentMultiFileUploadControl_dragdropContainer"]'
      );
      if (dragDrop) break;
    } catch { /* iframe kan vara i loading-state */ }
  }
  if (!dragDrop) throw new Error('Filer-fliken laddades inte.');

  const lyckade = [];
  const misslyckade = [];

  for (let i = 0; i < filer.length; i++) {
    const fil = filer[i];
    visaStatus(`Laddar upp fil ${i + 1}/${filer.length}: ${fil.name}…`);

    try {
      await laddaUppEnFil(iframe, fil);
      lyckade.push(fil.name);
    } catch (err) {
      console.error(`[p360-upload] Misslyckades ladda upp ${fil.name}:`, err.message);
      misslyckade.push(fil.name);
    }
  }

  // Navigera tillbaka till Generellt-fliken
  visaStatus('Återgår till Generellt-fliken…');
  hämtaWin().__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');

  for (let poll = 0; poll < 60; poll++) {
    await sleep(200);
    try {
      if (hämtaDoc().getElementById('PlaceHolderMain_MainView_TitleTextBoxControl')) break;
    } catch { /* loading */ }
  }

  return { lyckade, misslyckade };
}

/**
 * Laddar upp en enskild fil via XHR och registrerar den i formuläret.
 *
 * Steg 1: POST fil till /FileUpload.ashx?userSession={id}
 * Steg 2+3: Sätt hidden field och klicka hidden button – körs i iframe-kontexten
 *           via eval() (ASP.NET PageRequestManager kräver detta).
 *
 * @param {HTMLIFrameElement} iframe - dokumentformulärets iframe-element
 * @param {File} fil - File-objekt att ladda upp
 */
async function laddaUppEnFil(iframe, fil) {
  const userSession = Math.floor(Math.random() * 1000000000);

  // Steg 1: POST filen till FileUpload.ashx
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/FileUpload.ashx?userSession=${userSession}`);
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Nätverksfel vid uppladdning'));
    xhr.ontimeout = () => reject(new Error('Timeout vid uppladdning'));
    xhr.timeout = 120000;

    const formData = new FormData();
    formData.append(fil.name, fil);
    xhr.send(formData);
  });

  // Steg 2+3: Sätt hidden field och klicka hidden button – i iframe-kontexten.
  const iWin = iframe.contentWindow;
  const pathId = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadedFilesPath';
  const btnId = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadButton';
  const säkertFilnamn = fil.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  iWin.eval(`
    (function() {
      var hp = document.getElementById('${pathId}');
      hp.value = '${userSession}|${säkertFilnamn}';
      var btn = document.getElementById('${btnId}');
      btn.style.display = '';
      btn.click();
      btn.style.display = 'none';
    })();
  `);

  // Vänta på att PostBack-svaret kommit (ScannedFilepath eller fillistan)
  for (let poll = 0; poll < 60; poll++) {
    await sleep(300);
    try {
      const doc = iframe.contentDocument;
      const scanned = doc.querySelector('[name*="ScannedFilepath"]');
      if (scanned && scanned.value && scanned.value.includes(String(userSession))) {
        return;
      }
      const filLista = doc.getElementById('PlaceHolderMain_MainView_ImportFileListControl');
      if (filLista && filLista.textContent.includes(fil.name)) {
        return;
      }
    } catch { /* iframe kan vara i loading-state */ }
  }

  console.warn(`[p360-upload] Timeout – kunde inte bekräfta att ${fil.name} registrerades.`);
}
