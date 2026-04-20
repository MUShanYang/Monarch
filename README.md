<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | English | <a href="README.ja.md">日本語</a>
</p>

<p align="center">
<span style="font-size: 56px;">「纵使洗净一切无常无情并无意义。我也仍愿，欣然赴往那尘世之中。」</span>
</p>

故事的脉络，角色的宿命，文字的肌理——

皆由我裁定。

---

## 概述

**Monarch** 是基于 [InkOS](https://github.com/Narcooo/inkos) 构建的小模型写作 Agent。专注于处理世界观、角色、事件等复杂逻辑。

> [!WARNING]
> ⚠️ Monarch 目前是早期测试开发版本，部分功能尚未稳定。欢迎反馈问题和建议。

> [!NOTE]
> Monarch 与 InkOS 共用同一套环境配置，无需单独配置。InkOS 的安装、配置命令和操作方式完全适用于 Monarch。
>
> 有关 InkOS 的完整功能、命令和使用方式，请参考 [InkOS 官方仓库](https://github.com/Narcooo/inkos)。

### 核心哲学

模型只负责写句子，系统负责追踪世界观。

4B 参数的小模型没有足够的能力同时处理复杂的逻辑推理和创造性写作。Monarch 的做法是：

- **纯 TypeScript 处理所有逻辑**：母题追踪、情感弧线、节拍规划、一致性审计
- **LLM 只负责生成文本**：在严格的 API 约束下输出符合规范的 prose

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Monarch CLI                          │
│                                                         │
│  用户输入 → Adaptation Layer → InkOS Pipeline → 输出      │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Motif      │  │  Narrative   │  │  Cascade      │  │
│  │  Indexer    │  │  DNA         │  │  Auditor      │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                  │           │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌───────┴───────┐  │
│  │  Sensory    │  │  Beat        │  │  Show-Don't-  │  │
│  │  Echo       │  │  Planner     │  │  Tell Scalpel │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Write 命令执行流程

### 1. CLI 入口

**文件**: `packages/cli/src/commands/write.ts`

用户执行 `inkos write next <book-id>` 时，CLI 会根据是否启用 Adaptation 模式选择不同的 Pipeline 方法：

```typescript
// 第54-56行
const result = useAdaptation
  ? await pipeline.writeNextChapterWithAdaptation(bookId, { wordCount, maxRetries })
  : await pipeline.writeNextChapter(bookId, wordCount);
```

| 模式 | 方法 | 说明 |
|------|------|------|
| **Adaptation 模式**（默认） | `writeNextChapterWithAdaptation()` | 使用小模型适配层，节省 token |
| **完整模型模式** | `writeNextChapter()` | 直接调用标准 InkOS Pipeline，使用完整模型能力 |

#### 切换模式

```bash
# 默认：使用 Adaptation 模式（小模型）
monarch write next 吞天魔帝

# 切换到完整模型模式
monarch write next 吞天魔帝 --no-adaptation
```

> [!NOTE]
> `--no-adaptation` 会跳过 Adaptation Layer，直接使用完整的 InkOS 多 Agent 管线。适用于需要更强生成能力但 token 消耗更高的场景。

---

### 2. Adaptation 模式主流程

**文件**: `packages/core/src/pipeline/runner.ts` → `_writeNextChapterWithAdaptationLocked()`

```
┌─────────────────────────────────────────────────────────────┐
│         _writeNextChapterWithAdaptationLocked               │
├─────────────────────────────────────────────────────────────┤
│  1. 初始化 AdaptationHooks                                  │
│     └── hooks.initialize()                                  │
│         ├── EventSourcer.loadSnapshot() → 加载实体状态      │
│         ├── IntentCompiler.compile() → 编译 bible 为权重     │
│         └── LexicalMonitor.addAiTellWords() → 加载 AI 痕迹词 │
│                                                              │
│  2. 构建 LLM 接口                                           │
│     └── buildAdaptationLLMInterface()                       │
│         └── 桥接 InkOS 的 LLMProvider                       │
│                                                              │
│  3. 调用 ChapterPipelineAdapter                              │
│     └── ChapterPipelineAdapter.generateChapter()             │
│         ├── planBeats() → 节拍规划                          │
│         └── generateBeat() → 每个节拍                       │
│                                                              │
│  4. 写入章节文件 + 更新状态                                  │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. AdaptationHooks 组件详解

**文件**: `packages/core/src/adaptation/integration/hooks.ts`

`AdaptationHooks` 是 Adaptation Layer 的核心编排器，包含以下组件：

| 组件 | 类 | 职责 |
|------|-----|------|
| **EventSourcer** | `event-sourcer.ts` | 事件溯源，管理实体状态快照 |
| **IntentCompiler** | `intent-compiler.ts` | 编译 bible 文档为系统权重 |
| **LexicalMonitor** | `lexical-monitor.ts` | 词汇监控，AI 痕迹检测 |
| **RhythmGuard** | `rhythm-guard.ts` | 节奏守卫，防止连续相同类型节拍 |
| **CascadeAuditor** | `cascade-auditor.ts` | 5 层审计验证 |

#### preGenerationBeat 流程

```typescript
async preGenerationBeat(params): Promise<PreGenerationHooksResult> {
  // 1. 节奏守卫 — 检查是否需要强制插入特定节拍类型
  const rhythmResult = this.rhythmGuard.guard(params.beatType);
  const effectiveBeatType = rhythmResult.forcedType ?? params.beatType;

  // 2. 获取禁止词
  const lexicalState = {
    bannedWords: this.lexicalMonitor.getBannedWords(),
    // ...
  };

  // 3. DNA 压缩 — 250 token 预算
  const dnaInput: DnaCompressorInput = {
    snapshot: this.currentSnapshot!,
    intentOutput: this.currentIntent!,  // IntentCompiler 输出
    lexicalState,
    beatType: effectiveBeatType,
    tensionLevel: params.tensionLevel,
    // ...
  };
  const dnaResult = new DnaCompressor().compress(dnaInput);

  // 4. API 约束计算
  const apiConstraints = getApiConstraintsForBeat(effectiveBeatType, wordTarget, {
    additionalStopSequences: dnaResult.dna.mustNotInclude.slice(0, 5),
  });

  return {
    intentOutput: this.currentIntent,
    dna: dnaResult.dna,
    rhythmResult,
    bannedWords: this.lexicalMonitor.getBannedWords(),
    apiConstraints,
    kineticScaffold: rhythmResult.kineticScaffold,
  };
}
```

---

### 4. BeatOrchestrator 的 LLM 调用集成

**文件**: `packages/core/src/adaptation/integration/beat-orchestrator.ts`

#### 新增接口

```typescript
// LLM 调用接口
export interface BeatOrchestratorLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

// 注入 LLM 实现
setLLMInterface(llm: BeatOrchestratorLLMInterface): void;
```

#### executeSpeculativeCalls - 执行 3 路并发生成

```typescript
async executeSpeculativeCalls(
  request: BeatGenerationRequest
): Promise<SpeculativeCandidate[]> {
  const configs = this.prepareSpeculativeCalls(request);
  const results = await Promise.all(configs.map(c => this.llm.callLLMWithConfig(c)));

  return configs.map((config, i) => {
    const prose = this.applyShowDontTell(results[i]);
    return this.createCandidateFromProse(config.variantId, prose);
  });
}
```

#### buildSystemPrompt - 构建系统提示词

```typescript
private buildSystemPrompt(request: BeatGenerationRequest, variant: SpeculativeVariant): string {
  const parts: string[] = [];

  if (request.kineticScaffold) {
    parts.push(`Start with: "${request.kineticScaffold}"`);
  }

  if (request.dna.motifEcho) {
    parts.push(`[MOTIF ECHO] ${request.dna.motifEcho}`);
  }

  if (request.dna.sensoryEcho) {
    parts.push(`[SENSORY ECHO] ${request.dna.sensoryEcho}`);
  }

  // ... 其他部分
  parts.push(`Style: ${variant.suffix}`);

  return parts.join("\n");
}
```

| 变体 | 风格 | Temperature |
|------|------|-------------|
| **A** | terse（简洁） | 0.7 |
| **B** | internal（内心） | 0.8 |
| **C** | sensory（感官） | 0.75 |

---

### 5. ChapterPipelineAdapter 的 LLM 调用集成

**文件**: `packages/core/src/adaptation/integration/chapter-pipeline.ts`

#### 新增接口

```typescript
export interface ChapterPipelineLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

setLLMInterface(llm: ChapterPipelineLLMInterface): void;
```

#### generateBeat - 完整的 Beat 生成流程

```typescript
async generateBeat(params: {
  beatIndex: number;
  beatType: BeatType;
  tensionLevel: TensionLevel;
  // ...
  isChapterEnd: boolean;
}): Promise<BeatGenerationStep> {
  // 1. preGenerationBeat - DNA 压缩和 API 约束准备
  const preGen = await this.hooks.preGenerationBeat({...});

  // 2. 构建请求
  const request: BeatGenerationRequest = {
    beatId: `beat-${params.beatIndex}`,
    beatType: params.beatType,
    dna: preGen.dna,
    kineticScaffold: preGen.kineticScaffold,
    // ...
  };

  // 3. 调用 BeatOrchestrator 执行 3 路并发生成
  const candidates = await this.orchestrator.executeSpeculativeCalls(request);

  // 4. 审计和选择最优候选
  const selection = this.orchestrator.selectBestCandidate(candidates, preGen.dna);

  // 5. postGenerationBeat - 审计和事件提取
  const postResult = await this.hooks.postGenerationBeat({
    prose: selection.selectedProse!,
    dna: preGen.dna,
    beatType: params.beatType,
  });

  return {
    selectedProse: selection.selectedProse,
    candidates: selection.candidates,
    auditResult: postResult.auditResult,
    events: postResult.events,
    // ...
  };
}
```

---

### 6. 完整数据流

```
monarch write next (默认使用 Adaptation)
    │
    ▼
writeNextChapterWithAdaptationLocked
    │
    ├── 初始化 AdaptationHooks
    │   ├── IntentCompiler.compile() → HardBan, DnaWeight, FocusMultiplier
    │   ├── EventSourcer.loadSnapshot() → 实体状态
    │   └── LexicalMonitor.addAiTellWords() → AI 痕迹词
    │
    ├── 构建 LLM 接口
    │   └── buildAdaptationLLMInterface() → 桥接 InkOS LLMProvider
    │
    ▼
ChapterPipelineAdapter.generateChapter()
    │
    ├── planBeats() → 节拍规划（位置偏好 + 节奏守卫）
    │
    └── generateBeat() → 每个节拍
         │
         ├─ hooks.preGenerationBeat()
         │    └─ DnaCompressor 压缩状态为 NarrativeDNA
         │    └─ RhythmGuard 生成 Kinetic Scaffold
         │
         └─ BeatOrchestrator.executeSpeculativeCalls()
              │
              ├─ 3 路并发生成 (A/B/C 语义变体)
              │    └─ LLM 调用 + API 约束
              │    └─ Show-Don't-Tell Scalpel 后处理
              │
              ├─ hooks.postGenerationBeat()
              │    └─ CascadeAuditor 审计
              │    └─ EventSourcer 事件提取
              │
              └─ 选择最优候选
    │
    ▼
写入章节文件 + 更新状态
```

---

### 7. 当前实现状态

> [!NOTE]
> **已集成**：
> - `BeatOrchestratorLLMInterface` — LLM 调用接口定义
> - `setLLMInterface()` — LLM 实现注入
> - `executeSpeculativeCalls()` — 3 路并行 LLM 调用
> - `buildSystemPrompt()` — 集成 motifEcho 和 sensoryEcho 指令
> - `ChapterPipelineAdapter.setLLMInterface()` — LLM 接口注入
> - `generateBeat()` — 完整的 beat 级生成流程
> - `_writeNextChapterWithAdaptationLocked()` — 使用 ChapterPipelineAdapter 替代原来的 InkOS 流水线

## 工作流

### 1. 意图编译（Intent Compiler）

读取作者的设定文档（bible），编译成系统权重：
- `HardBan` — 绝对禁止的规则
- `DnaWeight` — 各 DNA 字段的权重分配
- `FocusMultiplier` — 角色聚焦倍率

### 2. DNA 压缩（DnaCompressor）

将完整的故事状态压缩成 250 token 以内的 NarrativeDNA：
- `who` — 当前场景中的角色快照
- `where` — 地点描述（200 字符限制）
- `mustInclude` — 必须包含的元素（最多 3 个）
- `mustNotInclude` — 禁止词汇列表
- `motifEcho` — 母题回响指令
- `sensoryEcho` — 感官闪回微剂量注入

### 3. 节拍规划（BeatPlanner）

根据张力和情感债务，规划每一拍的类型：
- **负空间触发器**：连续高强度 + 情感债务 > 5 → 插入静默节拍
- **对话密集触发**：连续 3 个对话节拍 → 插入环境描写
- 自动插入 Kinetic Scaffold 打破 4B 模型的初始化偏见

### 4. 推测生成（Speculative Generator）

并行生成 3 个语义变体（terse / internal / sensory）：
- 每个变体附加 3 种句法策略（parataxis / hypotaxis / nominal）
- 共 9 个候选，分 3 批并发
- 自回归偏好：连续 2 次获胜的句法策略自动锁定

### 5. 母题记忆（MotifIndexer）

维护跨章节的母题索引：
- 扫描文本中出现的 40+ 预定义母题
- 追踪每次出现的情感向量和关联角色
- 自动计算弧线：REINFORCE / CONTRAST / TRANSMUTE / DORMANT
- 感官闪回微剂量注入：当母题复现时，要求模型在角色身体层面埋一个 0.5 秒的干扰

### 6. 级联审计（CascadeAuditor）

分层验证生成的文本：
1. **规则审计** — 检查 HardBan 是否被违反
2. **专有名词审计** — 检查人名/地名拼写一致性
3. **结构审计** — 检查字数目标和节拍类型匹配度
4. **声音审计** — 检查词汇重复和 AI 痕迹词
5. **连续性审计** — 检查与上一拍的情节连贯性

### 7. 后处理（Show-Don't-Tell Scalpel）

暴力切除露骨的因果表达：
- `以此掩饰` / `因为他感到` / `仿佛在说` / `试图以此`
- 清理产生的多余标点（`,。` → `。`）

## API 约束

每个 LLM 调用都必须包含：
- `max_tokens` — 根据节拍类型动态计算（action: 180, dialogue: 220, 等）
- `stop_sequences` — 防止模型生成超出范围的内容
- `temperature` — 根据变体类型差异化（A: 0.7, B: 0.8, C: 0.75）
- `frequency_penalty` — 0.3
- `presence_penalty` — 0.2

## 章节截断修复

为章节最后一拍预留 50 个 token 的收尾空间，防止内容被截断。

```typescript
const CHAPTER_END_RESERVE_TOKENS = 50;

// getApiConstraintsForBeat(beatType, wordTarget, { isChapterEnd: true })
// → maxTokens += CHAPTER_END_RESERVE_TOKENS
```

## RED LINES

- **NO LLM FOR LOGIC** — 所有逻辑必须是纯 TypeScript
- **MAX 3 PARALLEL CALLS** — Promise.all 的 LLM 调用不超过 3 个
- **EVENT SOURCING ONLY** — LLM 绝不直接修改状态文件
- **NO MODIFICATION OF BASE INKOS** — 所有代码在 `src/adaptation/` 目录下

## 目录结构

```
packages/core/src/adaptation/
├── state/
│   ├── event-sourcer.ts      # 事件溯源，纯 TS 状态突变
│   ├── intent-compiler.ts    # 意图编译，bible → SystemWeights
│   ├── motif-indexer.ts      # 母题索引，跨章节记忆
│   └── motif-types.ts        # 母题数据结构定义
├── beat/
│   ├── beat-types.ts         # Beat, NarrativeDNA, SensoryEcho
│   ├── planner.ts            # 节拍规划，负空间触发器
│   ├── rhythm-guard.ts       # 节奏守卫，Kinetic Scaffolds
│   ├── speculative-generator.ts  # 推测生成，句法变体
│   └── show-dont-tell-scalpel.ts # 露骨因果词切除
├── context/
│   └── dna-compressor.ts     # DNA 压缩，250 token 预算
├── audit/
│   ├── lexical-monitor.ts    # 词汇监控，AI 痕迹检测
│   └── cascade-auditor.ts    # 级联审计，5 层验证
├── llm/
│   └── api-constraints.ts    # API 约束，max_tokens 计算
├── integration/
│   ├── hooks.ts              # 适配层钩子
│   ├── beat-orchestrator.ts  # 节拍编排，3 路并行
│   └── chapter-pipeline.ts   # 章节管线适配
└── types/
    └── state-types.ts        # 核心状态类型定义
```

## 与 InkOS 的关系

Monarch 构建于 InkOS 之上，继承了 InkOS 的核心管线和工作流。主要区别在于：

| 特性 | InkOS | Monarch |
|------|-------|---------|
| 定位 | 通用长篇小说写作 Agent | 小模型写作 Agent，专注复杂逻辑处理 |
| 架构 | 多 Agent 协作 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | 处理逻辑和写作 | 仅负责生成文本，逻辑由 TypeScript 处理 |

### 环境配置

Monarch 与 InkOS 使用相同的环境配置方式，无需额外配置。请参考 [InkOS 配置指南](https://github.com/Narcooo/inkos#%E9%85%8D%E7%BD%AE)。

### 更多功能

InkOS 提供了丰富的功能，包括但不限于：
- 多种交互模式（TUI / Studio / CLI）
- 续写已有作品
- 同人创作
- 文风仿写
- 多模型路由
- 守护进程模式

如需了解这些功能的详细信息和使用方式，请访问 [InkOS 官方仓库](https://github.com/Narcooo/inkos)。

## 许可证

[AGPL-3.0](LICENSE)
