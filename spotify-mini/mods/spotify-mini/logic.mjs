// Pure helpers for spotify-mini: no herdr imports, so `node test_logic.mjs` can load them.

const NL = "linefeed";

/** One osascript run: the Spotify app's state, or an empty line when it isn't running. It asks
 *  `is running` first, so it never launches Spotify. */
export const READ_SCRIPT = `if application "Spotify" is running then
  tell application "Spotify"
    try
      if player state is stopped then return "stopped"
      set t to current track
      return (player state as text) & ${NL} & (name of t) & ${NL} & (artist of t) & ${NL} & (album of t) & ${NL} & ((duration of t) div 1000) & ${NL} & (player position as integer)
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

/** READ_SCRIPT's output as { state, title, artist, album, duration, position }, or null when
 *  Spotify isn't running. A stopped player has state "stopped" and no track. */
export function parseState(out) {
  const lines = String(out ?? "").replace(/\n$/, "").split("\n");
  const state = lines[0]?.trim();
  if (!state) return null;
  if (state === "stopped" || lines.length < 6) return { state: "stopped", title: null, artist: null, album: null, duration: 0, position: 0 };
  const [, title, artist, album, duration, position] = lines;
  return { state, title, artist, album, duration: Number(duration) || 0, position: Number(position) || 0 };
}

/** Seconds as m:ss. */
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
