/* studio — PDF engine.
   Reading/rendering/rasterising uses pdf.js; structural edits (merge, split,
   rotate, delete, rebuild) use pdf-lib. Structural edits are lossless and
   keep text selectable; rasterising is what actually shrinks files. */

import { getPdfjs, getPdfLib, CDN } from './core.js';
import { encodeImage } from './image.js';

/** Password errors from pdf.js: 1 = needs password, 2 = password wrong. */
export class PdfPasswordError extends Error {
  constructor(code) {
    super(code === 2 ? 'Incorrect password' : 'This PDF is password protected');
    this.name = 'PdfPasswordError';
    this.code = code;
  }
}

/**
 * Open a PDF for reading.
 *
 * pdf.js takes ownership of the buffer it receives and detaches it, so we
 * always hand it a private copy. Callers routinely need the original bytes
 * afterwards (pdf-lib cannot read encrypted files, and page tools parse the
 * same document twice), so sharing the buffer would break them.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {string} [password]
 */
export async function openDocument(bytes, password) {
  const pdfjs = await getPdfjs();
  const copy = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(new Uint8Array(bytes));
  const params = {
    data: copy,
    cMapUrl: CDN.pdfjsCmaps,
    cMapPacked: true,
    standardFontDataUrl: CDN.pdfjsFonts,
    isEvalSupported: false,
  };
  if (password) params.password = password;
  try {
    return await pdfjs.getDocument(params).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') throw new PdfPasswordError(err.code);
    throw err;
  }
}

/** True when the document is readable without a password. */
export async function isEncrypted(bytes) {
  try {
    const doc = await openDocument(bytes);
    await destroyDoc(doc);
    return false;
  } catch (err) {
    if (err instanceof PdfPasswordError) return true;
    throw err;
  }
}

/**
 * pdf.js v6 removed PDFDocumentProxy.destroy(); teardown now lives on the
 * loading task (reachable as doc.loadingTask). Handle both shapes.
 */
export async function destroyDoc(doc) {
  try {
    if (!doc) return;
    if (typeof doc.loadingTask?.destroy === 'function') await doc.loadingTask.destroy();
    else if (typeof doc.destroy === 'function') await doc.destroy();
    else if (typeof doc.cleanup === 'function') doc.cleanup();
  } catch { /* already torn down */ }
}

export async function pdfMeta(doc) {
  let info = {};
  try { info = (await doc.getMetadata()).info || {}; } catch { /* not fatal */ }
  return {
    pageCount: doc.numPages,
    title: info.Title || '',
    author: info.Author || '',
    producer: info.Producer || '',
    encrypted: !!doc.encryption,
  };
}

/**
 * Render one page to an ImageData at the given DPI.
 * PDF user units are 1/72 inch, so scale = dpi / 72.
 */
export async function renderPage(doc, pageNumber, dpi = 150, maxPixels = 40e6) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let scale = dpi / 72;

  // guard against absurd canvases from huge pages at high dpi
  const pixels = (base.width * scale) * (base.height * scale);
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // JPEG has no alpha; paint white so text on transparent bg stays readable
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  page.cleanup();
  return { imageData, width: canvas.width, height: canvas.height, page };
}

export async function extractText(doc) {
  const parts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let line = '';
    const lines = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line.trim()); line = ''; }
      line += item.str;
      if (item.hasEOL) { lines.push(line.trim()); line = ''; }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    parts.push(`--- page ${i} ---\n${lines.filter(Boolean).join('\n')}`);
    page.cleanup();
  }
  return parts.join('\n\n');
}

/* ── compression ───────────────────────────────────────────────────────── */

/**
 * Lossless-ish: strip metadata and rewrite with object streams.
 * Text and vectors survive, so this is the safe default; savings are modest
 * because the content is untouched.
 */
export async function compressLossless(bytes) {
  const PDFLib = await getPdfLib();
  const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  stripMeta(doc);
  return new Blob([await doc.save({ useObjectStreams: true, addDefaultPage: false })], { type: 'application/pdf' });
}

function stripMeta(doc) {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
}

/**
 * Raster mode: re-render every page at `dpi` and rebuild the PDF from the
 * encoded images. Shrinks files dramatically but text is no longer
 * selectable or searchable — hence the explicit opt-in in the UI.
 */
export async function compressRaster(bytes, { dpi = 110, quality = 72, format = 'jpeg', password, onPage, shouldCancel } = {}) {
  const PDFLib = await getPdfLib();
  const doc = await openDocument(bytes, password);
  try {
    const out = await PDFLib.PDFDocument.create();
    for (let i = 1; i <= doc.numPages; i++) {
      if (shouldCancel && shouldCancel()) break;
      const { imageData, width, height } = await renderPage(doc, i, dpi);
      const blob = await encodeImage(imageData, format, quality);
      const buf = new Uint8Array(await blob.arrayBuffer());
      const img = format === 'png' ? await out.embedPng(buf) : await out.embedJpg(buf);
      // keep the original page box in points so the size on screen is unchanged
      const srcPage = await doc.getPage(i);
      const vp = srcPage.getViewport({ scale: 1 });
      const page = out.addPage([vp.width, vp.height]);
      page.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
      if (onPage) onPage(i, doc.numPages);
    }
    stripMetaNew(out);
    return new Blob([await out.save({ useObjectStreams: true })], { type: 'application/pdf' });
  } finally {
    await destroyDoc(doc);
  }
}

