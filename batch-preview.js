// batch-preview.js – förhandsvisningsmodal för massregistrering
// Beroenden: hämtaBatchRader(), synligaKolumner (batch-table.js); byggMallFrånRad() (batch-data.js)

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
