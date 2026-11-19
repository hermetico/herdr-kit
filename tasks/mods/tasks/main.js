// Tasks: VS Code's tasks and launch configurations of the focused folder, run from the status bar.
// In a status-bar block it shows a Run chip and a chip per running item with restart and stop.
// Opened with { role: "list" } it is the popup that lists every item with a play button.
// Each item runs as plain shell steps in a tab of its own; launch configurations run without a debugger.
// An item with `${input:…}` asks for them first in the popup, starting from the answers given last.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex, Input, InputState } from "gpui-base";
import { closeOverlay, exec, focused, home, openOverlay, panes, props, readTextFile, run, setShared, shared, spaces, theme, window } from "herdr";
import { answersFor, argv, baseName, findArgs, fromVscode, fromWorkspace, inputsFor, items, parentOf, parseJsonc, plan, runKey, stateOf, tooBigToSearch } from "./logic.mjs";

const ICON = "mods/tasks/icons";
const RUNNING = "tasks.running"; // key -> { tab, space, name, ws }
const PENDING = "tasks.pending"; // [{ key, name, ws, before: [tab ids], at }]
const PICKS = "tasks.picks"; // machine|root -> the source file picked
const ANSWERS = "tasks.answers"; // machine|workspace folder -> { input id: the answer given last }
const ROW_H = 28;
const HEAD_H = 40;
// A popup is sized by its content: the root needs an exact height, the same one the popup opens with.
// With inputs to ask for it opens taller, so the questions fit.
const listHeight = (n, asks = false) => Math.min(560, Math.max(asks ? 480 : 0, HEAD_H + 56 + ROW_H * (n + 2)));

const allTabs = () => spaces().flatMap((s) => s.tabs.map((t) => ({ ...t, space: s.id })));

// The folder to look from: the focused pane's live folder, else the shown space's, on its machine.
function where() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  return { dir: pane?.cwd || f?.cwd || space?.folder || null, machine: space?.machine ?? null };
}

const read = (path, on) => readTextFile(path, { on }).catch(() => null);

