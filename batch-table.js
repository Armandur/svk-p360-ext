// batch-table.js – Redigerbar tabell med drag-and-drop för massregistrering
// Beror på batch-data.js (BATCH_KOLUMNER, detekteraFilKolumner)

// Tabelldata: array av rad-objekt. Varje rad har textfält + _filer (array av File-objekt per slot)
let batchRader = [];
let synligaKolumner = new Set(['Titel', 'Namn']);
let filKolumner = ['Fil_1']; // Standard: en filkolumn
let dokTitelKolumner = ['DokTitel_1']; // Överlagring av dokumenttitel per slot

/**
 * Returnerar aktuella rader (för exekvering).
 */
function hämtaBatchRader() {
  sparaFrånTabell();
  return batchRader;
}

/**
 * Sätter antalet filkolumner baserat på slotsar.
 */
function uppdateraFilKolumner(antalSlots) {
  filKolumner = [];
  dokTitelKolumner = [];
  for (let i = 1; i <= Math.max(antalSlots, 1); i++) {
    filKolumner.push(`Fil_${i}`);
    dokTitelKolumner.push(`DokTitel_${i}`);
  }
  renderaTabell();
}

/**
 * Lägger till en tom rad i tabellen.
 */
function läggTillRad(data) {
  const rad = { _filer: [] };
  // Initiera alla kända kolumner med tomma värden
  for (const kol of Object.keys(BATCH_KOLUMNER)) {
    rad[kol] = data?.[kol] || '';
  }
  for (const fk of filKolumner) {
    rad[fk] = data?.[fk] || '';
  }
  for (const dk of dokTitelKolumner) {
    rad[dk] = data?.[dk] || '';
  }
  if (data?._filer) rad._filer = data._filer;
  batchRader.push(rad);
  renderaTabell();
  uppdateraStartKnapp();
}

/**
 * Tar bort en rad.
 */
function taBortRad(index) {
  batchRader.splice(index, 1);
  renderaTabell();
  uppdateraStartKnapp();
}

/**
 * Importerar rader från parsad CSV-data.
 */
function importeraRader(csvRader) {
  for (const rad of csvRader) {
    const ny = { _filer: [] };
    for (const kol of Object.keys(BATCH_KOLUMNER)) {
      ny[kol] = rad[kol] || '';
    }
    for (const fk of filKolumner) {
      ny[fk] = rad[fk] || '';
    }
    for (const dk of dokTitelKolumner) {
      ny[dk] = rad[dk] || '';
    }
    batchRader.push(ny);
  }
  renderaTabell();
  uppdateraStartKnapp();
}

/**
 * Sparar aktuella inmatningsvärden från DOM till batchRader.
 */
function sparaFrånTabell() {
  const kropp = document.getElementById('tabell-kropp');
  if (!kropp) return;
  const trRader = kropp.querySelectorAll('tr');
  trRader.forEach((tr, idx) => {
    if (idx >= batchRader.length) return;
    tr.querySelectorAll('input[data-kol]').forEach(inp => {
      batchRader[idx][inp.dataset.kol] = inp.value;
    });
    tr.querySelectorAll('select[data-kol]').forEach(sel => {
      batchRader[idx][sel.dataset.kol] = sel.value;
    });
  });
}

/**
 * Aktiverar/avaktiverar synlighet för en valfri kolumn.
 */
function togglaKolumn(kolumnNamn) {
  sparaFrånTabell();
  if (synligaKolumner.has(kolumnNamn)) {
    synligaKolumner.delete(kolumnNamn);
  } else {
    synligaKolumner.add(kolumnNamn);
  }
  renderaKolumnTogglar();
  renderaTabell();
}

/**
 * Renderar kolumntogglarna.
 */
function renderaKolumnTogglar() {
  const container = document.getElementById('kolumn-togglar');
  if (!container) return;
  container.innerHTML = '';
  const valfria = Object.entries(BATCH_KOLUMNER).filter(([, v]) => !v.standard);
  for (const [namn] of valfria) {
    const btn = document.createElement('button');
    btn.textContent = (synligaKolumner.has(namn) ? '✓ ' : '+ ') + namn;
    if (synligaKolumner.has(namn)) btn.classList.add('aktiv');
    btn.addEventListener('click', () => togglaKolumn(namn));
    container.appendChild(btn);
  }
}

/**
 * Renderar hela tabellen.
 */
