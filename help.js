// help.js – logik för hjälpsidan
document.getElementById('lank-shortcuts').addEventListener('click', e => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
