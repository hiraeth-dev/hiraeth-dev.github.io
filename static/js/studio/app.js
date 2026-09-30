/* studio — tab controller and UI wiring for the image/PDF tool. */

import {
  fmtSize, escapeHtml, extOf, changeExt, downloadBlob, zipFiles, stamp,
  kindOf, isPdf, isImage, runBatch, debounce,
} from './core.js';
import { decodeToImageData, encodeImage, resizeImageData, cropImageData, fitExact, targetSize, probeSize, PRESETS, toDecodable } from './image.js';
import {
  compressLossless, compressRaster, unlockPdf, mergePdfs, selectPages, rotatePdf,
  parsePageRanges, pdfToImages, imagesToPdf, extractText, openDocument, destroyDoc, isEncrypted, PdfPasswordError,
} from './pdf.js';
import {
  capability, docxToHtml, docxToText, sheetToCsv, sheetToHtml, sheetToRows,
  recompressOffice, htmlToImage, htmlToPdf, UnsupportedFormat,
} from './office.js';
import { createCropper, ASPECTS } from './crop.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  tab: 'compress',
  files: [],
  results: [],
  running: false,
  cancel: false,
  cropper: null,
  cropTarget: 0,     // index into the image-only list
  cropBox: null,
  lastPdfPages: 0,
  password: '',
};

/* ── boot ──────────────────────────────────────────────────────────────── */

function init() {
  wireTabs();
  wireDropzone();
  wireQueue();
  wireCompress();
  wireConvert();
  wireImage();
  wireRun();
  renderQueue();
  syncTab();
}

const TABS = {
  compress: { label: 'compress', run: 'compress' },
  convert: { label: 'convert', run: 'convert' },
  image: { label: 'image', run: 'resize' },
};

function wireTabs() {
  for (const btn of document.querySelectorAll('.studio-tab')) {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      for (const b of document.querySelectorAll('.studio-tab')) {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      clearResults();
      syncTab();
    });
  }
}

function syncTab() {
  for (const key of Object.keys(TABS)) {
    const panel = document.getElementById(`panel-${key}`);
    if (panel) panel.hidden = key !== state.tab;
  }
  const run = $('#studio-run');
  if (run) {
    // never stomp the in-flight "working…" label
    if (!state.running) run.textContent = TABS[state.tab].run;
    run.disabled = state.files.length === 0 || state.running;
  }
  const hint = $('#studio-hint');
  if (hint) hint.textContent = tabHint();
  updateAccept();
  renderQueue();
  // panels derive their controls from what is in the queue, so refresh all of
  // them whenever the queue or the active tab changes
  syncCompress();
  syncConvert();
  syncImage();
  // a tab with no work for it should say so rather than offering a dead button
  // (only the active tab's note, so the panel does not stack three messages)
  for (const key of Object.keys(TABS)) {
    const note = document.getElementById(`note-${key}`);
    if (note) note.hidden = key !== state.tab || !emptyFor(key);
  }
}

/** Does the current queue contain anything the given tab can act on? */
function emptyFor(key) {
  const c = countKinds();
  const images = state.files.filter(isImage).length;
  if (key === 'compress') return !(c.image || c.pdf || c.office);
  if (key === 'image') return images === 0;
  if (key === 'convert') return !dominantKind();
  return state.files.length === 0;
}

function tabHint() {
  const counts = countKinds();
  if (!state.files.length) return 'drop files, or browse — nothing leaves this tab';
  const bits = [];
  if (counts.image) bits.push(`${counts.image} image${counts.image > 1 ? 's' : ''}`);
  if (counts.pdf) bits.push(`${counts.pdf} pdf${counts.pdf > 1 ? 's' : ''}`);
  if (counts.office) bits.push(`${counts.office} office`);
  if (counts.unsupported) bits.push(`${counts.unsupported} unsupported`);
  return bits.join(' · ');
}

function countKinds() {
  const c = { image: 0, pdf: 0, office: 0, unsupported: 0, other: 0 };
  for (const f of state.files) {
    const k = kindOf(f);
    if (k === 'image') c.image++;
    else if (k === 'pdf') c.pdf++;
    else if (k === 'doc' || k === 'sheet' || k === 'deck') c.office++;
    else c.unsupported++;
  }
  return c;
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.svg,.heic,.heif,.tif,.tiff,'
  + '.docx,.odt,.doc,.rtf,.txt,.md,.xlsx,.xls,.ods,.csv,.tsv,.pptx,.ppt,.odp';

function updateAccept() {
  const input = $('#studio-input');
  if (input) input.setAttribute('accept', ACCEPT);
}

/* ── dropzone + queue ──────────────────────────────────────────────────── */

function wireDropzone() {
  const drop = $('#studio-drop');
  const input = $('#studio-input');
  if (!drop || !input) return;

  input.addEventListener('change', (e) => { addFiles(e.target.files); input.value = ''; });
  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-active'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-active'); });
  }
  drop.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
}