export default class Tasks extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "bar";
    this.overlay = props()?.overlay ?? null;
    Object.assign(this, { at: null, root: null, sources: [], src: null, error: null, busy: false, asking: null, homes: {} });
    this.locate(cx);
    cx.timer.every(2500, (cx) => this.locate(cx));
    // Only the bar settles new tabs: a popup's timers stop when it closes.
    if (this.role === "bar") cx.timer.every(500, (cx) => this.settle(cx));
  }

  // ---- finding the sources ----

  async discover(dir, on) {
    for (let d = dir; d; d = parentOf(d)) {
      const sources = [];
      if ((await read(`${d}/.vscode/tasks.json`, on)) !== null || (await read(`${d}/.vscode/launch.json`, on)) !== null) {
        sources.push({ kind: "vscode", path: d, label: ".vscode" });
      }
      if (!tooBigToSearch(d)) {
        const r = await exec("find", findArgs(d), { on }).catch(() => null);
        for (const f of (r?.stdout ?? "").split("\n").filter(Boolean).sort()) {
          sources.push({ kind: "workspace", path: f, label: baseName(f).replace(/\.code-workspace$/, "") });
        }
      }
      if (sources.length) return { root: d, sources };
      if (tooBigToSearch(d)) break;
    }
    return { root: null, sources: [] };
  }

  chosen() {
    const pick = (shared(PICKS) ?? {})[`${this.at?.machine ?? ""}|${this.root}`];
    return this.sources.find((s) => s.path === pick) ?? this.sources.find((s) => s.kind === "workspace") ?? this.sources[0] ?? null;
  }

  cycle(cx) {
    if (this.sources.length < 2) return;
    const next = this.sources[(this.sources.indexOf(this.chosen()) + 1) % this.sources.length];
    setShared(PICKS, { ...(shared(PICKS) ?? {}), [`${this.at?.machine ?? ""}|${this.root}`]: next.path });
    this.locate(cx, true);
  }

  locate(cx, force = false) {
    if (this.busy) return;
    const now = where();
    const moved = now.dir !== this.at?.dir || now.machine !== this.at?.machine;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        // ${userHome} is the home of the machine the steps run on.
        if (now.machine && !(now.machine in this.homes)) {
          const r = await exec("sh", ["-c", 'printf %s "$HOME"'], { on: now.machine }).catch(() => null);
          if (r?.stdout?.startsWith("/")) this.homes[now.machine] = r.stdout.trim();
        }
        if (moved || force) {
          const found = now.dir ? await this.discover(now.dir, now.machine) : { root: null, sources: [] };
          Object.assign(this, { at: now, root: found.root, sources: found.sources });
        }
        const s = this.chosen();
        if (!s) { this.src = null; this.error = null; return; }
        try {
          if (s.kind === "vscode") {
            const [t, l] = await Promise.all([read(`${s.path}/.vscode/tasks.json`, now.machine), read(`${s.path}/.vscode/launch.json`, now.machine)]);
            this.src = fromVscode(s.path, t ? parseJsonc(t) : null, l ? parseJsonc(l) : null);
          } else {
            const text = await read(s.path, now.machine);
            this.src = text === null ? null : fromWorkspace(s.path, parseJsonc(text));
          }
          this.error = null;
        } catch (e) {
          this.error = `${baseName(s.path)}: ${e?.message ?? e}`;
        }
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  ctx() {
    const local = !this.at?.machine;
    const os = local ? (window()?.platform === "macos" ? "osx" : "linux") : "linux";
    return { ...this.src, os, home: local ? home() : this.homes[this.at?.machine] ?? null };
  }

  answersKey() { return `${this.at?.machine ?? ""}|${this.src?.ws}`; }
  lastAnswers() { return (shared(ANSWERS) ?? {})[this.answersKey()] ?? {}; }

  // Play: straight away, or first the questions for its inputs.
  play(item, cx) {
    const inputs = inputsFor(item, this.ctx());
    if (!inputs.length) return this.start(item);
    const answers = answersFor(inputs, this.lastAnswers());
    const boxes = {};
    for (const i of inputs.filter((i) => i.type === "promptString")) {
      boxes[i.id] = InputState.new({ value: answers[i.id], placeholder: i.default });
      if (i.password) boxes[i.id].set_masked(true);
      boxes[i.id].on("submit", (_e, cx) => this.go(cx));
    }
    this.asking = { item, inputs, answers, boxes };
    const first = Object.values(boxes)[0];
    if (first) { first.focus(); cx.timer.after(100, () => first.focus()); }
    cx.notify();
  }

  // Runs the item asked about with the answers, and keeps them for next time.
  go(cx) {
    const a = this.asking;
    if (!a) return;
    const answers = { ...a.answers };
    for (const [id, box] of Object.entries(a.boxes)) answers[id] = box.value();
    setShared(ANSWERS, { ...(shared(ANSWERS) ?? {}), [this.answersKey()]: { ...this.lastAnswers(), ...answers } });
    this.asking = null;
    this.start(a.item, answers);
    cx.notify();
  }

  // ---- running ----

  running() { return shared(RUNNING) ?? {}; }

  tabOf(key) {
    const r = this.running()[key];
    return r ? allTabs().find((t) => t.id === r.tab) ?? null : null;
  }

  // A run's state from its terminal title, which the script sets: running, done or failed.
  stateOfKey(key) {
    const tab = this.tabOf(key);
    if (!tab) return null;
    const pane = panes().find((p) => p.tab === tab.id && p.terminal);
    return stateOf(pane?.title) ?? "running";
  }

  start(item, answers = answersFor(inputsFor(item, this.ctx()), this.lastAnswers())) {
    const p = plan(item, { ...this.ctx(), answers });
    if (p.unsupported) return;
    const key = runKey(this.at?.machine, this.src.ws, item);
    const before = allTabs().map((t) => t.id);
    run("tab.new", { name: item.name, folder: p.steps[0]?.cwd ?? this.src.ws, argv: argv(item.name, p.steps) });
    const pending = (shared(PENDING) ?? []).filter((x) => x.key !== key);
    setShared(PENDING, [...pending, { key, name: item.name, ws: this.src.ws, before, at: Date.now() }]);
  }

  stop(key) {
    const tab = this.tabOf(key);
    if (tab) run("tab.close", { id: tab.id, confirmed: true });
    const { [key]: _gone, ...rest } = this.running();
    setShared(RUNNING, rest);
  }

  restart(key, item) {
    this.stop(key);
    if (item) this.start(item);
  }

  // tab.new doesn't say which tab it made: the new one is the tab with that name that wasn't there before.
  settle(cx) {
    const pending = shared(PENDING) ?? [];
    const tabs = allTabs();
    const live = new Set(tabs.map((t) => t.id));
    const runningNow = Object.fromEntries(Object.entries(this.running()).filter(([, r]) => live.has(r.tab)));
    let changed = Object.keys(runningNow).length !== Object.keys(this.running()).length;
    const left = [];
    for (const p of pending) {
      const tab = tabs.find((t) => !p.before.includes(t.id) && t.name === p.name);
      if (tab) { runningNow[p.key] = { tab: tab.id, space: tab.space, name: p.name, ws: p.ws }; changed = true; }
      else if (Date.now() - p.at < 20000) left.push(p);
    }
    if (left.length !== pending.length) setShared(PENDING, left);
    if (changed) { setShared(RUNNING, runningNow); cx.notify(); }
  }

  show(key) {
    const r = this.running()[key];
    if (!r) return;
    run("space.select", { id: r.space });
    run("tab.select", { id: r.tab });
  }

  // ---- drawing ----

  icon(id, name, tip, color, onClick, t) {
    return div().id(id).flex_none().p(3).rounded(4).cursor_pointer().text_color(color)
      .hover((s) => s.bg(t.hover)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation?.(); onClick(cx); })
      .child(svg(`${ICON}/${name}.svg`).size(12));
  }

  render(cx) {
    return this.role === "list" ? this.list(theme()) : this.bar(theme());
  }

  bar(t) {
    const list = this.src ? items(this.src) : [];
    // Right-aligned: in a fixed status-bar slot the chip sits next to whatever follows it.
    const root = h_flex().size_full().min_w(0).px(10).gap(6).items_center().justify_end().text_size(11.8).overflow_hidden()
      .bg(t.chrome).border_t(1).border_color(t.border);
    if (!list.length) return root;
    // This folder's runs only: another workspace's tasks don't show here.
    const states = list.map((i) => this.stateOfKey(runKey(this.at?.machine, this.src.ws, i))).filter(Boolean);
    const count = (state) => states.filter((x) => x === state).length;
    const [running, done, failed] = [count("running"), count("done"), count("failed")];
    const mark = (n, glyph, color) => div().flex_none().text_color(color).child(n > 1 ? `${glyph}${n}` : glyph);
    const tip = [running && `${running} running`, done && `${done} finished`, failed && `${failed} failed`].filter(Boolean).join(", ");
    return root.child(h_flex().id("tasks-open").h(20).px(7).gap(5).flex_none().items_center().rounded(5).max_w(300).cursor_pointer()
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .when(states.length > 0, (el) => el.bg(t.raised))
      .tooltip(`${list.length} tasks and configurations in ${this.chosen()?.label ?? ""}${tip ? `: ${tip}` : ""}`)
      .on_click(() => openOverlay({ mod: "tasks", kind: "popup", width: 340, height: listHeight(list.length, this.asks(list)), props: { role: "list" } }))
      .child(svg(`${ICON}/play.svg`).size(11).flex_none().text_color(t.ansi2))
      .child(div().flex_none().child("Run"))
      .child(div().min_w(0).truncate().text_color(t.dim).child(baseName(this.src.ws)))
      .when(running > 0, (el) => el.child(h_flex().flex_none().gap(3).items_center()
        .child(div().size(6).rounded(3).bg(t.working)).when(running > 1, (c) => c.child(div().text_color(t.working).child(String(running))))))
      .when(done > 0, (el) => el.child(mark(done, "✓", t.ansi2)))
      .when(failed > 0, (el) => el.child(mark(failed, "✗", t.ansi1))));
  }

  asks(list) { return list.some((i) => inputsFor(i, this.ctx()).length > 0); }

  row(item, t, i) {
    const p = plan(item, this.ctx());
    const bad = p.unsupported ?? null;
    const key = runKey(this.at?.machine, this.src.ws, item);
    const state = this.stateOfKey(key);
    const lead = state === "done" ? div().w(10).flex_none().text_size(11).text_color(t.ansi2).child("✓")
      : state === "failed" ? div().w(10).flex_none().text_size(11).text_color(t.ansi1).child("✗")
      : div().w(10).flex_none().flex().justify_center().child(div().size(6).rounded(3).bg(state ? t.working : "#00000000"));
    const tip = state === "done" ? "Finished: show its tab" : state === "failed" ? "Failed: show its tab" : "Running: show its tab";
    return h_flex().id(`row-${i}`).h(ROW_H).flex_none().px(8).gap(6).items_center().rounded(6)
      .hover((s) => s.bg(t.hover))
      .when(Boolean(bad), (el) => el.tooltip(bad))
      .when(!bad && !state && Boolean(item.detail), (el) => el.tooltip(item.detail))
      .child(lead)
      .child(div().flex_1().min_w(0).truncate().text_color(bad ? t.dim : t.foreground)
        .when(Boolean(state), (el) => el.id(`show-${i}`).cursor_pointer().tooltip(tip).on_click(() => this.show(key)))
        .child(item.name))
      .when(Boolean(state), (el) => el
        .child(this.icon(`lre-${i}`, "rotate", state === "running" ? "Restart" : "Run again", t.ansi2, () => this.restart(key, item), t))
        .child(this.icon(`lst-${i}`, "square", state === "running" ? "Stop (closes its tab)" : "Close its tab", t.ansi1, () => this.stop(key), t)))
      .when(!state && !bad, (el) => el.child(this.icon(`go-${i}`, "play", inputsFor(item, this.ctx()).length ? "Choose its inputs, then run" : "Run in a new tab", t.ansi2, (cx) => this.play(item, cx), t)));
  }

  list(t) {
    const all = this.src ? items(this.src) : [];
    const configs = all.filter((i) => i.kind === "config");
    const tasks = all.filter((i) => i.kind === "task");
    const many = this.sources.length > 1;
    const section = (label) => div().px(8).pt(8).pb(2).flex_none().text_size(11).font_medium().text_color(t.dim).child(label);
    const s = this.chosen();
    let n = 0;
    const height = listHeight(all.length, this.asks(all));
    if (this.asking) return this.form(t, height);
    return v_flex().w_full().h(height).bg(t.popover).text_size(13)
      .child(h_flex().px(14).h(HEAD_H).flex_none().gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().font_semibold().text_color(t.foreground).child("Run"))
        .when(Boolean(s), (el) => el.child(div().id("source").min_w(0).truncate().px(6).py(1).rounded(4).text_size(11)
          .bg(t.raised).text_color(many ? t.foreground : t.dim)
          .when(many, (c) => c.cursor_pointer().hover((h) => h.bg(t.hover)).tooltip("Switch file")
            .on_click((_e, cx) => this.cycle(cx)))
          .child(`${s.label}${many ? `  ${this.sources.indexOf(s) + 1}/${this.sources.length}` : ""}`)))
        .child(div().flex_1())
        .child(div().id("close").flex_none().text_size(11).text_color(t.dim).cursor_pointer()
          .on_click(() => this.overlay && closeOverlay(this.overlay)).child("Esc")))
      .child(v_flex().id("rows").w_full().h(height - HEAD_H).px(6).pb(8).overflow_y_scrollbar()
        .when(Boolean(this.error), (el) => el.child(div().px(8).pt(8).text_size(12).text_color(t.blocked).child(this.error)))
        .when(!all.length && !this.error, (el) => el.child(div().px(8).pt(10).text_size(12).text_color(t.dim)
          .child("No tasks.json, launch.json or .code-workspace here or in the folders above.")))
        .when(configs.length > 0, (el) => el.child(section("Launch")).children(configs.map((i) => this.row(i, t, n++))))
        .when(tasks.length > 0, (el) => el.child(section("Tasks")).children(tasks.map((i) => this.row(i, t, n++)))));
  }

  // The questions for an item's inputs: choices as pills, free text in a box. Enter or Run starts it.
  form(t, height) {
    const a = this.asking;
    const FOOT_H = 48;
    const pill = (input, o, n) => {
      const on = a.answers[input.id] === o.value;
      return div().id(`pick-${input.id}-${n}`).h(22).px(8).flex().items_center().rounded(5).cursor_pointer().text_size(11.5)
        .bg(on ? t.accent : t.raised).text_color(on ? t.accent_foreground : t.muted)
        .when(!on, (e) => e.hover((s) => s.bg(t.hover).text_color(t.foreground)))
        .when(o.label !== o.value, (e) => e.tooltip(o.value))
        .on_click((_e, cx) => { a.answers[input.id] = o.value; cx.notify(); })
        .child(o.label);
    };
    const question = (input) => v_flex().gap(5).flex_none()
      .child(div().text_size(11.5).text_color(t.dim).child(input.description))
      .child(input.type === "pickString"
        ? h_flex().flex_wrap().gap(4).children(input.options.map((o, n) => pill(input, o, n)))
        : Input.new(a.boxes[input.id]).w_full().h(28).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground));
    const back = (cx) => { this.asking = null; cx.notify(); };
    return v_flex().id("ask").w_full().h(height).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { back(cx); cx.stop_propagation(); }
        else if (e.key === "enter") { this.go(cx); cx.stop_propagation(); }
      })
      .child(h_flex().px(14).h(HEAD_H).flex_none().gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().font_semibold().text_color(t.foreground).child("Run"))
        .child(div().min_w(0).truncate().text_color(t.muted).child(a.item.name)))
      .child(v_flex().id("questions").w_full().h(height - HEAD_H - FOOT_H).px(14).py(12).gap(14).overflow_y_scrollbar()
        .children(a.inputs.map(question)))
      .child(h_flex().h(FOOT_H).flex_none().px(14).gap(8).items_center().justify_end().border_t(1).border_color(t.border)
        .child(div().id("ask-back").h(26).px(10).flex().items_center().rounded(6).cursor_pointer().text_size(12).text_color(t.muted)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => back(cx)).child("Back"))
        .child(h_flex().id("ask-run").h(26).px(10).gap(6).items_center().rounded(6).cursor_pointer().text_size(12).font_medium()
          .bg(t.accent).text_color(t.accent_foreground).hover((s) => s.opacity(0.9))
          .on_click((_e, cx) => this.go(cx))
          .child(svg(`${ICON}/play.svg`).size(11)).child("Run")));
  }
}
