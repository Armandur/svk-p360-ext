// background.js – service worker (MV3)
// Lyssnar på tangentbordskommandon och vidarebefordrar dem till content.js.

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
