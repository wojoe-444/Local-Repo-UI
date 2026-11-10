# Local Repo UI

A desktop app (Electron + React) that gives any **local git repository** the GitHub browsing experience, for projects that are too sensitive to upload anywhere.

**Everything stays on your machine.** The app only runs the local `git` CLI. It makes no network requests: the renderer has a strict Content-Security-Policy, remote images in READMEs are blocked, and no telemetry exists.

## Features (MVP)

- Open any folder inside a git repo (recent repos remembered)
- Code tab: file browser with last-commit message/age per entry, breadcrumbs, branch/tag switcher
- README rendering (GitHub-flavoured Markdown, relative links and images resolve inside the repo)
- File viewer with syntax highlighting, line numbers, copy, image preview, Markdown preview/code toggle
- Commit history (per branch, per file/folder, search, paging) and commit pages with diffs
- Branches and tags list with ahead/behind counts against the default branch
- Compare page: a local stand-in for pull requests (commits + diff between two refs)

Browsing is read-only and works on committed content at any ref, so your working tree is never touched.

## Requirements

- Node.js 20+
- `git` available on `PATH`

## Develop

```bash
npm install
npm run dev        # Electron with hot reload
npm test           # git service tests (creates temp repos)
npm run typecheck
npm run build
npm run dist       # Windows installer via electron-builder
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/main` | Electron main process: window, IPC, `git.ts` (git CLI wrapper), `diff.ts` (unified diff parser) |
| `src/preload` | Exposes a typed `window.api` to the renderer via `contextBridge` |
| `src/shared` | Types and the IPC API contract |
| `src/renderer/src` | React UI (pages, components, GitHub-dark styling) |

## Security notes

- Renderer is sandboxed (`contextIsolation`, no Node integration); navigation and new windows are denied.
- The main process only serves repos the user explicitly opened.
- Refs and paths from the UI are validated so they cannot be interpreted as git options or escape the repo.

## Ideas / roadmap

Local pull requests (saved branch comparisons with review comments), blame view, local issues stored in the repo (e.g. a `refs/`-based or `.local-issues` store), file finder (`t`), code search, contributors/insights graphs, light theme, working-tree/uncommitted changes view.
