// Spotify mini: what the Spotify app on this Mac is playing, with previous, play/pause and next.
// It talks to the app through AppleScript, so a phone or another device that the app follows through
// Spotify Connect shows and obeys too. No sign-in.
// Two shapes by props: a status-bar slot (default), or { "mode": "player", "block": "<its block id>" },
// a miniplayer with the cover and a progress bar that hides its own block while nothing plays.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, props, run, theme, window } from "herdr";
import { COMMAND, READ_SCRIPT, artUrl, clock, parseState, progress } from "./logic.mjs";

const ICON = "mods/spotify-mini/icons";
const ART_DIR = "data/spotify-mini/art";
const FRONT_MS = 3000;
const BACK_MS = 15000;
const ART_PX = 44;

const supported = () => window()?.platform === "macos";

export default class SpotifyMini extends View {
  init(_props, cx) {
    this.mode = props()?.mode === "player" ? "player" : "bar";
    this.block = props()?.block ?? null;
    this.now = null;
    this.readAt = 0;
    this.art = {}; // cover id -> path for image(), or false while downloading or after a failure
    this.shown = null;
    if (checking() || !supported()) return;
    this.read(cx);
    // Every 3 s while Herdr is in front, every 15 s behind other windows.
    cx.timer.every(FRONT_MS, (cx) => {
      if (window()?.active || Date.now() - this.readAt >= BACK_MS) this.read(cx);
    });
    // The player's progress bar moves every second while a song plays.
    if (this.mode === "player") cx.timer.every(1000, (cx) => { if (this.now?.state === "playing" && this.shown) cx.notify(); });
  }

  read(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("osascript", ["-e", READ_SCRIPT]).catch(() => null);
        this.now = r && r.code === 0 ? parseState(r.stdout) : null;
        this.readAt = Date.now();
        if (this.mode === "player") {
          this.fitBlock();
          if (this.now?.art) await this.fetchArt(this.now.art);
        }
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  // The player's block shows only while a track is loaded. A hidden copy keeps running, so it can
  // show the block again.
  fitBlock() {
    const want = Boolean(this.now?.title);
    if (!this.block || want === this.shown) return;
    this.shown = want;
    run(want ? "layout.show" : "layout.hide", { id: this.block });
  }

  // image() draws local files only: each cover is saved once under the app's data folder.
  async fetchArt(id) {
    if (id in this.art) return;
    this.art[id] = false;
    const relative = `${ART_DIR}/${id}.jpg`;
    const r = await exec("curl", ["--silent", "--fail", "--max-time", "10", "--create-dirs", "--output", `${appHome()}/${relative}`, artUrl(id)]).catch(() => null);
    if (r?.code === 0) this.art[id] = relative;
  }

  send(name, cx) {
    cx.spawn(async (cx) => {
      await exec("osascript", ["-e", COMMAND[name]]).catch(() => null);
      this.read(cx);
    });
  }

  button(id, icon, tip, name, t, size = 11) {
    return div().id(id).flex_none().p(3).rounded(4).cursor_pointer().text_color(t.muted)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip)
      .on_click((_e, cx) => this.send(name, cx))
      .child(svg(`${ICON}/${icon}.svg`).size(size));
  }

  controls(t, size) {
    const playing = this.now?.state === "playing";
    return h_flex().flex_none().gap(1).items_center()
      .child(this.button("sp-prev", "previous", "Previous", "previous", t, size))
      .child(this.button("sp-toggle", playing ? "pause" : "play", playing ? "Pause" : "Play", "toggle", t, size + 2))
      .child(this.button("sp-next", "next", "Next", "next", t, size));
  }

  render() {
    return this.mode === "player" ? this.player(theme()) : this.bar(theme());
  }

  bar(t) {
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
      .child(this.controls(t, 11).ml(2));
  }

  player(t) {
    const root = v_flex().size_full().min_w(0).px(12).py(10).gap(8).bg(t.chrome).border_t(1).border_color(t.border).overflow_hidden();
    const n = this.now;
    if (!n || !n.title) return root;
    const playing = n.state === "playing";
    const since = playing ? (Date.now() - this.readAt) / 1000 : 0;
    const share = progress(n, since);
    const at = Math.min(n.duration, n.position + since);
    const cover = n.art && this.art[n.art];
    const open = () => exec("open", ["-a", "Spotify"]).catch(() => {});
    return root
      .child(h_flex().gap(10).items_center().min_w(0)
        .child(div().id("sp-cover").size(ART_PX).flex_none().rounded(6).overflow_hidden().bg(t.raised).cursor_pointer()
          .tooltip(n.album ? `${n.album}: open Spotify` : "Open Spotify").on_click(() => open())
          .child(cover ? image(cover).size(ART_PX) : div().size_full().flex().items_center().justify_center()
            .child(svg(`${ICON}/note.svg`).size(16).text_color(t.dim))))
        .child(v_flex().id("sp-text").flex_1().min_w(0).gap(1).cursor_pointer().on_click(() => open())
          .child(div().truncate().text_size(12.5).font_semibold().text_color(playing ? t.foreground : t.muted).child(n.title))
          .child(div().truncate().text_size(11.5).text_color(t.dim).child(n.artist ?? "")))
        .child(this.controls(t, 12)))
      .child(h_flex().gap(8).items_center().text_size(10.5).text_color(t.dim)
        .child(div().flex_none().child(clock(at)))
        .child(div().flex_1().h(3).rounded(2).bg(t.border).overflow_hidden()
          .child(div().h_full().rounded(2).bg(playing ? t.ansi2 : t.dim).w(`${(share * 100).toFixed(2)}%`)))
        .child(div().flex_none().child(clock(n.duration))));
  }
}
