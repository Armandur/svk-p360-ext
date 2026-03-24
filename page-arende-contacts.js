// page-arende-contacts.js – Lägg till oregistrerade externa kontakter i ärendeskapande-dialogen
// Körs i sidans MAIN world. Beror på: sleep, waitForNyIframe, waitForElement (page-utils.js)

/**
 * Lägger till en oregistrerad extern kontakt via 360°:s multi-stegsdialog.
 * (NewActivityContact → JournalCaseContactNew → ev. DuplicateContacts)
 */
async function läggTillExternKontakt(kontakt, pb = __doPostBack) {
  pb('ctl00$PlaceHolderMain$MainView$AddUnregCasePartMenuButtonControl_DropDownMenu', kontakt.roll || '9');

  const typIframe = await waitForNyIframe('NewActivityContact', 8000);
  if (!typIframe) { alert('Typ-dialogen öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  const typDoc = typIframe.contentDocument;
  await waitForElement(typDoc, '#PlaceHolderMain_MainView_ContactTypeComboBoxControl', 3000);

  const typSel = typDoc.getElementById('PlaceHolderMain_MainView_ContactTypeComboBoxControl');
  if (typSel?.selectize) { typSel.selectize.setValue('0'); } else if (typSel) { typSel.value = '0'; }

  typIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');

  const kontaktIframe = await waitForNyIframe('JournalCaseContactNew', 10000);
  if (!kontaktIframe) { alert('Kontaktformuläret öppnades inte för kontakt: ' + (kontakt.namn || '')); return; }

  await waitForElement(kontaktIframe.contentDocument, '#PlaceHolderMain_MainView_ContactNameControl', 5000);
  const kDoc = kontaktIframe.contentDocument;

  const sättFält = (id, val) => {
    const el = kDoc.getElementById(id);
    if (el && val) {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  sättFält('PlaceHolderMain_MainView_ContactNameControl', kontakt.namn);
  sättFält('PlaceHolderMain_MainView_ContactName2Control', kontakt.kontaktperson);
  sättFält('PlaceHolderMain_MainView_ContactAddressControl', kontakt.adress);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipCode_zip_code', kontakt.postnummer);
  sättFält('PlaceHolderMain_MainView_ZipCode_zipPlace_zip_place', kontakt.ort);
  sättFält('PlaceHolderMain_MainView_ContactEmailControl', kontakt.epost);
  sättFält('PlaceHolderMain_MainView_Phone', kontakt.telefon);
  sättFält('PlaceHolderMain_MainView_ContactNotesControl', kontakt.kommentar);

  await sleep(300);

  const iframesVidPostBack = Array.from(document.querySelectorAll('iframe')).map(f => {
    try { return f.contentDocument?.location?.href || f.src || '(tom)'; } catch { return f.src || '(cross-origin)'; }
  });
  console.log('[p360-debug] PostBack skickas. Iframes i DOM:', iframesVidPostBack);

  kontaktIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');

  // Parallell detektering av dubblettdialog eller att kontaktformuläret stängs.
  const dubblettIframe = await new Promise(resolve => {
    let resolved = false;
    const done = (val, källa) => {
      if (!resolved) {
        resolved = true;
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => {
          try { return f.contentDocument?.location?.href || f.src || '(tom)'; } catch { return f.src || '(cross-origin)'; }
        });
        console.log(`[p360-debug] dubblettIframe resolved via ${källa}:`, val ? val.src : null, '| Iframes i DOM:', iframes);
        resolve(val);
      }
    };

    // Spår 1 – waitForNyIframe hanterar sen src-sättning och redirectar
    waitForNyIframe('DuplicateContacts', 12000).then(f => done(f, 'waitForNyIframe'));

    // Spår 2 – kontaktformuläret stängs → ingen dubblett (med 500 ms grace)
    function harKontaktIframe() {
      return Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return f.src?.includes('JournalCaseContactNew') || f.contentDocument?.location?.href?.includes('JournalCaseContactNew'); }
        catch { return false; }
      });
    }
    const signaleraIngenDubblett = () => {
      console.log('[p360-debug] JournalCaseContactNew försvann – startar 500 ms grace');
      setTimeout(() => done(null, 'grace-timeout'), 500);
    };

    if (!harKontaktIframe()) { signaleraIngenDubblett(); return; }

    const obs = new MutationObserver(() => {
      const iframes = Array.from(document.querySelectorAll('iframe')).map(f => {
        try { return f.contentDocument?.location?.href || f.src || '(tom)'; } catch { return f.src || '(cross-origin)'; }
      });
      console.log('[p360-debug] DOM-mutation, iframes:', iframes);
      if (!harKontaktIframe()) { obs.disconnect(); signaleraIngenDubblett(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });

  console.log('[p360-debug] Resultat dubblettIframe:', dubblettIframe ? dubblettIframe.src : null);

  if (dubblettIframe) {
    console.log('[p360-debug] Anropar __doPostBack("no"). contentWindow.location:', (() => { try { return dubblettIframe.contentWindow?.location?.href; } catch(e) { return 'FEL: ' + e.message; } })());
    console.log('[p360-debug] __doPostBack finns:', typeof dubblettIframe.contentWindow?.__doPostBack);
    try {
      dubblettIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'no');
      console.log('[p360-debug] __doPostBack("no") skickades utan fel');
    } catch (e) {
      console.error('[p360-debug] FEL vid __doPostBack("no"):', e);
    }
    // Vänta på att kontaktformuläret stängs efter dubbletthantering
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 8000);
      const obs = new MutationObserver(() => {
        const harKontakt = Array.from(document.querySelectorAll('iframe')).some(f => {
          try { return f.src?.includes('JournalCaseContactNew') || f.contentDocument?.location?.href?.includes('JournalCaseContactNew'); }
          catch { return false; }
        });
        if (!harKontakt) { clearTimeout(timer); obs.disconnect(); resolve(); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }
}
