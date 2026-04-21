<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

***

## 概述

**Monarch** 是基于 [InkOS](https://github.com/Narcooo/inkos) 构建的小模型写作 Agent，专注于使用小模型（4B参数）处理复杂叙事逻辑。

> [!WARNING]
> ⚠️ Monarch 目前是早期测试开发版本，部分功能尚未稳定完善。

> [!NOTE]
> Monarch 与 InkOS 共用同一套环境配置，无需单独配置。
>
> 有关完整功能、命令和使用方式，请参考 [InkOS 官方仓库](https://github.com/Narcooo/inkos)。

### 核心哲学

**模型只负责写句子，系统负责追踪世界观。**

4B 参数的小模型无法同时处理复杂逻辑推理和创造性写作。Monarch 的做法是：

- **纯 TypeScript 处理所有逻辑**：母题追踪、情感弧线、节拍规划、一致性审计
- **LLM 只负责生成文本**：在严格的 API 约束下输出符合规范的 prose

## 使用方式

### 两种执行模式

```bash
# Adaptation 模式（默认）- 使用小模型适配层
monarch write next <book-id>

# 完整模型模式 - 直接使用 InkOS 多 Agent 管线
monarch write next <book-id> --no-adaptation
```

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| **Adaptation** | 小模型 + TypeScript逻辑 | 节省token，适合长期创作 |
| **完整模型** | 完整InkOS管线 | 需要更强生成能力 |

## 架构概览

### Adaptation Pipeline 三层架构

```
Chapter Level (章节级)
  ├─ Drift Detector (每5章检测叙事漂移)
  ├─ Curiosity Ledger (好奇心问题追踪)
  ├─ Metabolism Reporter (章节健康度)
  ├─ Emotional Debt Analysis (情感债务)
  ├─ Unconscious Analysis (无意识内容)
  └─ Timeline Analysis (时间线冲突)

Scene Level (场景级)
  ├─ Scene Exit Evaluator (9种退出条件)
  └─ Narrative Metabolism (实时监控)

Beat Level (节拍级) - 11步流程
  1. Beat Planning (DNA压缩 ≤250 tokens)
  2. Generation (LLM生成)
  3. Adversarial Refinement (对抗精炼，最多6轮)
  4. Reader Simulation (三读者模拟)
  5. Knowledge Boundary (知识边界检查)
  6. Subtext Analysis (潜台词分析)
  7. Voice Fingerprint (声音一致性)
  8. Dialogue Validation (对话验证)
  9. Cascade Audit (5层质量门)
  10. State Update (事件溯源)
  11. Show-Don't-Tell Scalpel (后处理)
```

### 核心特性

**DNA 压缩**: 将完整故事状态压缩成 ≤250 tokens
- `who` / `where` / `mustInclude` / `mustNotInclude` / `motifEcho` / `sensoryEcho`

**推测生成**: 3个语义变体 × 3种句法策略并行生成

**级联审计**: 5层质量验证（字数/专有名词/DNA合规/声音/连续性）

**事件溯源**: LLM 从不直接修改状态，所有变更通过事件应用

**并行约束**: 最多 3 个并发 LLM 调用（RED LINE）

## RED LINES（架构约束）

- **NO LLM FOR LOGIC** - 所有逻辑必须是纯 TypeScript
- **MAX 3 PARALLEL CALLS** - Promise.all 的 LLM 调用不超过 3 个
- **EVENT SOURCING ONLY** - LLM 绝不直接修改状态文件
- **NO MODIFICATION OF BASE INKOS** - 所有代码在 `src/adaptation/` 目录下

## 与 InkOS 的关系

| 特性 | InkOS | Monarch |
|------|-------|---------|
| 定位 | 通用长篇小说写作 Agent | 小模型写作 Agent |
| 架构 | 多 Agent 协作 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | 处理逻辑和写作 | 仅生成文本，逻辑由 TypeScript 处理 |

Monarch 与 InkOS 使用相同的环境配置方式，无需额外配置。请参考 [InkOS 配置指南](https://github.com/Narcooo/inkos#配置)。

## 许可证

[AGPL-3.0](LICENSE)
