// Self-check for the tasks mod's pure helpers: node tasks/mods/tasks/test_logic.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { argv, configSteps, findArgs, fromVscode, fromWorkspace, items, parseJsonc, plan, quote, resolvePath, runKey, taskSteps, tooBigToSearch } from "./logic.mjs";

// JSON with comments and trailing commas; strings keep their slashes.
assert.deepEqual(parseJsonc(`{ // a comment
  "url": "http://x/*not a comment*/", /* block */ "list": [1, 2,], }`), { url: "http://x/*not a comment*/", list: [1, 2] });

assert.equal(resolvePath("/home/alex/acme/.workspaces", ".."), "/home/alex/acme");
assert.equal(resolvePath("/home/alex/acme/.workspaces", "/srv/app"), "/srv/app");
assert.equal(resolvePath("/home/alex/acme", "./api/../web"), "/home/alex/acme/web");

assert.ok(tooBigToSearch("/home/alex"));
assert.ok(tooBigToSearch("/Users/alex/"));
assert.ok(tooBigToSearch("/"));
assert.ok(!tooBigToSearch("/home/alex/acme"));
assert.equal(findArgs("/home/alex/acme")[0], "/home/alex/acme");

// A .code-workspace one level down, with its folder at "..", and a named second folder.
const ws = fromWorkspace("/home/alex/acme/.workspaces/acme.code-workspace", {
  folders: [{ path: ".." }, { name: "web", path: "../web" }],
  tasks: { tasks: [
    { label: "build", type: "shell", command: "make build", detail: "Builds it" },
    { label: "test", type: "shell", command: "pytest", args: ["-k", "it's"], dependsOn: "build", options: { cwd: "${workspaceFolder:web}", env: { MODE: "${env:HOME}/x", "bad-name": "1" } } },
    { label: "pick", type: "shell", command: "deploy ${input:stage}" },
    { label: "image", type: "docker-build" },
    { label: "secret", type: "shell", command: "true", hide: true },
    { label: "lint", type: "npm", script: "lint", path: "web" },
    { label: "loop", dependsOn: ["loop"] },
  ] },
  launch: { configurations: [
    { name: "API", type: "debugpy", request: "launch", module: "api", args: ["--port", "8000"], envFile: "${workspaceFolder}/.env", preLaunchTask: "build" },
    { name: "Browser", type: "chrome", request: "launch" },
  ] },
});
assert.equal(ws.ws, "/home/alex/acme");
assert.deepEqual(ws.folders, { acme: "/home/alex/acme", web: "/home/alex/acme/web" });
assert.deepEqual(items(ws).map((i) => `${i.kind}:${i.name}`), ["config:API", "config:Browser", "task:build", "task:test", "task:pick", "task:image", "task:lint", "task:loop"]);

const ctx = { ...ws, os: "linux", home: null };
assert.deepEqual(taskSteps("build", ctx), { steps: [{ cwd: "/home/alex/acme", env: [], line: "make build" }] });
const test = taskSteps("test", ctx);
assert.equal(test.steps.length, 2);
assert.deepEqual(test.steps[1], { cwd: "/home/alex/acme/web", env: [["MODE", "$HOME/x"]], line: `pytest '-k' 'it'\\''s'` });
assert.match(taskSteps("pick", ctx).unsupported, /\$\{input:stage\}/);
assert.match(taskSteps("image", ctx).unsupported, /docker-build/);
assert.deepEqual(taskSteps("lint", ctx).steps[0], { cwd: "/home/alex/acme/web", env: [], line: "npm run 'lint'" });
assert.match(taskSteps("loop", ctx).unsupported, /itself/);

const api = configSteps(ws.configs[0], ctx);
assert.equal(api.steps.length, 2);
assert.deepEqual(api.steps[1], { cwd: "/home/alex/acme", env: [], envFile: "/home/alex/acme/.env", line: "'python3' -m 'api' '--port' '8000'" });
assert.match(configSteps(ws.configs[1], ctx).unsupported, /debugger/);
assert.match(plan(items(ws)[2], ctx).steps[0].line, /make build/);

// Platform sections lay over the task.
const plat = fromVscode("/home/alex/acme", { tasks: [{ label: "open", type: "shell", command: "xdg-open .", osx: { command: "open ." } }] }, null);
assert.equal(taskSteps("open", { ...plat, os: "osx" }).steps[0].line, "open .");
assert.equal(taskSteps("open", { ...plat, os: "linux" }).steps[0].line, "xdg-open .");

assert.equal(quote("a'b"), `'a'\\''b'`);
assert.equal(runKey(null, "/home/alex/acme", { kind: "task", name: "build" }), "|/home/alex/acme|task|build");

// The argv really runs: steps in order, a failure stops the rest, and an error line is printed.
const run = (steps) => {
  const [sh, c, script] = argv("demo", steps);
  return execFileSync(sh, [c, script.replace(/\nexec .*$/, "")], { env: { ...process.env, SHELL: "/bin/sh" } }).toString();
};
const ok = run([{ cwd: "/tmp", env: [["GREETING", "hi there"]], line: "echo \"$GREETING\" && pwd" }, { cwd: "/", env: [], line: "echo second" }]);
assert.match(ok, /▶ demo/);
assert.match(ok, /hi there\n\/(private\/)?tmp\nsecond/);
const failed = run([{ cwd: "/tmp", env: [], line: "false" }, { cwd: "/", env: [], line: "echo never" }]);
assert.doesNotMatch(failed, /never/);
assert.match(failed, /demo stopped with an error/);

console.log("ok");
