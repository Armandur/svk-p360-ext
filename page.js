// page.js – Router för p360-anrop (MAIN world)
// Beror på globala funktioner från page-utils.js, page-dagboksblad.js,
// page-status.js och page-arende.js.
(function () {
if (window._p360PageJsLoaded) return;
window._p360PageJsLoaded = true;

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
    } else if (action === 'makulera') {
      await sättStatus('8');
    } else if (action === 'växlaStatus') {
      await växlaStatus();
    } else if (action === 'dagboksblad') {
      await triggerDagboksblad();
    } else if (action === 'läsInAlternativ') {
      const alternativ = await läsInAlternativ();
      window.dispatchEvent(new CustomEvent('p360-svar', { detail: { id, success: true, data: alternativ } }));
      return;
    } else if (action === 'skapaFrånMall') {
      await skapaFrånMall(data.mall);
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

})(); // slut: IIFE-skydd mot dubbel-injektion
