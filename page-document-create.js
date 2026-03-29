// page-document-create.js – Orkestrering av ärendedokumentskapande
// Körs i sidans MAIN world. Beror på:
//   page-utils.js (sleep, waitForElement, waitForNyIframe, sättSelectize, sättSelectizeTyst)
//   page-document-validate.js (kontrolleraObligatoriskaFält, valideraHandlingstyp, escHtml)
//   page-document-fill.js (fyllDokumentFormulär)

/**
 * Visar dokumentformuläret för användaren och väntar på att de klickar Slutför
 * eller Avbryt.
 *
 * Returnerar ett objekt:
 *   { cancelled: false } – användaren slutförde formuläret (RepeatWizardDialog dök upp)
 *   { cancelled: true }  – användaren klickade Avbryt
 */
function väntaPåAnvändarensSlutför(iframe, tommaFält) {
  return new Promise((resolve, reject) => {
    // 360° använder native <dialog> (HTML5) via showModal().
    // showModal() gör allt utanför dialogen INERT – inga klick går igenom.
    // Därför MÅSTE vår banner placeras INUTI dialog-elementet.
    //
    // 360°:s CSS (och ev. JS) sätter stilar med hög specificitet som slår
    // inline-styles. Lösning: en <style>-tag med !important och ett
    // data-attribut som selektor.
    const dialog = iframe.closest('dialog');

    if (dialog) {
      dialog.setAttribute('data-p360-manual-dialog', '');
    }

    // Injicera en <style>-tag med !important – slår 360°:s inline-styles
    const styleTag = document.createElement('style');
    styleTag.id = 'p360-manuell-style';
    styleTag.textContent = `
      dialog[data-p360-manual-dialog] {
        position: fixed !important;
        inset: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        background: rgba(0,0,0,0.5) !important;
        transform: none !important;
        overflow: hidden !important;
      }
      dialog[data-p360-manual-dialog] > .old-ms-Dialog-header,
      dialog[data-p360-manual-dialog] > .old-ms-Dialog-HorizontalLine,
      dialog[data-p360-manual-dialog] .old-ms-Dialog-buttonOther {
        display: none !important;
      }
      dialog[data-p360-manual-dialog] > .old-ms-Dialog-main {
        position: absolute !important;
        top: 42px !important;
        bottom: 10px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: 95% !important;
        max-width: 980px !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        border: 3px solid #e67e22 !important;
        border-radius: 6px !important;
        overflow: hidden !important;
      }
      dialog[data-p360-manual-dialog] .old-ms-Dialog-inner {
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      dialog[data-p360-manual-dialog] .old-ms-Dialog-content {
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      dialog[data-p360-manual-dialog] .old-ms-Dialog-content iframe {
        width: 100% !important;
        height: 100% !important;
        border: none !important;
      }
      #p360-manuell-banner {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 42px !important;
        background: #e67e22 !important;
        color: #fff !important;
        font-family: sans-serif !important;
        font-size: 13px !important;
        padding: 0 16px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 12px !important;
        box-sizing: border-box !important;
        z-index: 1 !important;
      }
    `;
    document.head.appendChild(styleTag);

    // Skapa infobanner – placeras INUTI dialogen
    const banner = document.createElement('div');
    banner.id = 'p360-manuell-banner';

    const bannerText = document.createElement('span');
    bannerText.textContent =
      `Fyll i: ${tommaFält.join(', ')} – klicka sedan Slutför i formuläret.`;
    banner.appendChild(bannerText);

    const avbrytBtn = document.createElement('button');
    avbrytBtn.textContent = 'Avbryt';
    avbrytBtn.style.cssText =
      'padding:5px 14px;background:#c0392b;color:#fff;border:none;border-radius:4px;' +
      'cursor:pointer;font-size:12px;font-family:sans-serif;white-space:nowrap;';
    banner.appendChild(avbrytBtn);

    if (dialog) {
      dialog.insertBefore(banner, dialog.firstChild);
    } else {
      // Fallback om dialog inte hittas
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:2000001;height:42px;' +
        'background:#e67e22;color:#fff;font-family:sans-serif;font-size:13px;' +
        'padding:0 16px;display:flex;align-items:center;justify-content:center;gap:12px;';
      document.body.appendChild(banner);
    }

    const TIMEOUT = 300000; // 5 minuter
    const timer = setTimeout(() => {
      rensa();
      reject(new Error('Timeout – användaren fyllde inte i formuläret inom 5 minuter.'));
    }, TIMEOUT);

    let obs;

    function rensa() {
      clearTimeout(timer);
      if (obs) obs.disconnect();
      banner.remove();
      styleTag.remove();
      if (dialog) dialog.removeAttribute('data-p360-manual-dialog');
    }

    // Avbryt-knapp – klicka formulärets egen Avbryt så 360° stänger dialogen korrekt
    avbrytBtn.addEventListener('click', () => {
      rensa();
      // Hitta formulär-iframen och klicka dess WizardCancelButton (kör ExecCancel)
      if (dialog) {
        const iframe = dialog.querySelector('iframe');
        try {
          const cancelBtn = iframe?.contentDocument?.getElementById(
            'PlaceHolderMain_MainView_WizardCancelButton'
          );
          if (cancelBtn) {
            cancelBtn.click();
          } else {
            const stängBtn = dialog.querySelector('.js-DialogAction--close');
            if (stängBtn) stängBtn.click();
          }
        } catch (e) {
          const stängBtn = dialog.querySelector('.js-DialogAction--close');
          if (stängBtn) stängBtn.click();
        }
      }
      // ExecCancel stänger formuläret men lämnar kvar dialogskal och loader.
      // Rensa bort alla öppna 360°-dialoger efter en kort fördröjning.
      setTimeout(() => {
        const allaDialoger = document.querySelectorAll('dialog');
        allaDialoger.forEach(d => {
          if (d.hasAttribute('open') || d.classList.contains('is-open')) {
            const parent = d.parentElement;
            d.close?.();
            d.remove();
            if (parent && parent.tagName === 'DIV' && parent.children.length === 0 && !parent.id) {
              parent.remove();
            }
          }
        });
      }, 1500);
      resolve({ cancelled: true });
    });

    // Bevaka DOM:en efter RepeatWizardDialog (= dokumentet sparades)
    obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          const iframes = node.tagName === 'IFRAME' ? [node]
            : Array.from(node.querySelectorAll?.('iframe') ?? []);
          for (const f of iframes) {
            try {
              const src = f.src || f.contentDocument?.location?.href || '';
              if (src.includes('RepeatWizardDialog')) {
                rensa();
                resolve({ cancelled: false });
                return;
              }
            } catch { /* cross-origin */ }
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Kontrollera även redan existerande iframes
    for (const f of document.querySelectorAll('iframe')) {
      try {
        const src = f.src || '';
        if (src.includes('RepeatWizardDialog')) {
          rensa();
          resolve({ cancelled: false });
          return;
        }
      } catch { /* cross-origin */ }
    }
  });
}

/**
 * Pollar efter RepeatWizardDialog med tidig exit:
 * - Returnerar direkt när RepeatWizardDialog hittas
 * - Returnerar tidigt om valideringsfel redan syns i formuläret
 */
async function väntaPåRepeatEllerFel(iDoc, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Om 360° hamnar i UnhandledError är det meningslöst att vänta på RepeatWizardDialog.
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      try {
        const src = f.src || f.contentDocument?.location?.href || '';
        if (src.includes('UnhandledError')) {
          throw new Error('360° rapporterade ett serverfel (UnhandledError).');
        }
      } catch {
        // ignore
      }
    }

    const repeatIframe = Array.from(document.querySelectorAll('iframe')).find(f => {
      try {
        const src = f.src || f.contentDocument?.location?.href || '';
        return src.includes('RepeatWizardDialog');
      } catch {
        return false;
      }
    });
    if (repeatIframe) {
      return { repeatIframe, valideringsfel: [] };
    }

    let valideringsfel = [];
    try {
      valideringsfel = Array.from(iDoc.querySelectorAll('span.ms-formvalidation'))
        .filter(el => !el.id?.includes('mandatory') && el.textContent.trim().length > 2)
        .map(el => el.textContent.trim());
    } catch { /* ignorera */ }

    if (valideringsfel.length > 0) {
      return { repeatIframe: null, valideringsfel };
    }

    await sleep(250);
  }

  return { repeatIframe: null, valideringsfel: [] };
}

