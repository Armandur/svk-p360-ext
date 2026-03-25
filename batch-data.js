// batch-data.js – CSV-parsning, datamodell och validering för massregistrering
// Beror på mall-data.js (KO_PARAGRAFER, OSL_PARAGRAFER)

// Kända CSV-kolumner och deras mappning till mallfält
const BATCH_KOLUMNER = {
  // Alltid synliga
  Titel:         { fält: 'titel',         obligatorisk: true,  standard: true },
  Förnamn:       { fält: 'förnamn',       obligatorisk: true,  standard: true },
  Efternamn:     { fält: 'efternamn',     obligatorisk: true,  standard: true },
  // Valfria – kontakt
  Personnummer:  { fält: 'personnummer',  obligatorisk: false, standard: false },
  Adress:        { fält: 'adress',        obligatorisk: false, standard: false },
  Postnummer:    { fält: 'postnummer',    obligatorisk: false, standard: false },
  Ort:           { fält: 'ort',           obligatorisk: false, standard: false },
  Epost:         { fält: 'epost',         obligatorisk: false, standard: false },
  Telefon:       { fält: 'telefon',       obligatorisk: false, standard: false },
  // Valfria – ärendeöverstyrning
  Diarieenhet:   { fält: 'diarieenhet',   obligatorisk: false, standard: false },
  AnsvarigPerson:{ fält: 'ansvarigPerson',obligatorisk: false, standard: false },
  Skyddskod:     { fält: 'skyddskod',     obligatorisk: false, standard: false },
  Paragraf:      { fält: 'paragraf',      obligatorisk: false, standard: false },
  OffentligTitel:{ fält: 'offentligTitel',obligatorisk: false, standard: false },
  Kommentar:     { fält: 'kommentar',     obligatorisk: false, standard: false },
  Ankomstdatum:  { fält: 'ankomstdatum',  obligatorisk: false, standard: false },
  Status:        { fält: 'status',        obligatorisk: false, standard: false },
};

/**
 * Detekterar separator (semikolon eller komma) i CSV-text.
 */
function detekteraSeparator(text) {
  const förstaRad = text.split('\n')[0] || '';
  const semikolon = (förstaRad.match(/;/g) || []).length;
  const komma = (förstaRad.match(/,/g) || []).length;
  return semikolon >= komma ? ';' : ',';
}

/**
 * Parsar en CSV-sträng till array av objekt.
 * Hanterar citerade fält med separator och radbrytningar.
 *
 * @param {string} text – CSV-text
 * @returns {{ headers: string[], rader: Object[] }}
 */
function parsCSV(text) {
  const sep = detekteraSeparator(text);
  const rader = [];
  let i = 0;
  const len = text.length;

  // Parsa en rad till array av fält
  function parsaRad() {
    const fält = [];
    while (i < len) {
      if (text[i] === '"') {
        // Citerat fält
        i++;
        let val = '';
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              val += '"';
              i += 2;
            } else {
              i++; // Stäng citat
              break;
            }
          } else {
            val += text[i];
            i++;
          }
        }
        fält.push(val);
        // Hoppa över separator eller radslut
        if (i < len && text[i] === sep) i++;
        else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
          if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      } else {
        // Ociterat fält
        let val = '';
        while (i < len && text[i] !== sep && text[i] !== '\r' && text[i] !== '\n') {
          val += text[i];
          i++;
        }
        fält.push(val);
        if (i < len && text[i] === sep) i++;
        else if (i < len && (text[i] === '\r' || text[i] === '\n')) {
          if (text[i] === '\r' && i + 1 < len && text[i + 1] === '\n') i += 2;
          else i++;
          break;
        }
      }
    }
    return fält;
  }

  // Första raden = headers
  const headers = parsaRad().map(h => h.trim());
  // Resterande rader
  while (i < len) {
    const fält = parsaRad();
    if (fält.length === 1 && fält[0].trim() === '') continue; // Tom rad
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (fält[j] || '').trim();
    }
    rader.push(obj);
  }

  return { headers, rader };
}

/**
 * Identifierar Fil_N-kolumner i CSV-headers.
 * @returns {string[]} T.ex. ['Fil_1', 'Fil_2']
 */
function detekteraFilKolumner(headers) {
  return headers.filter(h => /^Fil_\d+$/i.test(h)).sort((a, b) => {
    const na = parseInt(a.split('_')[1]);
    const nb = parseInt(b.split('_')[1]);
    return na - nb;
  });
}

/**
 * Validerar en rad mot ärendemallen och dokumentslotsar.
 * @returns {string[]} Lista med felmeddelanden (tom = OK)
 */
function valideraRad(rad, slots) {
  const fel = [];
  if (!rad.Titel && !rad.titel) fel.push('Titel saknas');
  if (!rad.Förnamn && !rad.förnamn) fel.push('Förnamn saknas');
  if (!rad.Efternamn && !rad.efternamn) fel.push('Efternamn saknas');

  // Kolla att minst en fil finns om det finns slots
  if (slots.length > 0) {
    const harFil = slots.some((_, idx) => {
      const kolumn = `Fil_${idx + 1}`;
      return rad[kolumn] || rad._filer?.[idx];
    });
    if (!harFil) fel.push('Ingen fil angiven');
  }

  return fel;
}

