import * as fs from "fs";
import * as path from "path";

/**
 * A rectangular region to ignore during pixel comparison.
 */
export interface IgnoreRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A single step in a flow. Steps are executed sequentially by the capture
 * engine. Each step can optionally wait, click, type, or take a screenshot
 * of a specific element selector.
 */
export interface FlowStep {
  /** Human-readable label for this step (used in report output). */
  name: string;
  /** Optional: navigate to a URL before performing the action. */
  url?: string;
  /** Optional: CSS selector to click before screenshotting. */
  click?: string;
  /** Optional: CSS selector to type into. Requires `typeText`. */
  type?: string;
  /** Text to type when `type` selector is provided. */
  typeText?: string;
  /** Milliseconds to wait after the action and before the screenshot. */
  waitMs?: number;
  /** Optional: CSS selector to wait for before screenshotting. */
  waitForSelector?: string;
  /**
   * Optional: CSS selector of a single element to screenshot instead of the
   * full page. When omitted the full page is captured.
   */
  screenshotSelector?: string;
}

/**
 * Defines a single visual-regression flow — a named sequence of steps
 * executed against a target URL at a specific viewport size.
 */
export interface Flow {
  /** Unique name for this flow. Used as the directory name for baselines. */
  name: string;
  /** The starting URL for the flow. */
  url: string;
  /** Ordered list of steps to execute. */
  steps: FlowStep[];
  /** Viewport dimensions. Defaults to 1280x720. */
  viewport?: { width: number; height: number };
  /**
   * pixelmatch threshold (0-1). Lower = stricter.
   * Defaults to 0.1.
   */
  threshold?: number;
  /**
   * Regions to mask / ignore during comparison.
   * Coordinates are relative to the screenshot top-left corner.
   */
  ignoreRegions?: IgnoreRegion[];
}

/**
 * Top-level configuration file schema for visual-qa-agent.
 */
export interface Config {
  /** Directory where baseline screenshots are stored. Defaults to ".vqa/baselines". */
  baselineDir?: string;
  /** Directory where current-run screenshots are stored. Defaults to ".vqa/current". */
  currentDir?: string;
  /** Directory where diff images are written. Defaults to ".vqa/diffs". */
  diffDir?: string;
  /** Directory where JSON reports are written. Defaults to ".vqa/reports". */
  reportDir?: string;
  /** Global default threshold (can be overridden per flow). Defaults to 0.1. */
  threshold?: number;
  /** The list of flows to execute. */
  flows: Flow[];
  /** GitHub integration settings (optional). */
  github?: GitHubConfig;
}

export interface GitHubConfig {
  /** GitHub repository in "owner/repo" format. */
  repo: string;
  /**
   * Personal access token. Can also be provided via GITHUB_TOKEN env var.
   * The env var takes precedence if both are set.
   */
  token?: string;
  /** Labels to apply to created issues. Defaults to ["visual-regression"]. */
  labels?: string[];
}

/**
 * Resolved configuration with all defaults applied and paths made absolute.
 */
export interface ResolvedConfig extends Required<Omit<Config, "github">> {
  github?: GitHubConfig;
}

const DEFAULTS = {
  baselineDir: ".vqa/baselines",
  currentDir: ".vqa/current",
  diffDir: ".vqa/diffs",
  reportDir: ".vqa/reports",
  threshold: 0.1,
};

/**
 * Load and validate the configuration file, returning a fully-resolved config.
 */
export function loadConfig(configPath: string): ResolvedConfig {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse config file as JSON: ${absolutePath}`);
  }

  const config = parsed as Config;
  validate(config, absolutePath);

  const configDir = path.dirname(absolutePath);

  return {
    baselineDir: path.resolve(configDir, config.baselineDir ?? DEFAULTS.baselineDir),
    currentDir: path.resolve(configDir, config.currentDir ?? DEFAULTS.currentDir),
    diffDir: path.resolve(configDir, config.diffDir ?? DEFAULTS.diffDir),
    reportDir: path.resolve(configDir, config.reportDir ?? DEFAULTS.reportDir),
    threshold: config.threshold ?? DEFAULTS.threshold,
    flows: config.flows,
    github: config.github,
  };
}

function validate(config: Config, filePath: string): void {
  if (!config.flows || !Array.isArray(config.flows) || config.flows.length === 0) {
    throw new Error(`Config "${filePath}" must contain a non-empty "flows" array.`);
  }

  const names = new Set<string>();
  for (const flow of config.flows) {
    if (!flow.name || typeof flow.name !== "string") {
      throw new Error(`Each flow must have a "name" string.`);
    }
    if (names.has(flow.name)) {
      throw new Error(`Duplicate flow name: "${flow.name}".`);
    }
    names.add(flow.name);

    if (!flow.url || typeof flow.url !== "string") {
      throw new Error(`Flow "${flow.name}" must have a "url" string.`);
    }
    if (!flow.steps || !Array.isArray(flow.steps) || flow.steps.length === 0) {
      throw new Error(`Flow "${flow.name}" must have a non-empty "steps" array.`);
    }
    for (const step of flow.steps) {
      if (!step.name || typeof step.name !== "string") {
        throw new Error(`Each step in flow "${flow.name}" must have a "name" string.`);
      }
    }
  }
}
