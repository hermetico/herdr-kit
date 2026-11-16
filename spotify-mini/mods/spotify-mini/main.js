// Spotify mini: what the Spotify app on this Mac is playing, with its controls. It talks to the app
// through AppleScript, so a phone or another device that the app follows through Spotify Connect
// shows and obeys too. No sign-in.
// Two shapes by props: a status-bar slot (default), or { "mode": "player", "block": "<its block id>" },
// a sidebar player that is compact or expanded, and hides its own block while nothing is loaded.
import { View, div, image, svg } from "gpui-kit";
import { Slider, SliderIndicator, SliderState, SliderThumb, SliderTrack, h_flex, v_flex } from "gpui-base";
import { appHome, checking, exec, props, run, settings, setShared, shared, theme, window } from "herdr";
import { artUrl, clock, command, elapsed, panDue, panMs, parseState, progress, trackLink, trackUri, READ_SCRIPT } from "./logic.mjs";

const ICON = "mods/spotify-mini/icons";
const ART_DIR = "data/spotify-mini/art";
const EXPANDED = "spotify-mini.expanded";
const BIG = "spotify-mini.big-cover";
const PAD = 12;
// Heights of the player's block: compact, expanded with the cover beside the text, and expanded with
// the cover as wide as the block (its side, plus the rows under it).
const HEIGHT = { compact: 66, expanded: 196, bigExtra: 170 };
const FRONT_MS = 3000;
const BACK_MS = 15000;
const SEEK_STEPS = 1000;

const supported = () => window()?.platform === "macos";
// The player draws in the terminal font, like a TUI. Herdr's default when settings name none.
const mono = () => String(settings()?.font || "JetBrains Mono");
const isExpanded = () => shared(EXPANDED) === true;
const isBig = () => shared(BIG) === true;

export default class SpotifyMini extends View {
  init(_props, cx) {
    this.mode = props()?.mode === "player" ? "player" : "bar";
    this.block = props()?.block ?? null;
    this.now = null;
    this.readAt = 0;
    this.art = {}; // cover id -> path for image(), or false while downloading or after a failure
    this.shown = null;
    this.height = null;
    this.width = 0; // the block's width, for the big cover
    this.sizes = {}; // scrolling name -> { box, text } widths
    this.pans = {}; // scrolling name -> { phase: 0 or 1, at }
    this.dragging = false;
    if (checking() || !supported()) return;
    if (this.mode === "player") this.sliders();
    this.read(cx);
    // Every 3 s while Herdr is in front, every 15 s behind other windows.
    cx.timer.every(FRONT_MS, (cx) => {
      if (window()?.active || Date.now() - this.readAt >= BACK_MS) this.read(cx);
    });
    // Once a second: move the progress, and flip any scrolling name that has rested long enough.
    if (this.mode === "player") cx.timer.every(1000, (cx) => this.tick(cx));
  }

  sliders() {
    this.seek = SliderState.new({ min: 0, max: SEEK_STEPS, step: 1, value: 0 });
    this.seek.on("change", () => { this.dragging = true; });
    this.seek.on("release", (v, cx) => {
      this.dragging = false;
      if (this.now?.duration) this.send("seek", cx, (Number(v) / SEEK_STEPS) * this.now.duration);
    });
  }

