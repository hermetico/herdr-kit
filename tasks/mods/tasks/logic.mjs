// Pure helpers for the tasks mod: no herdr or gpui imports, so `node test_logic.mjs` can load them.
// They turn VS Code's tasks.json, launch.json and .code-workspace files into shell steps.

// JSON with line and block comments and trailing commas, as VS Code writes it. Throws on bad JSON.
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 2; continue; }
      if (c === '"') inString = false;
      i++;
    } else if (c === '"') { inString = true; out += c; i++; }
    else if (c === "/" && next === "/") { while (i < text.length && text[i] !== "\n") i++; }
    else if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else { out += c; i++; }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export const baseName = (path) => path.replace(/\/+$/, "").split("/").pop();
export const parentOf = (path) => {
  const p = path.replace(/\/+$/, "");
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : i === 0 && p.length > 1 ? "/" : null;
};

/** A folder written in a .code-workspace file, made absolute against the file's own folder. */
export function resolvePath(base, rel) {
  const out = [];
  for (const part of (rel.startsWith("/") ? rel : `${base}/${rel}`).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

/** Home folders and anything above them are never searched for .code-workspace files: too big. */
export const tooBigToSearch = (dir) => /^(\/|\/home|\/Users|\/home\/[^/]+|\/Users\/[^/]+|\/root)\/?$/.test(dir);

/** find's arguments for the .code-workspace files in a folder and one level down. */
export const findArgs = (dir) => [dir, "-maxdepth", "2", "-type", "f", "-name", "*.code-workspace", "-not", "-path", "*/node_modules/*"];

/** What a source file holds, as { ws, folders, tasks, configs }. `vscode` sources pass the two
 *  parsed files; `.code-workspace` sources pass the parsed workspace and the file's path. */
export function fromVscode(root, tasksJson, launchJson) {
  return {
    ws: root,
    folders: {},
    tasks: Array.isArray(tasksJson?.tasks) ? tasksJson.tasks : [],
    configs: Array.isArray(launchJson?.configurations) ? launchJson.configurations : [],
    inputs: inputsOf(tasksJson?.inputs, launchJson?.inputs),
  };
}

/** The `inputs` of tasks and launch, by id. The tasks' own come first when both define one. */
function inputsOf(...lists) {
  const out = {};
  for (const list of lists) for (const i of Array.isArray(list) ? list : []) if (i?.id && !(i.id in out)) out[i.id] = i;
  return out;
}

export function fromWorkspace(path, data) {
  const base = parentOf(path) ?? "/";
  const list = Array.isArray(data?.folders) && data.folders.length ? data.folders : [{ path: "." }];
  const folders = {};
  for (const f of list) {
    const abs = resolvePath(base, String(f?.path ?? "."));
    folders[f?.name ?? baseName(abs)] = abs;
  }
  return {
    ws: resolvePath(base, String(list[0]?.path ?? ".")),
    folders,
    tasks: Array.isArray(data?.tasks?.tasks) ? data.tasks.tasks : [],
    configs: Array.isArray(data?.launch?.configurations) ? data.launch.configurations : [],
    inputs: inputsOf(data?.tasks?.inputs, data?.launch?.inputs),
    settings: data?.settings && typeof data.settings === "object" ? data.settings : {},
  };
}

/** The rows a source offers: launch configurations, then tasks without `hide`. */
export function items(src) {
  const configs = src.configs.map((cfg) => ({ kind: "config", name: String(cfg?.name ?? "unnamed"), detail: null, cfg }));
  const tasks = src.tasks.filter((t) => t && !t.hide).map((cfg) => ({ kind: "task", name: String(cfg.label ?? "unnamed"), detail: cfg.detail ?? null, cfg }));
  return [...configs, ...tasks];
}

// ---- turning an item into shell steps ----------------------------------------------------------
// A step is { cwd, env: [[name, value]], envFile, line }. Steps run in order; the first failure stops them.

/** A single-quoted sh word. */
export const quote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const words = (list) => (list ?? []).map(quote).join(" ");
const valueOf = (a) => (a && typeof a === "object" ? a.value : a);

// Variables only VS Code can answer: a command, the open editor. Inputs the mod can ask for itself.
const ASKS = /\$\{(input|command|file|selectedText|lineNumber|relativeFile|fileBasename|fileDirname|cwd|config|defaultBuildTask)[^}]*\}/g;
const ASKABLE = new Set(["pickString", "promptString"]);
/** The first variable in `v` the mod can't fill, or null. An input it can ask for is fine. */
const asker = (ctx) => (v) => {
  if (typeof v !== "string") return null;
  for (const m of v.matchAll(ASKS)) {
    const id = m[0].match(/^\$\{input:([^}]+)\}$/)?.[1];
    if (!id || !ASKABLE.has(ctx.inputs?.[id]?.type)) return m[0];
  }
  return null;
};
/** Every string inside a value, however deep. */
const strings = (v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);

