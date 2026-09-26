// walldiff — wallpaper recolor via gowall's exact engine.
//
// Faithful browser port of gowall v0.2.4 (github.com/Achno/gowall, MIT):
// default pipeline = Hald CLUT (level 8) with Gaussian RBF interpolation
// (sigma 50) over the theme palette. Instead of materialising the 512x512
// CLUT image we precompute the same mapping for all 64^3 quantised colours
// into a flat lookup table, which is bit-identical to what gowall produces:
//
//   identity colour for index i:   uint8(i * 255 / 63)   (Go truncates)
//   pixel -> clut index:           floor(v * 63 / 255)   per channel
//   mapping:                       rbfInterpolation(target, palette, 50)
//
// Theme palettes are transcribed verbatim from internal/image/themes.go
// (v0.2.4), keyed by the same names `gowall list` prints.

var GOWALL_THEMES = {
  "caelus": ["#ef934d", "#0f0f0f", "#7ec97e", "#7ec9a3", "#f16e65", "#f4decd", "#1e1e1e", "#bfaf9e", "#353535", "#000000", "#292929", "#efbf71", "#71b4d6", "#e28dc6"],
  "autumn": ["#e8a33d", "#3d2a0c", "#4a3418", "#fbd9a0", "#b54a32", "#f5efe6", "#3d2018", "#f0c9bc", "#7fa0b8", "#12242e", "#24333d", "#cfe1eb", "#e2604a", "#3d0f08", "#4a1c12", "#f5cfc2", "#15130f", "#f3e9d8", "#1f1a13", "#c9b99a", "#7a6849", "#3d3323", "#2a2318", "#8a5a1d", "#000000"],
  "cyberpunk": ["#c4a82e", "#0e1015", "#d14358", "#00a66c", "#b32d2d", "#0a0d14", "#5c8ac4", "#11151d", "#9b6bc1", "#45a0d6", "#090d13", "#d8e0ff", "#0c0e14", "#e64572", "#89d36a", "#d7a23a", "#4f8fff", "#9d6dff", "#43c9ff", "#b7c4f2", "#2b314a"],
  "dusky": ["#d85d7b", "#13111a", "#9b74b8", "#629cb8", "#e05a5a", "#e2deea", "#1f1b29", "#9c96aa", "#40394f", "#0c0a12", "#2d273a", "#d89d6a", "#5b8fac", "#9b6db8"],
  "everforest": ["#a7c080", "#272e33", "#7fbbb3", "#d699b6", "#e67e80", "#d3c6aa", "#374145", "#9da9a0", "#495156", "#1f262a", "#e69875", "#dbbc7f", "#83c092"],
  "evergreen": ["#4a9a68", "#080d0a", "#6aae52", "#52987a", "#c87a5c", "#101913", "#a1af9c", "#28302b", "#798375", "#4a684a", "#c4a64e", "#8a7856", "#d89268", "#82c45a", "#d4ba60", "#5aae7a", "#a08e66", "#48aa82", "#b9c3b5"],
  "gruvbox": ["#d79921", "#282828", "#8ec07c", "#458588", "#cc241d", "#fbf1c7", "#ebdbb2", "#3c3836", "#a89984", "#504945", "#1d2021", "#689d6a", "#d3869b", "#83a598"],
  "gruvbox-material": ["#a9b665", "#282828", "#d8a657", "#7daea3", "#ea6962", "#ddc7a1", "#32302f", "#a89984", "#45403d", "#1b1b1b", "#e78a4e", "#d3869b", "#89b482", "#928374", "#d4be98"],
  "pink-crimson": ["#e02030", "#e8aeb6", "#f08bb0", "#1a1214", "#e86a9a", "#2c1f22", "#8a6e78", "#b8c0c8", "#3a2428", "#5fbf4a", "#4a3a3e", "#ff4a58", "#7ad964", "#f8c0d4", "#ffc2cc"],
  "catppuccin-mocha-mauve": ["#cba6f7", "#1e1e2e", "#b4befe", "#89dceb", "#f38ba8", "#cdd6f4", "#313244", "#a6adc8", "#6c7086", "#11111b", "#45475a", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de", "#585b70", "#f5e0dc"],
  "garnet": ["#990000", "#f5eeee", "#c8962a", "#1a1414", "#7a0000", "#f0e8e8", "#d64545", "#121212", "#e8e0e0", "#181616", "#c4bcbc", "#2a2424", "#000000", "#b30000", "#5a9e5a", "#c9a227", "#4a7fb5", "#a85a7a", "#4aa3a3", "#3a3a3a", "#7fc77f", "#e6c14d", "#6fa3d4", "#c97fa0", "#6fcaca", "#f5efef"],
  "kanagawa-kasumi": ["#d9a78b", "#1a2026", "#7794a6", "#8ba37a", "#d96c6c", "#d9d1ba", "#20272e", "#313c47", "#0a0c10", "#b87a8e", "#77a3a0", "#e67e7e", "#9fba8c", "#f2bea0", "#8ab2c9", "#d195a8", "#8cbeba", "#ebe4cc"],
  "kemuri-koke": ["#8ba37e", "#242120", "#a69680", "#cb9168", "#c6685d", "#e5dec9", "#36312f", "#665c58", "#000000", "#67808a", "#a27886", "#769f93", "#db8177", "#9cb793", "#e2aa82", "#809ba6", "#bc919f", "#92b9ad", "#f4eedc"],
  "lilac-amoled": ["#b58fff", "#000000", "#c79aff", "#d8b4ff", "#ff6f9b", "#e8d8ff", "#110d1a", "#4c3a70", "#a8e6cf", "#e0c1ff", "#ff8cb3", "#b8f0d8", "#e6d1ff", "#c9a8ff", "#d4b8ff", "#f0e0ff", "#f5f0ff"],
  "matecito": ["#8da383", "#1e2320", "#cb9b7c", "#7f9193", "#c27979", "#d3cdc3", "#272e2a", "#9da49a", "#4a534d", "#000000", "#728a96", "#a48fa1", "#7a998d", "#47524b", "#d48f8f", "#a1b598", "#dbb095", "#8da3b0", "#baa9b8", "#93ad1a", "#e4dfd5"],
  "mizuki-akiyama": ["#e6a6c8", "#2b1422", "#afa2d8", "#1d1830", "#7fb6d6", "#071f2d", "#f08a9b", "#2d0b14", "#10111b", "#eee7f0", "#1d1a2a", "#c8b9ca", "#4d465c", "#05060a", "#3b304e", "#f6eaf3", "#8fd0b8", "#d9b874", "#d8a2cb", "#7cced9", "#ff9caf", "#a7dec9", "#efd08d", "#9dcee7", "#e6b6d5", "#9adde4", "#ffffff"],
  "murata": ["#db6d6d", "#1a1b1c", "#d1b394", "#8faeb1", "#cdc5bd", "#252627", "#a69d96", "#5a5b5c", "#000000", "#91ad83", "#b892b1", "#8fb8a7", "#3e4042", "#e58e8e", "#b0cc9d", "#e6ccb1", "#acc6c9", "#d1b1cc", "#acc9bc", "#e5dfd9"],
  "noctalia-legacy": ["#c7a1d8", "#1a151f", "#a984c4", "#f3edf7", "#e0b7c9", "#20161f", "#e9899d", "#1e1418", "#1c1822", "#e9e4f0", "#262130", "#a79ab0", "#3e364e", "#120f18", "#ffffff"],
  "osaka-jade": ["#1e9177", "#b8c8c4", "#167a63", "#26a589", "#933636", "#081512", "#a6b5b1", "#0f251f", "#99a8a4", "#1b6352", "#040a09", "#141b1e", "#dadada", "#232a2d", "#e57474", "#8ccf7e", "#e5c76b", "#67b0e8", "#c47fd5", "#6cbfbf", "#b3b9b8", "#464e50", "#ef7e7e", "#96d988", "#f4d67a", "#71baf2", "#ce89df", "#67cbe7", "#bdc3c2"],
  "shien": ["#9b8bc1", "#15131b", "#7866a3", "#5d507c", "#ffffff", "#b87a87", "#bfb3db", "#24202c", "#463d5c", "#000000", "#7aa89f", "#c4b794", "#cf939f", "#91bfb6", "#ded4b6", "#efeef1"],
  "shinonome": ["#d5aca9", "#1a1d20", "#b38d97", "#c5baaf", "#ebcfb2", "#2d3339", "#424b54", "#000000", "#97a7b5", "#c9a2ab", "#e2c3c1", "#f3dfca", "#b0c2d4", "#dcd5ce", "#fdfbf7"],
  "tokyo-night-moon": ["#7a88cf", "#1f2335", "#d7729f", "#9cd58a", "#f7768e", "#a9b1d6", "#2c314a", "#c0caf5", "#4b517a", "#181b2a", "#e6c384", "#7bb0c0", "#8289a6", "#545c7e"],
  "nord": ["#b48ead", "#2e3440", "#a3be8c", "#ebcb8b", "#bf616a", "#eceff4", "#3b4252", "#e5e9f0", "#434c5e", "#4c566a", "#d8dee9", "#c6d0f5", "#5e81ac", "#f4b8e4", "#8fbcbb"],
  "rose-pine": ["#ea9a97", "#232136", "#9ccfd8", "#3e8fb0", "#e0def4", "#eb6f92", "#393552", "#908caa", "#44415a", "#56526e", "#f6c177", "#c4a7e7", "#6e6a86"],
};

var imageLoader = document.getElementById("drop-zone");
imageLoader.addEventListener("change", (e) => {
  handleImage(e.target.files[0]);
});

window.addEventListener("paste", (e) => {
  handleImage(e.clipboardData.files[0]);
});

["dragenter", "dragover", "dragleave", "drop"].forEach((e) => {
  document.body.addEventListener(e, preventDefaults, false);
});

document.body.addEventListener("drop", (e) => {
  handleImage(e.dataTransfer.files[0]);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

var canvas = document.getElementById("image-canvas");
var ctx = canvas.getContext("2d");

const downloadButton = document.getElementById("download-button");
const resetButton = document.getElementById("reset-button");
const convertButton = document.getElementById("convert");
const menu = document.getElementById("theme-select");

canvas.style.visibility = "hidden";

var ogimage;
var themeName = null;
var converting = false;

// render state: canvas = original -> (invert?) -> (theme?)
var inverted = false;
var converted = false;
var baseData = null; // untouched copy of the loaded image

var invertToggle = document.getElementById("invert-toggle");

// same order as `gowall list`
var themeKeys = Object.keys(GOWALL_THEMES).sort();
themeKeys.forEach(function (k) {
  var opt = document.createElement("option");
  opt.value = k;
  opt.textContent = k;
  menu.appendChild(opt);
});
menu.value = themeKeys[0];
themeName = menu.value;

function scrollTheme(scrollDirection = 0) {
  const idx = themeKeys.indexOf(menu.value);
  var nv = scrollDirection > 0 ? idx + 1 : idx - 1;
  if (scrollDirection === 0) nv = idx;

  if (nv < 0) nv = themeKeys.length - 1;
  else if (nv >= themeKeys.length) nv = 0;

  menu.value = themeKeys[nv];
  themeName = menu.value;
}

menu.addEventListener("wheel", (event) => {
  event.preventDefault();
  scrollTheme(event.deltaY);
});

menu.onchange = function () {
  scrollTheme();
};

function handleImage(source) {
  ogimage = source;
  var reader = new FileReader();

  reader.onload = function (event) {
    var img = new Image();
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      baseData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      inverted = invertToggle.checked;
      converted = false;
      if (inverted) rebuild();
    };
    img.src = event.target.result;
  };

  reader.readAsDataURL(source);
  downloadButton.style.visibility = "hidden";
  resetButton.style.visibility = "hidden";
  canvas.style.visibility = "visible";
}

// live toggle: re-render immediately, no convert press needed
invertToggle.addEventListener("change", function () {
  if (converting || !baseData) {
    invertToggle.checked = inverted; // snap back while busy / no image
    return;
  }
  inverted = invertToggle.checked;
  rebuild();
});

function rebuild() {
  var imageData = new ImageData(
    new Uint8ClampedArray(baseData.data),
    canvas.width,
    canvas.height
  );

  if (inverted) {
    // gowall's `invert` filter (internal/image/invert.go → imaging.Invert):
    // per-channel 255 - v, alpha untouched. Applied before the CLUT so the
    // colour scheme maps over the inverted colours.
    var px = imageData.data;
    for (var i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i];
      px[i + 1] = 255 - px[i + 1];
      px[i + 2] = 255 - px[i + 2];
    }
  }

  ctx.putImageData(imageData, 0, 0);

  if (converted) {
    applyLut();
  } else if (!converting) {
    downloadButton.style.visibility = "hidden";
    resetButton.style.visibility = "hidden";
  }
}

function reset() {
  handleImage(ogimage);
}

function initialize() {
  if (converting || !ogimage) return;
  converting = true;
  convertButton.disabled = true;
  downloadButton.style.visibility = "hidden";
  resetButton.style.visibility = "hidden";

  setTimeout(function () {
    try {
      converted = true;
      rebuild();
    } catch (err) {
      console.error(err);
      finishConvert();
    }
  }, 0);
}

function finishConvert() {
  converting = false;
  convertButton.disabled = false;
  downloadButton.style.visibility = "visible";
  resetButton.style.visibility = "visible";
}

function hexToRgb(hex) {
  var h = hex.replace(/^#/, "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

// ── gowall v0.2.4 engine (hald CLUT level 8 + gaussian RBF, sigma 50) ──

var LUT_LEVEL = 8;
var LUT_CUBE = LUT_LEVEL * LUT_LEVEL; // 64
var LUT_SIZE = LUT_CUBE * LUT_CUBE * LUT_CUBE; // 262144

var lutCache = {};

function buildLut(name) {
  var palette = GOWALL_THEMES[name].map(hexToRgb);
  var n = palette.length;
  var twoSigmaSq = 2 * 50 * 50;

  var lut = new Uint8Array(LUT_SIZE * 3);
  var pos = 0;

  for (var b = 0; b < LUT_CUBE; b++) {
    var bv = Math.floor((b * 255) / (LUT_CUBE - 1)); // uint8(b * 255 / 63)
    for (var g = 0; g < LUT_CUBE; g++) {
      var gv = Math.floor((g * 255) / (LUT_CUBE - 1));
      for (var r = 0; r < LUT_CUBE; r++) {
        var rv = Math.floor((r * 255) / (LUT_CUBE - 1));

        var numR = 0, numG = 0, numB = 0, den = 0;
        for (var i = 0; i < n; i++) {
          var p = palette[i];
          var dr = rv - p[0], dg = gv - p[1], db = bv - p[2];
          var d2 = dr * dr + dg * dg + db * db;
          var w = Math.exp(-d2 / twoSigmaSq);
          numR += p[0] * w;
          numG += p[1] * w;
          numB += p[2] * w;
          den += w;
        }

        lut[pos++] = Math.floor(numR / den);
        lut[pos++] = Math.floor(numG / den);
        lut[pos++] = Math.floor(numB / den);
      }
    }
  }
  return lut;
}

function getLut(name) {
  if (!lutCache[name]) lutCache[name] = buildLut(name);
  return lutCache[name];
}

function applyLut() {
  var w = canvas.width;
  var h = canvas.height;
  var imageData = ctx.getImageData(0, 0, w, h);
  var pixels = imageData.data;
  var lut = getLut(themeName);

  var y = 0;
  var batchSizeRows = window.innerWidth > 800
    ? Math.max(1, Math.floor(h / 16))
    : Math.max(1, Math.floor(h / 10));

  function processBatch() {
    var maxY = Math.min(y + batchSizeRows, h);
    for (; y < maxY; y++) {
      var rowOff = y * w * 4;
      for (var x = 0; x < w; x++) {
        var idx = rowOff + x * 4;
        // floor(v * 63 / 255) — identical to gowall's correctPixel();
        // index layout matches the identity CLUT: blue-major, red-minor
        var rq = (pixels[idx] * 63 / 255) | 0;
        var gq = (pixels[idx + 1] * 63 / 255) | 0;
        var bq = (pixels[idx + 2] * 63 / 255) | 0;
        var lo = ((bq << 12) | (gq << 6) | rq) * 3;
        pixels[idx] = lut[lo];
        pixels[idx + 1] = lut[lo + 1];
        pixels[idx + 2] = lut[lo + 2];
      }
    }
    ctx.putImageData(imageData, 0, 0);

    if (y < h) {
      setTimeout(processBatch, 0);
    } else {
      finishConvert();
    }
  }

  processBatch();
}

// ── download ──

function downloadImage() {
  var base = "image";
  if (ogimage && ogimage.name) {
    base = ogimage.name.replace(/\.[^.]+$/, "");
  }
  var ext = "png";
  if (ogimage && ogimage.name && ogimage.name.indexOf(".") > -1) {
    ext = ogimage.name.split(".").pop().toLowerCase();
  }
  image = canvas.toDataURL("image/" + (ext === "jpg" ? "jpeg" : ext));
  var link = document.createElement("a");
  link.download = base + "-" + themeName + "." + ext;
  link.href = image;
  link.click();
}
