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
  };
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

// Variables only VS Code can answer: an input box, a command, the open editor.
const ASKS = /\$\{(input|command|file|selectedText|lineNumber|relativeFile|fileBasename|fileDirname|cwd|config|defaultBuildTask)[^}]*\}/;
const asks = (v) => (typeof v === "string" ? ASKS.exec(v)?.[0] ?? null : null);

/** Replaces the variables a shell can't: ${workspaceFolder} and friends. ${env:X} becomes $X. */
export function resolver(ctx) {
  return (v) => {
    if (typeof v !== "string") return v;
    return v
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
  const ask = [command, ...args, task.options?.cwd, task.path, task.script].map(asks).find(Boolean);
  if (ask) return unsupported(`uses ${ask}, which only VS Code can answer`);
  const cwd = r(task.options?.cwd) || ctx.ws;
  const env = envOf(task.options?.env, r);
  if (type === "npm") {
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
  const fields = [cfg?.program, cfg?.module, cfg?.command, cfg?.cwd, cfg?.envFile, ...(cfg?.args ?? []), ...(cfg?.runtimeArgs ?? [])];
  const ask = fields.map(asks).find(Boolean);
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
  if (type === "node-terminal") {
    if (!cfg.command) return unsupported("node-terminal without a command");
    line = r(cfg.command);
  } else if (type === "node" || type === "pwa-node") {
    if (!cfg.program && !cfg.runtimeArgs) return unsupported("node without a program");
    line = [quote(r(cfg.runtimeExecutable) || "node"), words(cfg.runtimeArgs?.map(r)), cfg.program ? quote(r(cfg.program)) : "", words(cfg.args?.map(r))].filter(Boolean).join(" ");
  } else if (type === "python" || type === "debugpy") {
    const target = cfg.module ? `-m ${quote(r(cfg.module))}` : cfg.program ? quote(r(cfg.program)) : null;
    if (!target) return unsupported("python without a program or module");
    line = [quote(r(cfg.python) || "python3"), target, words(cfg.args?.map(r))].filter(Boolean).join(" ");
  } else {
    return unsupported(`"${type || "unknown"}" configurations need VS Code's debugger`);
  }
  return { steps: [...before, { cwd, env, envFile, line }] };
}

/** An item's steps, or { unsupported }. */
export const plan = (item, ctx) => (item.kind === "task" ? taskSteps(item.name, ctx) : configSteps(item.cfg, ctx));

/** The terminal's argv: prints the name, runs the steps, stops at the first failure, then stays a shell. */
export function argv(name, steps) {
  const one = (s) => [
    `cd ${quote(s.cwd)}`,
    ...(s.envFile ? [`set -a`, `. ${quote(s.envFile)}`, `set +a`] : []),
    ...s.env.map(([k, v]) => `export ${k}=${quote(v)}`),
    s.line,
  ].join(" && ");
  const body = steps.map((s) => `(${one(s)})`).join(" && ");
  const script = [
    `printf '\\033[1m▶ %s\\033[0m\\n' ${quote(name)}`,
    `${body} || printf '\\033[31m✖ %s stopped with an error\\033[0m\\n' ${quote(name)}`,
    `exec "\${SHELL:-/bin/sh}"`,
  ].join("\n");
  return ["sh", "-c", script];
}

/** The key a running item is kept under: machine, workspace folder, kind and name. */
export const runKey = (machine, ws, item) => `${machine ?? ""}|${ws}|${item.kind}|${item.name}`;
