// page-document-create.js – Skapa ärendedokument från mall
// Körs i sidans MAIN world. Beror på: sleep, waitForElement, waitForNyIframe,
// sättSelectize, sättSelectizeTyst (page-utils.js)

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
        // Ta bort alla öppna dialog-element (och deras wrapper-div om den är tom)
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
          // Kolla dialog-element (360° skapar nya <dialog> med iframes inuti)
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
 * @param {Object} dok  – Dokumentmall med fält:
 *   titel, handlingstyp, kategori, skyddskod, sekretessParag,
 *   offentligTitelVal, offentligTitel, atkomstgrupp, oregistreradKontakt,
 *   datum (eller ankomstdatum för bakåtkompatibilitet), ansvarigEnhet, ansvarigPerson,
 *   projekt, fastighet
 * @param {Function} visaStatus – Callback för statustext
 * @returns {string|null} Dokumentnumret (t.ex. "KHS 2026-0062:1") eller null
 */
function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

async function skapaÄrendedokument(dok, visaStatus) {
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

  const iDoc = iframe.contentDocument;
  const iWin = iframe.contentWindow;

  // Vänta på att formuläret laddats
  const titelFält = await waitForElement(
    iDoc, '#PlaceHolderMain_MainView_TitleTextBoxControl', 10000
  );
  if (!titelFält) throw new Error('Dokumentformuläret laddades inte korrekt.');

  const pb = (t, a) => iWin.__doPostBack(t, a);
  const sättSelTyst = (id, val) => sättSelectizeTyst(id, val, iDoc);
  const sättSel = (id, val) => sättSelectize(id, val, iDoc);

  // ---------------------------------------------------------------
  // 2. Fyll i fält
  // ---------------------------------------------------------------
  visaStatus('Fyller i dokumentfält…');

  // Handlingstyp
  if (dok.handlingstyp?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ProcessRecordTypeControl',
      dok.handlingstyp.value
    );
  }

  // Dokumentkategori – triggar UpdatePanel (visar datumfält m.m.)
  if (dok.kategori) {
    await sättSel(
      'PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl',
      dok.kategori
    );
    // Polla tills UpdatePanel svarat (titelfältet finns kvar efter uppdatering)
    for (let poll = 0; poll < 20; poll++) {
      await sleep(150);
      const titelFinns = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
      const kontaktFält = iDoc.getElementById('PlaceHolderMain_MainView_Custom_QuickUnregContactText');
      if (titelFinns && kontaktFält) break;
    }
  }

  // Åtkomstgrupp
  if (dok.atkomstgrupp?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_AccessGroupComboControl',
      dok.atkomstgrupp.value
    );
  }

  // Ansvarig enhet
  if (dok.ansvarigEnhet?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl',
      dok.ansvarigEnhet.value
    );
  }

  // Ansvarig person
  if (dok.ansvarigPerson?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ResponsibleUserComboControl',
      dok.ansvarigPerson.value
    );
  }

  // Projekt (typeahead – DISPLAY + hidden + dropDownList + HiddenButton-postback)
  if (dok.projekt?.value) {
    const projektVis = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY');
    const projektDolt = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl');
    const projektLista = iDoc.getElementById('PlaceHolderMain_MainView_ProjectQuickSearchControl_dropDownList');
    if (projektVis) projektVis.value = dok.projekt.display || '';
    if (projektDolt) projektDolt.value = dok.projekt.value;
    if (projektLista) {
      if (!Array.from(projektLista.options).some(o => o.value === dok.projekt.value)) {
        const opt = document.createElement('option');
        opt.value = dok.projekt.value;
        opt.textContent = dok.projekt.display || dok.projekt.value;
        projektLista.appendChild(opt);
      }
      projektLista.value = dok.projekt.value;
    }
  }

  // Fastighet (typeahead – samma mönster som Projekt)
  if (dok.fastighet?.value) {
    const fastVis = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl_DISPLAY');
    const fastDolt = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl');
    const fastLista = iDoc.getElementById('PlaceHolderMain_MainView_EstateGeneralTabSearchControl_dropDownList');
    if (fastVis) fastVis.value = dok.fastighet.display || '';
    if (fastDolt) fastDolt.value = dok.fastighet.value;
    if (fastLista) {
      if (!Array.from(fastLista.options).some(o => o.value === dok.fastighet.value)) {
        const opt = document.createElement('option');
        opt.value = dok.fastighet.value;
        opt.textContent = dok.fastighet.display || dok.fastighet.value;
        fastLista.appendChild(opt);
      }
      fastLista.value = dok.fastighet.value;
    }
  }

  // Skyddskod – formuläret ärver ärendets skyddskod som default, så vi måste
  // alltid sätta värdet explicit. Om mallen säger Offentlig (0) men ärendet
  // har KO/OSL triggar vi en UpdatePanel som tar bort sekretessfälten.
  if (dok.skyddskod && dok.skyddskod !== '0') {
    // Sekretess – triggar UpdatePanel (paragraf-fältet dyker upp)
    await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', dok.skyddskod);

    const paragrafFält = await waitForElement(
      iDoc,
      '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl',
      10000
    );
    if (paragrafFält && dok.sekretessParag) {
      // Vänta kort så att Selectize hinner initialiseras med options
      await sleep(500);
      await sättSelTyst(
        'PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl',
        dok.sekretessParag
      );
      // Verifiera att värdet faktiskt sattes – om inte, försök igen
      const paragrafEl = iDoc.getElementById(
        'PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl'
      );
      if (paragrafEl && paragrafEl.value !== dok.sekretessParag) {
        console.warn('[p360-dok] Paragraf-värde sattes inte korrekt, försöker igen…',
          'Förväntat:', dok.sekretessParag, 'Fick:', paragrafEl.value);
        await sleep(1000);
        await sättSelTyst(
          'PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl',
          dok.sekretessParag
        );
        if (paragrafEl.value !== dok.sekretessParag) {
          console.error('[p360-dok] Paragraf-värde kunde inte sättas.',
            'Tillgängliga options:', Array.from(paragrafEl.options).map(o => o.value));
        }
      }
    }

    // Vänta på att SelectOfficialTitleComboBoxControl dyker upp i DOM
    const offTitelValFält = await waitForElement(
      iDoc,
      '#PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl',
      5000
    );

    // Val av offentlig titel
    if (offTitelValFält && dok.offentligTitelVal) {
      if (dok.offentligTitelVal === '3') {
        // Manuell titel – behöver postback för att visa det manuella fältet
        await sättSel(
          'PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl',
          dok.offentligTitelVal
        );
        // Vänta på UpdatePanel-svar (PublicTitleTextBoxControl laddas)
        await sleep(1500);
        if (dok.offentligTitel) {
          const offTitelFält = await waitForElement(
            iDoc,
            '#PlaceHolderMain_MainView_PublicTitleTextBoxControl',
            5000
          );
          if (offTitelFält) {
            offTitelFält.value = dok.offentligTitel;
            offTitelFält.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      } else {
        // Val 1 eller 2 – inget extra fält behövs, sätt tyst utan postback
        await sättSelTyst(
          'PlaceHolderMain_MainView_SelectOfficialTitleComboBoxControl',
          dok.offentligTitelVal
        );
      }
    }
  } else {
    // Offentlig – sätt explicit ifall ärendet har en annan skyddskod som default.
    // Kolla om formuläret redan har Offentlig – om inte, sätt via postback.
    const nuvarandeSkyddskod = iDoc.getElementById(
      'PlaceHolderMain_MainView_AccessCodeComboControl'
    )?.value;
    if (nuvarandeSkyddskod && nuvarandeSkyddskod !== '0') {
      await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', '0');
      // Vänta på UpdatePanel-svar (sekretessfälten försvinner)
      await sleep(1500);
    }
  }

  // Oregistrerad kontakt – sätts EFTER alla UpdatePanel-postbacks (kategori,
  // skyddskod) men FÖRE datum och titel, eftersom kontakt-knappen triggar
  // en egen UpdatePanel som nollställer datumfältet.
  // OBS: För Upprättat (60005) finns inget ToContactQuickSearchControl,
  // men QuickUnregContactText finns för alla kategorier.
  let kontaktLagdTill = false;
  if (dok.oregistreradKontakt) {
    const kontaktFält = iDoc.getElementById(
      'PlaceHolderMain_MainView_Custom_QuickUnregContactText'
    );
    if (kontaktFält) {
      kontaktFält.value = dok.oregistreradKontakt;
      kontaktFält.dispatchEvent(new Event('change', { bubbles: true }));
      const bekräftaBtn = iDoc.getElementById(
        'PlaceHolderMain_MainView_Custom_QuickUnregContactButton'
      );
      if (bekräftaBtn) {
        bekräftaBtn.click();
        await sleep(1500);
        kontaktLagdTill = true;
      }
    }
  }

  // Datum – sätts EFTER alla UpdatePanel-postbacks.
  // Inkommande (110) → ReceivedDateControl (Ankomstdatum)
  // Övriga (111, 60005, 112) → DispatchedDateControl (Färdigst/exp-datum)
  // SI-datepicker har tre element:
  //   _si_datepicker        = synligt textfält (name tom, postas EJ)
  //   _si_datepicker_hidden = dolt fält (name=ctl00$..., postas till server)
  const datumVärde = dok.datum || dok.ankomstdatum || ''; // bakåtkompatibel
  if (datumVärde) {
    let dd, mm, yyyy;
    if (datumVärde === 'idag') {
      const idag = new Date();
      dd = String(idag.getDate()).padStart(2, '0');
      mm = String(idag.getMonth() + 1).padStart(2, '0');
      yyyy = idag.getFullYear();
    } else {
      const delar = datumVärde.split('-');
      yyyy = delar[0]; mm = delar[1]; dd = delar[2];
    }
    const datumISO = `${yyyy}-${mm}-${dd}`;

    // Välj rätt datumkontroll beroende på kategori
    const datumPrefix = dok.kategori === '110'
      ? 'PlaceHolderMain_MainView_ReceivedDateControl'
      : 'PlaceHolderMain_MainView_DispatchedDateControl';

    // Synligt fält (visar datumet för användaren)
    const datumFält = iDoc.getElementById(datumPrefix + '_si_datepicker');
    if (datumFält) {
      datumFält.value = datumISO;
    }

    // Dolt fält som faktiskt postas – YYYY-MM-DD (ISO-format)
    const doltFält = iDoc.getElementById(datumPrefix + '_si_datepicker_hidden');
    if (doltFält) {
      doltFält.value = datumISO;
    }

  }

  // Titel – sätts sist så att eventuella UpdatePanels inte nollställer den.
  // Hämta elementet på nytt ifall en UpdatePanel ersatte DOM-noden.
  const aktuellTitel = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
  if (aktuellTitel) {
    aktuellTitel.value = dok.titel || '';
    aktuellTitel.dispatchEvent(new Event('input', { bubbles: true }));
    aktuellTitel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------------------------------------------------------------
  // 3. Kontrollera obligatoriska fält – pausa om något saknas
  // ---------------------------------------------------------------
  const tommaObl = kontrolleraObligatoriskaFält(iDoc, { kontaktLagdTill });
  if (tommaObl.length > 0) {
    visaStatus(`Fyll i obligatoriska fält: ${tommaObl.join(', ')}`);
    const manuellResultat = await väntaPåAnvändarensSlutför(iframe, tommaObl);
    if (manuellResultat.cancelled) {
      // Stäng dokumentformulärets iframe
      try { iframe.remove(); } catch { /* ignorera */ }
      return { cancelled: true };
    }
  } else {
    // Alla obligatoriska fält ifyllda – skicka automatiskt
    visaStatus('Sparar ärendedokument…');
    const slutförBtn = iDoc.querySelector(
      'input[onclick*="WizardNavigationButton"][onclick*="finish"]'
    );
    if (slutförBtn) {
      slutförBtn.click();
    } else {
      pb('ctl00$PlaceHolderMain$MainView$WizardNavigationButton', 'finish');
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
    // Radioknappar: 0 = "avsluta", 1 = "registrera flera", 2 = "registrera flera baserat på sist"
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

  for (let i = 0; i < dokument.length; i++) {
    const dok = dokument[i];
    const nr = i + 1;
    visaStatus(`Ärendedokument ${nr}/${dokument.length}: ${dok.titel || '(utan titel)'}…`);

    try {
      const svar = await skapaÄrendedokument(dok, visaStatus);

      // Kontrollera om användaren avbröt
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
    // Ta bort statusfältet efter 8 sekunder
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
