# Hiraeth Design System

Single source of truth for how the site looks. Update this file when the
visual system changes — future edits (human or agent) follow it.

## 1. Tokens (`static/style.css`, `:root` + `[data-theme="…"]`)

Base palette per theme — every theme **must** define all of these:

| Token family | Tokens |
|---|---|
| Core (per theme, literal) | `--bg`, `--bg-elev`, `--fg`, `--fg-dim`, `--accent`, `--accent-2` |
| Glass (per theme, literal) | `--glass`, `--glass-hi`, `--line`, `--line-hi`, `--sheen`, `--grid`, `--glow`, `--halo-a`, `--halo-b`, `--blur`, `--sat` |
| Legacy compat (per theme, literal) | `--bg-panel` (=bg-elev), `--bg-panel-alt`, `--bg-glow` (=bg-elev), `--bg-core`, `--fg-muted`, `--border` (=line), `--border-strong` (=line-hi), `--accent-bright/soft/dim`, `--link`, `--link-hover`, `--focus-ring`, `--grid-fade` (=bg, except amber `transparent`), `--grid-line`, `--grid-dot`, `--bar-a/b/c`, `--orange(+deep)`, `--red(+deep)`, `--cyan(+deep)`, `--yellow`, `--cat-dark/mid/base/light` |
| Type (global `:root`) | `--font-mono`, `--font-read`, `--text-xs/sm/base/lg/xl/2xl`, `--content-w{-wide,-list,-read}` |
| Glass system (global, auto-derived) | `--glass-bg` (panel 15%), `--glass-bg-strong` (panel 82%), `--glass-blur` (= per-theme `--blur`), `--glass-hi` (fg 20%), `--glass-shadow(-hover)` |

Fonts switch via `html[data-font]`, which also bumps root `font-size`
(maple/space 110%, iosevka 115%). Default theme is `amber` desktop / `safelight` mobile, default font
`space`; boot script in `templates/base.html` sets `data-theme`/`data-font`
pre-paint from `?theme=`/`?font=` params, else `localStorage`, else defaults.

Each theme layers its own `static/wallpaper-<theme>.webp` (~200KB) fixed
behind the grid canvas (`body::after`, z-index -3, desktop only via
`min-width: 769px`) at 0.12 opacity + 30px blur, brightened and desaturated;
`--grid-fade` is `transparent` so `grid.js` skips the edge fill. Amber panels
run desaturated neutral at 25% opacity, other themes use their own
`--bg-panel` at 25% (strong/nav 40%). Mobile never sees any of this.

### Glass tokens (global, auto-derived — work in every theme)

```css
--glass-bg:        color-mix(in srgb, var(--bg-panel) 62%, transparent);
--glass-bg-strong: color-mix(in srgb, var(--bg-panel) 82%, transparent); /* nav, menus */
--glass-blur:      16px;
--glass-hi:        color-mix(in srgb, var(--fg) 14%, transparent);       /* top rim light */
--glass-shadow:        0 12px 32px rgba(0, 0, 0, 0.38);
--glass-shadow-hover:  0 18px 48px rgba(0, 0, 0, 0.50);
```

If `backdrop-filter` is unsupported, `@supports not` falls every glass
surface back to solid `var(--bg-panel)`.

## 2. Reading measure & text wrapping

Long-form pages (`.chapter-body`, `.page-header`, `.page-nav`, and the back
link on reading pages) are capped at `--content-w-read` (760px). This is a
**fixed px width on purpose**: all three reading fonts are monospace but have
different advance widths, so a px cap is what holds the *character* count
stable while cycling fonts. Measured at 760px: maple 65, iosevka 74.6,
space 63.7 chars/line — all inside the 45–75 band. At 790px Iosevka already
breaks the 75 ceiling. Do not widen this to `--content-w-wide` (1100px =
95 chars, well past the point where readers skip lines).

Wrapping:
- `text-wrap: pretty` on prose (`.chapter-body p`, `.footnote p`,
  `.dict-meaning-item`, `.playlist-item .summary`) — pulls a word down so a
  paragraph never ends on a stranded short last line.
- `text-wrap: balance` on headings (`.page-header h2`, `.section-heading`,
  `.terminal-body h1`, `.book-title`, `.novel-title`) — evens out short
  headings; browsers ignore it past ~6 lines.

Note: `pretty` on its own is nearly invisible at this measure (it only
prevents single-word last lines, which a 95-char measure almost never
produces). The measure is what actually fixed readability; `pretty` is
cheap insurance and matters more at narrower widths.

`templates/base.html` exposes a `body_class` block; `page.html` sets it to
`reading` so the back link can align to the reading column without
disturbing other pages.

## 3. Component recipes

**Glass panel** (terminal, novel/stack/stat/chapter cards, playlist,
code-block, dict-result, theme-menu, dict-meaning-item):
```css
background: var(--glass-bg);
backdrop-filter: blur(var(--glass-blur)) saturate(var(--sat, 155%));
-webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--sat, 155%));
border: 1px solid var(--border);
box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-hi);
```
`--glass-hi` is fg at 20% (top rim-light); `--glass-shadow(-hover)` layers
a contact shadow under the lift shadow.

**Cards** (novel/stack/stat/chapter): lift on hover —
`transform: translateY(-2px)`, shadow → `--glass-shadow-hover`,
border-color → accent-tinted. Bottom `::after` accent-bar sweep spans
10–90 (60:40 color-to-fade).