  read(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("osascript", ["-e", READ_SCRIPT]).catch(() => null);
        const next = r && r.code === 0 ? parseState(r.stdout) : null;
        if (next?.id !== this.now?.id || next?.title !== this.now?.title) this.pans = {};
        this.now = next;
        this.readAt = Date.now();
        if (this.mode === "player") {
          this.fitBlock();
          this.syncSliders();
          if (this.now?.art) await this.fetchArt(this.now.art);
        }
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  tick(cx) {
    if (!this.shown) return;
    const now = Date.now();
    let flipped = false;
    for (const [key, size] of Object.entries(this.sizes)) {
      const over = Math.max(0, size.text - size.box);
      const pan = this.pans[key] ?? (this.pans[key] = { phase: 0, at: now });
      if (panDue(over, now - pan.at)) { pan.phase = 1 - pan.phase; pan.at = now; flipped = true; }
    }
    if (this.now?.state === "playing") this.syncSliders();
    if (flipped || this.now?.state === "playing") cx.notify();
  }

  // The seek slider follows the player unless the person is dragging it.
  syncSliders() {
    if (!this.seek || !this.now?.title || this.dragging) return;
    this.seek.set_value(Math.round(progress(this.now, (Date.now() - this.readAt) / 1000) * SEEK_STEPS));
  }

  // The player's block shows only while a track is loaded, at the height of its mode. A hidden copy
  // keeps running, so it can show the block again.
  fitBlock() {
    if (!this.block) return;
    const want = Boolean(this.now?.title);
    if (want !== this.shown) {
      this.shown = want;
      run(want ? "layout.show" : "layout.hide", { id: this.block });
    }
    const px = !isExpanded() ? HEIGHT.compact : isBig() ? this.bigSide() + HEIGHT.bigExtra : HEIGHT.expanded;
    if (want && px !== this.height) {
      this.height = px;
      run("layout.resize", { id: this.block, px });
    }
  }

  // The big cover's side: the block's width inside its padding.
  bigSide() {
    return Math.max(120, Math.round((this.width || 268) - 2 * PAD));
  }

  toggleBig(cx) {
    setShared(BIG, !isBig());
    this.sizes = {};
    this.pans = {};
    this.fitBlock();
    cx.notify();
  }

  toggleMode(cx) {
    setShared(EXPANDED, !isExpanded());
    this.sizes = {};
    this.pans = {};
    this.fitBlock();
    cx.notify();
  }

  // image() draws local files only: each cover is saved once under the app's data folder.
  async fetchArt(id) {
    if (id in this.art) return;
    this.art[id] = false;
    const relative = `${ART_DIR}/${id}.jpg`;
    const r = await exec("curl", ["--silent", "--fail", "--max-time", "10", "--create-dirs", "--output", `${appHome()}/${relative}`, artUrl(id)]).catch(() => null);
    if (r?.code === 0) this.art[id] = relative;
  }

  send(name, cx, value) {
    const line = command(name, value);
    if (!line) return;
    cx.spawn(async (cx) => {
      await exec("osascript", ["-e", line]).catch(() => null);
      this.read(cx);
    });
  }

  openSpotify() {
    const id = this.now?.id;
    exec("open", id ? [trackUri(id)] : ["-a", "Spotify"]).catch(() => {});
  }

  // ---- drawing ----

  button(id, icon, tip, onClick, t, { size = 11, color = t.muted, lit = false } = {}) {
    return div().id(id).flex_none().p(3).rounded(4).cursor_pointer().text_color(lit ? t.ansi2 : color)
      .hover((s) => s.bg(t.hover).text_color(lit ? t.ansi2 : t.foreground)).tooltip(tip)
      .on_click((_e, cx) => onClick(cx))
      .child(svg(`${ICON}/${icon}.svg`).size(size));
  }

  // A control as a text key, TUI style: a glyph or a bracketed word in the terminal font, with a
  // square highlight under the pointer. `lit` draws it in `ansi2`, for a toggle that is on.
  key(id, label, tip, onClick, t, { size = 12, color = t.muted, lit = false, bold = false } = {}) {
    return div().id(id).flex_none().px(4).py(1).font_family(mono()).text_size(size).cursor_pointer()
      .when(bold, (el) => el.font_semibold())
      .text_color(lit ? t.ansi2 : color).hover((s) => s.bg(t.hover).text_color(lit ? t.ansi2 : t.foreground)).tooltip(tip)
      .on_click((_e, cx) => onClick(cx))
      .child(label);
  }

  transportKeys(t, size) {
    const playing = this.now?.state === "playing";
    return h_flex().flex_none().items_center().gap(2)
      .child(this.key("sp-prev", "|◀", "Previous", (cx) => this.send("previous", cx), t, { size }))
      .child(this.key("sp-toggle", playing ? "▌▌" : "▶", playing ? "Pause" : "Play", (cx) => this.send("toggle", cx), t, { size: playing ? size - 2 : size, color: t.foreground }))
      .child(this.key("sp-next", "▶|", "Next", (cx) => this.send("next", cx), t, { size }));
  }

  // A name in one line. Too long for its box, it pans to its end, rests, and pans back.
  scrolling(key, text, h, style) {
    const size = this.sizes[key];
    const over = size ? Math.max(0, size.text - size.box) : 0;
    const phase = this.pans[key]?.phase ?? 0;
    const measure = (field) => (s, cx) => {
      const w = Math.ceil(s.width);
      const old = this.sizes[key] ?? { box: 0, text: 0 };
      if (old[field] === w) return;
      this.sizes[key] = { ...old, [field]: w };
      cx.notify();
    };
    return div().id(`sc-${key}`).relative().overflow_hidden().w_full().h(h).flex_none()
      .on_size_change(measure("box"))
      .child(style(div().id(`sc-${key}-t`).absolute().top(0).whitespace_nowrap()
        .left(over && phase ? -over : 0)
        .transition("left", { duration: panMs(over), easing: "ease-in-out" })
        .on_size_change(measure("text"))
        .child(text)));
  }

  // The cover. With `chip`, a small button in its bottom-right corner grows or shrinks it.
  cover(t, px, chip = false) {
    const n = this.now;
    const path = n?.art && this.art[n.art];
    const big = isBig();
    return div().id(`sp-cover-${px}`).relative().size(px).flex_none().overflow_hidden().bg(t.raised).border(1).border_color(t.border)
      .child(path ? image(path).size(px) : div().size_full().flex().items_center().justify_center()
        .child(svg(`${ICON}/note.svg`).size(Math.round(px / 2.6)).text_color(t.dim)))
      .when(chip, (el) => el.child(div().id("sp-grow").absolute().bottom(4).right(4).size(18)
        .flex().items_center().justify_center().cursor_pointer()
        .bg(/^#[0-9a-f]{6}$/i.test(t.chrome) ? `${t.chrome}cc` : t.chrome).text_color(t.muted).hover((s) => s.bg(t.chrome).text_color(t.foreground))
        .tooltip(big ? "Smaller cover" : "Bigger cover")
        .on_click((_e, cx) => this.toggleBig(cx))
        .child(svg(`${ICON}/${big ? "shrink" : "grow"}.svg`).size(11))));
  }

  slider(state, id, color, t) {
    return Slider.new(state).w_full().child(
      SliderTrack.new(state).flex().items_center().h(14).w_full().cursor_pointer().child(
        SliderIndicator.new(state).relative().w_full().h(2).bg(t.border)
          .range_style((fill) => fill.bg(color))
          .child(SliderThumb.new(state).id(`${id}-thumb`).w(3).h(10).bg(t.foreground).ml(-1.5).mt(-4))));
  }

  render() {
    if (this.mode === "bar") return this.bar(theme());
    const t = theme();
    const root = v_flex().id("sp-root").size_full().min_w(0).px(PAD).py(10).font_family(mono()).bg(t.chrome).border_t(1).border_color(t.border).overflow_hidden()
      .on_size_change((size, cx) => {
        const w = Math.round(size.width);
        if (w === this.width) return;
        this.width = w;
        this.fitBlock();
        cx.notify();
      });
    if (!this.now?.title) return root;
    return isExpanded() ? this.expanded(root, t) : this.compact(root, t);
  }

  compact(root, t) {
    const n = this.now;
    const playing = n.state === "playing";
    const at = elapsed(n, (Date.now() - this.readAt) / 1000);
    return root.child(h_flex().gap(10).items_center().min_w(0)
      .child(this.cover(t, 44))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(this.scrolling("c-title", n.title, 17, (el) => el.text_size(12.5).font_semibold().text_color(playing ? t.foreground : t.muted)))
        .child(this.scrolling("c-artist", n.artist ?? "", 15, (el) => el.text_size(11.5).text_color(t.dim)))
        .child(div().text_size(10.5).text_color(t.dim).child(`${clock(at)} / ${clock(n.duration)}`)))
      .child(v_flex().flex_none().items_end().gap(2)
        .child(h_flex().gap(1)
          .child(this.key("sp-open", "[↗]", "Open in Spotify", () => this.openSpotify(), t, { size: 10.5, color: t.dim }))
          .child(this.key("sp-expand", "[+]", "More", (cx) => this.toggleMode(cx), t, { size: 10.5, color: t.dim })))
        .child(this.transportKeys(t, 11))));
  }

  expanded(root, t) {
    const n = this.now;
    const playing = n.state === "playing";
    const at = elapsed(n, (Date.now() - this.readAt) / 1000);
    const big = isBig();
    const album = [n.album, n.track ? `track ${n.track}` : null].filter(Boolean).join(" · ");
    const title = this.scrolling("e-title", n.title, 18, (el) => el.text_size(13.5).font_semibold().text_color(playing ? t.foreground : t.muted));
    // The links are two icons at the end of the title line, so they take no row of their own.
    const icons = h_flex().flex_none().gap(1)
      .child(this.key("sp-copy", "[cp]", "Copy link", (cx) => cx.write_to_clipboard(trackLink(n.id)), t, { size: 10.5, color: t.dim }))
      .child(this.key("sp-open", "[↗]", "Open in Spotify", () => this.openSpotify(), t, { size: 10.5, color: t.dim }));
    const text = v_flex().flex_1().min_w(0).gap(2)
      .when(Boolean(n.id), (el) => el.child(h_flex().gap(6).items_center().min_w(0).child(div().flex_1().min_w(0).child(title)).child(icons)))
      .when(!n.id, (el) => el.child(title))
      .child(this.scrolling("e-artist", n.artist ?? "", 16, (el) => el.text_size(12).text_color(t.muted)))
      .child(this.scrolling("e-album", album, 15, (el) => el.text_size(11).text_color(t.dim)));
    const controls = h_flex().justify_between().items_center()
      .child(this.key("sp-shuffle", "[shuf]", n.shuffle ? "Shuffle is on" : "Shuffle", (cx) => this.send("shuffle", cx), t, { size: 11, color: t.dim, lit: n.shuffle }))
      .child(this.transportKeys(t, 13))
      .child(this.key("sp-repeat", "[rpt]", n.repeat ? "Repeat is on" : "Repeat", (cx) => this.send("repeat", cx), t, { size: 11, color: t.dim, lit: n.repeat }));
    // The times sit on the slider's own line.
    const seek = h_flex().gap(8).items_center().text_size(10.5).text_color(t.dim)
      .child(div().flex_none().child(clock(at)))
      .child(div().flex_1().min_w(0).child(this.slider(this.seek, "sp-seek", playing ? t.ansi2 : t.dim, t)))
      .child(div().flex_none().child(clock(n.duration)));
    return root.gap(8)
      // A rule line, as a TUI draws a panel's title.
      .child(h_flex().h(16).gap(6).items_center().text_size(10.5).text_color(t.dim)
        .child(div().flex_none().child("─ now playing"))
        .child(div().flex_1().h(1).bg(t.border))
        .child(this.key("sp-collapse", "[−]", "Less", (cx) => this.toggleMode(cx), t, { size: 10.5, color: t.dim })))
      // Big: the cover as wide as the block, the text under it. Otherwise side by side.
      .when(big, (el) => el.child(this.cover(t, this.bigSide(), true)).child(text))
      .when(!big, (el) => el.child(h_flex().gap(12).items_center().min_w(0).child(this.cover(t, 88, true)).child(text)))
      .child(controls)
      .child(seek);
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
      .child(h_flex().flex_none().gap(1).ml(2)
        .child(this.button("sp-prev", "previous", "Previous", (cx) => this.send("previous", cx), t))
        .child(this.button("sp-toggle", playing ? "pause" : "play", playing ? "Pause" : "Play", (cx) => this.send("toggle", cx), t))
        .child(this.button("sp-next", "next", "Next", (cx) => this.send("next", cx), t)));
  }
}