function addFiles(list) {
  for (const f of list) {
    // de-duplicate by name+size so re-dropping the same folder is harmless
    if (state.files.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) continue;
    state.files.push(f);
  }
  clearResults();
  renderQueue();
  syncTab();
  // thumbnails and encryption probes are async; refresh as they land
  renderThumbs();
  probeEncryption();
}

function wireQueue() {
  const clear = $('#studio-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      state.files = [];
      clearResults();
      renderQueue();
      syncTab();
    });
  }
}

const KIND_ICON = { image: '🖼', pdf: '📕', sheet: '📊', deck: '📽', doc: '📄', other: '❔' };

function renderQueue() {
  const host = $('#studio-queue');
  if (!host) return;
  host.innerHTML = '';
  for (const f of state.files) {
    const kind = kindOf(f);
    const cap = kind === 'doc' || kind === 'sheet' || kind === 'deck' ? capability(f) : null;
    const row = document.createElement('div');
    row.className = 'studio-qrow';
    if (cap && !cap.ok) row.classList.add('is-unsupported');
    row.dataset.name = f.name;
    row.innerHTML = `
      <span class="studio-qthumb" data-thumb></span>
      <span class="studio-qicon" aria-hidden="true">${KIND_ICON[kind] || '❔'}</span>
      <span class="studio-qname">${escapeHtml(f.name)}</span>
      <span class="studio-qsize">${fmtSize(f.size)}</span>
      <button class="studio-qremove" type="button" aria-label="remove ${escapeHtml(f.name)}">✕</button>`;
    row.querySelector('.studio-qremove').addEventListener('click', () => {
      state.files = state.files.filter((x) => x !== f);
      clearResults();
      renderQueue();
      syncTab();
    });
    host.appendChild(row);
  }
  const count = $('#studio-count');
  if (count) count.textContent = state.files.length ? `${state.files.length} file${state.files.length > 1 ? 's' : ''}` : '';
}

async function renderThumbs() {
  const host = $('#studio-queue');
  if (!host) return;
  const images = state.files.filter((f) => isImage(f) || extOf(f.name) === 'pdf');
  for (const f of images.slice(0, 24)) {
    const row = [...host.children].find((r) => r.dataset.name === f.name);
    const slot = row?.querySelector('[data-thumb]');
    if (!slot) continue;
    try {
      let url;
      if (extOf(f.name) === 'pdf') {
        const { getPdfjs, CDN } = await import('./core.js');
        const pdfjs = await getPdfjs();
        pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
        const page = await doc.getPage(1);
        const vp = page.getViewport({ scale: 0.18 });
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.floor(vp.width));
        c.height = Math.max(1, Math.floor(vp.height));
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        url = c.toDataURL('image/jpeg', 0.7);
        page.cleanup();
        await destroyDoc(doc);
      } else {
        url = URL.createObjectURL(await toDecodable(f));
      }
      slot.style.backgroundImage = `url(${url})`;
      slot.classList.add('has-thumb');
    } catch { /* thumbnail is best-effort */ }
  }
}

/* ── results ───────────────────────────────────────────────────────────── */

function clearResults() {
  state.results = [];
  const host = $('#studio-results');
  if (host) host.innerHTML = '';
}

function setBusy(on, label) {
  state.running = on;
  const run = $('#studio-run');
  const cancel = $('#studio-cancel');
  const status = $('#studio-status');
  if (run) { run.disabled = on || state.files.length === 0; run.textContent = on ? 'working…' : TABS[state.tab].run; }
  if (cancel) cancel.hidden = !on;
  if (status) status.textContent = label || '';
}

function addResultRow({ name, before, after, blob, note, error }) {
  const host = $('#studio-results');
  if (!host) return;
  const row = document.createElement('div');
  row.className = 'studio-result' + (error ? ' is-error' : '');
  const ratio = blob && before ? `${((blob.size / before) * 100).toFixed(1)}%` : '';
  const delta = blob && before ? blob.size - before : 0;
  const deltaTxt = delta === 0 ? '' : ` (${delta > 0 ? '+' : ''}${fmtSize(Math.abs(delta))})`;
  row.innerHTML = `
    <span class="studio-rname">${escapeHtml(name)}</span>
    <span class="studio-rbefore">${before ? fmtSize(before) : ''}</span>
    <span class="studio-rarrow">→</span>
    <span class="studio-rafter">${error ? escapeHtml(error) : fmtSize(after) + (ratio ? ` <em>${ratio}${deltaTxt}</em>` : '')}</span>
    ${note ? `<span class="studio-rnote">${escapeHtml(note)}</span>` : ''}`;
  if (blob) {
    // kept on the node so the blob can be re-read without re-running the job
    row.__blob = blob;
    const a = document.createElement('button');
    a.className = 'studio-rdl';
    a.type = 'button';
    a.textContent = 'download';
    a.addEventListener('click', () => downloadBlob(blob, name));
    row.appendChild(a);
    state.results.push({ name, blob });
  }
  host.appendChild(row);
}

