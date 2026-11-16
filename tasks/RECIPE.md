# Tasks

VS Code's tasks and launch configurations of the folder you're in, run from Herdr's status bar. A Run
chip appears when the focused folder has a `.vscode/tasks.json`, a `.vscode/launch.json` or a
`*.code-workspace` file. It opens a list with a play button per item. Each running item gets its own
chip in the bar with restart and stop. Items run as plain shell commands in a tab of their own;
launch configurations run without a debugger.

## What you see

- **In the status bar**, a block of the layout's status row, 11.8px text, 10px side padding:
  - A Run chip when the folder has items: a green play icon in `ansi2`, "Run" in `muted`, and the
    workspace folder's name in `dim`, at most 220px. Hover names the item count and the source file.
    Nothing at all when there are no items and nothing runs.
  - One chip per running item, on `raised`, at most 260px: a 6px `working` dot, the name in
    `foreground`, a restart icon in `ansi2` and a stop icon in `ansi1`.
- **The list**, a 340px popup at the pointer, up to 560px tall, on `popover`:
  - A 40px header: "Run" semibold, then the source as a chip on `raised`. With several source
    files the chip reads `label  1/2` and a click switches to the next one.
  - **Launch** and **Tasks** sections with 11px `dim` titles. Rows are 28px: a 6px dot in
    `working` while the item's tab is open, the name, and a play icon, or restart and stop while it
    runs. Hover shows a task's `detail`. Items that can't run are `dim`, with the reason on hover.
  - "No tasks.json, launch.json or .code-workspace here or in the folders above." when empty, and a
    parse error in `blocked`.

## How it behaves

- **Which folder:** the focused pane's live folder, else the shown space's folder, on the shown
  space's machine, so remote spaces work too. It then looks upward for the nearest folder holding
  `.vscode/tasks.json` or `launch.json`, or `*.code-workspace` files in it or one level down, such as
  `.workspaces/name.code-workspace`. Home folders and anything above them are never searched with
  `find`. It looks again every 2.5 s and whenever the focused folder changes.
- **Which file:** a `.code-workspace` file comes first, else `.vscode`. The source chip switches
  between them; the pick is kept per machine and folder in shared state `tasks.picks`.
- **A `.code-workspace` file:** its `folders` are resolved against the file's own folder. The first
  one is `${workspaceFolder}`, and each can be named with `${workspaceFolder:Name}`. Its `tasks` and
  `launch` sections are read like `tasks.json` and `launch.json`.
- **Play** only from the play icon, never from a click on the row, so a stray click can't start a
  deploy. It opens a tab named after the item in the shown space, running `sh -c`: print `▶ name`,
  run each step in order, stop at the first failure with a red line, then stay a shell.
- **Running items** are kept in shared state `tasks.running` by key: machine, workspace folder,
  kind and name. `tab.new` doesn't say which tab it made, so the start is put in `tasks.pending`, and
  the bar copy finds the new tab with that name every 500 ms, for up to 20 s. A tab that's gone
  drops its item. Clicking a running chip's name selects its space and tab.
- **Restart** closes the tab and starts the item again. **Stop** closes the tab with `tab.close`
  `confirmed: true`.

What runs:

- Tasks of type `shell`, `process` and `npm`, with `dependsOn` first, `options.cwd`, `options.env`,
  and the `osx` or `linux` section laid over the task.
- Launch configurations of type `node` and `pwa-node`, `node-terminal`, and `python` or `debugpy`,
  with `cwd`, `env`, `envFile` and `preLaunchTask`.
- Variables: `${workspaceFolder}`, `${workspaceFolder:Name}`, `${workspaceRoot}`,
  `${workspaceFolderBasename}`, `${userHome}` on this computer, `${pathSeparator}`, `${/}`, and
  `${env:NAME}` handed to the shell as `$NAME`.

## Built from

- `mods/tasks/`: `main.js` (the view in two roles by `props().role`), `logic.mjs` (pure: JSONC
  parsing, sources, items, steps, the `sh` script), `test_logic.mjs`, `mod.json`
  `{ "place": "none", "title": "Tasks" }`, and three stroke icons in `icons/`.
- Placed as a block in the layout's status row:
  `{ "id": "tasks", "type": "block", "size": { "weight": 2 }, "content": { "mod": "tasks" } }`.
- `herdr`: `spaces`, `panes`, `focused`, `readTextFile` and `exec` with `on`, `openOverlay`,
  `closeOverlay`, `shared`, `setShared`, `run`, `theme`, `window`, `home`, `props`.
- Commands: `tab.new`, `tab.close`, `space.select`, `tab.select`. Programs: `find`, `sh`, and
  whatever the items run.

## Watch out

- A popup's timers stop when it closes, so only the bar copy settles new tabs; the popup only writes
  `tasks.pending`.
- Task types from VS Code extensions, such as `docker-build`, `docker-run` or `aws-sam`, and
  variables only VS Code can answer, such as `${input:…}`, `${command:…}`, `${file}` or `${config:…}`,
  can't run. Those items show why on hover.
- `dependsOrder: "parallel"` still runs one after another.
- Launch configurations run without a debugger: breakpoints need VS Code.
- It runs the projects' own commands as written: use it in repos you trust.

## Done when

- `node tasks/mods/tasks/test_logic.mjs` prints `ok` and `herdr-app check tasks/mods/tasks` passes.
- Focusing a terminal in a folder with `.workspaces/x.code-workspace` holding a `build` shell task
  shows the Run chip; the list shows `build` with a play icon.
- Play opens a tab named `build` that prints `▶ build` and stays a shell; the bar gains a `build`
  chip with restart and stop; stop closes the tab and the chip goes.
- A `docker-build` task shows `dim` with "need a VS Code extension" on hover.
- Focusing a terminal in a folder without any of the files hides the Run chip.
