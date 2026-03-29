// batch-utils.js – Hjälpfunktioner för batchkörning
// Körs på batch.html (extension page).
// Innehåller: flik-hantering, signalväntan, fil-konvertering.
// Beror på inget annat skript.

/**
 * Hittar en öppen 360°-flik.
 */
async function hittaP360Flik() {
  const tabs = await chrome.tabs.query({ url: 'https://p360.svenskakyrkan.se/*' });
  if (tabs.length === 0) return null;
  // Föredra en flik som redan visar ärendesida eller startsida
  return tabs.find(t => t.url.includes('/DMS/')) || tabs[0];
}

/**
 * Väntar på att en flik navigerar till en URL som matchar ett mönster.
 * Returnerar den nya URL:en eller null vid timeout.
 */
function väntaPåNavigation(tabId, urlMönster, timeout = 45000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log(`[batch] väntaPåNavigation: Timeout (${timeout} ms) – ingen matchande URL hittades.`);
      chrome.tabs.onUpdated.removeListener(lyssnare);
      resolve(null);
    }, timeout);

    function lyssnare(id, info, tab) {
      if (id !== tabId) return;
      // Logga alla statusändringar för denna flik
      if (info.url || info.status) {
        console.log(`[batch] väntaPåNavigation: flik ${id} status=${info.status} url=${info.url || tab.url || '?'}`);
      }
      if (info.status === 'complete' && tab.url && urlMönster.test(tab.url)) {
        console.log(`[batch] väntaPåNavigation: Matchad! URL=${tab.url}`);
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(lyssnare);
        resolve(tab.url);
      }
    }
    chrome.tabs.onUpdated.addListener(lyssnare);
  });
}

/**
 * Accepterar både locator-details och view.aspx-details.
 */
function ärCaseDetailsUrl(url) {
  const s = String(url || '');
  return /\/DMS\/Case\/Details\//.test(s) ||
    (s.includes('/view.aspx') && s.includes('DMS.Case.Details.Simplified.61000'));
}

/**
 * Skickar meddelande till en flik och väntar på svar.
 * Injicerar content scripts om de saknas (t.ex. efter tilläggs-reload).
 * Returnerar null om fliken navigerade bort (connection lost).
 */
async function skickaTillFlik(tabId, message, timeout = 120000) {
  // Försök skicka – om content.js saknas, injicera och försök igen
  for (let försök = 0; försök < 2; försök++) {
    const resultat = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.log(`[batch] skickaTillFlik: Timeout (${timeout} ms) för action=${message.action}`);
        resolve(null);
      }, timeout);
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message || 'Okänt fel';
            console.warn(`[batch] skickaTillFlik: lastError (försök ${försök + 1}):`, err);
            resolve({ _sendError: true, message: err });
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        clearTimeout(timer);
        console.warn(`[batch] skickaTillFlik: catch-fel (försök ${försök + 1}):`, e);
        resolve({ _sendError: true, message: e.message });
      }
    });

    // Om meddelandet gick fram → returnera svaret
    if (resultat && !resultat._sendError) return resultat;
    if (resultat === null) return null; // Timeout

    // Första försöket misslyckades (content.js saknas) – injicera scripts
    if (försök === 0) {
      console.log(`[batch] skickaTillFlik: Injicerar content scripts i flik ${tabId}…`);
      try {
        // Injicera ISOLATED world (content.js)
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
        // Injicera MAIN world scripts
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'page-utils.js', 'page-dagboksblad.js', 'page-status.js',
            'page-arende-options.js', 'page-arende-contacts.js', 'page-arende-create.js',
            'page-document-options.js', 'page-document-validate.js', 'page-document-fill.js',
            'page-document-upload.js', 'page-document-steps.js', 'page-document-create.js', 'page.js',
          ],
          world: 'MAIN',
        });
        // Ge scripts lite tid att initialiseras
        await new Promise(r => setTimeout(r, 500));
        console.log(`[batch] skickaTillFlik: Scripts injicerade, försöker igen…`);
      } catch (injErr) {
        console.error(`[batch] skickaTillFlik: Kunde inte injicera scripts:`, injErr);
        return null;
      }
    }
  }
  return null;
}

/**
 * Väntar på att content.js signalerar att batchsteget är klart.
 * Signalen skrivs till chrome.storage.local av content.js efter
 * att ärendedokument skapats.
 *
 * @param {number} radIdx – Förväntat radindex (filtrerar bort stale-signaler)
 * @param {number} timeout – Max väntetid i ms
 */
function väntaPåBatchSignal(radIdx, timeout = 300000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.storage.onChanged.removeListener(lyssnare);
      resolve(null);
    }, timeout);

    function godkännSignal(signal) {
      // Acceptera signal om radIdx matchar, eller om signalen inte har radIdx (bakåtkompatibilitet)
      if (signal.radIdx !== undefined && signal.radIdx !== radIdx) {
        console.log(`[batch] väntaPåBatchSignal: Ignorerar stale signal (radIdx=${signal.radIdx}, förväntat=${radIdx})`);
        return false;
      }
      return true;
    }

    function lyssnare(changes) {
      if (changes.batchRadKlar?.newValue) {
        const signal = changes.batchRadKlar.newValue;
        if (!godkännSignal(signal)) return; // Ignorera stale signal
        clearTimeout(timer);
        chrome.storage.onChanged.removeListener(lyssnare);
        resolve(signal);
      }
    }
    chrome.storage.onChanged.addListener(lyssnare);

    // Kolla om signalen redan finns (race condition)
    chrome.storage.local.get('batchRadKlar', (data) => {
      if (data.batchRadKlar && godkännSignal(data.batchRadKlar)) {
        clearTimeout(timer);
        chrome.storage.onChanged.removeListener(lyssnare);
        resolve(data.batchRadKlar);
      }
    });
  });
}

/**
 * Konverterar en File-objekt till base64.
 */
function filTillBase64(fil) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // Ta bort data:..;base64, prefix
    reader.onerror = () => reject(new Error(`Kunde inte läsa fil: ${fil.name}`));
    reader.readAsDataURL(fil);
  });
}

/**
 * Förbereder filer för en rad – konverterar File-objekt till base64 och
 * sparar i chrome.storage.local. Returnerar uppdaterade ärendedokument med
 * filerBase64-nycklar istället för File-objekt.
 */
async function förberedFiler(mall) {
  if (!mall.ärendedokument?.length) return mall;

  console.log(`[batch] förberedFiler: ${mall.ärendedokument.length} ärendedokument`);
  mall._batchFilNycklar = [];
  for (let i = 0; i < mall.ärendedokument.length; i++) {
    const dok = mall.ärendedokument[i];
    console.log(`[batch] förberedFiler dok ${i}: _filObj=${!!dok._filObj}, _filnamn=${dok._filnamn || '(ej satt)'}`);
    if (dok._filObj) {
      const base64 = await filTillBase64(dok._filObj);
      const storageNyckel = `batchFil_${Date.now()}_${i}`;
      console.log(`[batch] förberedFiler dok ${i}: Sparar ${dok._filObj.name} (${base64.length} tecken base64) som ${storageNyckel}`);
      await chrome.storage.local.set({
        [storageNyckel]: [{
          namn: dok._filObj.name,
          typ: dok._filObj.type,
          base64: base64,
        }]
      });
      dok.filerStorageNyckel = storageNyckel;
      mall._batchFilNycklar.push(storageNyckel);
      delete dok._filObj;
    }
  }

  return mall;
}