function renderDownloadAll() {
  const host = $('#studio-results');
  if (!host || !state.results.length) return;
  if (host.querySelector('.studio-dlall')) return;
  const wrap = document.createElement('div');
  wrap.className = 'studio-dlall';
  if (state.results.length > 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'studio-btn';
    btn.textContent = `download all (${state.results.length} files, .zip)`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'zipping…';
      try {
        const zip = await zipFiles(state.results, 'studio');
        downloadBlob(zip, `studio-${stamp()}.zip`);
      } finally {
        btn.disabled = false;
        btn.textContent = `download all (${state.results.length} files, .zip)`;
      }
    });
    wrap.appendChild(btn);
  }
  host.appendChild(wrap);
}

/* ── shared run plumbing ───────────────────────────────────────────────── */

function wireCancel() {
  const cancel = $('#studio-cancel');
  if (cancel) cancel.addEventListener('click', () => { state.cancel = true; });
}

const shouldCancel = () => state.cancel;

/* ── tab: compress ─────────────────────────────────────────────────────── */

function wireCompress() {
  const mode = $('#cmp-mode');
  if (mode) mode.addEventListener('change', syncCompress);
  const fmt = $('#cmp-format');
  if (fmt) fmt.addEventListener('change', () => { $('#cmp-quality-row').hidden = fmt.value === 'png'; });
  const quality = $('#cmp-quality');
  if (quality) {
    quality.addEventListener('input', () => { $('#cmp-quality-val').textContent = `${quality.value}%`; });
  }
  const dpi = $('#cmp-dpi');
  if (dpi) dpi.addEventListener('change', syncCompress);
  const dim = $('#cmp-maxdim');
  if (dim) dim.addEventListener('input', () => { $('#cmp-maxdim-val').textContent = dim.value ? `${dim.value}px` : 'none'; });
  syncCompress();
}

function syncCompress() {
  const mode = $('#cmp-mode')?.value || 'auto';
  const raster = $('#cmp-raster-row');
  if (raster) raster.hidden = !(mode === 'pdf' || (mode === 'auto' && countKinds().pdf && !countKinds().image));
  const rasterOn = raster && !raster.hidden && $('#cmp-raster')?.checked;
  const dpiRow = $('#cmp-dpi-row');
  if (dpiRow) dpiRow.hidden = !rasterOn;
  const warn = $('#cmp-raster-warn');
  if (warn) warn.hidden = !rasterOn;
  const maxRow = $('#cmp-maxdim-row');
  if (maxRow) maxRow.hidden = !['image', 'auto'].includes(mode);
}

async function runCompress() {
  const mode = $('#cmp-mode').value;
  const format = $('#cmp-format').value;
  const quality = parseInt($('#cmp-quality').value, 10);
  const maxDim = parseInt($('#cmp-maxdim').value, 10) || 0;
  const raster = $('#cmp-raster').checked;
  const dpi = parseInt($('#cmp-dpi').value, 10);
  const password = state.password;

  const pick = (f) => {
    if (mode === 'auto') return true;
    const k = kindOf(f);
    if (mode === 'image') return k === 'image';
    if (mode === 'pdf') return k === 'pdf';
    if (mode === 'office') return k === 'doc' || k === 'sheet' || k === 'deck';
    return true;
  };
  const queue = state.files.filter(pick);
  if (!queue.length) return;

  setBusy(true, `compressing ${queue.length} file${queue.length > 1 ? 's' : ''}…`);

  await runBatch(queue, async (file) => {
    const k = kindOf(file);
    if (k === 'image') {
      let data = await decodeToImageData(file);
      if (maxDim) {
        const t = targetSize({ width: data.width, height: data.height }, { mode: 'longest', value: maxDim });
        data = await resizeImageData(data, t.width, t.height);
      }
      const fmt = format === 'original' ? (extOf(file.name) === 'png' ? 'png' : extOf(file.name) === 'webp' ? 'webp' : 'jpeg') : format;
      const blob = await encodeImage(data, fmt, quality);
      const name = changeExt(file.name, fmt === 'jpeg' ? 'jpg' : fmt);
      addResultRow({ name, before: file.size, after: blob.size, blob });
      return { name, blob };
    }
    if (k === 'pdf') {
      const blob = raster
        ? await compressRaster(await file.arrayBuffer(), { dpi, quality, password, shouldCancel })
        : await compressLossless(await file.arrayBuffer());
      addResultRow({
        name: file.name, before: file.size, after: blob.size, blob,
        note: raster ? 'rasterised — text not selectable' : 'metadata stripped',
      });
      return { name: file.name, blob };
    }
    const { blob, dropped } = await recompressOffice(file);
    addResultRow({
      name: file.name, before: file.size, after: blob.size, blob,
      note: dropped ? `${dropped} metadata part${dropped > 1 ? 's' : ''} removed` : 'repacked',
    });
    return { name: file.name, blob };
  }, {
    onItem: (out, i, err) => {
      if (err) {
        const name = queue[i]?.name || 'file';
        const msg = err instanceof UnsupportedFormat ? err.message : (err?.message || 'failed');
        addResultRow({ name, before: queue[i]?.size, after: 0, error: msg });
      }
    },
    onDone: () => { setBusy(false); renderDownloadAll(); },
  });
}

