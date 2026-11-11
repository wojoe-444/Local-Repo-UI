# Local Repo UI

A desktop app (Electron + React) that gives any **local git repository** the GitHub browsing experience, for projects that are too sensitive to upload anywhere, and doubles as a client for your real GitHub repositories.

**Local-only repositories never leave your machine.** They only use the local `git` CLI and a local issue store; no network request is ever made on their behalf. The renderer has a strict Content-Security-Policy with no network access at all, remote images are blocked, and no telemetry exists. The only network traffic in the app is the main process talking to `api.github.com`, and only after you sign in and only for repositories that live on GitHub.

## Features (MVP)

- Open any folder inside a git repo (recent repos remembered)
- Code tab: file browser with last-commit message/age per entry, breadcrumbs, branch/tag switcher
- README rendering (GitHub-flavoured Markdown, relative links and images resolve inside the repo)
- File viewer with syntax highlighting, line numbers, copy, image preview, Markdown preview/code toggle
- Commit history (per branch, per file/folder, search, paging) and commit pages with diffs
- Branches and tags list with ahead/behind counts against the default branch
- Compare page: a local stand-in for pull requests (commits + diff between two refs)

Browsing is read-only and works on committed content at any ref, so your working tree is never touched.

## Issues

Every repository has an **Issues** tab styled after GitHub's: open/closed tabs with counts, search, label filter, new issue form with Write/Preview, issue pages with comments, labels, edit title/description, and close (completed / not planned) or reopen.

Where the issues live depends on the repository:

- **Local-only repository** (no github.com remote): issues are real, but stored as JSON in the app's data folder (under `%APPDATA%` on Windows, in a `local-issues` subfolder) and never uploaded. They are keyed by the repository's path.
- **Repository on GitHub** (opened from the GitHub list, or a local checkout whose `origin`/other remote points at github.com): operations are **live** through the GitHub API. Creating an issue really creates it on github.com. A banner on the Issues tab always says which mode you are in.
- A local checkout that has a github.com remote can be switched to **local-only issues** with one click (remembered per repository), if you want to keep its issues off GitHub.

## GitHub account

Sign in from the home page with a personal access token (the page links to GitHub's token form with the `repo` and `read:org` scopes pre-selected). The app then lists every repository you can access, with filters for **Yours**, **Organizations** and **Shared with you**, so organization repositories you do not own show up too. For organizations with SAML SSO, authorize the token for the organization on GitHub.

- The token is encrypted with the OS secure storage (DPAPI on Windows, via Electron `safeStorage`) and stored in the app data folder. If secure storage is unavailable it is only kept in memory until you close the app.
- The token only exists in the main process. The renderer never sees it, and cannot make network requests.
- Opening a GitHub repository that has no local clone shows its issues; use *Link a local clone* to also browse its code, commits and branches from a clone on disk. Opening any local checkout with a github.com remote registers it as that repository's clone automatically.

## Requirements

- Node.js 22.12+ (required by Electron 45)
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
| `src/main` | Electron main process: window, IPC, `git.ts` (git CLI wrapper), `diff.ts` (unified diff parser), `local-issues.ts` (local issue store), `github.ts` (GitHub API client), `issue-service.ts` (routes issue calls to local or GitHub), `vault.ts` (encrypted token), `settings.ts` |
| `src/preload` | Exposes a typed `window.api` to the renderer via `contextBridge` |
| `src/shared` | Types and the IPC API contract |
| `src/renderer/src` | React UI (pages, components, GitHub-dark styling) |

## Security notes

- Renderer is sandboxed (`contextIsolation`, no Node integration); navigation and new windows are denied. `connect-src` stays `'self'`: all GitHub traffic goes through the main process.
- GitHub calls only go to `api.github.com` (avatars from `avatars.githubusercontent.com`), with owner/repo names validated before they reach a URL. Issue targets are resolved in one place (`issue-service.ts`) and a local target can never reach the GitHub client (covered by a test).
- Links inside issue text open in the system browser, https only; images in issue text are not loaded.
- The main process only serves repos the user explicitly opened.
- Refs and paths from the UI are validated so they cannot be interpreted as git options or escape the repo.

## Ideas / roadmap

GitHub OAuth device-flow sign-in (needs a registered OAuth app), browsing GitHub-only repos without a clone, issue templates and milestones, local pull requests (saved branch comparisons with review comments), blame view, file finder (`t`), code search, contributors/insights graphs, light theme, working-tree/uncommitted changes view.
