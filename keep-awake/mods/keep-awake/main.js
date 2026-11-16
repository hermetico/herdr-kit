// Keep awake: a cup in the status bar. While it's on, macOS keeps the display and the machine awake.
// It never starts a long-running process: every 20 s it renews `caffeinate -di -t 25`, so when Herdr
// quits or the button is turned off, the Mac may sleep again within half a minute.
import { View, div, svg } from "gpui-kit";
import { checking, exec, setShared, shared, theme, window } from "herdr";

const ON = "keep-awake.on";
const RENEW_MS = 20000;
const HOLD_S = "25";

const isOn = () => shared(ON) === true;
const supported = () => window()?.platform === "macos";

export default class KeepAwake extends View {
  init(_props, cx) {
    if (checking()) return;
    this.hold();
    cx.timer.every(RENEW_MS, () => this.hold());
  }

  // One short caffeinate while the button is on; herdr's exec stops anything past 30 s anyway.
  hold() {
    if (isOn() && supported()) exec("caffeinate", ["-d", "-i", "-t", HOLD_S]).catch(() => {});
  }

  toggle() {
    setShared(ON, !isOn());
    this.hold();
  }

  render() {
    const t = theme();
    const root = div().size_full().flex().items_center().justify_center();
    if (!supported()) return root;
    const on = isOn();
    return root.child(div().id("keep-awake").p(4).rounded(5).cursor_pointer()
      .text_color(on ? t.accent : t.dim)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover).text_color(on ? t.accent : t.foreground))
      .tooltip(on ? "Keeping the display awake. Click to let it sleep." : "Keep the display awake")
      .on_click(() => this.toggle())
      .child(svg(`mods/keep-awake/${on ? "cup-on" : "cup"}.svg`).size(18)));
  }
}
