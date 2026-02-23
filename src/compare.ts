import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type { ResolvedConfig, Flow, IgnoreRegion } from "./config";

export interface StepComparisonResult {
  stepName: string;
  baselinePath: string;
  currentPath: string;
  diffPath: string;
  totalPixels: number;
  mismatchedPixels: number;
  mismatchPercentage: number;
  passed: boolean;
}

export interface FlowComparisonResult {
  flowName: string;
  threshold: number;
  steps: StepComparisonResult[];
  passed: boolean;
}

export interface ComparisonReport {
  timestamp: string;
  flows: FlowComparisonResult[];
  passed: boolean;
}

/**
 * Compare current screenshots against baselines for every flow.
 */
export function compareAll(config: ResolvedConfig): ComparisonReport {
  const flowResults: FlowComparisonResult[] = [];

  for (const flow of config.flows) {
    flowResults.push(compareFlow(config, flow));
  }

  return {
    timestamp: new Date().toISOString(),
    flows: flowResults,
    passed: flowResults.every((f) => f.passed),
  };
}

function compareFlow(config: ResolvedConfig, flow: Flow): FlowComparisonResult {
  const threshold = flow.threshold ?? config.threshold;
  const stepResults: StepComparisonResult[] = [];

  for (const step of flow.steps) {
    const flowDir = sanitize(flow.name);
    const stepFile = `${sanitize(step.name)}.png`;

    const baselinePath = path.join(config.baselineDir, flowDir, stepFile);
    const currentPath = path.join(config.currentDir, flowDir, stepFile);
    const diffPath = path.join(config.diffDir, flowDir, stepFile);

    stepResults.push(
      compareStep(baselinePath, currentPath, diffPath, threshold, flow.ignoreRegions),
    );
  }

  return {
    flowName: flow.name,
    threshold,
    steps: stepResults,
    passed: stepResults.every((s) => s.passed),
  };
}

function compareStep(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number,
  ignoreRegions?: IgnoreRegion[],
): StepComparisonResult {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline not found: ${baselinePath}. Run "capture" first.`);
  }
  if (!fs.existsSync(currentPath)) {
    throw new Error(`Current screenshot not found: ${currentPath}. Run "capture" first.`);
  }

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentPng = PNG.sync.read(fs.readFileSync(currentPath));

  // If dimensions differ, resize the comparison canvas to the larger of the two.
  const width = Math.max(baselinePng.width, currentPng.width);
  const height = Math.max(baselinePng.height, currentPng.height);

  const baselineData = ensureSize(baselinePng, width, height);
  const currentData = ensureSize(currentPng, width, height);

  // Apply ignore regions by painting them identical in both images.
  if (ignoreRegions && ignoreRegions.length > 0) {
    for (const region of ignoreRegions) {
      maskRegion(baselineData, width, region);
      maskRegion(currentData, width, region);
    }
  }

  const diffPng = new PNG({ width, height });
  const totalPixels = width * height;

  const mismatchedPixels = pixelmatch(baselineData, currentData, diffPng.data, width, height, {
    threshold,
    diffColor: [255, 0, 0], // red highlight
    diffColorAlt: [255, 100, 100],
  });

  const mismatchPercentage = totalPixels > 0 ? (mismatchedPixels / totalPixels) * 100 : 0;

  // Write diff image.
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  const stepName = path.basename(diffPath, ".png");

  return {
    stepName,
    baselinePath,
    currentPath,
    diffPath,
    totalPixels,
    mismatchedPixels,
    mismatchPercentage,
    passed: mismatchedPixels === 0,
  };
}

/**
 * Ensure the image data buffer matches the target width/height.  If the
 * source is smaller, the extra area is filled with transparent black so
 * that it shows up as a diff.
 */
function ensureSize(png: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data as unknown as Buffer;
  }

  const buf = Buffer.alloc(targetWidth * targetHeight * 4, 0);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const srcIdx = (y * png.width + x) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      buf[dstIdx] = png.data[srcIdx]!;
      buf[dstIdx + 1] = png.data[srcIdx + 1]!;
      buf[dstIdx + 2] = png.data[srcIdx + 2]!;
      buf[dstIdx + 3] = png.data[srcIdx + 3]!;
    }
  }
  return buf;
}

/**
 * Paint a region in the raw RGBA buffer with a fixed colour so pixelmatch
 * ignores it. Both baseline and current get the same treatment.
 */
function maskRegion(data: Buffer, imgWidth: number, region: IgnoreRegion): void {
  const xEnd = Math.min(region.x + region.w, imgWidth);
  for (let y = region.y; y < region.y + region.h; y++) {
    for (let x = region.x; x < xEnd; x++) {
      const idx = (y * imgWidth + x) * 4;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 255;
    }
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}
