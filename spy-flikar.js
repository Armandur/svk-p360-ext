// spy-flikar.js – Tillfällig spy för att kartlägga Projekt- och Fastighet-fält
// Injiceras i MAIN world. Öppna 360° på valfritt ärende, kör p360SpyFält() i konsolen.
//
// Gör så här:
// 1. Öppna 360° på valfritt ärende
// 2. Öppna DevTools (F12) → Console
// 3. Kör: p360SpyFält()
// 4. Vänta – spy:n öppnar nytt-ärende-formuläret som iframe och dumpar alla fält
//    på Generellt-fliken, filtrerat på Projekt/Fastighet/Estate/Property.
// 5. Resultatet loggas till konsolen och kopieras till urklipp.

async function p360SpyFält() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const NY_ÄRENDE_URL =
    '/view.aspx?id=cf7c6540-7018-4c8c-9da8-783d6ce5d8cf' +
    '&dialogmode=true&IsDlg=1' +
    '&context-data=subtype%2cPrimary%2c61000%3bIsDlg%2cPrimary%2c1%3bname%2cPrimary%2cDMS.Case.New.61000%3b';

  console.log('[spy] Öppnar nytt-ärende-formuläret som iframe…');

  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;top:10px;left:10px;width:90vw;height:85vh;z-index:999999;border:3px solid red;background:#fff;';
  iframe.src = NY_ÄRENDE_URL;
  document.body.appendChild(iframe);

  await new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('Timeout vid laddning')), 20000);
    iframe.addEventListener('load', () => { clearTimeout(tid); resolve(); });
  });

  const iDoc = iframe.contentDocument;
  const iWin = iframe.contentWindow;

  await new Promise(resolve => {
    const start = Date.now();
    const check = setInterval(() => {
      const redo = iDoc.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl');
      if (redo || Date.now() - start > 15000) { clearInterval(check); resolve(); }
    }, 300);
  });

  await sleep(1500);

  console.log('[spy] Formuläret laddat – dumpar ALLA fält på Generellt-fliken…');

  const allFält = [];

  // Alla input, select, textarea
  for (const el of iDoc.querySelectorAll('input, select, textarea')) {
    if (!el.id && !el.name) continue;
    if (el.name?.startsWith('__') || el.id?.includes('ViewState') || el.id?.includes('keepviewalive')) continue;

    const info = {
      id: el.id || '',
      name: el.name || '',
      tagName: el.tagName,
      type: el.type || '',
      synlig: el.offsetParent !== null,
      value: el.value || '',
    };

    if (el.selectize) {
      info.harSelectize = true;
      info.selectizeOptions = Object.keys(el.selectize.options || {}).length;
    }

    if (el.tagName === 'SELECT') {
      info.options = Array.from(el.options).slice(0, 20).map(o => ({
        value: o.value,
        text: o.text.trim().substring(0, 100),
      }));
    }

    if (el.id && iDoc.getElementById(el.id + '_DISPLAY')) {
      info.harDisplay = true;
      info.displayValue = iDoc.getElementById(el.id + '_DISPLAY').value || '';
    }
    if (el.id && iDoc.getElementById(el.id + '_dropDownList')) {
      info.harDropDownList = true;
    }
    if (el.id && iDoc.getElementById(el.id + '_OnClick_PostBack')) {
      info.harOnClickPostBack = true;
    }
    if (el.id && iDoc.getElementById(el.id + 'HiddenButton')) {
      info.harHiddenButton = true;
    }

    if (el.getAttribute('onchange')) info.onchange = el.getAttribute('onchange').substring(0, 200);
    if (el.getAttribute('onclick')) info.onclick = el.getAttribute('onclick').substring(0, 200);

    allFält.push(info);
  }

  // Alla knappar/länkar med PostBack eller onclick
  for (const btn of iDoc.querySelectorAll('a[onclick*="doPostBack"], input[onclick*="doPostBack"], a[onclick*="PostBack"], input[onclick*="PostBack"]')) {
    if (!btn.id) continue;
    if (btn.id.includes('ViewState') || btn.name?.startsWith('__')) continue;
    allFält.push({
      id: btn.id,
      tagName: btn.tagName,
      type: 'postback-knapp',
      synlig: btn.offsetParent !== null,
      onclick: (btn.getAttribute('onclick') || '').substring(0, 300),
      text: (btn.textContent || btn.value || '').trim().substring(0, 80),
    });
  }

  // Filtrera: visa projekt- och fastighet-relaterade fält
  const nyckelord = ['project', 'estate', 'fastighet', 'property', 'quicksearch'];
  const projektFastighet = allFält.filter(f => {
    const id = (f.id || '').toLowerCase();
    const name = (f.name || '').toLowerCase();
    return nyckelord.some(n => id.includes(n) || name.includes(n));
  });

  console.log('[spy] === PROJEKT/FASTIGHET-FÄLT ===');
  console.log(JSON.stringify(projektFastighet, null, 2));

  // Visa också alla fält med _DISPLAY, _dropDownList eller HiddenButton (typeahead-mönster)
  const typeaheadFält = allFält.filter(f =>
    f.harDisplay || f.harDropDownList || f.harOnClickPostBack || f.harHiddenButton
  );
  console.log('[spy] === TYPEAHEAD-LIKNANDE FÄLT (har _DISPLAY, _dropDownList eller HiddenButton) ===');
  console.log(JSON.stringify(typeaheadFält, null, 2));

  // Exportera allt
  const output = {
    projektFastighet,
    typeaheadFält,
    totaltAntal: allFält.length,
  };

  const json = JSON.stringify(output, null, 2);
  try {
    await navigator.clipboard.writeText(json);
    console.log('[spy] Resultat kopierat till urklipp!');
  } catch {
    console.log('[spy] Kunde inte kopiera – kopiera manuellt.');
  }

  console.log('[spy] Stäng iframen med: p360SpyStäng()');
  return output;
}

function p360SpyStäng() {
  document.querySelectorAll('iframe[style*="z-index: 999999"]').forEach(el => el.remove());
  console.log('[spy] Iframe borttagen.');
}
