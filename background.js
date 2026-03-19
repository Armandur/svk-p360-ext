// background.js – service worker (MV3)
// Lyssnar på tangentbordskommandon och vidarebefordrar dem till content.js.

// Öppnar PDF-URL som en ny Chrome-flik (inbyggd PDF-visare, inte Acrobat)
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'öppnaPdf' && request.url) {
    chrome.tabs.create({ url: request.url });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'dagboksblad-skriv-ut') return;

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }

  if (!tab?.url?.startsWith('https://p360.svenskakyrkan.se/')) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'dagboksblad' });
  } catch {
    // Fliken har inget content script – användaren är inte på en ärendesida
  }
});
