import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateReport } from "../src/reporter";
import type { ComparisonReport } from "../src/compare";
import type { ResolvedConfig } from "../src/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeConfig(): ResolvedConfig {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vqa-reporter-test-"));
  return {
    baselineDir: path.join(tmpDir, "baselines"),
    currentDir: path.join(tmpDir, "current"),
    diffDir: path.join(tmpDir, "diffs"),
    reportDir: path.join(tmpDir, "reports"),
    threshold: 0.1,
    flows: [],
  };
}

function teardown(): void {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reporter – generateReport", () => {
  afterEach(teardown);

  it("writes a JSON report with the correct structure", () => {
    const config = makeConfig();

    const report: ComparisonReport = {
      timestamp: "2025-01-01T00:00:00.000Z",
      passed: true,
      flows: [
        {
          flowName: "homepage",
          threshold: 0.1,
          passed: true,
          steps: [
            {
              stepName: "landing",
              baselinePath: "/tmp/baselines/homepage/landing.png",
              currentPath: "/tmp/current/homepage/landing.png",
              diffPath: "/tmp/diffs/homepage/landing.png",
              totalPixels: 100,
              mismatchedPixels: 0,
              mismatchPercentage: 0,
              passed: true,
            },
          ],
        },
      ],
    };

    const reportPath = generateReport(config, report);

    // File should exist.
    expect(fs.existsSync(reportPath)).toBe(true);

    // Parse the JSON and verify structure.
    const written = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(written).toHaveProperty("timestamp", "2025-01-01T00:00:00.000Z");
    expect(written).toHaveProperty("passed", true);
    expect(written).toHaveProperty("flows");
    expect(written.flows).toHaveLength(1);
    expect(written.flows[0]).toHaveProperty("flowName", "homepage");
    expect(written.flows[0].steps).toHaveLength(1);
    expect(written.flows[0].steps[0]).toHaveProperty("stepName", "landing");
    expect(written.flows[0].steps[0]).toHaveProperty("mismatchedPixels", 0);
    expect(written.flows[0].steps[0]).toHaveProperty("mismatchPercentage", 0);
  });

  it("marks the report as passed when all steps have 0 mismatch", () => {
    const config = makeConfig();

    const report: ComparisonReport = {
      timestamp: new Date().toISOString(),
      passed: true,
      flows: [
        {
          flowName: "checkout",
          threshold: 0.1,
          passed: true,
          steps: [
            {
              stepName: "cart",
              baselinePath: "/b/cart.png",
              currentPath: "/c/cart.png",
              diffPath: "/d/cart.png",
              totalPixels: 200,
              mismatchedPixels: 0,
              mismatchPercentage: 0,
              passed: true,
            },
          ],
        },
      ],
    };

    const reportPath = generateReport(config, report);
    const written = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(written.passed).toBe(true);
    expect(written.flows[0].passed).toBe(true);
  });

  it("marks the report as failed when any step has mismatches", () => {
    const config = makeConfig();

    const report: ComparisonReport = {
      timestamp: new Date().toISOString(),
      passed: false,
      flows: [
        {
          flowName: "dashboard",
          threshold: 0.1,
          passed: false,
          steps: [
            {
              stepName: "overview",
              baselinePath: "/b/overview.png",
              currentPath: "/c/overview.png",
              diffPath: "/d/overview.png",
              totalPixels: 1000,
              mismatchedPixels: 50,
              mismatchPercentage: 5.0,
              passed: false,
            },
          ],
        },
      ],
    };

    const reportPath = generateReport(config, report);
    const written = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(written.passed).toBe(false);
    expect(written.flows[0].passed).toBe(false);
    expect(written.flows[0].steps[0].mismatchedPixels).toBe(50);
  });

  it("report file is written inside the configured reportDir", () => {
    const config = makeConfig();

    const report: ComparisonReport = {
      timestamp: new Date().toISOString(),
      passed: true,
      flows: [],
    };

    const reportPath = generateReport(config, report);
    expect(reportPath.startsWith(config.reportDir)).toBe(true);
  });
});
