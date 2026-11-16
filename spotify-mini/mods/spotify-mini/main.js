// Spotify mini: what the Spotify app on this Mac is playing, with previous, play/pause and next,
// in a status-bar block. It talks to the app through AppleScript, so a phone or another device
// that the app follows through Spotify Connect shows and obeys too. No sign-in and no network.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { checking, exec, theme, window } from "herdr";
import { COMMAND, READ_SCRIPT, clock, parseState } from "./logic.mjs";

const ICON = "mods/spotify-mini/icons";
const FRONT_MS = 3000;
const BACK_MS = 15000;

const supported = () => window()?.platform === "macos";

export default class SpotifyMini extends View {
  init(_props, cx) {
    this.now = null;
    this.readAt = 0;
    if (checking() || !supported()) return;
    this.read(cx);
    // Every 3 s while Herdr is in front, every 15 s behind other windows.
    cx.timer.every(FRONT_MS, (cx) => {
      if (window()?.active || Date.now() - this.readAt >= BACK_MS) this.read(cx);
    });
  }

  read(cx) {
    if (this.busy) return;
    this.busy = true;
    this.readAt = Date.now();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("osascript", ["-e", READ_SCRIPT]).catch(() => null);
        this.now = r && r.code === 0 ? parseState(r.stdout) : null;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  send(name, cx) {
    cx.spawn(async (cx) => {
      await exec("osascript", ["-e", COMMAND[name]]).catch(() => null);
      this.read(cx);
    });
  }

  button(id, icon, tip, name, t) {
    return div().id(id).flex_none().p(3).rounded(4).cursor_pointer().text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => this.send(name, cx))
      .child(svg(`${ICON}/${icon}.svg`).size(11));
  }

  render() {
    const t = theme();
    // Drawn like the other status-bar blocks: chrome and a top border; empty when Spotify is closed.
    const root = h_flex().size_full().min_w(0).px(10).gap(4).items_center().justify_end().text_size(11.8)
      .bg(t.chrome).border_t(1).border_color(t.border).overflow_hidden();
    const n = this.now;
    if (!n || !n.title) return root;
    const playing = n.state === "playing";
    const tip = [n.album, `${clock(n.position)} / ${clock(n.duration)}`, playing ? null : "paused"].filter(Boolean).join(" · ");
    return root
      .child(svg(`${ICON}/note.svg`).size(12).flex_none().text_color(playing ? t.ansi2 : t.dim))
      .child(div().id("spotify-track").min_w(0).truncate().tooltip(tip)
        .child(h_flex().gap(4).min_w(0)
          .child(div().min_w(0).truncate().text_color(playing ? t.foreground : t.dim).child(n.title))
          .when(Boolean(n.artist), (el) => el.child(div().flex_none().text_color(t.dim).child("·")).child(div().min_w(0).truncate().text_color(t.dim).child(n.artist)))))
      .child(h_flex().flex_none().gap(1).ml(2)
        .child(this.button("sp-prev", "previous", "Previous", "previous", t))
        .child(this.button("sp-toggle", playing ? "pause" : "play", playing ? "Pause" : "Play", "toggle", t))
        .child(this.button("sp-next", "next", "Next", "next", t)));
  }
}
