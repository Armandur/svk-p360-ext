// spy.js – Temporär spion för kartläggning av 360°:s formulär och PostBack-nycklar.
// Aktivera: lägg till "spy.js" i manifest.json content_scripts MAIN world (sist i listan).
// Avaktivera: ta bort den igen. Committa aldrig spy.js med aktiv manifest-post.

(function () {
  if (window._p360SpyAktiv) return;
  window._p360SpyAktiv = true;

  // --- Loggbuffert – samlar ALLT för export till fil ---
  const _logg = [];
  function spyLog(typ, etikett, data) {
    const entry = {
      tid: new Date().toISOString(),
      typ,
      etikett,
      ...data
    };
    _logg.push(entry);
    // Logga även till konsol som vanligt
    return entry;
  }

  // Exponera export-funktion globalt
  window.p360SpyExport = function () {
    const blob = new Blob([JSON.stringify(_logg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `p360-spy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[spy] Exporterade ${_logg.length} poster till fil.`);
  };

  // Exponera loggen direkt för inspektion
  window.p360SpyLogg = _logg;

  // --- Flytande exportknapp ---
  function skapaExportKnapp() {
    const btn = document.createElement('button');
    btn.id = 'p360-spy-export-btn';
    btn.textContent = '📥 Spy-export';
    btn.title = 'Ladda ner spy-loggen som JSON-fil';
    btn.style.cssText =
      'position:fixed;bottom:12px;right:12px;z-index:999999;' +
      'padding:8px 14px;background:#2c3e50;color:#fff;border:2px solid #e67e22;' +
      'border-radius:6px;font-family:sans-serif;font-size:12px;font-weight:bold;' +
      'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);opacity:0.9;';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.9'; });
    btn.addEventListener('click', () => {
      // Snapshot alla iframes innan export
      window.p360Snapshot?.();
      window.p360SpyExport();
      btn.textContent = `✅ ${_logg.length} poster`;
      setTimeout(() => { btn.textContent = '📥 Spy-export'; }, 2000);
    });
    document.body.appendChild(btn);
  }
  if (document.body) skapaExportKnapp();
  else document.addEventListener('DOMContentLoaded', skapaExportKnapp);

  // --- Hjälp: dekoda URL-kodad POST-body till läsbar form ---
  function parseBody(raw) {
    if (!raw) return {};
    try {
      return Object.fromEntries(
        String(raw).split('&').map(p => {
          const i = p.indexOf('=');
          if (i < 0) return [decodeURIComponent(p), ''];
          return [
            decodeURIComponent(p.slice(0, i).replace(/\+/g, ' ')),
            decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' ')),
          ];
        })
      );
    } catch {
      return { _råBody: String(raw).slice(0, 500) };
    }
  }

  // Intressanta PostBack-targets som triggar DOM-snapshot automatiskt
  const SNAPSHOT_TRIGGERS = [
    'TypeJournalDocumentInsertComboControl',  // Kategori-byte (Inkommande/Utgående/Upprättat)
    'AccessCodeComboControl',                  // Skyddskod-byte
    'SelectOfficialTitleComboBoxControl',       // Offentlig titel-val
    'ProcessRecordTypeControl',                // Handlingstyp
    'WizardNavigationButton',                  // Flikbyte och finish
  ];

  // --- Installera spion i ett fönster (top eller iframe) ---
  function installera(win, etikett) {
    if (!win || win._p360SpyInstallerad) return;
    try { win._p360SpyInstallerad = true; } catch { return; }

    // __doPostBack – med automatisk snapshot vid intressanta triggers
    try {
      const orig = win.__doPostBack;
      if (orig) {
        win.__doPostBack = function (target, arg) {
          console.log(`[spy:${etikett}] __doPostBack`, { target, arg });
          spyLog('postback', etikett, { target, arg });

          // Snapshot FÖRE PostBack om det är en intressant trigger
          const ärIntressant = SNAPSHOT_TRIGGERS.some(t => target.includes(t));
          if (ärIntressant) {
            console.log(`[spy:${etikett}] 🔄 Trigger-snapshot FÖRE PostBack (${arg || target.split('$').pop()})`);
            try { dumpFormulärFält(win.document, `${etikett} FÖRE ${arg || ''}`); } catch {}
          }

          const result = orig.call(win, target, arg);

          // Snapshot EFTER PostBack (med fördröjning för UpdatePanel-svar)
          if (ärIntressant) {
            setTimeout(() => {
              console.log(`[spy:${etikett}] ✅ Trigger-snapshot EFTER PostBack (${arg || target.split('$').pop()}) +2s`);
              try { dumpFormulärFält(win.document, `${etikett} EFTER ${arg || ''}`); } catch {}
            }, 2000);
            setTimeout(() => {
              console.log(`[spy:${etikett}] ✅ Trigger-snapshot EFTER PostBack (${arg || target.split('$').pop()}) +5s`);
              try { dumpFormulärFält(win.document, `${etikett} EFTER-5s ${arg || ''}`); } catch {}
            }, 5000);
          }

          return result;
        };
      }
    } catch { /* cross-origin */ }

    // XHR
    try {
      const origOpen = win.XMLHttpRequest.prototype.open;
      const origSend = win.XMLHttpRequest.prototype.send;

      win.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._spyMethod = method;
        this._spyUrl = url;
        return origOpen.call(this, method, url, ...rest);
      };

      win.XMLHttpRequest.prototype.send = function (body) {
        const self = this;
        if (self._spyMethod === 'POST') {
          const parsed = parseBody(body);
          // Filtrera bort VIEWSTATE och liknande stora brus-fält
          const intressant = Object.fromEntries(
            Object.entries(parsed).filter(([k]) =>
              !k.startsWith('__VIEWSTATE') &&
              !k.startsWith('__EVENTVALI') &&
              !k.startsWith('BIFViewState')
            )
          );
          console.log(`[spy:${etikett}] XHR POST`, self._spyUrl);
          console.log(`[spy:${etikett}] Fält:`, intressant);
          console.log(`[spy:${etikett}] (VIEWSTATE/BIFViewState utelämnade)`);
          spyLog('xhr-post', etikett, { url: self._spyUrl, fält: intressant });
        }
        self.addEventListener('load', function () {
          if (self._spyMethod === 'POST') {
            const svar = self.responseText?.slice(0, 500) || '';
            if (svar) {
              console.log(`[spy:${etikett}] XHR svar (500 tecken):`, svar);
              spyLog('xhr-svar', etikett, { url: self._spyUrl, svar });
            }
          }
        });
        return origSend.call(this, body);
      };
    } catch { /* cross-origin */ }
  }

  // --- DOM-snapshot: logga alla formulärfält i ett dokument ---
  function dumpFormulärFält(doc, etikett) {
    if (!doc) return;
    const resultat = [];

    // SELECT-element (inkl. Selectize)
    for (const sel of doc.querySelectorAll('select')) {
      const id = sel.id || sel.name || '(okänt)';
      const val = sel.value;
      const valtText = sel.options[sel.selectedIndex]?.text || '';
      const synlig = sel.offsetParent !== null || sel.style.display !== 'none';
      const options = Array.from(sel.options).map(o => ({
        value: o.value, text: o.text.trim().slice(0, 80)
      }));
      resultat.push({
        typ: 'SELECT', id, value: val, text: valtText,
        synlig, antalOptions: options.length, options
      });
    }

    // INPUT- och TEXTAREA-element
    for (const inp of doc.querySelectorAll('input, textarea')) {
      const id = inp.id || inp.name || '(okänt)';
      // Hoppa över dolda ASP.NET-fält
      if (id.includes('__VIEWSTATE') || id.includes('__EVENTVALI') ||
          id.includes('BIFViewState') || id.includes('_CheckSum')) continue;
      const typ = inp.type || inp.tagName.toLowerCase();
      const synlig = inp.offsetParent !== null;
      const val = typ === 'checkbox' ? inp.checked : inp.value;
      if (!synlig && !val && typ !== 'hidden') continue; // hoppa över tomma, osynliga
      resultat.push({ typ: typ.toUpperCase(), id, value: val, synlig });
    }

    // Datepicker-fält (SI datepicker)
    for (const dp of doc.querySelectorAll('[id*="_si_datepicker"]')) {
      if (resultat.find(r => r.id === dp.id)) continue; // redan fångad
      resultat.push({
        typ: 'DATEPICKER', id: dp.id, value: dp.value,
        synlig: dp.offsetParent !== null
      });
    }

    console.groupCollapsed(`[spy:${etikett}] 📋 DOM-snapshot (${resultat.length} fält)`);
    // Sammanfattning: bara fält med värden
    const medVärden = resultat.filter(r =>
      r.value && r.value !== '' && r.value !== false
    );
    console.log('Fält med värden:', medVärden.length);
    console.table(medVärden.map(r => ({
      typ: r.typ, id: r.id, value: String(r.value).slice(0, 60),
      text: r.text || '', synlig: r.synlig
    })));
    // Alla fält (inkl. tomma) i en separat grupp
    console.groupCollapsed('Alla fält (inkl. tomma)');
    console.table(resultat.map(r => ({
      typ: r.typ, id: r.id, value: String(r.value).slice(0, 60),
      text: r.text || '', synlig: r.synlig
    })));
    console.groupEnd();
    // SELECT options detaljer
    const selects = resultat.filter(r => r.typ === 'SELECT');
    if (selects.length > 0) {
      console.groupCollapsed('SELECT options (per dropdown)');
      for (const s of selects) {
        console.log(`${s.id} (${s.antalOptions} options):`, s.options);
      }
      console.groupEnd();
    }
    console.groupEnd();

    // Spara till loggbuffert
    spyLog('dom-snapshot', etikett, {
      antalFält: resultat.length,
      fältMedVärden: resultat
        .filter(r => r.value && r.value !== '' && r.value !== false)
        .map(r => ({ typ: r.typ, id: r.id, value: String(r.value).slice(0, 200), text: r.text || '', synlig: r.synlig })),
      allaFält: resultat.map(r => ({
        typ: r.typ, id: r.id, value: String(r.value).slice(0, 200),
        text: r.text || '', synlig: r.synlig,
        options: r.options || undefined
      }))
    });

    return resultat;
  }

  // Exponera som globalt kommando: skriv p360Snapshot() i konsolen
  window.p360Snapshot = function (iframeIndex) {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    if (typeof iframeIndex === 'number') {
      const f = iframes[iframeIndex];
      if (!f) { console.warn('Ingen iframe med index', iframeIndex); return; }
      try {
        return dumpFormulärFält(f.contentDocument, `iframe[${iframeIndex}] ${f.src?.split('/').pop()?.split('?')[0] || ''}`);
      } catch { console.warn('Cross-origin iframe'); }
    }
    // Dumpa alla tillgängliga iframes
    console.log(`[spy] Tar snapshot av ${iframes.length} iframes + top`);
    dumpFormulärFält(document, 'top');
    iframes.forEach((f, i) => {
      try {
        const href = f.contentDocument?.location?.href || f.src || '';
        if (href && href !== 'about:blank' && !href.includes('keepViewAlive'))
          dumpFormulärFält(f.contentDocument, `iframe[${i}] ${href.split('/').pop()?.split('?')[0] || ''}`);
      } catch { /* cross-origin */ }
    });
  };

  // Installera i top
  installera(window, 'top');

  // --- Bevaka nya iframes och installera spion i dem när de laddat ---
  function hanteraIframe(f) {
    const src = (() => { try { return f.src || ''; } catch { return ''; } })();
    console.log('[spy] Ny iframe:', src || '(ingen src ännu)');
    spyLog('iframe-ny', 'top', { src });

    function försökInstallera() {
      try {
        const href = f.contentDocument?.location?.href || '';
        if (href && href !== 'about:blank') {
          console.log('[spy] Iframe laddad:', href);
          spyLog('iframe-laddad', 'top', { href });
          installera(f.contentWindow, href.split('/').pop()?.split('?')[0] || 'iframe');
          // Auto-snapshot av nyligen laddad iframe
          setTimeout(() => {
            try {
              const label = href.split('/').pop()?.split('?')[0] || 'iframe';
              dumpFormulärFält(f.contentDocument, `iframe-auto ${label}`);
            } catch { /* cross-origin */ }
          }, 1500);

          // Patch __doPostBack i iframen om det inte fanns vid installera()-anropet
          try {
            const iWin = f.contentWindow;
            if (iWin.__doPostBack && !iWin.__doPostBack._spyWrapped) {
              const orig = iWin.__doPostBack;
              iWin.__doPostBack = function (target, arg) {
                const label = iWin.location?.href?.split('/').pop()?.split('?')[0] || 'iframe';
                console.log(`[spy:${label}] __doPostBack`, { target, arg });
                return orig.call(iWin, target, arg);
              };
              iWin.__doPostBack._spyWrapped = true;
            }
          } catch { /* cross-origin */ }
        }
      } catch { /* cross-origin */ }
    }

    f.addEventListener('load', försökInstallera);
    försökInstallera(); // ifall den redan är laddad
  }

  // Fånga window.open() – 360° kan öppna dokumentdialogen som popup
  const origOpen = window.open;
  window.open = function (url, ...rest) {
    console.log('[spy] window.open:', url);
    spyLog('window-open', 'top', { url });
    const popup = origOpen.call(window, url, ...rest);
    if (popup) {
      const pollPopup = setInterval(() => {
        try {
          if (popup.closed) { clearInterval(pollPopup); return; }
          if (popup.document?.readyState === 'complete' && !popup._p360SpyInstallerad) {
            installera(popup, 'popup');
            console.log('[spy] Spion installerad i popup:', popup.location?.href);
          }
        } catch { /* cross-origin under laddning */ }
      }, 200);
    }
    return popup;
  };

  const obs = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1) {
          if (node.tagName === 'IFRAME') hanteraIframe(node);
          // Iframes kan läggas till inuti tillagda containrar
          for (const f of node.querySelectorAll?.('iframe') ?? []) hanteraIframe(f);
        }
      }
      for (const node of mut.removedNodes) {
        if (node.nodeType === 1 && node.tagName === 'IFRAME') {
          const src = (() => { try { return node.src || ''; } catch { return ''; } })();
          console.log('[spy] Iframe borttagen:', src || '(okänd)');
          spyLog('iframe-borttagen', 'top', { src });
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Registrera iframes som redan finns i DOM:en
  for (const f of document.querySelectorAll('iframe')) hanteraIframe(f);

  console.log('[spy] ✓ Aktiv – övervakar __doPostBack, XHR POST och iframes på denna sida.');
})();