/* ── tab: convert ──────────────────────────────────────────────────────── */

const TARGETS = {
  image: [
    ['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP'], ['avif', 'AVIF'], ['pdf', 'PDF'],
  ],
  pdf: [
    ['png', 'PNG images'], ['jpeg', 'JPEG images'], ['webp', 'WebP images'],
    ['txt', 'Plain text'], ['pdf', 'PDF (page tools)'],
  ],
  doc: [['txt', 'Plain text'], ['html', 'HTML'], ['pdf', 'PDF'], ['png', 'PNG image']],
  sheet: [['csv', 'CSV'], ['html', 'HTML'], ['pdf', 'PDF'], ['png', 'PNG image']],
  deck: [],
};

const KIND_TO_SOURCE = { image: 'image', pdf: 'pdf', doc: 'doc', sheet: 'sheet', deck: 'deck' };

function dominantKind() {
  const c = countKinds();
  if (c.pdf && !c.image) return 'pdf';
  if (c.image && !c.pdf) return 'image';
  if (c.image) return 'image';
  if (c.office) {
    const first = state.files.find((f) => ['doc', 'sheet', 'deck'].includes(kindOf(f)));
    return first ? kindOf(first) : 'doc';
  }
  return null;
}

function wireConvert() {
  const sel = $('#cv-target');
  if (sel) sel.addEventListener('change', syncConvert);
  const op = $('#cv-op');
  if (op) op.addEventListener('change', syncConvert);
  const pw = $('#cv-password');
  if (pw) pw.addEventListener('input', () => { state.password = pw.value; });
  syncConvert();
}

/**
 * PDFs may be encrypted, in which case every pdf.js call needs the password
 * and pdf-lib cannot touch them at all. Detect it once per file and surface a
 * single password field rather than failing opaquely mid-run.
 */
async function probeEncryption() {
  const queue = state.files.filter(isPdf);
  const lockedFiles = [];
  const rows = [...($('#studio-queue')?.children || [])];
  for (const f of queue) {
    const row = rows.find((r) => r.dataset.name === f.name);
    if (row?.dataset.locked === '1') { lockedFiles.push(f); continue; }
    try {
      const locked = await isEncrypted(await f.arrayBuffer());
      if (row) row.dataset.locked = locked ? '1' : '0';
      if (locked) {
        lockedFiles.push(f);
        row?.classList.add('is-locked');
        const note = document.createElement('span');
        note.className = 'studio-qlock';
        note.textContent = 'locked';
        row.appendChild(note);
      }
    } catch { /* probing is best-effort */ }
  }
  const row = $('#cv-password-row');
  if (row) row.hidden = lockedFiles.length === 0;
  const label = $('#cv-password-label');
  if (label) {
    label.textContent = lockedFiles.length
      ? `password for ${lockedFiles.length} encrypted pdf${lockedFiles.length > 1 ? 's' : ''}`
      : 'pdf password';
  }
  const hint = $('#cv-locked-hint');
  if (hint) hint.hidden = lockedFiles.length === 0;
  return lockedFiles;
}

function syncConvert() {
  const src = dominantKind();
  const sel = $('#cv-target');
  const hint = $('#cv-hint');
  const opts = src ? (TARGETS[KIND_TO_SOURCE[src]] || []) : [];

  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '';
    if (!opts.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = src === 'deck' ? 'unsupported' : 'add files first';
      sel.appendChild(o);
      sel.disabled = true;
    } else {
      for (const [value, label] of opts) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        sel.appendChild(o);
      }
      sel.disabled = false;
      if (opts.some(([v]) => v === prev)) sel.value = prev;
    }
  }

  const isPdfTools = src === 'pdf' && sel?.value === 'pdf';
  const target = sel?.value;
  const op = $('#cv-op')?.value || 'extract';

  const row = $('#cv-pagetools');
  if (row) row.hidden = !isPdfTools;
  const opRow = $('#cv-op-row');
  if (opRow) opRow.hidden = !isPdfTools;
  const rotateRow = $('#cv-rotate-row');
  if (rotateRow) rotateRow.hidden = !(isPdfTools && op === 'rotate');
  const rangeRow = $('#cv-range-row');
  if (rangeRow) {
    rangeRow.hidden = !isPdfTools || !['extract', 'delete', 'rotate'].includes(op);
  }
  if (rangeRow && isPdfTools) {
    const label = $('#cv-range-label');
    if (label) {
      label.textContent = {
        extract: 'keep pages',
        delete: 'remove pages',
        rotate: 'rotate pages',
      }[op] || 'pages';
    }
  }

  // dpi only matters when rasterising pdf pages to images
  const dpiRow = $('#cv-dpi-row');
  if (dpiRow) dpiRow.hidden = !(src === 'pdf' && ['png', 'jpeg', 'webp'].includes(target));

  // quality only matters for raster output
  const qRow = $('#cv-quality-row');
  if (qRow) qRow.hidden = !['png', 'jpeg', 'webp', 'avif'].includes(target);

  const sheetRow = $('#cv-sheet-row');
  if (sheetRow) sheetRow.hidden = src !== 'sheet';
  if (sheetRow && src === 'sheet') fillSheetList();

  if (hint) {
    hint.textContent = !src
      ? 'drop images, a pdf, or a word/excel file'
      : src === 'deck'
        ? 'slide decks (.ppt/.pptx/.odp) have no in-browser renderer — not supported'
        : `${opts.length} target${opts.length === 1 ? '' : 's'} available for ${src}`;
  }
}

