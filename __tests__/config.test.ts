import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig } from "../src/config";

/**
 * Helper: write a JSON config to a temp file and return its path.
 */
function writeTempConfig(obj: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vqa-config-test-"));
  const filePath = path.join(dir, "visual-qa.config.json");
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
  return filePath;
}

const MINIMAL_FLOW = {
  name: "homepage",
  url: "https://example.com",
  steps: [{ name: "landing" }],
};

describe("config – loadConfig", () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const f of tempFiles) {
      try {
        fs.rmSync(path.dirname(f), { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempFiles.length = 0;
  });

  // -----------------------------------------------------------------------
  // Happy path: load from JSON
  // -----------------------------------------------------------------------
  it("loads a valid config from a JSON file", () => {
    const configPath = writeTempConfig({ flows: [MINIMAL_FLOW] });
    tempFiles.push(configPath);

    const resolved = loadConfig(configPath);
    expect(resolved.flows).toHaveLength(1);
    expect(resolved.flows[0]!.name).toBe("homepage");
  });

  // -----------------------------------------------------------------------
  // Validation: reject missing required fields
  // -----------------------------------------------------------------------
  it("throws when flows array is missing", () => {
    const configPath = writeTempConfig({});
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/non-empty "flows" array/);
  });

  it("throws when flows array is empty", () => {
    const configPath = writeTempConfig({ flows: [] });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/non-empty "flows" array/);
  });

  it("throws when a flow is missing a name", () => {
    const configPath = writeTempConfig({
      flows: [{ url: "https://example.com", steps: [{ name: "s1" }] }],
    });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/must have a "name" string/);
  });

  it("throws when a flow is missing a url", () => {
    const configPath = writeTempConfig({
      flows: [{ name: "f1", steps: [{ name: "s1" }] }],
    });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/must have a "url" string/);
  });

  it("throws when a flow has no steps", () => {
    const configPath = writeTempConfig({
      flows: [{ name: "f1", url: "https://example.com", steps: [] }],
    });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/non-empty "steps" array/);
  });

  it("throws when a step is missing a name", () => {
    const configPath = writeTempConfig({
      flows: [{ name: "f1", url: "https://example.com", steps: [{}] }],
    });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/must have a "name" string/);
  });

  // -----------------------------------------------------------------------
  // Validation: reject duplicate flow names
  // -----------------------------------------------------------------------
  it("throws on duplicate flow names", () => {
    const configPath = writeTempConfig({
      flows: [
        { name: "dup", url: "https://a.com", steps: [{ name: "s1" }] },
        { name: "dup", url: "https://b.com", steps: [{ name: "s2" }] },
      ],
    });
    tempFiles.push(configPath);
    expect(() => loadConfig(configPath)).toThrow(/Duplicate flow name/);
  });

  // -----------------------------------------------------------------------
  // Default resolution (threshold, viewport, directories)
  // -----------------------------------------------------------------------
  it("applies default threshold when not specified", () => {
    const configPath = writeTempConfig({ flows: [MINIMAL_FLOW] });
    tempFiles.push(configPath);

    const resolved = loadConfig(configPath);
    expect(resolved.threshold).toBe(0.1);
  });

  it("respects a custom threshold", () => {
    const configPath = writeTempConfig({
      threshold: 0.05,
      flows: [MINIMAL_FLOW],
    });
    tempFiles.push(configPath);

    const resolved = loadConfig(configPath);
    expect(resolved.threshold).toBe(0.05);
  });

  it("applies default directory names when not specified", () => {
    const configPath = writeTempConfig({ flows: [MINIMAL_FLOW] });
    tempFiles.push(configPath);

    const resolved = loadConfig(configPath);
    const configDir = path.dirname(path.resolve(configPath));

    expect(resolved.baselineDir).toBe(path.join(configDir, ".vqa/baselines"));
    expect(resolved.currentDir).toBe(path.join(configDir, ".vqa/current"));
    expect(resolved.diffDir).toBe(path.join(configDir, ".vqa/diffs"));
    expect(resolved.reportDir).toBe(path.join(configDir, ".vqa/reports"));
  });

  // -----------------------------------------------------------------------
  // Relative path resolution
  // -----------------------------------------------------------------------
  it("resolves relative paths relative to the config file directory", () => {
    const configPath = writeTempConfig({
      baselineDir: "custom/baselines",
      currentDir: "custom/current",
      diffDir: "custom/diffs",
      reportDir: "custom/reports",
      flows: [MINIMAL_FLOW],
    });
    tempFiles.push(configPath);

    const configDir = path.dirname(path.resolve(configPath));
    const resolved = loadConfig(configPath);

    expect(resolved.baselineDir).toBe(path.join(configDir, "custom/baselines"));
    expect(resolved.currentDir).toBe(path.join(configDir, "custom/current"));
    expect(resolved.diffDir).toBe(path.join(configDir, "custom/diffs"));
    expect(resolved.reportDir).toBe(path.join(configDir, "custom/reports"));
  });

  // -----------------------------------------------------------------------
  // Error: file not found
  // -----------------------------------------------------------------------
  it("throws when the config file does not exist", () => {
    expect(() => loadConfig("/tmp/does-not-exist-vqa.json")).toThrow(
      /Config file not found/,
    );
  });
});