/**
 * Bygger ett komplett mall-objekt från ärendemall + raddata + slotsar.
 * Resultatet kan skickas direkt till skapaFrånMall.
 */
function byggMallFrånRad(baseMall, rad, slots) {
  const mall = JSON.parse(JSON.stringify(baseMall));

  // Ärendeöverstyrningar
  if (rad.Titel || rad.titel) mall.titel = rad.Titel || rad.titel;
  if (rad.Kommentar || rad.kommentar) mall.kommentar = rad.Kommentar || rad.kommentar;
  if (rad.Ankomstdatum || rad.ankomstdatum) mall.ankomstdatum = rad.Ankomstdatum || rad.ankomstdatum;

  // Diarieenhet – matchning mot text
  if (rad.Diarieenhet || rad.diarieenhet) {
    const sök = (rad.Diarieenhet || rad.diarieenhet).toLowerCase();
    if (mall._diarieenheter) {
      const match = mall._diarieenheter.find(d =>
        d.text.toLowerCase().includes(sök) || d.value === sök
      );
      if (match) mall.diarieenhet = match;
    }
  }

  // Ansvarig person – matchning mot text
  if (rad.AnsvarigPerson || rad.ansvarigPerson) {
    const sök = (rad.AnsvarigPerson || rad.ansvarigPerson).toLowerCase();
    if (mall._ansvarigaPersoner) {
      const match = mall._ansvarigaPersoner.find(p =>
        p.text.toLowerCase().includes(sök) || p.value === sök
      );
      if (match) mall.ansvarigPerson = match;
    }
  }

  // Skyddskod
  if (rad.Skyddskod || rad.skyddskod) {
    const sk = (rad.Skyddskod || rad.skyddskod).toUpperCase();
    if (sk === 'KO') mall.skyddskod = '100031';
    else if (sk === 'OSL') mall.skyddskod = '100032';
    else if (sk === 'OFFENTLIG' || sk === '0') mall.skyddskod = '0';
  }
  if (rad.Paragraf || rad.paragraf) mall.sekretessParag = rad.Paragraf || rad.paragraf;
  if (rad.OffentligTitel || rad.offentligTitel) {
    mall.offentligTitelVal = '3';
    mall.offentligTitel = rad.OffentligTitel || rad.offentligTitel;
  }

  // Bygg kontakt från CSV-rad
  const förnamn = rad.Förnamn || rad.förnamn || '';
  const efternamn = rad.Efternamn || rad.efternamn || '';
  const kontakt = {
    namn: `${efternamn}, ${förnamn}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, ''),
    roll: '9',
    personnummer: rad.Personnummer || rad.personnummer || '',
    adress: rad.Adress || rad.adress || '',
    postnummer: rad.Postnummer || rad.postnummer || '',
    ort: rad.Ort || rad.ort || '',
    epost: rad.Epost || rad.epost || '',
    telefon: rad.Telefon || rad.telefon || '',
  };
  mall.externaKontakter = [kontakt];

  // Bygg ärendedokument från slots
  mall.ärendedokument = [];
  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    const filKolumn = `Fil_${s + 1}`;
    const filnamn = rad[filKolumn];
    const filObj = rad._filer?.[s];

    // Hoppa över slot om ingen fil
    if (!filnamn && !filObj) continue;

    const dokMall = JSON.parse(JSON.stringify(slot.dokumentmall));

    // Lägg till kontaktperson som avsändare/mottagare
    // Inkommande (110) = avsändare, Utgående (111) = mottagare
    dokMall._kontaktNamn = kontakt.namn;
    dokMall._kontaktRoll = slot.dokumentmall.kategori === '110' ? 'avsändare' : 'mottagare';

    // Ankomstdatum för inkommande
    if (dokMall.kategori === '110' && (rad.Ankomstdatum || rad.ankomstdatum)) {
      dokMall.ankomstdatum = rad.Ankomstdatum || rad.ankomstdatum;
    }

    // Fil-referens (filnamn eller File-objekt lagras separat)
    if (filObj) {
      dokMall._filObj = filObj; // File-objekt från drag-and-drop
    }
    dokMall._filnamn = filnamn || (filObj ? filObj.name : '');

    mall.ärendedokument.push(dokMall);
  }

  return mall;
}

/**
 * Genererar en CSV-sträng från batchresultat.
 */
function exporteraResultatCSV(resultat) {
  const headers = ['Rad', 'Titel', 'Kontakt', 'Diarienummer', 'Dokument', 'Status', 'Fel'];
  const rader = resultat.map((r, i) => [
    i + 1,
    r.titel || '',
    r.kontakt || '',
    r.diarienummer || '',
    (r.dokument || []).join(', '),
    r.status || '',
    r.fel || '',
  ]);
  const csvRader = [headers.join(';')];
  for (const rad of rader) {
    csvRader.push(rad.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
  }
  return csvRader.join('\r\n');
}