/**
 * Triggar "Slutför" i dokumentguiden robust.
 * Prioriterar fysisk knapp; fallback till __doPostBack endast om funktionen finns.
 */
async function triggaDokumentSlutför(iDoc, iWin) {
  const väljare =
    'input[onclick*="WizardNavigationButton"][onclick*="finish"],' +
    'a[onclick*="WizardNavigationButton"][onclick*="finish"],' +
    'button[onclick*="WizardNavigationButton"][onclick*="finish"]';

  const slutförBtn = iDoc.querySelector(väljare);
  if (slutförBtn) {
    // Undvik .click() på <a href="javascript:..."> då CSP kan blockera.
    const tag = (slutförBtn.tagName || '').toUpperCase();
    const onclick = slutförBtn.getAttribute?.('onclick') || '';
    const href = slutförBtn.getAttribute?.('href') || '';
    const extractPostBack = (s) => {
      const m = String(s || '').match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
      return m ? { target: m[1], arg: m[2] } : null;
    };
    const pb = extractPostBack(onclick) || extractPostBack(href);
    const standardWizardTarget = 'ctl00$PlaceHolderMain$MainView$WizardNavigationButton';
    const standardWizardArg = 'finish';
    if (typeof iWin?.__doPostBack === 'function') {
      const useTarget = pb?.target && pb.target.includes('WizardNavigationButton')
        ? pb.target
        : standardWizardTarget;
      const useArg = (pb?.arg && String(pb.arg).trim().length > 0) ? pb.arg : standardWizardArg;
      iWin.__doPostBack(useTarget, useArg);
      return 'postback-standardized';
    }
    slutförBtn.click();
    return 'button';
  }

  if (typeof iWin?.__doPostBack === 'function') {
    iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
    return 'postback';
  }

  // Kort retry: iframe kan vara mitt i DOM-byte efter UpdatePanel.
  await sleep(300);
  const slutförBtn2 = iDoc.querySelector(väljare);
  if (slutförBtn2) {
    const tag = (slutförBtn2.tagName || '').toUpperCase();
    const onclick = slutförBtn2.getAttribute?.('onclick') || '';
    const href = slutförBtn2.getAttribute?.('href') || '';
    const extractPostBack = (s) => {
      const m = String(s || '').match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
      return m ? { target: m[1], arg: m[2] } : null;
    };
    const pb = extractPostBack(onclick) || extractPostBack(href);
    const standardWizardTarget = 'ctl00$PlaceHolderMain$MainView$WizardNavigationButton';
    const standardWizardArg = 'finish';
    if (typeof iWin?.__doPostBack === 'function') {
      const useTarget = pb?.target && pb.target.includes('WizardNavigationButton')
        ? pb.target
        : standardWizardTarget;
      const useArg = (pb?.arg && String(pb.arg).trim().length > 0) ? pb.arg : standardWizardArg;
      iWin.__doPostBack(useTarget, useArg);
      return 'postback-standardized-retry';
    }
    slutförBtn2.click();
    return 'button-retry';
  }

  if (typeof iWin?.__doPostBack === 'function') {
    iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
    return 'postback-retry';
  }

  throw new Error('Kunde inte trigga Slutför: knapp saknas och __doPostBack är ej tillgänglig.');
}

