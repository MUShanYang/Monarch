<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

***

> [!IMPORTANT]
> 🚧 **项目处于快速迭代中** - 本 README 可能与实际代码存在差异，请以代码和 `CLAUDE.md` 为准。

> [!WARNING]
> ⚠️ Monarch 目前是早期测试开发版本，部分功能尚未稳定完善。

## 概述

**Monarch** 是基于 [InkOS](https://github.com/Narcooo/inkos) 构建的小模型写作 Agent，专注于使用小模型（4B参数）处理复杂叙事逻辑。

> [!NOTE]
> Monarch 与 InkOS 共用同一套环境配置，无需单独配置。
>
> 有关完整功能、命令和使用方式，请参考 [InkOS 官方仓库](https://github.com/Narcooo/inkos)。

### 核心哲学

**模型只负责写句子，系统负责追踪世界观。**

4B 参数的小模型无法同时处理复杂逻辑推理和创造性写作。Monarch 的做法是：

- **纯 TypeScript 处理所有逻辑**：母题追踪、情感弧线、节拍规划、一致性审计、角色知识追踪
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
  ├─ Hook Prioritizer (智能调整剧情线索优先级，支持长期hook)
  ├─ Drift Detector (每5章检测叙事漂移)
  ├─ Curiosity Ledger (好奇心问题追踪)
  ├─ Chapter Health Monitor (实时监控章节质量)
  ├─ Emotional Debt Analysis (情感债务)
  ├─ Unconscious Analysis (无意识内容)
  └─ Timeline Analysis (时间线冲突)

Scene Level (场景级)
  ├─ Scene Exit Evaluator (9种退出条件)
  └─ Narrative Metabolism (实时监控)

Beat Level (节拍级) - 11步流程
  1. Beat Planning (DNA压缩 ≤250 tokens + Beat类型推荐)
  2. Generation (LLM生成)
  3. Adversarial Refinement (对抗精炼，最多6轮)
  4. Reader Simulation (三读者模拟)
  5. Knowledge Boundary (知识边界检查 + 角色知识追踪)
  6. Subtext Analysis (潜台词分析)
  7. Voice Fingerprint (声音一致性)
  8. Dialogue Validation (对话验证)
  9. Cascade Audit (5层质量门)
  10. State Update (事件溯源)
  11. Show-Don't-Tell Scalpel (后处理)
```

### 智能系统（新增）

**1. Hook Prioritizer（剧情线索优先级调整器）**
- 自动调整 hook 优先级，避免线索被遗忘
- 支持长期 hook（跨越50+章的主线伏笔）
- 基于章节进度、hook 年龄、停滞时间自动调整

**2. Beat Type Recommender（节拍类型推荐器）**
- 智能推荐下一个 beat 类型，避免节奏单调
- 基于6条规则：避免连续相同、平衡对话/动作比例、张力水平、hook 需求、章节进度、打破单调模式

**3. Chapter Health Monitor（章节健康监控）**
- 实时监控章节生成质量（6项指标）
- 对话比例、动作比例、张力变化、字数分布、节奏单调度、进度估算

**4. Style Consistency Checker（风格一致性检查器）**
- 检查新章节是否符合已建立的写作风格
- 分析句长、词汇多样性、标点使用等

**5. Dynamic Motif Extractor（动态母题提取器）**
- 从 story_bible 和章节内容自动提取故事特定母题
- 替代硬编码的通用母题词汇，适应每个故事的独特意象

**6. Knowledge Tracker（角色知识追踪器）** ⭐ 新增
- **解决核心问题**：防止 AI 让角色说出他们不应该知道的信息
- 追踪每个角色的知识状态（knows/suspects/doesNotKnow）
- 每个 beat 生成后自动验证知识边界
- 自动提取新知识并更新追踪状态
- 详见：`packages/core/src/adaptation/character/KNOWLEDGE_TRACKING.md`

### 核心特性

**DNA 压缩**: 将完整故事状态压缩成 ≤250 tokens
- `who` / `where` / `mustInclude` / `mustNotInclude` / `motifEcho` / `sensoryEcho`

**推测生成**: 3个语义变体 × 3种句法策略并行生成

**级联审计**: 5层质量验证（字数/专有名词/DNA合规/声音/连续性）

**事件溯源**: LLM 从不直接修改状态，所有变更通过事件应用

**并行约束**: 最多 3 个并发 LLM 调用

## 与 InkOS 的关系

| 特性 | InkOS | Monarch |
|------|-------|---------|
| 定位 | 通用长篇小说写作 Agent | 小模型写作 Agent |
| 架构 | 多 Agent 协作 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | 处理逻辑和写作 | 仅生成文本，逻辑由 TypeScript 处理 |
| 智能系统 | 基础 | 6个增强系统（Hook/Beat/Health/Style/Motif/Knowledge） |

Monarch 与 InkOS 使用相同的环境配置方式，无需额外配置。请参考 [InkOS 配置指南](https://github.com/Narcooo/inkos#配置)。

## 文档

- `CLAUDE.md` - 项目架构和开发指南（最准确）
- `packages/core/src/adaptation/character/KNOWLEDGE_TRACKING.md` - 角色知识追踪系统使用指南
- `packages/core/src/adaptation/narrative/LONG_TERM_HOOKS.md` - 长期 Hook 使用指南

## 许可证

[AGPL-3.0](LICENSE)
