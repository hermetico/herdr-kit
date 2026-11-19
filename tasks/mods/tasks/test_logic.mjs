// Self-check for the tasks mod's pure helpers: node tasks/mods/tasks/test_logic.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { answersFor, argv, configSteps, inputsFor, stateOf, findArgs, fromVscode, fromWorkspace, items, parseJsonc, plan, quote, resolvePath, runKey, taskSteps, tooBigToSearch } from "./logic.mjs";

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
assert.deepEqual(api.steps[1], { cwd: "/home/alex/acme", env: [], envFile: "/home/alex/acme/.env", line: `py=$(ls .venv/bin/python .venv*/bin/python venv/bin/python 2>/dev/null | head -n1) && "\${py:-python3}" -m 'api' '--port' '8000'` });
assert.match(configSteps(ws.configs[0], { ...ctx, settings: { "python.defaultInterpreterPath": "${workspaceFolder}/.venv312/bin/python" } }).steps[1].line, /^'\/home\/alex\/acme\/\.venv312\/bin\/python' -m 'api'/);
// The venv lookup really runs: a folder's .venv wins over python3.
const venv = execFileSync("sh", ["-c", `cd "$(mktemp -d)" && mkdir -p .venv/bin && printf '#!/bin/sh\\necho venv "$@"\\n' > .venv/bin/python && chmod +x .venv/bin/python && ${api.steps[1].line}`]).toString();
assert.equal(venv, "venv -m api --port 8000\n");
assert.match(configSteps(ws.configs[1], ctx).unsupported, /debugger/);
assert.match(plan(items(ws)[2], ctx).steps[0].line, /make build/);

// Platform sections lay over the task.
const plat = fromVscode("/home/alex/acme", { tasks: [{ label: "open", type: "shell", command: "xdg-open .", osx: { command: "open ." } }] }, null);
assert.equal(taskSteps("open", { ...plat, os: "osx" }).steps[0].line, "open .");
assert.equal(taskSteps("open", { ...plat, os: "linux" }).steps[0].line, "xdg-open .");

assert.equal(quote("a'b"), `'a'\\''b'`);
assert.equal(runKey(null, "/home/alex/acme", { kind: "task", name: "build" }), "|/home/alex/acme|task|build");

// The argv really runs: steps in order, a failure stops the rest, the result is printed and titled.
const run = (steps) => {
  const [sh, c, script] = argv("demo", steps);
  // Without HC_TERMINAL_ID the script stops at Enter rather than ending the terminal it runs in.
  const env = { ...process.env }; delete env.HC_TERMINAL_ID;
  return execFileSync(sh, [c, script], { input: "\n", env }).toString();
};
const ok = run([{ cwd: "/tmp", env: [["GREETING", "hi there"]], line: "echo \"$GREETING\" && pwd" }, { cwd: "/", env: [], line: "echo second" }]);
assert.match(ok, /\]0;▶ demo\x07/);
assert.match(ok, /hi there\n\/(private\/)?tmp\nsecond/);
assert.match(ok, /\]0;✔ demo\x07/);
assert.match(ok, /✔ demo finished/);
assert.match(ok, /Press Enter to close this tab/);
assert.match(argv("demo", [])[2], /exec hc kill "\$HC_TERMINAL_ID"/);
const failed = run([{ cwd: "/tmp", env: [], line: "exit 3" }, { cwd: "/", env: [], line: "echo never" }]);
assert.doesNotMatch(failed, /never/);
assert.match(failed, /\]0;✖ demo\x07/);
assert.match(failed, /✖ demo failed \(exit 3\)/);

assert.equal(stateOf("▶ Check: Tests"), "running");
assert.equal(stateOf("✔ Check: Tests"), "done");
assert.equal(stateOf("✖ Check: Tests"), "failed");
assert.equal(stateOf("fish ~/acme"), null);
assert.equal(stateOf(null), null);

