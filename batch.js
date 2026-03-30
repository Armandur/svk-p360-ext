// batch.js – Init, händelsehanterare och sammankoppling för massregistrering
// Beror på mall-data.js, batch-data.js, batch-table.js, batch-run.js

(async function init() {
  // Kontrollera att en 360°-flik finns
  async function kontrolleraP360Flik() {
    const flik = await hittaP360Flik();
    const varning = document.getElementById('flik-varning');
    const ok = document.getElementById('flik-ok');
    if (flik) {
      varning.style.display = 'none';
      ok.style.display = '';
      // Visa flikens titel eller URL
      const detalj = document.getElementById('flik-ok-detalj');
      const beskrivning = flik.title || flik.url || '';
      detalj.textContent = beskrivning.length > 80
        ? beskrivning.substring(0, 80) + '…' : beskrivning;
    } else {
      varning.style.display = '';
      ok.style.display = 'none';
    }
    return flik;
  }
  await kontrolleraP360Flik();
  document.getElementById('btn-kontrollera-flik').addEventListener('click', kontrolleraP360Flik);

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

  function uppdateraAlternativStatus() {
    const info = document.getElementById('mall-info');
    const d = batchCachedAlternativ.diarieenheter.length;
    const p = batchCachedAlternativ.ansvarigaPersoner.length;
    if (d > 0 || p > 0) {
      const delar = [];
      if (d > 0) delar.push(`${d} diarieenheter`);
      if (p > 0) delar.push(`${p} ansvariga personer`);
      info.textContent = `Inläst: ${delar.join(', ')}.`;
      info.style.color = '#27ae60';
    } else {
      info.innerHTML = 'Klicka <strong>Läs in alternativ</strong> för att hämta diarieenheter och ansvariga personer från 360°.';
      info.style.color = '#e67e22';
    }
  }
  uppdateraAlternativStatus();

  // Läs in alternativ från 360°-fliken
  document.getElementById('btn-läs-in-alternativ').addEventListener('click', async () => {
    const btn = document.getElementById('btn-läs-in-alternativ');
    const info = document.getElementById('mall-info');
    const flik = await hittaP360Flik();
    if (!flik) {
      info.textContent = 'Ingen öppen 360°-flik hittades. Öppna 360° i en annan flik först.';
      info.style.color = '#c0392b';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Läser in…';
    info.textContent = 'Hämtar alternativ från 360° (kan ta 15–30 s)…';
    info.style.color = '#0078d4';

    try {
      const svar = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout')), 45000);
        chrome.tabs.sendMessage(flik.id, { action: 'läsInAlternativ' }, (resp) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });

      if (!svar?.success) throw new Error(svar?.fel || 'Okänt fel');

      const alt = svar.data;
      // Spara till cache
      const cacheUppdatering = {};
      if (alt.diarieenheter?.length > 0) cacheUppdatering.cachedDiarieenheter = alt.diarieenheter;
      if (alt.ansvarigaPersoner?.length > 0) cacheUppdatering.cachedAnsvarigaPersoner = alt.ansvarigaPersoner;
      if (alt.atkomstgrupper?.length > 0) cacheUppdatering.cachedAtkomstgrupper = alt.atkomstgrupper;
      if (alt.ansvarigaEnheter?.length > 0) cacheUppdatering.cachedAnsvarigaEnheter = alt.ansvarigaEnheter;
      if (Object.keys(cacheUppdatering).length > 0) {
        await chrome.storage.local.set(cacheUppdatering);
      }

      // Uppdatera lokala alternativ
      batchCachedAlternativ.diarieenheter = (alt.diarieenheter || [])
        .map(d => ({ value: d.value, label: d.label || d.text || d.value }));
      batchCachedAlternativ.ansvarigaPersoner = (alt.ansvarigaPersoner || [])
        .map(p => ({ value: p.value, label: p.label || p.text || p.value }));

      uppdateraAlternativStatus();
      // Rendera om tabellen så dropdowns uppdateras
      renderaTabell();
    } catch (err) {
      info.textContent = `Kunde inte läsa in alternativ: ${err.message}`;
      info.style.color = '#c0392b';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Läs in alternativ';
    }
  });

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
    const valdInfo = document.getElementById('mall-vald-info');
    if (valdMall) {
      valdInfo.textContent = `Mall: ${valdMall.namn || valdMall.titel}`;
      valdInfo.style.color = '#333';
      // Initiera slots från mallens ärendedokument
      slotsar = (valdMall.ärendedokument || []).map((dok, idx) => ({
        dokumentmall: dok,
        namn: dok.namn || dok.titel || `Dokument ${idx + 1}`,
      }));
      renderaSlotsar();
      uppdateraFilKolumner(slotsar.length);
    } else {
      valdInfo.textContent = 'Välj en ärendemall som grund för alla ärenden.';
      valdInfo.style.color = '#888';
      slotsar = [];
      renderaSlotsar();
      uppdateraFilKolumner(1);
    }
  });

  /**
   * Kontrollerar om dokumentslotarnas handlingstyp stämmer med ärendemallens
   * klassificering och visar varning vid avvikelse.
   */
  function kontrolleraSlotKompatibilitet() {
    const varningDiv = document.getElementById('slot-klass-varning');
    if (!varningDiv) return;

    if (!valdMall?.klassificering?.display) {
      varningDiv.style.display = 'none';
      return;
    }

    const ärendeMatch = valdMall.klassificering.display.match(/^([\d.]+)/);
    const ärendeKlass = ärendeMatch ? ärendeMatch[1] : null;
    if (!ärendeKlass) {
      varningDiv.style.display = 'none';
      return;
    }

    const konflikter = [];
    for (let i = 0; i < slotsar.length; i++) {
      const slot = slotsar[i];
      const htText = slot.dokumentmall?.handlingstyp?.text;
      if (!htText) continue;
      const htMatch = htText.match(/^([\d.]+)/);
      const mallKlass = htMatch ? htMatch[1] : null;
      if (mallKlass && mallKlass !== ärendeKlass) {
        const namn = slot.dokumentmall?.namn || slot.dokumentmall?.titel || `Dokument ${i + 1}`;
        konflikter.push(`Fil_${i + 1} "${escHtml(namn)}": handlingstyp klass ${mallKlass} ≠ ärendets klass ${ärendeKlass}`);
      }
    }

    if (konflikter.length > 0) {
      varningDiv.innerHTML =
        `<strong>⚠ Handlingstypklass stämmer inte överens.</strong> ` +
        `Handlingstypen i dessa dokumentslotsar tillhör en annan klassificering än ärendemallen ` +
        `(klass ${ärendeKlass}) – formuläret kräver troligen manuell inmatning:<br>` +
        `<ul style="margin:4px 0 0 16px;padding:0;">` +
        konflikter.map(k => `<li>${k}</li>`).join('') +
        `</ul>`;
      varningDiv.style.display = 'block';
    } else {
      varningDiv.style.display = 'none';
    }
  }

  // Synka slotsar till batch-table.js så att OCR-knappen kan läsa kategori per slot
  function synkaBatchSlotsar() { uppdateraBatchSlotsar(slotsar); }

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

    kontrolleraSlotKompatibilitet();
    synkaBatchSlotsar();
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
      const csvText = reader.result;

      // Extrahera och tillämpa metadata (ärendemall, dokumentslotsar)
      const meta = extraheraCSVMetadata(csvText);
      const varningar = tillämpaCsvMetadata(meta);
      if (varningar.length > 0) {
        alert('CSV-import:\n\n' + varningar.join('\n'));
      }

      const { headers, rader } = parsCSV(csvText);
      // Detektera filkolumner i CSV
      const csvFilKol = detekteraFilKolumner(headers);
      const csvDokKontaktKol = detekteraDokKontaktKolumner(headers);
      const csvDokTitelKol = detekteraDokTitelKolumner(headers);
      const csvDokDatumKol = detekteraDokDatumKolumner(headers);
      const maxSlots = Math.max(
        csvFilKol.length, csvDokKontaktKol.length,
        csvDokTitelKol.length, csvDokDatumKol.length,
      );
      if (maxSlots > 0) {
        // Uppdatera antal slots om CSV har fler fil-/titelkolumner
        while (slotsar.length < maxSlots) {
          slotsar.push({ dokumentmall: null, namn: `Dokument ${slotsar.length + 1}` });
        }
        renderaSlotsar();
        uppdateraFilKolumner(Math.max(slotsar.length, maxSlots));
      }
      importeraRader(rader);
    };
    reader.readAsText(fil);
    csvInput.value = ''; // Tillåt att samma fil väljs igen
  });

  /**
   * Försöker matcha och välja ärendemall och dokumentslotsar från CSV-metadata.
   * Returnerar array av varningar om mallar saknas.
   */
  function tillämpaCsvMetadata(meta) {
    const varningar = [];

    // Ärendemall
    if (meta.mallId) {
      const match = mallar.find(m => m.id === meta.mallId);
      if (match) {
        mallSelect.value = match.id;
        mallSelect.dispatchEvent(new Event('change'));
      } else {
        varningar.push(
          `Ärendemallen "${meta.mallNamn || meta.mallId}" hittades inte bland dina sparade mallar.` +
          `\nVälj ärendemall manuellt.`
        );
      }
    }

    // Dokumentslotsar
    if (meta.slotsar.length > 0) {
      // Säkerställ att det finns tillräckligt med slotsar
      while (slotsar.length < meta.slotsar.length) {
        slotsar.push({ dokumentmall: null, namn: `Dokument ${slotsar.length + 1}` });
      }

      for (let i = 0; i < meta.slotsar.length; i++) {
        const csvSlot = meta.slotsar[i];
        if (!csvSlot.id) continue;
        const dm = dokumentmallar.find(d => d.id === csvSlot.id);
        if (dm) {
          slotsar[i].dokumentmall = JSON.parse(JSON.stringify(dm));
          slotsar[i].namn = dm.namn || dm.titel || `Dokument ${i + 1}`;
        } else {
          varningar.push(
            `Dokumentmallen "${csvSlot.namn || csvSlot.id}" (${csvSlot.filKolumn}) hittades inte.` +
            `\nVälj dokumentmall för ${csvSlot.filKolumn} manuellt.`
          );
        }
      }

      renderaSlotsar();
      uppdateraFilKolumner(slotsar.length);
    }

    return varningar;
  }

  // Koppla filer – matchar valda filer till rader baserat på filnamn
  const kopplaInput = document.getElementById('koppla-filer-input');
  document.getElementById('btn-koppla-filer').addEventListener('click', () => {
    kopplaInput.click();
  });
  kopplaInput.addEventListener('change', () => {
    const filer = Array.from(kopplaInput.files);
    if (filer.length === 0) return;
    const { matchade, omatchade } = kopplaFiler(filer);
    const info = document.getElementById('koppla-filer-info');
    info.style.display = '';
    const delar = [];
    if (matchade > 0) delar.push(`${matchade} kopplad(e)`);
    if (omatchade.length > 0) delar.push(`${omatchade.length} utan match`);
    info.textContent = delar.join(', ');
    info.style.color = omatchade.length > 0 ? '#e67e22' : '#27ae60';
    if (omatchade.length > 0) {
      info.title = 'Omatchade filer: ' + omatchade.join(', ');
    } else {
      info.title = '';
    }
    kopplaInput.value = '';
  });

  // Lägg till rad
  document.getElementById('btn-lägg-till-rad').addEventListener('click', () => {
    läggTillRad();
  });

  // Exportera CSV (raddata + metadata)
  document.getElementById('btn-exportera-csv').addEventListener('click', () => {
    const csv = exporteraBatchCSV({
      mallNamn: valdMall?.namn || valdMall?.titel || null,
      mallId: valdMall?.id || null,
      slotsar,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initiera tabellrendering och drag-and-drop
  renderaKolumnTogglar();
  renderaTabell();
  initDragZon();
  uppdateraStartKnapp();

  /**
   * Visar en modal förhandsvisning av vad som kommer att skapas.
   * Returnerar true om användaren bekräftar, false om de avbryter.
   */
  function visaFörhandsvisning(baseMall, aktivaSlots) {
    const katEtikett = { '110': '← Inkommande', '111': '→ Utgående', '60005': '📄 Upprättat' };
    const statusText = { '5': 'B - Öppet', '6': 'A - Avslutat', '8': 'M - Makulerat', '17': 'AH - Avslutat fr. handläggare' };

    const rader = hämtaBatchRader();
    const radData = rader.map((rad, i) => ({
      index: i + 1,
      mall: byggMallFrånRad(baseMall, rad, aktivaSlots, synligaKolumner),
    }));
    const totalDok = radData.reduce((s, r) => s + r.mall.ärendedokument.length, 0);

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;' +
        'overflow-y:auto;padding:32px 16px;box-sizing:border-box;';

      const modal = document.createElement('div');
      modal.style.cssText =
        'background:#fff;border-radius:8px;max-width:960px;margin:0 auto;' +
        'box-shadow:0 8px 32px rgba(0,0,0,.25);display:flex;flex-direction:column;';

      // Rubrik
      const rubrik = document.createElement('div');
      rubrik.style.cssText =
        'padding:16px 20px;border-bottom:1px solid #e0e0e0;display:flex;' +
        'align-items:baseline;gap:12px;';
      rubrik.innerHTML =
        `<strong style="font-size:15px;">Förhandsvisning</strong>` +
        `<span style="font-size:12px;color:#666;">${rader.length} ärenden · ${totalDok} ärendedokument</span>`;
      modal.appendChild(rubrik);

      // Lista
      const lista = document.createElement('div');
      lista.style.cssText = 'overflow-y:auto;max-height:65vh;padding:12px 20px;display:flex;flex-direction:column;gap:8px;';

      for (const { index, mall } of radData) {
        const block = document.createElement('div');
        block.style.cssText =
          'padding:10px 12px;border:1px solid #ddd;border-radius:6px;' +
          'background:#fafafa;font-size:12px;';

        // Ärendehuvud
        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:baseline;gap:10px;margin-bottom:5px;flex-wrap:wrap;';
        const nr = document.createElement('span');
        nr.style.cssText = 'font-size:11px;color:#999;min-width:40px;';
        nr.textContent = `Rad ${index}`;
        const titel = document.createElement('span');
        titel.style.cssText = 'font-weight:600;color:#111;font-size:13px;';
        titel.textContent = mall.titel || '(ingen titel)';
        const part = document.createElement('span');
        part.style.cssText = 'color:#555;';
        part.textContent = mall.externaKontakter?.[0]?.namn || '(ingen ärendepart)';
        hdr.append(nr, titel, part);

        // Valfria ärendefält
        const extra = [];
        if (mall.status) extra.push(statusText[mall.status] || mall.status);
        if (mall.diarieenhet?.label) extra.push(`Diarieenhet: ${mall.diarieenhet.label}`);
        if (mall.ansvarigPerson?.label) extra.push(`Ansvarig: ${mall.ansvarigPerson.label}`);
        if (mall.kommentar) extra.push(`Kommentar: ${mall.kommentar}`);

        block.appendChild(hdr);

        if (extra.length > 0) {
          const extraDiv = document.createElement('div');
          extraDiv.style.cssText = 'font-size:11px;color:#777;margin-bottom:5px;';
          extraDiv.textContent = extra.join(' · ');
          block.appendChild(extraDiv);
        }

        // Ärendedokument
        if (mall.ärendedokument.length > 0) {
          const dokWrap = document.createElement('div');
          dokWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
          for (const dok of mall.ärendedokument) {
            const row = document.createElement('div');
            row.style.cssText =
              'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;' +
              'padding:4px 8px;background:#f0f6ff;border-radius:4px;font-size:11px;';

            const kat = document.createElement('span');
            kat.style.cssText = 'font-weight:600;color:#0078d4;min-width:115px;white-space:nowrap;';
            kat.textContent = katEtikett[dok.kategori] || dok.kategori || 'Dokument';

            const dt = document.createElement('span');
            dt.style.cssText = 'flex:1;color:#222;';
            dt.textContent = dok.titel || '(mallens titel)';

            row.append(kat, dt);
            if (dok.oregistreradKontakt) {
              const k = document.createElement('span');
              k.style.cssText = 'color:#555;';
              k.textContent = `👤 ${dok.oregistreradKontakt}`;
              row.appendChild(k);
            }
            if (dok.datum) {
              const d = document.createElement('span');
              d.style.cssText = 'color:#555;white-space:nowrap;';
              d.textContent = `📅 ${dok.datum}`;
              row.appendChild(d);
            }
            const fil = document.createElement('span');
            fil.style.cssText = dok._filnamn ? 'color:#555;' : 'color:#bbb;font-style:italic;';
            fil.textContent = dok._filnamn ? `📄 ${dok._filnamn}` : '(ingen fil)';
            row.appendChild(fil);

            dokWrap.appendChild(row);
          }
          block.appendChild(dokWrap);
        } else {
          const tom = document.createElement('div');
          tom.style.cssText = 'color:#bbb;font-style:italic;font-size:11px;';
          tom.textContent = '(inga ärendedokument)';
          block.appendChild(tom);
        }

        lista.appendChild(block);
      }
      modal.appendChild(lista);

      // Sidfot
      const sidfot = document.createElement('div');
      sidfot.style.cssText =
        'padding:14px 20px;border-top:1px solid #e0e0e0;display:flex;' +
        'gap:10px;justify-content:flex-end;align-items:center;';
      const info = document.createElement('span');
      info.style.cssText = 'flex:1;font-size:12px;color:#666;';
      info.textContent = 'Kontrollera uppgifterna ovan innan du startar körningen.';
      const avbrytBtn = document.createElement('button');
      avbrytBtn.textContent = 'Avbryt';
      avbrytBtn.addEventListener('click', () => { overlay.remove(); resolve(false); });
      const körBtn = document.createElement('button');
      körBtn.textContent = `Kör ${rader.length} ärenden`;
      körBtn.className = 'primär';
      körBtn.addEventListener('click', () => { overlay.remove(); resolve(true); });
      sidfot.append(info, avbrytBtn, körBtn);
      modal.appendChild(sidfot);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    });
  }

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

    // Kontrollera om det finns filnamn utan faktiska filer (bara text från CSV)
    const okopplade = räknaOkoppladeFilnamn();
    if (okopplade > 0) {
      const svar = confirm(
        `${okopplade} fil(er) i tabellen har enbart filnamn men saknar faktisk fildata.\n\n` +
        `Använd "Koppla filer" för att välja och matcha filerna, ` +
        `eller dra filer direkt till Fil-cellerna.\n\n` +
        `Vill du fortsätta ändå? Dokument skapas utan bifogade filer.`
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

    // Förhandsvisning – användaren bekräftar innan körning startar
    const bekräftad = await visaFörhandsvisning(baseMall, aktivaSlots);
    if (!bekräftad) return;

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
})();

// Lyssnar på OCR-resultat från ocr-kontakt.html (batch-rad-läge).
// Skriver tillbaka kontakt, datum och titel till rätt rad i tabellen.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'ocrBatchRad') return;
  const { radIdx, filIdx, kontakt, datum, titel, ärendepart } = request;
  sparaFrånTabell();
  const rad = batchRader[radIdx];
  if (!rad) { sendResponse({ success: false, fel: 'Rad saknas' }); return; }
  if (kontakt && dokKontaktKolumner[filIdx]) {
    rad[dokKontaktKolumner[filIdx]] = kontakt;
    // Bocka av arv-kryssrutan – kontakten är nu explicit, inte ärendeparten
    rad[`DokKontaktArv_${filIdx + 1}`] = false;
  }
  if (ärendepart) {
    rad.Namn = ärendepart;
  }
  if (datum && dokDatumKolumner[filIdx]) {
    rad[dokDatumKolumner[filIdx]] = datum;
  }
  if (titel && dokTitelKolumner[filIdx]) {
    rad[dokTitelKolumner[filIdx]] = titel;
  }
  renderaTabell();
  sendResponse({ success: true });
});
