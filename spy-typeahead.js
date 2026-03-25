// spy-typeahead.js – Loggar händelser på Projekt- och Fastighet-fälten
// Klistra in i konsolen på en sida med öppet nytt-ärende-formulär (iframe).
// Eller kör direkt i konsolen efter att ha kört p360SpyFält().
//
// Gör så här:
// 1. Öppna 360°, klicka "Nytt ärende" manuellt så formuläret öppnas
// 2. Öppna DevTools (F12) → Console
// 3. Klistra in denna kod och kör Enter
// 4. Sök manuellt i Projekt-fältet (skriv % och tryck Enter/Tab/klicka sök)
// 5. Kopiera konsol-outputen
//
// Alternativt: kör p360SpyFält() först, sedan kör detta i konsolen
// med referens till iframen.

(function() {
  // Hitta ärendeformulärets iframe
  const iframes = document.querySelectorAll('iframe');
  let iDoc = null;
  let iWin = null;

  for (const f of iframes) {
    try {
      const d = f.contentDocument;
      if (d && d.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl')) {
        iDoc = d;
        iWin = f.contentWindow;
        break;
      }
    } catch { /* cross-origin */ }
  }

  if (!iDoc) {
    // Kanske vi redan är inne i formuläret
    if (document.getElementById('PlaceHolderMain_MainView_TitleTextBoxControl')) {
      iDoc = document;
      iWin = window;
    } else {
      console.error('[spy-ta] Kunde inte hitta ärendeformuläret. Öppna "Nytt ärende" först.');
      return;
    }
  }

  console.log('[spy-ta] Formulär hittat! Övervakar Projekt och Fastighet...');

  const FÄLT = [
    {
      namn: 'Projekt',
      display: 'PlaceHolderMain_MainView_ProjectQuickSearchControl_DISPLAY',
      hidden: 'PlaceHolderMain_MainView_ProjectQuickSearchControl',
      dropdown: 'PlaceHolderMain_MainView_ProjectQuickSearchControl_dropDownList',
      onClickPB: 'PlaceHolderMain_MainView_ProjectQuickSearchControl_OnClick_PostBack',
      hiddenBtn: 'PlaceHolderMain_MainView_ProjectQuickSearchControlHiddenButton',
    },
    {
      namn: 'Fastighet',
      display: 'PlaceHolderMain_MainView_EstateGeneralTabSearchControl_DISPLAY',
      hidden: 'PlaceHolderMain_MainView_EstateGeneralTabSearchControl',
      dropdown: 'PlaceHolderMain_MainView_EstateGeneralTabSearchControl_dropDownList',
      onClickPB: 'PlaceHolderMain_MainView_EstateGeneralTabSearchControl_OnClick_PostBack',
      hiddenBtn: 'PlaceHolderMain_MainView_EstateGeneralTabSearchControlHiddenButton',
    },
  ];

  for (const f of FÄLT) {
    // Logga events på DISPLAY-fältet
    const disp = iDoc.getElementById(f.display);
    if (disp) {
      for (const ev of ['focus', 'blur', 'input', 'change', 'keydown', 'keyup', 'click']) {
        disp.addEventListener(ev, (e) => {
          console.log(`[spy-ta] ${f.namn} DISPLAY ${ev}`, {
            value: disp.value,
            event: e.type,
          });
        });
      }
      console.log(`[spy-ta] ${f.namn} DISPLAY: onclick="${disp.getAttribute('onclick')}", value="${disp.value}"`);
    } else {
      console.warn(`[spy-ta] ${f.namn} DISPLAY-fält saknas`);
    }

    // Logga OnClick_PostBack-länken
    const pb = iDoc.getElementById(f.onClickPB);
    if (pb) {
      console.log(`[spy-ta] ${f.namn} OnClick_PostBack: tagName=${pb.tagName}, onclick="${pb.getAttribute('onclick')}", href="${pb.getAttribute('href')}", style="${pb.style.cssText}"`);
    } else {
      console.warn(`[spy-ta] ${f.namn} OnClick_PostBack saknas`);
    }

    // Logga HiddenButton
    const hb = iDoc.getElementById(f.hiddenBtn);
    if (hb) {
      console.log(`[spy-ta] ${f.namn} HiddenButton: tagName=${hb.tagName}, type=${hb.type}, onclick="${hb.getAttribute('onclick')}", style="${hb.style.cssText}"`);
    } else {
      console.warn(`[spy-ta] ${f.namn} HiddenButton saknas`);
    }

    // Övervaka _dropDownList för ändringar
    const dd = iDoc.getElementById(f.dropdown);
    if (dd) {
      const obs = new MutationObserver((mutations) => {
        console.log(`[spy-ta] ${f.namn} dropDownList ÄNDRAD!`, {
          antalOptions: dd.options.length,
          options: Array.from(dd.options).slice(0, 10).map(o => ({ value: o.value, text: o.text.substring(0, 60) })),
        });
      });
      obs.observe(dd, { childList: true, subtree: true });

      dd.addEventListener('change', () => {
        console.log(`[spy-ta] ${f.namn} dropDownList change:`, dd.value);
      });

      console.log(`[spy-ta] ${f.namn} dropDownList: ${dd.options.length} options, MutationObserver aktiv`);
    }

    // Övervaka hidden-fältet
    const hid = iDoc.getElementById(f.hidden);
    if (hid) {
      const obs2 = new MutationObserver(() => {
        console.log(`[spy-ta] ${f.namn} HIDDEN ändrat:`, hid.value);
      });
      obs2.observe(hid, { attributes: true, attributeFilter: ['value'] });
    }
  }

  // Övervaka __doPostBack-anrop
  const origPB = iWin.__doPostBack;
  if (origPB) {
    iWin.__doPostBack = function(target, arg) {
      if (target.includes('Project') || target.includes('Estate') ||
          target.includes('QuickSearch')) {
        console.log(`[spy-ta] __doPostBack("${target}", "${arg}")`);
      }
      return origPB.call(this, target, arg);
    };
    console.log('[spy-ta] __doPostBack patchad – loggar Projekt/Fastighet-anrop');
  }

  // Logga QuickSearchOnClick om den finns
  if (iWin.QuickSearchOnClick) {
    const origQS = iWin.QuickSearchOnClick;
    iWin.QuickSearchOnClick = function(el) {
      console.log('[spy-ta] QuickSearchOnClick anropad med:', {
        id: el?.id,
        value: el?.value,
        tagName: el?.tagName,
      });
      return origQS.call(this, el);
    };
    console.log('[spy-ta] QuickSearchOnClick patchad');
  } else {
    console.warn('[spy-ta] QuickSearchOnClick finns INTE i iframe-fönstret');
  }

  // Logga XHR som kan vara AJAX-sökning
  const origOpen = iWin.XMLHttpRequest.prototype.open;
  iWin.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (String(url).includes('AjaxReader') || String(url).includes('QuickSearch') ||
        String(url).includes('Project') || String(url).includes('Estate')) {
      console.log(`[spy-ta] XHR ${method} ${url}`);
      this.addEventListener('load', function() {
        console.log(`[spy-ta] XHR svar (${this.status}): ${this.responseText.substring(0, 500)}`);
      });
    }
    return origOpen.call(this, method, url, ...rest);
  };
  console.log('[spy-ta] XHR patchad – loggar relevanta anrop');

  console.log('[spy-ta] ===== REDO =====');
  console.log('[spy-ta] Gör nu en manuell sökning i Projekt-fältet (skriv % och tryck sök/Enter).');
  console.log('[spy-ta] Kopiera sedan all konsol-output.');
})();
