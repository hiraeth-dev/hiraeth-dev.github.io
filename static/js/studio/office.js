/* studio — Office handling.

   DOCX/XLSX/PPTX are ZIP containers of XML, so they can be read in-tab.
   What that buys us, honestly:
     docx  -> text / HTML / PDF / image   (mammoth; layout approximated)
     xlsx  -> CSV / HTML / PDF / image   (SheetJS)
     pptx  -> rejected with a clear message (no usable browser renderer)
   Legacy binary .doc/.xls/.ppt cannot be parsed in a browser at all. */

import { getMammoth, getXlsx, getFflate, extOf, ZIPLIKE_EXT } from './core.js';

export class UnsupportedFormat extends Error {
  constructor(message) { super(message); this.name = 'UnsupportedFormat'; }
}

/** Report what the studio can do with a given input, for the UI to show. */
export function capability(file) {
  const ext = extOf(file.name);
  if (ext === 'doc' || ext === 'rtf') {
    return { ok: false, reason: `Legacy .${ext} is a binary format browsers cannot read. Re-save it as .docx first.` };
  }
  if (ext === 'docx' || ext === 'odt') return { ok: true, via: 'mammoth', fidelity: 'approximate' };
  if (['xlsx', 'xls', 'ods', 'csv', 'tsv'].includes(ext)) return { ok: true, via: 'sheetjs', fidelity: 'approximate' };
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return { ok: false, reason: 'Slide decks have no reliable in-browser renderer, so .ppt/.pptx/.odp cannot be converted here.' };
  }
  if (ext === 'txt' || ext === 'md') return { ok: true, via: 'plaintext', fidelity: 'exact' };
  return { ok: false, reason: `No handler for .${ext}.` };
}

/* ── DOCX ──────────────────────────────────────────────────────────────── */

export async function docxToHtml(file) {
  const mammoth = await getMammoth();
  const { value, messages } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return { html: value, messages };
}

export async function docxToText(file) {
  const { html } = await docxToHtml(file);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

/* ── spreadsheets ──────────────────────────────────────────────────────── */

export async function sheetToRows(file) {
  const XLSX = await getXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }),
  }));
  return { sheets, workbook: wb };
}

export async function sheetToCsv(file, sheetIndex = 0) {
  const XLSX = await getXlsx();
  const { sheets, workbook } = await sheetToRows(file);
  const chosen = sheets[sheetIndex] || sheets[0];
  return XLSX.utils.sheet_to_csv(workbook.Sheets[chosen.name]);
}

export async function sheetToHtml(file, sheetIndex = 0) {
  const XLSX = await getXlsx();
  const { sheets, workbook } = await sheetToRows(file);
  const chosen = sheets[sheetIndex] || sheets[0];
  const table = XLSX.utils.sheet_to_html(workbook.Sheets[chosen.name], { header: '' });
  const title = escapeText(chosen.name);
  return `<h1>${title}</h1>${table}`;
}

/* ── zip-level recompression (compress tab) ────────────────────────────── */

/**
 * Strip obvious metadata and recompute the deflate stream. Office files
 * ship already-deflated, so expect single-digit percentages, not the 80%
 * you get from images. Embedded media is left alone.
 */
export async function recompressOffice(file, { level = 9, dropProps = true } = {}) {
  const ext = extOf(file.name);
  if (!ZIPLIKE_EXT.includes(ext)) {
    throw new UnsupportedFormat(`.${ext} is not a zip container, so it cannot be recompressed here.`);
  }
  const { unzipSync, zipSync } = await getFflate();
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));

  let dropped = 0;
  if (dropProps) {
    for (const key of Object.keys(entries)) {
      const base = key.split('/').pop();
      // core/app/custom properties carry author, revision history, edit times
      if (base === 'core.xml' || base === 'app.xml' || base === 'custom.xml') {
        delete entries[key];
        dropped++;
      }
    }
  }
  // mtime 0 is out of the zip epoch range; a fixed in-range stamp also makes
  // the output deterministic, which is what we want for reproducible rebuilds
  const out = zipSync(entries, { level, mtime: new Date('2000-01-01T00:00:00Z') });
  return { blob: new Blob([out], { type: file.type || 'application/octet-stream' }), dropped };
}

/* ── HTML layout + raster ──────────────────────────────────────────────── */

const PAGE_RATIO = 297 / 210; // A4 portrait, height / width
const MAX_CANVAS_PX = 16e6;    // stay well clear of browser canvas limits
const PROBE_H = 4000;
const MAX_CSS_H = 12000;

const DOC_CSS = `
  *{box-sizing:border-box}
  body{margin:0;padding:0}
  .page{padding:32px;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       color:#111;background:#fff;width:var(--w)px;overflow:hidden}
  table{border-collapse:collapse;width:100%;margin:8px 0}
  td,th{border:1px solid #bbb;padding:4px 7px;text-align:left;vertical-align:top}
  tr:nth-child(even){background:rgba(0,0,0,.04)}
  img{max-width:100%;height:auto}
  h1,h2,h3{margin:.6em 0 .3em;line-height:1.25}
  p{margin:.5em 0}
  ul,ol{margin:.5em 0;padding-left:1.4em}
`;