function renderaTabell() {
  const huvud = document.getElementById('tabell-huvud');
  const kropp = document.getElementById('tabell-kropp');
  if (!huvud || !kropp) return;

  // Bygg kolumnlista: # + synliga standardkolumner + valfria + filkolumner + åtgärd
  const kolumner = [];
  for (const [namn, def] of Object.entries(BATCH_KOLUMNER)) {
    if (def.standard || synligaKolumner.has(namn)) {
      kolumner.push(namn);
    }
  }

  // Header
  huvud.innerHTML = '<th>#</th>';
  for (const kol of kolumner) {
    const th = document.createElement('th');
    th.textContent = kol;
    huvud.appendChild(th);
  }
  for (let fi = 0; fi < filKolumner.length; fi++) {
    const thTitel = document.createElement('th');
    thTitel.textContent = dokTitelKolumner[fi];
    huvud.appendChild(thTitel);
    const thFil = document.createElement('th');
    thFil.textContent = filKolumner[fi];
    huvud.appendChild(thFil);
  }
  huvud.innerHTML += '<th>Status</th><th></th>';

  // Body
  kropp.innerHTML = '';
  batchRader.forEach((rad, idx) => {
    const tr = document.createElement('tr');

    // Radnummer
    tr.innerHTML = `<td class="rad-nr">${idx + 1}</td>`;

    // Fält (text eller select beroende på kolumndefinition)
    for (const kol of kolumner) {
      const td = document.createElement('td');
      const def = BATCH_KOLUMNER[kol];

      if (def?.typ === 'select') {
        const sel = document.createElement('select');
        sel.dataset.kol = kol;
        sel.style.cssText = 'width:100%;border:none;padding:4px;font-size:13px;background:transparent;';

        // Hämta alternativ: fasta eller cachade
        const alternativ = hämtaKolumnAlternativ(def.alternativNyckel);
        const tomOpt = document.createElement('option');
        tomOpt.value = '';
        tomOpt.textContent = '–';
        sel.appendChild(tomOpt);
        for (const alt of alternativ) {
          const opt = document.createElement('option');
          opt.value = alt.value;
          opt.textContent = alt.label;
          sel.appendChild(opt);
        }
        sel.value = rad[kol] || '';
        td.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.dataset.kol = kol;
        inp.value = rad[kol] || '';
        td.appendChild(inp);
      }

      tr.appendChild(td);
    }

    // Dokumenttitel + Fil-celler (parvis)
    for (let fi = 0; fi < filKolumner.length; fi++) {
      // DokTitel_N – textinput för titelöverstyrning
      const dk = dokTitelKolumner[fi];
      const tdTitel = document.createElement('td');
      const titelInp = document.createElement('input');
      titelInp.type = 'text';
      titelInp.dataset.kol = dk;
      titelInp.value = rad[dk] || '';
      titelInp.placeholder = 'Dokumenttitel…';
      tdTitel.appendChild(titelInp);
      tr.appendChild(tdTitel);

      // Fil_N – filväljare
      const fk = filKolumner[fi];
      const td = document.createElement('td');
      td.className = 'fil-cell';
      td.dataset.radIdx = idx;
      td.dataset.filIdx = fi;
      renderaFilCell(td, rad, fi, fk);
      kopplaDragDropCell(td, idx, fi);
      tr.appendChild(td);
    }

    // Status
    const statusTd = document.createElement('td');
    statusTd.innerHTML = `<span class="rad-status väntar" id="rad-status-${idx}">Väntar</span>`;
    tr.appendChild(statusTd);

    // Ta bort
    const taBortTd = document.createElement('td');
    const taBortBtn = document.createElement('button');
    taBortBtn.className = 'ta-bort-rad';
    taBortBtn.textContent = '✕';
    taBortBtn.title = 'Ta bort rad';
    taBortBtn.addEventListener('click', () => { sparaFrånTabell(); taBortRad(idx); });
    taBortTd.appendChild(taBortBtn);
    tr.appendChild(taBortTd);

    kropp.appendChild(tr);
  });
}

/**
 * Renderar innehållet i en fil-cell.
 */