function triggaCompleteViaDom(iDoc, iWin) {
  const extractPostBack = (s) => {
    const m = String(s || '').match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
    return m ? { target: m[1], arg: m[2] } : null;
  };

  // Försök 1: hitta element med onclick som triggar CompleteWizardHiddenEventControl
  const el = iDoc.querySelector(
    '[onclick*="CompleteWizardHiddenEventControl"],' +
    '[href*="CompleteWizardHiddenEventControl"],' +
    '[name*="CompleteWizardHiddenEventControl"],' +
    'input[type="hidden"][name*="CompleteWizardHiddenEventControl"]'
  );

  if (el) {
    const onclick = el.getAttribute?.('onclick') || '';
    const href = el.getAttribute?.('href') || '';
    const pb = extractPostBack(onclick) || extractPostBack(href);
    if (pb && typeof iWin?.__doPostBack === 'function') {
      iWin.__doPostBack(pb.target, pb.arg);
      return true;
    }
  }

  if (typeof iWin?.__doPostBack === 'function') {
    iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$CompleteWizardHiddenEventControl', '');
    return true;
  }

  return false;
}

/**
 * Säkerställer att vi står på Generellt-fliken och att basfält finns i DOM.
 * Gör ett extra GeneralStep-postback om formulärfälten inte finns ännu.
 */
