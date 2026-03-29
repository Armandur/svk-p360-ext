// page-document-validate.js – Validering av dokumentformulär
// Körs i sidans MAIN world. Beror på: sleep (page-utils.js)
// Laddas före page-document-create.js.

/**
 * Escapar HTML-tecken i en sträng.
 */
function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Kontrollerar vilka obligatoriska fält i dokumentformuläret som är tomma.
 * @param {Document} iDoc - iframe-dokumentet
 * @param {Object} [options] - Extra info om vad som redan fyllts i automatiskt
 * @param {boolean} [options.kontaktLagdTill] - Om oregistrerad kontakt redan lagts till via postback
 * @returns {string[]} Lista med etiketter för tomma fält.
 */
function kontrolleraObligatoriskaFält(iDoc, options = {}) {
  const tomma = [];

  // Titel (alltid obligatorisk)
  const titel = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
  if (titel && !titel.value.trim()) tomma.push('Titel');

  // Handlingstyp – obligatoriskt om fältet finns och är tomt
  const handlTyp = iDoc.getElementById('PlaceHolderMain_MainView_ProcessRecordTypeControl');
  if (handlTyp && !handlTyp.value) tomma.push('Handlingstyp');

  // Dokumentkategori – obligatoriskt
  const kat = iDoc.getElementById('PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl');
  if (kat && !kat.value) tomma.push('Dokumentkategori');

  // Skyddskod (har default Offentlig=0, kontrollera att det valts)
  // Inte obligatoriskt per se men paragraf är det om skyddskod != 0
  const skyddskod = iDoc.getElementById('PlaceHolderMain_MainView_AccessCodeComboControl');
  if (skyddskod && skyddskod.value && skyddskod.value !== '0') {
    const paragraf = iDoc.getElementById('PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl');
    if (paragraf && !paragraf.value) tomma.push('Paragraf (sekretess)');

    const offTitelVal = iDoc.getElementById('PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl');
    if (offTitelVal && !offTitelVal.value) tomma.push('Val av offentlig titel');
  }

  // Åtkomstgrupp – obligatoriskt
  const atkomst = iDoc.getElementById('PlaceHolderMain_MainView_AccessGroupComboControl');
  if (atkomst && !atkomst.value) tomma.push('Åtkomstgrupp');

  // Ansvarig enhet – obligatoriskt
  const enhet = iDoc.getElementById('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl');
  if (enhet && !enhet.value) tomma.push('Ansvarig enhet');

  // Oregistrerad kontakt – obligatoriskt för Inkommande/Utgående
  // Om kontakten redan lagts till via QuickUnregContactButton-postback, hoppa över.
  const katVärde = kat?.value;
  if ((katVärde === '110' || katVärde === '111') && !options.kontaktLagdTill) {
    const oregKontakt = iDoc.getElementById('PlaceHolderMain_MainView_Custom_QuickUnregContactText');
    const harOregText = oregKontakt && oregKontakt.value.trim();

    if (!harOregText) {
      tomma.push(katVärde === '110' ? 'Avsändare (oregistrerad kontakt)' : 'Mottagare (oregistrerad kontakt)');
    }
  }

  return tomma;
}

/**
 * Läser ärendets klassificering från detaljpanelen på ärendesidan.
 * Panelens fält finns bara i DOM:en när den är utfälld – om den är ihopfälld
 * fälls den ut tillfälligt och fälls sedan ihop igen.
 * @returns {Promise<string|null>} Klassificeringskod (t.ex. "2.4") eller null.
 */
async function läsKlassificeringFrånÄrende() {
  const KLASS_ID = 'PlaceHolderMain_MainView_RightFolderView1_ViewControl_EditClassCodeTextFieldControl';
  let el = document.getElementById(KLASS_ID);

  if (!el) {
    // Panelen är ihopfälld (aria-expanded="false") – fälten finns inte i DOM:en.
    // Fäll ut via __doPostBack och vänta på att servern returnerar innehållet.
    const wrapper = document.querySelector(
      '.details-title-desc-wrapper[aria-expanded="false"]'
    );
    if (wrapper) {
      __doPostBack('ctl00$PlaceHolderMain$MainView$RightFolderView1_ExpandCollapse', '');
      // Vänta på att klassificeringsfältet dyker upp i DOM:en
      for (let i = 0; i < 25; i++) {
        await sleep(200);
        el = document.getElementById(KLASS_ID);
        if (el) break;
      }
      // Fäll ihop igen så att sidan ser ut som innan
      if (el) {
        setTimeout(() => {
          __doPostBack('ctl00$PlaceHolderMain$MainView$RightFolderView1_ExpandCollapse', '');
        }, 300);
      }
    }
  }

  if (el) {
    // "2.4 - Administrera IT och telefoni" → "2.4"
    const text = el.textContent.trim();
    const match = text.match(/^([\d.]+)/);
    return match ? match[1] : text;
  }
  return null;
}

/**
 * Kontrollerar om mallens handlingstyp matchar ärendets klassificering.
 * Handlingstyp-text har formen "2.4-8 (Korrespondens...)" där "2.4" är
 * klassificeringskoden.
 * @returns {{ ok: boolean, ärendeKlass?: string, mallKlass?: string, mallText?: string }}
 */
async function valideraHandlingstyp(dok) {
  if (!dok.handlingstyp?.text) return { ok: true };

  const ärendeKlass = await läsKlassificeringFrånÄrende();
  if (!ärendeKlass) return { ok: true }; // Kan inte validera – fortsätt ändå

  // Extrahera klassificeringskod ur handlingstyp-text: "2.4-8 (...)" → "2.4"
  const match = dok.handlingstyp.text.match(/^([\d.]+)/);
  const mallKlass = match ? match[1] : null;
  if (!mallKlass) return { ok: true }; // Okänt format – fortsätt ändå

  return {
    ok: ärendeKlass === mallKlass,
    ärendeKlass,
    mallKlass,
    mallText: dok.handlingstyp.text,
  };
}
