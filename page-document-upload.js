// page-document-upload.js – Filuppladdning till ärendedokument
// Körs i sidans MAIN world. Beror på: sleep, waitForElement (page-utils.js)
// Laddas före page-document-create.js.

/**
 * Laddar upp filer till ett öppet dokumentformulär.
 * Navigerar till Filer-fliken, laddar upp via XHR till FileUpload.ashx,
 * sätter hidden field och triggar PostBack.
 *
 * @param {Document} iDoc - iframe-dokumentet (dokumentformuläret)
 * @param {Window} iWin - iframe-fönstret
 * @param {File[]} filer - Array av File-objekt att ladda upp
 * @param {Function} visaStatus - Callback för statustext
 * @returns {Promise<{ lyckade: string[], misslyckade: string[] }>}
 */
async function laddaUppFiler(iDoc, iWin, filer, visaStatus) {
  if (!filer || filer.length === 0) return { lyckade: [], misslyckade: [] };

  visaStatus(`Navigerar till Filer-fliken…`);

  // Navigera till Filer-fliken
  iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'FileStep');

  // Vänta på att drag-drop-containern dyker upp (indikerar att Filer-fliken laddats)
  const dragDrop = await waitForElement(
    iDoc,
    '[id$="DocumentMultiFileUploadControl_dragdropContainer"]',
    10000
  );
  if (!dragDrop) throw new Error('Filer-fliken laddades inte.');

  const lyckade = [];
  const misslyckade = [];

  for (let i = 0; i < filer.length; i++) {
    const fil = filer[i];
    visaStatus(`Laddar upp fil ${i + 1}/${filer.length}: ${fil.name}…`);

    try {
      await laddaUppEnFil(iDoc, iWin, fil);
      lyckade.push(fil.name);
    } catch (err) {
      console.error(`[p360-upload] Misslyckades ladda upp ${fil.name}:`, err.message);
      misslyckade.push(fil.name);
    }
  }

  // Navigera tillbaka till Generellt-fliken så att Slutför-knappen fungerar
  visaStatus('Återgår till Generellt-fliken…');
  iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');

  // Vänta på att titelfältet finns (Generellt-fliken laddad)
  await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000);

  return { lyckade, misslyckade };
}

/**
 * Laddar upp en enskild fil via XHR och registrerar den i formuläret.
 */
async function laddaUppEnFil(iDoc, iWin, fil) {
  const userSession = Math.floor(Math.random() * 1000000000);

  // Steg 1: POST filen till FileUpload.ashx
  const uploadResult = await new Promise((resolve, reject) => {
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
    xhr.timeout = 120000; // 2 minuter

    const formData = new FormData();
    formData.append(fil.name, fil);
    xhr.send(formData);
  });

  // Steg 2: Sätt hidden field med session|filnamn
  const hiddenPath = iDoc.getElementById(
    'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadedFilesPath'
  );
  if (!hiddenPath) throw new Error('Hidden upload path-fält hittades inte.');
  hiddenPath.value = `${userSession}|${fil.name}`;

  // Steg 3: Trigga PostBack via den dolda länken
  const hiddenBtn = iDoc.getElementById(
    'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadButton'
  );
  if (!hiddenBtn) throw new Error('Hidden upload-knapp hittades inte.');
  hiddenBtn.click();

  // Vänta på att PostBack-svaret kommit (fillistan uppdateras)
  // Polla tills ImportFileListControl innehåller filnamnet
  for (let poll = 0; poll < 30; poll++) {
    await sleep(200);
    const filLista = iDoc.getElementById(
      'PlaceHolderMain_MainView_ImportFileListControl'
    );
    if (filLista && filLista.textContent.includes(fil.name)) {
      return;
    }
  }

  // Om vi kommer hit kan filen ändå ha laddats upp – logga varning
  console.warn(`[p360-upload] Kunde inte bekräfta att ${fil.name} registrerades i fillistan.`);
}
