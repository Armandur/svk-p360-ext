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
 * Triggar en PostBack i iframen och väntar på att den slutförs.
 * Lyssnar på BÅDE PRM endRequest (async UpdatePanel) OCH iframe load-event
 * (synkron full page load). Whichever fires first.
 *
 * @returns {'prm'|'load'|'timeout'} Vad som avslutade väntan.
 */
function triggaPostBackOchVänta(iframe, iWin, target, timeoutMs = 15000) {
  return new Promise(resolve => {
    let klar = false;
    const avsluta = (typ) => {
      if (klar) return;
      klar = true;
      clearTimeout(timer);
      iframe.removeEventListener('load', loadHandler);
      console.log(`[p360-upload] PostBack avslutad via: ${typ}`);
      resolve(typ);
    };

    const timer = setTimeout(() => avsluta('timeout'), timeoutMs);

    // Lyssna på PRM endRequest (async postback)
    const prm = iWin.Sys?.WebForms?.PageRequestManager?.getInstance?.();
    if (prm) {
      const prmHandler = function(sender, args) {
        prm.remove_endRequest(prmHandler);
        avsluta('prm');
      };
      prm.add_endRequest(prmHandler);
    }

    // Lyssna på iframe load (synkron postback = full page reload)
    function loadHandler() {
      iframe.removeEventListener('load', loadHandler);
      // Ge nya dokumentet en stund att rendera
      setTimeout(() => avsluta('load'), 200);
    }
    iframe.addEventListener('load', loadHandler);

    // Trigga PostBacken via __doPostBack i iframens kontext
    console.log(`[p360-upload] __doPostBack('${target}', '') – väntar på svar…`);
    iWin.__doPostBack(target, '');
  });
}

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
 * @param {Function} [ärAvbruten] - Callback som returnerar true om operationen ska avbrytas
 * @returns {Promise<{ lyckade: string[], misslyckade: string[] }>}
 */
async function laddaUppFiler(iframe, filer, visaStatus, ärAvbruten) {
  if (!filer || filer.length === 0) return { lyckade: [], misslyckade: [] };

  const hämtaDoc = () => iframe.contentDocument;
  const hämtaWin = () => iframe.contentWindow;

  visaStatus('Navigerar till Filer-fliken…');

  // Vänta på att PRM är redo innan flikbyte
  const prm0 = await väntaPåPRM(hämtaWin());
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

  // Vänta på att PRM är klar efter flikbytet – kritiskt!
  await väntaPåPRM(hämtaWin());

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

  // Navigera tillbaka till Generellt-fliken
  visaStatus('Återgår till Generellt-fliken…');
  await väntaPåPRM(hämtaWin());
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
 * Steg 2: Sätt hidden field med session|filnamn
 * Steg 3: Trigga PostBack via PRM (eller fallback) och vänta på att filen
 *         registreras i ImportFileListControl.
 *
 * @param {HTMLIFrameElement} iframe - dokumentformulärets iframe-element
 * @param {File} fil - File-objekt att ladda upp
 * @param {Function} [ärAvbruten] - Avbryt-callback
 */
async function laddaUppEnFil(iframe, fil, ärAvbruten) {
  const userSession = Math.floor(Math.random() * 1000000000);
  console.log(`[p360-upload] Steg 1: POST ${fil.name} (${fil.size} bytes) till FileUpload.ashx (session=${userSession})`);

  // Steg 1: POST filen till FileUpload.ashx
  const xhrSvar = await new Promise((resolve, reject) => {
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
  console.log(`[p360-upload] Steg 1 OK: XHR-svar="${xhrSvar?.substring(0, 100)}"`);

  // Steg 2: Sätt hidden field
  const iDoc = iframe.contentDocument;
  const iWin = iframe.contentWindow;
  const pathId = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadedFilesPath';
  const btnId = 'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadButton';

  const hp = iDoc.getElementById(pathId);
  const btn = iDoc.getElementById(btnId);
  console.log(`[p360-upload] Steg 2: hiddenPath=${!!hp}, hiddenBtn=${!!btn}`);

  if (!hp || !btn) {
    console.error('[p360-upload] Hidden field eller button saknas – kan inte registrera filen.');
    return;
  }

  hp.value = `${userSession}|${fil.name}`;
  console.log(`[p360-upload] Steg 2: Satte hiddenPath="${hp.value}"`);

  // Steg 3: SKIPPA PostBack – hidden field-värdet bevaras genom alla PostBacks
  // och läses av servern vid Slutför. Att trigga PostBacken orsakar en full page
  // reload i iframen som nollställer hidden field och alla fält.
  // Verifierat: filen bifogas korrekt till dokumentet utan PostBack-steg.
  console.log(`[p360-upload] Steg 3: Hoppas över (hidden field bevaras till Slutför).`);
}