async function fillSheetList() {
  const sel = $('#cv-sheet');
  if (!sel || sel.dataset.filled === '1') return;
  const file = state.files.find((f) => kindOf(f) === 'sheet');
  if (!file) return;
  sel.dataset.filled = '1';
  try {
    const { sheets } = await sheetToRows(file);
    for (const s of sheets) {
      const o = document.createElement('option');
      o.value = String(sheets.indexOf(s));
      o.textContent = `${s.name} (${s.rows.length} rows)`;
      sel.appendChild(o);
    }
  } catch (err) {
    sel.dataset.filled = '0';
    const o = document.createElement('option');
    o.textContent = 'could not read';
    sel.appendChild(o);
  }
}

async function runConvert() {
  const src = dominantKind();
  const target = $('#cv-target').value;
  if (!src || !target) return;

  const dpi = parseInt($('#cv-dpi').value, 10) || 150;
  const quality = parseInt($('#cv-quality').value, 10) || 90;
  const op = $('#cv-op')?.value || 'extract';
  const rangeSpec = $('#cv-range')?.value || '';
  const rotateDeg = parseInt($('#cv-rotate')?.value, 10) || 90;
  const sheetIndex = parseInt($('#cv-sheet')?.value, 10) || 0;
  const password = state.password;

  if (src === 'image') return convertImages(target, quality);
  if (src === 'pdf') return convertPdfs(target, { dpi, quality, op, rangeSpec, rotateDeg, password });
  if (src === 'doc') return convertDocs(target);
  if (src === 'sheet') return convertSheets(target, sheetIndex);
}

async function convertImages(target, quality) {
  const queue = state.files.filter(isImage);
  if (!queue.length) return;

  if (target === 'pdf') {
    setBusy(true, 'building pdf…');
    try {
      const items = [];
      for (const f of queue) {
        const data = await decodeToImageData(f);
        const blob = await encodeImage(data, 'jpeg', 92);
        items.push({ blob });
      }
      const blob = await imagesToPdf(items);
      const name = 'images.pdf';
      const total = queue.reduce((a, f) => a + f.size, 0);
      addResultRow({ name, before: total, after: blob.size, blob, note: `${queue.length} pages` });
      state.results.push({ name, blob });
      renderDownloadAll();
    } catch (err) {
      addResultRow({ name: 'images.pdf', error: err.message });
    } finally {
      setBusy(false);
    }
    return;
  }

  setBusy(true, `converting ${queue.length} image${queue.length > 1 ? 's' : ''}…`);
  await runBatch(queue, async (file) => {
    const data = await decodeToImageData(file);
    const blob = await encodeImage(data, target, quality);
    const name = changeExt(file.name, target === 'jpeg' ? 'jpg' : target);
    addResultRow({ name, before: file.size, after: blob.size, blob });
    return { name, blob };
  }, {
    onItem: (out, i, err) => {
      if (err) addResultRow({ name: queue[i]?.name, before: queue[i]?.size, error: err.message });
    },
    onDone: () => { setBusy(false); renderDownloadAll(); },
  });
}

