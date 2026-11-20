# herdr-kit

Small mods for the [Herdr](https://herdr.dev) desktop app.

| Mod | What it does |
|---|---|
| [tasks](tasks/RECIPE.md) | Runs VS Code tasks and launch configurations from the status bar, `.code-workspace` files included. Asks for `${input:…}` values first and runs Docker build and run tasks. A chip per running task restarts or stops it. |
| [keep-awake](keep-awake/RECIPE.md) | A cup in the status bar that keeps your Mac's display awake while it's on. |
| [theme-switch](theme-switch/RECIPE.md) | A palette in the status bar that picks any theme, light, dark or following the system, without changing the layout. Comes with Catppuccin, Tokyo Night and Ayu in all their variants. |
| [pane-plus](pane-plus/RECIPE.md) | Herdr's pane header with a mark on a zoomed pane, a tinted header with a dashed accent line, no zoom button on a tab's only pane, and a mark on a pane whose machine is down. |
| [spotify-mini](spotify-mini/RECIPE.md) | A Spotify miniplayer for the sidebar, with cover, progress and controls, or a compact status-bar slot. Talks to the Mac app: no sign-in. |

## Install

Ask your Herdr agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add the tasks mod from https://github.com/hermetico/herdr-kit
```

Or by hand: copy `tasks/mods/tasks` or `keep-awake/mods/keep-awake` into `~/.config/herdr-app/mods/`,
then add a block for it to your layout's status row, as each recipe shows.

## Checks

```sh
node tasks/mods/tasks/test_logic.mjs
node spotify-mini/mods/spotify-mini/test_logic.mjs
node theme-switch/mods/theme-switch/test_logic.mjs
herdr-app check tasks/mods/tasks
herdr-app check keep-awake/mods/keep-awake
herdr-app check spotify-mini/mods/spotify-mini
herdr-app check theme-switch/mods/theme-switch
herdr-app check pane-plus/mods/pane-plus
```

## License

MIT, see [LICENSE](LICENSE).
