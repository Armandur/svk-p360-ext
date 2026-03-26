// page-arende-options.js – Inläsning av formuläralternativ för nytt-ärende-dialogen
// Körs i sidans MAIN world. Beror på: sleep (page-utils.js)

// URL till nytt-ärende-formuläret i dialogläge. Laddas som iframe inom befintlig 360°-sida
// för att säkerställa rätt sessionskontekst – direktnavigering via GET fungerar ej.
// context-data måste innehålla alla tre parametrar som 360°:s menyknapp skickar:
//   subtype,Primary,61000  – ärendetyp
//   IsDlg,Primary,1        – dialog-flagga (context-data-versionen)
//   name,Primary,DMS.Case.New.61000 – formulärnamn (krävs för att servern ska
//                                      spara klassificering och övriga fält korrekt)
var NY_ÄRENDE_URL = window.NY_ÄRENDE_URL ||
  '/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf' +
  '&dialogmode=true&IsDlg=1' +
  '&context-data=subtype%2cPrimary%2c61000%3bIsDlg%2cPrimary%2c1%3bname%2cPrimary%2cDMS.Case.New.61000%3b';
window.NY_ÄRENDE_URL = NY_ÄRENDE_URL;

/**
 * Läser in alternativ för instansspecifika fält.
 *
 * Skapar en dold iframe med nytt-ärende-formuläret inuti den befintliga 360°-sidan.
 * Det undviker problemet att /locator/DMS/Case/New/61000 avvisar direkta GET-anrop.
 */
async function läsInAlternativ() {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;width:1px;height:1px;top:-200px;left:-200px;opacity:0;border:none;pointer-events:none;';
  iframe.src = NY_ÄRENDE_URL;
  document.body.appendChild(iframe);

  try {
    // Vänta på laddningshändelsen
    await new Promise((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error('Timeout – formuläret laddades inte. Kontrollera att du är inloggad i 360°.')),
        18000
      );
      iframe.addEventListener('load', () => { clearTimeout(tid); resolve(); });
    });

    // Vänta på att Selectize har initierats (de laddar alternativ via AJAX).
    // Polla tills minst ett Selectize-fält har alternativ, max 15 s.
    const doc = iframe.contentDocument;
    const iWin = iframe.contentWindow;

    const titelFält = doc?.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
    if (!titelFält) {
      throw new Error('Formuläret öppnades men innehöll inte de förväntade fälten. Kontrollera behörigheter i 360°.');
    }

    // Vänta tills Selectize på diarieenhet OCH ansvarig enhet har laddat alternativ.
    // Ansvariga personer beror på ansvarig enhet – triggas separat nedan.
    function selectizeAntal(id) {
      const el = doc.getElementById(id);
      if (!el) return 0;
      if (el.selectize) return Object.keys(el.selectize.options || {}).length;
      return el.options?.length ?? 0;
    }

    await new Promise(resolve => {
      const start = Date.now();
      const check = setInterval(() => {
        const redo =
          selectizeAntal('PlaceHolderMain_MainView_JournalUnitComboControl') > 0 &&
          selectizeAntal('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl') > 0;
        if (redo || Date.now() - start > 10000) { clearInterval(check); resolve(); }
      }, 300);
    });

    await sleep(200);

    /**
     * Läser alternativ från ett Selectize-fält (primärt) eller native select (fallback).
     * Selectize lagrar alla AJAX-laddade alternativ i el.selectize.options som ett objekt
     * där nycklarna är värdena och värdena är { value, text/label }.
     */
    function läsOptions(id) {
      const el = doc.getElementById(id);
      if (!el) return [];

      // Filtrera tomma och ogiltiga platshållarvärden (-2 = "tom" i 360°-dropdowns)
      const ogiltiga = new Set(['', '-2', null, undefined]);

      // Primär strategi: läs från Selectize-cachade alternativ
      if (el.selectize && el.selectize.options) {
        return Object.values(el.selectize.options)
          .filter(o => !ogiltiga.has(o.value) && !ogiltiga.has(String(o.value)))
          .map(o => ({ value: String(o.value), label: (o.text || o.label || String(o.value)).trim() }));
      }

      // Fallback: läs från native select
      return Array.from(el.options)
        .filter(o => !ogiltiga.has(o.value))
        .map(o => ({ value: o.value, label: o.text.trim() }));
    }

    // Klassificeringar kräver wildcard-sökning via __doPostBack + Selectize-dropdown.
    // Projekt och Fastighet kräver wildcard-sökning via QuickSearch-mekanismen.
    // Kör alla sekventiellt (delar UpdatePanel – parallella postbacks krockar).
    const klassificeringar = await försökLäsKlassificeringar(doc, iWin);
    const projekt = await försökLäsTypeahead(doc, iWin,
      'PlaceHolderMain_MainView_ProjectQuickSearchControl');
    const fastigheter = await försökLäsTypeahead(doc, iWin,
      'PlaceHolderMain_MainView_EstateGeneralTabSearchControl');

    return {
      diarieenheter:     läsOptions('PlaceHolderMain_MainView_JournalUnitComboControl'),
      delarkiv:          läsOptions('PlaceHolderMain_MainView_CaseSubArchiveComboControl'),
      atkomstgrupper:    läsOptions('PlaceHolderMain_MainView_AccessGroupComboControl'),
      ansvarigaEnheter:  läsOptions('PlaceHolderMain_MainView_ResponsibleOrgUnitComboControl'),
      ansvarigaPersoner: läsOptions('PlaceHolderMain_MainView_ResponsibleUserComboControl'),
      klassificeringar,
      projekt,
      fastigheter,
    };
  } finally {
    iframe.remove();
  }
}

