// batch-data.js – CSV-parsning, datamodell och validering för massregistrering
// Beror på mall-data.js (KO_PARAGRAFER, OSL_PARAGRAFER)

// Kända CSV-kolumner och deras mappning till mallfält
// typ: 'text' (default), 'select' (dropdown med cachade alternativ)
const BATCH_KOLUMNER = {
  // Alltid synliga
  Titel:         { fält: 'titel',         obligatorisk: true,  standard: true },
  Namn:          { fält: 'namn',          obligatorisk: true,  standard: true },
  // Valfria – kontakt
  Personnummer:  { fält: 'personnummer',  obligatorisk: false, standard: false },
  Adress:        { fält: 'adress',        obligatorisk: false, standard: false },
  Postnummer:    { fält: 'postnummer',    obligatorisk: false, standard: false },
  Ort:           { fält: 'ort',           obligatorisk: false, standard: false },
  Epost:         { fält: 'epost',         obligatorisk: false, standard: false },
  Telefon:       { fält: 'telefon',       obligatorisk: false, standard: false },
  // Valfria – ärendeöverstyrning (select = dropdown med cachade alternativ)
  Diarieenhet:   { fält: 'diarieenhet',   obligatorisk: false, standard: false, typ: 'select', alternativNyckel: 'diarieenheter' },
  AnsvarigPerson:{ fält: 'ansvarigPerson',obligatorisk: false, standard: false, typ: 'select', alternativNyckel: 'ansvarigaPersoner' },
  Skyddskod:     { fält: 'skyddskod',     obligatorisk: false, standard: false, typ: 'select', alternativNyckel: 'skyddskoder' },
  Paragraf:      { fält: 'paragraf',      obligatorisk: false, standard: false, typ: 'select', alternativNyckel: 'paragrafer' },
  OffentligTitel:{ fält: 'offentligTitel',obligatorisk: false, standard: false },
  Kommentar:     { fält: 'kommentar',     obligatorisk: false, standard: false },
  Ankomstdatum:  { fält: 'ankomstdatum',  obligatorisk: false, standard: false },
  Status:        { fält: 'status',        obligatorisk: false, standard: false, typ: 'select', alternativNyckel: 'statusar' },
};

// Fasta dropdown-alternativ (ej instansspecifika)
const BATCH_FASTA_ALTERNATIV = {
  skyddskoder: [
    { value: '0', label: 'Offentlig' },
    { value: '100031', label: 'Sekretess KO' },
    { value: '100032', label: 'Sekretess OSL' },
  ],
  statusar: [
    { value: '5', label: 'B - Öppet' },
    { value: '6', label: 'A - Avslutat' },
    { value: '8', label: 'M - Makulerat' },
    { value: '17', label: 'AH - Avslutat från handläggare' },
  ],
  paragrafer: [
    ...KO_PARAGRAFER.map(p => ({ value: p, label: 'K - ' + p.replace('Kyrkoordningen ', '') })),
    ...OSL_PARAGRAFER.map(p => ({ value: p, label: p })),
  ],
};

