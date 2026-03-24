// page-arende.js – Skapa ärende från mall och hantera externa kontakter
// Körs i sidans MAIN world. Beror på: sleep, waitForNyIframe, waitForElement,
// sättSelectize, sättSelectizeTyst (page-utils.js)

// URL till nytt-ärende-formuläret i dialogläge. Laddas som iframe inom befintlig 360°-sida
// för att säkerställa rätt sessionskontekst – direktnavigering via GET fungerar ej.
// context-data måste innehålla alla tre parametrar som 360°:s menyknapp skickar:
//   subtype,Primary,61000  – ärendetyp
//   IsDlg,Primary,1        – dialog-flagga (context-data-versionen)
//   name,Primary,DMS.Case.New.61000 – formulärnamn (krävs för att servern ska
//                                      spara klassificering och övriga fält korrekt)
const NY_ÄRENDE_URL =
  '/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf' +
  '&dialogmode=true&IsDlg=1' +
  '&context-data=subtype%2cPrimary%2c61000%3bIsDlg%2cPrimary%2c1%3bname%2cPrimary%2cDMS.Case.New.61000%3b';

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
 */
async function försökLäsKlassificeringar(doc, win) {
  const dropDown = doc.getElementById(
    'PlaceHolderMain_MainView_ClassificationCode1ComboControl_dropDownList'
  );
  if (!dropDown) return [];

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

  await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const antal = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]').length;
      if (antal > 0 || Date.now() - start > 12000) { clearInterval(check); resolve(); }
    }, 300);
  });

  const items = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]');
  return Array.from(items)
    .filter(el => el.dataset.value && el.dataset.value !== '0')
    .map(el => ({ display: (el.title || el.textContent).trim(), value: el.dataset.value }));
}

/**
 * Öppnar nytt-ärende-formuläret som ett synligt överläggsrutefönster och fyller det
 * med malldata, sedan skickar formuläret. Navigerar till det nyskapade ärendet.
 */
