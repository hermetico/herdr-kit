// Theme switch: a palette in the status bar. It opens a menu of every theme, grouped by family,
// with Light, Dark and System at the top. A pick runs app.theme, which changes only the shown
// layout's theme for that lightness, never the layout itself.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, layout, layouts, notify, openOverlay, props, readTextFile, run, settings, theme, themes, writeTextFile } from "herdr";
import { appearanceAfterPick, groups, halves, withAppearance } from "./logic.mjs";

const MODES = [["light", "Light"], ["dark", "Dark"], ["system", "System"]];
const settingsPath = () => `${appHome()}/settings.json`;
const mode = () => (settings().appearance === "light" || settings().appearance === "dark" ? settings().appearance : "system");

async function setAppearance(next) {
  const text = await readTextFile(settingsPath());
  await writeTextFile(settingsPath(), withAppearance(text, next), text);
}

export default class ThemeSwitch extends View {
  render(cx) {
    return props()?.overlay ? this.menu(cx) : this.button();
  }

  // Drawn like the other status-bar blocks: chrome, a top border, and a divider on its left.
  button() {
    const t = theme();
    return div().size_full().flex().items_center().justify_center().bg(t.chrome).border_t(1).border_l(1).border_color(t.border)
      .child(div().id("theme-switch").p(4).rounded(5).cursor_pointer().text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip("Theme")
        .on_click(() => openOverlay({ mod: "theme-switch", kind: "popup", at: "pointer", width: 300, height: 560, props: { menu: true } }))
        .child(svg("mods/theme-switch/palette.svg").size(17)));
  }

  menu() {
    const t = theme(), all = themes(), now = halves(layout()?.theme, all), m = mode();
    const pick = (item) => {
      run("app.theme", { name: item.name });
      const flip = appearanceAfterPick(m, item.light);
      if (flip) setAppearance(flip).catch((e) => notify({ title: "Theme", body: String(e?.message ?? e), level: "error" }));
    };
    const segment = h_flex().id("theme-modes").m(10).p(2).gap(2).rounded(7).bg(t.raised).flex_none()
      .children(MODES.map(([key, label]) => div().id(`theme-mode-${key}`).flex_1().h(24).flex().items_center().justify_center().rounded(5)
        .text_size(12).cursor_pointer().text_color(m === key ? t.foreground : t.muted).when(m === key, (e) => e.bg(t.selected))
        .hover((s) => s.text_color(t.foreground))
        .on_click(() => { setAppearance(key).catch((e) => notify({ title: "Theme", body: String(e?.message ?? e), level: "error" })); })
        .child(label)));
    const swatch = (c) => div().size(10).rounded(5).border_1().border_color(t.border).bg(c);
    const row = (item) => {
      const c = item.colors ?? {}, on = item.light ? now.light === item.name : now.dark === item.name;
      return h_flex().id(`theme-${item.name}`).h(28).px(10).mx(4).gap(8).items_center().rounded(5).cursor_pointer()
        .when(on, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click(() => pick(item))
        .child(h_flex().gap(3).flex_none().child(swatch(c.background)).child(swatch(c.accent)).child(swatch(c.ansi2)).child(swatch(c.ansi1)))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(on ? t.foreground : t.muted).child(item.label))
        .child(div().text_size(10.5).text_color(t.dim).child(item.light ? "light" : "dark"))
        .child(div().w(14).flex_none().when(on, (e) => e.child(svg("mods/theme-switch/check.svg").size(12).text_color(t.accent))));
    };
    return v_flex().size_full().bg(t.popover).text_color(t.foreground)
      .child(segment)
      .child(v_flex().id("theme-list").flex_1().min_h(0).pb(8).overflow_y_scrollbar()
        .children(groups(all, layouts()).map((g) => v_flex().gap(1)
          .child(div().px(14).pt(8).pb(3).text_size(10.5).font_semibold().text_color(t.dim).child(g.name.toUpperCase()))
          .children(g.items.map(row)))));
  }
}
