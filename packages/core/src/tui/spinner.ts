/* ── Themed spinner for adaptation progress ── */

import {
  c, bold, dim,
  cyan, green, yellow, blue, magenta, red, gray, white,
  brightCyan, brightGreen, brightYellow, brightMagenta,
  bgCyan, bgBlue, bgMagenta, bgGreen, bgYellow, bgGray,
  clearLine, hideCursor, showCursor, reset,
  gradient, GRADIENTS, type RGB,
} from "./ansi.js";

export interface OperationTheme {
  readonly icon: string;
  readonly color: string;
  readonly brightColor: string;
  readonly bg: string;
  readonly label: string;
  readonly frames: ReadonlyArray<string>;
  readonly gradient: ReadonlyArray<RGB>;
}

const WAVE_FRAMES = ["|", "/", "-", "\\", "|", "/", "-", "\\"];
const PULSE_FRAMES = [".", "o", "O", "o", ".", " "];
const DOTS_FRAMES = [".  ", ".. ", "...", " ..", "  .", "   "];
const SCAN_FRAMES = ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[====]", "[ ===]", "[  ==]", "[   =]"];
const WRITE_FRAMES = [">", ">>", ">>>", ">>>>", ">>>>>", ">>>>", ">>>", ">>"];
const STAR_FRAMES = ["✢", "✣", "✤", "✥", "✦", "✧", "✢"];
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DOTS2_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
const ARROW_FRAMES = ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"];
const BOUNCE_FRAMES = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"];

export const THEMES: Record<string, OperationTheme> = {
  thinking: {
    icon: "*",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "思考中",
    frames: SPINNER_FRAMES,
    gradient: GRADIENTS.cyan_blue,
  },
  writing: {
    icon: ">",
    color: magenta,
    brightColor: brightMagenta,
    bg: bgMagenta,
    label: "写作中",
    frames: DOTS2_FRAMES,
    gradient: GRADIENTS.magenta_pink,
  },
  auditing: {
    icon: "#",
    color: yellow,
    brightColor: brightYellow,
    bg: bgYellow,
    label: "审计中",
    frames: BOUNCE_FRAMES,
    gradient: GRADIENTS.yellow_orange,
  },
  revising: {
    icon: "~",
    color: blue,
    brightColor: brightYellow,
    bg: bgBlue,
    label: "修订中",
    frames: ARROW_FRAMES,
    gradient: GRADIENTS.cyan_blue,
  },
  planning: {
    icon: "+",
    color: cyan,
    brightColor: brightCyan,
    bg: bgCyan,
    label: "规划中",
    frames: PULSE_FRAMES,
    gradient: GRADIENTS.cyan_blue,
  },
  loading: {
    icon: "o",
    color: gray,
    brightColor: white,
    bg: bgGray,
    label: "加载中",
    frames: SPINNER_FRAMES,
    gradient: GRADIENTS.green_cyan,
  },
};

type SpinnerState = 'intro' | 'spinning';

export class ThemedSpinner {
  private interval: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private elapsed = 0;
  private theme: OperationTheme;
  private currentLabel = "";
  private state: SpinnerState = 'intro';
  private introCharsRevealed = 0;

  constructor(themeName = "thinking") {
    this.theme = THEMES[themeName] ?? THEMES["thinking"]!;
  }

  start(label?: string): void {
    this.currentLabel = label ?? this.theme.label;
    this.frame = 0;
    this.elapsed = 0;
    this.state = 'intro';
    this.introCharsRevealed = 0;
    process.stdout.write(hideCursor);

    this.interval = setInterval(() => {
      if (this.state === 'intro') {
        this.renderIntro();
      } else {
        this.renderSpinning();
      }
    }, 120);
  }

  update(label: string): void {
    this.currentLabel = label;
  }

  private renderIntro(): void {
    this.elapsed += 120;
    this.introCharsRevealed = Math.min(
      this.introCharsRevealed + 2,
      this.currentLabel.length
    );

    const revealed = this.currentLabel.slice(0, this.introCharsRevealed);
    const star = STAR_FRAMES[this.frame % STAR_FRAMES.length]!;
    const icon = c(this.theme.icon, this.theme.color);
    const gradientText = gradient(revealed, this.theme.gradient);

    process.stdout.write(`${clearLine}  ${c(star, this.theme.brightColor)} ${icon} ${gradientText}`);
    this.frame++;

    if (this.introCharsRevealed >= this.currentLabel.length) {
      this.state = 'spinning';
    }
  }

  private renderSpinning(): void {
    this.elapsed += 120;
    const star = STAR_FRAMES[this.frame % STAR_FRAMES.length]!;
    const f = this.theme.frames[this.frame % this.theme.frames.length]!;
    const icon = c(this.theme.icon, this.theme.color);
    const anim = c(f, this.theme.brightColor);
    const gradientLabel = gradient(this.currentLabel, this.theme.gradient);
    const time = this.elapsed >= 3000
      ? c(` ${formatElapsed(this.elapsed)}`, gray)
      : "";
    process.stdout.write(`${clearLine}  ${c(star, this.theme.brightColor)} ${icon} ${gradientLabel} ${anim}${time}`);
    this.frame++;
  }

  succeed(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("[OK]", brightGreen, bold)} ${message}`);
    }
  }

  fail(message?: string): void {
    this.clear();
    if (message) {
      console.log(`  ${c("[FAIL]", red, bold)} ${message}`);
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
