/* ── Adaptation Progress Manager ── */

import { ThemedSpinner } from "../../tui/spinner.js";
import { c, brightGreen, red, bold } from "../../tui/ansi.js";

export class AdaptationProgressManager {
  private spinner: ThemedSpinner | null = null;
  private currentLabel = "";
  private isTTY: boolean;

  constructor() {
    this.isTTY = process.stdout.isTTY ?? false;
  }

  startPhase(theme: string, label: string): void {
    this.currentLabel = label;
    if (this.isTTY) {
      this.spinner?.stop();
      this.spinner = new ThemedSpinner(theme);
      this.spinner.start(label);
    } else {
      console.log(`[monarch] ${label}`);
    }
  }

  updateProgress(label: string): void {
    this.currentLabel = label;
    if (this.isTTY && this.spinner) {
      this.spinner.update(label);
    } else {
      console.log(`[monarch] ${label}`);
    }
  }

  completePhase(message?: string): void {
    if (this.isTTY && this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    } else if (message) {
      console.log(`[monarch] ${c("✓", brightGreen, bold)} ${message}`);
    }
  }

  failPhase(message?: string): void {
    if (this.isTTY && this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    } else if (message) {
      console.log(`[monarch] ${c("✗", red, bold)} ${message}`);
    }
  }

  log(message: string): void {
    if (this.isTTY && this.spinner) {
      const wasRunning = this.spinner !== null;
      const savedLabel = this.currentLabel;
      this.spinner.stop();
      console.log(`  ${message}`);
      if (wasRunning && savedLabel) {
        this.spinner.start(savedLabel);
      }
    } else {
      console.log(`[monarch] ${message}`);
    }
  }

  cleanup(): void {
    this.spinner?.stop();
    this.spinner = null;
  }
}
