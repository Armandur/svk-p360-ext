// background.js – service worker (MV3)
// Lyssnar på tangentbordskommandon och vidarebefordrar dem till content.js.

/**
 * Hämtar dagboksbladet via ControlID-fetch och öppnar det som inline-PDF
 * i en ny fokuserad flik. Triggar webbläsarens utskriftsdialog automatiskt
 * när fliken laddats klart.
 */
async function öppnaDagboksblad(recno) {
  const rapportUrl =
    `https://p360.svenskakyrkan.se/locator/Reports/Case/Innehallsforteckning/` +
    `Innehallsforteckning?standalone=true&recno=${recno}`;
  const htmlSvar = await fetch(rapportUrl, { credentials: 'include' });
  if (!htmlSvar.ok) throw new Error(`HTTP ${htmlSvar.status}`);
  const html = await htmlSvar.text();
  const match = html.match(/ControlID=([a-f0-9]{32})/);
  if (!match) throw new Error('ControlID hittades inte i dagboksbladet.');
  const pdfUrl =
    `https://p360.svenskakyrkan.se/Reserved.ReportViewerWebControl.axd` +
    `?Culture=1053&CultureOverrides=True&UICulture=1053&UICultureOverrides=True` +
    `&ReportStack=1&ControlID=${match[1]}&Mode=true&OpType=Export` +
    `&FileName=Innehallsforteckning_1053&ContentDisposition=AlwaysInline&Format=PDF`;
  const tab = await chrome.tabs.create({ url: pdfUrl, active: true });

  // Vänta på att fliken laddats klart, sedan trigga webbläsarens utskriftsdialog
  await new Promise(resolve => {
    const start = Date.now();
    const poll = setInterval(async () => {
      if (Date.now() - start > 15000) {
        clearInterval(poll);
        resolve();
        return;
      }
      try {
        const t = await chrome.tabs.get(tab.id);
        if (t.status === 'complete') {
          clearInterval(poll);
          resolve();
        }
      } catch {
        clearInterval(poll);
        resolve();
      }
    }, 500);
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.print()
  });
}

function läsRecnoFrånUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.searchParams.get('recno') || '';
  } catch {
    return '';
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  const kommandonTillAction = {
    'växla-status':         'växlaStatus',
    'redigera-egenskaper':  'redigeraEgenskaper',
    'spara-som-nytt':       'sparaSomNytt',
    'makulera':             'makulera',
  };

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }

  if (!tab?.url?.startsWith('https://p360.svenskakyrkan.se/')) return;

  // Dagboksblad hanteras direkt i service worker utan omväg via content.js
  if (command === 'dagboksblad-skriv-ut') {
    const recno = läsRecnoFrånUrl(tab.url);
    if (recno) {
      öppnaDagboksblad(recno).catch(err =>
        console.error('[p360] Dagboksblad misslyckades:', err.message)
      );
    }
    return;
  }

  const action = kommandonTillAction[command];
  if (!action) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch {
    // Fliken har inget content script – användaren är inte på en ärendesida
  }
});

// Tar emot dagboksblad-förfrågan från content.js (popup-knapp)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'dagboksblad' && request.recno) {
    öppnaDagboksblad(request.recno)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, fel: err.message }));
    return true; // håll kanalen öppen för async svar
  }
});
