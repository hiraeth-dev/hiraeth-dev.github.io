/* studio — interactive crop box.
   Draws the source image scaled to fit, lets you drag a selection with
   eight handles, and reports the selection back in source-image pixels. */

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_PX = 9; // hit radius in screen px
const MIN_BOX = 4;   // smallest selection, in source px

const ASPECTS = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
};

export function createCropper(host, { onChange } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'studio-crop-canvas';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let imageData = null;
  let view = { scale: 1, ox: 0, oy: 0 };  // source -> screen mapping
  let box = { x: 0, y: 0, width: 0, height: 0 };  // in source px
  let aspect = ASPECTS.free;
  let drag = null; // {mode, startX, startY, orig}
  let cssW = 0;
  let cssH = 0;

  function fit() {
    const rect = host.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!imageData) return;
    const pad = 12;
    const s = Math.min((cssW - pad * 2) / imageData.width, (cssH - pad * 2) / imageData.height);
    view = {
      scale: s,
      ox: (cssW - imageData.width * s) / 2,
      oy: (cssH - imageData.height * s) / 2,
    };
  }

  const toScreen = (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale });
  const toSource = (x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });

  function clampBox(b) {
    if (!imageData) return b;
    let { x, y, width, height } = b;
    width = Math.max(MIN_BOX, Math.min(width, imageData.width));
    height = Math.max(MIN_BOX, Math.min(height, imageData.height));
    x = Math.max(0, Math.min(x, imageData.width - width));
    y = Math.max(0, Math.min(y, imageData.height - height));
    return { x, y, width, height };
  }

  function applyAspect(b, anchor) {
    if (!aspect) return b;
    const r = aspect;
    let { x, y, width, height } = b;
    // drive the smaller relative change so the box keeps its anchor corner
    if (width / height > r) height = width / r; else width = height * r;
    width = Math.min(width, imageData.width);
    height = Math.min(height, imageData.height);
    if (anchor === 'se') return { x, y, width, height };
    if (anchor === 'nw') return { x: x + (b.width - width), y: y + (b.height - height), width, height };
    if (anchor === 'ne') return { x, y: y + (b.height - height), width, height };
    if (anchor === 'sw') return { x: x + (b.width - width), y, width, height };
    return { x, y: y + (b.height - height), width, height };
  }

  function hitHandle(sx, sy) {
    const pts = {
      nw: [box.x, box.y], n: [box.x + box.width / 2, box.y], ne: [box.x + box.width, box.y],
      e: [box.x + box.width, box.y + box.height / 2], se: [box.x + box.width, box.y + box.height],
      s: [box.x + box.width / 2, box.y + box.height], sw: [box.x, box.y + box.height],
      w: [box.x, box.y + box.height / 2],
    };
    for (const h of HANDLES) {
      const p = toScreen(pts[h][0], pts[h][1]);
      if (Math.abs(sx - p.x) <= HANDLE_PX && Math.abs(sy - p.y) <= HANDLE_PX) return h;
    }
    const a = toScreen(box.x, box.y);
    const b = toScreen(box.x + box.width, box.y + box.height);
    if (sx >= a.x && sx <= b.x && sy >= a.y && sy <= b.y) return 'move';
    return null;
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    if (!imageData) return;

    // checkerboard so transparent PNGs read correctly
    ctx.save();
    ctx.fillStyle = 'rgba(128,128,128,.18)';
    const step = 12;
    for (let y = 0; y < cssH; y += step) {
      for (let x = 0; x < cssW; x += step) {
        if (((x / step) + (y / step)) % 2 === 0) ctx.fillRect(x, y, step, step);
      }
    }
    ctx.restore();

    // source image via an offscreen canvas
    if (!canvas._src) canvas._src = document.createElement('canvas');
    const src = canvas._src;
    if (src.width !== imageData.width || src.height !== imageData.height) {
      src.width = imageData.width;
      src.height = imageData.height;
    }
    src.getContext('2d').putImageData(imageData, 0, 0);
    const tl = toScreen(0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, tl.x, tl.y, imageData.width * view.scale, imageData.height * view.scale);

    // dim everything outside the selection
    const a = toScreen(box.x, box.y);
    const b = toScreen(box.x + box.width, box.y + box.height);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);

    // rule-of-thirds guides
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    for (let i = 1; i < 3; i++) {
      const gx = a.x + ((b.x - a.x) * i) / 3;
      const gy = a.y + ((b.y - a.y) * i) / 3;
      ctx.beginPath(); ctx.moveTo(gx, a.y); ctx.lineTo(gx, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x, gy); ctx.lineTo(b.x, gy); ctx.stroke();
    }

    // handles
    ctx.fillStyle = '#fff';
    for (const h of HANDLES) {
      const [hx, hy] = {
        nw: [box.x, box.y], n: [box.x + box.width / 2, box.y], ne: [box.x + box.width, box.y],
        e: [box.x + box.width, box.y + box.height / 2], se: [box.x + box.width, box.y + box.height],
        s: [box.x + box.width / 2, box.y + box.height], sw: [box.x, box.y + box.height],
        w: [box.x, box.y + box.height / 2],
      }[h];
      const p = toScreen(hx, hy);
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    }
  }

  function emit() {
    if (onChange) {
      onChange({
        x: Math.round(box.x), y: Math.round(box.y),
        width: Math.round(box.width), height: Math.round(box.height),
      });
    }
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function onDown(e) {
    if (!imageData) return;
    const { sx, sy } = pointerPos(e);
    const mode = hitHandle(sx, sy) || 'new';
    canvas.setPointerCapture(e.pointerId);
    const p = toSource(sx, sy);
    drag = { mode, startX: p.x, startY: p.y, orig: { ...box }, moved: mode !== 'new' };
    if (mode === 'new') {
      box = { x: p.x, y: p.y, width: 0, height: 0 };
      draw();
    }
    e.preventDefault();
  }

  function onMove(e) {
    if (!imageData) return;
    const { sx, sy } = pointerPos(e);
    if (!drag) {
      canvas.style.cursor = hitHandle(sx, sy) ? 'move' : 'crosshair';
      return;
    }
    const p = toSource(sx, sy);
    const o = drag.orig;
    let next;

    if (drag.mode === 'move') {
      next = {
        x: o.x + (p.x - drag.startX),
        y: o.y + (p.y - drag.startY),
        width: o.width,
        height: o.height,
      };
    } else if (drag.mode === 'new') {
      let x = Math.min(drag.startX, p.x);
      let y = Math.min(drag.startY, p.y);
      let width = Math.abs(p.x - drag.startX);
      let height = Math.abs(p.y - drag.startY);
      if (aspect) {
        if (width / height > aspect) height = width / aspect; else width = height * aspect;
        // keep the drag anchored at the start corner
        x = p.x < drag.startX ? drag.startX - width : drag.startX;
        y = p.y < drag.startY ? drag.startY - height : drag.startY;
      }
      next = { x, y, width, height };
    } else {
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      const right = o.x + o.width;
      const bottom = o.y + o.height;
      next = { ...o };
      if (drag.mode.includes('w')) { next.x = o.x + dx; next.width = o.width - dx; }
      if (drag.mode.includes('e')) next.width = o.width + dx;
      if (drag.mode.includes('n')) { next.y = o.y + dy; next.height = o.height - dy; }
      if (drag.mode.includes('s')) next.height = o.height + dy;
      if (next.width < MIN_BOX) { next.width = MIN_BOX; if (drag.mode.includes('w')) next.x = right - MIN_BOX; }
      if (next.height < MIN_BOX) { next.height = MIN_BOX; if (drag.mode.includes('n')) next.y = bottom - MIN_BOX; }
      if (aspect) {
        const anchor = drag.mode.length === 2 ? drag.mode : null;
        next = applyAspect(next, anchor);
      }
    }
    box = clampBox(next);
    draw();
    emit();
  }

  function onUp(e) {
    if (!drag) return;
    // a click without a drag should settle on a sensible default
    if (drag.mode === 'new' && (box.width < MIN_BOX || box.height < MIN_BOX)) {
      box = clampBox({ x: 0, y: 0, width: imageData.width, height: imageData.height });
    }
    if (aspect) box = clampBox(applyAspect(box, 'nw'));
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    draw();
    emit();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  const ro = new ResizeObserver(() => { fit(); draw(); });
  ro.observe(host);

  return {
    setImage(data) {
      imageData = data;
      box = data ? { x: 0, y: 0, width: data.width, height: data.height } : { x: 0, y: 0, width: 0, height: 0 };
      fit();
      draw();
      emit();
    },
    getBox() { return { ...box }; },
    setBox(b) { box = clampBox(b); draw(); emit(); },
    setAspect(key) { aspect = ASPECTS[key] ?? null; },
    refit() { fit(); draw(); },
    destroy() {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.remove();
    },
  };
}

export { ASPECTS };