async function convertPdfs(target, { dpi, quality, op, rangeSpec, rotateDeg, password }) {
  const queue = state.files.filter(isPdf);
  if (!queue.length) return;

  if (target === 'txt') {
    setBusy(true, 'extracting text…');
    try {
      for (const f of queue) {
        const doc = await openDocument(await f.arrayBuffer(), password);
        const text = await extractText(doc);
        await destroyDoc(doc);
        const blob = new Blob([text], { type: 'text/plain' });
        const name = changeExt(f.name, 'txt');
        addResultRow({ name, before: f.size, after: blob.size, blob });
        state.results.push({ name, blob });
      }
      renderDownloadAll();
    } catch (err) {
      addResultRow({ name: queue[0]?.name, error: errMessage(err) });
    } finally {
      setBusy(false);
    }
    return;
  }

  if (target === 'pdf') {
    setBusy(true, op === 'merge' ? 'merging…' : 'rebuilding…');
    try {
      if (op === 'merge') {
        const inputs = [];
        for (const f of queue) inputs.push({ name: f.name, bytes: await f.arrayBuffer() });
        const blob = await mergePdfs(inputs);
        const name = 'merged.pdf';
        const total = queue.reduce((a, f) => a + f.size, 0);
        addResultRow({ name, before: total, after: blob.size, blob, note: `${queue.length} files` });
        state.results.push({ name, blob });
      } else {
        for (const f of queue) {
          const bytes = await f.arrayBuffer();
          let blob;
          let note = '';
          if (op === 'extract') {
            const doc = await openDocument(bytes, password);
            const count = doc.numPages;
            await destroyDoc(doc);
            state.lastPdfPages = count;
            const idx = parsePageRanges(rangeSpec, count);
            if (!idx.length) throw new Error('no pages matched that range');
            blob = await selectPages(bytes, idx, {});
            note = `${idx.length} of ${count} pages`;
          } else if (op === 'delete') {
            const doc = await openDocument(bytes, password);
            const count = doc.numPages;
            await destroyDoc(doc);
            const idx = parsePageRanges(rangeSpec, count);
            blob = await selectPages(bytes, idx, { remove: true });
            note = `${idx.length} page${idx.length === 1 ? '' : 's'} removed`;
          } else if (op === 'rotate') {
            const doc = await openDocument(bytes, password);
            const count = doc.numPages;
            await destroyDoc(doc);
            const idx = parsePageRanges(rangeSpec, count);
            blob = await rotatePdf(bytes, idx.length ? idx : null, rotateDeg);
            note = idx.length ? `${idx.length} page${idx.length === 1 ? '' : 's'} rotated` : 'all pages rotated';
          } else if (op === 'unlock') {
            if (!password) throw new Error('enter the PDF password first');
            blob = await unlockPdf(bytes, { dpi: 150, quality: 88, password, shouldCancel });
            note = 'decrypted — rasterised, text not selectable';
          } else {
            blob = await compressLossless(bytes);
            note = 'metadata stripped';
          }
          const name = changeExt(f.name, 'pdf');
          addResultRow({ name, before: f.size, after: blob.size, blob, note });
          state.results.push({ name, blob });
        }
      }
      renderDownloadAll();
    } catch (err) {
      addResultRow({ name: queue[0]?.name, error: errMessage(err) });
    } finally {
      setBusy(false);
    }
    return;
  }

  // pdf -> images
  setBusy(true, 'rendering pages…');
  try {
    for (const f of queue) {
      const out = await pdfToImages(await f.arrayBuffer(), {
        dpi, format: target, quality, password, shouldCancel,
      });
      for (const item of out) {
        const name = changeExt(`${f.name.replace(/\.pdf$/i, '')}-p${String(item.page).padStart(3, '0')}`, target === 'jpeg' ? 'jpg' : target);
        addResultRow({
          name, before: 0, after: item.blob.size, blob: item.blob,
          note: `${item.width}×${item.height}`,
        });
        state.results.push({ name, blob: item.blob });
      }
    }
    renderDownloadAll();
  } catch (err) {
    addResultRow({ name: queue[0]?.name, error: errMessage(err) });
  } finally {
    setBusy(false);
  }
}

async function convertDocs(target) {
  const queue = state.files.filter((f) => kindOf(f) === 'doc');
  if (!queue.length) return;
  setBusy(true, `converting ${queue.length} document${queue.length > 1 ? 's' : ''}…`);
  try {
    for (const f of queue) {
      const cap = capability(f);
      if (!cap.ok) { addResultRow({ name: f.name, before: f.size, error: cap.reason }); continue; }
      let blob;
      if (extOf(f.name) === 'txt' || extOf(f.name) === 'md') {
        blob = new Blob([await f.text()], { type: 'text/plain' });
      } else if (target === 'txt') {
        blob = new Blob([await docxToText(f)], { type: 'text/plain' });
      } else {
        const { html } = await docxToHtml(f);
        if (target === 'html') blob = new Blob([html], { type: 'text/html' });
        else if (target === 'pdf') blob = await htmlToPdf(html);
        else {
          const { imageData } = await htmlToImage(html);
          blob = await encodeImage(imageData, 'png', 100);
        }
      }
      const ext = target === 'jpeg' ? 'jpg' : target;
      const name = changeExt(f.name, ext);
      addResultRow({ name, before: f.size, after: blob.size, blob, note: cap.fidelity });
      state.results.push({ name, blob });
    }
    renderDownloadAll();
  } finally {
    setBusy(false);
  }
}

