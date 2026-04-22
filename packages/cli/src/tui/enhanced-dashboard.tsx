import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { InteractionSession } from "@actalk/monarch-core";
import {
  WARM_ACCENT, WARM_BORDER, WARM_MUTED, WARM_REPLY,
  STATUS_SUCCESS, STATUS_ERROR, STATUS_ACTIVE, STATUS_IDLE,
} from "./theme.js";

export interface EnhancedDashboardProps {
  readonly session: InteractionSession;
  readonly isSubmitting: boolean;
  readonly tokenUsage?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
  readonly estimatedTime?: number;
  readonly currentStage?: string;
  readonly progress?: number;
}

export function EnhancedDashboard(props: EnhancedDashboardProps): React.JSX.Element {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!props.isSubmitting) {
      setElapsedSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [props.isSubmitting]);

  const terminalWidth = process.stdout.columns ?? 80;
  const panelWidth = Math.floor((terminalWidth - 6) / 2);

  return (
    <Box flexDirection="column" width="100%">
      {/* Top status bar */}
      <StatusBar
        isSubmitting={props.isSubmitting}
        currentStage={props.currentStage}
        elapsedSeconds={elapsedSeconds}
        estimatedTime={props.estimatedTime}
      />

      {/* Main content area with side panels */}
      <Box flexDirection="row" marginTop={1}>
        {/* Left panel - Token usage */}
        <Box flexDirection="column" width={panelWidth} marginRight={2}>
          <TokenUsagePanel tokenUsage={props.tokenUsage} />
        </Box>

        {/* Right panel - Progress */}
        <Box flexDirection="column" width={panelWidth}>
          <ProgressPanel
            progress={props.progress}
            isSubmitting={props.isSubmitting}
            currentStage={props.currentStage}
          />
        </Box>
      </Box>
    </Box>
  );
}

function StatusBar(props: {
  readonly isSubmitting: boolean;
  readonly currentStage?: string;
  readonly elapsedSeconds: number;
  readonly estimatedTime?: number;
}): React.JSX.Element {
  const statusColor = props.isSubmitting ? STATUS_ACTIVE : STATUS_IDLE;
  const statusIcon = props.isSubmitting ? "◉" : "●";
  const timeDisplay = formatTime(props.elapsedSeconds);
  const estimatedDisplay = props.estimatedTime ? ` / ~${formatTime(props.estimatedTime)}` : "";

  return (
    <Box borderStyle="round" borderColor={statusColor} paddingX={1}>
      <Text color={statusColor} bold>
        {statusIcon}
      </Text>
      <Text color={WARM_REPLY}> {props.currentStage || "待机中"}</Text>
      <Text color={WARM_MUTED}> │ </Text>
      <Text color={WARM_ACCENT}>
        {timeDisplay}
        {estimatedDisplay}
      </Text>
    </Box>
  );
}

function TokenUsagePanel(props: {
  readonly tokenUsage?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
}): React.JSX.Element {
  const usage = props.tokenUsage || { input: 0, output: 0, total: 0 };
  const maxBarWidth = 20;
  const inputBar = Math.floor((usage.input / Math.max(usage.total, 1)) * maxBarWidth);
  const outputBar = Math.floor((usage.output / Math.max(usage.total, 1)) * maxBarWidth);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={WARM_BORDER} paddingX={1}>
      <Text color={WARM_ACCENT} bold>
        Token 使用统计
      </Text>
      <Box marginTop={1}>
        <Text color={WARM_MUTED}>输入: </Text>
        <Text color={WARM_REPLY}>{formatNumber(usage.input)}</Text>
      </Box>
      <Box>
        <Text color="#4a9eff">{"█".repeat(inputBar)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={WARM_MUTED}>输出: </Text>
        <Text color={WARM_REPLY}>{formatNumber(usage.output)}</Text>
      </Box>
      <Box>
        <Text color="#ff9a4a">{"█".repeat(outputBar)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={WARM_MUTED}>总计: </Text>
        <Text color={WARM_ACCENT} bold>
          {formatNumber(usage.total)}
        </Text>
      </Box>
    </Box>
  );
}

function ProgressPanel(props: {
  readonly progress?: number;
  readonly isSubmitting: boolean;
  readonly currentStage?: string;
}): React.JSX.Element {
  const progress = props.progress ?? 0;
  const barWidth = 30;
  const filledWidth = Math.floor((progress / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = "█".repeat(filledWidth) + "░".repeat(emptyWidth);
  const progressColor = progress < 30 ? STATUS_ERROR : progress < 70 ? STATUS_ACTIVE : STATUS_SUCCESS;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={WARM_BORDER} paddingX={1}>
      <Text color={WARM_ACCENT} bold>
        生成进度
      </Text>
      <Box marginTop={1}>
        <Text color={progressColor}>{progressBar}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={WARM_REPLY}>
          {progress.toFixed(1)}%
        </Text>
      </Box>
      {props.currentStage && (
        <Box marginTop={1}>
          <Text color={WARM_MUTED}>当前阶段: </Text>
          <Text color={WARM_REPLY}>{props.currentStage}</Text>
        </Box>
      )}
      {!props.isSubmitting && progress === 0 && (
        <Box marginTop={1}>
          <Text color={WARM_MUTED} italic>
            等待任务开始...
          </Text>
        </Box>
      )}
    </Box>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