function renderaFilCell(td, rad, filIdx, filKolumn) {
  td.innerHTML = '';
  const filObj = rad._filer?.[filIdx];
  const filnamn = filObj ? filObj.name : (rad[filKolumn] || '');

  if (filnamn) {
    const div = document.createElement('div');
    div.className = 'fil-cell-innehåll';
    div.innerHTML = `
      <span class="filnamn" title="${escBatchHtml(filnamn)}">${escBatchHtml(filnamn)}</span>
      <button class="ta-bort-fil" title="Ta bort fil">✕</button>
    `;
    div.querySelector('.ta-bort-fil').addEventListener('click', () => {
      sparaFrånTabell();
      rad[filKolumn] = '';
      if (rad._filer) rad._filer[filIdx] = null;
      renderaTabell();
    });
    td.appendChild(div);
  } else {
    const btn = document.createElement('button');
    btn.className = 'fil-välj-knapp';
    btn.textContent = '📎';
    btn.title = 'Välj fil';
    btn.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.addEventListener('change', () => {
        if (inp.files[0]) {
          sparaFrånTabell();
          if (!rad._filer) rad._filer = [];
          rad._filer[filIdx] = inp.files[0];
          rad[filKolumn] = inp.files[0].name;
          renderaTabell();
        }
      });
      inp.click();
    });
    td.appendChild(btn);
  }
}

/**
 * Kopplar drag-and-drop till en fil-cell.
 */
function kopplaDragDropCell(td, radIdx, filIdx) {
  td.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    td.classList.add('drag-over');
  });
  td.addEventListener('dragleave', () => {
    td.classList.remove('drag-over');
  });
  td.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    td.classList.remove('drag-over');
    const filer = Array.from(e.dataTransfer.files);
    if (filer.length === 0) return;
    sparaFrånTabell();
    if (!batchRader[radIdx]._filer) batchRader[radIdx]._filer = [];
    batchRader[radIdx]._filer[filIdx] = filer[0];
    batchRader[radIdx][filKolumner[filIdx]] = filer[0].name;
    renderaTabell();
  });
}

/**
 * Initierar drag-and-drop på drag-zonen (nya rader).
 */
function initDragZon() {
  const zon = document.getElementById('drag-zon');
  if (!zon) return;

  zon.addEventListener('dragover', (e) => {
    e.preventDefault();
    zon.classList.add('aktiv');
  });
  zon.addEventListener('dragleave', () => {
    zon.classList.remove('aktiv');
  });
  zon.addEventListener('drop', (e) => {
    e.preventDefault();
    zon.classList.remove('aktiv');
    const filer = Array.from(e.dataTransfer.files);
    sparaFrånTabell();
    for (const fil of filer) {
      const rad = { _filer: [fil] };
      for (const kol of Object.keys(BATCH_KOLUMNER)) {
        rad[kol] = '';
      }
      // Föreslå filnamn som titel
      rad.Titel = fil.name.replace(/\.[^.]+$/, '');
      for (const fk of filKolumner) {
        rad[fk] = '';
      }
      for (const dk of dokTitelKolumner) {
        rad[dk] = '';
      }
      rad[filKolumner[0]] = fil.name;
      batchRader.push(rad);
    }
    renderaTabell();
    uppdateraStartKnapp();
  });
}

/**
 * Uppdaterar status för en rad i tabellen.
 */
function sättRadStatus(idx, status, text) {
  const el = document.getElementById(`rad-status-${idx}`);
  if (!el) return;
  el.className = `rad-status ${status}`;
  el.textContent = text || status;
}

/**
 * Aktiverar/avaktiverar startknappen baserat på antal rader.
 */
function uppdateraStartKnapp() {
  const btn = document.getElementById('btn-starta-batch');
  if (btn) btn.disabled = batchRader.length === 0;
}

/**
 * Hämtar dropdown-alternativ för en kolumn.
 * Kombinerar fasta (BATCH_FASTA_ALTERNATIV) och cachade (batchCachedAlternativ).
 */
function hämtaKolumnAlternativ(alternativNyckel) {
  if (!alternativNyckel) return [];
  // Fasta alternativ (skyddskoder, statusar, paragrafer)
  if (BATCH_FASTA_ALTERNATIV[alternativNyckel]) {
    return BATCH_FASTA_ALTERNATIV[alternativNyckel];
  }
  // Cachade instansspecifika alternativ (diarieenheter, ansvarigaPersoner)
  if (batchCachedAlternativ[alternativNyckel]) {
    return batchCachedAlternativ[alternativNyckel];
  }
  return [];
}

function escBatchHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
