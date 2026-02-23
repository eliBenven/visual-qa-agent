# Quickstart

Run the full visual-regression pipeline in one command against any website.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
# Clone and install
git clone <repo-url> && cd visual-qa-agent
npm install
npm run build

# Install Playwright browsers (first time only)
npx playwright install chromium
```

## One-command demo

```bash
# 1. Capture baselines from example.com
npx visual-qa-agent capture visual-qa.config.example.json

# 2. Run the full pipeline (capture current + compare + report)
npx visual-qa-agent run visual-qa.config.example.json
```

Since both captures target the same live site, you should see all steps
**PASS** with zero pixel differences.

## Simulating a regression

To see the tool detect a real difference:

1. Capture baselines:
   ```bash
   npx visual-qa-agent capture visual-qa.config.example.json
   ```
2. Edit a baseline PNG with any image editor (add a red dot, change some
   pixels) or point the config at a different URL for the "current" run.
3. Capture current and compare:
   ```bash
   npx visual-qa-agent run visual-qa.config.example.json
   ```
4. Check `.vqa/diffs/` for the red-highlighted diff images and
   `.vqa/reports/` for the JSON report.

## Filing a GitHub issue on regression

```bash
export GITHUB_TOKEN=ghp_your_token_here
npx visual-qa-agent run visual-qa.config.example.json --github-issue
```

If any flow fails, the tool creates a GitHub issue on the repo specified in
the config with screenshots, diff images, repro steps, and environment info.
