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
  kontaktIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');

  // Vänta händelsestyrt på antingen en dubblettvarning eller att kontaktformuläret stängs.
  // OBS: 360° tar bort JournalCaseContactNew INNAN DuplicateContacts läggs till, så vi
  // debouncar "inget kontaktformulär"-detekteringen med 200 ms för att undvika race condition.
  const dubblettIframe = await new Promise(resolve => {
    function harKontaktIframe() {
      return Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return f.src?.includes('JournalCaseContactNew') || f.contentDocument?.location?.href?.includes('JournalCaseContactNew'); }
        catch { return false; }
      });
    }
    function finnDublett() {
      return Array.from(document.querySelectorAll('iframe')).find(f => {
        try { return f.src?.includes('DuplicateContacts') || f.contentDocument?.location?.href?.includes('DuplicateContacts'); }
        catch { return false; }
      });
    }

    // Om kontaktformuläret redan försvunnit – ge 200 ms för dubblettdialog att dyka upp
    if (!harKontaktIframe()) {
      setTimeout(() => resolve(finnDublett() ?? null), 200);
      return;
    }

    let stängdTimer = null;
    const timer = setTimeout(() => { obs.disconnect(); resolve(null); }, 12000);
    const obs = new MutationObserver(() => {
      const dupl = finnDublett();
      if (dupl) {
        clearTimeout(timer); clearTimeout(stängdTimer);
        obs.disconnect(); resolve(dupl); return;
      }
      if (!harKontaktIframe()) {
        // Kontaktformuläret försvann – vänta kort innan vi slår fast att ingen dubblett kommer
        clearTimeout(stängdTimer);
        stängdTimer = setTimeout(() => {
          const duplSen = finnDublett();
          clearTimeout(timer); obs.disconnect(); resolve(duplSen ?? null);
        }, 200);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  });

  if (dubblettIframe) {
    dubblettIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'no');
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