async function säkerställGenerelltFlik(iframe) {
  const harBasfält = (doc) =>
    !!doc?.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl') &&
    !!doc?.getElementById('PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl');

  const navigeraTillGenerellt = (doc, win) => {
    // Försök 1: klicka flikrubriken om den finns
    const generalTab = doc?.getElementById('PlaceHolderMain_MainView_BIFWizard_step_0')
      || doc?.querySelector('[onclick*="WizardNavigationButton"][onclick*="GeneralStep"]');
    if (generalTab) {
      generalTab.click();
      return true;
    }
    // Försök 2: direkt postback
    if (typeof win?.__doPostBack === 'function') {
      win.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');
      return true;
    }
    return false;
  };

  // Upp till 3 försök med färska iframe-referenser varje varv
  for (let försök = 0; försök < 3; försök++) {
    const iDoc = iframe.contentDocument;
    const iWin = iframe.contentWindow;
    if (harBasfält(iDoc)) return true;

    await väntaPåPRM(iWin, 8000);
    const skickad = navigeraTillGenerellt(iDoc, iWin);
    if (!skickad) {
      await sleep(500);
      continue;
    }

    // Vänta längre; i vissa lägen tar PRM + updatepanel tid
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const d = iframe.contentDocument;
      const w = iframe.contentWindow;
      if (harBasfält(d)) return true;
      await väntaPåPRM(w, 4000);
      await sleep(250);
    }
  }
  return false;
}

/**
 * Skapar ett enskilt ärendedokument via formuläret på ärendesidan.
 * Förutsätter att vi befinner oss på en ärendedetaljsida.
 *
 * @param {Object} dok  – Dokumentmall med fält (se fyllDokumentFormulär)
 * @param {Function} visaStatus – Callback för statustext
 * @param {Function} [ärAvbruten] – Callback som returnerar true vid avbryt
 * @returns {string|null} Dokumentnumret (t.ex. "KHS 2026-0062:1") eller null
 */
