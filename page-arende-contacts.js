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
  await sleep(200);

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

  await sleep(1500);
  const dubblettIframe = Array.from(document.querySelectorAll('iframe')).find(f => {
    try { return f.src?.includes('DuplicateContacts') || f.contentDocument?.location?.href?.includes('DuplicateContacts'); }
    catch { return false; }
  });
  if (dubblettIframe) {
    dubblettIframe.contentWindow.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'no');
    await sleep(1000);
  }

  await new Promise(resolve => {
    const t = Date.now();
    const check = setInterval(() => {
      const harKontakt = Array.from(document.querySelectorAll('iframe')).some(f => {
        try { return f.src?.includes('JournalCaseContactNew') || f.contentDocument?.location?.href?.includes('JournalCaseContactNew'); }
        catch { return false; }
      });
      if (!harKontakt || Date.now() - t > 12000) { clearInterval(check); resolve(); }
    }, 200);
  });
}
