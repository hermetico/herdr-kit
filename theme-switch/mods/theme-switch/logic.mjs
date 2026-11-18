// Pure helpers for theme-switch: no herdr imports, so `node test_logic.mjs` can load them.

/** Theme families, in the order the menu lists them, each with its variants in order. */
export const FAMILIES = [
  { name: "Catppuccin", prefix: "catppuccin-", order: ["mocha", "macchiato", "frappe", "latte"] },
  { name: "Tokyo Night", prefix: "tokyo-night-", order: ["night", "storm", "moon", "day"] },
  { name: "Ayu", prefix: "ayu-", order: ["dark", "mirage", "light"] },
];

const LABELS = { frappe: "Frappé" };
const title = (s) => s.split("-").map((w) => LABELS[w] ?? w[0].toUpperCase() + w.slice(1)).join(" ");

/** The themes as menu groups: the families first, then every other theme under "Herdr".
 *  Themes owned by a layout, such as win98, are left out. Each item is { name, label, light, colors }. */
export function groups(themes, layoutNames = []) {
  const owned = new Set(layoutNames);
  const left = themes.filter((t) => !owned.has(t.name));
  const out = [];
  for (const f of FAMILIES) {
    const items = left.filter((t) => t.name.startsWith(f.prefix))
      .map((t) => ({ ...t, label: title(t.name.slice(f.prefix.length)) }))
      .sort((a, b) => rank(f, a.name) - rank(f, b.name));
    if (items.length) out.push({ name: f.name, items });
  }
  const rest = left.filter((t) => !FAMILIES.some((f) => t.name.startsWith(f.prefix))).map((t) => ({ ...t, label: title(t.name) }));
  if (rest.length) out.push({ name: "Herdr", items: rest });
  return out;
}
const rank = (f, name) => { const i = f.order.indexOf(name.slice(f.prefix.length)); return i < 0 ? 99 : i; };

/** A layout's theme as { light, dark }: a single name fills the half its lightness says. */
export function halves(theme, themes) {
  if (!theme) return { light: null, dark: null };
  if (typeof theme === "object") return { light: theme.light ?? null, dark: theme.dark ?? null };
  const light = themes.find((t) => t.name === theme)?.light;
  return light ? { light: theme, dark: null } : { light: null, dark: theme };
}

/** The appearance settings.json's text sets: "light", "dark", or "system" when it sets none. */
export function appearanceOf(text) {
  try {
    const a = JSON.parse(text || "{}").appearance;
    return a === "light" || a === "dark" ? a : "system";
  } catch { return "system"; }
}

/** settings.json's text with `appearance` set to "light" or "dark", or removed for "system". */
export function withAppearance(text, mode) {
  const s = JSON.parse(text || "{}");
  if (mode === "system") delete s.appearance; else s.appearance = mode;
  return JSON.stringify(s, null, 2) + "\n";
}

/** The appearance to switch to after picking a theme: a fixed appearance that the theme
 *  doesn't match follows it, so the pick shows. "system" stays. */
export function appearanceAfterPick(mode, light) {
  if (mode === "system") return null;
  const want = light ? "light" : "dark";
  return mode === want ? null : want;
}
