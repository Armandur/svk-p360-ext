// page-document-create.js – Orkestrering av ärendedokumentskapande
// Körs i sidans MAIN world. Beror på:
//   page-utils.js (sleep, waitForElement, waitForNyIframe, sättSelectize, sättSelectizeTyst)
//   page-document-validate.js (kontrolleraObligatoriskaFält, valideraHandlingstyp, escHtml)
//   page-document-fill.js (fyllDokumentFormulär)
//   page-document-upload.js (öppnaDokumentMedFil, väntaPåPRM)
//   page-document-steps.js (väntaPåAnvändarensSlutför, väntaPåRepeatEllerFel,
//                            triggaDokumentSlutför, triggaCompleteViaDom, säkerställGenerelltFlik)

/**
 * Visar en dialogruta för att ange datum för ett ärendedokument.
 * Returnerar datumsträngen ('idag' eller 'YYYY-MM-DD') eller null om avbruten.
 * @param {Object} dok – Dokumentmall (används för titel och kategori-etikett)
 */
function visaDatumPrompt(dok) {
  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const katLabel = { '110': 'Ankomstdatum', '111': 'Färdigst/exp-datum', '60005': 'Färdigst/exp-datum', '112': 'Färdigst/exp-datum' }[dok.kategori] || 'Datum';
  const idag = new Date();
  const idagISO = `${idag.getFullYear()}-${String(idag.getMonth() + 1).padStart(2, '0')}-${String(idag.getDate()).padStart(2, '0')}`;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99995;' +
      'display:flex;align-items:center;justify-content:center;font-family:sans-serif;';

    const dialog = document.createElement('div');
    dialog.style.cssText =
      'background:#fff;border-radius:8px;padding:24px;width:360px;max-width:95vw;' +
      'font-size:14px;box-shadow:0 4px 24px rgba(0,0,0,0.3);box-sizing:border-box;';

    dialog.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:16px;color:#1a5276;">Ange ${esc(katLabel.toLowerCase())} för "${esc(dok.titel || '(dokument)')}"</h3>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">${esc(katLabel)} <span style="color:#c0392b;">*</span></label>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <input type="radio" name="p360dt-typ" id="p360dt-idag" value="idag" style="width:auto;margin:0;">
          <label for="p360dt-idag" style="display:inline;font-weight:normal;font-size:13px;cursor:pointer;">Dagens datum (${esc(idagISO)})</label>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="radio" name="p360dt-typ" id="p360dt-specifikt" value="datum" checked style="width:auto;margin:0;">
          <label for="p360dt-specifikt" style="display:inline;font-weight:normal;font-size:13px;cursor:pointer;">Ange datum:</label>
          <input type="date" id="p360dt-datum" value="${esc(idagISO)}"
            style="flex:1;padding:5px 7px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
        </div>
      </div>
      <div id="p360dt-fel" style="display:none;color:#c0392b;font-size:12px;margin-bottom:8px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="p360dt-avbryt" style="padding:7px 18px;background:#fff;color:#333;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;">Avbryt</button>
        <button id="p360dt-ok" style="padding:7px 18px;background:#0078d4;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:sans-serif;">OK</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    dialog.querySelector('#p360dt-datum').focus();

    // Aktivera/avaktivera datuminput baserat på val
    dialog.querySelectorAll('input[name="p360dt-typ"]').forEach(r => {
      r.addEventListener('change', () => {
        dialog.querySelector('#p360dt-datum').disabled = (r.value === 'idag');
      });
    });

    dialog.querySelector('#p360dt-ok').addEventListener('click', () => {
      const vald = dialog.querySelector('input[name="p360dt-typ"]:checked')?.value;
      if (vald === 'idag') {
        overlay.remove();
        resolve('idag');
        return;
      }
      const val = dialog.querySelector('#p360dt-datum').value;
      if (!val) {
        const fel = dialog.querySelector('#p360dt-fel');
        fel.textContent = 'Ange ett datum.';
        fel.style.display = '';
        dialog.querySelector('#p360dt-datum').focus();
        return;
      }
      overlay.remove();
      resolve(val);
    });

    dialog.querySelector('#p360dt-avbryt').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });

    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        dialog.querySelector('#p360dt-ok').click();
      } else if (e.key === 'Escape') {
        dialog.querySelector('#p360dt-avbryt').click();
      }
    });
  });
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

  // ---------------------------------------------------------------
  // 0a. Datum-prompt om mallen kräver det
  // ---------------------------------------------------------------
  if (dok.promptaDatum) {
    const promptatDatum = await visaDatumPrompt(dok);
    if (promptatDatum === null) return { cancelled: true };
    dok = { ...dok, datum: promptatDatum };
  }

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
  // 1–3. Öppna dokumentformulär (med eller utan filer)
  //
  //   MED filer: ladda upp via ärendesidans upload-yta → ConnectedDocumentDialog
  //              → Document/New öppnas med filen redan registrerad på servern.
  //              (Kartlagt 2026-03-29, se CLAUDE.md – ConnectedDocumentDialog-flöde)
  //
  //   UTAN filer: öppna formuläret direkt via DocumentActionMenuControl.
  // ---------------------------------------------------------------

  // Konvertera base64-filer till File-objekt (används i båda grenarna)
  if (dok.filerBase64 && dok.filerBase64.length > 0 && (!dok.filer || dok.filer.length === 0)) {
    dok.filer = dok.filerBase64.map(f => {
      const binär = atob(f.base64);
      const bytes = new Uint8Array(binär.length);
      for (let j = 0; j < binär.length; j++) bytes[j] = binär.charCodeAt(j);
      return new File([bytes], f.namn, { type: f.typ || 'application/octet-stream' });
    });
  }

  let iframe;
  if (dok.filer && dok.filer.length > 0) {
    // Ny väg: upload via ärendesidan → ConnectedDocumentDialog → Document/New
    iframe = await öppnaDokumentMedFil(dok.filer, visaStatus, ärAvbruten);
  } else {
    // Gammal väg: öppna tomt formulär direkt
    visaStatus('Öppnar dokumentformulär…');
    __doPostBack(
      'ctl00$PlaceHolderMain$MainView$LeftFolderView1_ViewControl$DocumentActionMenuControl_DropDownMenu',
      '61000'
    );
    iframe = await waitForNyIframe('Document/New', 15000)
          || await waitForNyIframe('70158b84-a8eb-492a-a546-277ee96e16f9', 5000);
    if (!iframe) throw new Error('Dokumentformuläret öppnades inte.');
  }

  // Vänta på att titelfältet finns (säkerhet för båda grenarna)
  await waitForElement(iframe.contentDocument, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000);

  // ---------------------------------------------------------------
  // 4. Fyll i fält på Generellt-fliken
  // ---------------------------------------------------------------
  const generelltRedo = await säkerställGenerelltFlik(iframe);
  if (!generelltRedo) {
    throw new Error('Dokumentformuläret är inte på Generellt-fliken (basfält saknas).');
  }
  let iDoc = iframe.contentDocument;
  let iWin = iframe.contentWindow;
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
  // repeatIframe/iframeStängd kan sättas redan i steg 5 (manuell väg).
  let förhandsRepeat = null;
  let iframeStängd = false;
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
    förhandsRepeat = manuellResultat.repeatIframe || null;
    iframeStängd = manuellResultat.iframeStängd || false;
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
  // 6. Vänta på slutsignal
  // ---------------------------------------------------------------
  // Flöde MED föranmäld fil (ConnectedDocumentDialog → Document/New med recno):
  //   • Ingen RepeatWizardDialog – 360° tar bort Document/New-iframen ur DOM direkt.
  //   • Verifierat via spy-logg 2026-03-29: UploadFilesAsDocumentOperation_POSTBACK →
  //     NewDocumentCaseBrokerListener → iframe_borttagen.
  //
  // Flöde UTAN fil (DocumentActionMenuControl → Document/New utan recno):
  //   • RepeatWizardDialog dyker upp → vi stänger den och läser dokumentnumret.
  const harFiler = !!(dok.filer?.length || dok.filerBase64?.length);
  const WAIT_REPEAT1_MS = 60000;
  const WAIT_REPEAT2_MS = 90000;

  let repeatIframe = förhandsRepeat;

  if (!repeatIframe && !iframeStängd) {
    if (harFiler) {
      // Fil-flöde: vänta på att iframen försvinner (eller RepeatWizardDialog om det mot
      // förmodan skulle dyka upp).
      visaStatus('Väntar på att dokumentet sparas…');
      const start = Date.now();
      while (Date.now() - start < WAIT_REPEAT1_MS) {
        if (!document.contains(iframe)) { iframeStängd = true; break; }
        const repeat = Array.from(document.querySelectorAll('iframe')).find(f => {
          try { return (f.contentDocument?.location?.href || '').includes('RepeatWizardDialog'); }
          catch { return false; }
        });
        if (repeat) { repeatIframe = repeat; break; }
        // Kontrollera valideringsfel tidigt
        let valFel = [];
        try {
          valFel = Array.from(iDoc.querySelectorAll('span.ms-formvalidation'))
            .filter(el => !el.id?.includes('mandatory') && el.textContent.trim().length > 2)
            .map(el => el.textContent.trim());
        } catch { /* ignorera */ }
        if (valFel.length > 0) {
          throw new Error('Dokumentet kunde inte sparas: ' + valFel.join(', '));
        }
        await sleep(300);
      }
    } else {
      // Fil-fritt flöde: RepeatWizardDialog förväntas.
      repeatIframe = await waitForNyIframe('RepeatWizardDialog', WAIT_REPEAT1_MS);

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
        }
        if (!repeatIframe) {
          const valFel = waitResult.valideringsfel || [];
          if (valFel.length > 0) throw new Error('Dokument kunde inte skapas: ' + valFel.join(', '));
          throw new Error('RepeatWizardDialog visades inte efter två Slutför-försök.');
        }
      }
    }
  }

  let dokumentNummer = null;

  if (iframeStängd) {
    // Fil-flöde: dialog stängd utan RepeatWizardDialog – dokumentet är sparat.
    // Vänta kort på att ärendesidans dokumentlista uppdateras.
    await sleep(1000);
  } else if (repeatIframe) {
    // Om iframen kom från steg 5 kan den fortfarande ladda – vänta kort tills URL är klar.
    if (!(repeatIframe.contentDocument?.location?.href || '').includes('RepeatWizardDialog')) {
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        if ((repeatIframe.contentDocument?.location?.href || '').includes('RepeatWizardDialog')) break;
      }
    }

    // Extrahera dokumentnummer ur dialogCaption-parametern
    try {
      const url = new URL(repeatIframe.contentDocument.location.href);
      const caption = decodeURIComponent(url.searchParams.get('dialogCaption') || '');
      dokumentNummer = caption
        .replace(/^Dokumentet\s+/, '')
        .replace(/\s+är skapad?$/, '')
        .trim() || null;
    } catch { /* cross-origin */ }

    // Stäng RepeatWizardDialog – välj "avsluta" (ChoiceControl_0 = ingen upprepning), sedan OK.
    // Viktigt: dispatch av change-event kan trigga en UpdatePanel-postback i dialogen.
    // Vänta på PRM idle INNAN finish-postbacken skickas, annars ignoreras den.
    try {
      const rDoc = repeatIframe.contentDocument;
      const rWin = repeatIframe.contentWindow;

      // Vänta på att formuläret är klart
      await waitForElement(rDoc, '[id*="ChoiceControl"], [id*="DialogButton"]', 5000);
      await väntaPåPRM(rWin, 5000);

      // Välj "Avsluta" om det inte redan är valt – ändra INTE värde om redan checked
      const avsluta = rDoc.getElementById('PlaceHolderMain_MainView_ChoiceControl_0');
      if (avsluta && !avsluta.checked) {
        avsluta.checked = true;
        avsluta.dispatchEvent(new Event('change', { bubbles: true }));
        // Vänta på eventuell UpdatePanel-uppdatering efter change-event
        await väntaPåPRM(rWin, 5000);
      }

      await sleep(200);
      rWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');
    } catch (e) {
      console.warn('[p360-dok] Kunde inte stänga RepeatWizardDialog automatiskt:', e?.message);
    }

    // Polla tills RepeatWizardDialog-iframen försvinner ur DOM (max 12 s)
    for (let poll = 0; poll < 80; poll++) {
      await sleep(150);
      const kvarvarande = Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return (f.src || '').includes('RepeatWizardDialog'); } catch { return false; }
      });
      if (!kvarvarande) break;
    }
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
