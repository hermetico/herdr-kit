# Spotify mini

What Spotify is playing, with previous, play/pause and next: a miniplayer with the cover and a
progress bar in Herdr's sidebar, or a compact slot in the status bar. It talks to the Spotify app on
this Mac through AppleScript: no sign-in and no Premium. The only network use is downloading each
album cover once from Spotify's image server. When the app follows
another device through Spotify Connect, such as a phone, it shows and controls that playback too.

## What you see

**The miniplayer**, a sidebar block 86px tall on `chrome` with a 1px `border` line on top, 12px side
and 10px vertical padding:

- A row: the 44px cover with 6px corners (a `dim` note on `raised` until it's downloaded), the title
  at 12.5px semibold (`foreground`, or `muted` when paused) over the artist at 11.5px `dim`, both
  cut to fit, and the three buttons at 12px, play/pause 14px.
- Under it, 10.5px `dim`: the elapsed time, a 3px bar on `border` filled in `ansi2` (`dim` when
  paused), and the track's length.
- Clicking the cover or the title brings the Spotify app to the front.
- The block hides itself while Spotify has nothing loaded, and shows again when it does.

**The status-bar slot**:

- A status-bar block on `chrome` with a 1px `border` line on top, 11.8px text, its content
  right-aligned: a 12px note icon (`ansi2` while playing, `dim` when paused), the title
  (`foreground`, or `dim` when paused), `·` and the artist in `dim`, then three 11px buttons in
  `muted`: previous, play or pause, next.
- Hovering the title shows the album, `position / duration` as `m:ss`, and "paused" when it is.
- Nothing when Spotify isn't running, has nothing loaded, or the platform isn't macOS.

## How it behaves

- One `osascript` run reads the state: it asks `application "Spotify" is running` first, so it never
  launches Spotify, then returns the player state, title, artist, album, duration and position, one
  per line. About 0.15 s.
- It reads every 3 s while the window is active and every 15 s otherwise. While a song plays the
  miniplayer redraws every second, moving the progress bar from the last reading.
- Covers: the reading includes the cover's `artwork url`. Only `https://i.scdn.co/image/<id>` with a
  plain id is accepted; `curl` saves it once as `~/.config/herdr-app/data/spotify-mini/art/<id>.jpg`,
  which `image()` draws.
- The miniplayer's props name its own block (`"block"`): it runs `layout.hide` on that id when no
  track is loaded and `layout.show` when one is. A hidden copy keeps running, so it can show again.
- The buttons send `previous track`, `playpause` and `next track`, then read again at once.
- The first time, macOS asks whether Herdr may control Spotify. Without that permission the block
  stays empty.

## Built from

- `mods/spotify-mini/`: `main.js`, `logic.mjs` (the AppleScript and the parser), `test_logic.mjs`,
  `mod.json` `{ "place": "none", "title": "Spotify mini" }`, and five icons in `icons/`.
- The miniplayer, in the sidebar column above its footer:
  `{ "id": "spotify-player", "type": "block", "size": { "px": 86 }, "content": { "mod": "spotify-mini", "props": { "mode": "player", "block": "spotify-player" } } }`.
- Or the slot, in the status row:
  `{ "id": "spotify-mini", "type": "block", "size": { "px": 320 }, "content": { "mod": "spotify-mini" } }`.
- `herdr`: `exec`, `run` (`layout.show`, `layout.hide`), `appHome`, `props`, `theme`, `window`,
  `checking`. Programs: `osascript`, `curl`, `open`.

## Watch out

- macOS only. It controls the Spotify app on this Mac; with that app closed, playback elsewhere
  doesn't show.
- AppleScript has no queue, playlists or search.
- `image()` draws local files only, hence the cover download. Covers are never deleted; each is
  about 30 KB.
- Don't start the miniplayer's block hidden: a copy starts the first time its block shows.

## Done when

- `node spotify-mini/mods/spotify-mini/test_logic.mjs` prints `ok` and
  `herdr-app check spotify-mini/mods/spotify-mini` passes.
- With a song playing, the bar shows its title and artist within 3 s; play/pause pauses it and the
  title dims; next moves to the next song.
- Quitting Spotify empties the block within 3 s, and Spotify doesn't start again by itself.