/** An input's options as { label, value }. */
export const optionsOf = (input) => (Array.isArray(input?.options) ? input.options : [])
  .map((o) => (o && typeof o === "object" ? { label: String(o.label ?? o.value), value: String(o.value) } : { label: String(o), value: String(o) }));

/** The inputs an item asks for, in the order its steps first use them, its dependsOn and
 *  preLaunchTask included. Each is { id, type, description, options, default }. */
export function inputsFor(item, ctx) {
  const ids = [];
  const seen = new Set();
  const visit = (task) => {
    if (!task || seen.has(task)) return;
    seen.add(task);
    for (const dep of [].concat(task.dependsOn ?? [])) visit(ctx.tasks.find((t) => t?.label === (typeof dep === "string" ? dep : dep?.label ?? dep?.task)));
    if (task.preLaunchTask) visit(ctx.tasks.find((t) => t?.label === task.preLaunchTask));
    const { dependsOn: _d, preLaunchTask: _p, ...own } = task;
    for (const str of strings(own)) for (const m of str.matchAll(/\$\{input:([^}]+)\}/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  };
  visit(item.cfg);
  return ids.map((id) => ctx.inputs?.[id]).filter((i) => ASKABLE.has(i?.type))
    .map((i) => ({ id: i.id, type: i.type, description: i.description ?? i.id, options: optionsOf(i), default: i.default == null ? "" : String(i.default), password: i.password === true }));
}

/** Answers for an item's inputs: the last ones given where they're still valid, else each default. */
export function answersFor(inputs, last = {}) {
  const out = {};
  for (const i of inputs) {
    const prev = last?.[i.id];
    const ok = typeof prev === "string" && (i.type !== "pickString" || i.options.some((o) => o.value === prev));
    out[i.id] = ok ? prev : i.type === "pickString" && !i.options.some((o) => o.value === i.default) ? i.options[0]?.value ?? "" : i.default;
  }
  return out;
}

/** Replaces the variables a shell can't: ${workspaceFolder} and friends, and ${input:id} with its
 *  answer, else its default. ${env:X} becomes $X. */
export function resolver(ctx) {
  return (v) => {
    if (typeof v !== "string") return v;
    return v
      .replace(/\$\{input:([^}]+)\}/g, (m, id) => ctx.answers?.[id] ?? (ctx.inputs?.[id]?.default != null ? String(ctx.inputs[id].default) : m))
      .replace(/\$\{workspaceFolder:([^}]+)\}/g, (m, n) => ctx.folders[n] ?? m)
      .replace(/\$\{workspace(Folder|Root)\}/g, ctx.ws)
      .replace(/\$\{workspaceFolderBasename\}/g, baseName(ctx.ws))
      .replace(/\$\{userHome\}/g, ctx.home ?? "${userHome}")
      .replace(/\$\{(pathSeparator|\/)\}/g, "/")
      .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, "$$$1");
  };
}

/** The task with its platform's section (osx, linux) laid over it. */
function forPlatform(task, os) {
  const o = task?.[os];
  if (!o) return task;
  return {
    ...task, ...o,
    options: { ...(task.options ?? {}), ...(o.options ?? {}), env: { ...(task.options?.env ?? {}), ...(o.options?.env ?? {}) } },
  };
}

// Only names a shell can export: anything else would break the step's command line.
const envOf = (env, r) => Object.entries(env ?? {}).filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)).map(([k, v]) => [k, r(String(v))]);
const unsupported = (why) => ({ unsupported: why });