async function skapaFrånMall(mall) {
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

    const _origPB = iWin.__doPostBack;
    iWin.__doPostBack = function(target, arg) { return _origPB.call(iWin, target, arg); };

    const pb = (t, a) => iWin.__doPostBack(t, a);
    const sättSel = (id, val) => sättSelectize(id, val, iDoc);
    const sättSelTyst = (id, val) => sättSelectizeTyst(id, val, iDoc);

    const titelFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000);
    if (!titelFält) throw new Error('Formuläret laddades inte korrekt.');

    const layoutStyle = iDoc.createElement('style');
    layoutStyle.textContent = `
      .si-wizard-maintable { margin-top: 50px !important; }
      #PlaceHolderMain_MainView_WizardFinishButton,
      #PlaceHolderMain_MainView_WizardCancelButton { display: none !important; }
    `;
    iDoc.head.appendChild(layoutStyle);

    visaStatus('Fyller i fält…');

    if (mall.diarieenhet?.value) {
      await sättSel('PlaceHolderMain_MainView_JournalUnitComboControl', mall.diarieenhet.value);
      await sleep(800);
    }
    if (mall.delarkiv?.value)
      await sättSelTyst('PlaceHolderMain_MainView_CaseSubArchiveComboControl', mall.delarkiv.value);
    if (mall.atkomstgrupp?.value)
      await sättSelTyst('PlaceHolderMain_MainView_AccessGroupComboControl', mall.atkomstgrupp.value);
    if (mall.ansvarigEnhet?.value)
      await sättSelTyst('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl', mall.ansvarigEnhet.value);
    if (mall.ansvarigPerson?.value)
      await sättSelTyst('PlaceHolderMain_MainView_ResponsibleUserComboControl', mall.ansvarigPerson.value);

    await sättSelTyst('PlaceHolderMain_MainView_StatusCaseComboControl', mall.status || '5');
    await sättSelTyst('PlaceHolderMain_MainView_PaperDocAllowedComboControl', mall.sparatPaPapper || '0');

    const väntalPåUpdatePanel = (fn) => new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const prm = iWin.Sys?.WebForms?.PageRequestManager?.getInstance();
      if (prm) {
        const handler = () => { prm.remove_endRequest(handler); finish(); };
        prm.add_endRequest(handler);
        fn();
        setTimeout(finish, 5000);
      } else {
        fn();
        finish();
      }
    });

    if (mall.klassificering?.value) {
      const sättKlassificering = () => {
        const vis = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY');
        const dolt = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl');
        const lista = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_dropDownList');
        if (vis) vis.value = mall.klassificering.display || '';
        if (dolt) dolt.value = mall.klassificering.value;
        if (lista) {
          if (!Array.from(lista.options).some(o => o.value === mall.klassificering.value)) {
            const opt = iDoc.createElement('option');
            opt.value = mall.klassificering.value;
            opt.text = mall.klassificering.display || mall.klassificering.value;
            lista.appendChild(opt);
          }
          lista.value = mall.klassificering.value;
        }
      };

      const visInit = iDoc.getElementById('PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY');
      if (visInit) {
        const displayText = mall.klassificering.display || '';
        visInit.value = displayText.split(' ')[0].trim() || displayText;
      }

      await väntalPåUpdatePanel(() =>
        pb('ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControlHiddenButton', ''));
      sättKlassificering();
    }

    if (mall.skyddskod && mall.skyddskod !== '0') {
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', mall.skyddskod);

      const paragrafFält = await waitForElement(
        iDoc, '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', 10000
      );
      if (paragrafFält && mall.sekretessParag)
        await sättSelTyst('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', mall.sekretessParag);

      const checkbox = iDoc.getElementById('PlaceHolderMain_MainView_UnofficialContactCheckBoxControl');
      if (checkbox) checkbox.checked = !!mall.skyddaKontakter;

      const offTitelVal = mall.offentligTitelVal || '1';
      await sättSelTyst('PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl', offTitelVal);
      await väntalPåUpdatePanel(() =>
        pb('ctl00$PlaceHolderMain$MainView$SelectOfficialTitleComboBoxControl', ''));
      if (offTitelVal === '3') {
        const offFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_PublicTitleTextBoxControl', 8000);
        if (offFält) {
          offFält.value = mall.offentligTitel || '';
        } else {
          console.warn('[p360] Offentlig titel-fält hittades inte inom timeout.');
        }
      }
    } else {
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', '0');
    }

    const bytteFlik = mall.externaKontakter?.length > 0 || !!mall.kommentar;

    if (mall.externaKontakter?.length > 0) {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'ContactsStep');
      visaStatus('Lägger till externa kontakter…');
      await sleep(1500);
      for (const kontakt of mall.externaKontakter) {
        await läggTillExternKontakt(kontakt, pb);
        await sleep(500);
      }
    }

    if (mall.kommentar) {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'NotesStep');
      await sleep(1000);
      const kFält = await waitForElement(iDoc, '#PlaceHolderMain_MainView_NotesStep_Control', 3000);
      if (kFält) {
        kFält.value = mall.kommentar;
      } else {
        console.warn('[p360] Kommentar-fält hittades inte.');
      }
    }

    if (bytteFlik) {
      visaStatus('Återgår till Generellt…');
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');
      await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 6000);
    }

    const titelElNu = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
    if (titelElNu) {
      titelElNu.value = mall.titel || '';
      titelElNu.dispatchEvent(new Event('input', { bubbles: true }));
      titelElNu.dispatchEvent(new Event('change', { bubbles: true }));
      titelElNu.dispatchEvent(new Event('blur', { bubbles: true }));
    } else {
      console.error('[p360] FEL: titelElNu är null – formuläret kan ha laddats om.');
    }

    const topUrlFör = window.location.href;

    iframe.Resize = () => {};
    iframe.IsLoading = true;

    iframe.commitPopup = (returnVal) => {
      overlay.remove();
      const s = String(returnVal || '');
      if (s.includes('/DMS/') || s.includes('recno=')) {
        window.location.href = s;
      } else if (/^\d{5,}$/.test(s)) {
        window.location.href =
          `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${s}`;
      }
    };
    iframe.cancelPopup = () => { overlay.remove(); };

    const origCloseCallback = window.SI?.UI?.ModalDialog?.CloseCallback;
    if (window.SI?.UI?.ModalDialog) {
      window.SI.UI.ModalDialog.CloseCallback = function(returnValue, ...args) {
        window.SI.UI.ModalDialog.CloseCallback = origCloseCallback;
        overlay.remove();
        const s = String(returnValue || '');
        if (s.includes('/DMS/') || s.includes('recno=')) {
          window.location.href = s;
        } else if (/^\d{5,}$/.test(s)) {
          window.location.href =
            `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${s}`;
        } else if (origCloseCallback) {
          origCloseCallback.call(this, returnValue, ...args);
        }
      };
    }

    if (iWin.SI?.UI?.ModalDialog) {
      const iMD = iWin.SI.UI.ModalDialog;
      const origGetChildDialog = iMD.get_childDialog?.bind(iMD);
      iMD.get_childDialog = function() { return origGetChildDialog?.() ?? iframe; };
    }

    let fångaFinishSvar = false;
    let recnoFrånXHR = null;
    const origXHROpen = iWin.XMLHttpRequest.prototype.open;
    iWin.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (fångaFinishSvar && String(url).includes('view.aspx')) {
        this.addEventListener('load', function() {
          const svar = this.responseText;
          const m = svar.match(/recno[=:](\d+)/i)
                 || svar.match(/"recno"\s*:\s*"?(\d+)"?/i);
          if (m) {
            recnoFrånXHR = m[1];
          }
        });
      }
      return origXHROpen.call(this, method, url, ...rest);
    };

    const submitFn = () => {
      fångaFinishSvar = true;
      const slutförBtn = iDoc.querySelector(
        'input[onclick*="WizardNavigationButton"][onclick*="finish"],' +
        'a[onclick*="WizardNavigationButton"][onclick*="finish"],' +
        'button[onclick*="WizardNavigationButton"][onclick*="finish"]'
      );
      if (slutförBtn) {
        slutförBtn.click();
      } else {
        pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
      }
    };

    if (mall.debugPauseKlassificering) {
      visaStatus('Granska fälten i formuläret – klicka Skicka nedan när du är redo.');

      const knappRad = document.createElement('div');
      knappRad.style.cssText = 'display:flex;gap:8px;margin:8px 0 4px;';

      const slutförKnapp = document.createElement('button');
      slutförKnapp.textContent = 'Skicka (skapa ärende)';
      slutförKnapp.style.cssText =
        'padding:7px 18px;background:#1a5276;color:#fff;' +
        'border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;';

      const avbrytKnapp = document.createElement('button');
      avbrytKnapp.textContent = 'Avbryt';
      avbrytKnapp.style.cssText =
        'padding:7px 18px;background:#666;color:#fff;' +
        'border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;';

      knappRad.appendChild(slutförKnapp);
      knappRad.appendChild(avbrytKnapp);
      overlay.insertBefore(knappRad, iframe);

      const fortsätt = await new Promise(resolve => {
        slutförKnapp.onclick = () => { knappRad.remove(); visaStatus('Skapar ärende…'); submitFn(); resolve(true); };
        avbrytKnapp.onclick = () => { resolve(false); };
      });

      if (!fortsätt) { overlay.remove(); return; }
    } else {
      visaStatus('Skapar ärende…');
      submitFn();
    }

    let navigerad = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await sleep(300);

      if (window.location.href !== topUrlFör) {
        navigerad = true;
        break;
      }

      if (recnoFrånXHR) {
        const målUrl = `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${recnoFrånXHR}`;
        overlay.remove();
        window.location.href = målUrl;
        return;
      }

      try {
        const iHref = iframe.contentWindow?.location?.href || '';
        if (iHref.includes('UnhandledError')) {
          overlay.remove();
          alert('360° rapporterade ett serverfel vid ärendeskapande. Kontrollera 360° manuellt.');
          return;
        }
        if (iHref.includes('recno=') && !iHref.includes('cf7c6540')) {
          const recno = new URLSearchParams(iHref.split('?')[1] || '').get('recno');
          const målUrl = recno
            ? `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${recno}`
            : iHref;
          overlay.remove();
          window.location.href = målUrl;
          return;
        }
      } catch { /* cross-origin */ }
    }

    overlay.remove();

    if (!navigerad) {
      let valideringsfel = [];
      try {
        const nyDoc = iframe.contentDocument;
        if (nyDoc) {
          valideringsfel = Array.from(nyDoc.querySelectorAll('span.ms-formvalidation'))
            .filter(el => !el.id?.includes('mandatory') && el.textContent.trim().length > 2)
            .map(el => el.textContent.trim());
        }
      } catch { /* cross-origin */ }
      if (valideringsfel.length > 0) {
        alert('Ärendet kunde inte skapas. Valideringsfel:\n' + valideringsfel.join('\n'));
      } else {
        alert('Ärendet skapades troligen inte – ingen navigering detekterades inom 30 s.');
      }
    }
  } catch (err) {
    overlay.remove();
    throw err;
  }
}

