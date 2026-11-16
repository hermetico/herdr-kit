// Pure helpers for spotify-mini: no herdr imports, so `node test_logic.mjs` can load them.

const NL = "linefeed";

/** One osascript run: the Spotify app's state, or an empty line when it isn't running. It asks
 *  `is running` first, so it never launches Spotify. */
export const READ_SCRIPT = `if application "Spotify" is running then
  tell application "Spotify"
    try
      if player state is stopped then return "stopped"
      set t to current track
      return (player state as text) & ${NL} & (name of t) & ${NL} & (artist of t) & ${NL} & (album of t) & ${NL} & ((duration of t) div 1000) & ${NL} & (player position as integer) & ${NL} & (artwork url of t)
    on error
      return "stopped"
    end try
  end tell
end if
return ""`;

/** The commands the buttons send, as osascript lines. */
export const COMMAND = {
  previous: `tell application "Spotify" to previous track`,
  toggle: `tell application "Spotify" to playpause`,
  next: `tell application "Spotify" to next track`,
};

/** READ_SCRIPT's output as { state, title, artist, album, duration, position, art }, or null when
 *  Spotify isn't running. A stopped player has state "stopped" and no track. */
export function parseState(out) {
  const lines = String(out ?? "").replace(/\n$/, "").split("\n");
  const state = lines[0]?.trim();
  if (!state) return null;
  if (state === "stopped" || lines.length < 6) return { state: "stopped", title: null, artist: null, album: null, duration: 0, position: 0, art: null };
  const [, title, artist, album, duration, position, art] = lines;
  return { state, title, artist, album, duration: Number(duration) || 0, position: Number(position) || 0, art: artId(art) };
}

/** Seconds as m:ss. */
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Spotify's covers live at https://i.scdn.co/image/<id>. Only that shape is ever downloaded, and the
// id becomes a file name, so it must be plain letters and digits.
const ART = /^https:\/\/i\.scdn\.co\/image\/([A-Za-z0-9]{8,64})$/;

/** The cover's id from its URL, or null for anything else. */
export function artId(url) {
  return ART.exec(String(url ?? "").trim())?.[1] ?? null;
}

/** The cover's URL from its id. */
export const artUrl = (id) => `https://i.scdn.co/image/${id}`;

/** How far through the track, 0 to 1, counting the seconds since the last reading while playing. */
export function progress(now, sinceReadS) {
  if (!now?.duration) return 0;
  const at = now.position + (now.state === "playing" ? sinceReadS : 0);
  return Math.max(0, Math.min(1, at / now.duration));
}
