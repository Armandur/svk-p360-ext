// spy-upload.js – Temporärt spionskript för att kartlägga FileUpload.ashx-anrop
// Klistra in i DevTools-konsolen INUTI dokumentformulärets iframe
// innan du laddar upp en fil. Loggar alla XHR/fetch till FileUpload.ashx.
//
// STEG: Högerklicka på dokumentformulär-iframen → "Öppna frame i ny flik"
//       eller välj rätt execution context i DevTools-konsolen.

(function() {
  console.log('[spy-upload] Installerar XHR-spion för FileUpload.ashx...');

  // Spiona på XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._spyMethod = method;
    this._spyUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    if (this._spyUrl && this._spyUrl.includes('FileUpload')) {
      console.group(`[spy-upload] XHR ${this._spyMethod} ${this._spyUrl}`);

      // Logga alla request headers som satts
      const origSetHeader = this.setRequestHeader;
      const headers = {};
      this.setRequestHeader = function(name, value) {
        headers[name] = value;
        return origSetHeader.call(this, name, value);
      };

      // Logga body
      if (body instanceof FormData) {
        console.log('[spy-upload] Body: FormData');
        for (const [key, value] of body.entries()) {
          if (value instanceof File) {
            console.log(`  ${key}: File(name=${value.name}, size=${value.size}, type=${value.type})`);
          } else {
            console.log(`  ${key}: ${String(value).substring(0, 500)}`);
          }
        }
      } else if (body instanceof Blob) {
        console.log(`[spy-upload] Body: Blob(size=${body.size}, type=${body.type})`);
      } else if (typeof body === 'string') {
        console.log(`[spy-upload] Body (string, ${body.length} chars): ${body.substring(0, 1000)}`);
      } else {
        console.log('[spy-upload] Body:', body);
      }

      // Logga response
      this.addEventListener('load', () => {
        console.log('[spy-upload] Headers skickade:', headers);
        console.log(`[spy-upload] Status: ${this.status}`);
        console.log(`[spy-upload] Response (${this.responseText?.length} chars): ${this.responseText?.substring(0, 2000)}`);
        console.groupEnd();
      });

      this.addEventListener('error', () => {
        console.log('[spy-upload] FEL vid uppladdning');
        console.groupEnd();
      });
    }
    return origSend.call(this, body);
  };

  // Spiona även på setRequestHeader globalt för FileUpload-anrop
  const origSetReqHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._spyUrl && this._spyUrl.includes('FileUpload')) {
      if (!this._spyHeaders) this._spyHeaders = {};
      this._spyHeaders[name] = value;
    }
    return origSetReqHeader.call(this, name, value);
  };

  // Spiona på fetch också (för säkerhets skull)
  const origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (String(url).includes('FileUpload')) {
      console.group(`[spy-upload] fetch ${opts?.method || 'GET'} ${url}`);
      console.log('[spy-upload] Options:', JSON.stringify(opts, null, 2));
      return origFetch.call(this, url, opts).then(resp => {
        resp.clone().text().then(t => {
          console.log(`[spy-upload] Response: ${t.substring(0, 2000)}`);
          console.groupEnd();
        });
        return resp;
      });
    }
    return origFetch.call(this, url, opts);
  };

  console.log('[spy-upload] Redo – ladda upp en fil nu.');
})();
