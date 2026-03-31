// page-arende-create.js – Skapa ärende från mall
// Körs i sidans MAIN world. Beror på: sleep, waitForElement, sättSelectize, sättSelectizeTyst
// (page-utils.js), NY_ÄRENDE_URL (page-arende-options.js),
// läggTillExternKontakt (page-arende-contacts.js)

/**
 * Visar en dialogruta för att samla in extern kontaktinformation.
 * Returnerar ett kontaktobjekt eller null om användaren avbröt.
 * @param {Object} förifyllning - Befintliga kontaktuppgifter från mallen (valfri)
 */
function visaKontaktInmatning(förifyllning) {
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  förifyllning = förifyllning || {};
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99995;' +
      'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#fff;border-radius:8px;padding:24px;width:460px;max-width:95vw;max-height:90vh;overflow-y:auto;' +
      'font-size:14px;box-shadow:0 4px 24px rgba(0,0,0,0.3);box-sizing:border-box;';

    dialog.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:16px;color:#1a5276;">Ange extern kontakt</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Namn <span style="color:#c0392b;">*</span></label>
          <input id="p360pk-namn" type="text" value="${esc(förifyllning.namn || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Kontaktperson</label>
          <input id="p360pk-kontaktperson" type="text" value="${esc(förifyllning.kontaktperson || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">E-post</label>
          <input id="p360pk-epost" type="email" value="${esc(förifyllning.epost || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Telefon</label>
          <input id="p360pk-telefon" type="tel" value="${esc(förifyllning.telefon || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Adress</label>
        <input id="p360pk-adress" type="text" value="${esc(förifyllning.adress || '')}"
          style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
      </div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:10px;margin-bottom:16px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Postnummer</label>
          <input id="p360pk-postnummer" type="text" value="${esc(förifyllning.postnummer || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:3px;">Ort</label>
          <input id="p360pk-ort" type="text" value="${esc(förifyllning.ort || '')}"
            style="width:100%;padding:7px 9px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
        </div>
      </div>
      <div id="p360pk-fel" style="display:none;color:#c0392b;font-size:12px;margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="p360pk-avbryt" style="padding:7px 18px;background:#fff;color:#333;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;">Avbryt</button>
        <button id="p360pk-ok" style="padding:7px 18px;background:#0078d4;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;">OK</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    dialog.querySelector('#p360pk-namn').focus();

    const hämta = () => ({
      namn:          dialog.querySelector('#p360pk-namn').value.trim(),
      kontaktperson: dialog.querySelector('#p360pk-kontaktperson').value.trim(),
      epost:         dialog.querySelector('#p360pk-epost').value.trim(),
      telefon:       dialog.querySelector('#p360pk-telefon').value.trim(),
      adress:        dialog.querySelector('#p360pk-adress').value.trim(),
      postnummer:    dialog.querySelector('#p360pk-postnummer').value.trim(),
      ort:           dialog.querySelector('#p360pk-ort').value.trim(),
      roll:          förifyllning.roll || '9',
      kommentar:     förifyllning.kommentar || '',
    });

    dialog.querySelector('#p360pk-ok').addEventListener('click', () => {
      const k = hämta();
      if (!k.namn) {
        const fel = dialog.querySelector('#p360pk-fel');
        fel.textContent = 'Namn är obligatoriskt.';
        fel.style.display = '';
        dialog.querySelector('#p360pk-namn').focus();
        return;
      }
      overlay.remove();
      resolve(k);
    });

    dialog.querySelector('#p360pk-avbryt').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        dialog.querySelector('#p360pk-ok').click();
      } else if (e.key === 'Escape') {
        dialog.querySelector('#p360pk-avbryt').click();
      }
    });
  });
}

/**
 * Öppnar nytt-ärende-formuläret som ett synligt överläggsrutefönster och fyller det
 * med malldata, sedan skickar formuläret. Navigerar till det nyskapade ärendet.
 */