/** Steps for a task, its dependsOn first, or { unsupported }. */
export function taskSteps(label, ctx, seen = new Set()) {
  const raw = ctx.tasks.find((t) => t?.label === label);
  if (!raw) return unsupported(`no task called "${label}"`);
  if (seen.has(label)) return unsupported(`"${label}" depends on itself`);
  seen.add(label);
  const task = forPlatform(raw, ctx.os);
  const r = resolver(ctx);
  const steps = [];
  for (const dep of [].concat(task.dependsOn ?? [])) {
    const d = taskSteps(typeof dep === "string" ? dep : dep?.label ?? dep?.task, ctx, seen);
    if (d.unsupported) return d;
    steps.push(...d.steps);
  }
  const type = task.type ?? "process";
  const command = valueOf(task.command);
  const args = (task.args ?? []).map(valueOf);
  const { dependsOn: _d, ...own } = task;
  const ask = strings(own).map(asker(ctx)).find(Boolean);
  if (ask) return unsupported(`uses ${ask}, which only VS Code can answer`);
  const cwd = r(task.options?.cwd) || ctx.ws;
  const env = envOf(task.options?.env, r);
  if (type === "docker-build") {
    const b = task.dockerBuild ?? {};
    if (!b.tag && !b.context) return unsupported("docker-build without dockerBuild");
    const line = ["docker build",
      b.dockerfile ? `--file ${quote(r(b.dockerfile))}` : "",
      b.tag ? `--tag ${quote(r(b.tag))}` : "",
      b.target ? `--target ${quote(r(b.target))}` : "",
      b.platform ? `--platform ${quote(r(b.platform))}` : "",
      b.pull ? "--pull" : "",
      ...Object.entries(b.buildArgs ?? {}).map(([k, v]) => `--build-arg ${quote(`${k}=${r(String(v))}`)}`),
      ...Object.entries(b.labels ?? {}).filter(([k]) => k !== "includeDefaults").map(([k, v]) => `--label ${quote(`${k}=${r(String(v))}`)}`),
      b.customOptions ? r(String(b.customOptions)) : "",
      quote(r(b.context ?? "${workspaceFolder}"))].filter(Boolean).join(" ");
    steps.push({ cwd, env, line });
  } else if (type === "docker-run") {
    const d = task.dockerRun ?? {};
    if (!d.image) return unsupported("docker-run without an image");
    const name = d.containerName ? r(d.containerName) : null;
    // VS Code's debug mode starts the Python file through its debugger; here it runs plainly.
    const py = task.python ?? {};
    const entry = !d.command && (py.file || py.module) ? ["--entrypoint python3", quote(r(d.image)), py.module ? `-m ${quote(r(py.module))}` : quote(r(py.file)), words((py.args ?? []).map(r))] : [quote(r(d.image)), d.command ? r(String(d.command)) : ""];
    const line = [
      // A container left from an earlier run would hold the name.
      ...(name ? [`{ docker rm -f ${quote(name)} >/dev/null 2>&1 || true; } &&`] : []),
      "docker run --rm -it",
      name ? `--name ${quote(name)}` : "",
      d.network ? `--network ${quote(r(d.network))}` : "",
      ...(d.ports ?? []).map((p) => `--publish ${quote(`${p.hostPort ? `${p.hostPort}:` : ""}${p.containerPort}${p.protocol ? `/${p.protocol}` : ""}`)}`),
      ...(d.volumes ?? []).map((v) => `--volume ${quote(`${r(v.localPath)}:${r(v.containerPath)}${v.permissions === "ro" ? ":ro" : ""}`)}`),
      ...(d.envFiles ?? []).map((f) => `--env-file ${quote(r(f))}`),
      ...Object.entries(d.env ?? {}).map(([k, v]) => `--env ${quote(`${k}=${r(String(v))}`)}`),
      d.customOptions ? r(String(d.customOptions)) : "",
      ...entry].filter(Boolean).join(" ");
    steps.push({ cwd, env, line });
  } else if (type === "npm") {
    if (!task.script) return unsupported("npm task without a script");
    steps.push({ cwd: task.path ? resolvePath(ctx.ws, r(task.path)) : cwd, env, line: `npm run ${quote(task.script)}` });
  } else if (type === "shell" || type === "process") {
    if (command) {
      // A shell task's command is a command line; a process task's is one program.
      const head = type === "shell" ? r(String(command)) : quote(r(String(command)));
      steps.push({ cwd, env, line: `${head} ${words(args.map(r))}`.trim() });
    } else if (!steps.length) {
      return unsupported("task without a command");
    }
  } else {
    return unsupported(`"${type}" tasks need a VS Code extension`);
  }
  return { steps };
}

