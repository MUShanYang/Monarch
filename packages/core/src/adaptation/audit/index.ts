export { LexicalMonitor, createLexicalMonitor, analyzeProseForOveruse, STOP_WORDS, AI_TELL_WORDS } from "./lexical-monitor.js";
export type { WordUsageEntry, LexicalMonitorState, LexicalMonitorResult } from "./lexical-monitor.js";
export { CascadeAuditor, createCascadeAuditor, quickAuditProse } from "./cascade-auditor.js";
export type { AuditLayer, AuditIssue, AuditResult, CascadeAuditorConfig } from "./cascade-auditor.js";
