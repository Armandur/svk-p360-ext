// page-document-options.js – Passiv caching av Handlingstyp-alternativ från ärendedokument-formuläret
// Körs i sidans MAIN world. Laddas före page.js.
//
// När användaren öppnar formuläret "Skapa nytt ärendedokument" läser denna fil
// ut tillgängliga Handlingstyp-alternativ (ProcessRecordTypeControl) och skickar
// dem till content.js via CustomEvent för lagring i chrome.storage.local.

/**
 * Läser ut alternativ från ett Selectize-fält (value + text/label).
 * Selectize lagrar alla alternativ i sel.selectize.options.
 */
function läsSelectizeAlternativ(doc, elementId) {
  const sel = doc.getElementById(elementId);
  if (!sel) return [];

  // Primär: Selectize-cache
  if (sel.selectize?.options) {
    return Object.values(sel.selectize.options)
      .filter(o => o.value && o.value !== '0' && o.value !== '')
      .map(o => ({ value: String(o.value), label: String(o.text || '').trim() }));
  }

  // Fallback: native select
  return Array.from(sel.options)
    .filter(o => o.value && o.value !== '0' && o.value !== '')
    .map(o => ({ value: o.value, label: o.text.trim() }));
}

/**
 * Läser ut Handlingstyp-alternativ (returnerar {value, text}-format för bakåtkompatibilitet).
 */
function läsHandlingstyperFrånDokument(doc) {
  const alt = läsSelectizeAlternativ(doc, 'PlaceHolderMain_MainView_ProcessRecordTypeControl');
  return alt.map(o => ({ value: o.value, text: o.label }));
}

/**
 * Kontrollerar om en URL tillhör formuläret för nytt ärendedokument.
 */
function ärDokumentFormulärUrl(url) {
  return url && (
    url.includes('/DMS/Document/New/') ||
    url.includes('70158b84-a8eb-492a-a546-277ee96e16f9')
  );
}

/**
 * Väntar på att Selectize initierats på ProcessRecordTypeControl (max 5 s),
 * läser sedan ut alternativ och dispatchar event för caching.
 */
function väntaOchCachea(doc) {
  const sel = doc.getElementById('PlaceHolderMain_MainView_ProcessRecordTypeControl');
  if (!sel) return;

  const start = Date.now();
  const poll = setInterval(() => {
    if (Date.now() - start > 5000) { clearInterval(poll); return; }
    if (!sel.selectize) return;

    clearInterval(poll);
    const handlingstyper = läsHandlingstyperFrånDokument(doc);
    if (handlingstyper.length > 0) {
      window.dispatchEvent(new CustomEvent('p360-spara-handlingstyper', {
        detail: { handlingstyper }
      }));
    }

    // Cacha även ansvarig enhet, åtkomstgrupp och ansvarig person
    const ansvarigaEnheter = läsSelectizeAlternativ(doc, 'PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl');
    const atkomstgrupper = läsSelectizeAlternativ(doc, 'PlaceHolderMain_MainView_AccessGroupComboControl');
    const ansvarigaPersoner = läsSelectizeAlternativ(doc, 'PlaceHolderMain_MainView_ResponsibleUserComboControl');
    const extra = {};
    if (ansvarigaEnheter.length > 0) extra.ansvarigaEnheter = ansvarigaEnheter;
    if (atkomstgrupper.length > 0) extra.atkomstgrupper = atkomstgrupper;
    if (ansvarigaPersoner.length > 0) extra.ansvarigaPersoner = ansvarigaPersoner;
    if (Object.keys(extra).length > 0) {
      window.dispatchEvent(new CustomEvent('p360-spara-dokumentformulär-alternativ', {
        detail: extra
      }));
    }
  }, 100);
}

/**
 * Försöker starta caching från en given iframe.
 */
function försökCacheaFrånIframe(f) {
  try {
    const href = f.contentDocument?.location?.href || '';
    if (!ärDokumentFormulärUrl(href)) return;
    if (f.contentDocument?.readyState !== 'complete') return;
    väntaOchCachea(f.contentDocument);
  } catch { /* cross-origin eller ej laddad */ }
}

/**
 * Startar bevakning av iframes för att fånga dokument-formulär när de öppnas.
 */
function initDokumentÖvervakning() {
  function hanteraIframe(f) {
    f.addEventListener('load', () => {
      försökCacheaFrånIframe(f);
      f.addEventListener('load', () => försökCacheaFrånIframe(f), { once: true });
    }, { once: true });

    // Kolla om iframen redan är laddad med rätt URL
    försökCacheaFrånIframe(f);
  }

  // Bevaka nya iframes
  const obs = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IFRAME') hanteraIframe(node);
        for (const f of node.querySelectorAll?.('iframe') ?? []) hanteraIframe(f);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Kolla iframes som redan finns i DOM:en
  for (const f of document.querySelectorAll('iframe')) hanteraIframe(f);
}
