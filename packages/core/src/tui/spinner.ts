/* ── Themed spinner for adaptation progress ── */

import {
  c, bold, dim,
  cyan, green, yellow, blue, magenta, red, gray, white,
  brightCyan, brightGreen, brightYellow, brightMagenta,
  bgCyan, bgBlue, bgMagenta, bgGreen, bgYellow, bgGray,
  clearLine, hideCursor, showCursor, reset,
} from "./ansi.js";

export interface OperationTheme {
  readonly icon: string;
  readonly color: string;
  readonly brightColor: string;
  readonly bg: string;
  readonly label: string;
  readonly frames: ReadonlyArray<string>;
}

const WAVE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PULSE_FRAMES = ["◜", "◠", "◝", "◞", "◡", "◟"];
const DOTS_FRAMES = ["·  ", "·· ", "···", " ··", "  ·", "   "];
const SCAN_FRAMES = ["▱▱▱▱▱", "▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰", "▱▰▰▰▰", "▱▱▰▰▰", "▱▱▱▰▰", "▱▱▱▱▰"];
const WRITE_FRAMES = ["✎", "✎·", "✎··", "✎···", "✎····", "✎···", "✎··", "✎·"];

export const THEMES: Record<string, OperationTheme> = {
  thinking: {
    icon: "◇",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "思考中",
    frames: DOTS_FRAMES,
  },
  writing: {
    icon: "✎",
    color: magenta,
    brightColor: brightMagenta,
    bg: bgMagenta,
    label: "写作中",
    frames: WRITE_FRAMES,
  },
  auditing: {
    icon: "◉",
    color: yellow,
    brightColor: brightYellow,
    bg: bgYellow,
    label: "审计中",
    frames: SCAN_FRAMES,
  },
  revising: {
    icon: "✂",
    color: blue,
    brightColor: brightYellow,
    bg: bgBlue,
    label: "修订中",
    frames: WAVE_FRAMES,
  },
  planning: {
    icon: "◈",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "规划中",
    frames: PULSE_FRAMES,
  },
  loading: {
    icon: "◌",
    color: gray,
    brightColor: white,
    bg: bgGray,
    label: "加载中",
    frames: WAVE_FRAMES,
  },
};

export class ThemedSpinner {
  private interval: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private elapsed = 0;
  private theme: OperationTheme;
  private currentLabel = "";

  constructor(themeName = "thinking") {
    this.theme = THEMES[themeName] ?? THEMES["thinking"]!;
  }

  start(label?: string): void {
    this.currentLabel = label ?? this.theme.label;
    this.frame = 0;
    this.elapsed = 0;
    process.stdout.write(hideCursor);

    this.interval = setInterval(() => {
      this.elapsed += 120;
      const f = this.theme.frames[this.frame % this.theme.frames.length]!;
      const icon = c(this.theme.icon, this.theme.color);
      const anim = c(f, this.theme.brightColor);
      const text = c(this.currentLabel, dim);
      const time = this.elapsed >= 3000
        ? c(` ${formatElapsed(this.elapsed)}`, gray)
        : "";
      process.stdout.write(`${clearLine}  ${icon} ${text} ${anim}${time}`);
      this.frame++;
    }, 120);
  }

  update(label: string): void {
    this.currentLabel = label;
  }

  succeed(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("✓", brightGreen, bold)} ${message}`);
    }
  }

  fail(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("✗", red, bold)} ${message}`);
    }
  }

  stop(): void {
    this.clear();
  }

  private clear(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    process.stdout.write(`${clearLine}${showCursor}`);
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}
