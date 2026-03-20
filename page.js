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
 *
 * Kräver att vi sett readyState === 'loading' INNAN vi accepterar 'complete',
 * för att undvika att snappa upp ett gammalt complete-state från föregående
 * dialogvisning (race condition).
 */
function waitForIframe(urlFragment, timeout = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    let hittadeLaddning = false;

    const check = setInterval(() => {
      const f = Array.from(document.querySelectorAll('iframe'))
        .find(f => { try { return f.src?.includes(urlFragment); } catch { return false; } });

      if (f) {
        const state = f.contentDocument?.readyState;
        if (state === 'loading' || state === 'interactive') {
          hittadeLaddning = true;
        }
        // Acceptera 'complete' bara om vi redan sett 'loading' för den här iframen
        if (hittadeLaddning && state === 'complete') {
          clearInterval(check);
          resolve(f);
        }
      }

      if (Date.now() - start > timeout) {
        clearInterval(check);
        resolve(null);
      }
    }, 100); // tätare polling (200→100 ms) för att inte missa loading-state
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

// URL till nytt-ärende-formuläret i dialogläge. Laddas som iframe inom befintlig 360°-sida
// för att säkerställa rätt sessionskontekst – direktnavigering via GET fungerar ej.
const NY_ÄRENDE_URL =
  '/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf' +
  '&dialogmode=true&IsDlg=1&context-data=subtype,Primary,61000';

/**
 * Väntar på att ett iframe dyker upp (i huvud-dokumentet) vars src eller
 * contentDocument.location.href innehåller urlFragment och har readyState 'complete'.
 * Används för kontaktdialogernas iframes som kan ha genomgått en redirect.
 *
 * Kontaktdialogerna skapas av formJavaScript i formiframen via window.top.document,
 * vilket innebär att de hamnar som syskon till formOverlayIframen i huvud-dokumentet.
 */
function waitForNyIframe(urlFragment, timeout = 10000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      for (const f of document.querySelectorAll('iframe')) {
        try {
          const src = f.src || '';
          const href = f.contentDocument?.location?.href || '';
          if (
            (src.includes(urlFragment) || href.includes(urlFragment)) &&
            f.contentDocument?.readyState === 'complete'
          ) {
            clearInterval(check);
            resolve(f);
            return;
          }
        } catch { /* cross-origin eller ej laddad */ }
      }
      if (Date.now() - start > timeout) {
        clearInterval(check);
        resolve(null);
      }
    }, 150);
  });
}

/**
 * Hjälpfunktion: sätter ett Selectize-fält till önskat värde.
 * Väntar tills Selectize initierats (max 3 s).
 * doc: valfritt – DocumentFragment eller contentDocument för en iframe.
 */
