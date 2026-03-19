// page.js – körs i sidans eget JS-scope (MAIN world)
// Har direkt tillgång till sidans globala funktioner som __doPostBack och Selectize.
// Kommunicerar med content.js (ISOLATED world) via CustomEvents.

/**
 * Triggar en åtgärd via huvudmenyn i 360°.
 */
function anropaPostBack(nyckel) {
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$MainContextMenu_DropDownMenu',
    nyckel
  );
}

/**
 * Öppnar "Sätt status"-dialogen och sätter valt statusvärde.
 */
async function sättStatus(statusVärde) {
  __doPostBack(
    'ctl00$PlaceHolderMain$MainView$CaseDetailActions_EditCaseStatusDialogOperation_POSTBACK',
    ''
  );

  // Vänta på att iframen med EditCaseStatus laddas färdigt (max 10 s)
  const iframe = await new Promise((resolve, reject) => {
    const startTid = Date.now();
    const kontroll = setInterval(() => {
      const funnen = Array.from(document.querySelectorAll('iframe'))
        .find(f => f.src && f.src.includes('EditCaseStatus'));
      if (funnen && funnen.contentDocument?.readyState === 'complete') {
        clearInterval(kontroll);
        resolve(funnen);
      } else if (Date.now() - startTid > 10000) {
        clearInterval(kontroll);
        reject(new Error('Dialogen laddades inte i tid.'));
      }
    }, 200);
  });

  const doc = iframe.contentDocument;
  const select = doc.getElementById('PlaceHolderMain_MainView_CaseStatusComboControl');
  if (!select) throw new Error('Hittade inte statusfältet i dialogen.');

  // Sätt värdet – både via Selectize API och direkt på native select
  // för att säkerställa att rätt värde skickas vid formulärinlämning
  if (select.selectize) {
    select.selectize.setValue(statusVärde);
  }
  select.value = statusVärde;
  select.dispatchEvent(new Event('change', { bubbles: true }));

  // Kort paus så att Selectize hinner synkronisera internt innan OK klickas
  await new Promise(r => setTimeout(r, 150));

  doc.getElementById('PlaceHolderMain_MainView_Finish-Button')?.click();
}

// Tar emot anrop från content.js och skickar tillbaka svar
window.addEventListener('p360-anrop', async (event) => {
  const { id, action, data } = event.detail;

  const postbackNycklar = {
    dagboksblad:          'key_innehallsforteckning',
    redigeraEgenskaper:   'EditCase',
    registreraUtlaning:   'RegisterLoan',
    gallring:             'SetScrapCode',
    sparaSomNytt:         'SaveCaseAsNew',
    kopieraHyperlank:     'CopyHyperLink',
    arendesammanfattning: 'OrderCaseSummary',
    processplan:          'AddProgressPlan',
  };

  try {
    if (action === 'sättStatus') {
      await sättStatus(data.statusVärde);
    } else if (postbackNycklar[action]) {
      anropaPostBack(postbackNycklar[action]);
    } else {
      throw new Error('Okänd åtgärd: ' + action);
    }
    window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: true } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: false, fel: err.message } }));
  }
});
