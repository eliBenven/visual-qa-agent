#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config";
import { captureAll } from "./capture";
import { compareAll } from "./compare";
import { generateReport } from "./reporter";
import { createIssue, suggestBaselineUpdatePR } from "./github-output";

const program = new Command();

program
  .name("visual-qa-agent")
  .description("Visual regression testing CLI powered by Playwright")
  .version("1.0.0");

// -----------------------------------------------------------------------
// capture — take baseline screenshots
// -----------------------------------------------------------------------
program
  .command("capture")
  .description("Capture baseline screenshots for all flows defined in the config")
  .argument("<config>", "Path to the visual-qa config JSON file")
  .option("--current", "Save to the current-run directory instead of baselines")
  .action(async (configPath: string, opts: { current?: boolean }) => {
    try {
      const config = loadConfig(configPath);
      const mode = opts.current ? "current" : "baseline";
      console.log(`Capturing ${mode} screenshots...`);
      const results = await captureAll(config, mode);
      console.log(`Done. ${results.length} screenshot(s) saved.`);
      for (const r of results) {
        console.log(`  ${r.flowName} / ${r.stepName} -> ${r.screenshotPath}`);
      }
    } catch (err) {
      exitWithError(err);
    }
  });

// -----------------------------------------------------------------------
// compare — diff current vs baseline
// -----------------------------------------------------------------------
program
  .command("compare")
  .description("Compare current screenshots against baselines and generate a report")
  .argument("<config>", "Path to the visual-qa config JSON file")
  .action(async (configPath: string) => {
    try {
      const config = loadConfig(configPath);
      console.log("Comparing screenshots...");
      const report = compareAll(config);
      const reportPath = generateReport(config, report);
      console.log(`Report written to ${reportPath}`);

      if (!report.passed) {
        process.exitCode = 1;
      }
    } catch (err) {
      exitWithError(err);
    }
  });

// -----------------------------------------------------------------------
// run — capture current + compare + report + optional GitHub issue
// -----------------------------------------------------------------------
program
  .command("run")
  .description("Full pipeline: capture current screenshots, compare, report, and optionally file a GitHub issue")
  .argument("<config>", "Path to the visual-qa config JSON file")
  .option("--update-baselines", "After comparison, suggest a PR to update baselines")
  .option("--github-issue", "Create a GitHub issue if regressions are found")
  .action(async (configPath: string, opts: { updateBaselines?: boolean; githubIssue?: boolean }) => {
    try {
      const config = loadConfig(configPath);

      // Step 1 — capture current screenshots.
      console.log("Step 1/3: Capturing current screenshots...");
      const captures = await captureAll(config, "current");
      console.log(`  ${captures.length} screenshot(s) captured.`);

      // Step 2 — compare against baselines.
      console.log("Step 2/3: Comparing against baselines...");
      const report = compareAll(config);
      const reportPath = generateReport(config, report);
      console.log(`  Report: ${reportPath}`);

      // Step 3 — optional outputs.
      console.log("Step 3/3: Post-processing...");

      if (opts.githubIssue) {
        await createIssue(config, report);
      }

      if (opts.updateBaselines && !report.passed) {
        suggestBaselineUpdatePR(config);
      }

      if (!report.passed) {
        process.exitCode = 1;
      }
    } catch (err) {
      exitWithError(err);
    }
  });

program.parse();

// ---------------------------------------------------------------------------

function exitWithError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(2);
}
