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

The index workflow watches `index.html`, and the board-games workflow watches
`board-games/**`. Changes to either page on `main` trigger the corresponding deploy.
Both workflows also support manual runs via **Run workflow** in the Actions tab.

## Board-game data validation

The repository includes Git hooks that validate board-game data. The pre-commit hook
compares the staged game counts, play times, complexity, recommended ages, and average
ratings against `board-games/scripts/board-games-bgg-reference.csv`, and checks that
each game's complexity tag matches its weight rounded to one decimal place. It reports
differences before allowing the commit. The pre-push hook validates the structure of
`board-games/games.json`. Python is required. Enable the hooks once in each clone with:

```sh
git config core.hooksPath .githooks
```

To run the CSV consistency check manually against working-tree files:

```sh
python board-games/scripts/check_bgg_reference.py
```

Check complexity tags manually with:

```sh
python board-games/scripts/check_complexity_tags.py
```

To repair stale complexity tags from the numeric weights:

```sh
python board-games/scripts/check_complexity_tags.py --fix
```
