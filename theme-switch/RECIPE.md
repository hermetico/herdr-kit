# Theme switch

A palette in Herdr's status bar. Click it for a menu of every theme, grouped by family, with Light,
Dark and System at the top. A pick changes the colors of the layout on screen and nothing else: the
layout stays. It comes with eleven themes: Catppuccin, Tokyo Night and Ayu in all their variants.

## What you see

- A 17px palette icon, centered in a 36px status-bar block on `chrome` with a 1px `border` line on
  top and on its left, in a 4px padded button with 5px corners. `dim`, `foreground` on hover,
  tooltip "Theme".
- The menu is a 300×560 popup at the pointer, on `popover`:
  - A segmented control: Light, Dark, System. The current one is `foreground` on `selected`.
  - The themes under small uppercase family headings in `dim`: Catppuccin, Tokyo Night, Ayu, then
    every other theme under Herdr. Variants are listed dark to light: Mocha, Macchiato, Frappé,
    Latte; Night, Storm, Moon, Day; Dark, Mirage, Light.
  - Each row is 28px: four 10px swatches for the theme's background, accent, green and red, its
    name, "light" or "dark" in `dim`, and an `accent` check on the theme in use for its lightness.
    That row is on `selected`.

## How it behaves

- A pick runs `app.theme {name}`, which sets the shown layout's light or dark theme, whichever the
  theme is. The other half stays.
- Light, Dark and System write `appearance` in `settings.json`: `"light"`, `"dark"`, or no key at
  all to follow macOS.
- Picking a light theme while the appearance is fixed to Dark switches it to Light, and the other
  way round, so the pick always shows. With System it keeps following macOS.
- Themes owned by a layout, such as `win98`, are left out.

## The themes

`themes/*.json`, eleven files in Herdr's theme format:

- Terminal colors, cursor and selection come from each variant's Alacritty file at
  terminalcolors.com.
- Catppuccin's panel colors are its own named shades: crust, mantle, surface0–2, overlay0–1,
  subtext0.
- Tokyo Night's and Ayu's panel colors are mixed from the theme's background and foreground, so
  every theme has the same contrast steps.
- The accent is the theme's blue, except Ayu, whose accent is its yellow.

## Built from

- `mods/theme-switch/`:
  - `main.js`: the status button, and the menu when it opens as a popup.
  - `logic.mjs`: grouping, the light and dark halves, and the `settings.json` edit. It has no
    Herdr imports, so `test_logic.mjs` runs it under node.
  - `mod.json`: `{ "place": "none", "title": "Theme switch" }`, plus the overlay size.
  - Two icons: `palette.svg` and `check.svg`, both lucide.
- Placed in the layout's status row:
  `{ "id": "theme-switch", "type": "block", "size": { "px": 36 }, "content": { "mod": "theme-switch" } }`.
- `herdr`:
  - Reads: `themes`, `layout`, `layouts`, `settings`, `theme`.
  - Commands: `run("app.theme")`.
  - Overlays: `openOverlay`, `props`.
  - Files and messages: `readTextFile`, `writeTextFile`, `appHome`, `notify`.

## Install

Copy `mods/theme-switch` into `~/.config/herdr-app/mods/` and the files in `themes/` into
`~/.config/herdr-app/themes/`, then add the block to your layout's status row.

## Watch out

- A layout that sets its own `colors` overrides every theme. Take them out of the layout's root to
  let the switcher work.
- A theme named like a layout belongs to that layout, so don't name one after a layout.

## Done when

- `node theme-switch/mods/theme-switch/test_logic.mjs` prints `ok`, and `herdr-app check
  theme-switch/mods/theme-switch` passes.
- Clicking the palette opens the menu with all eleven themes plus Herdr's own.
- Picking Ayu Mirage turns the window Ayu Mirage, and `layouts()` and the shown layout are
  unchanged.
- Dark with a light theme picked switches `appearance` to `"light"` in `settings.json`, and System
  removes the key.