async function sättSelectize(id, value, doc) {
  const d = doc || document;
  const el = d.getElementById(id);
  if (!el || !value) return;
  await new Promise(resolve => {
    const t = Date.now();
    const poll = setInterval(() => {
      if (el.selectize) {
        clearInterval(poll);
        el.selectize.setValue(value);
        resolve();
      } else if (Date.now() - t > 3000) {
        // Selectize ej initierad – sätt direkt på native select
        el.value = value;
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });
}

/**
 * Läser in alternativ för instansspecifika fält.
 *
 * Skapar en dold iframe med nytt-ärende-formuläret inuti den befintliga 360°-sidan.
 * Det undviker problemet att /locator/DMS/Case/New/61000 avvisar direkta GET-anrop.
 */
async function läsInAlternativ() {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;width:1px;height:1px;top:-200px;left:-200px;opacity:0;border:none;pointer-events:none;';
  iframe.src = NY_ÄRENDE_URL;
  document.body.appendChild(iframe);

  try {
    // Vänta på laddningshändelsen
    await new Promise((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error('Timeout – formuläret laddades inte. Kontrollera att du är inloggad i 360°.')),
        18000
      );
      iframe.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    });

    // Vänta på att Selectize har initierats (de laddar alternativ via AJAX).
    // Polla tills minst ett Selectize-fält har alternativ, max 15 s.
    const doc = iframe.contentDocument;
    const iWin = iframe.contentWindow;

    const titelFält = doc?.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
    if (!titelFält) {
      throw new Error('Formuläret öppnades men innehöll inte de förväntade fälten. Kontrollera behörigheter i 360°.');
    }

    // Vänta tills Selectize på diarieenhet OCH ansvarig enhet har laddat alternativ.
    // Ansvariga personer beror på ansvarig enhet – triggas separat nedan.
    function selectizeAntal(id) {
      const el = doc.getElementById(id);
      if (!el) return 0;
      if (el.selectize) return Object.keys(el.selectize.options || {}).length;
      return el.options?.length ?? 0;
    }

    await new Promise(resolve => {
      const start = Date.now();
      const check = setInterval(() => {
        const redo =
          selectizeAntal('PlaceHolderMain_MainView_JournalUnitComboControl') > 0 &&
          selectizeAntal('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl') > 0;
        if (redo || Date.now() - start > 10000) { clearInterval(check); resolve(); }
      }, 300);
    });

    // Trigga laddning av ansvariga personer genom att tillfälligt välja första enheten.
    // ResponsibleUserComboControl är ett beroende fält som laddas via UpdatePanel
    // när ansvarig enhet ändras.
    const enhetSel = doc.getElementById('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl');
    const personSel = doc.getElementById('PlaceHolderMain_MainView_ResponsibleUserComboControl');
    if (enhetSel?.selectize && Object.keys(enhetSel.selectize.options || {}).length > 0) {
      const förstaEnhet = Object.keys(enhetSel.selectize.options)[0];
      enhetSel.selectize.setValue(förstaEnhet);
      // Vänta tills personlistan laddats
      await new Promise(resolve => {
        const start = Date.now();
        const check = setInterval(() => {
          const harPersoner = selectizeAntal('PlaceHolderMain_MainView_ResponsibleUserComboControl') > 0;
          if (harPersoner || Date.now() - start > 8000) { clearInterval(check); resolve(); }
        }, 300);
      });
    }

    await sleep(300);

    /**
     * Läser alternativ från ett Selectize-fält (primärt) eller native select (fallback).
     * Selectize lagrar alla AJAX-laddade alternativ i el.selectize.options som ett objekt
     * där nycklarna är värdena och värdena är { value, text/label }.
     */
    function läsOptions(id) {
      const el = doc.getElementById(id);
      if (!el) return [];

      // Primär strategi: läs från Selectize-cachade alternativ
      if (el.selectize && el.selectize.options) {
        return Object.values(el.selectize.options)
          .filter(o => o.value !== '' && o.value != null)
          .map(o => ({ value: String(o.value), label: (o.text || o.label || String(o.value)).trim() }));
      }

      // Fallback: läs från native select
      return Array.from(el.options)
        .filter(o => o.value !== '')
        .map(o => ({ value: o.value, label: o.text.trim() }));
    }

    // Klassificeringar kräver en wildcard-sökning (%) för att populera _dropDownList.
    // Trigga sökning och vänta tills select-elementet fyllts av AJAX-svaret.
    const klassificeringar = await försökLäsKlassificeringar(doc, iWin);

    return {
      diarieenheter:     läsOptions('PlaceHolderMain_MainView_JournalUnitComboControl'),
      delarkiv:          läsOptions('PlaceHolderMain_MainView_CaseSubArchiveComboControl'),
      atkomstgrupper:    läsOptions('PlaceHolderMain_MainView_AccessGroupComboControl'),
      ansvarigaEnheter:  läsOptions('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl'),
      ansvarigaPersoner: läsOptions('PlaceHolderMain_MainView_ResponsibleUserComboControl'),
      klassificeringar,
    };
  } finally {
    iframe.remove();
  }
}

/**
 * Försöker läsa alla klassificeringsalternativ från formulärets typeahead
 * genom att söka med jokertecknet %.
 *
 * Klassificeringsfältet använder Selectize.js kopplat till _dropDownList.
 * Selectize laddar alternativ dynamiskt via AJAX när man söker – de visas i
 * .selectize-dropdown-content som div.option[data-value].
 *
 * Strategi: sätt % i visFältet via Selectize, vänta tills dropdown-innehållet
 * har fyllts, läs sedan alla alternativ därifrån (eller från selectize.options
 * om de finns cachade).
 *
 * Returnerar alltid en array (tom om inget hittas – manuell inmatning som fallback).
 */
async function försökLäsKlassificeringar(doc, win) {
  const dropDown = doc.getElementById(
    'PlaceHolderMain_MainView_ClassificationCode1ComboControl_dropDownList'
  );
  if (!dropDown) return [];

  // Sätt % i visFältet och trigga events + PostBack – detta öppnar Selectize-dropdownen
  // och hämtar alternativ via AJAX. Resultaten hamnar i .selectize-dropdown-content
  // som div.option[data-value], INTE i dropDown.options (native select förblir tom).
  const visFält = doc.getElementById(
    'PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY'
  );
  if (visFält) {
    visFält.value = '%';
    for (const t of ['focus', 'input', 'keydown', 'keyup']) {
      try { visFält.dispatchEvent(new Event(t, { bubbles: true })); } catch { /* */ }
    }
  }
  try {
    win.__doPostBack(
      'ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl_OnClick_PostBack', ''
    );
  } catch { /* PostBack ej tillgänglig */ }

  // Vänta tills .selectize-dropdown-content har fyllts (max 12 s)
  await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const antal = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]').length;
      if (antal > 0 || Date.now() - start > 12000) { clearInterval(check); resolve(); }
    }, 300);
  });

  // Läs från synliga dropdown-element – title-attributet innehåller displaytexten
  const items = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]');
  return Array.from(items)
    .filter(el => el.dataset.value && el.dataset.value !== '0')
    .map(el => ({ display: (el.title || el.textContent).trim(), value: el.dataset.value }));
}