async function convertSheets(target, sheetIndex) {
  const queue = state.files.filter((f) => kindOf(f) === 'sheet');
  if (!queue.length) return;
  setBusy(true, 'converting…');
  try {
    for (const f of queue) {
      let blob;
      if (target === 'csv') blob = new Blob([await sheetToCsv(f, sheetIndex)], { type: 'text/csv' });
      else {
        const html = await sheetToHtml(f, sheetIndex);
        if (target === 'html') blob = new Blob([html], { type: 'text/html' });
        else if (target === 'pdf') blob = await htmlToPdf(html);
        else {
          const { imageData } = await htmlToImage(html);
          blob = await encodeImage(imageData, 'png', 100);
        }
      }
      const name = changeExt(f.name, target === 'jpeg' ? 'jpg' : target);
      addResultRow({ name, before: f.size, after: blob.size, blob, note: 'approximate' });
      state.results.push({ name, blob });
    }
    renderDownloadAll();
  } catch (err) {
    addResultRow({ name: queue[0]?.name, error: errMessage(err) });
  } finally {
    setBusy(false);
  }
}

function errMessage(err) {
  if (err instanceof PdfPasswordError) return err.message;
  if (err instanceof UnsupportedFormat) return err.message;
  return err?.message || 'failed';
}

/* ── tab: image ────────────────────────────────────────────────────────── */

function wireImage() {
  const mode = $('#img-mode');
  if (mode) mode.addEventListener('change', syncImage);

  const preset = $('#img-preset');
  if (preset) {
    for (const p of PRESETS) {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.label;
      preset.appendChild(o);
    }
    preset.addEventListener('change', () => {
      if (preset.value) {
        if (mode) mode.value = 'exact';
        syncImage();
      }
    });
  }

  const aspect = $('#img-aspect');
  const cropAspect = $('#img-aspect-crop');
  // two independent aspect selects: one for the exact-size box, one for the cropper
  for (const sel of [aspect, cropAspect]) {
    if (!sel) continue;
    for (const key of Object.keys(ASPECTS)) {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = key;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (sel === cropAspect) state.cropper?.setAspect(sel.value);
      else previewDims();
    });
  }

  for (const id of ['#img-w', '#img-h', '#img-pct', '#img-longest', '#img-dpi']) {
    const el = $(id);
    if (el) el.addEventListener('input', debounce(() => previewDims(), 120));
  }

  const fit = $('#img-fit');
  if (fit) fit.addEventListener('change', () => previewDims());

  const enableCrop = $('#img-crop-enable');
  if (enableCrop) {
    enableCrop.addEventListener('change', () => {
      const wrap = $('#studio-crop-wrap');
      if (wrap) wrap.hidden = !enableCrop.checked;
      if (enableCrop.checked) mountCropper(); else teardownCropper();
    });
  }

  const pick = $('#img-pick');
  if (pick) pick.addEventListener('change', () => { state.cropTarget = parseInt(pick.value, 10) || 0; mountCropper(); });

  for (const id of ['#img-crop-x', '#img-crop-y', '#img-crop-w', '#img-crop-h']) {
    const el = $(id);
    if (el) {
      el.addEventListener('change', () => {
        const b = {
          x: parseInt($('#img-crop-x').value, 10) || 0,
          y: parseInt($('#img-crop-y').value, 10) || 0,
          width: parseInt($('#img-crop-w').value, 10) || 1,
          height: parseInt($('#img-crop-h').value, 10) || 1,
        };
        state.cropper?.setBox(b);
      });
    }
  }

  const q = $('#img-quality');
  if (q) q.addEventListener('input', () => { $('#img-quality-val').textContent = `${q.value}%`; });
  syncImage();
}

function syncImage() {
  const mode = $('#img-mode')?.value || 'percent';
  const rows = {
    '#img-w-row': mode === 'width',
    '#img-h-row': mode === 'height',
    '#img-pct-row': mode === 'percent',
    '#img-longest-row': mode === 'longest',
    '#img-dpi-row': mode === 'dpi',
    '#img-exact-row': mode === 'exact',
  };
  for (const [sel, show] of Object.entries(rows)) {
    const el = $(sel);
    if (el) el.hidden = !show;
  }
  const qrow = $('#img-quality-row');
  if (qrow) qrow.hidden = $('#img-format')?.value === 'png';
  const fitRow = $('#img-fit-row');
  if (fitRow) fitRow.hidden = mode !== 'exact';
  buildPickList();
  previewDims();
}

function buildPickList() {
  const pick = $('#img-pick');
  if (!pick) return;
  const imgs = state.files.filter(isImage);
  const prev = pick.value;
  pick.innerHTML = '';
  imgs.forEach((f, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = f.name;
    pick.appendChild(o);
  });
  pick.disabled = imgs.length < 2;
  if (imgs.length) {
    const idx = Math.min(parseInt(prev, 10) || 0, imgs.length - 1);
    pick.value = String(idx);
    state.cropTarget = idx;
  }
}

