// spy.js v2 – Felsökningsspion för drag-and-drop-uppladdning och dokumentflöde i 360°
//
// Användning i DevTools-konsolen på en 360° ärendesida:
//   __p360Spy.start()          – börja spela in
//   __p360Spy.snapshot('etikett') – ta en manuell ögonblicksbild av DOM-tillståndet
//   __p360Spy.stopAndSave()    – stoppa och ladda ned JSON-fil
//
// Spionen fångar:
//   • XHR-anrop och svar (inkl. FileUpload.ashx)
//   • fetch-anrop
//   • __doPostBack-anrop (huvud-fönster + iframes)
//   • Iframes som läggs till/tas bort i DOM
//   • Drag-and-drop-händelser på upload-containrar
//   • Fil-input change-händelser
//   • Klick på upload-knappar och wizard-knappar
//   • Regelbundna snapshots av upload-kontroller i huvud-DOM och alla iframes

(function () {
  if (window.__p360Spy) {
    console.log('[spy] Redan laddad – använd __p360Spy.start() för att starta om.');
    return;
  }

  // ─── Tillstånd ─────────────────────────────────────────────────────────────

  const S = {
    on: false,
    logs: [],
    maxRows: 8000,
    intervalId: null,
    originals: {
      xhrOpen: null, xhrSend: null, fetch: null,
      mainPostBack: null,
    },
    iframeObserver: null,
    globalClickHandler: null,
    instrumentedIframes: new WeakSet(),
  };

  // ─── Hjälpfunktioner ────────────────────────────────────────────────────────

  function ts() { return new Date().toISOString(); }

  function safe(v, maxLen = 600) {
    try {
      const s = JSON.stringify(v);
      return JSON.parse(s.length > maxLen ? s.slice(0, maxLen) + '…"' : s);
    } catch { return String(v).slice(0, maxLen); }
  }

  function push(kind, data) {
    if (!S.on) return;
    let entry = { t: ts(), k: kind };
    try {
      const serialized = JSON.parse(JSON.stringify(data));
      if (serialized && typeof serialized === 'object' && !Array.isArray(serialized)) {
        Object.assign(entry, serialized);
      } else {
        entry.data = serialized;
      }
    } catch {
      entry.data = String(data).slice(0, 500);
    }
    S.logs.push(entry);
    if (S.logs.length > S.maxRows) S.logs.splice(0, S.logs.length - S.maxRows);
  }

  // ─── DOM-snapshot: upload-kontroller ────────────────────────────────────────

  function snapshotUploadKontroller(doc, prefix) {
    if (!doc) return {};
    const hidden = Array.from(doc.querySelectorAll('input[type="hidden"]'))
      .filter(el => {
        const k = `${el.id}|${el.name}`;
        return k.includes('FileUpload') || k.includes('ScannedFilepath') ||
               k.includes('hiddenUpload') || k.includes('ImportFile');
      })
      .map(el => ({ id: el.id, name: el.name, val: (el.value || '').slice(0, 300) }));

    const controls = Array.from(doc.querySelectorAll(
      '[id*="dragdropContainer"],[data-uploadurl],[data-hiddenuploadbuttonid],' +
      '[id*="hiddenUploadButton"],[id*="ImportFileListControl"],' +
      '[id*="DocumentActionMenu"],[id*="UploadControl"]'
    )).map(el => ({
      id: el.id || '',
      tag: el.tagName,
      onclick: (el.getAttribute('onclick') || '').slice(0, 200),
      href: (el.getAttribute('href') || '').slice(0, 200),
      uploadUrl: el.getAttribute('data-uploadurl') || '',
      pathId: el.getAttribute('data-hiddenuploadedfilespathid') || '',
      btnId: el.getAttribute('data-hiddenuploadbuttonid') || '',
      listId: el.getAttribute('data-overlayattachedlistcontrolclientid') || '',
      maxFiles: el.getAttribute('data-max-files') || '',
      text: (el.textContent || '').trim().slice(0, 100),
    }));

    return { prefix, hidden, controls };
  }

  function snapshotAllt(etikett) {
    try {
      const main = snapshotUploadKontroller(document, 'main');
      const iframes = [];
      for (const ifr of document.querySelectorAll('iframe')) {
        try {
          const iDoc = ifr.contentDocument;
          if (!iDoc) continue;
          const url = ifr.contentWindow?.location?.href || ifr.src || '';
          iframes.push({ url, ...snapshotUploadKontroller(iDoc, url.split('/').pop()) });
        } catch { /* cross-origin */ }
      }
      push('snapshot', { etikett, href: location.href, main, iframes });
    } catch (e) {
      push('snapshot_fel', { etikett, err: e.message });
    }
  }

  // ─── XHR-instrumentering ────────────────────────────────────────────────────

  function patchaXHR(win, iframeUrl) {
    const ctx = iframeUrl ? `[iframe ${iframeUrl.split('/').slice(-2).join('/')}]` : '[main]';
    const proto = win.XMLHttpRequest.prototype;
    const origOpen = proto.open;
    const origSend = proto.send;
    proto.open = function (method, url, ...rest) {
      this.__spyMeta = { method, url: String(url || ''), ctx };
      return origOpen.call(this, method, url, ...rest);
    };
    proto.send = function (body) {
      const m = this.__spyMeta || {};
      push('xhr', {
        ctx: m.ctx || ctx,
        method: m.method || '',
        url: m.url || '',
        bodyType: body?.constructor?.name || typeof body,
        bodyPreview: (body instanceof FormData)
          ? [...body.keys()].join(',')
          : String(body || '').slice(0, 200),
      });
      this.addEventListener('load', () => {
        push('xhr_svar', {
          ctx: m.ctx || ctx,
          url: m.url || '',
          status: this.status,
          svar: String(this.responseText || '').slice(0, 400),
        });
      });
      return origSend.call(this, body);
    };
    return { origOpen, origSend };
  }

  // ─── __doPostBack-instrumentering ──────────────────────────────────────────

  function patchaPostBack(win, iframeUrl) {
    const ctx = iframeUrl ? `[iframe ${iframeUrl.split('/').slice(-2).join('/')}]` : '[main]';
    if (typeof win.__doPostBack !== 'function') return null;
    const orig = win.__doPostBack;
    win.__doPostBack = function (target, arg) {
      push('postback', { ctx, target: String(target || ''), arg: String(arg || '') });
      return orig.apply(this, arguments);
    };
    return orig;
  }

  // ─── Iframe-instrumentering ─────────────────────────────────────────────────

  function instrumenteraIframe(ifr) {
    if (S.instrumentedIframes.has(ifr)) return;
    S.instrumentedIframes.add(ifr);

    const instrumenterad = new Set(); // undvik dubbelinstrumentering av samma URL

    const gör = () => {
      try {
        const iWin = ifr.contentWindow;
        const iDoc = ifr.contentDocument;
        if (!iWin || !iDoc) return;
        const url = iWin.location?.href || '';
        // Hoppa över about:blank – iframen har inte laddat sitt riktiga innehåll ännu
        if (!url || url === 'about:blank') return;
        // Undvik att instrumentera samma URL två gånger
        if (instrumenterad.has(url)) return;
        instrumenterad.add(url);

        push('iframe_laddad', { url, iframeId: ifr.id || '' });

        patchaXHR(iWin, url);
        patchaPostBack(iWin, url);
        lyssnaDragDrop(iDoc, url);
        lyssnaFilInput(iDoc, url);
        lyssnaKlick(iDoc, url);

        // Snapshot av formulärfält OCH upload-kontroller i iframen
        const formFält = Array.from(iDoc.querySelectorAll(
          'input:not([type="hidden"]),select,textarea,button[type="submit"]'
        )).map(el => ({
          id: el.id || '',
          name: el.name || '',
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          value: (el.value || '').slice(0, 200),
          options: el.tagName === 'SELECT'
            ? Array.from(el.options).map(o => ({ val: o.value, text: o.text.trim() }))
            : undefined,
          onclick: (el.getAttribute('onclick') || '').slice(0, 200),
        }));

        const dolda = Array.from(iDoc.querySelectorAll('input[type="hidden"]'))
          .filter(el => (el.name || '').includes('EVENTTARGET') || (el.name || '').includes('EVENTARGUMENT') || (el.name || '').includes('VIEWSTATE') === false)
          .slice(0, 30)
          .map(el => ({ id: el.id || '', name: el.name || '', val: (el.value || '').slice(0, 100) }));

        push('iframe_formulär', { url, formFält, dolda });
        push('iframe_snapshot', { url, ...snapshotUploadKontroller(iDoc, url.split('/').pop()) });
      } catch { /* cross-origin – ignorera */ }
    };

    // Lyssna alltid på load-event för framtida navigeringar i iframen
    ifr.addEventListener('load', gör);
    // Försök även direkt om iframen redan har ett riktigt innehåll
    gör();
  }

  // ─── Drag-drop-lyssnare ─────────────────────────────────────────────────────

  function lyssnaDragDrop(doc, ctx) {
    const prefix = ctx ? `[${ctx.split('/').pop()}]` : '[main]';
    const handler = (ev) => {
      const el = ev.target?.closest?.('[id*="dragdrop"],[data-uploadurl],[id*="UploadControl"]');
      if (!el) return;
      push('drag', {
        ctx: prefix,
        typ: ev.type,
        id: el.id || '',
        uploadUrl: el.getAttribute('data-uploadurl') || '',
        filer: ev.dataTransfer?.files
          ? [...ev.dataTransfer.files].map(f => ({ namn: f.name, storlek: f.size, typ: f.type }))
          : [],
      });
    };
    for (const typ of ['dragenter', 'dragover', 'drop']) {
      doc.addEventListener(typ, handler, true);
    }
  }

  // ─── Fil-input-lyssnare ─────────────────────────────────────────────────────

  function lyssnaFilInput(doc, ctx) {
    const prefix = ctx ? `[${ctx.split('/').pop()}]` : '[main]';
    doc.addEventListener('change', (ev) => {
      const el = ev.target;
      if (!el || el.type !== 'file') return;
      push('fil_vald', {
        ctx: prefix,
        id: el.id || '',
        name: el.name || '',
        filer: [...(el.files || [])].map(f => ({ namn: f.name, storlek: f.size, typ: f.type })),
      });
    }, true);
  }

  // ─── Klick-lyssnare ─────────────────────────────────────────────────────────

  function lyssnaKlick(doc, ctx) {
    const prefix = ctx ? `[${ctx.split('/').pop()}]` : '[main]';
    doc.addEventListener('click', (ev) => {
      const el = ev.target?.closest?.('a,button,input,li');
      if (!el) return;
      const id = el.id || '';
      const onclick = (el.getAttribute('onclick') || '').slice(0, 300);
      const href = (el.getAttribute('href') || '').slice(0, 200);
      // Fånga: upload-knappar, wizard, dialog, dokumentmeny, flik-knappar
      const intressant =
        id.includes('Upload') || id.includes('Wizard') || id.includes('Dialog') ||
        id.includes('DocumentAction') || id.includes('WizardView_TopMenu') ||
        id.includes('DropDownMenu') || onclick.includes('__doPostBack') ||
        onclick.includes('FileStep') || onclick.includes('Document');
      if (!intressant) return;
      push('klick', {
        ctx: prefix,
        id,
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        onclick,
        href,
        text: (el.textContent || '').trim().slice(0, 80),
      });
    }, true);
  }

  // ─── MutationObserver för iframes ──────────────────────────────────────────

  function startaIframeObserver() {
    S.iframeObserver = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (node.tagName === 'IFRAME') {
            push('iframe_tillagd', {
              id: node.id || '',
              src: node.src || '',
              href: node.contentWindow?.location?.href || '',
            });
            instrumenteraIframe(node);
          }
        }
        for (const node of mut.removedNodes) {
          if (node.tagName === 'IFRAME') {
            push('iframe_borttagen', {
              id: node.id || '',
              src: node.src || '',
            });
          }
        }
      }
    });
    S.iframeObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Start / Stopp ──────────────────────────────────────────────────────────

  function start() {
    if (S.on) { console.log('[spy] Körs redan.'); return; }
    S.on = true;
    S.logs = [];

    // Huvud-fönster
    const { origOpen, origSend } = patchaXHR(window);
    S.originals.xhrOpen = origOpen;
    S.originals.xhrSend = origSend;

    S.originals.fetch = window.fetch;
    window.fetch = async function (...args) {
      push('fetch', { url: String(args[0] || '').slice(0, 300) });
      return S.originals.fetch.apply(this, args);
    };

    S.originals.mainPostBack = patchaPostBack(window);

    // Lyssnare i huvud-fönstret
    lyssnaDragDrop(document, '');
    lyssnaFilInput(document, '');
    lyssnaKlick(document, '');

    // Instrumentera redan existerande iframes
    for (const ifr of document.querySelectorAll('iframe')) {
      instrumenteraIframe(ifr);
    }

    // Observera framtida iframes
    startaIframeObserver();

    // Regelbunden snapshot var 2:a sekund
    S.intervalId = setInterval(() => snapshotAllt('intervall'), 2000);

    snapshotAllt('start');
    console.log('[spy] Startad. Kör __p360Spy.snapshot("etikett") för manuell snapshot.');
    console.log('[spy] Kör __p360Spy.stopAndSave() för att spara logg.');
  }

  function stopp() {
    if (!S.on) return;
    S.on = false;

    if (S.intervalId) { clearInterval(S.intervalId); S.intervalId = null; }
    if (S.iframeObserver) { S.iframeObserver.disconnect(); S.iframeObserver = null; }

    // Återställ huvud-fönstrets XHR/fetch/postback
    if (S.originals.xhrOpen) XMLHttpRequest.prototype.open = S.originals.xhrOpen;
    if (S.originals.xhrSend) XMLHttpRequest.prototype.send = S.originals.xhrSend;
    if (S.originals.fetch) window.fetch = S.originals.fetch;
    if (S.originals.mainPostBack) window.__doPostBack = S.originals.mainPostBack;

    snapshotAllt('stopp');
    console.log('[spy] Stoppad. Loggar:', S.logs.length, 'rader.');
  }

  function stopAndSave() {
    stopp();
    const payload = {
      version: 2,
      url: location.href,
      sparadAt: new Date().toISOString(),
      antal: S.logs.length,
      logs: S.logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `p360-spy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    console.log('[spy] Fil sparad:', a.download);
  }

  // Manuell dump av alla iframes – kör när dialog är synlig
  function dumpIframes() {
    const result = [];
    for (const ifr of document.querySelectorAll('iframe')) {
      try {
        const iWin = ifr.contentWindow;
        const iDoc = ifr.contentDocument;
        const url = iWin?.location?.href || ifr.src || '';
        if (!url || url === 'about:blank') { result.push({ url: 'about:blank', id: ifr.id }); continue; }
        const formFält = Array.from(iDoc.querySelectorAll(
          'input:not([type="hidden"]),select,textarea,input[type="submit"],button'
        )).map(el => ({
          id: el.id || '',
          name: el.name || '',
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          value: (el.value || '').slice(0, 200),
          options: el.tagName === 'SELECT'
            ? Array.from(el.options).map(o => ({ val: o.value, text: o.text.trim() }))
            : undefined,
          onclick: (el.getAttribute('onclick') || '').slice(0, 300),
          href: (el.getAttribute('href') || '').slice(0, 200),
        }));
        result.push({ id: ifr.id, url, formFält });
        if (S.on) push('manuell_dump', { url, formFält });
      } catch (e) { result.push({ id: ifr.id, url: ifr.src, fel: e.message }); }
    }
    console.log('[spy] dumpIframes:', result);
    return result;
  }

  window.__p360Spy = {
    start,
    stopp,
    stopAndSave,
    snapshot: (etikett) => snapshotAllt(etikett || 'manuell'),
    dumpIframes,
    logs: () => S.logs,
    state: S,
  };

  console.log('[spy v2] Laddad.');
  console.log('  __p360Spy.start()           – börja spela in');
  console.log('  __p360Spy.snapshot("text")  – manuell snapshot');
  console.log('  __p360Spy.dumpIframes()     – dumpa alla iframes nu (kör när dialog är öppen)');
  console.log('  __p360Spy.stopAndSave()     – spara JSON-fil');
})();
