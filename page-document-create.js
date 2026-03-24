// page-document-create.js – Skapa ärendedokument från mall
// Körs i sidans MAIN world. Beror på: sleep, waitForElement, waitForNyIframe,
// sättSelectize, sättSelectizeTyst (page-utils.js)

/**
 * Kontrollerar vilka obligatoriska fält i dokumentformuläret som är tomma.
 * Returnerar en lista med etiketter för tomma fält.
 */
function kontrolleraObligatoriskaFält(iDoc) {
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

  return tomma;
}

/**
 * Visar dokumentformuläret för användaren och väntar på att de klickar Slutför.
 * Returnerar ett Promise som resolvar när RepeatWizardDialog dyker upp (= sparat)
 * eller rejectar vid timeout.
 */
function väntaPåAnvändarensSlutför(iframe, tommaFält) {
  return new Promise((resolve, reject) => {
    // Gör iframen synlig och interaktiv (i overlay-läge)
    iframe.style.cssText =
      'position:fixed;top:50px;left:50%;transform:translateX(-50%);' +
      'width:95%;max-width:980px;height:calc(100vh - 100px);' +
      'z-index:100000;border:3px solid #e67e22;border-radius:6px;background:#fff;';

    // Skapa infobanner ovanför iframen
    const banner = document.createElement('div');
    banner.id = 'p360-manuell-banner';
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:100001;' +
      'background:#e67e22;color:#fff;font-family:sans-serif;font-size:13px;' +
      'padding:10px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);text-align:center;';
    banner.textContent =
      `Fyll i: ${tommaFält.join(', ')} – klicka sedan Slutför i formuläret.`;
    document.body.appendChild(banner);

    // Skapa backdrop bakom iframen
    const backdrop = document.createElement('div');
    backdrop.id = 'p360-manuell-backdrop';
    backdrop.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);';
    document.body.appendChild(backdrop);

    const TIMEOUT = 300000; // 5 minuter
    const timer = setTimeout(() => {
      rensa();
      reject(new Error('Timeout – användaren fyllde inte i formuläret inom 5 minuter.'));
    }, TIMEOUT);

    function rensa() {
      clearTimeout(timer);
      banner.remove();
      backdrop.remove();
      // Återställ iframe-stilen (döljs av den normala cleanup-koden)
      iframe.style.cssText = '';
    }

    // Bevaka DOM:en efter RepeatWizardDialog (= dokumentet sparades)
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          const iframes = node.tagName === 'IFRAME' ? [node] : Array.from(node.querySelectorAll?.('iframe') ?? []);
          for (const f of iframes) {
            try {
              const src = f.src || f.contentDocument?.location?.href || '';
              if (src.includes('RepeatWizardDialog')) {
                obs.disconnect();
                rensa();
                resolve();
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
          obs.disconnect();
          rensa();
          resolve();
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
 *   ankomstdatum, ansvarigEnhet, ansvarigPerson
 * @param {Function} visaStatus – Callback för statustext
 * @returns {string|null} Dokumentnumret (t.ex. "KHS 2026-0062:1") eller null
 */
async function skapaÄrendedokument(dok, visaStatus) {
  visaStatus = visaStatus || (() => {});

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
    // Vänta på UpdatePanel-svar (datumfält, kontaktfält m.m. laddas)
    await sleep(1500);
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

  // Ankomstdatum (för inkommande dokument)
  if (dok.ankomstdatum) {
    const datumFält = iDoc.getElementById(
      'PlaceHolderMain_MainView_ReceivedDateControl_si_datepicker'
    );
    if (datumFält) {
      let dd, mm, yyyy;
      if (dok.ankomstdatum === 'idag') {
        const idag = new Date();
        dd = String(idag.getDate()).padStart(2, '0');
        mm = String(idag.getMonth() + 1).padStart(2, '0');
        yyyy = idag.getFullYear();
      } else {
        // Förväntat format: YYYY-MM-DD
        const delar = dok.ankomstdatum.split('-');
        yyyy = delar[0]; mm = delar[1]; dd = delar[2];
      }
      datumFält.value = `${dd}.${mm}.${yyyy}`;
      datumFält.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Oregistrerad kontakt (avsändare/mottagare)
  if (dok.oregistreradKontakt) {
    // Fältet för oregistrerad kontakt och dess bekräfta-knapp
    const kontaktFält = iDoc.getElementById(
      'PlaceHolderMain_MainView_UnregisteredSenderTextBoxControl'
    );
    if (kontaktFält) {
      kontaktFält.value = dok.oregistreradKontakt;
      kontaktFält.dispatchEvent(new Event('change', { bubbles: true }));
      // Klicka på bekräfta-knappen (bock-ikonen bredvid fältet)
      const bekräftaBtn = iDoc.getElementById(
        'PlaceHolderMain_MainView_AddUnregisteredSenderButtonControl'
      );
      if (bekräftaBtn) {
        bekräftaBtn.click();
        await sleep(1000);
      }
    }
  }

  // Skyddskod – triggar UpdatePanel om KO/OSL (paragraf-fältet dyker upp)
  if (dok.skyddskod && dok.skyddskod !== '0') {
    await sättSel('PlaceHolderMain_MainView_AccessCodeComboControl', dok.skyddskod);

    const paragrafFält = await waitForElement(
      iDoc,
      '#PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl',
      10000
    );
    if (paragrafFält && dok.sekretessParag) {
      await sättSelTyst(
        'PlaceHolderMain_MainView_AccessCodeAuthorizationComboControl',
        dok.sekretessParag
      );
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
  const tommaObl = kontrolleraObligatoriskaFält(iDoc);
  if (tommaObl.length > 0) {
    visaStatus(`Fyll i obligatoriska fält: ${tommaObl.join(', ')}`);
    await väntaPåAnvändarensSlutför(iframe, tommaObl);
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

    // Stäng RepeatWizardDialog
    try {
      const rDoc = repeatIframe.contentDocument;
      const rWin = repeatIframe.contentWindow;
      await waitForElement(rDoc, '#PlaceHolderMain_MainView_DialogButton', 3000);
      rWin.__doPostBack('ctl00$PlaceHolderMain$MainView$DialogButton', 'finish');
    } catch { /* ignorera */ }

    // Vänta på att dialogen stängs och ärendesidan uppdateras
    await sleep(2000);
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
 * @returns {Array} Resultat per dokument: { titel, dokumentNummer, fel }
 */
async function skapaAllaÄrendedokument(dokument) {
  if (!dokument?.length) return [];

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

  for (let i = 0; i < dokument.length; i++) {
    const dok = dokument[i];
    const nr = i + 1;
    visaStatus(`Ärendedokument ${nr}/${dokument.length}: ${dok.titel || '(utan titel)'}…`);

    try {
      const dokumentNummer = await skapaÄrendedokument(dok, visaStatus);
      resultat.push({ titel: dok.titel, dokumentNummer, fel: null });
      console.log(`[p360] Ärendedokument ${nr}/${dokument.length} skapat: ${dokumentNummer}`);
    } catch (err) {
      resultat.push({ titel: dok.titel, dokumentNummer: null, fel: err.message });
      console.error(`[p360] Ärendedokument ${nr}/${dokument.length} misslyckades:`, err.message);
    }

    // Vänta mellan dokument så att 360° hinner uppdatera sidan
    if (i < dokument.length - 1) {
      await sleep(1500);
    }
  }

  // Visa sammanfattning
  const lyckade = resultat.filter(r => r.dokumentNummer);
  const misslyckade = resultat.filter(r => r.fel);
  let sammanfattning = `Klart: ${lyckade.length}/${dokument.length} ärendedokument skapade.`;
  if (misslyckade.length > 0) {
    sammanfattning += ' Misslyckade: ' + misslyckade.map(r => r.titel || '(utan titel)').join(', ');
  }
  visaStatus(sammanfattning);

  // Ta bort statusfältet efter 8 sekunder
  setTimeout(() => statusBar.remove(), 8000);

  return resultat;
}
