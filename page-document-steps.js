// page-document-steps.js – Hjälpfunktioner för dokumentguidens steg
// Körs i sidans MAIN world. Beror på:
//   page-utils.js (sleep, waitForElement)
//   page-document-upload.js (väntaPåPRM)
// Laddas efter page-document-upload.js, före page-document-create.js.

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

    let pollId = null;
    let resolvedFlag = false;

    function resolveOnce(value) {
      if (resolvedFlag) return;
      resolvedFlag = true;
      rensa();
      resolve(value);
    }

    function rensa() {
      clearTimeout(timer);
      if (pollId) { clearInterval(pollId); pollId = null; }
      banner.remove();
      styleTag.remove();
      if (dialog) dialog.removeAttribute('data-p360-manual-dialog');
    }

    // Avbryt-knapp – klicka formulärets egen Avbryt så 360° stänger dialogen korrekt
    avbrytBtn.addEventListener('click', () => {
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
      resolveOnce({ cancelled: true });
    });

    // Polla var 300 ms:
    // 1. RepeatWizardDialog dyker upp (flöde utan föranmäld fil)
    // 2. Formulär-iframen försvinner ur DOM (flöde MED fil – ingen RepeatWizardDialog)
    pollId = setInterval(() => {
      // Koll 1: RepeatWizardDialog
      for (const f of document.querySelectorAll('iframe')) {
        try {
          if ((f.contentDocument?.location?.href || '').includes('RepeatWizardDialog')) {
            resolveOnce({ cancelled: false, repeatIframe: f, iframeStängd: false });
            return;
          }
        } catch { /* cross-origin – ignorera */ }
      }
      // Koll 2: Formulär-iframen borttagen ur DOM (filuppladdningsflöde)
      if (!document.contains(iframe)) {
        resolveOnce({ cancelled: false, repeatIframe: null, iframeStängd: true });
      }
    }, 300);
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
