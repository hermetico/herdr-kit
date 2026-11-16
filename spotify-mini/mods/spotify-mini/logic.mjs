// Pure helpers for spotify-mini: no herdr imports, so `node test_logic.mjs` can load them.

const NL = "linefeed";

/** One osascript run: the Spotify app's state, or an empty line when it isn't running. It asks
 *  `is running` first, so it never launches Spotify. One field per line, in FIELDS order. */
export const READ_SCRIPT = `if application "Spotify" is running then
  tell application "Spotify"
    try
      if player state is stopped then return "stopped"
      set t to current track
      return (player state as text) & ${NL} & (name of t) & ${NL} & (artist of t) & ${NL} & (album of t) & ${NL} & ((duration of t) div 1000) & ${NL} & (player position as integer) & ${NL} & (artwork url of t) & ${NL} & (track number of t) & ${NL} & shuffling & ${NL} & repeating & ${NL} & sound volume & ${NL} & (id of t)
    on error
      return "stopped"
    end try
  end tell
end if
return ""`;

const STOPPED = { state: "stopped", title: null, artist: null, album: null, duration: 0, position: 0, art: null, track: null, shuffle: false, repeat: false, volume: null, id: null };

/** READ_SCRIPT's output as { state, title, artist, album, duration, position, art, track, shuffle,
 *  repeat, volume, id }, or null when Spotify isn't running. A stopped player has no track. */
export function parseState(out) {
  const lines = String(out ?? "").replace(/\n$/, "").split("\n");
  const state = lines[0]?.trim();
  if (!state) return null;
  if (state === "stopped" || lines.length < 6) return { ...STOPPED };
  const [, title, artist, album, duration, position, art, track, shuffle, repeat, volume, id] = lines;
  const num = (v) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    state, title, artist, album,
    duration: num(duration) ?? 0, position: num(position) ?? 0,
    art: artId(art), track: num(track) || null,
    shuffle: shuffle === "true", repeat: repeat === "true",
    volume: num(volume), id: trackId(id),
  };
}

// ---- commands: every value that goes into a script or a URL is checked first ----

const whole = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/** The osascript line for a button or slider, or null for anything unknown. */
export function command(name, value) {
  const tell = (what) => `tell application "Spotify" to ${what}`;
  switch (name) {
    case "previous": return tell("previous track");
    case "toggle": return tell("playpause");
    case "next": return tell("next track");
    case "shuffle": return tell("set shuffling to not shuffling");
    case "repeat": return tell("set repeating to not repeating");
    case "seek": return tell(`set player position to ${whole(value, 0, 24 * 3600)}`);
    default: return null;
  }
}

// Spotify's covers live at https://i.scdn.co/image/<id>. Only that shape is ever downloaded, and the
// id becomes a file name, so it must be plain letters and digits.
const ART = /^https:\/\/i\.scdn\.co\/image\/([A-Za-z0-9]{8,64})$/;

/** The cover's id from its URL, or null for anything else. */
export const artId = (url) => ART.exec(String(url ?? "").trim())?.[1] ?? null;

/** The cover's URL from its id. */
export const artUrl = (id) => `https://i.scdn.co/image/${id}`;

/** A track's id from `spotify:track:<22 base-62 characters>`, or null (local files, ads, podcasts). */
export const trackId = (uri) => /^spotify:track:([A-Za-z0-9]{22})$/.exec(String(uri ?? "").trim())?.[1] ?? null;

/** The web link to a track, for Copy link. */
export const trackLink = (id) => `https://open.spotify.com/track/${id}`;

/** The app link to a track, for Open in Spotify. */
export const trackUri = (id) => `spotify:track:${id}`;

// ---- time ----

/** Seconds as m:ss. */
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Seconds into the track now, counting the time since the last reading while it plays. */
export function elapsed(now, sinceReadS) {
  if (!now?.duration) return 0;
  return Math.max(0, Math.min(now.duration, now.position + (now.state === "playing" ? sinceReadS : 0)));
}

/** How far through the track, 0 to 1. */
export const progress = (now, sinceReadS) => (now?.duration ? elapsed(now, sinceReadS) / now.duration : 0);

// ---- scrolling names ----
// A name too long for its box pans to its end, rests, pans back, rests. The pan itself is a native
// transition; the mod only flips its target, once per pan.

/** Pixels per second while panning, and the rest at each end. */
export const PAN = { speed: 30, restMs: 2500, minMs: 600 };

/** How long one pan of `overflow` pixels takes, in ms. */
export const panMs = (overflow) => Math.max(PAN.minMs, Math.round((overflow / PAN.speed) * 1000));

/** Whether a name at `phase` (0: start, 1: end) should flip, `sinceFlipMs` after its last flip. */
export const panDue = (overflow, sinceFlipMs) => overflow > 0 && sinceFlipMs >= panMs(overflow) + PAN.restMs;