// Cachade dropdown-alternativ (instansspecifika, fylls från chrome.storage.local)
let batchCachedAlternativ = {
  diarieenheter: [],
  ansvarigaPersoner: [],
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
/**
 * Extraherar metadata från #-kommentarsrader i CSV-text.
 * Returnerar { mallNamn, mallId, slotsar: [{ filKolumn, namn, id }] }
 */
function extraheraCSVMetadata(text) {
  const meta = { mallNamn: null, mallId: null, slotsar: [] };
  const linjer = text.split('\n');
  for (const rad of linjer) {
    const trimmed = rad.trimStart();
    if (!trimmed.startsWith('#')) break;
    // # Ärendemall: Namn [id]
    const mallMatch = trimmed.match(/^#\s*Ärendemall:\s*(.+?)\s*\[([^\]]*)\]/);
    if (mallMatch) {
      meta.mallNamn = mallMatch[1].trim();
      meta.mallId = mallMatch[2].trim() || null;
    }
    // # Fil_1: Dokumentmallnamn [id]
    const filMatch = trimmed.match(/^#\s*(Fil_\d+):\s*(.+?)\s*\[([^\]]*)\]/);
    if (filMatch) {
      meta.slotsar.push({
        filKolumn: filMatch[1],
        namn: filMatch[2].trim(),
        id: filMatch[3].trim() || null,
      });
    }
  }
  return meta;
}

function parsCSV(text) {
  // Hoppa över kommentarsrader (#) i början av filen
  const linjer = text.split('\n');
  while (linjer.length > 0 && linjer[0].trimStart().startsWith('#')) {
    linjer.shift();
  }
  text = linjer.join('\n');

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
 * Identifierar DokTitel_N-kolumner i CSV-headers.
 * @returns {string[]} T.ex. ['DokTitel_1', 'DokTitel_2']
 */
function detekteraDokTitelKolumner(headers) {
  return headers.filter(h => /^DokTitel_\d+$/i.test(h)).sort((a, b) => {
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
  if (!rad.Namn && !rad.namn) fel.push('Namn saknas');

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
 *
 * @param {Object} baseMall - Ärendemallen (djupkopia skapas)
 * @param {Object} rad - Raddata från tabellen
 * @param {Array} slots - Dokumentslotsar
 * @param {Set} [aktivaKolumner] - Kolumner som är aktiverade i tabellen.
 *   Om en kolumn är dold (inte i settet) ignoreras dess data vid körning.
 *   Titel och Namn är alltid aktiva.
 */
function byggMallFrånRad(baseMall, rad, slots, aktivaKolumner) {
  const mall = JSON.parse(JSON.stringify(baseMall));
  // Hjälpfunktion: kontrollera om en kolumn är aktiv
  const aktiv = (kol) => !aktivaKolumner || aktivaKolumner.has(kol);

  // Ärendeöverstyrningar (Titel är alltid aktiv)
  if (rad.Titel || rad.titel) mall.titel = rad.Titel || rad.titel;
  if (aktiv('Kommentar') && (rad.Kommentar || rad.kommentar)) {
    mall.kommentar = rad.Kommentar || rad.kommentar;
  }
  if (aktiv('Ankomstdatum') && (rad.Ankomstdatum || rad.ankomstdatum)) {
    mall.ankomstdatum = rad.Ankomstdatum || rad.ankomstdatum;
  }

  // Diarieenhet – direkt value-matchning (väljs via dropdown i tabellen)
  if (aktiv('Diarieenhet') && (rad.Diarieenhet || rad.diarieenhet)) {
    const val = rad.Diarieenhet || rad.diarieenhet;
    if (mall._diarieenheter) {
      const match = mall._diarieenheter.find(d => d.value === val || d.text === val);
      if (match) mall.diarieenhet = { value: match.value, label: match.text || match.label || '' };
    }
  }

  // Ansvarig person – direkt value-matchning
  if (aktiv('AnsvarigPerson') && (rad.AnsvarigPerson || rad.ansvarigPerson)) {
    const val = rad.AnsvarigPerson || rad.ansvarigPerson;
    if (mall._ansvarigaPersoner) {
      const match = mall._ansvarigaPersoner.find(p => p.value === val || p.text === val);
      if (match) mall.ansvarigPerson = { value: match.value, label: match.text || match.label || '' };
    }
  }

  // Skyddskod – value direkt (0, 100031, 100032)
  if (aktiv('Skyddskod') && (rad.Skyddskod || rad.skyddskod)) {
    const sk = rad.Skyddskod || rad.skyddskod;
    if (['0', '100031', '100032'].includes(sk)) {
      mall.skyddskod = sk;
    }
  }
  if (aktiv('Paragraf') && (rad.Paragraf || rad.paragraf)) {
    mall.sekretessParag = rad.Paragraf || rad.paragraf;
  }
  if (aktiv('OffentligTitel') && (rad.OffentligTitel || rad.offentligTitel)) {
    mall.offentligTitelVal = '3';
    mall.offentligTitel = rad.OffentligTitel || rad.offentligTitel;
  }

  // Status – value direkt (5, 6, 8, 17)
  if (aktiv('Status') && (rad.Status || rad.status)) {
    const st = rad.Status || rad.status;
    if (['5', '6', '8', '17'].includes(st)) {
      mall.status = st;
    }
  }

  // Bygg kontakt från CSV-rad – bara aktiva kontaktfält inkluderas
  const namn = rad.Namn || rad.namn || '';
  const kontakt = {
    namn: namn,
    roll: '9',
    personnummer: aktiv('Personnummer') ? (rad.Personnummer || rad.personnummer || '') : '',
    adress: aktiv('Adress') ? (rad.Adress || rad.adress || '') : '',
    postnummer: aktiv('Postnummer') ? (rad.Postnummer || rad.postnummer || '') : '',
    ort: aktiv('Ort') ? (rad.Ort || rad.ort || '') : '',
    epost: aktiv('Epost') ? (rad.Epost || rad.epost || '') : '',
    telefon: aktiv('Telefon') ? (rad.Telefon || rad.telefon || '') : '',
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

    // Överlagra dokumenttitel per rad (DokTitel_N-kolumn)
    const dokTitelKolumn = `DokTitel_${s + 1}`;
    if (rad[dokTitelKolumn]) {
      dokMall.titel = rad[dokTitelKolumn];
    }

    // Lägg till kontaktperson som avsändare/mottagare via oregistreradKontakt
    // (fyllDokumentFormulär använder dok.oregistreradKontakt för snabb-fältet)
    if (kontakt.namn) {
      dokMall.oregistreradKontakt = kontakt.namn;
    }

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
 * Exporterar nuvarande batch-tabell som CSV (alla kolumner med värden).
 * Select-kolumner exporterar sin etikett (t.ex. "Kyrkokontoret") för läsbarhet.
 * Metadata (ärendemall, dokumentslotsar) skrivs som #-kommentarsrader överst.
 *
 * @param {Object} [metadata] - Valfri metadata att inkludera
 * @param {string} [metadata.mallNamn] - Namn på vald ärendemall
 * @param {string} [metadata.mallId] - ID på vald ärendemall
 * @param {Array} [metadata.slotsar] - Dokumentslotsar med namn och dokumentmall
 */
function exporteraBatchCSV(metadata) {
  sparaFrånTabell();
  const rader = [];

  // Metadata som kommentarsrader
  if (metadata) {
    rader.push(`# Ärendemall: ${metadata.mallNamn || '(ingen)'} [${metadata.mallId || ''}]`);
    if (metadata.slotsar?.length > 0) {
      for (let i = 0; i < metadata.slotsar.length; i++) {
        const s = metadata.slotsar[i];
        const dmNamn = s.dokumentmall?.namn || s.dokumentmall?.titel || '(ingen)';
        const dmId = s.dokumentmall?.dokumentmallId || s.dokumentmall?.id || '';
        rader.push(`# Fil_${i + 1}: ${dmNamn} [${dmId}]`);
      }
    }
    rader.push(`# Exporterad: ${new Date().toISOString()}`);
  }

  // Samla alla kolumner som har minst ett värde
  const aktiva = [];
  for (const [namn] of Object.entries(BATCH_KOLUMNER)) {
    if (batchRader.some(r => r[namn])) aktiva.push(namn);
  }
  // Lägg till fil- och dokumenttitelkolumner
  for (const dk of dokTitelKolumner) {
    if (batchRader.some(r => r[dk])) aktiva.push(dk);
  }
  for (const fk of filKolumner) {
    if (batchRader.some(r => r[fk])) aktiva.push(fk);
  }
  // Header + datarader
  rader.push(aktiva.join(';'));
  for (const rad of batchRader) {
    const fält = aktiva.map(k => {
      let v = rad[k] || '';
      // Select-kolumner: översätt value → etikett
      const def = BATCH_KOLUMNER[k];
      if (def?.typ === 'select' && v) {
        const alternativ = hämtaKolumnAlternativ(def.alternativNyckel);
        const match = alternativ.find(a => a.value === v);
        if (match) v = match.label;
      }
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    rader.push(fält.join(';'));
  }
  return rader.join('\r\n');
}

/**
 * Matchar ett CSV-värde mot en select-kolumns alternativ.
 * Söker först på exakt value, sedan på etikett (case-insensitive).
 * Returnerar value-koden eller tom sträng.
 */
function matchaSelectVärde(alternativNyckel, csvVärde) {
  if (!csvVärde || !alternativNyckel) return '';
  const alternativ = hämtaKolumnAlternativ(alternativNyckel);
  // Exakt value-matchning
  const exakt = alternativ.find(a => a.value === csvVärde);
  if (exakt) return exakt.value;
  // Etikett-matchning (case-insensitive)
  const lower = csvVärde.toLowerCase().trim();
  const etikett = alternativ.find(a =>
    (a.label || '').toLowerCase().trim() === lower
  );
  if (etikett) return etikett.value;
  // Partiell matchning (etikett börjar med eller innehåller)
  const partiell = alternativ.find(a =>
    (a.label || '').toLowerCase().includes(lower)
  );
  if (partiell) return partiell.value;
  return csvVärde; // Returnera som-det-är om ingen match
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
