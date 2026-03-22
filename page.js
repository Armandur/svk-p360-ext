// page.js – körs i sidans eget JS-scope (MAIN world)
// Har direkt tillgång till sidans globala funktioner som __doPostBack och Selectize.
// Kommunicerar med content.js (ISOLATED world) via CustomEvents.

// Skydda mot dubbel-injektion (executeScript körs ibland flera gånger).
// IIFE skapar ett eget scope – const-deklarationer krockar inte och
// return är giltigt för tidig exit vid ominjicering.
(function () {
if (window._p360PageJsLoaded) return;
window._p360PageJsLoaded = true;

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
        el.selectize.close();
        el.selectize.blur();
        // Selectize triggar internt ett jQuery change-event som jQuery 3.x
        // propagerar som ett nativt DOM-event → 360°:s onchange-attribut anropas.
        // Extra dispatchEvent får INTE skickas – det dubbeldirigerar PostBack-anropet
        // och ASP.NET ScriptManager avbryter det första UpdatePanel-svaret.
        resolve();
      } else if (Date.now() - t > 3000) {
        // Selectize ej initierad – sätt direkt och trigga change manuellt
        // (native el.value = x triggar inte DOM change-event automatiskt).
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });
}

/**
 * Sätter ett Selectize-fält tyst – utan att trigga onchange/PostBack.
 *
 * De flesta fält i nytt-ärende-formuläret har onchange-attribut som anropar
 * __doPostBack. ASP.NET ScriptManager kan bara hantera ett UpdatePanel-svar
 * åt gången; om flera PostBacks skickas tätt inpå varandra skriver svaren
 * över varandra och återställer fältvärden till default. Enbart
 * JournalUnitComboControl och AccessCodeComboControl behöver faktiskt trigga
 * en server-side UpdatePanel. Alla övriga fält sätts via den här funktionen
 * som tillfälligt tar bort onchange-attributet under setValue.
 */
