// batch.js – Init, händelsehanterare och sammankoppling för massregistrering
// Beror på mall-data.js, batch-data.js, batch-table.js, batch-run.js

(async function init() {
  // Ladda ärendemallar, dokumentmallar och cachade dropdown-alternativ
  const { mallar = [] } = await chrome.storage.local.get('mallar');
  const { dokumentmallar = [] } = await chrome.storage.local.get('dokumentmallar');

  // Ladda cachade instansspecifika alternativ
  const cached = await chrome.storage.local.get([
    'cachedDiarieenheter', 'cachedAnsvarigaPersoner',
  ]);
  batchCachedAlternativ.diarieenheter = (cached.cachedDiarieenheter || [])
    .map(d => ({ value: d.value, label: d.label || d.text || d.value }));
  batchCachedAlternativ.ansvarigaPersoner = (cached.cachedAnsvarigaPersoner || [])
    .map(p => ({ value: p.value, label: p.label || p.text || p.value }));

  const harCachadeAlternativ = batchCachedAlternativ.diarieenheter.length > 0 ||
                                batchCachedAlternativ.ansvarigaPersoner.length > 0;
  if (!harCachadeAlternativ) {
    const info = document.getElementById('mall-info');
    info.innerHTML = 'Välj en ärendemall som grund. <em style="color:#e67e22;">Tips: Klicka "Läs in alternativ" i mallredigeraren för att cachea diarieenheter och ansvariga personer.</em>';
  }

  const mallSelect = document.getElementById('batch-ärendemall');
  for (const mall of mallar) {
    const opt = document.createElement('option');
    opt.value = mall.id;
    opt.textContent = mall.namn || mall.titel || mall.id;
    mallSelect.appendChild(opt);
  }

  // Aktuell ärendemall och slots
  let valdMall = null;
  let slotsar = [];

  // Ärendemall-val ändras
  mallSelect.addEventListener('change', () => {
    valdMall = mallar.find(m => m.id === mallSelect.value) || null;
    const info = document.getElementById('mall-info');
    if (valdMall) {
      info.textContent = `Mall: ${valdMall.namn || valdMall.titel}`;
      info.style.color = '#333';
      // Initiera slots från mallens ärendedokument
      slotsar = (valdMall.ärendedokument || []).map((dok, idx) => ({
        dokumentmall: dok,
        namn: dok.namn || dok.titel || `Dokument ${idx + 1}`,
      }));
      renderaSlotsar();
      uppdateraFilKolumner(slotsar.length);
    } else {
      info.textContent = 'Välj en ärendemall som grund för alla ärenden.';
      info.style.color = '#888';
      slotsar = [];
      renderaSlotsar();
      uppdateraFilKolumner(1);
    }
  });

  // Rendera dokumentslotsar
  function renderaSlotsar() {
    const lista = document.getElementById('slot-lista');
    lista.innerHTML = '';

    slotsar.forEach((slot, idx) => {
      const div = document.createElement('div');
      div.className = 'slot-rad';

      const etikett = document.createElement('span');
      etikett.className = 'slot-etikett';
      etikett.textContent = `Fil_${idx + 1}`;

      const select = document.createElement('select');
      select.innerHTML = '<option value="">– välj dokumentmall –</option>';
      for (const dm of dokumentmallar) {
        const opt = document.createElement('option');
        opt.value = dm.id;
        opt.textContent = dm.namn || dm.titel || dm.id;
        select.appendChild(opt);
      }
      // Om slotten redan har en dokumentmall (från ärendemallen), markera den
      if (slot.dokumentmall?.dokumentmallId) {
        select.value = slot.dokumentmall.dokumentmallId;
      }
      select.addEventListener('change', () => {
        const dm = dokumentmallar.find(d => d.id === select.value);
        if (dm) {
          slotsar[idx].dokumentmall = JSON.parse(JSON.stringify(dm));
          slotsar[idx].namn = dm.namn || dm.titel || `Dokument ${idx + 1}`;
        } else {
          slotsar[idx].dokumentmall = null;
          slotsar[idx].namn = `Dokument ${idx + 1}`;
        }
        renderaSlotsar();
      });

      const roll = document.createElement('span');
      roll.className = 'slot-roll';
      renderaSlotRoll(roll, slot);

      const taBortBtn = document.createElement('button');
      taBortBtn.textContent = '✕';
      taBortBtn.title = 'Ta bort slot';
      taBortBtn.addEventListener('click', () => {
        slotsar.splice(idx, 1);
        renderaSlotsar();
        uppdateraFilKolumner(slotsar.length);
      });

      div.appendChild(etikett);
      div.appendChild(select);
      div.appendChild(roll);
      div.appendChild(taBortBtn);
      lista.appendChild(div);
    });
  }

  function renderaSlotRoll(el, slot) {
    if (!slot.dokumentmall) {
      el.textContent = '';
      return;
    }
    const kat = slot.dokumentmall.kategori;
    if (kat === '110') el.textContent = '← Inkommande (avsändare)';
    else if (kat === '111') el.textContent = '→ Utgående (mottagare)';
    else if (kat === '60005') el.textContent = '📄 Upprättat';
    else el.textContent = kat || '';
  }

  // Lägg till slot
  document.getElementById('btn-lägg-till-slot').addEventListener('click', () => {
    slotsar.push({ dokumentmall: null, namn: `Dokument ${slotsar.length + 1}` });
    renderaSlotsar();
    uppdateraFilKolumner(slotsar.length);
  });

  // CSV-import
  const csvInput = document.getElementById('csv-input');
  document.getElementById('btn-importera-csv').addEventListener('click', () => {
    csvInput.click();
  });
  csvInput.addEventListener('change', () => {
    const fil = csvInput.files[0];
    if (!fil) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rader } = parsCSV(reader.result);
      // Detektera filkolumner i CSV
      const csvFilKol = detekteraFilKolumner(headers);
      if (csvFilKol.length > 0) {
        // Uppdatera antal slots om CSV har fler filkolumner
        while (slotsar.length < csvFilKol.length) {
          slotsar.push({ dokumentmall: null, namn: `Dokument ${slotsar.length + 1}` });
        }
        renderaSlotsar();
        uppdateraFilKolumner(Math.max(slotsar.length, csvFilKol.length));
      }
      importeraRader(rader);
    };
    reader.readAsText(fil);
    csvInput.value = ''; // Tillåt att samma fil väljs igen
  });

  // Lägg till rad
  document.getElementById('btn-lägg-till-rad').addEventListener('click', () => {
    läggTillRad();
  });

  // Initiera tabellrendering och drag-and-drop
  renderaKolumnTogglar();
  renderaTabell();
  initDragZon();
  uppdateraStartKnapp();

  // Starta batch
  document.getElementById('btn-starta-batch').addEventListener('click', async () => {
    if (!valdMall) {
      alert('Välj en ärendemall först.');
      return;
    }

    // Kontrollera att alla slots med filer har dokumentmallar
    const filSlotarUtanMall = slotsar
      .map((s, i) => ({ slot: s, idx: i }))
      .filter(s => !s.slot.dokumentmall);
    if (filSlotarUtanMall.length > 0) {
      const svar = confirm(
        `${filSlotarUtanMall.length} dokumentslot(ar) saknar dokumentmall. ` +
        `Filer i dessa kolumner ignoreras. Fortsätta?`
      );
      if (!svar) return;
    }

    // Filtrera till slots som har dokumentmall
    const aktivaSlots = slotsar.filter(s => s.dokumentmall);

    // Bygg basemall med cachade dropdown-alternativ
    const baseMall = JSON.parse(JSON.stringify(valdMall));

    // Lägg till cachade alternativ för per-rad-överstyrning
    baseMall._diarieenheter = batchCachedAlternativ.diarieenheter
      .map(d => ({ value: d.value, text: d.label || '' }));
    baseMall._ansvarigaPersoner = batchCachedAlternativ.ansvarigaPersoner
      .map(p => ({ value: p.value, text: p.label || '' }));

    const inställningar = {
      stängÄrende: document.getElementById('batch-stäng-ärende').checked,
      dagboksblad: document.getElementById('batch-dagboksblad').checked,
    };

    // Visa/dölj knappar
    document.getElementById('btn-starta-batch').style.display = 'none';
    document.getElementById('btn-avbryt-batch').style.display = '';

    try {
      await startaBatch(baseMall, aktivaSlots, inställningar);
    } finally {
      document.getElementById('btn-starta-batch').style.display = '';
      document.getElementById('btn-avbryt-batch').style.display = 'none';
    }
  });

  // Avbryt batch
  document.getElementById('btn-avbryt-batch').addEventListener('click', () => {
    avbrytBatch();
  });

  // Ladda ned resultat-CSV
  document.getElementById('btn-ladda-ned-csv').addEventListener('click', () => {
    if (!batchResultat?.length) return;
    const csv = exporteraResultatCSV(batchResultat);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-resultat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Öppna dagboksblad (resultatpanel)
  document.getElementById('btn-öppna-dagboksblad').addEventListener('click', async () => {
    const flik = await hittaP360Flik();
    if (!flik) {
      alert('Ingen öppen 360°-flik hittades.');
      return;
    }
    skickaTillFlik(flik.id, { action: 'dagboksblad' });
  });
})();
