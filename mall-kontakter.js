// mall-kontakter.js – Rendering och hantering av externa kontakter i ärendemallen
// Beror på: mall-data.js (KONTAKTROLLER, escHtml, kopplaDragDrop)
// Använder global variabel: kontakter (definieras i mall.js)

function renderaKontakter() {
  const lista = document.getElementById('kontaktlista');
  lista.innerHTML = '';
  kontakter.forEach((k, idx) => {
    const div = document.createElement('div');
    div.className = 'kontakt-kort';
    div.draggable = true;
    div.dataset.idx = idx;
    const roll = KONTAKTROLLER.find(r => r.value === k.roll)?.label || k.roll;
    div.innerHTML = `
      <div class="kontakt-rubrik"><span class="drag-handle">⠿</span>${escHtml(k.namn) || '(Namnlös)'} <span style="font-weight:normal;color:#888;font-size:12px">– ${escHtml(roll)}</span></div>
      <div class="kontakt-knappar">
        <button data-idx="${idx}" data-action="redigera">Redigera</button>
        <button data-idx="${idx}" data-action="ta-bort">✕</button>
      </div>
      <div class="kontakt-detaljer">${[k.epost, k.telefon, k.ort].filter(Boolean).map(escHtml).join(' · ')}</div>
    `;
    lista.appendChild(div);
  });

  kopplaDragDrop(lista, kontakter, renderaKontakter);

  lista.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'redigera') {
        visaKontaktFormulär(idx);
      } else {
        kontakter.splice(idx, 1);
        renderaKontakter();
      }
    });
  });
}

function visaKontaktFormulär(idx) {
  // Ta bort eventuellt öppet formulär
  document.querySelectorAll('.kontakt-formulär').forEach(el => el.remove());

  const k = idx !== null ? kontakter[idx] : {};
  const formulär = document.createElement('div');
  formulär.className = 'kontakt-formulär';

  const rollOptions = KONTAKTROLLER.map(r =>
    `<option value="${r.value}" ${k.roll === r.value ? 'selected' : ''}>${escHtml(r.label)}</option>`
  ).join('');

  formulär.innerHTML = `
    <h4>${idx !== null ? 'Redigera kontakt' : 'Ny extern kontakt'}</h4>
    <div class="tvakol">
      <div class="faltrad">
        <label class="obligatorisk">Namn</label>
        <input type="text" name="namn" value="${escHtml(k.namn || '')}">
      </div>
      <div class="faltrad">
        <label>Roll</label>
        <select name="roll">${rollOptions}</select>
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Kontaktperson</label>
        <input type="text" name="kontaktperson" value="${escHtml(k.kontaktperson || '')}">
      </div>
      <div class="faltrad">
        <label>E-post</label>
        <input type="email" name="epost" value="${escHtml(k.epost || '')}">
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Telefon</label>
        <input type="tel" name="telefon" value="${escHtml(k.telefon || '')}">
      </div>
      <div class="faltrad">
        <label>Adress</label>
        <input type="text" name="adress" value="${escHtml(k.adress || '')}">
      </div>
    </div>
    <div class="tvakol">
      <div class="faltrad">
        <label>Postnummer</label>
        <input type="text" name="postnummer" value="${escHtml(k.postnummer || '')}">
      </div>
      <div class="faltrad">
        <label>Ort</label>
        <input type="text" name="ort" value="${escHtml(k.ort || '')}">
      </div>
    </div>
    <div class="faltrad">
      <label>Kommentar</label>
      <textarea name="kommentar" rows="2">${escHtml(k.kommentar || '')}</textarea>
    </div>
    <div class="knappar">
      <button class="ok" data-action="ok">OK</button>
      <button data-action="avbryt">Avbryt</button>
    </div>
  `;

  // Infoga efter kontaktlistan
  const lista = document.getElementById('kontaktlista');
  lista.after(formulär);

  formulär.querySelector('[data-action="avbryt"]').addEventListener('click', () => formulär.remove());
  formulär.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const namnFält = formulär.querySelector('[name="namn"]');
    if (!namnFält.value.trim()) {
      namnFält.focus();
      return;
    }
    const nyKontakt = {
      namn: formulär.querySelector('[name="namn"]').value.trim(),
      roll: formulär.querySelector('[name="roll"]').value,
      kontaktperson: formulär.querySelector('[name="kontaktperson"]').value.trim(),
      epost: formulär.querySelector('[name="epost"]').value.trim(),
      telefon: formulär.querySelector('[name="telefon"]').value.trim(),
      adress: formulär.querySelector('[name="adress"]').value.trim(),
      postnummer: formulär.querySelector('[name="postnummer"]').value.trim(),
      ort: formulär.querySelector('[name="ort"]').value.trim(),
      kommentar: formulär.querySelector('[name="kommentar"]').value.trim(),
    };
    if (idx !== null) {
      kontakter[idx] = nyKontakt;
    } else {
      kontakter.push(nyKontakt);
    }
    formulär.remove();
    renderaKontakter();
  });
}
