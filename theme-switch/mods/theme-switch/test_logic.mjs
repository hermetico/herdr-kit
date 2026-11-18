// Self-check for theme-switch's helpers: node mods/theme-switch/test_logic.mjs
import assert from "node:assert/strict";
import { appearanceAfterPick, groups, halves, withAppearance } from "./logic.mjs";

const th = (name, light = false) => ({ name, light, colors: {} });
const g = groups([th("graphite"), th("catppuccin-latte", true), th("catppuccin-mocha"), th("ayu-light", true), th("win98", true), th("catppuccin-frappe")], ["main", "win98"]);
assert.deepEqual(g.map((x) => x.name), ["Catppuccin", "Ayu", "Herdr"]);
assert.deepEqual(g[0].items.map((x) => x.label), ["Mocha", "Frappé", "Latte"]);
assert.equal(g[2].items[0].label, "Graphite");
assert.ok(!g.flatMap((x) => x.items).some((x) => x.name === "win98"));

assert.deepEqual(halves({ light: "a", dark: "b" }, []), { light: "a", dark: "b" });
assert.deepEqual(halves("paper", [th("paper", true)]), { light: "paper", dark: null });
assert.deepEqual(halves(undefined, []), { light: null, dark: null });

assert.equal(JSON.parse(withAppearance('{"zoom":1}', "dark")).appearance, "dark");
assert.equal(JSON.parse(withAppearance('{"zoom":1,"appearance":"dark"}', "system")).appearance, undefined);
assert.equal(JSON.parse(withAppearance('{"zoom":1}', "system")).zoom, 1);

assert.equal(appearanceAfterPick("system", true), null);
assert.equal(appearanceAfterPick("dark", true), "light");
assert.equal(appearanceAfterPick("light", true), null);
console.log("ok");
