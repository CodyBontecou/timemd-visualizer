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
| Projects | Category groups with donut distribution chart and stats |
| Web History | Browser history timeline, top domains, hourly activity |
| Reports | Daily / weekday breakdowns with CSV / JSON / Markdown export |

Open any view from the command palette (`time.md: Open Overview`, etc.) or the ribbon icon.

## Embedding into notes

Drop a `timemd` code block into any note to render a live widget that updates whenever you reload exports:

````markdown
```timemd
view: overview
```
````

### Supported views

| `view` | Renders |
|--------|---------|
| `overview` | Stats strip, trend sparkline, top apps (default) |
| `stat` | One big number — configure with `metric:` |
| `trends`, `trend-chart` | Daily line chart |
| `calendar`, `heatmap` | 7×24 weekly heatmap |
| `apps`, `top-apps` | App bar list |
| `categories` | Category bar list |
| `details` | Recent sessions list |
| `projects` | Categories list + distribution donut + stats |
| `distribution` | Donut chart + category legend + stats card (no list) |
| `web-history` | Browser history (timeline / domains / activity tab) |
| `reports` | Time distribution + weekday averages + report data table |

### Parameters

| key | applies to | default | description |
|-----|------------|---------|-------------|
| `view` | all | `overview` | widget type (see table above) |
| `limit` | `overview`, `top-apps`, `categories`, `details` | varies | number of items shown |
| `days` | `overview`, `trend-chart` | all | restrict to last N days of trend data |
| `metric` | `stat` | `total_time` | `total_time`, `top_app`, `apps_count`, `days`, `peak_day` |
| `sections` | `overview` | all | comma-separated list of `stats`, `trend`, `heatmap`, `apps` |
| `date` | `overview` | — | `today`, `yesterday`, or `YYYY-MM-DD` — filters every panel to that single day (requires Raw Sessions in the export) |
| `tab` | `web-history` | `timeline` | `timeline`, `domains`, or `activity` |
| `browser` | `web-history` | — | filter to a single browser (`Safari`, `Chrome`, `Arc`, …) |
| `stats` | `distribution` | `true` | `false` to hide the STATS card |
| `legend` | `distribution` | `true` | `false` to hide the legend list (donut-only) |
| `label` | `distribution` | `true` | `false` to hide the "DISTRIBUTION" label |
| `groupBy` | `reports` | `app` | `app`, `category`, or `day` |
| `format` | `reports` | `csv` | `csv`, `json`, or `markdown` (used by the in-view Export button) |
| `title` | all | — | optional heading |

### Examples

Dashboard stat card for a daily note:

````markdown
```timemd
view: stat
metric: total_time
title: Screen time today
```
````

Last 7 days of trend:

````markdown
```timemd
view: trend-chart
days: 7
title: Last week
```
````

Top 5 apps:

````markdown
```timemd
view: top-apps
limit: 5
```
````

Lean overview — stats and apps only, last 7 days:

````markdown
```timemd
view: overview
sections: stats, apps
days: 7
limit: 3
```
````

Just yesterday:

````markdown
```timemd
view: overview
date: yesterday
title: Yesterday
```
````

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
