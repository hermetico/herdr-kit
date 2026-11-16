// Self-check for spotify-mini's helpers: node spotify-mini/mods/spotify-mini/test_logic.mjs
import assert from "node:assert/strict";
import { COMMAND, READ_SCRIPT, clock, parseState } from "./logic.mjs";

assert.equal(parseState(""), null);
assert.equal(parseState("\n"), null);
assert.deepEqual(parseState("stopped\n"), { state: "stopped", title: null, artist: null, album: null, duration: 0, position: 0 });
assert.deepEqual(parseState("playing\nSong\nBand\nRecord\n215\n42\n"), { state: "playing", title: "Song", artist: "Band", album: "Record", duration: 215, position: 42 });
assert.equal(parseState("paused\nSong\nBand\nRecord\n215\n42").state, "paused");
assert.equal(clock(0), "0:00");
assert.equal(clock(215), "3:35");
assert.match(READ_SCRIPT, /is running/);
assert.ok(Object.values(COMMAND).every((c) => c.startsWith('tell application "Spotify"')));
console.log("ok");
