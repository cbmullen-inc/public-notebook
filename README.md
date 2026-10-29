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
- **`pbem-status/index.html`** — a read-only dashboard of active games from the
  separate PBEM Discord bot service. `pbem-status/config.js` supplies that service's
  public Vercel origin. The dashboard groups games by server name and displays
  active game and player status, but does not expose Discord IDs or provide controls.
- **`ear-training/`** — the installable saxophone listening-drills app, published
  under `/ear-training/`.

## Layout

```
.
├── index.html                    # home page (note list)
├── board-games/
│   ├── board-games.html          # board game shelf page
│   └── board-games.css
├── ear-training/                 # installable saxophone drills
├── pbem-status/
│   ├── index.html                # read-only active PBEM status dashboard
│   └── config.js                 # PBEM bot's public Vercel origin
└── .github/workflows/
    └── deploy-site.yml           # publishes all pages in one serialized deployment
```

## Publishing

The site workflow copies all published pages from `main` into the `gh-pages` branch
using `peaceiris/actions-gh-pages` with `keep_files: true`:

| Workflow | Copies to gh-pages as |
|---|---|
| `deploy-site.yml` | `index.html`, board-game files, `ear-training/`, and `pbem-status/` |

Changes to any published page trigger the same deployment. Serializing one full-site
deployment avoids competing pushes to `gh-pages`, and ensures each deployment
contains all pages. The workflow also supports manual runs via **Run workflow** in
the Actions tab.

The deployment copies only the PBEM page and its runtime config; the local
`pbem-status/TODO` file is not published. Set `window.PBEM_STATUS_API_BASE` in
`pbem-status/config.js` to the production Vercel origin for `pbem-discord-bot`
(for example, `https://your-project.vercel.app`, with no path). The helper API
allows cross-origin read-only requests from the public page. Do not put credentials
or database URLs in this file.

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
