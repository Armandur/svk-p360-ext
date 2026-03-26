// spy.js - Felsökningsspion för dokumentflöde i 360°
// Användning i DevTools-konsolen på p360.svenskakyrkan.se:
// 1) Klistra in denna fil eller kör den via Snippets
// 2) __p360Spy.start()
// 3) Gör en manuell körning: skapa ärendedokument + fil
// 4) __p360Spy.stopAndDownload()

(function () {
  if (window.__p360Spy) {
    console.log('[p360-spy] Redan laddad.');
    return;
  }

  const state = {
    running: false,
    logs: [],
    maxRows: 6000,
    timer: null,
    origXhrOpen: null,
    origXhrSend: null,
    origFetch: null,
    origDoPostBack: null,
    clickHandler: null,
    startedAt: null,
  };

  function now() {
    return new Date().toISOString();
  }

  function safe(v) {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch {
      return String(v);
    }
  }

  function log(kind, data) {
    if (!state.running) return;
    state.logs.push({ ts: now(), kind, ...safe(data) });
    if (state.logs.length > state.maxRows) {
      state.logs.splice(0, state.logs.length - state.maxRows);
    }
  }

  function collectUploadState(doc) {
    const hidden = Array.from(doc.querySelectorAll('input[type="hidden"]'))
      .filter(el => {
        const key = `${el.id}|${el.name}`;
        return key.includes('DocumentMultiFileUploadControl') || key.includes('SI_HiddenField_ScannedFilepath');
      })
      .map(el => ({
        id: el.id || '',
        name: el.name || '',
        value: (el.value || '').slice(0, 500),
      }));

    const controls = Array.from(doc.querySelectorAll(
      '[id*="hiddenUploadButton"],[name*="hiddenUploadButton"],' +
      '[id*="ImportFileListControl"],[id*="dragdropContainer"]'
    )).map(el => ({
      id: el.id || '',
      name: el.name || '',
      tag: el.tagName,
      onclick: (el.getAttribute('onclick') || '').slice(0, 300),
      href: (el.getAttribute('href') || '').slice(0, 300),
      hiddenPathId: el.getAttribute('data-hiddenuploadedfilespathid') || '',
      hiddenBtnId: el.getAttribute('data-hiddenuploadbuttonid') || '',
      listId: el.getAttribute('data-overlayattachedlistcontrolclientid') || '',
      text: (el.textContent || '').trim().slice(0, 300),
    }));

    return { hidden, controls };
  }

  function snapshot(label) {
    try {
      log('snapshot', {
        label,
        href: window.location.href,
        upload: collectUploadState(document),
      });
    } catch (e) {
      log('snapshot_error', { label, error: e.message });
    }
  }

  function start() {
    if (state.running) return console.log('[p360-spy] Kör redan.');
    state.running = true;
    state.startedAt = now();
    state.logs = [];

    // XHR
    state.origXhrOpen = XMLHttpRequest.prototype.open;
    state.origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__spy = { method, url: String(url || '') };
      return state.origXhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const meta = this.__spy || {};
      log('xhr_send', {
        method: meta.method || '',
        url: meta.url || '',
        bodyType: body?.constructor?.name || typeof body,
      });
      this.addEventListener('load', () => {
        log('xhr_load', {
          method: meta.method || '',
          url: meta.url || '',
          status: this.status,
          responsePreview: String(this.responseText || '').slice(0, 300),
        });
      });
      return state.origXhrSend.call(this, body);
    };

    // fetch
    state.origFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = String(args[0] || '');
      log('fetch', { url });
      return state.origFetch.apply(this, args);
    };

    // __doPostBack
    if (typeof window.__doPostBack === 'function') {
      state.origDoPostBack = window.__doPostBack;
      window.__doPostBack = function (target, arg) {
        log('postback', { target: String(target || ''), arg: String(arg || '') });
        return state.origDoPostBack.apply(this, arguments);
      };
    }

    // Klickspårning
    state.clickHandler = (ev) => {
      const el = ev.target?.closest?.('a,button,input');
      if (!el) return;
      const id = el.id || '';
      const name = el.name || '';
      if (
        id.includes('Upload') || name.includes('Upload') ||
        id.includes('Wizard') || name.includes('Wizard') ||
        id.includes('DialogButton') || name.includes('DialogButton')
      ) {
        log('click', {
          id,
          name,
          tag: el.tagName,
          type: el.getAttribute('type') || '',
          onclick: (el.getAttribute('onclick') || '').slice(0, 300),
          href: (el.getAttribute('href') || '').slice(0, 300),
        });
      }
    };
    document.addEventListener('click', state.clickHandler, true);

    // Regelbundna snapshots under körning
    state.timer = window.setInterval(() => snapshot('interval'), 1000);
    snapshot('start');
    console.log('[p360-spy] Startad.');
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;

    if (state.origXhrOpen) XMLHttpRequest.prototype.open = state.origXhrOpen;
    if (state.origXhrSend) XMLHttpRequest.prototype.send = state.origXhrSend;
    if (state.origFetch) window.fetch = state.origFetch;
    if (state.origDoPostBack) window.__doPostBack = state.origDoPostBack;
    if (state.clickHandler) document.removeEventListener('click', state.clickHandler, true);
    snapshot('stop');
    console.log('[p360-spy] Stoppad.');
  }

  function stopAndDownload() {
    stop();
    const payload = {
      startedAt: state.startedAt,
      stoppedAt: now(),
      href: window.location.href,
      logs: state.logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `p360-spy-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    console.log('[p360-spy] Fil nedladdad.');
  }

  window.__p360Spy = { start, stop, stopAndDownload, state };
  console.log('[p360-spy] Laddad. Kör __p360Spy.start()');
})();

