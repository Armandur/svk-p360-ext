// page-document-upload.js – Filuppladdning till ärendedokument
// Körs i sidans MAIN world. Beror på: sleep, waitForElement (page-utils.js)
// Laddas före page-document-create.js.

/**
 * Väntar på att ASP.NET PageRequestManager (PRM) är idle (inte i async postback).
 * Returnerar PRM-instansen eller null om den inte finns.
 */
async function väntaPåPRM(iWin, maxMs = 10000) {
  const prm = iWin.Sys?.WebForms?.PageRequestManager?.getInstance?.();
  if (!prm) {
    console.log('[p360-upload] PRM saknas – ingen väntan.');
    return null;
  }
  for (let ms = 0; ms < maxMs; ms += 100) {
    if (!prm.get_isInAsyncPostBack()) return prm;
    if (ms % 2000 === 0 && ms > 0) {
      console.log(`[p360-upload] Väntar på PRM… (${ms} ms)`);
    }
    await sleep(100);
  }
  console.warn('[p360-upload] PRM fortfarande aktiv efter', maxMs, 'ms – fortsätter ändå.');
  return prm;
}

/**
 * Laddar upp filer till ett öppet dokumentformulär.
 * Laddar upp varje fil via XHR till FileUpload.ashx och skapar ett
 * hidden field i formuläret med sessionsnyckeln. Servern läser
 * hidden field vid Slutför och bifogar filen.
 *
 * Navigerar INTE till Filer-fliken – hidden field skapas direkt i DOM:en
 * på aktiv flik för att undvika flikbyte som nollställer formulärfält.
 *
 * @param {HTMLIFrameElement} iframe - dokumentformulärets iframe-element
 * @param {File[]} filer - Array av File-objekt att ladda upp
 * @param {Function} visaStatus - Callback för statustext
 * @param {Function} [ärAvbruten] - Callback som returnerar true om operationen ska avbrytas
 * @returns {Promise<{ lyckade: string[], misslyckade: string[] }>}
 */
async function laddaUppFiler(iframe, filer, visaStatus, ärAvbruten) {
  if (!filer || filer.length === 0) return { lyckade: [], misslyckade: [] };

  const lyckade = [];
  const misslyckade = [];

  for (let i = 0; i < filer.length; i++) {
    const fil = filer[i];
    visaStatus(`Laddar upp fil ${i + 1}/${filer.length}: ${fil.name}…`);

    if (ärAvbruten?.()) {
      console.log('[p360-upload] Avbruten – hoppar över resterande filer.');
      break;
    }

    try {
      await laddaUppEnFil(iframe, fil, ärAvbruten);
      lyckade.push(fil.name);
    } catch (err) {
      console.error(`[p360-upload] Misslyckades ladda upp ${fil.name}:`, err.message);
      misslyckade.push(fil.name);
    }
  }

  return { lyckade, misslyckade };
}

/**
 * Laddar upp en enskild fil via XHR och registrerar den i formuläret.
 *
 * Steg 0: Navigera till Filer-fliken om upladdningskontrollerna saknas i DOM.
 *         (Sker INNAN fyllning av formulärfält i skapaÄrendedokument, så inga fält nollställs.)
 * Steg 1: POST fil till /FileUpload.ashx?userSession={id}
 * Steg 2: Sätt hidden field hiddenUploadedFilesPath med session|filnamn
 * Steg 3: Klicka hiddenUploadButton → PostBack registrerar filen (sätter SI_HiddenField_ScannedFilepath)
 *
 * @param {HTMLIFrameElement} iframe - dokumentformulärets iframe-element
 * @param {File} fil - File-objekt att ladda upp
 * @param {Function} [ärAvbruten] - Avbryt-callback
 */
async function laddaUppEnFil(iframe, fil, ärAvbruten) {
  const iDoc = iframe.contentDocument;
  const iWin = iframe.contentWindow;
  const userSession = Math.floor(Math.random() * 1000000000);

  const pathId = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadedFilesPath';
  const btnId  = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadButton';

  // Steg 0: Navigera till Filer-fliken om uppladdningskontrollerna saknas
  let hp = iDoc.getElementById(pathId);
  if (!hp) {
    console.log('[p360-upload] Steg 0: Navigerar till Filer-fliken…');
    iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'FileStep');
    for (let ms = 0; ms < 10000; ms += 200) {
      await sleep(200);
      hp = iDoc.getElementById(pathId);
      if (hp) break;
    }
    if (!hp) throw new Error('Filer-fliken laddades inte – hiddenUploadedFilesPath saknas.');
    console.log('[p360-upload] Steg 0 OK: Filer-fliken laddad.');
  }

  // Steg 1: POST filen till FileUpload.ashx
  console.log(`[p360-upload] Steg 1: POST ${fil.name} (${fil.size} bytes) till FileUpload.ashx (session=${userSession})`);
  const xhrSvar = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/FileUpload.ashx?userSession=${userSession}`);
    xhr.onload = () => {
      if (xhr.status === 200) resolve(xhr.responseText);
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error('Nätverksfel vid uppladdning'));
    xhr.ontimeout = () => reject(new Error('Timeout vid uppladdning'));
    xhr.timeout = 120000;
    const formData = new FormData();
    formData.append(fil.name, fil);
    xhr.send(formData);
  });
  console.log(`[p360-upload] Steg 1 OK: XHR-svar="${xhrSvar?.substring(0, 100)}"`);

  // Steg 2: Sätt hidden field (hämta elementet igen efter möjlig navigering)
  hp = iDoc.getElementById(pathId);
  if (!hp) throw new Error('hiddenUploadedFilesPath försvann efter navigering till Filer-fliken.');
  hp.value = `${userSession}|${fil.name}`;
  console.log(`[p360-upload] Steg 2: Satte hiddenPath="${hp.value}"`);

  // Steg 3: Klicka hiddenUploadButton → PostBack registrerar filen med servern
  // Utan detta steget sätts aldrig SI_HiddenField_ScannedFilepath och filen bifogas inte.
  const hiddenBtn = iDoc.getElementById(btnId);
  if (hiddenBtn) {
    await väntaPåPRM(iWin, 5000);
    hiddenBtn.click();
    await väntaPåPRM(iWin, 15000);
    console.log('[p360-upload] Steg 3 OK: hiddenUploadButton klickad och PostBack klar.');
  } else {
    console.warn('[p360-upload] Steg 3: hiddenUploadButton hittades inte – filen bifogas kanske inte.');
  }
}
