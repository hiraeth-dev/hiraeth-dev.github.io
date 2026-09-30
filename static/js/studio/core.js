/* studio — shared core: lazy CDN engine loader, file store, results, zip.
   Every engine is pinned and loaded on first use, so the page itself ships
   almost no JS. Nothing is uploaded anywhere; all work happens in-tab. */

export const CDN = {
  pdfjs:        'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs',
  pdfjsWorker:  'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs',
  pdfjsCmaps:   'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/cmaps/',
  pdfjsFonts:   'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/standard_fonts/',
  pdfLib:       'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  fflate:       'https://cdn.jsdelivr.net/npm/fflate@0.8.3/esm/browser.js',
  jpeg:         'https://cdn.jsdelivr.net/npm/@jsquash/jpeg@1.6.0/encode.js',
  png:          'https://cdn.jsdelivr.net/npm/@jsquash/png@3.1.1/encode.js',
  webp:         'https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/encode.js',
  avif:         'https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/encode.js',
  resize:       'https://cdn.jsdelivr.net/npm/@jsquash/resize@2.1.1/index.js',
  heic:         'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js',
  mammoth:      'https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js',
  xlsx:         'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
};

/* ── lazy loaders ──────────────────────────────────────────────────────
   Each caches its promise. A failed load clears the cache entry so the
   next attempt retries instead of being stuck with a rejected promise. */

const modCache = new Map();
const scriptCache = new Map();

export function loadModule(url) {
  if (!modCache.has(url)) {
    modCache.set(url, import(/* @vite-ignore */ url).catch((err) => {
      modCache.delete(url);
      throw err;
    }));
  }
  return modCache.get(url);
}

export function loadScript(url, globalName) {
  const key = globalName ? `${url}|${globalName}` : url;
  if (!scriptCache.has(key)) {
    scriptCache.set(key, new Promise((resolve, reject) => {
      if (globalName && window[globalName]) { resolve(window[globalName]); return; }
      const s = document.createElement('script');
      s.src = url;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        const val = globalName ? window[globalName] : true;
        if (globalName && !val) { scriptCache.delete(key); reject(new Error(`${globalName} did not register`)); return; }
        resolve(val);
      };
      s.onerror = () => { scriptCache.delete(key); reject(new Error(`failed to load ${url}`)); };
      document.head.appendChild(s);
    }));
  }
  return scriptCache.get(key);
}

export const getFflate = () => loadModule(CDN.fflate);
export const getResize = () => loadModule(CDN.resize);
export const getPdfLib = () => loadScript(CDN.pdfLib, 'PDFLib');
export const getHeic = () => loadScript(CDN.heic, 'heic2any');
export const getMammoth = () => loadScript(CDN.mammoth, 'mammoth');
export const getXlsx = () => loadScript(CDN.xlsx, 'XLSX');

export function getCodec(fmt) {
  const urls = { jpeg: CDN.jpeg, png: CDN.png, webp: CDN.webp, avif: CDN.avif };
  const url = urls[fmt];
  if (!url) return Promise.reject(new Error(`no encoder for ${fmt}`));
  return loadModule(url);
}

let pdfjsPromise = null;
export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = loadModule(CDN.pdfjs).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
      return lib;
    }).catch((err) => { pdfjsPromise = null; throw err; });
  }
  return pdfjsPromise;
}

/* ── file-type helpers ───────────────────────────────────────────────── */

export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'svg', 'heic', 'heif', 'tif', 'tiff'];
export const HEIC_EXT = ['heic', 'heif'];
export const DOC_EXT = ['doc', 'docx', 'odt', 'rtf', 'txt', 'md'];
export const SHEET_EXT = ['xls', 'xlsx', 'ods', 'csv', 'tsv'];
export const DECK_EXT = ['ppt', 'pptx', 'odp'];
export const ZIPLIKE_EXT = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub'];

export const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
export const isPdf = (f) => extOf(f.name) === 'pdf';
export const isImage = (f) => IMAGE_EXT.includes(extOf(f.name));
export const isHeic = (f) => HEIC_EXT.includes(extOf(f.name));
export const isDoc = (f) => DOC_EXT.includes(extOf(f.name));
export const isSheet = (f) => SHEET_EXT.includes(extOf(f.name));
export const isDeck = (f) => DECK_EXT.includes(extOf(f.name));
export const isOffice = (f) => isDoc(f) || isSheet(f) || isDeck(f) || ZIPLIKE_EXT.includes(extOf(f.name));

/** Coarse bucket used to label a file in the queue and pick default controls. */
export function kindOf(f) {
  if (isPdf(f)) return 'pdf';
  if (isImage(f)) return 'image';
  if (isSheet(f)) return 'sheet';
  if (isDeck(f)) return 'deck';
  if (isDoc(f)) return 'doc';
  return 'other';
}

export function changeExt(name, newExt) {
  const i = name.lastIndexOf('.');
  return (i === -1 ? name : name.slice(0, i)) + '.' + newExt;
}

export function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Debounce that also exposes .flush() for immediate runs on input change. */
export function debounce(fn, ms) {
  let t = null;
  let lastArgs = null;
  const wrapped = (...args) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...lastArgs); }, ms);
  };
  wrapped.flush = () => { if (t) { clearTimeout(t); t = null; fn(...lastArgs); } };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Bundle results into a real .zip, de-duplicating colliding entry names. */
export async function zipFiles(items, prefix) {
  const { zipSync } = await getFflate();
  const entries = {};
  for (const item of items) {
    let key = item.name;
    if (entries[key] !== undefined) {
      const parts = key.split('.');
      const ext = parts.pop();
      key = `${parts.join('.')}-${items.indexOf(item) + 1}${ext ? `.${ext}` : ''}`;
    }
    entries[key] = new Uint8Array(await item.blob.arrayBuffer());
  }
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}

export const stamp = () => new Date().toISOString().slice(0, 10);

/* ── abortable batch runner ─────────────────────────────────────────────
   Runs an async map over items one at a time, reporting progress, and
   stops early if the caller cancels. Keeps peak memory to one output. */

export async function runBatch(items, worker, { onStart, onItem, onDone } = {}) {
  const outputs = [];
  const state = { cancelled: false };
  if (onStart) onStart(state);
  for (let i = 0; i < items.length; i++) {
    if (state.cancelled) break;
    const item = items[i];
    try {
      const out = await worker(item, i);
      if (out) {
        outputs.push(out);
        if (onItem) onItem(out, i, null);
      }
    } catch (err) {
      if (onItem) onItem(null, i, err);
    }
    // yield to the event loop so the UI can paint between files
    await new Promise((r) => setTimeout(r, 0));
  }
  if (onDone) onDone(outputs, state.cancelled);
  return outputs;
}
