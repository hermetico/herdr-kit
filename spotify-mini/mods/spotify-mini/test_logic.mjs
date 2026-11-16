// Self-check for spotify-mini's helpers: node spotify-mini/mods/spotify-mini/test_logic.mjs
import assert from "node:assert/strict";
import { PAN, READ_SCRIPT, artId, artUrl, clock, command, elapsed, panDue, panMs, parseState, progress, trackId, trackLink, trackUri } from "./logic.mjs";

// Reading
assert.equal(parseState(""), null);
assert.equal(parseState("\n"), null);
assert.equal(parseState("stopped\n").state, "stopped");
assert.equal(parseState("stopped\n").title, null);
const full = parseState("playing\nSong\nBand\nRecord\n215\n42\nhttps://i.scdn.co/image/ab67616d0000b273abc123\n6\nfalse\ntrue\n64\nspotify:track:7CiBrNzJrRDCx0viAECy3e\n");
assert.deepEqual(full, {
  state: "playing", title: "Song", artist: "Band", album: "Record", duration: 215, position: 42,
  art: "ab67616d0000b273abc123", track: 6, shuffle: false, repeat: true, volume: 64, id: "7CiBrNzJrRDCx0viAECy3e",
});
// A local file: no cover, no Spotify id.
const local = parseState("paused\nDemo\nMe\nTapes\n100\n5\nmissing value\n0\ntrue\nfalse\n30\nspotify:local:Me:Tapes:Demo:100\n");
assert.equal(local.art, null);
assert.equal(local.id, null);
assert.equal(local.track, null);
assert.equal(local.shuffle, true);
assert.match(READ_SCRIPT, /is running/);

// Commands, with their values clamped to whole numbers in range
assert.equal(command("toggle"), 'tell application "Spotify" to playpause');
assert.equal(command("volume", 64.6), 'tell application "Spotify" to set sound volume to 65');
assert.equal(command("volume", 400), 'tell application "Spotify" to set sound volume to 100');
assert.equal(command("volume", "1; do shell script \"x\""), 'tell application "Spotify" to set sound volume to 0');
assert.equal(command("seek", 95.2), 'tell application "Spotify" to set player position to 95');
assert.equal(command("seek", -3), 'tell application "Spotify" to set player position to 0');
assert.equal(command("shuffle"), 'tell application "Spotify" to set shuffling to not shuffling');
assert.equal(command("rm -rf"), null);

// Links, accepted only in Spotify's own shapes
assert.equal(artId("https://i.scdn.co/image/ab67616d0000b273abc123"), "ab67616d0000b273abc123");
assert.equal(artId("https://evil.example/image/ab67616d0000b273abc123"), null);
assert.equal(artId("https://i.scdn.co/image/../../etc/passwd"), null);
assert.equal(artUrl("abc12345"), "https://i.scdn.co/image/abc12345");
assert.equal(trackId("spotify:track:7CiBrNzJrRDCx0viAECy3e"), "7CiBrNzJrRDCx0viAECy3e");
assert.equal(trackId("spotify:track:short"), null);
assert.equal(trackId("spotify:episode:7CiBrNzJrRDCx0viAECy3e"), null);
assert.equal(trackLink("7CiBrNzJrRDCx0viAECy3e"), "https://open.spotify.com/track/7CiBrNzJrRDCx0viAECy3e");
assert.equal(trackUri("7CiBrNzJrRDCx0viAECy3e"), "spotify:track:7CiBrNzJrRDCx0viAECy3e");

// Time
assert.equal(clock(0), "0:00");
assert.equal(clock(215), "3:35");
const song = { state: "playing", duration: 200, position: 50 };
assert.equal(elapsed(song, 10), 60);
assert.equal(elapsed({ ...song, state: "paused" }, 10), 50);
assert.equal(elapsed({ ...song, position: 199 }, 10), 200);
assert.equal(progress(song, 50), 0.5);
assert.equal(progress(null, 0), 0);

// Scrolling names: a pan at PAN.speed, then a rest, never faster than PAN.minMs
assert.equal(panMs(60), 2000);
assert.equal(panMs(3), PAN.minMs);
assert.ok(!panDue(0, 99999));
assert.ok(!panDue(60, 2000 + PAN.restMs - 1));
assert.ok(panDue(60, 2000 + PAN.restMs));

console.log("ok");
