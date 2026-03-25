// page-arende-create.js – Skapa ärende från mall
// Körs i sidans MAIN world. Beror på: sleep, waitForElement, sättSelectize, sättSelectizeTyst
// (page-utils.js), NY_ÄRENDE_URL (page-arende-options.js),
// läggTillExternKontakt (page-arende-contacts.js)

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

    // Projekt – typeahead-fält likt klassificering
    if (mall.projekt?.value) {
      const sättProjekt = () => {
        const vis = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY');
        const dolt = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl');
        const lista = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl_dropDownList');
        if (vis) vis.value = mall.projekt.display || '';
        if (dolt) dolt.value = mall.projekt.value;
        if (lista) {
          if (!Array.from(lista.options).some(o => o.value === mall.projekt.value)) {
            const opt = iDoc.createElement('option');
            opt.value = mall.projekt.value;
            opt.text = mall.projekt.display || mall.projekt.value;
            lista.appendChild(opt);
          }
          lista.value = mall.projekt.value;
        }
      };

      const visInit = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY');
      if (visInit) visInit.value = (mall.projekt.display || '').split(' ')[0].trim() || mall.projekt.display || '';

      await väntalPåUpdatePanel(() =>
        pb('ctl00$PlaceHolderMain$MainView$ProjectQuickSearchControlHiddenButton', ''));
      sättProjekt();
    }

    // Fastighet – typeahead-fält likt klassificering
    if (mall.fastighet?.value) {
      const sättFastighet = () => {
        const vis = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl_DISPLAY');
        const dolt = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl');
        const lista = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl_dropDownList');
        if (vis) vis.value = mall.fastighet.display || '';
        if (dolt) dolt.value = mall.fastighet.value;
        if (lista) {
          if (!Array.from(lista.options).some(o => o.value === mall.fastighet.value)) {
            const opt = iDoc.createElement('option');
            opt.value = mall.fastighet.value;
            opt.text = mall.fastighet.display || mall.fastighet.value;
            lista.appendChild(opt);
          }
          lista.value = mall.fastighet.value;
        }
      };

      const visInit = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl_DISPLAY');
      if (visInit) visInit.value = (mall.fastighet.display || '').split(' ')[0].trim() || mall.fastighet.display || '';

      await väntalPåUpdatePanel(() =>
        pb('ctl00$PlaceHolderMain$MainView$EstateGeneralTabSearchControlHiddenButton', ''));
      sättFastighet();
    }

    if (mall.skyddskod && mall.skyddskod !== '0') {
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', mall.skyddskod);

      const paragrafFält = await waitForElement(
        iDoc, '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', 10000
      );
      if (paragrafFält && mall.sekretessParag) {
        // Vänta kort så att Selectize hinner initialiseras med options
        await sleep(500);
        await sättSelTyst('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', mall.sekretessParag);
        // Verifiera att värdet faktiskt sattes – om inte, försök igen
        const paragrafEl = iDoc.getElementById('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl');
        if (paragrafEl && paragrafEl.value !== mall.sekretessParag) {
          console.warn('[p360] Paragraf-värde sattes inte korrekt, försöker igen…',
            'Förväntat:', mall.sekretessParag, 'Fick:', paragrafEl.value);
          await sleep(1000);
          await sättSelTyst('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl', mall.sekretessParag);
          if (paragrafEl.value !== mall.sekretessParag) {
            console.error('[p360] Paragraf-värde kunde inte sättas.',
              'Tillgängliga options:', Array.from(paragrafEl.options).map(o => o.value));
          }
        }
      }

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

    // Hjälpfunktion: spara pending ärendedokument innan navigering
    const sparaPendingOchNavigera = (url) => {
      if (mall.ärendedokument?.length > 0) {
        window.dispatchEvent(new CustomEvent('p360-spara-pending-dokument', {
          detail: { dokument: mall.ärendedokument }
        }));
      }
      overlay.remove();
      window.location.href = url;
    };

    const ärendeUrl = (recno) =>
      `/locator/DMS/Case/Details/Simplified/61000?module=Case&subtype=61000&recno=${recno}`;

    iframe.Resize = () => {};
    iframe.IsLoading = true;

    iframe.commitPopup = (returnVal) => {
      const s = String(returnVal || '');
      if (s.includes('/DMS/') || s.includes('recno=')) {
        sparaPendingOchNavigera(s);
      } else if (/^\d{5,}$/.test(s)) {
        sparaPendingOchNavigera(ärendeUrl(s));
      }
    };
    iframe.cancelPopup = () => { overlay.remove(); };

    const origCloseCallback = window.SI?.UI?.ModalDialog?.CloseCallback;
    if (window.SI?.UI?.ModalDialog) {
      window.SI.UI.ModalDialog.CloseCallback = function(returnValue, ...args) {
        window.SI.UI.ModalDialog.CloseCallback = origCloseCallback;
        const s = String(returnValue || '');
        if (s.includes('/DMS/') || s.includes('recno=')) {
          sparaPendingOchNavigera(s);
        } else if (/^\d{5,}$/.test(s)) {
          sparaPendingOchNavigera(ärendeUrl(s));
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
        sparaPendingOchNavigera(ärendeUrl(recnoFrånXHR));
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
          sparaPendingOchNavigera(recno ? ärendeUrl(recno) : iHref);
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
