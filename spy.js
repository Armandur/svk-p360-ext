// spy.js – Temporär spion för kartläggning av 360°:s formulär och PostBack-nycklar.
// Aktivera: lägg till "spy.js" i manifest.json content_scripts MAIN world (sist i listan).
// Avaktivera: ta bort den igen. Committa aldrig spy.js med aktiv manifest-post.

(function () {
  if (window._p360SpyAktiv) return;
  window._p360SpyAktiv = true;

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

  // --- Installera spion i ett fönster (top eller iframe) ---
  function installera(win, etikett) {
    if (!win || win._p360SpyInstallerad) return;
    try { win._p360SpyInstallerad = true; } catch { return; }

    // __doPostBack
    try {
      const orig = win.__doPostBack;
      if (orig) {
        win.__doPostBack = function (target, arg) {
          console.log(`[spy:${etikett}] __doPostBack`, { target, arg });
          return orig.call(win, target, arg);
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
        }
        self.addEventListener('load', function () {
          if (self._spyMethod === 'POST') {
            const svar = self.responseText?.slice(0, 300) || '';
            if (svar) console.log(`[spy:${etikett}] XHR svar (300 tecken):`, svar);
          }
        });
        return origSend.call(this, body);
      };
    } catch { /* cross-origin */ }
  }

  // Installera i top
  installera(window, 'top');

  // --- Bevaka nya iframes och installera spion i dem när de laddat ---
  function hanteraIframe(f) {
    const src = (() => { try { return f.src || ''; } catch { return ''; } })();
    console.log('[spy] Ny iframe:', src || '(ingen src ännu)');

    function försökInstallera() {
      try {
        const href = f.contentDocument?.location?.href || '';
        if (href && href !== 'about:blank') {
          console.log('[spy] Iframe laddad:', href);
          installera(f.contentWindow, href.split('/').pop()?.split('?')[0] || 'iframe');

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

  const obs = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === 1 && node.tagName === 'IFRAME') hanteraIframe(node);
      }
      for (const node of mut.removedNodes) {
        if (node.nodeType === 1 && node.tagName === 'IFRAME') {
          const src = (() => { try { return node.src || ''; } catch { return ''; } })();
          console.log('[spy] Iframe borttagen:', src || '(okänd)');
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: false });

  // Registrera iframes som redan finns i DOM:en
  for (const f of document.querySelectorAll('iframe')) hanteraIframe(f);

  console.log('[spy] ✓ Aktiv – övervakar __doPostBack, XHR POST och iframes på denna sida.');
})();