/**
 * Lägger till en oregistrerad extern kontakt via 360°:s multi-stegsdialog.
 * (NewActivityContact → JournalCaseContactNew → ev. DuplicateContacts)
 */
async function läggTillExternKontakt(kontakt, pb = __doPostBack) {
  pb('ctl00$PlaceHolderMain$MainView$AddUnregCasePartMenuButtonControl_DropDownMenu', kontakt.roll || '9');

  const typIframe = await waitForNyIframe('NewActivityContact', 8000);
  if (!typIframe) { alert('Typ-dialogen öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  const typDoc = typIframe.contentDocument;
  await waitForElement(typDoc, '#PlaceHolderMain_MainView_ContactTypeComboBoxControl', 3000);

  const typSel = typDoc.getElementById('PlaceHolderMain_MainView_ContactTypeComboBoxControl');
  if (typSel?.selectize) { typSel.selectize.setValue('0'); } else if (typSel) { typSel.value = '0'; }
  await sleep(200);

  typIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');

  const kontaktIframe = await waitForNyIframe('JournalCaseContactNew', 10000);
  if (!kontaktIframe) { alert('Kontaktformuläret öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  await waitForElement(kontaktIframe.contentDocument, '#PlaceHolderMain_MainView_ContactNameControl', 5000);
  const kDoc = kontaktIframe.contentDocument;

  const sättFält = (id, val) => {
    const el = kDoc.getElementById(id);
    if (el && val) {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  sättFält('PlaceHolderMain_MainView_ContactNameControl', kontakt.namn);
  sättFält('PlaceHolderMain_MainView_ContactName2Control', kontakt.kontaktperson);
  sättFält('PlaceHolderMain_MainView_ContactAddressControl', kontakt.adress);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipCode_zip_code', kontakt.postnummer);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipPlace_zip_place', kontakt.ort);
  sättFält('PlaceHolderMain_MainView_ContactEmailControl', kontakt.epost);
  sättFält('PlaceHolderMain_MainView_Phone', kontakt.telefon);
  sättFält('PlaceHolderMain_MainView_ContactNotesControl', kontakt.kommentar);

  await sleep(300);
  kontaktIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');

  await sleep(1500);
  const dubblettIframe = Array.from(document.querySelectorAll('iframe')).find(f => {
    try { return f.src?.includes('DuplicateContacts') || f.contentDocument?.location?.href?.includes('DuplicateContacts'); }
    catch { return false; }
  });
  if (dubblettIframe) {
    dubblettIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'no');
    await sleep(1000);
  }

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
