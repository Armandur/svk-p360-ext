// batch-dagboksblad.js – hämtning och nedladdning av dagboksblads-PDF:er efter batchkörning
// Beroenden: batchResultat (batch-run.js); skapaZip(), sammanfogaPdfer() (batch-export.js)

/**
 * Hämtar dagboksblads-PDF:er för alla lyckade ärenden.
 * Returnerar array av { blob, filnamn } för lyckade, null för misslyckade.
 * @param {HTMLButtonElement} btn - Knapp vars text uppdateras med förlopp
 * @returns {Promise<{ blob: Blob, filnamn: string }[]>}
 */
async function hämtaDagsboksbladsBlobs(btn) {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  const resultat = [];
  for (let i = 0; i < lyckade.length; i++) {
    const r = lyckade[i];
    if (btn) btn.textContent = `Hämtar ${i + 1}/${lyckade.length}…`;
    try {
      const rapportUrl =
        `https://p360.svenskakyrkan.se/locator/Reports/Case/Innehallsforteckning/` +
        `Innehallsforteckning?standalone=true&recno=${r.recno}`;
      const htmlSvar = await fetch(rapportUrl, { credentials: 'include' });
      if (!htmlSvar.ok) throw new Error(`HTTP ${htmlSvar.status}`);
      const html = await htmlSvar.text();
      const match = html.match(/ControlID=([a-f0-9]{32})/);
      if (!match) throw new Error('ControlID hittades inte.');
      const pdfUrl =
        `https://p360.svenskakyrkan.se/Reserved.ReportViewerWebControl.axd` +
        `?Culture=1053&CultureOverrides=True&UICulture=1053&UICultureOverrides=True` +
        `&ReportStack=1&ControlID=${match[1]}&Mode=true&OpType=Export` +
        `&FileName=Innehallsforteckning_1053&ContentDisposition=AlwaysAttachment&Format=PDF`;
      const pdfSvar = await fetch(pdfUrl, { credentials: 'include' });
      if (!pdfSvar.ok) throw new Error(`PDF HTTP ${pdfSvar.status}`);
      const blob = await pdfSvar.blob();
      const filnamn = `dagboksblad_${r.diarienummer || r.recno}.pdf`
        .replace(/[/\\:*?"<>|]/g, '-');
      resultat.push({ blob, filnamn });
    } catch (err) {
      console.error(`[batch] Dagboksblad misslyckades för recno ${r.recno}:`, err);
      resultat.push(null);
    }
    if (i < lyckade.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  return resultat;
}

/**
 * Visar/döljer fler-ärende-knappar baserat på antal lyckade med recno.
 * Exponeras globalt så att batch-run.js kan anropa den efter varje körning.
 */
window.uppdateraDagsboksbladsKnappar = function(lyckade) {
  const fleraLyckade = lyckade > 1;
  document.getElementById('btn-öppna-sammanfogad-pdf').style.display = fleraLyckade ? '' : 'none';
  document.getElementById('btn-ladda-ned-zip').style.display = fleraLyckade ? '' : 'none';
  document.getElementById('btn-ladda-ned-sammanfogad-pdf').style.display = fleraLyckade ? '' : 'none';
};

// Öppna dagboksblad som PDF-flikar för alla lyckade ärenden
document.getElementById('btn-öppna-dagboksblad').addEventListener('click', async () => {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  if (lyckade.length === 0) {
    alert('Inga lyckade ärenden med känt ärendenummer att öppna dagboksblad för.');
    return;
  }
  const btn = document.getElementById('btn-öppna-dagboksblad');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Hämtar…';

  // Hämta ControlIDs parallellt
  const pdfUrls = await Promise.all(lyckade.map(async (r) => {
    try {
      const html = await fetch(
        `https://p360.svenskakyrkan.se/locator/Reports/Case/Innehallsforteckning/Innehallsforteckning?standalone=true&recno=${r.recno}`,
        { credentials: 'include' }
      ).then(res => res.text());
      const match = html.match(/ControlID=([a-f0-9]{32})/);
      if (!match) return null;
      return `https://p360.svenskakyrkan.se/Reserved.ReportViewerWebControl.axd` +
        `?Culture=1053&CultureOverrides=True&UICulture=1053&UICultureOverrides=True` +
        `&ReportStack=1&ControlID=${match[1]}&Mode=true&OpType=Export` +
        `&FileName=Innehallsforteckning_1053&ContentDisposition=AlwaysInline&Format=PDF`;
    } catch { return null; }
  }));

  for (const url of pdfUrls) {
    if (url) chrome.tabs.create({ url, active: false });
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

// Ladda ned dagboksblad som enskilda PDF:er
document.getElementById('btn-ladda-ned-dagboksblad').addEventListener('click', async () => {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  if (lyckade.length === 0) {
    alert('Inga lyckade ärenden med känt ärendenummer att ladda ned dagboksblad för.');
    return;
  }
  const btn = document.getElementById('btn-ladda-ned-dagboksblad');
  const originalText = btn.textContent;
  btn.disabled = true;

  const blobs = await hämtaDagsboksbladsBlobs(btn);
  const lyckadeNed = blobs.filter(Boolean).length;
  const misslyckadeNed = blobs.filter(b => !b).length;

  for (const post of blobs) {
    if (!post) continue;
    const objUrl = URL.createObjectURL(post.blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = post.filnamn;
    a.click();
    URL.revokeObjectURL(objUrl);
  }

  btn.disabled = false;
  btn.textContent = originalText;
  if (misslyckadeNed > 0) {
    alert(`${lyckadeNed} dagboksblad nedladdade. ${misslyckadeNed} misslyckades – se konsolen.`);
  }
});

// Ladda ned dagboksblad som ZIP
document.getElementById('btn-ladda-ned-zip').addEventListener('click', async () => {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  if (lyckade.length === 0) return;
  const btn = document.getElementById('btn-ladda-ned-zip');
  const originalText = btn.textContent;
  btn.disabled = true;

  const blobs = await hämtaDagsboksbladsBlobs(btn);
  btn.textContent = 'Skapar ZIP…';

  const zipFiler = [];
  for (const post of blobs) {
    if (!post) continue;
    zipFiler.push({ data: new Uint8Array(await post.blob.arrayBuffer()), namn: post.filnamn });
  }

  if (zipFiler.length === 0) {
    alert('Inga dagboksblad kunde hämtas.');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  const zipBlob = skapaZip(zipFiler);
  const objUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `dagboksblad-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(objUrl);

  btn.disabled = false;
  btn.textContent = originalText;
});

// Ladda ned sammanfogad PDF
document.getElementById('btn-ladda-ned-sammanfogad-pdf').addEventListener('click', async () => {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  if (lyckade.length === 0) return;
  const btn = document.getElementById('btn-ladda-ned-sammanfogad-pdf');
  const originalText = btn.textContent;
  btn.disabled = true;

  const blobs = await hämtaDagsboksbladsBlobs(btn);
  btn.textContent = 'Sammanfogar PDF…';

  const pdfBlobs = blobs.filter(Boolean).map(p => p.blob);
  if (pdfBlobs.length === 0) {
    alert('Inga dagboksblad kunde hämtas.');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  const samladPdf = await sammanfogaPdfer(pdfBlobs,
    (i, tot) => { btn.textContent = `Sammanfogar ${i}/${tot}…`; }
  );
  const blob = new Blob([samladPdf], { type: 'application/pdf' });
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = `dagboksblad-sammanfogad-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(objUrl);

  btn.disabled = false;
  btn.textContent = originalText;
});

// Öppna sammanfogad PDF i ny flik
document.getElementById('btn-öppna-sammanfogad-pdf').addEventListener('click', async () => {
  const lyckade = batchResultat.filter(r => r.status === 'klar' && r.recno);
  if (lyckade.length === 0) return;
  const btn = document.getElementById('btn-öppna-sammanfogad-pdf');
  const originalText = btn.textContent;
  btn.disabled = true;

  const blobs = await hämtaDagsboksbladsBlobs(btn);
  btn.textContent = 'Sammanfogar PDF…';

  const pdfBlobs = blobs.filter(Boolean).map(p => p.blob);
  if (pdfBlobs.length === 0) {
    alert('Inga dagboksblad kunde hämtas.');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  const samladPdf = await sammanfogaPdfer(pdfBlobs,
    (i, tot) => { btn.textContent = `Sammanfogar ${i}/${tot}…`; }
  );
  const blob = new Blob([samladPdf], { type: 'application/pdf' });
  const objUrl = URL.createObjectURL(blob);
  chrome.tabs.create({ url: objUrl, active: true });
  // Blob URL frigörs inte – webbläsaren håller i den så länge fliken är öppen

  btn.disabled = false;
  btn.textContent = originalText;
});