// Inputs: a pickString and a promptString are asked for, a command input can't be.
const dk = fromWorkspace("/home/alex/acme/.workspaces/acme.code-workspace", {
  folders: [{ path: ".." }],
  launch: {
    inputs: [{ id: "model", type: "pickString", options: ["indoor", "outdoor"], default: "indoor" }],
    configurations: [
      { name: "Docker", type: "docker", request: "launch", preLaunchTask: "run-local" },
      { name: "Script", type: "debugpy", request: "launch", program: "main.py", args: ["-c", "cfg.${input:model}.yaml"] },
      { name: "Cmd", type: "debugpy", request: "launch", program: "main.py", args: ["${command:pickFile}"] },
    ],
  },
  tasks: {
    inputs: [
      { id: "model", type: "pickString", options: ["indoor", "outdoor"], default: "outdoor" },
      { id: "tag", type: "pickString", options: [{ label: "Latest", value: "v2" }, "v1"], default: "v2" },
      { id: "runs", type: "promptString", description: "How many runs", default: "10" },
      { id: "pick", type: "command", command: "some.command" },
    ],
    tasks: [
      { label: "login", type: "shell", command: "aws sso login", options: { cwd: "${userHome}" } },
      { label: "build-local", type: "docker-build", dockerBuild: { context: "${workspaceFolder}", dockerfile: "${workspaceFolder}/Dockerfile.local", tag: "acme-${input:model}:${input:tag}", customOptions: "--secret id=s,src=${userHome}/.s.env", buildArgs: { MODEL: "${input:model}" } } },
      { label: "run-local", type: "docker-run", dependsOn: ["login", "build-local"],
        dockerRun: { containerName: "acme-${input:model}", image: "acme-${input:model}:${input:tag}", network: "host", customOptions: "--gpus=all",
          volumes: [{ localPath: "${userHome}/.aws", containerPath: "/root/.aws", permissions: "ro" }], env: { MODE: "${input:model}" } },
        python: { file: "/app/main.py" } },
      { label: "queue", type: "shell", command: "python", args: ["queue.py", "--number", "${input:runs}"] },
      { label: "picky", type: "shell", command: "echo ${input:pick}" },
    ],
  },
});
const dctx = { ...dk, os: "linux", home: "/home/alex" };
assert.equal(dk.inputs.model.default, "outdoor");
const runLocal = items(dk).find((i) => i.name === "Docker");
assert.deepEqual(inputsFor(runLocal, dctx).map((i) => i.id), ["model", "tag"]);
assert.deepEqual(inputsFor(runLocal, dctx)[1].options, [{ label: "Latest", value: "v2" }, { label: "v1", value: "v1" }]);
assert.deepEqual(answersFor(inputsFor(runLocal, dctx), { model: "indoor", tag: "gone" }), { model: "indoor", tag: "v2" });
const dsteps = plan(runLocal, { ...dctx, answers: { model: "indoor", tag: "v1" } }).steps;
assert.equal(dsteps.length, 3);
assert.deepEqual(dsteps[0], { cwd: "/home/alex", env: [], line: "aws sso login" });
assert.equal(dsteps[1].line, "docker build --file '/home/alex/acme/Dockerfile.local' --tag 'acme-indoor:v1' --build-arg 'MODEL=indoor' --secret id=s,src=/home/alex/.s.env '/home/alex/acme'");
assert.equal(dsteps[2].line, "{ docker rm -f 'acme-indoor' >/dev/null 2>&1 || true; } && docker run --rm -it --name 'acme-indoor' --network 'host' --volume '/home/alex/.aws:/root/.aws:ro' --env 'MODE=indoor' --gpus=all --entrypoint python3 'acme-indoor:v1' '/app/main.py'");
// Without answers, defaults fill in, the tasks' input winning over launch's, so the row can be checked before asking.
assert.match(plan(items(dk).find((i) => i.name === "Script"), dctx).steps[0].line, /'main\.py' '-c' 'cfg\.outdoor\.yaml'/);
assert.match(plan(items(dk).find((i) => i.name === "Cmd"), dctx).unsupported, /command:pickFile/);
assert.deepEqual(inputsFor(items(dk).find((i) => i.name === "queue"), dctx).map((i) => [i.type, i.description, i.default]), [["promptString", "How many runs", "10"]]);
assert.match(plan(items(dk).find((i) => i.name === "picky"), dctx).unsupported, /input:pick/);
assert.match(configSteps({ name: "D", type: "docker", request: "launch" }, dctx).unsupported, /preLaunchTask/);

console.log("ok");