function svgUrlFor(inner, { width, height }) {
  const doc = `<style>:root{--w:${width}px}${DOC_CSS}</style>`
    + `<div class="page">${inner}</div>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;width:${width}px">${doc}</div>`
    + `</foreignObject></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not rasterise this document'));
    img.src = src;
  });
}

/** Scan upward for the last row that differs from the white page. */
function contentHeight(ctx, w, h) {
  const CHUNK = 64;
  for (let y = h; y > 0; y -= CHUNK) {
    const top = Math.max(0, y - CHUNK);
    const data = ctx.getImageData(0, top, w, y - top).data;
    for (let row = y - top - 1; row >= 0; row--) {
      const base = row * w;
      for (let x = 0; x < w; x++) {
        const i = (base + x) * 4;
        if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) return top + row + 1;
      }
    }
  }
  return h;
}

/** Lay the HTML out and measure its true content height. */
async function measureHtml(inner, width) {
  const probeImg = await loadImage(svgUrlFor(inner, { width, height: PROBE_H }));
  const probe = document.createElement('canvas');
  probe.width = width;
  probe.height = PROBE_H;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, width, PROBE_H);
  pctx.drawImage(probeImg, 0, 0, width, PROBE_H);
  const found = contentHeight(pctx, width, PROBE_H);
  probe.width = 0; probe.height = 0; // release the probe bitmap
  probeImg.src = '';

  if (found < PROBE_H - 2) return found;

  // the probe ran to its edge, so the document is taller: measure once more
  const tallImg = await loadImage(svgUrlFor(inner, { width, height: MAX_CSS_H }));
  const tall = document.createElement('canvas');
  tall.width = width;
  tall.height = MAX_CSS_H;
  const tctx = tall.getContext('2d', { willReadFrequently: true });
  tctx.fillStyle = '#fff';
  tctx.fillRect(0, 0, width, MAX_CSS_H);
  tctx.drawImage(tallImg, 0, 0, width, MAX_CSS_H);
  const tallH = contentHeight(tctx, width, MAX_CSS_H);
  tall.width = 0; tall.height = 0;
  tallImg.src = '';
  return tallH;
}

function blankCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Render laid-out HTML to a single trimmed canvas (one long image). */
export async function htmlToImage(inner, { width = 1240, scale = 2 } = {}) {
  const contentH = Math.max(1, await measureHtml(inner, width));
  let s = scale;
  while (width * contentH * s * s > MAX_CANVAS_PX && s > 1) s -= 0.25;

  const img = await loadImage(svgUrlFor(inner, { width, height: contentH }));
  const { canvas, ctx } = blankCanvas(Math.round(width * s), Math.round(contentH * s));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = '';
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  };
}

/* ── HTML -> paginated PDF ─────────────────────────────────────────────── */

/**
 * Raster PDF from laid-out HTML, sliced into A4 pages. Looks right; the
 * text is not selectable, which is inherent to this code path.
 */
export async function htmlToPdf(inner, { width = 1240, scale = 2, marginPt = 24 } = {}) {
  const contentH = Math.max(1, await measureHtml(inner, width));
  const pageCssH = Math.floor(width * PAGE_RATIO);
  const pages = Math.max(1, Math.ceil(contentH / pageCssH));

  let s = scale;
  while (width * pageCssH * s * s > MAX_CANVAS_PX && s > 1) s -= 0.25;

  const { getPdfLib } = await import('./core.js');
  const { encodeImage } = await import('./image.js');
  const PDFLib = await getPdfLib();
  const doc = await PDFLib.PDFDocument.create();

  const a4w = 595.28;
  const a4h = 841.89;
  const availW = a4w - marginPt * 2;
  const availH = a4h - marginPt * 2;

  const img = await loadImage(svgUrlFor(inner, { width, height: pages * pageCssH }));

  for (let i = 0; i < pages; i++) {
    const sliceCssH = Math.min(pageCssH, contentH - i * pageCssH);
    if (sliceCssH <= 0) break;
    const { canvas, ctx } = blankCanvas(Math.round(width * s), Math.round(sliceCssH * s));
    ctx.drawImage(
      img,
      0, Math.round(i * pageCssH * s), canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height,
    );
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const blob = await encodeImage(imageData, 'jpeg', 88);
    const embedded = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));

    const ratio = embedded.width / embedded.height;
    let w = availW;
    let h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }
    const page = doc.addPage([a4w, a4h]);
    page.drawImage(embedded, { x: (a4w - w) / 2, y: (a4h - h) / 2, width: w, height: h });
  }
  img.src = '';
  doc.setTitle(''); doc.setAuthor(''); doc.setProducer(''); doc.setCreator('');
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
