/* studio — image pipeline: decode (incl. HEIC), encode via Squoosh WASM
   codecs with a native-canvas fallback, and high-quality resampling. */

import { getCodec, getResize, getHeic, isHeic } from './core.js';

/** Normalise any supported input (including HEIC) to a File/Blob we can decode. */
export async function toDecodable(file) {
  if (!isHeic(file)) return file;
  const heic2any = await getHeic();
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  // heic2any returns one item for stills, an array for multi-frame
  return Array.isArray(out) ? out[0] : out;
}

export async function decodeToImageData(file) {
  const src = await toDecodable(file);
  const bmp = await createImageBitmap(src);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Cheap dimension probe that avoids a full decode where possible. */
export async function probeSize(file) {
  const src = await toDecodable(file);
  const bmp = await createImageBitmap(src);
  const out = { width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), mime, quality);
  });
}

/* ── encoding ────────────────────────────────────────────────────────────
   Prefers the Squoosh WASM encoders (better compression at equal quality,
   and the only way to get AVIF). Falls back to the browser's own canvas
   encoder if a codec can't be fetched, so the tool degrades instead of
   failing. PNG ignores quality in both paths. */

export async function encodeImage(imageData, fmt, quality) {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  try {
    const mod = await getCodec(fmt);
    const enc = mod.encode || mod.default;
    const bytes = await enc(imageData, { quality: q });
    return new Blob([bytes], { type: `image/${fmt}` });
  } catch (err) {
    console.warn(`squoosh ${fmt} unavailable, using canvas encoder`, err);
    const mime = `image/${fmt}`;
    if (fmt === 'avif') {
      throw new Error('AVIF needs its encoder module, which could not be loaded.');
    }
    return canvasToBlob(imageDataToCanvas(imageData), mime, q / 100);
  }
}

/* ── resizing ────────────────────────────────────────────────────────────
   Uses Squoosh resize (lanczos3 by default) for a visibly better result
   than the browser's bilinear drawImage, then falls back to canvas. */

export async function resizeImageData(imageData, width, height, method = 'lanczos3') {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (w === imageData.width && h === imageData.height) return imageData;
  try {
    const mod = await getResize();
    const fn = mod.resize || mod.default;
    return await fn(imageData, { width: w, height: h, method });
  } catch (err) {
    console.warn('squoosh resize unavailable, using canvas', err);
    const src = imageDataToCanvas(imageData);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }
}

/** Crop by pixel box. The box is clamped to the source bounds. */
export async function cropImageData(imageData, box) {
  const sx = Math.max(0, Math.min(imageData.width - 1, Math.round(box.x)));
  const sy = Math.max(0, Math.min(imageData.height - 1, Math.round(box.y)));
  const sw = Math.max(1, Math.min(imageData.width - sx, Math.round(box.width)));
  const sh = Math.max(1, Math.min(imageData.height - sy, Math.round(box.height)));
  if (sx === 0 && sy === 0 && sw === imageData.width && sh === imageData.height) return imageData;

  const out = new ImageData(sw, sh);
  const src = new Uint8ClampedArray(imageData.data);
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * imageData.width + sx) * 4;
    out.data.set(src.subarray(from, from + sw * 4), y * sw * 4);
  }
  return out;
}

/* ── geometry ─────────────────────────────────────────────────────────── */

/**
 * Resolve the output pixel size for a resize request.
 *
 * mode   'width' | 'height' | 'percent' | 'longest' | 'exact' | 'dpi' | 'original'
 * value  numeric argument for the mode (px, %, or dpi)
 * aspect optional {w, h} box; only meaningful for mode 'exact'
 * fit    'contain' (letterbox inside the box) | 'fill' (cover, crop overflow)
 */
export function targetSize(src, { mode = 'original', value = 0, aspect = null, fit = 'contain' } = {}) {
  const sw = src.width;
  const sh = src.height;

  if (mode === 'original') return { width: sw, height: sh };

  if (mode === 'width') {
    const w = Math.max(1, Math.round(value));
    return { width: w, height: Math.max(1, Math.round((sh / sw) * w)) };
  }
  if (mode === 'height') {
    const h = Math.max(1, Math.round(value));
    return { height: h, width: Math.max(1, Math.round((sw / sh) * h)) };
  }
  if (mode === 'percent') {
    const f = Math.max(0.01, value) / 100;
    return { width: Math.max(1, Math.round(sw * f)), height: Math.max(1, Math.round(sh * f)) };
  }
  if (mode === 'longest') {
    const f = Math.max(1, value) / Math.max(sw, sh);
    return { width: Math.max(1, Math.round(sw * f)), height: Math.max(1, Math.round(sh * f)) };
  }
  if (mode === 'dpi') {
    const dpi = Math.max(1, value);
    const base = src.dpi || 96;
    return {
      width: Math.max(1, Math.round((sw / base) * dpi)),
      height: Math.max(1, Math.round((sh / base) * dpi)),
    };
  }
  if (mode === 'exact') {
    // the output is always exactly the box; fitExact() then crops or pads to it
    if (!aspect || !aspect.w || !aspect.h) return { width: sw, height: sh };
    return { width: Math.max(1, Math.round(aspect.w)), height: Math.max(1, Math.round(aspect.h)) };
  }
  return { width: sw, height: sh };
}

/**
 * Produce an output of exactly `target` size.
 * fit 'fill'    — scale to cover, then centre-crop the overflow
 * fit 'contain' — scale to fit inside, then pad with `background`
 */
export async function fitExact(imageData, target, fit = 'contain', background = '#ffffff') {
  const tw = Math.max(1, Math.round(target.width));
  const th = Math.max(1, Math.round(target.height));
  const scale = fit === 'fill'
    ? Math.max(tw / imageData.width, th / imageData.height)
    : Math.min(tw / imageData.width, th / imageData.height);

  const sw = Math.max(1, Math.round(imageData.width * scale));
  const sh = Math.max(1, Math.round(imageData.height * scale));
  const scaled = (sw === imageData.width && sh === imageData.height)
    ? imageData
    : await resizeImageData(imageData, sw, sh);

  const src = imageDataToCanvas(scaled);
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, tw, th);
  // centre the scaled image; with 'fill' the overflow is cropped by the canvas edge
  ctx.drawImage(src, Math.round((tw - sw) / 2), Math.round((th - sh) / 2));
  return ctx.getImageData(0, 0, tw, th);
}

/** Named size presets; `dpi` presets derive px from a paper size. */
export const PRESETS = [
  { id: 'hd', label: '1920 x 1080 (full HD)', w: 1920, h: 1080 },
  { id: '4k', label: '3840 x 2160 (4K)', w: 3840, h: 2160 },
  { id: 'sq1080', label: '1080 x 1080 (square)', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 x 1920 (story)', w: 1080, h: 1920 },
  { id: 'a4-300', label: 'A4 @ 300 dpi (2480 x 3508)', w: 2480, h: 3508, dpi: 300 },
  { id: 'a4-150', label: 'A4 @ 150 dpi (1240 x 1754)', w: 1240, h: 1754, dpi: 150 },
  { id: 'letter-300', label: 'Letter @ 300 dpi (2550 x 3300)', w: 2550, h: 3300, dpi: 300 },
];

/** DPI <-> pixel conversion for print targets. */
export function sizeForDpi(src, dpi) {
  const inchW = src.width / (src.dpi || 96);
  const inchH = src.height / (src.dpi || 96);
  return { width: Math.max(1, Math.round(inchW * dpi)), height: Math.max(1, Math.round(inchH * dpi)) };
}
