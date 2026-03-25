// batch-run.js – Exekvering av massregistrering
// Körs på batch.html (extension page). Beror på batch-data.js (byggMallFrånRad, valideraRad)
// och batch-table.js (sättRadStatus).

let batchAvbruten = false;
let batchKör = false;
let batchResultat = [];

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
      chrome.tabs.onUpdated.removeListener(lyssnare);
      resolve(null);
    }, timeout);

    function lyssnare(id, info, tab) {
      if (id !== tabId) return;
      if (info.status === 'complete' && tab.url && urlMönster.test(tab.url)) {
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
 * Returnerar null om fliken navigerade bort (connection lost).
 */
function skickaTillFlik(tabId, message, timeout = 120000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          // Fliken navigerade bort eller content.js ej redo – förväntat vid skapaFrånMall
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * Väntar på att content.js signalerar att batchsteget är klart.
 * Signalen skrivs till chrome.storage.local av content.js efter
 * att ärendedokument skapats.
 */
function väntaPåBatchSignal(timeout = 300000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.storage.onChanged.removeListener(lyssnare);
      resolve(null);
    }, timeout);

    function lyssnare(changes) {
      if (changes.batchRadKlar) {
        clearTimeout(timer);
        chrome.storage.onChanged.removeListener(lyssnare);
        resolve(changes.batchRadKlar.newValue);
      }
    }
    chrome.storage.onChanged.addListener(lyssnare);

    // Kolla om signalen redan finns (race condition)
    chrome.storage.local.get('batchRadKlar', (data) => {
      if (data.batchRadKlar) {
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

  for (let i = 0; i < mall.ärendedokument.length; i++) {
    const dok = mall.ärendedokument[i];
    if (dok._filObj) {
      const base64 = await filTillBase64(dok._filObj);
      const storageNyckel = `batchFil_${Date.now()}_${i}`;
      await chrome.storage.local.set({
        [storageNyckel]: [{
          namn: dok._filObj.name,
          typ: dok._filObj.type,
          data: base64,
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
  await chrome.storage.local.remove(['batchRadKlar', 'batchKörning']);

  visaBatchProgress(`Startar batch (0/${antalRader})…`);

  for (let idx = 0; idx < antalRader; idx++) {
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
        kontakt: `${rad.Efternamn || ''}, ${rad.Förnamn || ''}`.trim(),
        status: 'fel',
        fel: fel.join('; '),
      });
      continue;
    }

    try {
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

      // Skicka skapaFrånMall till 360°-fliken
      // OBS: skapaFrånMall navigerar sidan – svaret kommer troligen aldrig tillbaka
      const svar = await skickaTillFlik(tabId, {
        action: 'skapaFrånMall',
        mall: mall,
      }, 60000);

      // Om vi fick svar = case creation misslyckades innan navigering
      if (svar && !svar.success) {
        throw new Error(svar.fel || 'Ärendet kunde inte skapas');
      }

      // Vänta på navigering till den nya ärendesidan
      sättRadStatus(idx, 'pågår', 'Väntar på ärende…');
      visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Väntar på ärende…`);

      const nyUrl = await väntaPåNavigation(tabId, /\/DMS\/Case\/Details\//, 45000);
      if (!nyUrl) {
        throw new Error('Navigering till ärendesida skedde inte inom 45 s');
      }

      // Extrahera diarienummer – vänta på att content.js laddas och läser DOM
      await new Promise(r => setTimeout(r, 3000));

      // Läs diarienummer från flik-titeln eller via meddelande
      let diarienummer = '';
      const recnoMatch = nyUrl.match(/recno=(\d+)/);
      const recno = recnoMatch ? recnoMatch[1] : '';

      // Vänta på att dokument skapas (om det finns ärendedokument)
      if (mall.ärendedokument?.length > 0) {
        sättRadStatus(idx, 'pågår', 'Skapar dokument…');
        visaBatchProgress(`Rad ${idx + 1}/${antalRader}: Skapar dokument…`);

        const signal = await väntaPåBatchSignal(300000);
        if (!signal) {
          throw new Error('Dokumentskapande tog för lång tid (timeout 5 min)');
        }
        if (signal.fel) {
          throw new Error(`Dokumentfel: ${signal.fel}`);
        }
        diarienummer = signal.diarienummer || '';
      } else {
        // Inga dokument – läs diarienummer direkt
        try {
          const diarieResp = await skickaTillFlik(tabId, {
            action: 'läsDiarienummer',
          }, 10000);
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
        kontakt: `${rad.Efternamn || ''}, ${rad.Förnamn || ''}`.trim(),
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
        kontakt: `${rad.Efternamn || ''}, ${rad.Förnamn || ''}`.trim(),
        status: 'fel',
        fel: err.message,
      });
    }

    // Rensa batch-signal för denna rad
    await chrome.storage.local.remove('batchRadKlar');
  }

  // Rensa batch-körningsdata
  await chrome.storage.local.remove(['batchKörning', 'batchRadKlar']);
  batchKör = false;

  visaBatchProgress(`Klart! ${batchResultat.filter(r => r.status === 'klar').length}/${antalRader} lyckades.`);
  visaResultat(batchResultat);

  return batchResultat;
}

/**
 * Avbryter pågående batchkörning.
 */
function avbrytBatch() {
  batchAvbruten = true;
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
