// batch-run.js – Exekvering av massregistrering
// Körs på batch.html (extension page). Beror på batch-data.js (byggMallFrånRad, valideraRad)
// och batch-table.js (sättRadStatus).

let batchAvbruten = false;
let batchKör = false;
let batchResultat = [];
let _avbrytResolve = null; // Resolve-funktion för att avbryta pågående väntan

/**
 * Returnerar ett Promise som resolvar när batch avbryts.
 * Används för att race:a mot långa await-anrop.
 */
function avbrytPromise() {
  return new Promise(resolve => { _avbrytResolve = resolve; });
}

/**
 * Race:ar ett promise mot avbryt-flaggan.
 * Returnerar { avbruten: true } om batch avbröts, annars det ursprungliga värdet.
 */
function medAvbryt(promise) {
  return Promise.race([
    promise,
    avbrytPromise().then(() => ({ _avbruten: true })),
  ]);
}

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
            'page-document-upload.js', 'page-document-create.js', 'page.js',
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
 * Förbereder filder för en rad – konverterar File-objekt till base64 och
 * sparar i chrome.storage.local. Returnerar uppdaterade ärendedokument med
 * filerBase64-nycklar istället för File-objekt.
 */
async function förberedFiler(mall) {
  if (!mall.ärendedokument?.length) return mall;

  console.log(`[batch] förberedFiler: ${mall.ärendedokument.length} ärendedokument`);
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
      delete dok._filObj;
    }
  }

  return mall;
}

/**
 * Kör massregistrering för alla rader.
 *
 * @param {Object} baseMall - Ärendemallen att utgå från
 * @param {Object[]} slots - Dokumentslotsar med dokumentmall per slot
 * @param {Object} inställningar - { stängÄrende, dagboksblad }
 */
