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
 * Triggar en PostBack via PRM och väntar på att endRequest-eventet fires.
 * Returnerar true om PostBacken genomfördes, false vid timeout.
 */
function triggaPostBackViaPRM(iWin, prm, target, timeoutMs = 15000) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      console.warn('[p360-upload] PRM endRequest timeout efter', timeoutMs, 'ms');
      prm.remove_endRequest(handler);
      resolve(false);
    }, timeoutMs);

    function handler(sender, args) {
      prm.remove_endRequest(handler);
      clearTimeout(timer);
      console.log('[p360-upload] PRM endRequest mottagen – PostBack klar');
      resolve(true);
    }
    prm.add_endRequest(handler);

    console.log(`[p360-upload] PRM: __doPostBack('${target}', '') via iframe`);
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

  // Steg 3: Trigga PostBack för att registrera filen
  // Extrahera PostBack-target från knappens href
  const href = btn.getAttribute('href') || '';
  const postBackMatch = href.match(/__doPostBack\('([^']+)'/);
  const postBackTarget = postBackMatch
    ? postBackMatch[1]
    : 'ctl00$PlaceHolderMain$MainView$DocumentMultiFileUploadControl$hiddenUploadButton';

  console.log(`[p360-upload] Steg 3: btn.tagName=${btn.tagName}, target="${postBackTarget}"`);

  // Vänta på att PRM är idle innan vi triggar
  const prm = await väntaPåPRM(iWin);

  let postBackLyckades = false;

  if (prm) {
    // Metod 1: Via PRM med endRequest-event (mest tillförlitlig)
    postBackLyckades = await triggaPostBackViaPRM(iWin, prm, postBackTarget, 15000);
  } else {
    // Metod 2: Direkt __doPostBack utan PRM
    console.log('[p360-upload] Steg 3: Anropar __doPostBack direkt (ingen PRM)');
    iWin.__doPostBack(postBackTarget, '');
  }

  if (postBackLyckades) {
    // PRM rapporterade att PostBacken är klar – verifiera resultatet
    try {
      const doc = iframe.contentDocument;
      const filLista = doc.getElementById('PlaceHolderMain_MainView_ImportFileListControl');
      if (filLista && filLista.textContent.includes(fil.name)) {
        console.log(`[p360-upload] Bekräftad: ${fil.name} syns i fillistan.`);
      } else {
        console.log(`[p360-upload] PostBack klar men ${fil.name} ej i fillistan – kontrollerar ScannedFilepath`);
        const scanned = doc.querySelector('[name*="ScannedFilepath"]');
        if (scanned?.value?.includes(String(userSession))) {
          console.log(`[p360-upload] Bekräftad via ScannedFilepath (session ${userSession})`);
        }
      }
    } catch { /* ignorera */ }
    return;
  }

  // Fallback: Polla efter bekräftelse (om PRM inte finns eller timeout)
  console.log('[p360-upload] Fallback: pollar efter bekräftelse…');
  for (let poll = 0; poll < 50; poll++) {
    if (ärAvbruten?.()) {
      console.log('[p360-upload] Avbruten under poll – avbryter bekräftelse.');
      return;
    }
    await sleep(300);
    try {
      const doc = iframe.contentDocument;
      const scanned = doc.querySelector('[name*="ScannedFilepath"]');
      if (scanned && scanned.value && scanned.value.includes(String(userSession))) {
        console.log(`[p360-upload] Bekräftad: ScannedFilepath innehåller session ${userSession}`);
        return;
      }
      const filLista = doc.getElementById('PlaceHolderMain_MainView_ImportFileListControl');
      if (filLista && filLista.textContent.includes(fil.name)) {
        console.log(`[p360-upload] Bekräftad: ImportFileListControl innehåller ${fil.name}`);
        return;
      }
      if (poll > 0 && poll % 10 === 0) {
        console.log(`[p360-upload] Poll ${poll}: ScannedFilepath="${scanned?.value?.substring(0, 60) || '(ej hittat)'}",`,
          `filLista=${filLista ? 'finns' : 'saknas'}`);
      }
    } catch (e) {
      if (poll % 10 === 0) console.log(`[p360-upload] Poll ${poll}: fel vid åtkomst:`, e.message);
    }
  }

  console.warn(`[p360-upload] Timeout – kunde inte bekräfta att ${fil.name} registrerades (session=${userSession}).`);
}