/** Steps for a launch configuration (run without a debugger), its preLaunchTask first, or { unsupported }. */
export function configSteps(cfg, ctx) {
  const r = resolver(ctx);
  const type = cfg?.type ?? "";
  const { preLaunchTask: _p, ...own } = cfg ?? {};
  const ask = strings(own).map(asker(ctx)).find(Boolean);
  if (ask) return unsupported(`uses ${ask}, which only VS Code can answer`);
  const before = [];
  if (cfg.preLaunchTask) {
    const pre = taskSteps(cfg.preLaunchTask, ctx);
    if (pre.unsupported) return unsupported(`preLaunchTask: ${pre.unsupported}`);
    before.push(...pre.steps);
  }
  const cwd = r(cfg.cwd) || ctx.ws;
  const env = envOf(cfg.env, r);
  const envFile = cfg.envFile ? r(cfg.envFile) : null;
  let line;
  // A Docker launch only attaches VS Code's debugger to what its preLaunchTask starts: run that task.
  if (type === "docker") {
    if (!before.length) return unsupported("docker configuration without a preLaunchTask");
    return { steps: before };
  }
  if (type === "node-terminal") {
    if (!cfg.command) return unsupported("node-terminal without a command");
    line = r(cfg.command);
  } else if (type === "node" || type === "pwa-node") {
    if (!cfg.program && !cfg.runtimeArgs) return unsupported("node without a program");
    line = [quote(r(cfg.runtimeExecutable) || "node"), words(cfg.runtimeArgs?.map(r)), cfg.program ? quote(r(cfg.program)) : "", words(cfg.args?.map(r))].filter(Boolean).join(" ");
  } else if (type === "python" || type === "debugpy") {
    const target = cfg.module ? `-m ${quote(r(cfg.module))}` : cfg.program ? quote(r(cfg.program)) : null;
    if (!target) return unsupported("python without a program or module");
    // VS Code runs the interpreter picked for the folder: here the configuration's `python`, the
    // workspace's python.defaultInterpreterPath, else a venv in the folder, else python3.
    const chosen = r(cfg.python) || r(ctx.settings?.["python.defaultInterpreterPath"]);
    const py = chosen ? quote(chosen) : `"\${py:-python3}"`;
    line = [chosen ? "" : `py=$(ls .venv/bin/python .venv*/bin/python venv/bin/python 2>/dev/null | head -n1) &&`, py, target, words(cfg.args?.map(r))].filter(Boolean).join(" ");
  } else {
    return unsupported(`"${type || "unknown"}" configurations need VS Code's debugger`);
  }
  return { steps: [...before, { cwd, env, envFile, line }] };
}

/** An item's steps, or { unsupported }. */
export const plan = (item, ctx) => (item.kind === "task" ? taskSteps(item.name, ctx) : configSteps(item.cfg, ctx));

// The terminal title marks a run's state, so the mod can read it from panes() without polling.
export const MARK = { running: "▶", done: "✔", failed: "✖" };

/** A pane title's state: "running", "done" or "failed", or null when it isn't one of ours. */
export function stateOf(title) {
  for (const [state, mark] of Object.entries(MARK)) if (String(title ?? "").startsWith(`${mark} `)) return state;
  return null;
}

/** The terminal's argv. It titles the terminal "▶ name" and runs the steps, stopping at the first
 *  failure. Then it prints the result, titles the terminal "✔ name" or "✖ name", and waits for Enter
 *  before closing, so the output stays readable. Enter ends the terminal with `hc kill`, which closes
 *  the tab. Ctrl+C ends it at once and closes the tab. */
export function argv(name, steps) {
  const one = (s) => [
    `cd ${quote(s.cwd)}`,
    ...(s.envFile ? [`set -a`, `. ${quote(s.envFile)}`, `set +a`] : []),
    ...s.env.map(([k, v]) => `export ${k}=${quote(v)}`),
    s.line,
  ].join(" && ");
  const n = quote(name);
  const title = (mark) => `printf '\\033]0;%s %s\\007' '${mark}' ${n}`;
  const script = [
    title(MARK.running),
    `printf '\\033[1m▶ %s\\033[0m\\n' ${n}`,
    `${steps.map((s) => `(${one(s)})`).join(" && ")}`,
    `status=$?`,
    `if [ "$status" -eq 0 ]; then ${title(MARK.done)}; printf '\\n\\033[32m✔ %s finished\\033[0m\\n' ${n};`,
    `else ${title(MARK.failed)}; printf '\\n\\033[31m✖ %s failed (exit %s)\\033[0m\\n' ${n} "$status"; fi`,
    `printf '\\033[2mPress Enter to close this tab.\\033[0m'`,
    `read -r _`,
    // Herdr starts a shell when the program ends, so the tab would stay open: end the terminal itself.
    `if [ -n "$HC_TERMINAL_ID" ] && command -v hc >/dev/null 2>&1; then exec hc kill "$HC_TERMINAL_ID"; fi`,
  ].join("\n");
  return ["sh", "-c", script];
}

/** The key a running item is kept under: machine, workspace folder, kind and name. */
export const runKey = (machine, ws, item) => `${machine ?? ""}|${ws}|${item.kind}|${item.name}`;
