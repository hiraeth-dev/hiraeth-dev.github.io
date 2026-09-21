# Hiraeth Design System

Single source of truth for how the site looks. Update this file when the
visual system changes — future edits (human or agent) follow it.

## 1. Tokens (`static/style.css`, `:root` + `[data-theme="…"]`)

Base palette per theme — every theme **must** define all of these:

| Token family | Tokens |
|---|---|
| Surfaces | `--bg`, `--bg-panel`, `--bg-panel-alt`, `--bg-glow`, `--bg-core` |
| Text | `--fg`, `--fg-dim`, `--fg-muted` |
| Lines | `--border`, `--border-strong` |
| Accents | `--accent`, `--accent-bright`, `--accent-soft`, `--accent-dim` |
| Links | `--link`, `--link-hover`, `--focus-ring` |
| Grid canvas | `--grid-fade`, `--grid-line`, `--grid-dot` |
| Card bars | `--bar-a`, `--bar-b`, `--bar-c` |
| Status | `--orange`, `--orange-deep`, `--red`, `--red-deep`, `--cyan`, `--cyan-deep`, `--yellow` |
| Logo cat | `--cat-dark`, `--cat-mid`, `--cat-base`, `--cat-light` |
| Legacy logo | `--logo-disc`, `--logo-eye`, `--logo-edge`, `--logo-iris`, `--logo-pupil` |
| Type | `--font-mono`, `--font-read`, `--text-xs/sm/base/lg/xl/2xl`, `--content-w{-wide,-list}` |

Fonts switch via `html[data-font="iosevka"]`, which also bumps root
`font-size` to 110%. Default theme is `emerald`, default font `iosevka`; boot script in
`templates/base.html` sets `data-theme`/`data-font` pre-paint from
`?theme=`/`?font=` params, else `localStorage`, else defaults.

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

## 2. Component recipes

**Glass panel** (terminal, novel/stack/stat/chapter cards, playlist,
code-block, dict-result, theme-menu, dict-meaning-item):
```css
background: var(--glass-bg);
backdrop-filter: blur(var(--glass-blur)) saturate(140%);
-webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
border: 1px solid var(--border);
box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-hi);
```

**Cards** (novel/stack/stat/chapter): lift on hover —
`transform: translateY(-2px)`, shadow → `--glass-shadow-hover`,
border-color → accent-tinted. Keep the bottom `::after` accent-bar sweep.

**Buttons / nav links** (controls, press affordance kept):
hover `translate(1px,1px)` + accent border; active `translate(3px,3px)`
with shadow collapsing to `0`. Small elements (tags, dots, badges) keep
their 1px micro-shadows.

**Cursor spotlight** (`static/js/spotlight.js`): any element with `.spot`
gets `--mx`/`--my` (px, relative to the element) on pointermove; its
`::before` overlay paints a static diagonal sheen plus
`radial-gradient(260px circle at var(--mx) var(--my),
color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)`,
fading in on hover. Skipped entirely under
`prefers-reduced-motion`. Static diagonal sheen lives on the same overlay.

**Grid canvas** (`static/js/grid.js`): interactive spring grid, 55px
spacing, mouse ripple + hover bloom. Reads `--grid-*` vars live and
re-reads on `themechange`. First frame adds `html.grid-live`, fading out
the static CSS underlay (`body:has(#grid-canvas)::before`). Reduced-motion
users get one static frame. Glass tuning: slightly larger/softer hover
bloom; base grid untouched.

## 3. Adding a theme

1. Copy a `[data-theme]` block, define **every** token in §1 (missing
   tokens silently inherit the previous theme — the classic bug).
2. Add the name to: boot-script list in `base.html`, `theme.js` VALID,
   theme menu buttons.
3. Add matching `--cat-*` ramp (dark tail → light ears, one hue).
4. Update `site.webmanifest` colors only if changing the default.
5. Rebuild (`zola build`), serve `public/`, screenshot every theme.

## 4. Checks before push

- `zola build` clean; no console errors.
- Every theme renders: cards legible over the grid (glass opacity!).
- Keyboard: focus rings visible; menus Esc-closable.
- `prefers-reduced-motion`: static grid, no spotlight, no typewriter.
- Mobile 390px: no horizontal overflow.
