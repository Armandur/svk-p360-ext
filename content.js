// content.js – körs i isolerat scope (ISOLATED world)
// Tar emot meddelanden från popup.js och vidarebefordrar till page.js via CustomEvents.

// Ta bort gammal onMessage-lyssnare om tillägget laddats om (guard mot dubbletter)
if (window.__p360OnMessageHandler) {
  chrome.runtime.onMessage.removeListener(window.__p360OnMessageHandler);
}

/**
 * Kontrollerar om den aktiva sidan är en ärendesida i 360°.
 */
function ärPåÄrendesida() {
  return !!document.getElementById(
    'PlaceHolderMain_MainView_MainContextMenu_DropDownMenu_MenuItemAnchor_key_innehallsforteckning'
  );
}

// Åtgärder som inte kräver att vi är på en ärendesida (fungerar på hela p360-domänen)
var ÅTGÄRDER_UTAN_SIDKRAV = new Set(['skapaFrånMall', 'läsInAlternativ', 'läsDiarienummer']);

/**
 * Skickar ett anrop till page.js (MAIN world) och väntar på svar via CustomEvent.
 * Timeout efter 120 s för mallskapande (kan ta lång tid pga. formulärfyllning).
 */
function anropaSidan(action, data = {}) {
  const timeout = action === 'skapaFrånMall' ? 120000
                : action === 'skapaÄrendedokument' ? 300000
                : action === 'läsInAlternativ' ? 45000
                : 12000;
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);

    const timer = setTimeout(() => {
      window.removeEventListener('p360-svar', hanterare);
      reject(new Error('Inget svar från sidan. Prova att ladda om fliken.'));
    }, timeout);

    const hanterare = (event) => {
      if (event.detail.id === id) {
        clearTimeout(timer);
        window.removeEventListener('p360-svar', hanterare);
        resolve(event.detail);
      }
    };

    window.addEventListener('p360-svar', hanterare);
    window.dispatchEvent(new CustomEvent('p360-anrop', { detail: { id, action, data } }));
  });
}

// Sparar pending ärendedokument (anropas från page-arende-create.js innan navigering)
if (!window.__p360PendingHandler) {
  window.__p360PendingHandler = async (event) => {
    const { dokument } = event.detail;
    if (!Array.isArray(dokument) || dokument.length === 0) return;
    await chrome.storage.local.set({ pendingÄrendedokument: { dokument, sparad: Date.now() } });
    console.log(`[p360] ${dokument.length} ärendedokument sparade som pending`);
  };
  window.addEventListener('p360-spara-pending-dokument', window.__p360PendingHandler);
}

/**
 * Löser dokumentmallreferenser ({ dokumentmallId }) till fullständiga dokumentobjekt.
 */
async function lösaDokumentreferenser(dokument) {
  const harReferenser = dokument.some(d => d.dokumentmallId && !d.handlingstyp && !d.kategori);
  if (!harReferenser) return dokument;
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');
  return dokument.map(d => {
    if (d.dokumentmallId && !d.handlingstyp && !d.kategori) {
      const dm = dokumentmallar.find(m => m.id === d.dokumentmallId);
      return dm || d;
    }
    return d;
  }).filter(d => d.titel || d.handlingstyp || d.kategori || d.filerBase64?.length);
}

/**
 * Läser diarienummer från ärendesidans DOM.
 */
function läsDiarienummerFrånDOM() {
  const el = document.getElementById('PlaceHolderMain_MainView_DetailDescription');
  if (!el) return '';
  return el.textContent.replace('Ärende: ', '').trim();
}

// Kontrollera om det finns pending ärendedokument att skapa (efter navigering till ärendesida)
if (!window.__p360PendingChecked) {
  window.__p360PendingChecked = true;
  setTimeout(async () => {
    if (!window.location.href.includes('/DMS/Case/Details/')) return;
    const { pendingÄrendedokument, batchKörning } = await chrome.storage.local.get([
      'pendingÄrendedokument', 'batchKörning'
    ]);
    if (!pendingÄrendedokument?.dokument?.length) {
      // Inga pending dokument – signalera batch att raden är klar (om batch kör)
      if (batchKörning) {
        const diarienummer = läsDiarienummerFrånDOM();
        await chrome.storage.local.set({
          batchRadKlar: { diarienummer, dokument: [], tid: Date.now() }
        });
      }
      return;
    }
    await chrome.storage.local.remove('pendingÄrendedokument');

    // Hämta fildata från storage (batch sparar filer separat)
    for (const dok of pendingÄrendedokument.dokument) {
      if (dok.filerStorageNyckel) {
        const stored = await chrome.storage.local.get(dok.filerStorageNyckel);
        dok.filerBase64 = stored[dok.filerStorageNyckel] || [];
        await chrome.storage.local.remove(dok.filerStorageNyckel);
        delete dok.filerStorageNyckel;
      }
    }

    const löstaDokument = await lösaDokumentreferenser(pendingÄrendedokument.dokument);
    if (!löstaDokument.length) {
      if (batchKörning) {
        const diarienummer = läsDiarienummerFrånDOM();
        await chrome.storage.local.set({
          batchRadKlar: { diarienummer, dokument: [], tid: Date.now() }
        });
      }
      return;
    }
    anropaSidan('skapaÄrendedokument', { dokument: löstaDokument, ärendeFlöde: true })
      .then(async (svar) => {
        if (!svar.success) console.error('[p360] Ärendedokument misslyckades:', svar.fel);
        // Signalera batch att raden är klar (om batch kör)
        const { batchKörning: bk } = await chrome.storage.local.get('batchKörning');
        if (bk) {
          const diarienummer = läsDiarienummerFrånDOM();
          const resultat = svar.data || [];
          const avbrutna = resultat.filter(r => r.avbruten);
          const misslyckade = resultat.filter(r => r.fel);
          let fel = null;
          if (!svar.success) {
            fel = svar.fel || 'Dokumentskapande misslyckades';
          } else if (avbrutna.length > 0) {
            fel = `Avbrutet av användaren (${resultat.length - avbrutna.length}/${resultat.length} dokument skapade)`;
          } else if (misslyckade.length > 0) {
            fel = misslyckade.map(r => r.fel).join('; ');
          }
          await chrome.storage.local.set({
            batchRadKlar: {
              diarienummer,
              dokument: resultat.map(d => d.dokumentNr || d.dokumentNummer || ''),
              avbruten: avbrutna.length > 0,
              fel,
              tid: Date.now(),
            }
          });
        }
      })
      .catch(async (err) => {
        console.error('[p360] Ärendedokument fel:', err.message);
        const { batchKörning: bk } = await chrome.storage.local.get('batchKörning');
        if (bk) {
          await chrome.storage.local.set({
            batchRadKlar: { fel: err.message, tid: Date.now() }
          });
        }
      });
  }, 3000);
}

