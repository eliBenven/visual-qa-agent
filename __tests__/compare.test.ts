import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { PNG } from "pngjs";
import { compareAll } from "../src/compare";
import type { ResolvedConfig, Flow } from "../src/config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a solid-colour PNG buffer. */
function makePng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

/** Create a PNG that is mostly one colour but has a small patch of another. */
function makePngWithPatch(
  width: number,
  height: number,
  bgR: number,
  bgG: number,
  bgB: number,
  patchX: number,
  patchY: number,
  patchW: number,
  patchH: number,
  patchR: number,
  patchG: number,
  patchB: number,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inPatch =
        x >= patchX &&
        x < patchX + patchW &&
        y >= patchY &&
        y < patchY + patchH;
      png.data[idx] = inPatch ? patchR : bgR;
      png.data[idx + 1] = inPatch ? patchG : bgG;
      png.data[idx + 2] = inPatch ? patchB : bgB;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

let tmpDir: string;

function setup(): {
  baselineDir: string;
  currentDir: string;
  diffDir: string;
  reportDir: string;
} {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vqa-compare-test-"));
  const baselineDir = path.join(tmpDir, "baselines");
  const currentDir = path.join(tmpDir, "current");
  const diffDir = path.join(tmpDir, "diffs");
  const reportDir = path.join(tmpDir, "reports");
  return { baselineDir, currentDir, diffDir, reportDir };
}

function teardown(): void {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Write a PNG buffer to the expected path for a flow/step. */
function writePng(dir: string, flowName: string, stepName: string, buf: Buffer): void {
  const flowDir = path.join(dir, flowName);
  fs.mkdirSync(flowDir, { recursive: true });
  fs.writeFileSync(path.join(flowDir, `${stepName}.png`), buf);
}

function makeConfig(
  dirs: ReturnType<typeof setup>,
  flows: Flow[],
  threshold = 0.1,
): ResolvedConfig {
  return {
    baselineDir: dirs.baselineDir,
    currentDir: dirs.currentDir,
    diffDir: dirs.diffDir,
    reportDir: dirs.reportDir,
    threshold,
    flows,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("compare – compareAll", () => {
  afterEach(teardown);

  // -----------------------------------------------------------------------
  // Identical images => 0% mismatch
  // -----------------------------------------------------------------------
  it("reports 0% mismatch for identical images", () => {
    const dirs = setup();
    const red = makePng(10, 10, 255, 0, 0);

    const flow: Flow = {
      name: "identical",
      url: "https://example.com",
      steps: [{ name: "step1" }],
    };
    writePng(dirs.baselineDir, "identical", "step1", red);
    writePng(dirs.currentDir, "identical", "step1", red);

    const config = makeConfig(dirs, [flow]);
    const report = compareAll(config);

    expect(report.passed).toBe(true);
    expect(report.flows).toHaveLength(1);
    const step = report.flows[0]!.steps[0]!;
    expect(step.mismatchedPixels).toBe(0);
    expect(step.mismatchPercentage).toBe(0);
    expect(step.passed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Different images => >0% mismatch
  // -----------------------------------------------------------------------
  it("reports >0% mismatch for different images", () => {
    const dirs = setup();
    const red = makePng(10, 10, 255, 0, 0);
    const blue = makePng(10, 10, 0, 0, 255);

    const flow: Flow = {
      name: "different",
      url: "https://example.com",
      steps: [{ name: "step1" }],
    };
    writePng(dirs.baselineDir, "different", "step1", red);
    writePng(dirs.currentDir, "different", "step1", blue);

    const config = makeConfig(dirs, [flow]);
    const report = compareAll(config);

    expect(report.passed).toBe(false);
    const step = report.flows[0]!.steps[0]!;
    expect(step.mismatchedPixels).toBeGreaterThan(0);
    expect(step.mismatchPercentage).toBeGreaterThan(0);
    expect(step.passed).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Threshold: small colour change below threshold passes pixelmatch but
  // note that the source uses `passed: mismatchedPixels === 0`, so
  // pixelmatch's own threshold matters. We test that a very slight colour
  // difference with a high pixelmatch threshold produces 0 mismatched
  // pixels.
  // -----------------------------------------------------------------------
  it("very similar colours with high pixelmatch threshold produce 0 mismatch", () => {
    const dirs = setup();
    // Two almost identical reds (differ by 1 in R channel).
    const img1 = makePng(10, 10, 200, 100, 100);
    const img2 = makePng(10, 10, 201, 100, 100);

    const flow: Flow = {
      name: "threshold-test",
      url: "https://example.com",
      steps: [{ name: "step1" }],
      threshold: 0.3, // generous pixelmatch threshold
    };
    writePng(dirs.baselineDir, "threshold-test", "step1", img1);
    writePng(dirs.currentDir, "threshold-test", "step1", img2);

    const config = makeConfig(dirs, [flow], 0.3);
    const report = compareAll(config);

    const step = report.flows[0]!.steps[0]!;
    // With such a high pixelmatch threshold, a 1-unit difference is ignored.
    expect(step.mismatchedPixels).toBe(0);
    expect(step.passed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Ignore regions: changes inside ignored region are not counted
  // -----------------------------------------------------------------------
  it("ignores changes inside an ignore region", () => {
    const dirs = setup();
    // 10x10 solid green baseline.
    const green = makePng(10, 10, 0, 255, 0);
    // 10x10 green with a 4x4 red patch at (0,0).
    const patched = makePngWithPatch(10, 10, 0, 255, 0, 0, 0, 4, 4, 255, 0, 0);

    const flow: Flow = {
      name: "ignore-region",
      url: "https://example.com",
      steps: [{ name: "step1" }],
      ignoreRegions: [{ x: 0, y: 0, w: 4, h: 4 }],
    };
    writePng(dirs.baselineDir, "ignore-region", "step1", green);
    writePng(dirs.currentDir, "ignore-region", "step1", patched);

    const config = makeConfig(dirs, [flow]);
    const report = compareAll(config);

    const step = report.flows[0]!.steps[0]!;
    expect(step.mismatchedPixels).toBe(0);
    expect(step.passed).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Dimension mismatch handling
  // -----------------------------------------------------------------------
  it("handles images of different dimensions (reports mismatches for extra area)", () => {
    const dirs = setup();
    // Small red 5x5 baseline, larger blue 10x10 current.
    const small = makePng(5, 5, 255, 0, 0);
    const large = makePng(10, 10, 0, 0, 255);

    const flow: Flow = {
      name: "dimension-mismatch",
      url: "https://example.com",
      steps: [{ name: "step1" }],
    };
    writePng(dirs.baselineDir, "dimension-mismatch", "step1", small);
    writePng(dirs.currentDir, "dimension-mismatch", "step1", large);

    const config = makeConfig(dirs, [flow]);
    const report = compareAll(config);

    const step = report.flows[0]!.steps[0]!;
    // The total canvas is 10x10=100; they differ in both colour and size.
    expect(step.totalPixels).toBe(100);
    expect(step.mismatchedPixels).toBeGreaterThan(0);
    expect(step.passed).toBe(false);
  });
});
