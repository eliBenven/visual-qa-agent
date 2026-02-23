# visual-qa-agent

A Node.js CLI tool for visual regression testing. It uses Playwright to capture
screenshots of web pages, pixelmatch to compute pixel-level diffs against saved
baselines, and can automatically file GitHub issues when regressions are
detected.

## Features

- **Baseline capture** -- navigate flows, interact with elements, take
  full-page or element-scoped screenshots.
- **Pixel-accurate diffing** -- configurable threshold, ignore-regions, red
  highlighted diff images.
- **Structured reporting** -- JSON report files and a human-readable console
  summary with pass/fail per flow and step.
- **GitHub integration** -- optional: automatically create an issue with repro
  steps, environment info, and inline diff images when regressions are found.
- **Baseline update workflow** -- prints the exact commands to open a PR that
  updates baselines with the current screenshots.

## Quickstart

```bash
# Install dependencies
npm install

# Build
npm run build

# 1. Capture baselines
npx visual-qa-agent capture visual-qa.config.example.json

# 2. Capture current screenshots
npx visual-qa-agent capture visual-qa.config.example.json --current

# 3. Compare and report
npx visual-qa-agent compare visual-qa.config.example.json

# Or, run the full pipeline in one command
npx visual-qa-agent run visual-qa.config.example.json
```

See [QUICKSTART.md](./QUICKSTART.md) for a one-command demo.

## Installation

```bash
npm install
npm run build
```

The CLI is available as `visual-qa-agent` via the `bin` entry in package.json.

## CLI Commands

### `capture <config>`

Capture baseline screenshots for every flow defined in the config file.

| Flag | Description |
|------|-------------|
| `--current` | Save to the current-run directory instead of baselines |

### `compare <config>`

Compare current screenshots against baselines. Generates a JSON report and a
console summary. Exits with code 1 if any flow fails.

### `run <config>`

Full pipeline: capture current screenshots, compare against baselines, generate
a report, and optionally create a GitHub issue.

| Flag | Description |
|------|-------------|
| `--github-issue` | Create a GitHub issue if regressions are detected |
| `--update-baselines` | Print commands to open a PR updating baselines |

## Configuration Reference

Create a JSON file (see `visual-qa.config.example.json` for a full example).

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baselineDir` | string | `.vqa/baselines` | Where baseline PNGs are stored |
| `currentDir` | string | `.vqa/current` | Where current-run PNGs are stored |
| `diffDir` | string | `.vqa/diffs` | Where diff PNGs are written |
| `reportDir` | string | `.vqa/reports` | Where JSON reports are written |
| `threshold` | number | `0.1` | Global pixelmatch threshold (0 = exact, 1 = lenient) |
| `flows` | Flow[] | *required* | Array of flow definitions |
| `github` | object | *optional* | GitHub integration settings |

### Flow fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | *required* | Unique identifier for this flow |
| `url` | string | *required* | Starting URL |
| `steps` | Step[] | *required* | Ordered list of steps |
| `viewport` | `{width, height}` | `{1280, 720}` | Browser viewport |
| `threshold` | number | global value | Per-flow threshold override |
| `ignoreRegions` | `{x,y,w,h}[]` | `[]` | Regions to mask during diff |

### Step fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Step label (used as filename) |
| `url` | string | Optional URL to navigate to |
| `click` | string | CSS selector to click |
| `type` | string | CSS selector to type into |
| `typeText` | string | Text to type (requires `type`) |
| `waitMs` | number | Milliseconds to wait after action |
| `waitForSelector` | string | CSS selector to wait for |
| `screenshotSelector` | string | Element to screenshot (full page if omitted) |

### GitHub fields

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | `owner/repo` format |
| `token` | string | PAT (or set `GITHUB_TOKEN` env var) |
| `labels` | string[] | Issue labels (default: `["visual-regression"]`) |

## How It Works

1. **Capture** -- Playwright launches a headless Chromium browser, navigates
   each flow, executes steps (click, type, wait), and saves PNG screenshots.
2. **Compare** -- Each current screenshot is loaded alongside its baseline.
   Ignore regions are masked, then pixelmatch computes per-pixel differences.
   A red-highlighted diff image is generated for every step.
3. **Report** -- Results are written as a timestamped JSON file and printed to
   the console with pass/fail status per step.
4. **GitHub** -- If `--github-issue` is passed and regressions exist, the tool
   creates a GitHub issue with the report body, inline diff images (base64),
   repro steps, and environment info.

## License

MIT
