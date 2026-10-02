<div align="center">

# Hiraeth

**Until we turn to dust, (ﾐゝᆽ╹ﾐ)**

**[hiraeth-dev.github.io](https://hiraeth-dev.github.io/)**

A retro-terminal personal site — novels, notes, and a handful of in-browser tools.
Static HTML, no tracking, and every tool runs client-side.

</div>

---

## What's here

**~4,500 pages** of reading and tools, served as pure static HTML.

### Tools

All of these run **entirely in the browser**. Nothing is uploaded and nothing is
tracked; the libraries they need are fetched once from a CDN and then cached by
your browser.

| Tool | What it does |
|---|---|
| [**dict**](https://hiraeth-dev.github.io/dictionary/) | Word lookup — 23 Wiktionary editions, fuzzy matching, pronunciation |
| [**studio**](https://hiraeth-dev.github.io/studio/) | Compress / convert / resize images, PDFs and documents — see below |
| [**walldiff**](https://hiraeth-dev.github.io/walldiff/) | Recolour a wallpaper from 35+ palettes (gowall engine) |
| [**typing**](https://hiraeth-dev.github.io/typing/) | Speed test — time & word modes, live WPM/accuracy, speed-progression graph |

Also linked from the homepage: an [abeyant](https://hiraeth-dev.github.io/abeyant/)
new-tab extension, plus desktop and mobile startpage projects.

### studio, in detail

A three-tab tool that replaces a simple image compressor:

- **compress** — images (any format, quality, longest-side cap), PDFs
  (*lossless metadata strip* or opt-in *rasterise*), Office files
- **convert** — image ⇄ image, images → PDF, PDF → images, PDF page tools
  (merge / extract / delete / rotate / unlock / clean), PDF → text,
  DOCX & XLSX → PDF / image / HTML / CSV
- **image** — resize by %, width, height, longest side, exact box or print DPI;
  seven size presets; interactive crop with aspect lock

Engines (`pdf.js`, `pdf-lib`, Squoosh WASM codecs, `mammoth`, `SheetJS`) are
pinned and lazy-loaded, so the page itself ships almost no JavaScript.

Two honest limits: slide decks (`.pptx`) and legacy binary `.doc`/`.rtf` are
refused because there is no usable in-browser renderer for them, and Office →
PDF is approximate. Both are surfaced in the UI rather than hidden.

### Reading

Public-domain novels, chapter by chapter:

| Novel | Pages |
|---|---|
| Reverend Insanity | 2,261 |
| Lord of the Mysteries | 1,446 |
| Mushoku Tensei | 385 (26 volumes) |
| Brothers Karamazov | 110 |
| Pride and Prejudice | 62 |
| Moby Dick | 61 |
| The Idiot | 55 |
| Notes from Underground | 24 |
| The Odyssey | 25 |
| White Nights | 12 |
| The Trial | 11 |
| Metamorphosis | 4 |

Plus a set of personal notes and chapters.

### Design

Five themes (amber, mallow, gruvbox-material, safelight, tungsten) and three
monospace fonts (maple, iosevka, space), all driven by CSS custom properties and
persisted to `localStorage`. The mobile layout is deliberately simpler than the
desktop one — it drops the frosted panels entirely and reads as plain text on the
grid.

---

## Stack

- **[Zola](https://www.getzola.org/)** static site generator — no framework, no
  bundler, no client-side router
- Plain CSS with per-theme custom properties; a small amount of vanilla JS
- `pdf.js`, `pdf-lib`, `@jsquash/*`, `mammoth`, `SheetJS`, `heic2any` — all
  loaded from a CDN at runtime, never vendored
- Deployed to GitHub Pages on every push to `main`

## Development

```sh
zola serve          # live-reloading dev server on :1111
zola build          # output to public/
```

CI pins **Zola 0.19.2**; local builds on a newer Zola (0.23.x) work fine. If you
touch templates, rebuild before judging anything in the browser — a stale
`public/` looks exactly like "nothing changed".

Layout worth knowing:

```
templates/     page templates (base.html holds the shell, nav, grid canvas)
content/       all prose, one directory per novel
static/        style.css, fonts, and js/ (one file per tool)
themes/        Zola theme overrides
DESIGN.md      living design doc — tokens, component recipes, tool contracts
```

`DESIGN.md` is the reference for the token set, the reading-measure rules, and
the traps in the studio and typing tools. Read it before restyling.

## Licence

Site code and styling: do as you like with it.

The novel text is public domain, with the exception of **Mushoku Tensei**
(ᴍᴜɴ) by Rifujin na Magonote, and **Reverend Insanity** / **Lord of the
Mysteries** by Death's Door. Those remain the authors' and translators' work.