async function skapaFrånMall(mall) {
  // Steg 0: Kontaktprompt om mallen kräver det
  let promptadKontakt = null;
  if (mall.promptaKontakt) {
    const mallKontakt = mall.externaKontakter?.[0] || {};
    promptadKontakt = await visaKontaktInmatning(mallKontakt);
    if (promptadKontakt === null) return; // Användaren avbröt
    // Signalera till isolated world (content.js) att uppdatera pending ärendedokument med kontakten
    window.dispatchEvent(new CustomEvent('p360-kontakt-för-dokument', {
      detail: { namn: promptadKontakt.namn }
    }));
  }

  // Lista med kontakter att lägga till i ärendet:
  // – promptad kontakt ersätter mallens förregistrerade kontakter
  // – utan prompt används mallens kontaktlista som vanligt
  const kontakterAttLäggaTill = promptadKontakt
    ? [promptadKontakt]
    : (mall.externaKontakter || []);

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

    if (mall.diarieenhet?.value) {
      visaStatus('Fyller i fält…');
      await sättSel('PlaceHolderMain_MainView_JournalUnitComboControl', mall.diarieenhet.value);
      await sleep(800);
    } else {
      // Diarieenhet saknas i mallen – vänta tills Selectize laddat alternativ och be användaren välja
      await new Promise(resolve => {
        const start = Date.now();
        const check = setInterval(() => {
          const el = iDoc.getElementById('PlaceHolderMain_MainView_JournalUnitComboControl');
          const antal = el?.selectize
            ? Object.keys(el.selectize.options || {}).length
            : (el?.options?.length ?? 0);
          if (antal > 0 || Date.now() - start > 8000) { clearInterval(check); resolve(); }
        }, 200);
      });

      visaStatus('Välj diarieenhet i formuläret nedan och klicka Fortsätt.');

      const promptRad = document.createElement('div');
      promptRad.style.cssText =
        'display:flex;align-items:center;gap:8px;margin:6px 0 4px;flex-wrap:wrap;';

      const promptText = document.createElement('span');
      promptText.style.cssText =
        'color:#fff;font-family:sans-serif;font-size:13px;' +
        'background:rgba(160,70,0,0.9);padding:5px 12px;border-radius:4px;';
      promptText.textContent =
        'Diarieenhet saknas i mallen – välj en i formuläret nedan och klicka Fortsätt.';

      const fortsättKnapp = document.createElement('button');
      fortsättKnapp.textContent = 'Fortsätt';
      fortsättKnapp.style.cssText =
        'padding:6px 16px;background:#1a5276;color:#fff;' +
        'border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;';

      const avbrytKnapp = document.createElement('button');
      avbrytKnapp.textContent = 'Avbryt';
      avbrytKnapp.style.cssText =
        'padding:6px 16px;background:#666;color:#fff;' +
        'border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;';

      promptRad.appendChild(promptText);
      promptRad.appendChild(fortsättKnapp);
      promptRad.appendChild(avbrytKnapp);
      overlay.insertBefore(promptRad, iframe);

      const fortsätt = await new Promise(resolve => {
        fortsättKnapp.onclick = () => { promptRad.remove(); resolve(true); };
        avbrytKnapp.onclick = () => resolve(false);
      });

      if (!fortsätt) { overlay.remove(); return; }

      // Vänta på att UpdatePanel hinner uppdatera beroende fält (t.ex. delarkiv)
      await sleep(800);
      visaStatus('Fyller i fält…');
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

    const bytteFlik = kontakterAttLäggaTill.length > 0 || !!mall.kommentar;

    if (kontakterAttLäggaTill.length > 0) {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'ContactsStep');
      visaStatus('Lägger till externa kontakter…');
      await sleep(1500);
      for (const kontakt of kontakterAttLäggaTill) {
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

    // Hjälpfunktion: navigera till den nyskapade ärendesidan.
    // Pending ärendedokument är redan sparade av content.js innan MAIN world anropades,
    // så ingen extra sparning behövs här.
    const sparaPendingOchNavigera = (url) => {
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