function stripMetaNew(doc) {
  doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
  doc.setKeywords([]); doc.setProducer(''); doc.setCreator('');
}

/**
 * Decrypt and save a readable copy. pdf-lib cannot re-save an encrypted
 * document, so this rasterises through pdf.js — the output is a new,
 * unencrypted PDF whose text is no longer selectable.
 */
export async function unlockPdf(bytes, { dpi = 150, quality = 85, password, onPage, shouldCancel } = {}) {
  return compressRaster(bytes, { dpi, quality, format: 'jpeg', password, onPage, shouldCancel });
}

/* ── structural page operations (lossless) ─────────────────────────────── */

const ROTATIONS = { 0: 0, 90: 90, 180: 180, 270: 270 };

/**
 * Merge several PDFs into one.
 * @param {Array<{name: string, bytes: ArrayBuffer}>} inputs
 */
export async function mergePdfs(inputs) {
  const PDFLib = await getPdfLib();
  const out = await PDFLib.PDFDocument.create();
  for (const item of inputs) {
    const src = await PDFLib.PDFDocument.load(item.bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  stripMetaNew(out);
  return new Blob([await out.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

/** Parse a page-selection string: "1-3,7,10-12" -> [0,1,2,6,9,10,11] */
export function parsePageRanges(spec, pageCount) {
  const wanted = [];
  const tokens = String(spec).split(',').map((s) => s.trim()).filter(Boolean);
  if (!tokens.length) return wanted;
  for (const token of tokens) {
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let start = parseInt(range[1], 10);
      let end = parseInt(range[2], 10);
      if (start > end) [start, end] = [end, start];
      for (let p = start; p <= end; p++) {
        if (p >= 1 && p <= pageCount) wanted.push(p - 1);
      }
    } else {
      const p = parseInt(token, 10);
      if (Number.isFinite(p) && p >= 1 && p <= pageCount) wanted.push(p - 1);
    }
  }
  return [...new Set(wanted)].sort((a, b) => a - b);
}

/**
 * Build a new PDF from selected pages of a source PDF.
 * @param {Array<number>} indices zero-based page indices
 * @param {object} opts rotate: number, remove: boolean
 */
export async function selectPages(bytes, indices, { rotate = 0, remove = false } = {}) {
  const PDFLib = await getPdfLib();
  const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFLib.PDFDocument.create();
  const all = src.getPageIndices();
  const keep = remove ? all.filter((i) => !indices.includes(i)) : indices;
  const copied = await out.copyPages(src, keep);
  for (const page of copied) {
    if (rotate) page.setRotation((page.getRotation().angle + ROTATIONS[rotate]) % 360);
    out.addPage(page);
  }
  stripMetaNew(out);
  return new Blob([await out.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

export async function rotatePdf(bytes, indices, degrees) {
  const PDFLib = await getPdfLib();
  const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const set = indices && indices.length ? new Set(indices) : null;
  for (const i of src.getPageIndices()) {
    if (set && !set.has(i)) continue;
    const page = src.getPage(i);
    page.setRotation((page.getRotation().angle + degrees) % 360);
  }
  stripMetaNew(src);
  return new Blob([await src.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

/** Rasterise selected (or all) pages to encoded images. */
/** Build one PDF from a set of encoded images, one page per image. */
export async function imagesToPdf(items, { marginPt = 0, fit = 'contain' } = {}) {
  const PDFLib = await getPdfLib();
  const doc = await PDFLib.PDFDocument.create();
  for (const item of items) {
    const bytes = new Uint8Array(await item.blob.arrayBuffer());
    const isPng = (item.blob.type || '').includes('png');
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    // A4 portrait unless the image is landscape, which flips to A4 landscape
    const landscape = img.width > img.height;
    const a4w = 595.28;
    const a4h = 841.89;
    const pw = landscape ? a4h : a4w;
    const ph = landscape ? a4w : a4h;
    const availW = pw - marginPt * 2;
    const availH = ph - marginPt * 2;
    const ratio = img.width / img.height;

    let w;
    let h;
    if (fit === 'fill') {
      w = availW;
      h = availH;
    } else {
      w = availW;
      h = w / ratio;
      if (h > availH) { h = availH; w = h * ratio; }
    }
    const page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  stripMetaNew(doc);
  return new Blob([await doc.save({ useObjectStreams: true })], { type: 'application/pdf' });
}

export async function pdfToImages(bytes, { dpi = 150, format = 'png', quality = 90, pages = null, password, onPage, shouldCancel } = {}) {
  const doc = await openDocument(bytes, password);
  const out = [];
  try {
    const list = pages && pages.length ? pages : Array.from({ length: doc.numPages }, (_, i) => i + 1);
    for (const pageNumber of list) {
      if (shouldCancel && shouldCancel()) break;
      const { imageData, width, height } = await renderPage(doc, pageNumber, dpi);
      const blob = await encodeImage(imageData, format, quality);
      out.push({ blob, width, height, page: pageNumber });
      if (onPage) onPage(pageNumber, doc.numPages);
    }
  } finally {
    await destroyDoc(doc);
  }
  return out;
}
