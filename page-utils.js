// page-utils.js – Delade hjälpfunktioner för page-*.js-filerna
// Körs i sidans MAIN world. Laddas före alla andra page-*.js-filer.

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
 * Returnerar ett Promise som resolvar efter ms millisekunder.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