**Buttons / nav links** (controls, press affordance kept):
hover `translate(1px,1px)` + accent border; active `translate(3px,3px)`
with shadow collapsing to `0`. Small elements (tags, dots, badges) keep
their 1px micro-shadows.

**Cursor spotlight** (`static/js/spotlight.js`): any element with `.spot`
gets `--mx`/`--my` (px, relative to the element, typed via `@property` so
the glow glides) on pointermove; its `::before` overlay paints a static
diagonal sheen plus
`radial-gradient(260px circle at var(--mx) var(--my),
color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)`,
resting at opacity 0.5 and going to 1 on hover (sheen sweeps via
`background-position`). Skipped entirely under
`prefers-reduced-motion`. Static diagonal sheen lives on the same overlay.

**Grid canvas** (`static/js/grid.js`): interactive spring grid, 55px
spacing, mouse ripple + hover bloom. Reads `--grid-*` vars live and
re-reads on `themechange`. First frame adds `html.grid-live`, fading out
the static CSS underlay (`body:has(#grid-canvas)::before`). Reduced-motion
users get one static frame. Glass tuning: slightly larger/softer hover
bloom; base grid untouched.

## 4. Tools: studio & typing

`/studio/`, `templates/studio.html`, `static/js/studio/*.js`. Replaced the old
`/tool1/` compress page; `/tool1/` now renders `templates/redirect.html` and
bounces to `/studio/`, with the target in `content/tool1.md` front matter
(`extra.target`) and a canonical link.

**Everything runs in the tab.** No uploads, no backend — the site is static on
GitHub Pages, so any feature that needs a server cannot ship here.

Modules: `core.js` (pinned CDN loader, file queue, batch runner, zip),
`image.js` (decode/encode/resize/crop), `pdf.js` (pdf.js read + pdf-lib write),
`office.js` (mammoth/SheetJS + zip recompress), `crop.js` (crop box UI),
`app.js` (tabs + wiring). Engines load on first use, so the page ships almost
no JS; all CDN URLs are pinned in `core.js:CDN`.

Two upstream API traps, both already hit once — keep these in mind:
- pdf.js v6 **removed** `PDFDocumentProxy.destroy()`. Use `destroyDoc(doc)`,
  which goes through `doc.loadingTask.destroy()`.
- pdf.js **detaches** the buffer it is given. `openDocument()` always hands it
  a private copy; callers reuse the original bytes for pdf-lib.

Honest capability limits (surfaced in the UI, not hidden):
- Images ⇄ images, resize, crop, images→PDF, PDF→images, PDF page tools: full
  quality.
- PDF compression is two explicit modes: *metadata strip* (lossless, small
  savings) and *rasterise* (big savings, text stops being selectable).
- `unlock` decrypts via pdf.js, but pdf-lib cannot re-save an encrypted file,
  so the unlocked copy is rasterised. It says so in the result row.
- DOCX/XLSX → PDF/image is approximate (mammoth/SheetJS → HTML → SVG
  `foreignObject` → canvas). PDF→DOCX is not attempted.
- PPTX/PPTD/ODP and legacy binary `.doc`/`.rtf` are refused with a reason.
  There is no usable in-browser slide renderer, so this is a hard limit.

### Typing test (`/typing/`, `static/js/typing.js`)

Config lives on its own glass row (`.type-toolbar`) with labelled groups, not
beside the prompt. Live figures are a 3-up grid of `.type-stat` cells (timer /
wpm / accuracy) rather than values scattered to opposite corners; the timer
cell's label switches between "seconds left" and "words done" to match the mode.

Contract worth knowing if you touch it: `typing.js` writes **only bare numbers**
into `#live-timer`, `#live-wpm` and `#live-acc`, so units and labels must live in
*sibling* spans, never inside those elements.

`.type-words-viewport` masks its bottom edge, so a partial line fades out instead
of being sliced through the glyphs. On completion `.type-words` gets
`.test-done`, which collapses the typing area (it is reference, not a work area)
and the live strip is hidden — otherwise stale numbers sit above the results.

`.type-focus-overlay` and `.type-mobile-input` previously had **no CSS at all**:
the input painted a default white box on desktop and the hint never went away.
The overlay now keys off `.type-words.is-focused`, set from the focus/blur
listeners in `typing.js`.

## 5. Adding a theme

1. Copy a `[data-theme]` block, define **every** token in §1 (missing
   tokens silently inherit the previous theme — the classic bug).
2. Add the name to: boot-script list in `base.html`, `theme.js` VALID,
   theme menu buttons.
3. Add matching `--cat-*` ramp (dark tail → light ears, one hue).
4. Update `site.webmanifest` colors only if changing the default.
5. Rebuild (`zola build`), serve `public/`, screenshot every theme.

## 6. Checks before push

- `zola build` clean; no console errors.
- Every theme renders: cards legible over the grid (glass opacity!).
- Keyboard: focus rings visible; menus Esc-closable.
- `prefers-reduced-motion`: static grid, no spotlight, no typewriter.
- Mobile 390px: no horizontal overflow.
- Reading measure: `getComputedStyle` chars/line stays 45–75 on a chapter
  page for **all three** fonts (cycle with the font button). Panel, header,
  nav and back link must all report the same left edge and width.
- `zola build` after any template change — `body_class` block edits render
  nothing visible in dev if the build is stale.
