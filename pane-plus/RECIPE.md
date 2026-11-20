# Pane plus

Herdr's pane header, cloned from the shipped `pane` mod of herdr-app 0.1.16, with three changes: a
zoomed pane is marked, a tab's only pane has no zoom button, and a pane whose machine is down says so.

## What you see

- The shipped header: the program's icon, the agent's name or the terminal's title, the folder in
  `dim`, the agent's status, and on hover the split right, split down, zoom and close buttons.
- **A zoomed pane:** the header is on `accent` at 8% instead of `background`, and its edge toward
  the terminal is a 1px dashed `accent` line instead of the solid `border` one. The zoom button
  shows the unzoom icon, in the same place.
- **A tab's only pane** has no zoom button, since zooming it changes nothing. A zoomed pane always
  keeps it, so there's a way back.

- **A pane on a machine that isn't connected** gets a 12px mark at the header's left edge, before the program's icon: a
  dashed ring in `ansi4` blue that turns slowly while it reconnects, so it never looks like the
  agent's spinner, an `accent` fingerprint while it logs in, a `blocked` no-signal icon while it's
  unreachable, an `accent` fingerprint while it needs a login. Its tooltip names the machine, the
  state and how long, like `gpu-box: reconnecting · 12 s`. Local and connected panes show nothing.

## Built from

- `mods/pane-plus/`: `main.js`, `mod.json`, the shipped header's five icons, `wifi-off.svg` and `fingerprint.svg` from lucide, and
  `dashed-spinner.svg`.
- `herdr`: `panes` for `zoomed` and the other panes of the tab, `spaces` for the pane's machine,
  `shared("machines.status")`, which spaces-plus fills, and `machines` when it isn't there, `layout` for the header's position,
  `run("pane.zoom")`, `pane.split`, `pane.close`, `pane.focus`.
- Placed as the header of the layout's pane frames:

  ```json
  { "tab": "active", "pane": { "header": { "content": { "mod": "pane-plus" }, "height": 30, "position": "top" } } }
  ```

## Install

Copy `mods/pane-plus` into `~/.config/herdr-app/mods/`, then name it in your layout's pane header
in place of `pane`.

## Watch out

- Herdr draws the pane frame itself, with only a width and a color for the border and the focused
  border. Neither can be dashed or change on zoom, so the mark lives in the header.
- Without spaces-plus, a pane only learns that its machine is unavailable, so every down state gets
  the no-signal icon. A shared status that says a machine is down while its layout is ready is
  taken as stale and ignored, unless it's a brief reconnect.
- When herdr-app updates its own `pane` mod, compare it with this one and carry the changes over.

## Done when

- `herdr-app check pane-plus/mods/pane-plus` passes.
- Zooming a pane turns its header accent-tinted with a dashed accent line; unzooming restores it.
- Hovering the header of a tab's only pane shows split and close but no zoom.
