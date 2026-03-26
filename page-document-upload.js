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
      const res = await laddaUppEnFil(iframe, fil, ärAvbruten);
      console.log('[p360-upload] Verifierad registrering:', res);
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
  const PREFERRED_PREFIX = 'LeftFolderView1_ViewControl_UploadControl_DocumentMultiFileUploadControl';
  const CANON_PATH_NAME =
    'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$UploadControl_DocumentMultiFileUploadControl_hiddenUploadedFilesPath';
  const CANON_BTN_TARGET =
    'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$UploadControl_DocumentMultiFileUploadControl_hiddenUploadButton';

  function hittaUploadKontroller() {
    const ärKlickbarUploadBtn = (el) => {
      if (!el) return false;
      const tag = (el.tagName || '').toUpperCase();
      const type = (el.getAttribute?.('type') || '').toLowerCase();
      if (tag === 'A' || tag === 'BUTTON') return true;
      if (tag === 'INPUT' && type !== 'hidden') return true;
      const onclick = el.getAttribute?.('onclick') || '';
      const href = el.getAttribute?.('href') || '';
      return onclick.includes('__doPostBack') || href.includes('__doPostBack');
    };
    const dragDrop = iDoc.querySelector(
      '[id*="DocumentMultiFileUploadControl_dragdropContainer"],' +
      '[data-hiddenuploadbuttonid][data-hiddenuploadedfilespathid]'
    );
    if (dragDrop) {
      const pathId = dragDrop.getAttribute('data-hiddenuploadedfilespathid') || '';
      const btnId = dragDrop.getAttribute('data-hiddenuploadbuttonid') || '';
      const listId = dragDrop.getAttribute('data-overlayattachedlistcontrolclientid') || '';
      const hiddenPathEl = pathId ? iDoc.getElementById(pathId) : null;
      const hiddenBtn = btnId ? iDoc.getElementById(btnId) : null;
      const importList = listId ? iDoc.getElementById(listId) : null;
      if (hiddenPathEl || hiddenBtn || importList) {
        return { hiddenPathEl, hiddenBtn, importList };
      }
    }

    const allaHidden = Array.from(iDoc.querySelectorAll('input[type="hidden"]'));
    const pathKandidater = allaHidden.filter(el =>
      (el.id || '').includes('DocumentMultiFileUploadControl_hiddenUploadedFilesPath') ||
      (el.name || '').includes('DocumentMultiFileUploadControl_hiddenUploadedFilesPath')
    );
    const hiddenPathEl =
      pathKandidater.find(el =>
        (el.id || el.name || '').includes(PREFERRED_PREFIX)
      )
      || pathKandidater.find(el =>
        (el.id || el.name || '').includes('UploadControl_DocumentMultiFileUploadControl')
      )
      || pathKandidater[0]
      || null;

    // Bind knapp/lista till SAMMA prefix som valt hiddenPath-fält
    let hiddenBtn = null;
    let importList = null;
    if (hiddenPathEl) {
      const pathId = hiddenPathEl.id || '';
      const pathName = hiddenPathEl.name || '';
      const btnId = pathId.replace('_hiddenUploadedFilesPath', '_hiddenUploadButton');
      const btnName = pathName.replace('hiddenUploadedFilesPath', 'hiddenUploadButton');
      const listId = pathId.replace('_DocumentMultiFileUploadControl_hiddenUploadedFilesPath', '_ImportFileListControl');

      hiddenBtn = (btnId && iDoc.getElementById(btnId))
        || (btnName && iDoc.querySelector(`[name="${btnName}"]`))
        || null;
      if (!ärKlickbarUploadBtn(hiddenBtn)) hiddenBtn = null;
      importList = (listId && iDoc.getElementById(listId)) || null;
    }

    if (!hiddenBtn) {
      const btnKandidater = Array.from(iDoc.querySelectorAll(
        'a[id*="DocumentMultiFileUploadControl_hiddenUploadButton"],' +
        'button[id*="DocumentMultiFileUploadControl_hiddenUploadButton"],' +
        'input[id*="DocumentMultiFileUploadControl_hiddenUploadButton"]:not([type="hidden"]),' +
        'a[name*="DocumentMultiFileUploadControl_hiddenUploadButton"],' +
        'button[name*="DocumentMultiFileUploadControl_hiddenUploadButton"],' +
        'input[name*="DocumentMultiFileUploadControl_hiddenUploadButton"]:not([type="hidden"]),' +
        '[onclick*="hiddenUploadButton"]'
      ));
      hiddenBtn =
        btnKandidater.find(el =>
          (el.id || el.name || '').includes(PREFERRED_PREFIX)
        )
        || btnKandidater.find(el =>
          (el.id || el.name || '').includes('UploadControl_DocumentMultiFileUploadControl')
        )
        || btnKandidater[0]
        || null;
    }

    if (!importList) {
      importList = iDoc.querySelector(
        '[id*="LeftFolderView1_ViewControl_UploadControl_ImportFileListControl"],' +
        '[id$="_ImportFileListControl"], [id*="ImportFileListControl"]'
      );
    }

    return { hiddenPathEl, hiddenBtn, importList };
  }

  // Steg 0: Navigera till Filer-fliken om uppladdningskontrollerna saknas
  let { hiddenPathEl: hp, hiddenBtn, importList } = hittaUploadKontroller();
  if (!hp || !hiddenBtn) {
    console.log('[p360-upload] Steg 0: Navigerar till Filer-fliken…');
    iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'FileStep');
    for (let ms = 0; ms < 10000; ms += 200) {
      await sleep(200);
      ({ hiddenPathEl: hp, hiddenBtn, importList } = hittaUploadKontroller());
      if (hp && hiddenBtn) break;
    }
    if (!hp || !hiddenBtn) {
      throw new Error('Filer-fliken laddades inte – upload-kontroller saknas.');
    }
    console.log('[p360-upload] Steg 0 OK: Filer-fliken laddad.');
  }

  // Vänta extra på "rätt" upload-kontrollvariant (LeftFolder...UploadControl...).
  // I vissa lägen dyker en MainView-variant upp tidigare men fungerar inte för filregistrering.
  for (let ms = 0; ms < 6000; ms += 200) {
    ({ hiddenPathEl: hp, hiddenBtn, importList } = hittaUploadKontroller());
    const pathKey = (hp?.id || hp?.name || '');
    const btnKey = (hiddenBtn?.id || hiddenBtn?.name || '');
    if (pathKey.includes(PREFERRED_PREFIX) && btnKey.includes(PREFERRED_PREFIX)) break;
    await sleep(200);
  }

  console.log('[p360-upload] Valda upload-kontroller:', {
    hiddenPathId: hp?.id || hp?.name || '',
    hiddenBtnId: hiddenBtn?.id || hiddenBtn?.name || '',
    importListId: importList?.id || '',
  });

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
  ({ hiddenPathEl: hp, hiddenBtn, importList } = hittaUploadKontroller());
  if (!hp) throw new Error('hiddenUploadedFilesPath försvann efter navigering till Filer-fliken.');
  const uploadValue = `${userSession}|${fil.name}`;
  // Sätt alla kompatibla path-fält med upload-control-prefix (robust mot dubbletter i DOM).
  Array.from(iDoc.querySelectorAll('input[type="hidden"]'))
    .filter(el => {
      const key = `${el.id}|${el.name}`;
      return key.includes(PREFERRED_PREFIX) && key.includes('hiddenUploadedFilesPath');
    })
    .forEach(el => { el.value = uploadValue; });

  // Kanonisk fallback från fungerande spionkörning:
  // säkerställ att rätt servernyckel finns i formuläret även om DOM-ID-varianten varierar.
  let canonPath = iDoc.querySelector(`[name="${CANON_PATH_NAME}"]`);
  if (!canonPath) {
    const form = iDoc.forms?.[0];
    if (form) {
      canonPath = iDoc.createElement('input');
      canonPath.type = 'hidden';
      canonPath.name = CANON_PATH_NAME;
      form.appendChild(canonPath);
    }
  }
  if (canonPath) canonPath.value = uploadValue;

  hp.value = uploadValue;
  console.log(`[p360-upload] Steg 2: Satte hiddenPath (${hp.id || hp.name})="${hp.value}"`);

  // Steg 3: Klicka hiddenUploadButton → PostBack registrerar filen med servern
  // Utan detta steget sätts aldrig SI_HiddenField_ScannedFilepath och filen bifogas inte.
  if (hiddenBtn) {
    await väntaPåPRM(iWin, 5000);
    const onclick = hiddenBtn.getAttribute?.('onclick') || '';
    const href = hiddenBtn.getAttribute?.('href') || '';
    // Undvik programmatisk .click() på <a href="javascript:..."> då CSP kan blockera.
    // Extracta __doPostBack-target och anropa __doPostBack direkt.
    const extractTarget = (s) => {
      const m = String(s || '').match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
      return m ? m[1] : null;
    };

    const targetFromOnclick = extractTarget(onclick);
    const targetFromHref = extractTarget(href);
    const target =
      targetFromOnclick ||
      targetFromHref ||
      hiddenBtn.getAttribute?.('name') ||
      hiddenBtn.id ||
      '';

    if (target && typeof iWin.__doPostBack === 'function') {
      iWin.__doPostBack(target, '');
    } else {
      hiddenBtn.click();
    }

    // Kör alltid även kanonisk upload-postback (från spy) för att träffa rätt serverkontroll.
    if (typeof iWin.__doPostBack === 'function') {
      try {
        console.log('[p360-upload] Extra kanonisk upload-postback:', CANON_BTN_TARGET);
        iWin.__doPostBack(CANON_BTN_TARGET, '');
      } catch { /* ignorera */ }
    }

    await väntaPåPRM(iWin, 15000);

    // Steg 4: Verifiera att filen rimligen registrerats.
    // - ImportFileListControl/SI_HiddenField_ScannedFilepath kan uppdateras direkt eller senare
    // - Vi accepterar även hiddenUploadedFilesPath, men loggar varning om list/scanned saknas.
    const deadline = Date.now() + 30000;
    let scanned = '';
    let registrerad = false;
    let fulltRegistrerad = false;
    for (let ms = 0; ms < 30000; ms += 250) {
      ({ importList } = hittaUploadKontroller());
      const listText = (importList?.textContent || '').toLowerCase();
      scanned = iDoc.getElementById('SI_HiddenField_ScannedFilepath')?.value || '';
      const harIRad = listText.includes(fil.name.toLowerCase());
      const harScanned = scanned.toLowerCase().includes(fil.name.toLowerCase());
      const nuPath = (iDoc.querySelector(`[name="${CANON_PATH_NAME}"]`)?.value || hp?.value || '');
      const harHiddenPath = nuPath === uploadValue;
      if (harIRad || harHiddenPath) {
        registrerad = true;
      }
      // Kräv scanned filepath för att slippa "dokument utan bilaga"
      if (harScanned) {
        fulltRegistrerad = true;
        registrerad = true;
        break;
      }
      if (Date.now() > deadline) break;
      await sleep(250);
    }

    if (!registrerad) {
      throw new Error(
        `Filen "${fil.name}" verkar inte ha registrerats i formuläret ` +
        '(varken ImportFileListControl, SI_HiddenField_ScannedFilepath eller hiddenUploadedFilesPath bekräftade registrering).'
      );
    }

    if (!fulltRegistrerad) {
      const scannedNow = scanned || '';
      const listNow = (importList?.textContent || '').slice(0, 2000);
      const nuPathNow = (iDoc.querySelector(`[name="${CANON_PATH_NAME}"]`)?.value || hp?.value || '');
      throw new Error(
        `Filen "${fil.name}" laddades men SI_HiddenField_ScannedFilepath blev aldrig ifylld. ` +
        `scanned="${scannedNow.slice(0, 200)}" list="${listNow}" hiddenPath="${nuPathNow}".`
      );
    }

    console.log('[p360-upload] Steg 3 OK: upload-postback körd och fil registrerad.');
    return {
      filnamn: fil.name,
      hiddenPath: hp.value,
      scannedFilepath: scanned,
    };
  } else {
    console.warn('[p360-upload] Steg 3: hiddenUploadButton hittades inte – filen bifogas kanske inte.');
    throw new Error('hiddenUploadButton saknas – kan inte registrera fil i dokumentformuläret.');
  }
}
