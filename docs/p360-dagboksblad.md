# P360 – Teknisk referens: Dagboksblad och PDF-export

---

## Dagboksblad via ControlID (popup-knapp och tangentbordsgenväg)

Dagboksbladet öppnas som inline-PDF i en ny fokuserad flik. Logiken körs i
service workern (`background.js`) som har tillgång till `chrome.tabs` och
`chrome.scripting`.

### Flöde i `öppnaDagboksblad(recno)` (`background.js`)

1. **Hämta rapport-HTML** – `fetch('...Innehallsforteckning?standalone=true&recno={recno}', { credentials: 'include' })`
2. **Extrahera ControlID** – `html.match(/ControlID=([a-f0-9]{32})/)`
3. **Öppna PDF-flik** – `chrome.tabs.create({ url: pdfUrl, active: true })` med `ContentDisposition=AlwaysInline`
4. **Vänta på laddning** – polla `chrome.tabs.get(tab.id)` tills `status === 'complete'` (max 15 s)
5. **Trigga utskrift** – `chrome.scripting.executeScript({ target: { tabId }, func: () => window.print() })`

**Anropsvägar:**
- Popup-knapp: `popup.js` → `content.js` (extraherar recno ur URL) → `chrome.runtime.sendMessage` → `background.js`
- Tangentbordsgenväg (Alt+Shift+D): `background.js` extraherar recno direkt ur `tab.url` via `chrome.tabs.query`

---

## PDF-export via ControlID (batch-dagboksblad)

Används i `batch.js` för att öppna eller ladda ned dagboksblad för alla skapade ärenden.

### Rapport-URL (enbart recno behöver ändras)

```
https://p360.svenskakyrkan.se/locator/Reports/Case/Innehallsforteckning/Innehallsforteckning?standalone=true&recno={recno}
```

### ControlID

ControlID är en sessions-GUID som är inbäddad i rapportsidans HTML:
```js
const html = await fetch(rapportUrl, { credentials: 'include' }).then(r => r.text());
const match = html.match(/ControlID=([a-f0-9]{32})/);
const controlId = match[1];
```

### PDF-export-URL

```
https://p360.svenskakyrkan.se/Reserved.ReportViewerWebControl.axd
  ?Culture=1053&CultureOverrides=True
  &UICulture=1053&UICultureOverrides=True
  &ReportStack=1
  &ControlID={controlId}
  &Mode=true
  &OpType=Export
  &FileName=Innehallsforteckning_1053
  &ContentDisposition={disposition}
  &Format=PDF
```

**ContentDisposition-värden:**

| Värde | Effekt |
|-------|--------|
| `AlwaysInline` | Öppnar PDF i Chromes PDF-visare (för utskrift) |
| `AlwaysAttachment` | Triggar nedladdning |
| `OnlyHtmlInline` | MSRS default (öppnar rapport-viewer, inte ren PDF) |

### Öppna som PDF-flikar (batch – parallell hämtning)

Körs från extension-sidan (`batch.html`) med `fetch(..., { credentials: 'include' })`.
`host_permissions` täcker `p360.svenskakyrkan.se` så autentisering via cookies fungerar.

```js
const pdfUrls = await Promise.all(lyckade.map(async (r) => {
  const html = await fetch(
    `https://p360.svenskakyrkan.se/locator/Reports/Case/Innehallsforteckning/...?recno=${r.recno}`,
    { credentials: 'include' }
  ).then(res => res.text());
  const match = html.match(/ControlID=([a-f0-9]{32})/);
  if (!match) return null;
  return `https://p360.svenskakyrkan.se/Reserved.ReportViewerWebControl.axd?...&ControlID=${match[1]}&ContentDisposition=AlwaysInline&Format=PDF`;
}));
for (const url of pdfUrls) {
  if (url) chrome.tabs.create({ url, active: false });
}
```

### Ladda ned som PDF-filer (batch – sekventiell)

```js
for (const r of lyckade) {
  const html = await fetch(rapportUrl, { credentials: 'include' }).then(r => r.text());
  const controlId = html.match(/ControlID=([a-f0-9]{32})/)[1];
  const blob = await fetch(pdfExportUrl, { credentials: 'include' }).then(r => r.blob());
  const filnamn = `dagboksblad_${r.diarienummer || r.recno}.pdf`.replace(/[/\\:*?"<>|]/g, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filnamn;
  a.click();
  URL.revokeObjectURL(a.href);
  await new Promise(resolve => setTimeout(resolve, 800)); // paus mellan nedladdningar
}
```