function currentResizeSpec() {
  const mode = $('#img-mode')?.value || 'percent';
  const num = (id, dflt) => parseInt($(id)?.value, 10) || dflt;
  const aspectSel = $('#img-aspect')?.value || 'free';
  const aspectMap = { '1:1': { w: 1, h: 1 }, '4:3': { w: 4, h: 3 }, '3:4': { w: 3, h: 4 }, '16:9': { w: 16, h: 9 }, '9:16': { w: 9, h: 16 }, '3:2': { w: 3, h: 2 }, '2:3': { w: 2, h: 3 } };
  const presetId = $('#img-preset')?.value;
  const preset = PRESETS.find((p) => p.id === presetId);
  return {
    mode,
    value: mode === 'width' ? num('#img-w', 1920)
      : mode === 'height' ? num('#img-h', 1080)
      : mode === 'percent' ? num('#img-pct', 50)
      : mode === 'longest' ? num('#img-longest', 1920)
      : mode === 'dpi' ? num('#img-dpi', 300)
      : 0,
    aspect: mode === 'exact'
      ? (preset ? { w: preset.w, h: preset.h } : (aspectMap[aspectSel] || null))
      : null,
    fit: $('#img-fit')?.value || 'contain',
  };
}

const previewDims = debounce(async function previewDimsImpl() {
  const out = $('#img-out-dims');
  if (!out || !state.files.length) return;
  const imgs = state.files.filter(isImage);
  if (!imgs.length) { out.textContent = ''; return; }
  const f = imgs[Math.min(state.cropTarget, imgs.length - 1)];
  try {
    const size = await probeSize(f);
    const t = targetSize(size, currentResizeSpec());
    const cropOn = $('#img-crop-enable')?.checked && state.cropBox;
    const w = cropOn ? Math.round(state.cropBox.width * (t.width / size.width)) : t.width;
    const h = cropOn ? Math.round(state.cropBox.height * (t.height / size.height)) : t.height;
    out.textContent = `${f.name}: ${size.width}×${size.height} → ${w}×${h}`;
  } catch {
    out.textContent = '';
  }
}, 120);

function mountCropper() {
  teardownCropper();
  const host = $('#studio-crop');
  if (!host) return;
  const imgs = state.files.filter(isImage);
  if (!imgs.length) return;
  const file = imgs[Math.min(state.cropTarget, imgs.length - 1)];

  const cropper = createCropper(host, {
    onChange: (box) => {
      state.cropBox = box;
      $('#img-crop-x').value = box.x;
      $('#img-crop-y').value = box.y;
      $('#img-crop-w').value = box.width;
      $('#img-crop-h').value = box.height;
      previewDims();
    },
  });
  state.cropper = cropper;
  cropper.setAspect($('#img-aspect-crop')?.value || 'free');

  decodeToImageData(file)
    .then((data) => {
      if (state.cropper === cropper) cropper.setImage(data);
    })
    .catch(() => { /* preview only */ });
}

function teardownCropper() {
  if (state.cropper) { state.cropper.destroy(); state.cropper = null; }
  state.cropBox = null;
}

async function runImage() {
  const queue = state.files.filter(isImage);
  if (!queue.length) return;
  const spec = currentResizeSpec();
  const format = $('#img-format').value;
  const quality = parseInt($('#img-quality').value, 10);
  const cropEnabled = $('#img-crop-enable')?.checked;
  // the crop box is drawn against one specific image, so it only applies there
  const cropIndex = cropEnabled ? state.cropTarget : -1;

  setBusy(true, `resizing ${queue.length} image${queue.length > 1 ? 's' : ''}…`);

  await runBatch(queue, async (file, i) => {
    let data = await decodeToImageData(file);
    if (cropEnabled && state.cropBox && i === cropIndex) {
      data = await cropImageData(data, state.cropBox);
    }
    const t = targetSize({ width: data.width, height: data.height }, spec);
    if (spec.mode === 'exact') {
      data = await fitExact(data, t, spec.fit);
    } else if (t.width !== data.width || t.height !== data.height) {
      data = await resizeImageData(data, t.width, t.height);
    }
    const fmt = format === 'original' ? (extOf(file.name) === 'png' ? 'png' : extOf(file.name) === 'webp' ? 'webp' : 'jpeg') : format;
    const blob = await encodeImage(data, fmt, quality);
    const name = changeExt(file.name, fmt === 'jpeg' ? 'jpg' : fmt);
    addResultRow({ name, before: file.size, after: blob.size, blob, note: `${data.width}×${data.height}` });
    return { name, blob };
  }, {
    onItem: (out, i, err) => {
      if (err) addResultRow({ name: queue[i]?.name, before: queue[i]?.size, error: err.message });
    },
    onDone: () => { setBusy(false); renderDownloadAll(); },
  });
}

/* ── run dispatch ──────────────────────────────────────────────────────── */

function wireRun() {
  const run = $('#studio-run');
  if (!run) return;
  run.addEventListener('click', async () => {
    if (state.running || !state.files.length) return;
    if (emptyFor(state.tab)) return;
    clearResults();
    state.cancel = false;
    wireCancel();
    try {
      if (state.tab === 'compress') await runCompress();
      else if (state.tab === 'convert') await runConvert();
      else await runImage();
    } catch (err) {
      addResultRow({ name: 'batch', error: errMessage(err) });
      setBusy(false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
