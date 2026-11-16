// Self-check for spotify-mini's helpers: node spotify-mini/mods/spotify-mini/test_logic.mjs
import assert from "node:assert/strict";
import { COMMAND, READ_SCRIPT, artId, artUrl, clock, parseState, progress } from "./logic.mjs";

assert.equal(parseState(""), null);
assert.equal(parseState("\n"), null);
assert.deepEqual(parseState("stopped\n"), { state: "stopped", title: null, artist: null, album: null, duration: 0, position: 0, art: null });
assert.deepEqual(parseState("playing\nSong\nBand\nRecord\n215\n42\nhttps://i.scdn.co/image/ab67616d0000b273abc123\n"), { state: "playing", title: "Song", artist: "Band", album: "Record", duration: 215, position: 42, art: "ab67616d0000b273abc123" });
assert.equal(parseState("paused\nSong\nBand\nRecord\n215\n42").state, "paused");
assert.equal(clock(0), "0:00");
assert.equal(clock(215), "3:35");
assert.match(READ_SCRIPT, /is running/);
assert.ok(Object.values(COMMAND).every((c) => c.startsWith('tell application "Spotify"')));
assert.equal(artId("https://i.scdn.co/image/ab67616d0000b273abc123"), "ab67616d0000b273abc123");
assert.equal(artId("https://evil.example/image/ab67616d0000b273abc123"), null);
assert.equal(artId("https://i.scdn.co/image/../../etc/passwd"), null);
assert.equal(artId(""), null);
assert.equal(artUrl("abc12345"), "https://i.scdn.co/image/abc12345");
const song = { state: "playing", duration: 200, position: 50 };
assert.equal(progress(song, 0), 0.25);
assert.equal(progress(song, 50), 0.5);
assert.equal(progress({ ...song, state: "paused" }, 50), 0.25);
assert.equal(progress({ ...song, position: 199 }, 10), 1);
assert.equal(progress(null, 0), 0);
console.log("ok");
