# time.md for Obsidian

Navigate and visualize data exported from the [time.md](https://timeprint.app) screen-time analytics app, directly inside Obsidian.

Drop any time.md export into a folder in your vault and the plugin recreates the core time.md experience — Overview, Trends, Calendar, Details, and Apps & Categories views — without needing to open the app.

## Supported import formats

The plugin auto-detects and parses every format time.md can export:

- **JSON** (`.json`) — nested or flat
- **CSV** (`.csv`) — with or without metadata comments and section markers
- **Markdown** (`.md`) — GitHub-flavored tables with metadata header
- **Obsidian** (`.md`) — YAML frontmatter + wiki links, fully navigable in place

## Views

| View | What it shows |
|------|---------------|
| Overview | Today's total, top apps, sparkline, key metrics |
| Trends | Daily / weekly line chart with period comparison |
| Calendar | Month grid + 7×24 usage heatmap |
| Details | Filterable raw-session table |
| Apps & Categories | Aggregated apps and user-defined categories |

Open any view from the command palette (`time.md: Open Overview`, etc.) or the ribbon icon.

## Setup

1. Install the plugin (see "Manually installing" below while it's pre-release).
2. Export data from the time.md app using any supported format.
3. Place the exported file(s) inside a folder in your Obsidian vault.
4. Point the plugin at that folder in Settings → time.md → Export folder.
5. Run **time.md: Open Overview** from the command palette.

## Manually installing (pre-release)

1. Build locally: `npm install && npm run build`
2. Copy `main.js`, `styles.css`, `manifest.json` into `<vault>/.obsidian/plugins/obsidian-timemd/`
3. Enable the plugin in Obsidian settings.

## Development

```sh
npm install
npm run dev   # esbuild in watch mode
npm run build # type-check + production build
```

## License

0BSD (same as the sample plugin template).