// Vidarebefordra batchAvbruten-signal till MAIN world (så page-document-create kan avbryta)
if (!window.__p360BatchAvbrytHandler) {
  window.__p360BatchAvbrytHandler = (changes) => {
    if (changes.batchAvbruten?.newValue) {
      window.dispatchEvent(new CustomEvent('p360-batch-avbryt'));
    }
  };
  chrome.storage.onChanged.addListener(window.__p360BatchAvbrytHandler);
}

// Tar emot signal om manuell paus från MAIN world (dokument/ärende-formulär väntar på input)
if (!window.__p360ManuellPausHandler) {
  window.__p360ManuellPausHandler = async (event) => {
    const { fält, typ, titel } = event.detail;
    const { batchKörning } = await chrome.storage.local.get('batchKörning');
    if (batchKörning) {
      await chrome.storage.local.set({
        batchManuellPaus: { fält, typ, titel, tid: Date.now() }
      });
    }
  };
  window.addEventListener('p360-batch-manuell-paus', window.__p360ManuellPausHandler);
}

// Tar emot Handlingstyp-alternativ från MAIN world och sparar i chrome.storage.local
if (!window.__p360HtHandler) {
  window.__p360HtHandler = async (event) => {
    const { handlingstyper } = event.detail;
    if (!Array.isArray(handlingstyper) || handlingstyper.length === 0) return;
    const stored = await chrome.storage.local.get('cachedHandlingstyper');
    const existing = stored.cachedHandlingstyper || [];
    const merged = [...existing];
    for (const h of handlingstyper) {
      if (!merged.some(e => e.value === h.value)) merged.push(h);
    }
    await chrome.storage.local.set({ cachedHandlingstyper: merged });
  };
  window.addEventListener('p360-spara-handlingstyper', window.__p360HtHandler);
}

// Tar emot övriga fältalternativ från dokumentformuläret och sparar i chrome.storage.local
if (!window.__p360DokOptHandler) {
  window.__p360DokOptHandler = async (event) => {
    const { ansvarigaEnheter, atkomstgrupper, ansvarigaPersoner } = event.detail;
    const uppdatering = {};
    if (ansvarigaEnheter?.length > 0) uppdatering.cachedAnsvarigaEnheter = ansvarigaEnheter;
    if (atkomstgrupper?.length > 0) uppdatering.cachedAtkomstgrupper = atkomstgrupper;
    if (ansvarigaPersoner?.length > 0) uppdatering.cachedAnsvarigaPersoner = ansvarigaPersoner;
    if (Object.keys(uppdatering).length > 0) {
      await chrome.storage.local.set(uppdatering);
    }
  };
  window.addEventListener('p360-spara-dokumentformulär-alternativ', window.__p360DokOptHandler);
}

// Tar emot meddelanden från popup.js och batch.html
window.__p360OnMessageHandler = (request, sender, sendResponse) => {
  // Snabbsvar: läsDiarienummer behöver inte MAIN world
  if (request.action === 'läsDiarienummer') {
    sendResponse({ success: true, diarienummer: läsDiarienummerFrånDOM() });
    return;
  }

  if (!ÅTGÄRDER_UTAN_SIDKRAV.has(request.action) && !ärPåÄrendesida()) {
    sendResponse({ success: false, fel: 'Navigera till ett ärende i 360° först.' });
    return;
  }

  const data = {};
  if (request.action === 'sättStatus') data.statusVärde = request.statusVärde;
  if (request.action === 'skapaFrånMall') data.mall = request.mall;
  if (request.action === 'skapaÄrendedokument') {
    data.dokument = request.dokument;
    data.ärendeFlöde = request.ärendeFlöde || false;
  }

  // Hämta fildata från chrome.storage.local om popup sparade dem där
  // (filer kan vara för stora för sendMessage-gränsen på 64 MB)
  const hämtaFiler = async () => {
    if (!data.dokument) return;
    for (const dok of data.dokument) {
      if (dok.filerStorageNyckel) {
        const stored = await chrome.storage.local.get(dok.filerStorageNyckel);
        dok.filerBase64 = stored[dok.filerStorageNyckel] || [];
        delete dok.filerStorageNyckel;
      }
    }
  };

  hämtaFiler().then(() => anropaSidan(request.action, data))
    .then(svar => sendResponse(svar))
    .catch(err => sendResponse({ success: false, fel: err.message }));

  return true; // Håller meddelandekanalen öppen för async svar
};
chrome.runtime.onMessage.addListener(window.__p360OnMessageHandler);