/**
 * Läser klassificeringsalternativ via __doPostBack + Selectize-dropdown.
 * Klassificering har en annan mekanism än Projekt/Fastighet – resultaten
 * hamnar i Selectize:s dropdown-content, inte i _dropDownList.
 */
async function försökLäsKlassificeringar(doc, win) {
  const visFält = doc.getElementById(
    'PlaceHolderMain_MainView_ClassificationCode1ComboControl_DISPLAY'
  );
  if (visFält) {
    visFält.value = '%';
    for (const t of ['focus', 'input', 'keydown', 'keyup']) {
      try { visFält.dispatchEvent(new Event(t, { bubbles: true })); } catch { /* */ }
    }
  }
  try {
    win.__doPostBack(
      'ctl00$PlaceHolderMain$MainView$ClassificationCode1ComboControl_OnClick_PostBack', ''
    );
  } catch { /* PostBack ej tillgänglig */ }

  await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const antal = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]').length;
      if (antal > 0 || Date.now() - start > 12000) { clearInterval(check); resolve(); }
    }, 300);
  });

  const items = doc.querySelectorAll('.selectize-dropdown-content .option[data-value]');
  return Array.from(items)
    .filter(el => el.dataset.value && el.dataset.value !== '0')
    .map(el => ({ display: (el.title || el.textContent).trim(), value: el.dataset.value }));
}

/**
 * Generisk funktion för att läsa typeahead-alternativ från ett QuickSearch-fält.
 * Fungerar för Klassificering, Projekt och Fastighet – alla har samma mönster:
 *   {prefix}_DISPLAY (synligt textfält)
 *   {prefix}         (hidden value-fält)
 *   {prefix}_dropDownList (native select som fylls via AJAX)
 *   {prefix}_OnClick_PostBack (dold postback-länk som triggar sökning)
 *
 * @param {Document} doc  iframe-dokumentet
 * @param {Window} win    iframe-fönstret
 * @param {string} prefix element-ID-prefix (utan suffix)
 * @returns {Array<{display: string, value: string}>}
 */
async function försökLäsTypeahead(doc, win, prefix) {
  const visFält = doc.getElementById(prefix + '_DISPLAY');
  if (!visFält) return [];

  // Sätt söktext och trigga events (samma mönster som klassificering)
  visFält.value = '%';
  for (const t of ['focus', 'input', 'keydown', 'keyup']) {
    try { visFält.dispatchEvent(new Event(t, { bubbles: true })); } catch { /* */ }
  }

  // Trigga OnClick_PostBack (startar AJAX-sökningen, samma mekanism som klassificering)
  const postBackId = 'ctl00$PlaceHolderMain$MainView$' +
    prefix.replace('PlaceHolderMain_MainView_', '') + '_OnClick_PostBack';
  try { win.__doPostBack(postBackId, ''); } catch { /* */ }

  // Resultaten hamnar i Selectize-dropdown inuti TD#{prefix}_xyPoint.
  // Polla tills .option[data-value] dyker upp (samma approach som klassificering).
  const xyPointId = prefix + '_xyPoint';
  await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const container = doc.getElementById(xyPointId);
      const antal = container
        ? container.querySelectorAll('.selectize-dropdown-content .option[data-value]').length
        : 0;
      if (antal > 0 || Date.now() - start > 12000) { clearInterval(check); resolve(); }
    }, 300);
  });

  const container = doc.getElementById(xyPointId);
  const items = container
    ? container.querySelectorAll('.selectize-dropdown-content .option[data-value]')
    : [];

  const resultat = Array.from(items)
    .filter(el => el.dataset.value && el.dataset.value !== '0')
    .map(el => ({ display: (el.title || el.textContent).trim(), value: el.dataset.value }));

  // Rensa söktexten
  const nyVisFält = doc.getElementById(prefix + '_DISPLAY');
  if (nyVisFält) nyVisFält.value = '';

  return resultat;
}
