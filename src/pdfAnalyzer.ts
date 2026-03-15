import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function analyzePDF(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // 1. Custom parser for Encryption Dictionary and raw structure
  const rawInfo = parseRawPDF(uint8Array);

  // 2. pdf.js for metadata and structure
  let pdfDoc = null;
  let metadata = null;
  let info: any = null;
  let isEncrypted = false;
  let totalPages = 0;
  let pageSize = null;
  let pageRotation = 0;
  const fileSize = file.size;

  let annotationsCount = 0;
  let linksCount = 0;
  let formsCount = 0;
  let fieldNames: string[] = [];
  let hasJS = false;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;

    const meta = await pdfDoc.getMetadata();
    metadata = meta.metadata;
    info = meta.info;

    // Get page size from first page
    if (totalPages > 0) {
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });
      // Convert points to inches (1 inch = 72 points)
      const widthInches = (viewport.width / 72).toFixed(2);
      const heightInches = (viewport.height / 72).toFixed(2);
      pageSize = `${widthInches} x ${heightInches} in`;
      pageRotation = page.rotate;
      
      // We can iterate through pages to get more info
      for (let i = 1; i <= Math.min(totalPages, 5); i++) { // Limit to 5 pages for performance
          try {
              const p = await pdfDoc.getPage(i);
              const annots = await p.getAnnotations();
              annotationsCount += annots.length;
              
              for (const annot of annots) {
                  if (annot.subtype === 'Link') linksCount++;
                  if (annot.subtype === 'Widget') {
                      formsCount++;
                      if (annot.fieldName) fieldNames.push(annot.fieldName);
                  }
              }
              
              // Check for JS in actions
              if (info?.javascript) hasJS = true;
          } catch (e) {}
      }
    }

  } catch (error: any) {
    if (error.name === 'PasswordException') {
      isEncrypted = true;
    } else {
      console.error('Error parsing PDF with pdf.js:', error);
    }
  }

  // Combine results
  return {
    documentInfo: {
      pdfVersion: info?.PDFFormatVersion || rawInfo.pdfVersion || 'Unknown',
      totalPages: totalPages || rawInfo.pageCount || 'Unknown',
      pageSize: pageSize || 'Unknown',
      pageRotation: pageRotation + '°',
      fileSize: formatBytes(fileSize),
      title: info?.Title || 'N/A',
      author: info?.Author || 'N/A',
      subject: info?.Subject || 'N/A',
      keywords: info?.Keywords || 'N/A',
      creator: info?.Creator || 'Unknown',
      producer: info?.Producer || 'Unknown',
      creationDate: parseDate(info?.CreationDate) || 'Unknown',
      modificationDate: parseDate(info?.ModDate) || 'Unknown',
    },
    securityAnalysis: {
      isEncrypted: isEncrypted || rawInfo.encryption !== null,
      encryptionAlgorithm: getEncryptionAlgorithm(rawInfo.encryption),
      securityRevision: rawInfo.encryption?.r || 'N/A',
      encryptionVersion: rawInfo.encryption?.v || 'N/A',
      keyLength: rawInfo.encryption?.length || 'N/A',
      userPasswordRequired: rawInfo.encryption?.u ? 'Yes' : 'No',
      ownerPasswordPresent: rawInfo.encryption?.o ? 'Yes' : 'No',
      permissions: parsePermissions(rawInfo.encryption?.p),
      securityLevel: getSecurityLevel(rawInfo.encryption),
    },
    encryptionDetails: {
      filter: rawInfo.encryption?.filter || 'N/A',
      v: rawInfo.encryption?.v || 'N/A',
      r: rawInfo.encryption?.r || 'N/A',
      length: rawInfo.encryption?.length || 'N/A',
      o: rawInfo.encryption?.o ? 'Present' : 'N/A',
      u: rawInfo.encryption?.u ? 'Present' : 'N/A',
      p: rawInfo.encryption?.p || 'N/A',
      cf: rawInfo.encryption?.cf || 'N/A',
      stmf: rawInfo.encryption?.stmf || 'N/A',
      strf: rawInfo.encryption?.strf || 'N/A',
      userKeyHex: rawInfo.encryption?.uHex || 'N/A',
      ownerKeyHex: rawInfo.encryption?.oHex || 'N/A',
      userKeyLength: rawInfo.encryption?.uHex ? (rawInfo.encryption.uHex.length / 2) + ' bytes' : 'N/A',
      ownerKeyLength: rawInfo.encryption?.oHex ? (rawInfo.encryption.oHex.length / 2) + ' bytes' : 'N/A',
    },
    documentStructure: {
      totalObjects: rawInfo.totalObjects || 'Unknown',
      crossReferenceTable: rawInfo.hasXRef ? 'Present' : 'Not Found',
      objectStreams: rawInfo.objectStreamsCount || 0,
      compressedStreams: rawInfo.compressedStreamsCount || 0,
      trailerInfo: rawInfo.trailerInfo || 'Not Found',
    },
    resourceAnalysis: {
      embeddedFonts: rawInfo.fontsCount || 0,
      fontNames: rawInfo.fontNames.length > 0 ? rawInfo.fontNames.join(', ') : 'None detected',
      fontTypes: rawInfo.fontTypes.length > 0 ? rawInfo.fontTypes.join(', ') : 'None detected',
      imagesCount: rawInfo.imagesCount || 0,
      imageFormats: rawInfo.imageFormats.length > 0 ? rawInfo.imageFormats.join(', ') : 'None detected',
      colorSpaces: rawInfo.colorSpaces.length > 0 ? rawInfo.colorSpaces.join(', ') : 'None detected',
      attachments: rawInfo.attachmentsCount || 0,
      bookmarks: rawInfo.bookmarksCount || 0,
      annotations: annotationsCount || rawInfo.annotationsCount || 0,
      links: linksCount || 0,
    },
    formAndScript: {
      interactiveForms: formsCount > 0 || rawInfo.formsCount > 0 ? 'Yes' : 'No',
      fieldNames: fieldNames.length > 0 ? fieldNames.join(', ') : 'None detected',
      javascriptInside: hasJS || rawInfo.hasJS ? 'Yes' : 'No',
      actions: rawInfo.actionsCount > 0 ? `${rawInfo.actionsCount} detected` : 'None detected',
      embeddedScripts: rawInfo.embeddedScriptsCount > 0 ? `${rawInfo.embeddedScriptsCount} detected` : 'None detected',
    },
    streamAnalysis: {
      compressedStreams: rawInfo.compressedStreamsCount || 0,
      streamFilters: rawInfo.streamFilters.length > 0 ? rawInfo.streamFilters.join(', ') : 'None detected',
      decodedStreamPreview: rawInfo.streamPreview || 'Not available',
    }
  };
}

