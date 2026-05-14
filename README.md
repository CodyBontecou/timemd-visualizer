# timemd-visualizor for Obsidian

timemd-visualizor navigates and visualizes data exported from the [time.md](https://timeprint.app) screen-time analytics app, directly inside Obsidian.

Drop any time.md export into a folder in your vault and timemd-visualizor recreates the core time.md experience — Overview, Trends, Calendar, Details, and Apps & Categories views — without needing to open the app.

## Supported import formats

timemd-visualizor auto-detects and parses every format time.md can export:

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
| Input Tracking | Cursor heatmap, typing intensity, top words / keys, per-app clicks (opt-in in time.md) |

Open any view from the command palette (`timemd-visualizor: Open Overview`, etc.) or the ribbon icon.

## Input Tracking

If you've enabled **Input Tracking** in the time.md app (Settings → Input Tracking), the `.input` destination emits six new sections that this plugin renders as the **Input Tracking** view:

| Section | What it shows |
|---------|---------------|
| Cursor Heatmap Bins | 2D heat overlay in absolute screen coordinates, per-screen tab strip, optional click overlay |
| Typing Intensity | Hourly keystrokes line chart |
| Top Typed Keys | Bar list of the 25 most-pressed keys |
| Top Typed Words | Bar list of the 50 most-typed words (only populated when "Full content" capture is on; default-redacted with a Reveal toggle) |
| Raw Mouse Events | Per-app click counts + click dots overlaid on the cursor heatmap |
| Raw Keystrokes | Optional first-200 timeline (chars default-redacted; secure-input rows show 🔒) |

### Example export workflow

1. In time.md → **Export** view, pick **Destination = Input** (or **Combined** with the input toggles enabled).
2. Pick a format the plugin can read — JSON is recommended for the raw sections:

   ```
   Format:      JSON
   Destination: Input
   Date range:  Today
   Sections:    Top Typed Words, Top Typed Keys,
                Cursor Heatmap Bins, Typing Intensity,
                Raw Keystrokes (optional),
                Raw Mouse Events (optional)
   ```

3. Save the file into the folder you've configured under **Settings → timemd-visualizor → Export folder**.
4. Run **timemd-visualizor: Open Input Tracking** from the command palette (or click the keyboard ribbon icon).

A minimal JSON export the view can render looks like:

```json
{
  "title": "Input Tracking — 2026-05-04",
  "destination": "input",
  "sections": [
    {
      "name": "input_cursor_heatmap",
      "display_name": "Cursor Heatmap Bins",
      "headers": ["screen_id", "bin_x", "bin_y", "samples"],
      "data": [
        { "screen_id": 1, "bin_x": 30, "bin_y": 22, "samples": 1820 },
        { "screen_id": 1, "bin_x": 31, "bin_y": 22, "samples": 1280 },
        { "screen_id": 2, "bin_x": 60, "bin_y": 20, "samples": 1140 }
      ]
    },
    {
      "name": "input_typing_intensity",
      "display_name": "Typing Intensity",
      "headers": ["timestamp", "keystrokes"],
      "data": [
        { "timestamp": "2026-05-04T10:00:00Z", "keystrokes": 388 },
        { "timestamp": "2026-05-04T11:00:00Z", "keystrokes": 612 },
        { "timestamp": "2026-05-04T15:00:00Z", "keystrokes": 720 }
      ]
    },
    {
      "name": "input_top_keys",
      "display_name": "Top Typed Keys",
      "headers": ["key_code", "key_label", "count"],
      "data": [
        { "key_code": 49, "key_label": "Space",  "count": 1820 },
        { "key_code": 36, "key_label": "Return", "count": 412 },
        { "key_code": 51, "key_label": "Delete", "count": 388 }
      ]
    }
  ]
}
```

A larger fixture covering all six sections lives at [`tests/fixtures/input-tracking-sample.json`](tests/fixtures/input-tracking-sample.json) — drop it into your export folder to preview the view without needing real data.

### Privacy

- The **Top Typed Words** and **Raw Keystrokes** panels default to redacted (each character replaced with `•`); click **Reveal words** / **Reveal chars** to unmask.
- Rows captured while macOS Secure Input was active (e.g. password fields, `sudo` prompts) are surfaced as 🔒 with empty `char` values, by design from the time.md exporter.
- If no input sections are present in any loaded export, the Input Tracking view shows an empty-state callout — the existing views are unaffected.

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
| `input-stats` | Stats strip — keystrokes, peak typing minute, cursor samples, clicks, apps observed |
| `cursor-heatmap` | Aspect-preserving cursor heatmap in absolute screen coordinates with click overlay |
| `typing-intensity` | Hourly keystroke line chart |
| `top-keys` | Bar list of the most-pressed keys |
| `top-words` | Bar list of the most-typed words (default-redacted; Reveal toggle) |
| `input-activity` | Per-app click count bar list |

### Parameters

| key | applies to | default | description |
|-----|------------|---------|-------------|
| `view` | all | `overview` | widget type (see table above) |
| `limit` | `overview`, `top-apps`, `categories`, `details`, `top-keys`, `top-words` | varies | number of items shown |
| `days` | `overview`, `trend-chart` | all | restrict to last N days of trend data |
| `height` | `cursor-heatmap`, `typing-intensity` | view default | SVG canvas height in pixels |
| `metric` | `stat` | `total_time` | `total_time`, `top_app`, `apps_count`, `days`, `peak_day` |
| `sections` | `overview` | all | comma-separated list of `stats`, `trend`, `heatmap`, `apps` |
| `date` | `overview` | — | `today`, `yesterday`, or `YYYY-MM-DD` — filters every panel to that single day (requires Raw Sessions in the export) |
| `tab` | `web-history` | `timeline` | `timeline`, `domains`, or `activity` |
| `browser` | `web-history` | — | filter to a single browser (`Safari`, `Chrome`, `Arc`, …) |
| `stats` | `distribution` | `true` | `false` to hide the STATS card |
| `legend` | `distribution` | `true` | `false` to hide the legend list (donut-only) |
| `label` | `distribution` | `true` | `false` to hide the "DISTRIBUTION" label |
| `bare` | all | `false` | `true` removes the embed's background, border, and padding so the widget sits flush on the note |
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

Input tracking dashboard for a daily note:

````markdown
```timemd
view: input-stats
title: Input today
```

```timemd
view: cursor-heatmap
height: 360
```

```timemd
view: top-words
limit: 20
```
````

A complete sample note that wires every input component together lives at
[`examples/input-tracking.md`](examples/input-tracking.md).

## Setup

1. Install the plugin (see "Manually installing" below while it's pre-release).
2. Export data from the time.md app using any supported format.
3. Place the exported file(s) inside a folder in your Obsidian vault.
4. Point the plugin at that folder in Settings → timemd-visualizor → Export folder.
5. Run **timemd-visualizor: Open Overview** from the command palette.

## Manually installing (pre-release)

1. Build locally: `npm install && npm run build`
2. Copy `main.js`, `styles.css`, `manifest.json` into `<vault>/.obsidian/plugins/timemd-visualizor/`
3. Enable the plugin in Obsidian settings.

## Development

```sh
npm install
npm run dev   # esbuild in watch mode
npm run build # type-check + production build
```

## License

0BSD (same as the sample plugin template).
