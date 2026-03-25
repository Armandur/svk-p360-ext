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
 * @param {Function} [ärAvbruten] - Callback som returnerar true om operationen ska avbrytas
 * @returns {Promise<{ lyckade: string[], misslyckade: string[] }>}
 */
async function laddaUppFiler(iframe, filer, visaStatus, ärAvbruten) {
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

  // Steg 2+3: Sätt hidden field och klicka hidden button – i iframe-kontexten.
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

  // Trigga PostBack inifrån iframe-kontexten.
  // btn.click() från parent kör inte javascript:-href.
  // iWin.__doPostBack() från parent når inte alltid PageRequestManager korrekt.
  // Lösning: injicera en <script>-tag i iframe som kör klicket inifrån.
  const href = btn.getAttribute('href') || '';
  const onclick = btn.getAttribute('onclick') || '';
  console.log(`[p360-upload] Steg 3: btn.tagName=${btn.tagName}, href="${href.substring(0, 80)}", onclick="${onclick.substring(0, 80)}"`);

  // Metod 1: Script-injektion i iframe (kör i iframens kontext)
  try {
    const script = iDoc.createElement('script');
    script.textContent = `document.getElementById('${btnId}').click();`;
    iDoc.body.appendChild(script);
    script.remove();
    console.log('[p360-upload] Steg 3: Script-injektion lyckades');
  } catch (e) {
    // Metod 2: Fallback till __doPostBack direkt
    console.log('[p360-upload] Steg 3: Script-injektion misslyckades, fallback till __doPostBack:', e.message);
    const postBackMatch = href.match(/__doPostBack\('([^']+)'/);
    const postBackTarget = postBackMatch
      ? postBackMatch[1]
      : 'ctl00$PlaceHolderMain$MainView$DocumentMultiFileUploadControl$hiddenUploadButton';
    iWin.__doPostBack(postBackTarget, '');
  }

  // Vänta på att PostBack-svaret kommit (ScannedFilepath eller fillistan)
  for (let poll = 0; poll < 80; poll++) {
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
      // Logga var 5:e poll för diagnostik
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
