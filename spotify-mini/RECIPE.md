# Spotify mini

What Spotify is playing, with previous, play/pause and next: a miniplayer with the cover and a
progress bar in Herdr's sidebar, or a compact slot in the status bar. It talks to the Spotify app on
this Mac through AppleScript: no sign-in and no Premium. The only network use is downloading each
album cover once from Spotify's image server. When the app follows
another device through Spotify Connect, such as a phone, it shows and controls that playback too.

## What you see

**The player**, a sidebar block on `chrome` with a 1px `border` line on top, 12px side and 10px
vertical padding, compact or expanded as kept in shared `spotify-mini.expanded`:

- **Compact**, 66px: the 44px cover, then the title at 12.5px semibold (`foreground`, `muted` when
  paused), the artist at 11.5px `dim` and `elapsed / length` at 10.5px `dim`. On the right, an Open
  icon and a chevron that expands it, both `dim`, above previous, play/pause and next.
- **Expanded**, 226px: "NOW PLAYING" in 10.5px `dim` with a chevron that collapses it; the 88px cover
  beside the title (13.5px semibold), the artist (12px `muted`) and `album · track N` (11px `dim`),
  with Copy link and Open under them; then shuffle, previous, a 30px round play/pause on
  `foreground`, next and repeat, the toggles in `ansi2` while on; then a seek slider (3px groove on
  `border`, fill in `ansi2`, `dim` when paused, a 10px `foreground` knob centred on the groove with
  `ml(-5)` and `mt(-3.5)`) with the times under it.
- **Big cover**, in expanded mode: an 18px chip in the cover's bottom-right corner, on `chrome` at 80%
  opacity, grows the cover to the block's width inside its padding, with the text and links under
  it; the block grows to that side plus 216px. The chip then shrinks it back. Kept in shared
  `spotify-mini.big-cover`; the block's width comes from `on_size_change`, so resizing the sidebar
  resizes the cover.
- Names too long for their box pan to their end at 30px/s, rest 2.5 s, pan back, rest, and so on.
  Short names stay still.
- Only the Open button opens the track in the Spotify app; the cover and names don't react to
  clicks. Copy link copies its `https://open.spotify.com/track/<id>` link.
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
  launches Spotify, then returns the player state, title, artist, album, duration, position, cover
  URL, track number, shuffle, repeat, volume and track id, one per line. About 0.15 s.
- It reads every 3 s while the window is active and every 15 s otherwise. While a song plays the
  player redraws every second, moving the time and the seek slider from the last reading.
- Commands are built by `command()` from a fixed list; the seek value is a clamped whole number, so
  nothing else reaches osascript. The seek slider sends its value once, on release.
- Scrolling names: each one's box and text widths are measured with `on_size_change`. The pan is a
  native `transition` on `left`; a once-a-second check flips its target when the last pan plus the
  rest has passed, so nothing redraws per frame.
- Covers: the reading includes the cover's `artwork url`. Only `https://i.scdn.co/image/<id>` with a
  plain id is accepted; `curl` saves it once as `~/.config/herdr-app/data/spotify-mini/art/<id>.jpg`,
  which `image()` draws.
- The player's props name its own block (`"block"`): it runs `layout.hide` on that id when no track
  is loaded, `layout.show` when one is, and `layout.resize` to 66px, 226px, or the big cover's side plus 216px. A hidden
  copy keeps running, so it can show again.
- The buttons send `previous track`, `playpause` and `next track`, then read again at once.
- The first time, macOS asks whether Herdr may control Spotify. Without that permission the block
  stays empty.

## Built from

- `mods/spotify-mini/`: `main.js`, `logic.mjs` (the AppleScript and the parser), `test_logic.mjs`,
  `mod.json` `{ "place": "none", "title": "Spotify mini" }`, and five icons in `icons/`.
- The miniplayer, in the sidebar column above its footer:
  `{ "id": "spotify-player", "type": "block", "size": { "px": 66 }, "content": { "mod": "spotify-mini", "props": { "mode": "player", "block": "spotify-player" } } }`.
- Or the slot, in the status row:
  `{ "id": "spotify-mini", "type": "block", "size": { "px": 320 }, "content": { "mod": "spotify-mini" } }`.
- `herdr`: `exec`, `run` (`layout.show`, `layout.hide`, `layout.resize`), `appHome`, `props`,
  `shared`, `setShared`, `theme`, `window`, `checking`. `gpui-base`: `Slider` and its parts. Programs: `osascript`, `curl`, `open`.

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
