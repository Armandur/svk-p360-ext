// batch-export.js – ZIP-skapande och PDF-sammanslagning för dagboksblad
// Beror på lib/pdf-lib.min.js (PDFLib global)

/**
 * Skapar en ZIP-Blob (store-komprimering) från en array av { data, namn }.
 * Ingen extern dependency – implementerat med standard ZIP-format.
 *
 * @param {{ data: Uint8Array|ArrayBuffer, namn: string }[]} filer
 * @returns {Blob}
 */
function skapaZip(filer) {
  // CRC-32-tabell (lazy init)
  if (!skapaZip._tab) {
    skapaZip._tab = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      skapaZip._tab[i] = c;
    }
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = skapaZip._tab[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const enc = new TextEncoder();
  const delar = [];   // Lokala filposter
  const cd = [];      // Centralkatalogposter
  let lokalOffset = 0;

  for (const fil of filer) {
    const namnB = enc.encode(fil.namn);
    const data = fil.data instanceof Uint8Array ? fil.data : new Uint8Array(fil.data);
    const crc = crc32(data);
    const sz = data.length;

    // Lokal filhuvud (30 byte + filnamn)
    const lh = new DataView(new ArrayBuffer(30 + namnB.length));
    lh.setUint32(0,  0x04034b50, true); // Signatur
    lh.setUint16(4,  20, true);         // Minimumversion
    lh.setUint16(6,  0, true);          // Flaggor
    lh.setUint16(8,  0, true);          // Komprimeringssätt: store (0)
    lh.setUint16(10, 0, true);          // Ändringsdatum (tid)
    lh.setUint16(12, 0, true);          // Ändringsdatum (datum)
    lh.setUint32(14, crc, true);
    lh.setUint32(18, sz, true);
    lh.setUint32(22, sz, true);
    lh.setUint16(26, namnB.length, true);
    lh.setUint16(28, 0, true);          // Extra-fältlängd
    new Uint8Array(lh.buffer).set(namnB, 30);
    delar.push(new Uint8Array(lh.buffer), data);

    // Centralkatalogpost (46 byte + filnamn)
    const ce = new DataView(new ArrayBuffer(46 + namnB.length));
    ce.setUint32(0,  0x02014b50, true); // Signatur
    ce.setUint16(4,  20, true); ce.setUint16(6,  20, true);
    ce.setUint16(8,  0,  true); ce.setUint16(10, 0,  true);
    ce.setUint16(12, 0,  true); ce.setUint16(14, 0,  true);
    ce.setUint32(16, crc, true);
    ce.setUint32(20, sz, true); ce.setUint32(24, sz, true);
    ce.setUint16(28, namnB.length, true);
    ce.setUint16(30, 0, true); ce.setUint16(32, 0, true);
    ce.setUint16(34, 0, true); ce.setUint16(36, 0, true);
    ce.setUint32(38, 0, true);
    ce.setUint32(42, lokalOffset, true); // Offset till lokal filhuvud
    new Uint8Array(ce.buffer).set(namnB, 46);
    cd.push(new Uint8Array(ce.buffer));

    lokalOffset += 30 + namnB.length + sz;
  }

  // Slutpost för centralkatalog (22 byte)
  const cdStorlek = cd.reduce((s, b) => s + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0,  0x06054b50, true); // Signatur
  eocd.setUint16(4,  0, true); eocd.setUint16(6,  0, true);
  eocd.setUint16(8,  filer.length, true);
  eocd.setUint16(10, filer.length, true);
  eocd.setUint32(12, cdStorlek,  true);
  eocd.setUint32(16, lokalOffset, true);
  eocd.setUint16(20, 0, true);

  return new Blob([...delar, ...cd, new Uint8Array(eocd.buffer)], { type: 'application/zip' });
}

/**
 * Sammanfogar en array av PDF-Blobs till en enda PDF med pdf-lib.
 * Returnerar en Uint8Array med den sammanfogade PDF:en.
 *
 * @param {Blob[]} blobArray
 * @param {function} [onProgress] – anropas med (i, total) för varje inläst PDF
 * @returns {Promise<Uint8Array>}
 */
async function sammanfogaPdfer(blobArray, onProgress) {
  const { PDFDocument } = PDFLib;
  const samladDok = await PDFDocument.create();

  for (let i = 0; i < blobArray.length; i++) {
    if (onProgress) onProgress(i + 1, blobArray.length);
    let dok;
    try {
      const buf = await blobArray[i].arrayBuffer();
      dok = await PDFDocument.load(buf, { ignoreEncryption: true });
    } catch {
      continue; // Hoppa över trasiga eller krypterade PDF:er
    }
    const sidor = await samladDok.copyPages(dok, dok.getPageIndices());
    for (const sida of sidor) samladDok.addPage(sida);
  }

  return samladDok.save();
}