/**
 * Öppnar nytt-ärende-formuläret som ett synligt överläggsrutefönster och fyller det
 * med malldata, sedan skickar formuläret. Navigerar till det nyskapade ärendet.
 *
 * Formuläret laddas som en iframe i den befintliga 360°-sidan så att sessionskontexten
 * bevaras. Formulärets JavaScript kör i iframe-fönstrets kontext (formWin/__doPostBack),
 * medan kontaktdialogerna hamnar i huvud-dokumentets body som syskoniframes.
 */
async function skapaFrånMall(mall) {
  // Skapa overlay-containern
  const overlay = document.createElement('div');
  overlay.id = 'p360-mall-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99990;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;';

  const statusText = document.createElement('div');
  statusText.style.cssText =
    'color:#fff;font-family:sans-serif;font-size:13px;margin-bottom:10px;' +
    'padding:6px 14px;background:rgba(0,0,0,0.6);border-radius:4px;';
  statusText.textContent = 'Laddar formulär…';
  overlay.appendChild(statusText);

  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'width:95%;max-width:980px;height:85vh;border:none;border-radius:6px;background:#fff;';
  iframe.src = NY_ÄRENDE_URL;
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  const visaStatus = (t) => { statusText.textContent = t; };

  try {
    await new Promise((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error('Formuläret laddades inte. Kontrollera att du är inloggad i 360°.')),
        25000
      );
      iframe.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    });

    const iDoc = iframe.contentDocument;
    const iWin = iframe.contentWindow;
    // pb: postback i formulärets eget fönster
    const pb = (t, a) => iWin.__doPostBack(t, a);
    const sättSel = (id, val) => sättSelectize(id, val, iDoc);

    const titelFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000);
    if (!titelFält) throw new Error('Formuläret laddades inte korrekt.');

    visaStatus('Fyller i fält…');

    if (mall.diarieenhet?.value) await sättSel('PlaceHolderMain_MainView_JournalUnitComboControl', mall.diarieenhet.value);
    if (mall.delarkiv?.value)    await sättSel('PlaceHolderMain_MainView_CaseSubArchiveComboControl', mall.delarkiv.value);
    if (mall.atkomstgrupp?.value) await sättSel('PlaceHolderMain_MainView_AccessGroupComboControl', mall.atkomstgrupp.value);
    if (mall.ansvarigEnhet?.value) await sättSel('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl', mall.ansvarigEnhet.value);
    if (mall.ansvarigPerson?.value) await sättSel('PlaceHolderMain_MainView_ResponsibleUserComboControl', mall.ansvarigPerson.value);
    await sättSel('PlaceHolderMain_MainView_StatusCaseComboControl', mall.status || '5');
    await sättSel('PlaceHolderMain_MainView_PaperDocAllowedComboControl', mall.sparatPaPapper || '0');

    titelFält.value = mall.titel || '';
    titelFält.dispatchEvent(new Event('input', { bubbles: true }));

    if (mall.klassificering?.value) {
      const vis  = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY');
      const dolt = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl');
      if (vis)  vis.value  = mall.klassificering.display || '';
      if (dolt) dolt.value = mall.klassificering.value;
    }

    await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', mall.skyddskod || '0');

    if (mall.skyddskod && mall.skyddskod !== '0') {
      await sleep(300);
      pb('ctl00$PlaceHolderMain$MainView$AccessCodeComboControl', '');

      const paragrafFält = await waitForElement(
        iDoc, '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', 8000
      );
      if (paragrafFält && mall.sekretessParag) {
        await sättSel('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', mall.sekretessParag);
      }
      const checkbox = iDoc.getElementById('PlaceHolderMain_MainView_UnofficialContactCheckBoxControl');
      if (checkbox) checkbox.checked = !!mall.skyddaKontakter;
      await sättSel('PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl', mall.offentligTitelVal || '1');
      if (mall.offentligTitelVal === '3') {
        await sleep(500);
        const offFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_PublicTitleTextBoxControl', 5000);
        if (offFält) offFält.value = mall.offentligTitel || '';
      }
    }

    if (mall.externaKontakter?.length > 0) {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'ContactsStep');
      visaStatus('Lägger till externa kontakter…');
      await sleep(1500);
      for (const kontakt of mall.externaKontakter) {
        // pb skickas med för att postback-anrop ska ske i formulärets iframe-kontext.
        // Kontaktdialogerna hamnar i huvud-dokumentets body (window.top) som syskoniframes.
        await läggTillExternKontakt(kontakt, pb);
        await sleep(500);
      }
    }

    if (mall.kommentar) {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'NotesStep');
      await sleep(1000);
      const kFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_NotesStep_Control', 3000);
      if (kFält) kFält.value = mall.kommentar;
    }

    visaStatus('Skapar ärende…');
    await sleep(300);
    pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');

    // Vänta på att iframen navigeras till det nyskapade ärendet
    const nyUrl = await new Promise(resolve => {
      const t = Date.now();
      const check = setInterval(() => {
        try {
          const href = iWin.location.href;
          if (href.includes('/DMS/Case/Details/') || href.includes('module=Case&subtype=')) {
            clearInterval(check);
            resolve(href);
          }
        } catch { /* Under redirect kan location vara tillfälligt otillgänglig */ }
        if (Date.now() - t > 60000) { clearInterval(check); resolve(null); }
      }, 400);
    });

    overlay.remove();
    if (nyUrl) {
      window.location.href = nyUrl;
    } else {
      alert('Ärendet kan ha skapats. Kontrollera i 360°.');
    }

  } catch (err) {
    overlay.remove();
    throw err;
  }
}

