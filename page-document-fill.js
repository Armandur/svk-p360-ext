// page-document-fill.js – Fyller i dokumentformulärets fält
// Körs i sidans MAIN world. Beror på: sleep, waitForElement, sättSelectize,
// sättSelectizeTyst (page-utils.js)
// Laddas före page-document-create.js.

/**
 * Fyller i alla fält i dokumentformuläret baserat på en dokumentmall.
 *
 * @param {Document} iDoc - iframe-dokumentet (dokumentformuläret)
 * @param {Window} iWin - iframe-fönstret
 * @param {Object} dok - Dokumentmall med fält:
 *   titel, handlingstyp, kategori, skyddskod, sekretessParag,
 *   offentligTitelVal, offentligTitel, atkomstgrupp, oregistreradKontakt,
 *   datum (eller ankomstdatum), ansvarigEnhet, ansvarigPerson,
 *   projekt, fastighet
 * @param {Function} visaStatus - Callback för statustext
 * @returns {{ kontaktLagdTill: boolean }} Info om vad som fylldes i
 */
async function fyllDokumentFormulär(iDoc, iWin, dok, visaStatus) {
  const sättSelTyst = (id, val) => sättSelectizeTyst(id, val, iDoc);
  const sättSel = (id, val) => sättSelectize(id, val, iDoc);

  visaStatus('Fyller i dokumentfält…');

  // Handlingstyp – tyst, ingen UpdatePanel
  if (dok.handlingstyp?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ProcessRecordTypeControl',
      dok.handlingstyp.value
    );
  }

  // ---------------------------------------------------------------
  // Skyddskod – MÅSTE sättas FÖRE dokumentkategori.
  //
  // Formuläret ärver ärendets skyddskod (t.ex. KO) som default när
  // det öppnas via ConnectedDocumentDialog. Om mallen har en annan
  // skyddskod triggar bytet en UpdatePanel som nollställer bl.a.
  // TypeJournalDocumentInsertComboControl. Sätts skyddskod EFTER
  // kategori förlorar vi kategorivärdet och får felmeddelandet
  // "Dokumentkategori är tom efter formulärfyllning".
  // ---------------------------------------------------------------
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

  // Dokumentkategori – triggar UpdatePanel (visar/döljer datumfält m.m.).
  // Sätts EFTER skyddskod så att skyddskodets UpdatePanel inte nollställer
  // kategori-värdet.
  if (dok.kategori) {
    await sättSel(
      'PlaceHolderMain_MainView_TypeJournalDocumentInsertComboControl',
      dok.kategori
    );
    // Polla tills UpdatePanel svarat (titelfältet och kontaktfältet finns kvar)
    for (let poll = 0; poll < 20; poll++) {
      await sleep(150);
      const titelFinns = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
      const kontaktFält = iDoc.getElementById('PlaceHolderMain_MainView_Custom_QuickUnregContactText');
      if (titelFinns && kontaktFält) break;
    }
  }

  // Åtkomstgrupp – tyst, ingen UpdatePanel
  if (dok.atkomstgrupp?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_AccessGroupComboControl',
      dok.atkomstgrupp.value
    );
  }

  // Ansvarig enhet – tyst
  if (dok.ansvarigEnhet?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl',
      dok.ansvarigEnhet.value
    );
  }

  // Ansvarig person – tyst
  if (dok.ansvarigPerson?.value) {
    await sättSelTyst(
      'PlaceHolderMain_MainView_ResponsibleUserComboControl',
      dok.ansvarigPerson.value
    );
  }

  // Projekt (typeahead – DISPLAY + hidden + dropDownList)
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

  // Sparat på papper / media – tyst
  if (dok.sparatPaPapper !== undefined && dok.sparatPaPapper !== '') {
    await sättSelTyst('PlaceHolderMain_MainView_PaperControl', dok.sparatPaPapper);
  }

  // Oregistrerad kontakt – sätts EFTER alla UpdatePanel-postbacks (skyddskod,
  // kategori) men FÖRE datum och titel, eftersom kontakt-knappen triggar
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

  return { kontaktLagdTill };
}
