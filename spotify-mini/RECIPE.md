# Spotify mini

What Spotify is playing, with previous, play/pause and next, in Herdr's status bar. It talks to the
Spotify app on this Mac through AppleScript: no sign-in, no Premium, no network. When the app follows
another device through Spotify Connect, such as a phone, it shows and controls that playback too.

## What you see

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
- It reads every 3 s while the window is active and every 15 s otherwise.
- The buttons send `previous track`, `playpause` and `next track`, then read again at once.
- The first time, macOS asks whether Herdr may control Spotify. Without that permission the block
  stays empty.

## Built from

- `mods/spotify-mini/`: `main.js`, `logic.mjs` (the AppleScript and the parser), `test_logic.mjs`,
  `mod.json` `{ "place": "none", "title": "Spotify mini" }`, and five icons in `icons/`.
- Placed in the layout's status row:
  `{ "id": "spotify-mini", "type": "block", "size": { "px": 320 }, "content": { "mod": "spotify-mini" } }`.
- `herdr`: `exec`, `theme`, `window`, `checking`. Program: `osascript`.

## Watch out

- macOS only. It controls the Spotify app on this Mac; with that app closed, playback elsewhere
  doesn't show.
- AppleScript has no queue, playlists or search.

## Done when

- `node spotify-mini/mods/spotify-mini/test_logic.mjs` prints `ok` and
  `herdr-app check spotify-mini/mods/spotify-mini` passes.
- With a song playing, the bar shows its title and artist within 3 s; play/pause pauses it and the
  title dims; next moves to the next song.
- Quitting Spotify empties the block within 3 s, and Spotify doesn't start again by itself.