async function startaBatch(baseMall, slots, inställningar) {
  batchAvbruten = false;
  batchKör = true;
  batchResultat = [];

  const rader = hämtaBatchRader();
  const antalRader = rader.length;

  if (antalRader === 0) {
    alert('Inga rader att bearbeta.');
    batchKör = false;
    return [];
  }

  // Hitta 360°-fliken
  const flik = await hittaP360Flik();
  if (!flik) {
    alert('Ingen öppen 360°-flik hittades. Öppna 360° i en annan flik först.');
    batchKör = false;
    return [];
  }

  const tabId = flik.id;

  // Rensa eventuell gammal batch-signal
  await chrome.storage.local.remove(['batchRadKlar', 'batchKörning', 'batchManuellPaus', 'batchAvbruten']);

  visaBatchProgress(`Startar batch (0/${antalRader})…`);

  // Lyssna på manuell paus-signal (360°-fliken väntar på användarinmatning)
  let aktuelltIdx = 0;
  function manuellPausLyssnare(changes) {
    if (changes.batchManuellPaus?.newValue) {
      const paus = changes.batchManuellPaus.newValue;
      const fältText = (paus.fält || []).join(', ');
      const typText = paus.typ === 'dokument' ? 'Dokumentformulär' : 'Ärendeformulär';
      sättRadStatus(aktuelltIdx, 'pågår', `Manuell inmatning krävs`);
      visaBatchProgress(
        `Rad ${aktuelltIdx + 1}/${antalRader}: ${typText} väntar på manuell inmatning` +
        (fältText ? ` (${fältText})` : '') +
        ' – fyll i fälten i 360°-fliken'
      );
    }
  }
  chrome.storage.onChanged.addListener(manuellPausLyssnare);

  for (let idx = 0; idx < antalRader; idx++) {
    aktuelltIdx = idx;
    if (batchAvbruten) {
      sättRadStatus(idx, 'avbruten', 'Avbruten');
      for (let j = idx + 1; j < antalRader; j++) {
        sättRadStatus(j, 'avbruten', 'Avbruten');
        batchResultat.push({ status: 'avbruten', fel: 'Batchkörning avbruten av användaren' });
      }
      break;
    }

    const rad = rader[idx];
    sättRadStatus(idx, 'pågår', 'Validerar…');
    visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Validerar…`);

    // Validera raden
    const fel = valideraRad(rad, slots);
    if (fel.length > 0) {
      sättRadStatus(idx, 'fel', 'Valideringsfel');
      batchResultat.push({
        rad: idx + 1,
        titel: rad.Titel || rad.titel || '',
        kontakt: rad.Namn || rad.namn || '',
        status: 'fel',
        fel: fel.join('; '),
      });
      continue;
    }

    try {
      // Rensa manuell-paus-signal från föregående rad
      await chrome.storage.local.remove('batchManuellPaus');

      // Bygg mallobjekt
      sättRadStatus(idx, 'pågår', 'Skapar ärende…');
      visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Skapar ärende…`);

      let mall = byggMallFrånRad(baseMall, rad, slots);

      // Förbered filer (konvertera till base64 + spara i storage)
      mall = await förberedFiler(mall);

      // Spara batch-konfiguration så content.js vet att det är en batch
      await chrome.storage.local.set({
        batchKörning: {
          radIdx: idx,
          stängÄrende: inställningar.stängÄrende,
          dagboksblad: inställningar.dagboksblad,
        }
      });
      await chrome.storage.local.remove('batchRadKlar');

      // Starta navigeringslyssnaren INNAN vi skickar skapaFrånMall
      // (annars missar vi navigeringen om den sker snabbt)
      const navigeringsPromise = väntaPåNavigation(tabId, /\/DMS\/Case\/Details\//, 120000);
      console.log(`[batch] Rad ${idx + 1}: Skickar skapaFrånMall till flik ${tabId}…`);

      // Skicka skapaFrånMall till 360°-fliken
      // OBS: skapaFrånMall navigerar sidan – svaret kommer troligen aldrig tillbaka.
      // Timeout 120s: formuläret kan ta lång tid (fyllning + postbacks + submit).
      const svar = await medAvbryt(skickaTillFlik(tabId, {
        action: 'skapaFrånMall',
        mall: mall,
      }, 120000));

      if (svar?._avbruten) throw new Error('Avbruten av användaren');
      console.log(`[batch] Rad ${idx + 1}: skickaTillFlik svar:`, svar);

      // Om vi fick ett explicit felsvar (innan navigering) – avbryt
      if (svar && !svar.success) {
        throw new Error(svar.fel || 'Ärendet kunde inte skapas');
      }

      // Vänta på navigering till den nya ärendesidan
      sättRadStatus(idx, 'pågår', 'Väntar på ärende…');
      visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Väntar på ärende…`);

      const nyUrl = await medAvbryt(navigeringsPromise);
      if (nyUrl?._avbruten) throw new Error('Avbruten av användaren');
      console.log(`[batch] Rad ${idx + 1}: Navigering resultat:`, nyUrl);
      if (!nyUrl) {
        // Kolla om fliken redan är på en ärendesida (navigeringen kan ha skett
        // innan lyssnaren hann registreras vid snabb submit)
        const flikNu = await chrome.tabs.get(tabId).catch(() => null);
        const nuUrl = flikNu?.url || '';
        console.log(`[batch] Rad ${idx + 1}: Flikens nuvarande URL:`, nuUrl);
        if (/\/DMS\/Case\/Details\//.test(nuUrl)) {
          console.log(`[batch] Rad ${idx + 1}: Fliken är redan på ärendesida, fortsätter.`);
        } else {
          throw new Error(
            'Navigering till ärendesida skedde inte inom 120 s. ' +
            'Flikens URL: ' + nuUrl
          );
        }
      }

      // Extrahera diarienummer – vänta på att content.js laddas och läser DOM
      console.log(`[batch] Rad ${idx + 1}: Väntar 4 s på att sidan laddas…`);
      await new Promise(r => setTimeout(r, 4000));

      // Hämta aktuell URL (kan vara nyUrl eller flikens nuvarande URL)
      const flikEfter = await chrome.tabs.get(tabId).catch(() => null);
      const slutUrl = nyUrl || flikEfter?.url || '';

      // Läs diarienummer
      let diarienummer = '';
      const recnoMatch = slutUrl.match(/recno=(\d+)/);
      const recno = recnoMatch ? recnoMatch[1] : '';

      // Vänta på att dokument skapas (om det finns ärendedokument)
      if (mall.ärendedokument?.length > 0) {
        sättRadStatus(idx, 'pågår', 'Skapar dokument…');
        visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Skapar dokument…`);
        console.log(`[batch] Rad ${idx + 1}: Väntar på batchRadKlar-signal (${mall.ärendedokument.length} dokument)…`);

        const signal = await medAvbryt(väntaPåBatchSignal(idx, 300000));
        if (signal?._avbruten) throw new Error('Avbruten av användaren');
        console.log(`[batch] Rad ${idx + 1}: batchRadKlar-signal:`, signal);
        if (!signal) {
          throw new Error('Dokumentskapande tog för lång tid (timeout 5 min)');
        }
        if (signal.avbruten) {
          // Användaren avbröt dokumentskapandet i 360°-dialogen
          throw new Error(signal.fel || 'Dokumentskapande avbrutet av användaren');
        }
        if (signal.fel) {
          throw new Error(`Dokumentfel: ${signal.fel}`);
        }
        diarienummer = signal.diarienummer || '';
      } else {
        // Inga dokument – läs diarienummer direkt
        console.log(`[batch] Rad ${idx + 1}: Inga dokument, läser diarienummer direkt…`);
        try {
          const diarieResp = await skickaTillFlik(tabId, {
            action: 'läsDiarienummer',
          }, 10000);
          console.log(`[batch] Rad ${idx + 1}: diarieResp:`, diarieResp);
          diarienummer = diarieResp?.diarienummer || '';
        } catch { /* ignore */ }
      }

      // Stäng ärende om inställt
      if (inställningar.stängÄrende && !batchAvbruten) {
        sättRadStatus(idx, 'pågår', 'Stänger ärende…');
        visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Stänger ärende…`);

        // Vänta kort för att sidan ska vara redo
        await new Promise(r => setTimeout(r, 1500));

        const statusSvar = await skickaTillFlik(tabId, {
          action: 'sättStatus',
          statusVärde: '6', // Avslutat
        }, 30000);

        if (statusSvar && !statusSvar.success) {
          console.warn(`[batch] Rad ${idx + 1}: Statusändring misslyckades:`, statusSvar.fel);
        }

        // Vänta på att statusändringen går igenom
        await new Promise(r => setTimeout(r, 2000));
      }

      // Dagboksblad
      if (inställningar.dagboksblad && !batchAvbruten) {
        sättRadStatus(idx, 'pågår', 'Öppnar dagboksblad…');
        visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Dagboksblad…`);

        await skickaTillFlik(tabId, { action: 'dagboksblad' }, 15000);
        // Ge tid för utskriftsdialogen
        await new Promise(r => setTimeout(r, 3000));
      }

      // Rad klar!
      sättRadStatus(idx, 'klar', 'Klar');
      batchResultat.push({
        rad: idx + 1,
        titel: rad.Titel || rad.titel || '',
        kontakt: rad.Namn || rad.namn || '',
        diarienummer: diarienummer,
        dokument: (mall.ärendedokument || []).map(d => d._filnamn || d.titel || ''),
        status: 'klar',
      });

    } catch (err) {
      console.error(`[batch] Rad ${idx + 1} misslyckades:`, err);
      sättRadStatus(idx, 'fel', 'Fel');
      batchResultat.push({
        rad: idx + 1,
        titel: rad.Titel || rad.titel || '',
        kontakt: rad.Namn || rad.namn || '',
        status: 'fel',
        fel: err.message,
      });
    }

    // Rensa batch-signal för denna rad
    await chrome.storage.local.remove('batchRadKlar');
  }

  // Rensa batch-körningsdata
  chrome.storage.onChanged.removeListener(manuellPausLyssnare);
  await chrome.storage.local.remove(['batchKörning', 'batchRadKlar', 'batchManuellPaus', 'batchAvbruten']);
  batchKör = false;

  visaBatchProgress(`Klart! ${batchResultat.filter(r => r.status === 'klar').length}/${antalRader} lyckades.`);
  visaResultat(batchResultat);

  return batchResultat;
}

