// background.js – service worker (MV3)
// Lyssnar på tangentbordskommandon och vidarebefordrar dem till content.js.

chrome.commands.onCommand.addListener(async (command) => {
  const kommandonTillAction = {
    'dagboksblad-skriv-ut': 'dagboksblad',
    'växla-status':         'växlaStatus',
    'redigera-egenskaper':  'redigeraEgenskaper',
    'spara-som-nytt':       'sparaSomNytt',
    'makulera':             'makulera',
  };

  const action = kommandonTillAction[command];
  if (!action) return;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }

  if (!tab?.url?.startsWith('https://p360.svenskakyrkan.se/')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch {
    // Fliken har inget content script – användaren är inte på en ärendesida
  }
});