async function skapaÄrendedokument(dok, visaStatus, ärAvbruten) {
  visaStatus = visaStatus || (() => {});
  // Tillfälligt testläge: injicera inte upload-hidden-fälten efter att vi byter tillbaka
  // till Generellt-fliken. Detta för att isolera om reinjiceringen orsakar/utlöser felet.
  // Efter test: sätt tillbaka till false.
  const SKIP_UPLOAD_HIDDEN_INJECTION_FOR_TEST = false;

  // ---------------------------------------------------------------
  // 0. Validera handlingstyp mot ärendets klassificering
  // ---------------------------------------------------------------
  const htVal = await valideraHandlingstyp(dok);
  if (!htVal.ok) {
    const msg = `Mallens handlingstyp "${htVal.mallText}" tillhör klassificering ${htVal.mallKlass}, ` +
      `men ärendet har klassificering ${htVal.ärendeKlass}. ` +
      `Handlingstypen kommer troligen inte finnas i formuläret.`;
    console.warn('[p360-dok]', msg);
    visaStatus(msg);

    // Fråga användaren om de vill fortsätta
    const fortsätt = await new Promise(resolve => {
      const bar = document.createElement('div');
      bar.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;' +
        'background:#b35900;color:#fff;font-family:sans-serif;font-size:13px;' +
        'padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
        'display:flex;flex-direction:column;gap:8px;';
      bar.innerHTML =
        `<strong>Handlingstypen matchar inte ärendets klassificering</strong>` +
        `<div>Mallen har handlingstyp <strong>${escHtml(htVal.mallText)}</strong> (klass ${escHtml(htVal.mallKlass)}), ` +
        `men ärendet har klassificering <strong>${escHtml(htVal.ärendeKlass)}</strong>.</div>` +
        `<div>Du kan fortsätta ändå – handlingstypen hoppas över och du får välja manuellt i formuläret.</div>` +
        `<div style="display:flex;gap:8px;margin-top:4px;">` +
        `<button id="p360-ht-fortsätt" style="padding:5px 14px;background:#fff;color:#333;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px;">Fortsätt utan handlingstyp</button>` +
        `<button id="p360-ht-avbryt" style="padding:5px 14px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Avbryt</button>` +
        `</div>`;
      document.body.appendChild(bar);
      bar.querySelector('#p360-ht-fortsätt').addEventListener('click', () => { bar.remove(); resolve(true); });
      bar.querySelector('#p360-ht-avbryt').addEventListener('click', () => { bar.remove(); resolve(false); });
    });

    if (!fortsätt) return { cancelled: true };

    // Nollställ handlingstyp i dok så att den hoppas över
    dok = { ...dok, handlingstyp: null };
  }

  if (ärAvbruten?.()) return { cancelled: true };

  // ---------------------------------------------------------------
  // 1. Öppna dokumentformuläret via PostBack
  // ---------------------------------------------------------------
  visaStatus('Öppnar dokumentformulär…');
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$DocumentActionMenuControl_DropDownMenu',
    '61000'
  );

  // Vänta på att iframe laddas (kan vara /Document/New/ eller view.aspx-id)
  const iframe = await waitForNyIframe('Document/New', 15000)
              || await waitForNyIframe('70158b84-a8eb-492a-a546-277ee96e16f9', 5000);
  if (!iframe) throw new Error('Dokumentformuläret öppnades inte.');

  let iDoc = iframe.contentDocument;
  let iWin = iframe.contentWindow;

  // Vänta på att formuläret laddats
  const titelFält = await waitForElement(
    iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000
  );
  if (!titelFält) throw new Error('Dokumentformuläret laddades inte korrekt.');

  // ---------------------------------------------------------------
  // 2. Konvertera base64-filer till File-objekt
  // ---------------------------------------------------------------
  if (dok.filerBase64 && dok.filerBase64.length > 0 && (!dok.filer || dok.filer.length === 0)) {
    dok.filer = dok.filerBase64.map(f => {
      const binär = atob(f.base64);
      const bytes = new Uint8Array(binär.length);
      for (let j = 0; j < binär.length; j++) bytes[j] = binär.charCodeAt(j);
      return new File([bytes], f.namn, { type: f.typ || 'application/octet-stream' });
    });
  }

  // ---------------------------------------------------------------
  // 3. Ladda upp filer (om filer finns) INNAN formulärfyllning.
  //
  //    Ordning är kritisk: om fälten fylls i FÖRE steg 3-postbacken
  //    (hiddenUploadButton) ser 360°:s server ett "komplett" formulär
  //    i ViewState och skapar dokumentet automatiskt – vilket navigerar
  //    huvudramen och dödar MAIN-world-körningen mitt i flödet.
  //
  //    Lösning: ladda upp på ett tomt formulär (inga fält satta ännu),
  //    spara SI_HiddenField_ScannedFilepath / hiddenUploadedFiles från
  //    Filer-flikens DOM, navigera tillbaka till Generellt, återinjicera
  //    sparade fält (de rensas av server-svaret för GeneralStep), fyll
  //    sedan i fälten och skicka från Generellt.
  // ---------------------------------------------------------------
  if (dok.filer && dok.filer.length > 0) {
    visaStatus('Laddar upp filer…');
    const uploadRes = await laddaUppFiler(iframe, dok.filer, visaStatus, ärAvbruten);
    if (uploadRes.misslyckade.length > 0) {
      throw new Error(
        'Följande filer kunde inte registreras i dokumentet: ' +
        uploadRes.misslyckade.join(', ')
      );
    }

    if (uploadRes.lyckade.length > 0) {
      // Spara upload-relaterade hidden fields INNAN navigering tillbaka.
      // SI_HiddenField_ScannedFilepath sätts av servern i Filer-flikens
      // UpdatePanel-region och försvinner när servern renderar Generellt igen.
      const uppladdningsFält = Array.from(iDoc.querySelectorAll('input[type="hidden"]'))
        .filter(el => {
          const key = (el.id + '|' + el.name).toLowerCase();
          return key.includes('scannedfilepath') || key.includes('hiddenuploadedfiles');
        })
        .map(el => ({ id: el.id, name: el.name, value: el.value }))
        .filter(f => f.value);

      // Navigera tillbaka till Generellt för formulärfyllning och Slutför
      visaStatus('Återgår till Generellt…');
      await väntaPåPRM(iWin, 5000);
      iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');
      await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 8000);
      await väntaPåPRM(iWin, 5000);
      const ärGenerelltRedo = await säkerställGenerelltFlik(iframe);
      if (!ärGenerelltRedo) {
        throw new Error('Kunde inte återgå till Generellt-fliken efter filuppladdning.');
      }
      iDoc = iframe.contentDocument;
      iWin = iframe.contentWindow;

      // Återinjicera upload-fält som rensats av GeneralStep-server-svaret
      if (!SKIP_UPLOAD_HIDDEN_INJECTION_FOR_TEST) {
        for (const fält of uppladdningsFält) {
          const id = fält.id || '';
          const name = fält.name || '';

          // Dedupe: undvik flera hidden-inputs med samma name/id (kan ge flera värden i postback).
          // Ta bort alla matchande (förutom den första) innan vi skriver värdet.
          let kandidat = null;
          if (id) {
            const alla = Array.from(iDoc.querySelectorAll(`input[type="hidden"]#${CSS.escape(id)}`));
            if (alla.length > 0) {
              kandidat = alla[0];
              for (const extra of alla.slice(1)) extra.remove();
            }
          } else if (name) {
            const alla = Array.from(iDoc.querySelectorAll(`input[type="hidden"][name="${CSS.escape(name)}"]`));
            if (alla.length > 0) {
              kandidat = alla[0];
              for (const extra of alla.slice(1)) extra.remove();
            }
          }

          if (kandidat) {
            kandidat.value = fält.value;
            continue;
          }

          if (name) {
            const form = iDoc.forms?.[0];
            if (!form) continue;
            const nyttEl = iDoc.createElement('input');
            nyttEl.type = 'hidden';
            nyttEl.name = name;
            if (id) nyttEl.id = id;
            nyttEl.value = fält.value;
            form.appendChild(nyttEl);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // 4. Fyll i fält på Generellt-fliken (efter eventuell filuppladdning)
  // ---------------------------------------------------------------
  const generelltRedo = await säkerställGenerelltFlik(iframe);
  if (!generelltRedo) {
    throw new Error('Dokumentformuläret är inte på Generellt-fliken (basfält saknas).');
  }
  iDoc = iframe.contentDocument;
  iWin = iframe.contentWindow;
  const { kontaktLagdTill } = await fyllDokumentFormulär(iDoc, iWin, dok, visaStatus);

  // Verifiera kritiska fält före Slutför så vi inte postar ett tomt formulär.
  const kategoriEfterFyll = iDoc.getElementById(
    'PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl'
  )?.value || '';
  if (!kategoriEfterFyll) {
    throw new Error(
      'Dokumentkategori är tom efter formulärfyllning. ' +
      'Formuläret uppdaterades sannolikt om och tappade värden.'
    );
  }

  // ---------------------------------------------------------------
  // 5. Kontrollera obligatoriska fält – pausa om något saknas
  // ---------------------------------------------------------------
  const tommaObl = kontrolleraObligatoriskaFält(iDoc, { kontaktLagdTill });
  if (tommaObl.length > 0) {
    visaStatus(`Fyll i obligatoriska fält: ${tommaObl.join(', ')}`);
    window.dispatchEvent(new CustomEvent('p360-batch-manuell-paus', {
      detail: { fält: tommaObl, typ: 'dokument', titel: dok.titel || '' }
    }));
    const manuellResultat = await väntaPåAnvändarensSlutför(iframe, tommaObl);
    if (manuellResultat.cancelled) {
      try { iframe.remove(); } catch { /* ignorera */ }
      return { cancelled: true };
    }
  } else {
    // Skicka formuläret från Generellt-fliken
    visaStatus('Sparar ärendedokument…');
    await väntaPåPRM(iWin, 10000);
    await triggaDokumentSlutför(iDoc, iWin);
    // Komplettsteg: trigga serverns "complete" för att öppna RepeatWizardDialog.
    // Utan detta kan dialogen utebli och 360° hamna i avbrutet-läge.
    try {
      await väntaPåPRM(iWin, 5000);
      triggaCompleteViaDom(iDoc, iWin);
    } catch { /* ignorera */ }
    await väntaPåPRM(iWin, 20000);
  }

  // ---------------------------------------------------------------
  // 6. Vänta på RepeatWizardDialog – innehåller dokumentnumret
  // ---------------------------------------------------------------
  const WAIT_REPEAT1_MS = 60000;
  const WAIT_REPEAT2_MS = 90000;

  // Försök 1: vänta på att RepeatWizardDialog-iframen laddas klart.
  let repeatIframe = await waitForNyIframe('RepeatWizardDialog', WAIT_REPEAT1_MS);

  // Om dialogen inte dyker upp: kör vår gamla early-exit detektor (valideringsfel)
  // och gör sedan ett kontrollerat andra Slutför-försök.
  let waitResult = { repeatIframe: null, valideringsfel: [] };
  if (!repeatIframe) {
    waitResult = await väntaPåRepeatEllerFel(iDoc, 20000);
    if (waitResult.valideringsfel.length === 0) {
      console.warn('[p360-dok] RepeatWizardDialog saknas – gör ett andra Slutför-försök.');
      await väntaPåPRM(iWin, 15000);
      await triggaDokumentSlutför(iDoc, iWin);
      try {
        await väntaPåPRM(iWin, 5000);
        iWin.__doPostBack?.('ctl00$PlaceHolderMain$MainView$CompleteWizardHiddenEventControl', '');
      } catch { /* ignorera */ }
      await väntaPåPRM(iWin, 25000);
      repeatIframe = await waitForNyIframe('RepeatWizardDialog', WAIT_REPEAT2_MS);
      waitResult = repeatIframe ? { repeatIframe, valideringsfel: [] } : waitResult;
    }
  }
  let dokumentNummer = null;

  if (repeatIframe) {
    // Extrahera dokumentnummer ur dialogCaption-parametern
    try {
      const url = new URL(repeatIframe.contentDocument.location.href);
      const caption = decodeURIComponent(url.searchParams.get('dialogCaption') || '');
      dokumentNummer = caption
        .replace(/^Dokumentet\s+/, '')
        .replace(/\s+är skapad?$/, '')
        .trim() || null;
    } catch { /* cross-origin */ }

    // Stäng RepeatWizardDialog – välj "avsluta" (value=0), sedan OK
    try {
      const rDoc = repeatIframe.contentDocument;
      const rWin = repeatIframe.contentWindow;
      await waitForElement(rDoc, '#PlaceHolderMain_MainView_DialogButton', 3000);

      const avsluta = rDoc.getElementById('PlaceHolderMain_MainView_ChoiceControl_0');
      if (avsluta) {
        avsluta.checked = true;
        avsluta.dispatchEvent(new Event('change', { bubbles: true }));
      }

      rWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');
    } catch { /* ignorera */ }

    // Polla tills RepeatWizardDialog-iframen försvinner ur DOM
    for (let poll = 0; poll < 40; poll++) {
      await sleep(150);
      const kvarvarande = Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return (f.src || '').includes('RepeatWizardDialog'); } catch { return false; }
      });
      if (!kvarvarande) break;
    }
  } else {
    // Ingen RepeatWizardDialog – kontrollera valideringsfel
    const valideringsfel = waitResult.valideringsfel || [];

    // Hjälploggning för felsökning: visa de viktigaste fälten och ev. uppladdningsspår.
    try {
      const titel = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl')?.value || '';
      const kategori = iDoc.getElementById('PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl')?.value || '';
      const handlingstyp = iDoc.getElementById('PlaceHolderMain_MainView_ProcessRecordTypeControl')?.value || '';
      const uploadedPath = iDoc.getElementById(
        'PlaceHolderMain_MainView_DocumentMultiFileUploadControl_hiddenUploadedFilesPath'
      )?.value || '';
      const scannedFile = iDoc.getElementById('SI_HiddenField_ScannedFilepath')?.value || '';
      console.warn('[p360-dok] RepeatWizardDialog uteblev. Diagnostik:',
        { titel, kategori, handlingstyp, uploadedPath, scannedFile, valideringsfel });
    } catch { /* ignorera */ }

    if (valideringsfel.length > 0) {
      throw new Error('Dokument kunde inte skapas: ' + valideringsfel.join(', '));
    }
    throw new Error(
      'RepeatWizardDialog visades inte efter två Slutför-försök. ' +
      'Kontrollera dokumentdialogen (obligatoriska fält eller långsam serverpostback).'
    );
  }

  return dokumentNummer;
}