/**
 * Avbryter pågående batchkörning.
 */
async function avbrytBatch() {
  batchAvbruten = true;
  // Signalera till 360°-fliken att avbryta pågående operationer
  await chrome.storage.local.set({ batchAvbruten: true });
  // Avbryt pågående väntan (race mot avbrytPromise)
  if (_avbrytResolve) {
    _avbrytResolve();
    _avbrytResolve = null;
  }
}

/**
 * Visar progresstext i botten.
 */
function visaBatchProgress(text) {
  const el = document.getElementById('batch-progress');
  if (el) el.textContent = text;
}

/**
 * Visar resultattabell efter körning.
 */
function visaResultat(resultat) {
  const panel = document.getElementById('resultat-panel');
  const innehåll = document.getElementById('resultat-innehåll');
  if (!panel || !innehåll) return;

  panel.style.display = 'block';

  const lyckade = resultat.filter(r => r.status === 'klar').length;
  const misslyckade = resultat.filter(r => r.status === 'fel').length;
  const avbrutna = resultat.filter(r => r.status === 'avbruten').length;

  let html = `<p style="margin:0 0 10px;">
    <strong>${lyckade}</strong> lyckades`;
  if (misslyckade > 0) html += `, <strong style="color:#c0392b;">${misslyckade}</strong> misslyckades`;
  if (avbrutna > 0) html += `, <strong style="color:#e67e22;">${avbrutna}</strong> avbrutna`;
  html += `</p>`;

  html += '<table><thead><tr>';
  html += '<th>Rad</th><th>Titel</th><th>Kontakt</th><th>Diarienr</th><th>Dokument</th><th>Status</th><th>Fel</th>';
  html += '</tr></thead><tbody>';

  for (const r of resultat) {
    const statusKlass = r.status === 'klar' ? 'color:#27ae60' :
                        r.status === 'fel' ? 'color:#c0392b' : 'color:#e67e22';
    html += '<tr>';
    html += `<td>${r.rad || ''}</td>`;
    html += `<td>${escBatchHtml(r.titel)}</td>`;
    html += `<td>${escBatchHtml(r.kontakt)}</td>`;
    html += `<td>${escBatchHtml(r.diarienummer || '')}</td>`;
    html += `<td>${escBatchHtml((r.dokument || []).join(', '))}</td>`;
    html += `<td style="${statusKlass};font-weight:600;">${r.status}</td>`;
    html += `<td>${escBatchHtml(r.fel || '')}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table>';
  innehåll.innerHTML = html;
}