async function sättSelectizeTyst(id, value, doc) {
  const d = doc || document;
  const el = d.getElementById(id);
  if (!el || !value) return;
  const onchange = el.getAttribute('onchange');
  el.removeAttribute('onchange');
  await sättSelectize(id, value, d);
  if (onchange !== null) el.setAttribute('onchange', onchange);
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

    await sleep(200);

    /**
     * Läser alternativ från ett Selectize-fält (primärt) eller native select (fallback).
     * Selectize lagrar alla AJAX-laddade alternativ i el.selectize.options som ett objekt
     * där nycklarna är värdena och värdena är { value, text/label }.
     */
    function läsOptions(id) {
      const el = doc.getElementById(id);
      if (!el) return [];

      // Filtrera tomma och ogiltiga platshållarvärden (-2 = "tom" i 360°-dropdowns)
      const ogiltiga = new Set(['', '-2', null, undefined]);

      // Primär strategi: läs från Selectize-cachade alternativ
      if (el.selectize && el.selectize.options) {
        return Object.values(el.selectize.options)
          .filter(o => !ogiltiga.has(o.value) && !ogiltiga.has(String(o.value)))
          .map(o => ({ value: String(o.value), label: (o.text || o.label || String(o.value)).trim() }));
      }

      // Fallback: läs från native select
      return Array.from(el.options)
        .filter(o => !ogiltiga.has(o.value))
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

    // Patcha __doPostBack i iframe för att logga alla anrop under körningen.
    // Avslöjar hur många PostBacks som skickas och från vilka fält.
    const _origPB = iWin.__doPostBack;
    iWin.__doPostBack = function(target, arg) {
      console.log('[p360] __doPostBack:', target, '| arg:', arg, '| tid:', Date.now());
      return _origPB.call(iWin, target, arg);
    };

    // pb: postback i formulärets eget fönster (via patchad version)
    const pb = (t, a) => iWin.__doPostBack(t, a);
    // sättSel: sätter Selectize-fält MED PostBack (JournalUnit och AccessCode behöver det)
    const sättSel = (id, val) => sättSelectize(id, val, iDoc);
    // sättSelTyst: sätter Selectize-fält UTAN PostBack (alla övriga fält)
    const sättSelTyst = (id, val) => sättSelectizeTyst(id, val, iDoc);

    const titelFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000);
    if (!titelFält) throw new Error('Formuläret laddades inte korrekt.');

    console.log('[p360] Formulär laddat. Startar fällfyllning. Mall:', JSON.stringify({
      titel: mall.titel, diarieenhet: mall.diarieenhet?.value,
      klassificering: mall.klassificering?.value, skyddskod: mall.skyddskod,
    }));
    visaStatus('Fyller i fält…');

    if (mall.diarieenhet?.value) {
      console.log('[p360] Sätter diarieenhet:', mall.diarieenhet.value);
      await sättSel('PlaceHolderMain_MainView_JournalUnitComboControl', mall.diarieenhet.value);
      console.log('[p360] Diarieenhet satt. Väntar 800 ms på eventuell UpdatePanel…');
      await sleep(800);
    }

    if (mall.delarkiv?.value) {
      console.log('[p360] Sätter delarkiv:', mall.delarkiv.value);
      await sättSelTyst('PlaceHolderMain_MainView_CaseSubArchiveComboControl', mall.delarkiv.value);
      console.log('[p360] Delarkiv satt.');
    }
    if (mall.atkomstgrupp?.value) {
      console.log('[p360] Sätter åtkomstgrupp:', mall.atkomstgrupp.value);
      await sättSelTyst('PlaceHolderMain_MainView_AccessGroupComboControl', mall.atkomstgrupp.value);
      console.log('[p360] Åtkomstgrupp satt.');
    }
    if (mall.ansvarigEnhet?.value) {
      console.log('[p360] Sätter ansvarig enhet:', mall.ansvarigEnhet.value);
      await sättSelTyst('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl', mall.ansvarigEnhet.value);
      console.log('[p360] Ansvarig enhet satt.');
    }
    if (mall.ansvarigPerson?.value) {
      console.log('[p360] Sätter ansvarig person:', mall.ansvarigPerson.value);
      await sättSelTyst('PlaceHolderMain_MainView_ResponsibleUserComboControl', mall.ansvarigPerson.value);
      console.log('[p360] Ansvarig person satt.');
    }

    console.log('[p360] Sätter status:', mall.status || '5');
    await sättSelTyst('PlaceHolderMain_MainView_StatusCaseComboControl', mall.status || '5');
    console.log('[p360] Status satt.');

    console.log('[p360] Sätter sparat på papper:', mall.sparatPaPapper || '0');
    await sättSelTyst('PlaceHolderMain_MainView_PaperDocAllowedComboControl', mall.sparatPaPapper || '0');
    console.log('[p360] Sparat på papper satt.');

    if (mall.skyddskod && mall.skyddskod !== '0') {
      console.log('[p360] Sätter skyddskod:', mall.skyddskod);
      // Sätt skyddskod och vänta på UpdatePanel-refresh (laddar paragraf-fälten).
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', mall.skyddskod);
      console.log('[p360] Skyddskod satt. Väntar på paragraf-fält i DOM…');

      // Vänta tills paragraf-fältet dyker upp (bekräftar att servern svarat).
      const paragrafFält = await waitForElement(
        iDoc, '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', 10000
      );
      console.log('[p360] Paragraf-fält hittades:', !!paragrafFält);

      // Selectize på paragraf-fältet är initialiserat direkt när UpdatePanel-svaret laddats –
      // ingen extra sleep behövs. Övriga fält (titel, accessCode m.m.) påverkas inte av svaret.
      if (paragrafFält && mall.sekretessParag) {
        console.log('[p360] Sätter paragraf:', mall.sekretessParag);
        await sättSelTyst('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', mall.sekretessParag);
        console.log('[p360] Paragraf satt.');
      }

      const checkbox = iDoc.getElementById('PlaceHolderMain_MainView_UnofficialContactCheckBoxControl');
      if (checkbox) {
        checkbox.checked = !!mall.skyddaKontakter;
        console.log('[p360] Skydda kontakter satt till:', checkbox.checked);
      }

      // SelectOfficialTitleComboBox har ett PostBack-onchange som laddar offentligTitel-fältet.
      // Sätt värdet tyst om val=1 eller 2 (inget UpdatePanel-svar behövs).
      // Sätt med PostBack om val=3 (offentlig titel-fältet laddas via UpdatePanel).
      console.log('[p360] Sätter offentligTitelVal:', mall.offentligTitelVal || '1');
      if ((mall.offentligTitelVal || '1') === '3') {
        await sättSel('PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl', '3');
      } else {
        await sättSelTyst('PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl', mall.offentligTitelVal || '1');
      }
      if (mall.offentligTitelVal === '3') {
        console.log('[p360] Väntar på offentlig titel-fält…');
        const offFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_PublicTitleTextBoxControl', 8000);
        if (offFält) {
          offFält.value = mall.offentligTitel || '';
          console.log('[p360] Offentlig titel satt:', offFält.value);
        } else {
          console.warn('[p360] Offentlig titel-fält hittades inte inom timeout.');
        }
      }
    } else {
      console.log('[p360] Skyddskod = offentlig (0), sätter AccessCode till 0.');
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', '0');
      console.log('[p360] AccessCode satt till 0.');
    }

    if (mall.externaKontakter?.length > 0) {
      console.log('[p360] Lägger till', mall.externaKontakter.length, 'externa kontakter.');
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'ContactsStep');
      visaStatus('Lägger till externa kontakter…');
      await sleep(1500);
      for (const kontakt of mall.externaKontakter) {
        console.log('[p360] Lägger till kontakt:', kontakt.namn);
        // pb skickas med för att postback-anrop ska ske i formulärets iframe-kontext.
        // Kontaktdialogerna hamnar i huvud-dokumentets body (window.top) som syskoniframes.
        await läggTillExternKontakt(kontakt, pb);
        console.log('[p360] Kontakt tillagd:', kontakt.namn);
        await sleep(500);
      }
    }

    if (mall.kommentar) {
      console.log('[p360] Sätter kommentar.');
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'NotesStep');
      await sleep(1000);
      const kFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_NotesStep_Control', 3000);
      if (kFält) {
        kFält.value = mall.kommentar;
        console.log('[p360] Kommentar satt.');
      } else {
        console.warn('[p360] Kommentar-fält hittades inte.');
      }
    }

    // Titel sätts sist, direkt innan submit – undviker att UpdatePanel-svar från
    // övriga fält (diarieenhet, ansvarig enhet m.m.) hinner ersätta DOM-noder och
    // nollställa värdet. Hämtar elementet färskt ur aktuell DOM (inte gammal referens).
    console.log('[p360] Sätter titel (sist, färskt element):', mall.titel);
    const titelElNu = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
    console.log('[p360] titelElNu hittades:', !!titelElNu, '| isConnected:', titelElNu?.isConnected);
    if (titelElNu) {
      titelElNu.value = mall.titel || '';
      titelElNu.dispatchEvent(new Event('input',  { bubbles: true }));
      titelElNu.dispatchEvent(new Event('change', { bubbles: true }));
      titelElNu.dispatchEvent(new Event('blur',   { bubbles: true }));
      console.log('[p360] Titel satt. titelElNu.value=', titelElNu.value);
    } else {
      console.error('[p360] FEL: titelElNu är null – formuläret kan ha laddats om.');
    }

    // Klassificering via OnClick_PostBack.
    // Servern kräver att en UpdatePanel-postback triggats för klassificeringsfältet
    // för att formuläret ska valideras. Utan den avvisar servern formuläret (200, ingen redirect).
    // Efter PostBack läses serversvaret – om servern skickat tillbaka recno används det värdet,
    // annars sätts det sparade recno-värdet om igen direkt på det (nytillagda) DOM-elementet.
    if (mall.klassificering?.value) {
      console.log('[p360] Sätter klassificering:', mall.klassificering.value, mall.klassificering.display);
      const vis  = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY');
      const dolt = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl');
      if (vis)  vis.value  = mall.klassificering.display || '';
      if (dolt) dolt.value = mall.klassificering.value;

      // Vänta på att ScriptManagers endRequest är klar (UpdatePanel processad och ViewState uppdaterat).
      await new Promise(resolve => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        const prm = iWin.Sys?.WebForms?.PageRequestManager?.getInstance();
        if (prm) {
          const handler = () => { prm.remove_endRequest(handler); done(); };
          prm.add_endRequest(handler);
        } else {
          // Ingen ScriptManager – lös direkt
          done();
          return;
        }
        pb('ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl_OnClick_PostBack', '');
        setTimeout(done, 5000);
      });

      // Sätt om klassificering på de (potentiellt) nytillagda DOM-elementen efter UpdatePanel
      const visFresh  = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY');
      const doltFresh = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl');
      if (visFresh)  visFresh.value  = mall.klassificering.display || '';
      if (doltFresh) doltFresh.value = mall.klassificering.value;
      console.log('[p360] Klassificering efter PostBack. dolt=', doltFresh?.value, '| display=', visFresh?.value);
    }

    // Snapshot av kritiska fält direkt innan submit
    console.log('[p360] Snapshot innan submit:', {
      titel:          iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl')?.value,
      diarieenhet:    iDoc.getElementById('PlaceHolderMain_MainView_JournalUnitComboControl')?.value,
      klassificering: iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl')?.value,
      accessCode:     iDoc.getElementById('PlaceHolderMain_MainView_AccessCodeComboControl')?.value,
      sparatPaPapper: iDoc.getElementById('PlaceHolderMain_MainView_PaperDocAllowedComboControl')?.value,
      status:         iDoc.getElementById('PlaceHolderMain_MainView_StatusCaseComboControl')?.value,
    });

    visaStatus('Skapar ärende…');

    // Skicka formuläret via fetch() – ger oss response.url (slutlig URL efter alla redirects)
    // och response-texten direkt, utan att behöva övervaka iframe-navigering eller XHR.
    // fetch() följer 302-redirects automatiskt; response.url är den SISTA URL:en i kedjan.
    // Om servern skapar ärendet och sedan redirectar till ärendesidan hittar vi recno i response.url.
    // Om servern redirectar till formuläret igen letar vi i svarstexten.

    const formEl  = iDoc.getElementById('form1');

    // Ta bort IsDlg=1 och dialogmode från POST-URL:en.
    // I IsDlg=1-läge returnerar servern formulär-HTML igen (för dialog-ramverket) i stället
    // för att göra en 302-redirect till ärendesidan. Utan dessa parametrar får vi en normal
    // redirect som fetch() kan följa via response.url.
    const rawFormUrl = formEl.action || iWin.location.href;
    const postUrlObj = new URL(rawFormUrl);
    postUrlObj.searchParams.delete('IsDlg');
    postUrlObj.searchParams.delete('dialogmode');
    const formUrl = postUrlObj.toString();

    const formData = new FormData(formEl);
    formData.set('__EVENTTARGET',  'ctl00$PlaceHolderMain$MainView$WizardNavigationButton');
    formData.set('__EVENTARGUMENT', 'finish');

    console.log('[p360] Skickar formulär via fetch. POST-URL:', formUrl,
      '| klassificering (hidden):', formData.get('ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl'),
      '| klassificering (display):', formData.get('ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl_DISPLAY'));

    const fetchSvar = await iWin.fetch(formUrl, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      redirect: 'follow',
    });

    const slutUrl   = fetchSvar.url;
    const svarText  = await fetchSvar.text();
    console.log('[p360] fetch response.url:', slutUrl, '| status:', fetchSvar.status);

    // Diagnostik: hitta klassificeringsfältets dolda INPUT-element i svarstexten
    // Sök efter type="hidden" nära klassificerings-ID:t för att se vilket value servern satte
    const hiddenKlassIdx = svarText.indexOf('ClassificationCode1ComboControl" value=');
    if (hiddenKlassIdx >= 0) {
      console.log('[p360] Klassificering hidden INPUT i svartext:', svarText.substring(hiddenKlassIdx, hiddenKlassIdx + 100));
    } else {
      // Fallback: visa ±400 tecken runt första förekomst
      const klassIdx = svarText.indexOf('ClassificationCode1ComboControl');
      if (klassIdx >= 0) {
        console.log('[p360] Klassificering i svartext (±400 tecken):', svarText.substring(Math.max(0, klassIdx - 50), klassIdx + 400));
      }
    }

    // Extrahera ärendeURL från redirect-URL:en eller svarstextens HTML.
    // I icke-IsDlg-läge skapar servern ärendet och returnerar en sida vars HTML
    // innehåller ärendesidans URL med recno. response.url är oftast fortfarande
    // formulär-URL (servern renderar svaret i samma view.aspx-skal).
    // Viktigt: formulär-HTML innehåller URL-mallar med subtype-numret 61000 (5 siffror)
    // som ger falska träffar – kräv ≥7 siffror i recno för att skilja ut riktiga ärendeID:n.
    let nyUrl = null;
    const postUrlNorm = formUrl.split('?')[0];
    const slutUrlNorm = slutUrl.split('?')[0];
    if (slutUrl.includes('/DMS/Case/Details/')) {
      nyUrl = slutUrl;
    } else {
      // Sök i svarstexten – recno är alltid ≥7 siffror (t.ex. 1355101), subtype 61000 är 5
      const patterns = [
        /\/locator\/DMS\/Case\/Details\/[^\s"'<&]+recno=(\d{7,})/,
        /commitPopup\s*\(\s*['"]?(\d{7,})['"]?\s*\)/,
        /recno[=\s:"']+(\d{7,})/i,
      ];
      for (const re of patterns) {
        const m = svarText.match(re);
        if (m) {
          const hit = m[1] || m[0];
          nyUrl = hit.startsWith('/') ? hit
            : `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${hit}`;
          break;
        }
      }
    }

    // Avkoda unicode-escapes (\u0026 → &) som kan finnas i URL:er från ScriptManager
    const renUrl = nyUrl?.replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    console.log('[p360] Ärendenavigering. URL:', renUrl);
    overlay.remove();
    if (renUrl?.includes('/DMS/Case/Details/')) {
      window.location.href = renUrl;
    } else {
      const ingenRedirect = slutUrlNorm === postUrlNorm;

      console.log('[p360] Skapande misslyckades. ingenRedirect=', ingenRedirect,
        '| slutUrl:', slutUrl, '| svarText (1000 tecken):', svarText.substring(0, 1000));
      alert(ingenRedirect
        ? 'Ärendet skapades inte – servern returnerade valideringsfel.\nSe konsolen för mer info.'
        : 'Ärendet skapades men navigering misslyckades.\nSe konsolen för detaljer.');
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

})(); // slut: IIFE-skydd mot dubbel-injektion
