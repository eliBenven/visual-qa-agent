import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import type { ComparisonReport, FlowComparisonResult, StepComparisonResult } from "./compare";
import type { ResolvedConfig, GitHubConfig } from "./config";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a GitHub issue summarising the visual-regression results. Failed
 * steps include their diff images as inline base64 data-URIs (GitHub
 * renders them). Returns the URL of the created issue or `null` if creation
 * was skipped (e.g. no failures).
 */
export async function createIssue(
  config: ResolvedConfig,
  report: ComparisonReport,
): Promise<string | null> {
  const gh = resolveGitHubConfig(config);
  if (!gh) {
    console.log("  Skipping GitHub issue creation — no github config or GITHUB_TOKEN.");
    return null;
  }

  if (report.passed) {
    console.log("  All flows passed — no GitHub issue created.");
    return null;
  }

  const title = buildTitle(report);
  const body = buildIssueBody(report, config);

  const labels = gh.labels ?? ["visual-regression"];
  const issueUrl = await postIssue(gh.repo, gh.token!, title, body, labels);
  console.log(`  GitHub issue created: ${issueUrl}`);
  return issueUrl;
}

/**
 * Create a GitHub pull request that updates baselines with the current
 * screenshots. This is an explicit opt-in action.
 *
 * NOTE: Actually pushing files and creating a real PR requires git
 * operations which are out of scope for a pure Node library. This
 * function prints the commands a user would run, and returns null.
 * A future version could automate this with simple-git / octokit.
 */
export function suggestBaselineUpdatePR(config: ResolvedConfig): void {
  console.log();
  console.log("  To update baselines and open a PR, run:");
  console.log();
  console.log(`    cp -r "${config.currentDir}"/* "${config.baselineDir}"/`);
  console.log(`    git checkout -b update-visual-baselines`);
  console.log(`    git add "${config.baselineDir}"`);
  console.log(`    git commit -m "chore: update visual regression baselines"`);
  console.log(`    git push -u origin update-visual-baselines`);
  console.log(`    gh pr create --title "Update visual regression baselines" \\`);
  console.log(`      --body "Automated baseline update from visual-qa-agent."`);
  console.log();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveGitHubConfig(config: ResolvedConfig): GitHubConfig | null {
  const gh = config.github;
  if (!gh) return null;

  const token = process.env["GITHUB_TOKEN"] ?? gh.token;
  if (!token) return null;

  return { ...gh, token };
}

function buildTitle(report: ComparisonReport): string {
  const failedFlows = report.flows.filter((f) => !f.passed);
  if (failedFlows.length === 1) {
    return `Visual regression detected in "${failedFlows[0]!.flowName}"`;
  }
  return `Visual regression detected in ${failedFlows.length} flows`;
}

function buildIssueBody(report: ComparisonReport, config: ResolvedConfig): string {
  const lines: string[] = [];
  lines.push("## Visual Regression Report");
  lines.push("");
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Overall result:** ${report.passed ? "PASSED" : "FAILED"}`);
  lines.push("");

  for (const flow of report.flows) {
    lines.push(`### Flow: ${flow.flowName} — ${flow.passed ? "PASSED" : "FAILED"}`);
    lines.push("");
    lines.push(`Threshold: ${flow.threshold}`);
    lines.push("");

    for (const step of flow.steps) {
      lines.push(stepSection(step));
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("### Reproduction steps");
  lines.push("");
  lines.push("```bash");
  lines.push(`visual-qa-agent run <config-path>`);
  lines.push("```");
  lines.push("");
  lines.push("### Environment");
  lines.push("");
  lines.push(`- **Node:** ${process.version}`);
  lines.push(`- **Platform:** ${process.platform} ${process.arch}`);
  lines.push(`- **Baseline dir:** ${config.baselineDir}`);
  lines.push("");

  return lines.join("\n");
}

function stepSection(step: StepComparisonResult): string {
  const status = step.passed ? "PASS" : "FAIL";
  const pct = step.mismatchPercentage.toFixed(2);
  const lines: string[] = [];
  lines.push(`#### Step: ${step.stepName} [${status}]`);
  lines.push("");
  lines.push(`- Mismatched pixels: ${step.mismatchedPixels} (${pct}%)`);

  if (!step.passed && fs.existsSync(step.diffPath)) {
    const diffData = fs.readFileSync(step.diffPath);
    const b64 = diffData.toString("base64");
    lines.push("");
    lines.push(`<details><summary>Diff image</summary>`);
    lines.push("");
    lines.push(`![diff](data:image/png;base64,${b64})`);
    lines.push("");
    lines.push(`</details>`);
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// GitHub REST API (minimal implementation — no octokit dependency)
// ---------------------------------------------------------------------------

interface GitHubIssueResponse {
  html_url: string;
}

function postIssue(
  repo: string,
  token: string,
  title: string,
  body: string,
  labels: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ title, body, labels });

    const options: https.RequestOptions = {
      hostname: "api.github.com",
      path: `/repos/${repo}/issues`,
      method: "POST",
      headers: {
        "User-Agent": "visual-qa-agent/1.0.0",
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res: http.IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const json = JSON.parse(data) as GitHubIssueResponse;
          resolve(json.html_url);
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
