/* ── ANSI terminal helpers ── zero dependencies ── */

export const reset = "\x1b[0m";
export const bold = "\x1b[1m";
export const dim = "\x1b[2m";

export const red = "\x1b[31m";
export const green = "\x1b[32m";
export const yellow = "\x1b[33m";
export const blue = "\x1b[34m";
export const magenta = "\x1b[35m";
export const cyan = "\x1b[36m";
export const white = "\x1b[37m";
export const gray = "\x1b[90m";
export const brightGreen = "\x1b[92m";
export const brightYellow = "\x1b[93m";
export const brightCyan = "\x1b[96m";
export const brightMagenta = "\x1b[95m";
export const brightWhite = "\x1b[97m";

export const bgCyan = "\x1b[46m";
export const bgBlue = "\x1b[44m";
export const bgMagenta = "\x1b[45m";
export const bgGreen = "\x1b[42m";
export const bgYellow = "\x1b[43m";
export const bgGray = "\x1b[100m";

export const showCursor = "\x1b[?25h";
export const hideCursor = "\x1b[?25l";
export const clearLine = "\x1b[2K\r";

export function c(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${reset}`;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bgRgb(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function lerpColor(color1: RGB, color2: RGB, t: number): RGB {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t),
  };
}

export function gradient(text: string, colors: readonly RGB[]): string {
  if (colors.length === 0) return text;
  if (colors.length === 1) {
    const col = colors[0]!;
    return `${rgb(col.r, col.g, col.b)}${text}${reset}`;
  }

  const chars = Array.from(text);
  const segments = colors.length - 1;
  const charsPerSegment = chars.length / segments;

  return chars.map((char, i) => {
    const segmentIndex = Math.min(Math.floor(i / charsPerSegment), segments - 1);
    const segmentProgress = (i - segmentIndex * charsPerSegment) / charsPerSegment;
    const color = lerpColor(colors[segmentIndex]!, colors[segmentIndex + 1]!, segmentProgress);
    return `${rgb(color.r, color.g, color.b)}${char}`;
  }).join('') + reset;
}

export const GRADIENTS = {
  cyan_blue: [
    { r: 56, g: 189, b: 248 },
    { r: 139, g: 92, b: 246 },
  ],
  magenta_pink: [
    { r: 236, g: 72, b: 153 },
    { r: 251, g: 146, b: 60 },
  ],
  green_cyan: [
    { r: 52, g: 211, b: 153 },
    { r: 16, g: 185, b: 129 },
  ],
  yellow_orange: [
    { r: 251, g: 191, b: 36 },
    { r: 245, g: 158, b: 11 },
  ],
};