/**
 * Lägger till en oregistrerad extern kontakt via 360°:s multi-stegsdialog.
 * (NewActivityContact → JournalCaseContactNew → ev. DuplicateContacts)
 *
 * pb: postback-funktion i formulärets kontext (iWin.__doPostBack eller vanlig __doPostBack).
 * Kontaktdialogerna hamnar alltid i huvud-dokumentets body som syskoniframes.
 */
async function läggTillExternKontakt(kontakt, pb = __doPostBack) {
  pb('ctl00$PlaceHolderMain$MainView$AddUnregCasePartMenuButtonControl_DropDownMenu', kontakt.roll || '9');

  // Steg 1: Typ-dialog
  const typIframe = await waitForNyIframe('NewActivityContact', 8000);
  if (!typIframe) { alert('Typ-dialogen öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  const typDoc = typIframe.contentDocument;
  await waitForElement(typDoc, '#PlaceHolderMain_MainView_ContactTypeComboBoxControl', 3000);

  const typSel = typDoc.getElementById('PlaceHolderMain_MainView_ContactTypeComboBoxControl');
  if (typSel?.selectize) { typSel.selectize.setValue('0'); } else if (typSel) { typSel.value = '0'; }
  await sleep(200);

  typDoc.getElementById('__EVENTTARGET').value   = 'ctl00$PlaceHolderMain$MainView$DialogButton';
  typDoc.getElementById('__EVENTARGUMENT').value = 'finish';
  typDoc.getElementById('form1').submit();

  // Steg 2: Kontaktformulär
  const kontaktIframe = await waitForNyIframe('JournalCaseContactNew', 10000);
  if (!kontaktIframe) { alert('Kontaktformuläret öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  const kDoc = kontaktIframe.contentDocument;
  await waitForElement(kDoc, '#PlaceHolderMain_MainView_ContactNameControl', 5000);

  const sättFält = (id, val) => { const el = kDoc.getElementById(id); if (el && val) el.value = val; };
  sättFält('PlaceHolderMain_MainView_ContactNameControl',         kontakt.namn);
  sättFält('PlaceHolderMain_MainView_ContactName2Control',        kontakt.kontaktperson);
  sättFält('PlaceHolderMain_MainView_ContactAddressControl',      kontakt.adress);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipCode_zip_code',  kontakt.postnummer);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipPlace_zip_place',kontakt.ort);
  sättFält('PlaceHolderMain_MainView_ContactEmailControl',        kontakt.epost);
  sättFält('PlaceHolderMain_MainView_Phone',                      kontakt.telefon);
  sättFält('PlaceHolderMain_MainView_ContactNotesControl',        kontakt.kommentar);
  await sleep(200);

  kDoc.getElementById('__EVENTTARGET').value   = 'ctl00$PlaceHolderMain$MainView$DialogButton';
  kDoc.getElementById('__EVENTARGUMENT').value = 'finish';
  kDoc.getElementById('form1').submit();

  // Steg 3 (villkorligt): Dubblettvarning
  await sleep(1500);
  const dubblettIframe = Array.from(document.querySelectorAll('iframe')).find(f => {
    try { return f.src?.includes('DuplicateContacts') || f.contentDocument?.location?.href?.includes('DuplicateContacts'); }
    catch { return false; }
  });
  if (dubblettIframe) {
    const dDoc = dubblettIframe.contentDocument;
    dDoc.getElementById('__EVENTTARGET').value   = 'ctl00$PlaceHolderMain$MainView$DialogButton';
    dDoc.getElementById('__EVENTARGUMENT').value = 'no';
    dDoc.getElementById('form1').submit();
    await sleep(1000);
  }

  // Vänta tills kontaktformuläret försvinner från DOM
  await new Promise(resolve => {
    const t = Date.now();
    const check = setInterval(() => {
      const harKontakt = Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return f.src?.includes('JournalCaseContactNew') || f.contentDocument?.location?.href?.includes('JournalCaseContactNew'); }
        catch { return false; }
      });
      if (!harKontakt || Date.now() - t > 12000) { clearInterval(check); resolve(); }
    }, 200);
  });
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
    } else if (action === 'växlaStatus') {
      await växlaStatus();
    } else if (action === 'dagboksblad') {
      await triggerDagboksblad();
    } else if (action === 'läsInAlternativ') {
      const alternativ = await läsInAlternativ();
      window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: true, data: alternativ } }));
      return;
    } else if (action === 'skapaFrånMall') {
      await skapaFrånMall(data.mall);
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
