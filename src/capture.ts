import * as fs from "fs";
import * as path from "path";
import { chromium, type Browser, type Page } from "playwright";
import type { ResolvedConfig, Flow, FlowStep } from "./config";

export interface CaptureResult {
  flowName: string;
  stepName: string;
  screenshotPath: string;
}

/**
 * Capture baseline or current screenshots for every flow defined in the
 * config. Screenshots are written to `outputDir/<flowName>/<stepName>.png`.
 *
 * @param config  Resolved configuration object.
 * @param mode    "baseline" writes to config.baselineDir;
 *                "current" writes to config.currentDir.
 * @returns       Array of capture results with paths to every screenshot.
 */
export async function captureAll(
  config: ResolvedConfig,
  mode: "baseline" | "current",
): Promise<CaptureResult[]> {
  const outputDir = mode === "baseline" ? config.baselineDir : config.currentDir;
  const results: CaptureResult[] = [];

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });

    for (const flow of config.flows) {
      const flowResults = await captureFlow(browser, flow, outputDir);
      results.push(...flowResults);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
}

async function captureFlow(
  browser: Browser,
  flow: Flow,
  outputDir: string,
): Promise<CaptureResult[]> {
  const viewport = flow.viewport ?? { width: 1280, height: 720 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const results: CaptureResult[] = [];

  try {
    // Navigate to the flow's starting URL.
    await page.goto(flow.url, { waitUntil: "networkidle" });

    for (const step of flow.steps) {
      const screenshotPath = await executeStep(page, flow.name, step, outputDir);
      results.push({
        flowName: flow.name,
        stepName: step.name,
        screenshotPath,
      });
    }
  } finally {
    await context.close();
  }

  return results;
}

async function executeStep(
  page: Page,
  flowName: string,
  step: FlowStep,
  outputDir: string,
): Promise<string> {
  // Optional navigation within a step.
  if (step.url) {
    await page.goto(step.url, { waitUntil: "networkidle" });
  }

  // Optional click action.
  if (step.click) {
    await page.click(step.click);
  }

  // Optional type action.
  if (step.type && step.typeText !== undefined) {
    await page.fill(step.type, step.typeText);
  }

  // Optional explicit wait for a selector.
  if (step.waitForSelector) {
    await page.waitForSelector(step.waitForSelector, { timeout: 10_000 });
  }

  // Optional timed wait.
  if (step.waitMs && step.waitMs > 0) {
    await page.waitForTimeout(step.waitMs);
  }

  // Determine screenshot target.
  const dirPath = path.join(outputDir, sanitize(flowName));
  fs.mkdirSync(dirPath, { recursive: true });

  const filePath = path.join(dirPath, `${sanitize(step.name)}.png`);

  if (step.screenshotSelector) {
    const element = await page.$(step.screenshotSelector);
    if (!element) {
      throw new Error(
        `Flow "${flowName}", step "${step.name}": selector "${step.screenshotSelector}" not found.`,
      );
    }
    await element.screenshot({ path: filePath });
  } else {
    await page.screenshot({ path: filePath, fullPage: true });
  }

  return filePath;
}

/**
 * Sanitize a string for use as a directory / file name.
 */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
