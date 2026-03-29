// mall-dokument.js – Rendering och hantering av ärendedokument i ärendemallen
// Beror på: mall-data.js (DOKUMENTKATEGORIER, escHtml, kopplaDragDrop,
//   hämtaKlassificeringskod, hittaTommaObligatoriskaFältDokMall)
// Använder globala variabler: ärendedokument, sparadeDokumentmallar (definieras i mall.js)

function visaDokCacheStatus() {
  const el = document.getElementById('dok-cache-status');
  if (!el) return;
  if (sparadeDokumentmallar.length > 0) {
    el.textContent = `(${sparadeDokumentmallar.length} dokumentmallar sparade)`;
    el.style.color = '#2e7d32';
  } else {
    el.textContent = '(Inga dokumentmallar – skapa via popupen eller knappen nedan)';
    el.style.color = '#b71c1c';
  }
}

function renderaDokument() {
  const lista = document.getElementById('dokumentlista');
  lista.innerHTML = '';
  ärendedokument.forEach((inst, idx) => {
    const div = document.createElement('div');
    div.className = 'dokument-kort';
    div.draggable = true;
    div.dataset.idx = idx;
    const namn = inst.namn || '(okänd mall)';
    const kategori = DOKUMENTKATEGORIER.find(k => k.value === inst.kategori)?.label || '';
    const handlingstyp = inst.handlingstyp?.text || '';
    const detaljer = [kategori, handlingstyp].filter(Boolean);
    const nummer = idx + 1; // :1, :2, :3 …

    // Kontrollera om handlingstypen matchar ärendets klassificering
    const klassKod = hämtaKlassificeringskod();
    const handlTypText = inst.handlingstyp?.text || '';
    const klassMismatch = klassKod && handlTypText && !handlTypText.startsWith(klassKod);

    // Kontrollera tomma obligatoriska fält
    const tommaObl = hittaTommaObligatoriskaFältDokMall(inst);

    // Visa ursprungsmall-info om instansen avviker
    const ursprung = inst.dokumentmallId
      ? sparadeDokumentmallar.find(m => m.id === inst.dokumentmallId)
      : null;
    const ursprungInfo = ursprung ? `Bas: ${escHtml(ursprung.namn)}` : '';

    div.innerHTML = `
      <div class="dok-rubrik"><span class="drag-handle">⠿</span><span style="color:#0078d4;font-weight:700;margin-right:6px;">:${nummer}</span>${escHtml(namn)}</div>
      <div class="dok-knappar">
        <button data-idx="${idx}" data-action="redigera-dok" title="Redigera denna instans">✎</button>
        <button data-idx="${idx}" data-action="ta-bort-dok" title="Ta bort från ärendemall">✕</button>
      </div>
      ${detaljer.length ? `<div class="dok-detaljer">${escHtml(detaljer.join(' · '))}</div>` : ''}
      ${ursprungInfo ? `<div class="dok-detaljer" style="color:#888;font-style:italic;">${ursprungInfo}</div>` : ''}
      ${klassMismatch ? `<div class="dok-detaljer" style="color:#c0392b;">⚠ Handlingstypen (${escHtml(handlTypText.split(' ')[0])}) matchar inte ärendets klassificering (${escHtml(klassKod)})</div>` : ''}
      ${tommaObl.length ? `<div class="dok-detaljer" style="color:#b36b00;">⚠ Användaren måste fylla i: ${escHtml(tommaObl.join(', '))}</div>` : ''}
    `;
    lista.appendChild(div);
  });

  kopplaDragDrop(lista, ärendedokument, renderaDokument);

  lista.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'redigera-dok') {
        // Spara instansen till temp-storage och öppna redigeraren i instansläge
        const instans = ärendedokument[idx];
        await chrome.storage.local.set({
          tempDokInstans: { data: instans, idx }
        });
        chrome.tabs.create({
          url: chrome.runtime.getURL('dokument-mall.html') + '?instans=1',
        });
      } else if (btn.dataset.action === 'ta-bort-dok') {
        ärendedokument.splice(idx, 1);
        renderaDokument();
      }
    });
  });
}

/**
 * Visar en väljare för att lägga till sparade dokumentmallar i ärendemallen.
 */
function visaDokumentväljare() {
  document.querySelectorAll('.dokument-formulär').forEach(el => el.remove());

  if (sparadeDokumentmallar.length === 0) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dokument-mall.html') });
    return;
  }

  const tillgängliga = sparadeDokumentmallar;
  const klassKod = hämtaKlassificeringskod();

  const formulär = document.createElement('div');
  formulär.className = 'dokument-formulär';
  formulär.innerHTML = `
    <h4>Välj dokumentmall</h4>
    <div class="faltrad">
      <select name="dok-mall-val">
        ${tillgängliga.map(m => {
          const kat = DOKUMENTKATEGORIER.find(k => k.value === m.kategori)?.label || '';
          const detalj = [kat, m.handlingstyp?.text].filter(Boolean).join(' · ');
          const htText = m.handlingstyp?.text || '';
          const varning = klassKod && htText && !htText.startsWith(klassKod) ? ' ⚠' : '';
          return `<option value="${escHtml(m.id)}">${escHtml(m.namn)}${detalj ? ' (' + escHtml(detalj) + ')' : ''}${varning}</option>`;
        }).join('')}
      </select>
    </div>
    ${klassKod ? '<p style="font-size:11px;color:#888;margin:0 0 8px;">⚠ = handlingstypen matchar inte klassificeringen ' + escHtml(klassKod) + '</p>' : ''}
    <div class="knappar">
      <button class="ok" data-action="ok">Lägg till</button>
      <button data-action="avbryt">Avbryt</button>
    </div>
  `;

  document.getElementById('dokumentlista').after(formulär);

  formulär.querySelector('[data-action="avbryt"]').addEventListener('click', () => formulär.remove());
  formulär.querySelector('[data-action="ok"]').addEventListener('click', () => {
    const valt = formulär.querySelector('[name="dok-mall-val"]').value;
    const dm = sparadeDokumentmallar.find(m => m.id === valt);
    if (dm) {
      // Djupkopiera dokumentmallen som instans – oberoende av originalet
      const instans = JSON.parse(JSON.stringify(dm));
      instans.dokumentmallId = dm.id;
      delete instans.id;
      delete instans.skapad;
      instans.ändrad = Date.now();
      ärendedokument.push(instans);
      formulär.remove();
      renderaDokument();
    }
  });
}