/**
 * Skapar alla ärendedokument från en mall, i ordning.
 * Visar ett statusfält högst upp på sidan under pågående skapande.
 *
 * @param {Array} dokument – Lista med ärendedokument-mallar
 * @param {Object} [options] – Alternativ:
 *   ärendeFlöde: true om dokumenten skapas som del av ett ärendeskapandeflöde
 * @returns {Array} Resultat per dokument: { titel, dokumentNummer, fel, avbruten }
 */
async function skapaAllaÄrendedokument(dokument, options) {
  if (!dokument?.length) return [];
  const ärendeFlöde = options?.ärendeFlöde || false;

  // Skapa statusfält
  const statusBar = document.createElement('div');
  statusBar.id = 'p360-dok-status';
  statusBar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;' +
    'background:#1a5276;color:#fff;font-family:sans-serif;font-size:13px;' +
    'padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
    'display:flex;align-items:center;gap:10px;';
  statusBar.innerHTML = '<span id="p360-dok-status-text">Förbereder ärendedokument…</span>';
  document.body.appendChild(statusBar);

  const visaStatus = (t) => {
    const el = document.getElementById('p360-dok-status-text');
    if (el) el.textContent = t;
  };

  const resultat = [];
  let avbruten = false;

  // Lyssna på avbryt-signal från batch-sidan (via content.js → chrome.storage)
  let batchAvbrytSignal = false;
  const avbrytLyssnare = () => { batchAvbrytSignal = true; };
  window.addEventListener('p360-batch-avbryt', avbrytLyssnare);

  for (let i = 0; i < dokument.length; i++) {
    // Kolla om batch-sidan signalerat avbryt
    if (batchAvbrytSignal) {
      console.log(`[p360] Batch-avbryt mottagen – hoppar över resterande ${dokument.length - i} dokument`);
      for (let j = i; j < dokument.length; j++) {
        resultat.push({ titel: dokument[j].titel, dokumentNummer: null, fel: null, avbruten: true });
      }
      avbruten = true;
      break;
    }

    const dok = dokument[i];
    const nr = i + 1;
    visaStatus(`Ärendedokument ${nr}/${dokument.length}: ${dok.titel || '(utan titel)'}…`);

    try {
      const svar = await skapaÄrendedokument(dok, visaStatus, () => batchAvbrytSignal);

      if (svar && svar.cancelled) {
        resultat.push({ titel: dok.titel, dokumentNummer: null, fel: null, avbruten: true });
        avbruten = true;
        break;
      }

      resultat.push({ titel: dok.titel, dokumentNummer: svar, fel: null });
      console.log(`[p360] Ärendedokument ${nr}/${dokument.length} skapat: ${svar}`);
    } catch (err) {
      resultat.push({ titel: dok.titel, dokumentNummer: null, fel: err.message });
      console.error(`[p360] Ärendedokument ${nr}/${dokument.length} misslyckades:`, err.message);
    }

    // Polla tills alla dialoger stängts innan nästa dokument
    if (i < dokument.length - 1) {
      for (let poll = 0; poll < 40; poll++) {
        await sleep(150);
        const öppnaDialoger = document.querySelectorAll('dialog[open], dialog.is-open');
        if (öppnaDialoger.length === 0) break;
      }
    }
  }

  // Rensa avbryt-lyssnare
  window.removeEventListener('p360-batch-avbryt', avbrytLyssnare);

  // Visa sammanfattning
  const lyckade = resultat.filter(r => r.dokumentNummer);
  const misslyckade = resultat.filter(r => r.fel);

  if (avbruten) {
    visaAvbrytVarning(statusBar, lyckade, dokument.length, ärendeFlöde);
  } else {
    let sammanfattning = `Klart: ${lyckade.length}/${dokument.length} ärendedokument skapade.`;
    if (misslyckade.length > 0) {
      sammanfattning += ' Misslyckade: ' + misslyckade.map(r => r.titel || '(utan titel)').join(', ');
    }
    visaStatus(sammanfattning);
    setTimeout(() => statusBar.remove(), 8000);
  }

  return resultat;
}

