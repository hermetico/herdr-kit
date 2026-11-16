# Keep awake

A cup in Herdr's status bar. Click it and macOS keeps the display and the machine awake; click again
and it may sleep. It never leaves a process behind: when Herdr quits, the Mac may sleep again within
half a minute.

## What you see

- An 18px cup icon, centered in a 36px status-bar block on `chrome` with a 1px `border` line on top
  and on its left, in a 4px padded button with 5px corners. It sits at the right end of the status row.
- Off: the cup in `dim`, `foreground` on hover. Tooltip "Keep the display awake".
- On: a filled cup, `cup-on.svg`, in `accent` on `raised`. Tooltip "Keeping the display awake. Click to let it sleep."
- On Linux and Windows the block stays empty.

## How it behaves

- The state is shared `keep-awake.on`, so it survives restarts and every copy agrees.
- While on, every 20 s it runs `caffeinate -d -i -t 25`: display and idle sleep are held for 25 s,
  renewed before they run out. Turning it off stops the renewals, so the last hold ends within 25 s.

## Built from

- `mods/keep-awake/`: `main.js`, `mod.json` `{ "place": "none", "title": "Keep awake" }`, `cup.svg` and `cup-on.svg`.
- Placed in the layout's status row:
  `{ "id": "keep-awake", "type": "block", "size": { "px": 36 }, "content": { "mod": "keep-awake" } }`.
- `herdr`: `exec`, `shared`, `setShared`, `theme`, `window`, `checking`. Program: `caffeinate`.

## Watch out

- Herdr's `exec` stops a command after 30 s, which is why the hold is short and renewed rather than
  one long `caffeinate`.
- `herdr-app check` runs `init` for real: it returns early under `checking()`.

## Done when

- `herdr-app check keep-awake/mods/keep-awake` passes.
- Clicking the cup turns it `accent`, and `pmset -g assertions` lists `caffeinate` holding
  `PreventUserIdleDisplaySleep` within 20 s.
- Clicking again turns it `dim`, and the assertion is gone within 25 s.