function parseRawPDF(uint8Array: Uint8Array) {
  const decoder = new TextDecoder('iso-8859-1');
  const str = decoder.decode(uint8Array);

  // PDF Version
  const versionMatch = str.match(/%PDF-(\d+\.\d+)/);
  const pdfVersion = versionMatch ? versionMatch[1] : null;

  // Page Count (Fallback)
  const pageMatches = str.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 0;

  // Total Objects
  const objMatches = str.match(/\d+\s+\d+\s+obj/g);
  const totalObjects = objMatches ? objMatches.length : 0;

  // Cross Reference Table
  const hasXRef = str.includes('xref');

  // Object Streams
  const objStmMatches = str.match(/\/Type\s*\/ObjStm\b/g);
  const objectStreamsCount = objStmMatches ? objStmMatches.length : 0;

  // Compressed Streams
  const flateDecodeMatches = str.match(/\/Filter\s*\/FlateDecode\b/g);
  const compressedStreamsCount = flateDecodeMatches ? flateDecodeMatches.length : 0;

  // Stream Filters
  const filterMatches = str.match(/\/Filter\s*\/([A-Za-z0-9]+)/g);
  const streamFilters = filterMatches ? Array.from(new Set(filterMatches.map(m => m.replace(/\/Filter\s*\//, '')))) : [];

  // Trailer Info
  const trailerMatch = str.match(/trailer\s*<<([\s\S]*?)>>/);
  const trailerInfo = trailerMatch ? trailerMatch[1].trim().substring(0, 100) + '...' : null;

  // Fonts
  const fontMatches = str.match(/\/Type\s*\/Font\b/g);
  const fontsCount = fontMatches ? fontMatches.length : 0;
  
  const fontNameMatches = str.match(/\/BaseFont\s*\/([A-Za-z0-9+\-]+)/g);
  const fontNames = fontNameMatches ? Array.from(new Set(fontNameMatches.map(m => m.replace(/\/BaseFont\s*\//, '')))) : [];

  const fontTypeMatches = str.match(/\/Subtype\s*\/([A-Za-z0-9]+)\b/g);
  const possibleFontTypes = ['Type1', 'TrueType', 'Type3', 'Type0', 'CIDFontType0', 'CIDFontType2'];
  const fontTypes = fontTypeMatches ? Array.from(new Set(fontTypeMatches.map(m => m.replace(/\/Subtype\s*\//, '')).filter(t => possibleFontTypes.includes(t)))) : [];

  // Images
  const imageMatches = str.match(/\/Subtype\s*\/Image\b/g);
  const imagesCount = imageMatches ? imageMatches.length : 0;
  
  const imageFilterMatches = str.match(/\/Subtype\s*\/Image[\s\S]*?\/Filter\s*\/([A-Za-z0-9]+)/g);
  const imageFormats = imageFilterMatches ? Array.from(new Set(imageFilterMatches.map(m => {
      const match = m.match(/\/Filter\s*\/([A-Za-z0-9]+)/);
      return match ? match[1] : '';
  }).filter(Boolean))) : [];

  // Color Spaces
  const colorSpaceMatches = str.match(/\/ColorSpace\s*\/([A-Za-z0-9]+)/g);
  const colorSpaces = colorSpaceMatches ? Array.from(new Set(colorSpaceMatches.map(m => m.replace(/\/ColorSpace\s*\//, '')))) : [];

  // Attachments
  const attachmentMatches = str.match(/\/EmbeddedFiles\b/g);
  const attachmentsCount = attachmentMatches ? attachmentMatches.length : 0;

  // Bookmarks
  const outlineMatches = str.match(/\/Type\s*\/Outlines\b/g);
  const bookmarksCount = outlineMatches ? outlineMatches.length : 0;

  // Annotations
  const annotMatches = str.match(/\/Type\s*\/Annot\b/g);
  const annotationsCount = annotMatches ? annotMatches.length : 0;

  // Forms
  const formMatches = str.match(/\/AcroForm\b/g);
  const formsCount = formMatches ? formMatches.length : 0;

  // JavaScript
  const jsMatches = str.match(/\/S\s*\/JavaScript\b/g);
  const hasJS = jsMatches !== null;
  const embeddedScriptsCount = jsMatches ? jsMatches.length : 0;

  // Actions
  const actionMatches = str.match(/\/Type\s*\/Action\b/g);
  const actionsCount = actionMatches ? actionMatches.length : 0;

  // Stream Preview (first few bytes of first stream)
  const streamMatch = str.match(/stream\r?\n([\s\S]{1,100})/);
  const streamPreview = streamMatch ? toHex(streamMatch[1]) + '...' : null;

  // Encryption Dictionary
  let encryption: any = null;
  const encryptRegex = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/;
  const match = str.match(encryptRegex);
  let encryptDictStr = '';

  if (match) {
    const objNum = match[1];
    const genNum = match[2];
    const objRegex = new RegExp(`${objNum}\\s+${genNum}\\s+obj([\\s\\S]*?)endobj`);
    const objMatch = str.match(objRegex);
    if (objMatch) {
      encryptDictStr = objMatch[1];
    }
  } else {
    const inlineEncryptRegex = /\/Encrypt\s*<<([\s\S]*?)>>/;
    const inlineMatch = str.match(inlineEncryptRegex);
    if (inlineMatch) {
      encryptDictStr = inlineMatch[1];
    }
  }

  if (encryptDictStr) {
    const extractField = (field: string) => {
      const regex = new RegExp(`\\/${field}\\s+([^\\/\\<\\>\\s]+|\\<[0-9a-fA-F]+\\>|\\([^)]+\\))`);
      const m = encryptDictStr.match(regex);
      if (m) {
        let val = m[1].trim();
        return val;
      }
      return null;
    };

    const extractHex = (val: string | null) => {
        if (!val) return null;
        if (val.startsWith('<') && val.endsWith('>')) {
            return val.substring(1, val.length - 1);
        } else if (val.startsWith('(') && val.endsWith(')')) {
            // Convert literal string to hex
            let hex = '';
            const inner = val.substring(1, val.length - 1);
            for (let i = 0; i < inner.length; i++) {
                let charCode = inner.charCodeAt(i);
                if (inner[i] === '\\' && i + 1 < inner.length) {
                    // Handle octal or escaped chars
                    const next = inner[i+1];
                    if (/[0-7]/.test(next)) {
                        const octalMatch = inner.substring(i+1).match(/^[0-7]{1,3}/);
                        if (octalMatch) {
                            charCode = parseInt(octalMatch[0], 8);
                            i += octalMatch[0].length;
                        }
                    } else if (next === 'n') { charCode = 10; i++; }
                    else if (next === 'r') { charCode = 13; i++; }
                    else if (next === 't') { charCode = 9; i++; }
                    else if (next === 'b') { charCode = 8; i++; }
                    else if (next === 'f') { charCode = 12; i++; }
                    else if (next === '(' || next === ')' || next === '\\') { charCode = inner.charCodeAt(i+1); i++; }
                }
                hex += charCode.toString(16).padStart(2, '0');
            }
            return hex.toUpperCase();
        }
        return val;
    };

    const uRaw = extractField('U');
    const oRaw = extractField('O');

    encryption = {
      filter: extractField('Filter'),
      v: extractField('V'),
      r: extractField('R'),
      length: extractField('Length'),
      o: oRaw,
      u: uRaw,
      p: extractField('P'),
      cf: extractField('CF'),
      stmf: extractField('StmF'),
      strf: extractField('StrF'),
      uHex: extractHex(uRaw),
      oHex: extractHex(oRaw),
    };
  }

  return {
    pdfVersion,
    pageCount,
    totalObjects,
    hasXRef,
    objectStreamsCount,
    compressedStreamsCount,
    streamFilters,
    trailerInfo,
    fontsCount,
    fontNames,
    fontTypes,
    imagesCount,
    imageFormats,
    colorSpaces,
    attachmentsCount,
    bookmarksCount,
    annotationsCount,
    formsCount,
    hasJS,
    embeddedScriptsCount,
    actionsCount,
    streamPreview,
    encryption,
  };
}

function toHex(str: string) {
    let hex = '';
    for(let i=0;i<str.length;i++) {
        hex += ''+str.charCodeAt(i).toString(16).padStart(2, '0') + ' ';
    }
    return hex.trim().toUpperCase();
}

function parsePermissions(pStr: string | null) {
  if (!pStr) return null;
  const p = parseInt(pStr, 10);
  if (isNaN(p)) return null;

  const bit = (n: number) => (p & (1 << (n - 1))) !== 0;

  return {
    printing: bit(3),
    editing: bit(4),
    copying: bit(5),
    annotations: bit(6),
    formFilling: bit(9),
    accessibility: bit(10),
    documentAssembly: bit(11),
    highQualityPrint: bit(12),
  };
}

function getEncryptionAlgorithm(enc: any) {
  if (!enc) return 'None';
  const v = parseInt(enc.v, 10);
  const r = parseInt(enc.r, 10);
  const length = parseInt(enc.length, 10) || 40;

  if (v === 1 && r === 2) return 'RC4 (40-bit)';
  if (v === 2 && r === 3) return `RC4 (${length}-bit)`;
  if (v === 4 && r === 4) return `AES (${length}-bit) / RC4`;
  if (v === 5 && r === 5) return 'AES (256-bit)';
  if (v === 5 && r === 6) return 'AES (256-bit) R6';
  return `Unknown (V=${v}, R=${r})`;
}

function getSecurityLevel(enc: any) {
  if (!enc) return 'None';
  const v = parseInt(enc.v, 10);
  if (v <= 2) return 'Low (Deprecated)';
  if (v === 4) return 'Medium (AES-128)';
  if (v >= 5) return 'High (AES-256)';
  return 'Unknown';
}

function parseDate(pdfDate: string | null) {
  if (!pdfDate) return null;
  // Format: D:YYYYMMDDHHmmSSOHH'mm'
  const match = pdfDate.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).toLocaleString();
  }
  return pdfDate;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
