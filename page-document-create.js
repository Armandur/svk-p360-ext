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

  // Kontrollera avbryt innan vi öppnar formuläret
  if (ärAvbruten?.()) {
    console.log('[p360-dok] Avbruten före formuläröppning – hoppar över.');
    return { cancelled: true };
  }

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
  console.log('[p360-dok] Filstatus:', 'filerBase64:', dok.filerBase64?.length || 0,
    'filer:', dok.filer?.length || 0, 'titel:', dok.titel);
  if (dok.filerBase64 && dok.filerBase64.length > 0 && (!dok.filer || dok.filer.length === 0)) {
    console.log('[p360-dok] Konverterar base64 → File:', dok.filerBase64.map(f =>
      f.namn + ' base64:' + (f.base64 ? f.base64.length + ' tecken' : 'SAKNAS')));
    dok.filer = dok.filerBase64.map(f => {
      const binär = atob(f.base64);
      const bytes = new Uint8Array(binär.length);
      for (let j = 0; j < binär.length; j++) bytes[j] = binär.charCodeAt(j);
      return new File([bytes], f.namn, { type: f.typ || 'application/octet-stream' });
    });
    console.log('[p360-dok] File-objekt skapade:', dok.filer.map(f => f.name + ' (' + f.size + ' bytes)'));
  }

  // ---------------------------------------------------------------
  // 3. Fyll i fält på Generellt-fliken INNAN filuppladdning.
  //
  //    Ordningen är kritisk: flikbyte Filer → Generellt nollställer
  //    formulärfälten (server-side reset). Fältvärden vi fyller i på
  //    Generellt bevaras däremot i ViewState vid Generellt → Filer-
  //    navigering och läses av servern vid Slutför-postback.
  //    Slutför skickas direkt från Filer-fliken (om filer finns) så
  //    att SI_HiddenField_ScannedFilepath ingår i POST-datat.
  // ---------------------------------------------------------------
  const { kontaktLagdTill } = await fyllDokumentFormulär(iDoc, iWin, dok, visaStatus);

  // ---------------------------------------------------------------
  // 4. Kontrollera obligatoriska fält – pausa om något saknas
  // ---------------------------------------------------------------
  const tommaObl = kontrolleraObligatoriskaFält(iDoc, { kontaktLagdTill });
  if (tommaObl.length > 0) {
    visaStatus(`Fyll i obligatoriska fält: ${tommaObl.join(', ')}`);
    // Signalera till batch-sidan att manuell inmatning behövs
    window.dispatchEvent(new CustomEvent('p360-batch-manuell-paus', {
      detail: { fält: tommaObl, typ: 'dokument', titel: dok.titel || '' }
    }));
    const manuellResultat = await väntaPåAnvändarensSlutför(iframe, tommaObl);
    if (manuellResultat.cancelled) {
      try { iframe.remove(); } catch { /* ignorera */ }
      return { cancelled: true };
    }
  } else {
    // ---------------------------------------------------------------
    // 5. Ladda upp filer (om filer finns)
    //
    //    Ordning: fält fylldes redan på Generellt (steg 3).
    //    Vänta på PRM (eventuella UpdatePanels från fyllning klar).
    //    Navigera till Filer → ladda upp → SI_HiddenField_ScannedFilepath
    //    sätts i Filer-flikens DOM av servern.
    //    Spara upload-fält → navigera tillbaka till Generellt →
    //    återinjicera sparade fält → skicka från Generellt.
    //    (Slutför fungerar bara korrekt från Generellt-fliken i 360°.)
    // ---------------------------------------------------------------
    if (dok.filer && dok.filer.length > 0) {
      // Vänta tills eventuella UpdatePanels från formulärfyllning är klara
      await väntaPåPRM(iWin, 10000);

      visaStatus('Laddar upp filer…');
      const uploadRes = await laddaUppFiler(iframe, dok.filer, visaStatus, ärAvbruten);
      if (uploadRes.misslyckade.length > 0) {
        console.warn('[p360-dok] Misslyckade filuppladdningar:', uploadRes.misslyckade);
      }

      if (uploadRes.lyckade.length > 0) {
        // Spara upload-relaterade hidden fields INNAN vi navigerar tillbaka.
        // SI_HiddenField_ScannedFilepath sätts av servern i Filer-UpdatePanel
        // och rensas annars när servern renderar Generellt-fliken igen.
        const uppladdningsFält = Array.from(iDoc.querySelectorAll('input[type="hidden"]'))
          .filter(el => {
            const key = (el.id + '|' + el.name).toLowerCase();
            return key.includes('scannedfilepath') || key.includes('hiddenuploadedfiles');
          })
          .map(el => ({ id: el.id, name: el.name, value: el.value }))
          .filter(f => f.value);
        console.log('[p360-dok] Upload-fält sparade (Filer-fliken):', uppladdningsFält);

        // Navigera tillbaka till Generellt – Slutför kräver att vi är på Generellt
        visaStatus('Återgår till Generellt…');
        await väntaPåPRM(iWin, 5000);
        iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'GeneralStep');
        await waitForElement(iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 8000);
        await väntaPåPRM(iWin, 5000);

        // Återinjicera upload-fält som rensats av GeneralStep-svaret
        for (const fält of uppladdningsFält) {
          const el = fält.id ? iDoc.getElementById(fält.id)
                   : fält.name ? iDoc.querySelector(`[name="${fält.name}"]`) : null;
          if (el) {
            if (el.value !== fält.value) {
              console.log(`[p360-dok] Återställer ${fält.id || fält.name}: → "${fält.value}"`);
              el.value = fält.value;
            }
          } else if (fält.name) {
            const form = iDoc.forms[0];
            if (form) {
              const nyttEl = iDoc.createElement('input');
              nyttEl.type = 'hidden';
              nyttEl.name = fält.name;
              if (fält.id) nyttEl.id = fält.id;
              nyttEl.value = fält.value;
              form.appendChild(nyttEl);
              console.log(`[p360-dok] Injicerade dolt fält ${fält.id || fält.name}: "${fält.value}"`);
            }
          }
        }
      }
    }

    // Skicka formuläret från Generellt-fliken
    visaStatus('Sparar ärendedokument…');
    const slutförBtn = iDoc.querySelector(
      'input[onclick*="WizardNavigationButton"][onclick*="finish"]'
    );
    if (slutförBtn) {
      slutförBtn.click();
    } else {
      iWin.__doPostBack('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
    }
  }

  // ---------------------------------------------------------------
  // 4. Vänta på RepeatWizardDialog – innehåller dokumentnumret
  // ---------------------------------------------------------------
  const repeatIframe = await waitForNyIframe('RepeatWizardDialog', 15000);
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
    let valideringsfel = [];
    try {
      valideringsfel = Array.from(iDoc.querySelectorAll('span.ms-formvalidation'))
        .filter(el => !el.id?.includes('mandatory') && el.textContent.trim().length > 2)
        .map(el => el.textContent.trim());
    } catch { /* ignorera */ }

    if (valideringsfel.length > 0) {
      throw new Error('Dokument kunde inte skapas: ' + valideringsfel.join(', '));
    }
    throw new Error('RepeatWizardDialog visades inte – dokumentet skapades troligen inte.');
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
