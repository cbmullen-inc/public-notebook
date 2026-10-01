# Public Notebook

A small personal site of standalone HTML pages, published to the `gh-pages` branch via GitHub Actions.

Live site: <https://cbmullen-inc.github.io/public-notebook/>

## Pages

- **`index.html`** — the home page ("Notes"). A self-contained, searchable note list with
  text search and tag filters, light/dark themes. Each note is a line in the `notes`
  array at the top of the page's script — add an entry there to link a new page.
- **`board-games/board-games.html`** (+ `board-games.css`) — "My board game shelf": the
  games I own, grouped by co-op and competitive, sortable by play time, player count
  and complexity. Compiled by Claude. Served at `/board-games.html` on the live site.

## Layout

```
.
├── index.html                    # home page (note list)
├── board-games/
│   ├── board-games.html          # board game shelf page
│   └── board-games.css
└── .github/workflows/
    ├── deploy-index.yml          # publishes index.html
    └── deploy-board-games.yml    # publishes the board-games page
```

## Publishing

Both workflows copy files from `main` into the root of the `gh-pages` branch using
`peaceiris/actions-gh-pages` with `keep_files: true` (so each workflow only overwrites
its own files):

| Workflow | Copies to gh-pages as |
|---|---|
| `deploy-index.yml` | `index.html` |
| `deploy-board-games.yml` | `board-games.html`, `board-games.css` |

**Heads-up:** the `on.push.paths` filters in both workflows are stale — `deploy-index.yml`
watches `menu.html` and `deploy-board-games.yml` watches `board-games.html` /
`board-games.css` at the repo root, neither of which exists on `main`. A normal push
therefore will *not* trigger a deploy. To publish, use **Run workflow** in the Actions
tab (both workflows support `workflow_dispatch`), or fix the path filters to
`index.html` and `board-games/`.