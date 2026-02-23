import * as fs from "fs";
import * as path from "path";
import type { ComparisonReport, FlowComparisonResult, StepComparisonResult } from "./compare";
import type { ResolvedConfig } from "./config";

/**
 * Write the comparison report as JSON and print a human-readable console
 * summary.
 */
export function generateReport(config: ResolvedConfig, report: ComparisonReport): string {
  // Write JSON report.
  fs.mkdirSync(config.reportDir, { recursive: true });
  const reportPath = path.join(config.reportDir, `report-${dateStamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  // Console summary.
  printSummary(report);

  return reportPath;
}

function printSummary(report: ComparisonReport): void {
  const divider = "=".repeat(60);

  console.log();
  console.log(divider);
  console.log("  VISUAL QA REPORT");
  console.log(`  ${report.timestamp}`);
  console.log(divider);

  for (const flow of report.flows) {
    printFlowSummary(flow);
  }

  console.log(divider);
  const overallStatus = report.passed ? "PASSED" : "FAILED";
  console.log(`  Overall: ${overallStatus}`);
  console.log(divider);
  console.log();
}

function printFlowSummary(flow: FlowComparisonResult): void {
  const flowStatus = flow.passed ? "PASS" : "FAIL";
  console.log();
  console.log(`  Flow: ${flow.flowName}  [${flowStatus}]  (threshold: ${flow.threshold})`);
  console.log(`  ${"─".repeat(54)}`);

  for (const step of flow.steps) {
    printStepSummary(step);
  }
}

function printStepSummary(step: StepComparisonResult): void {
  const icon = step.passed ? "[PASS]" : "[FAIL]";
  const pct = step.mismatchPercentage.toFixed(2);
  console.log(
    `    ${icon} ${step.stepName}  —  ${step.mismatchedPixels} px differ (${pct}%)`,
  );
  if (!step.passed) {
    console.log(`           diff: ${step.diffPath}`);
  }
}

function dateStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