/**
 * Visar en varningsruta vid avbrytning med info om redan skapade objekt.
 * Användaren måste klicka bort den manuellt.
 */
function visaAvbrytVarning(statusBar, lyckade, totalAntal, ärendeFlöde) {
  statusBar.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99999;' +
    'background:#b35900;color:#fff;font-family:sans-serif;font-size:13px;' +
    'padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
    'display:flex;flex-direction:column;gap:6px;';

  let html = '<strong>Dokumentskapandet avbröts.</strong>';

  if (lyckade.length > 0) {
    html += `<div>Redan skapade ärendedokument (${lyckade.length} av ${totalAntal}): ` +
      lyckade.map(r => `<strong>${r.dokumentNummer || r.titel}</strong>`).join(', ') +
      '. Dessa måste tas bort manuellt om de inte ska finnas kvar.</div>';
  }

  if (ärendeFlöde) {
    html += '<div>Ärendet är redan skapat och måste makuleras separat om det inte ska finnas kvar.</div>';
  }

  html += '<div style="margin-top:4px;">' +
    '<button id="p360-avbryt-stäng" style="padding:4px 12px;background:#fff;color:#333;' +
    'border:1px solid #ccc;border-radius:3px;cursor:pointer;font-size:12px;font-family:sans-serif;">OK</button></div>';

  statusBar.innerHTML = html;
  statusBar.querySelector('#p360-avbryt-stäng').addEventListener('click', () => statusBar.remove());
}
