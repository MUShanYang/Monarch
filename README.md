<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>


***

## 概述

**Monarch** 是基于 [InkOS](https://github.com/Narcooo/inkos) 构建的小模型写作 Agent。专注于处理世界观、角色、事件等复杂逻辑。

> \[!WARNING]
> ⚠️ Monarch 目前是早期测试开发版本，部分功能尚未稳定。欢迎反馈问题和建议。
>
> ⚠️ 目前正在验证可用性，暂不推荐在生产环境中使用。

> \[!NOTE]
> Monarch 与 InkOS 共用同一套环境配置，无需单独配置。InkOS 的安装、配置命令和操作方式完全适用于 Monarch。
>
> 有关 InkOS 的完整功能、命令和使用方式，请参考 [InkOS 官方仓库](https://github.com/Narcooo/inkos)。

### 核心哲学

模型只负责写句子，系统负责追踪世界观。

4B 参数的小模型没有足够的能力同时处理复杂的逻辑推理和创造性写作。Monarch 的做法是：

- **纯 TypeScript 处理所有逻辑**：母题追踪、情感弧线、节拍规划、一致性审计
- **LLM 只负责生成文本**：在严格的 API 约束下输出符合规范的 prose

## 架构概览

### 完整 Adaptation Pipeline 架构图

<p align="center">
  <img src="assets/monarch v2.svg" width="100%" alt="Monarch Architecture">
</p>

### 完整 Adaptation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AdaptationPipelineOrchestrator                       │
│                              (主编排器)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Chapter Level (章节级别)                                                    │
│  ├── Narrative Drift Detector    # 每5章检测叙事漂移                          │
│  ├── Curiosity Ledger            # 好奇心问题追踪                            │
│  └── Metabolism Reporter         # 章节健康度报告                            │
│                                                                             │
│  Scene Level (场景级别)                                                      │
│  ├── Scene Exit Evaluator        # 9种场景退出条件                           │
│  └── Narrative Metabolism        # 叙事代谢监控                              │
│                                                                             │
│  Beat Level (节拍级别)                                                       │
│  ├── 1. Beat Planning            # DNA Compiler + Kinetic Scaffold           │
│  ├── 2. Generation               # LLM生成                                   │
│  ├── 3. Adversarial Refinement   # Writer/Attacker/Referee (最多6轮)          │
│  ├── 4. Reader Simulation        # 三读者模拟 (Impatient/Suspicious/Visual)   │
│  ├── 5. Knowledge Boundary       # 角色知识边界检查                          │
│  ├── 6. Cascade Audit            # 5层级联审计                               │
│  ├── 7. State Update             # Event Sourcing                            │
│  └── 8. Show-Don't-Tell Scalpel  # 后处理                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

### 核心组件

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
│  │  Adversarial│  │  Beat        │  │  Show-Don't-  │  │
│  │  Refiner    │  │  Planner     │  │  Tell Scalpel │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Reader     │  │  Knowledge   │  │  Scene Exit   │  │
│  │  Simulator  │  │  Boundary    │  │  Evaluator    │  │
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

| 模式                    | 方法                                 | 说明                             |
| --------------------- | ---------------------------------- | ------------------------------ |
| **Adaptation 模式**（默认） | `writeNextChapterWithAdaptation()` | 使用小模型适配层，节省 token              |
| **完整模型模式**            | `writeNextChapter()`               | 直接调用标准 InkOS Pipeline，使用完整模型能力 |

#### 切换模式

```bash
# 默认：使用 Adaptation 模式（小模型）
monarch write next 吞天魔帝

# 切换到完整模型模式
monarch write next 吞天魔帝 --no-adaptation
```

> \[!NOTE]
> `--no-adaptation` 会跳过 Adaptation Layer，直接使用完整的 InkOS 多 Agent 管线。适用于需要更强生成能力但 token 消耗更高的场景。

***

### 2. Adaptation 模式主流程

**文件**: `packages/core/src/pipeline/runner.ts` → `_writeNextChapterWithAdaptationLocked()`

```
┌─────────────────────────────────────────────────────────────┐
│         _writeNextChapterWithAdaptationLocked               │
├─────────────────────────────────────────────────────────────┤
│  1. 准备章节输入                                             │
│     └── prepareWriteInput() → chapterIntent/contextPackage   │
│                                                              │
│  2. 初始化 AdaptationHooks                                  │
│     └── hooks.initialize()                                  │
│         ├── EventSourcer.loadSnapshot() → 加载实体状态      │
│         ├── IntentCompiler.compile() → 编译 story 文件为权重  │
│         └── LexicalMonitor.addAiTellWords() → 加载 AI 痕迹词 │
│                                                              │
│  3. 构建 LLM 接口                                           │
│     └── buildAdaptationLLMInterface()                       │
│         └── 桥接 InkOS 的 LLMProvider                       │
│                                                              │
│  4. 调用 ChapterPipelineAdapter                              │
│     └── ChapterPipelineAdapter.generateChapter()             │
│         ├── planBeats() → 节拍规划                          │
│         └── generateBeat() → 每个节拍（正确章节号）          │
│                                                              │
│  5. 完整 InkOS 管线                                          │
│     ├── runChapterReviewCycle() → 审计 + 修订              │
│     ├── buildPersistenceOutput() → 生成真相文件             │
│     ├── validateChapterTruthPersistence() → 真相文件验证    │
│     └── persistChapterArtifacts() → 落盘 + 快照 + 通知      │
└─────────────────────────────────────────────────────────────┘
```

***

### 3. AdaptationHooks 组件详解

**文件**: `packages/core/src/adaptation/integration/hooks.ts`

`AdaptationHooks` 是 Adaptation Layer 的核心编排器，包含以下组件：

| 组件                 | 类                    | 职责               |
| ------------------ | -------------------- | ---------------- |
| **EventSourcer**   | `event-sourcer.ts`   | 事件溯源，管理实体状态快照    |
| **IntentCompiler** | `intent-compiler.ts` | 编译 bible 文档为系统权重 |
| **LexicalMonitor** | `lexical-monitor.ts` | 词汇监控，AI 痕迹检测     |
| **RhythmGuard**    | `rhythm-guard.ts`    | 节奏守卫，防止连续相同类型节拍  |
| **CascadeAuditor** | `cascade-auditor.ts` | 5 层审计验证          |

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

***

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

| 变体    | 风格           | Temperature |
| ----- | ------------ | ----------- |
| **A** | terse（简洁）    | 0.7         |
| **B** | internal（内心） | 0.8         |
| **C** | sensory（感官）  | 0.75        |

***

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

***

### 6. 完整数据流

```
monarch write next (默认使用 Adaptation)
    │
    ▼
writeNextChapterWithAdaptationLocked
    │
    ├── 准备章节输入
    │   └── prepareWriteInput() → chapterIntent/contextPackage
    │
    ├── 初始化 AdaptationHooks
    │   ├── IntentCompiler.compile() → 编译所有 story 文件
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
    └─ 逐节拍 generateBeat()
         │
         ├─ hooks.preGenerationBeat()
         │    └─ DnaCompressor 压缩状态为 NarrativeDNA
         │    └─ RhythmGuard 生成 Kinetic Scaffold
         │    └─ **正确章节号** → 基于实际章节号构建上下文
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
完整 InkOS 管线
    │
    ├── runChapterReviewCycle() → 审计 + 修订
    │   └─ ContinuityAuditor + ReviserAgent
    │
    ├── buildPersistenceOutput() → 生成真相文件
    │   └─ ChapterAnalyzerAgent
    │
    ├── validateChapterTruthPersistence() → 真相文件验证
    │   └─ StateValidatorAgent
    │
    └── persistChapterArtifacts() → 落盘 + 快照 + 通知
```

***

### 7. 当前实现状态

> [!NOTE]
> **已集成**：
>
> - `BeatOrchestratorLLMInterface` — LLM 调用接口定义
> - `setLLMInterface()` — LLM 实现注入
> - `executeSpeculativeCalls()` — 3 路并行 LLM 调用
> - `buildSystemPrompt()` — 集成 motifEcho 和 sensoryEcho 指令
> - `ChapterPipelineAdapter.setLLMInterface()` — LLM 接口注入
> - `generateBeat()` — 完整的 beat 级生成流程
> - `_writeNextChapterWithAdaptationLocked()` — 完整对齐 InkOS 管线流程
> - **故事文件支持** — 读取并处理 10+ 种故事相关文件
> - **硬编码章节号修复** — 使用正确的章节号构建上下文
> - **完整 InkOS 管线集成** — 包含审计、修订、真相文件生成等所有步骤

## 工作流

### 完整 Pipeline 流程

详见 [FLOW.md](packages/core/src/adaptation/pipeline/FLOW.md) 获取完整的流程图和数据流说明。

### 1. 意图编译（Intent Compiler）

读取作者的设定文档，编译成系统权重：

- **支持的故事文件**：
  - `story_bible.md` — 故事设定
  - `style_guide.md` — 风格指南
  - `volume_outline.md` — 卷大纲
  - `chapter_summaries.md` — 章节摘要
  - `subplot_board.md` — 副线板
  - `emotional_arcs.md` — 情感弧线
  - `character_matrix.md` — 角色矩阵
  - `parent_canon.md` / `fanfic_canon.md` — 原作设定（同人）

- **编译输出**：
  - `HardBan` — 绝对禁止的规则
  - `DnaWeight` — 各 DNA 字段的权重分配
  - `FocusMultiplier` — 角色聚焦倍率
  - **章节连续性**：从 chapter_summaries.md 提取最近 3 章的角色和地点信息

### 2. DNA 压缩（DnaCompressor）

将完整的故事状态压缩成 250 token 以内的 NarrativeDNA，包含所有故事文件的信息：

- `who` — 当前场景中的角色快照
- `where` — 地点描述（200 字符限制）
- `mustInclude` — 必须包含的元素（最多 3 个）
- `mustNotInclude` — 禁止词汇列表
- `motifEcho` — 母题回响指令
- `sensoryEcho` — 感官闪回微剂量注入
- **故事文件集成**：从 chapter_summaries.md 提取最近章节信息，从 volume_outline.md 提取整体规划

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

### 8. 对抗精炼循环（Adversarial Refinement Loop）

Writer/Attacker/Referee 三方对抗精炼，最多 6 轮：

- **Attacker**：找出文本中的一个问题（只找一个）
- **Referee**：判断问题是否有效、是否已修复、是否引入新问题
- **Writer**：修复问题，保持其他内容不变

**退出条件**：
- `YES_FIXED_TWICE` — 连续两次确认修复
- `SAME_PROBLEM_TWICE` — 同一问题出现两次
- `MAX_ROUNDS` — 达到最大轮数（6轮）
- `INTRODUCED_NEW_PROBLEM` — 引入新问题
- `NO_PROBLEM_FOUND` — 未发现问题

**并行规则**：Attacker 和 Referee 可并行（2 slots），Writer 必须等待两者完成

### 9. 三读者模拟（Three-Reader Simulator）

三个读者角色并行评估文本：

| 读者 | 问题 | 关注点 |
|------|------|--------|
| **Impatient** | "Did this give me a reason to read the next beat?" | 叙事动力和参与度 |
| **Suspicious** | "Did anything confuse me or feel inconsistent?" | 连续性和逻辑一致性 |
| **Visual** | "Can I picture this scene in my mind?" | 感官细节和画面感 |

**结果处理**：
- All YES：保留文本
- All NO：丢弃文本（可配置）
- Mixed：降级或保留

### 10. 知识边界检查（Knowledge Boundary）

验证角色对话是否符合其知识边界：

- **knows** — 角色确认知道的事实
- **suspects** — 角色怀疑但未确认的信息
- **doesNotKnow** — 角色不应该知道的信息

**检测内容**：
- 角色说出不该知道的事实
- 角色将怀疑当作确认事实
- 角色泄露他人的秘密

**技术特性**：
- 词干提取（Stemming）
- 同义词扩展（Synonym Expansion）
- 相似度阈值：0.72

### 11. 场景退出条件（Scene Exit Conditions）

9 种场景退出条件，按优先级排序：

| 条件 | 优先级 | 说明 |
|------|--------|------|
| `mandatory_hook` | 10 | 强制钩子已处理 |
| `human_override` | 10 | 人类作者要求退出 |
| `beat_limit` | 9 | 达到最大 beat 数 |
| `location_change` | 8 | 场景位置变化 |
| `word_limit` | 8 | 达到最大字数 |
| `tension_drop` | 7 | 张力下降超过阈值 |
| `time_skip` | 6 | 时间跳跃超过2小时 |
| `character_exit` | 5 | 角色退出场景 |
| `narrative_saturation` | 4 | 叙事饱和 |

### 12. 叙事代谢（Narrative Metabolism）

监控章节健康度，四种状态：

- **stable** — 健康稳定
- **warming** — 需要关注
- **overheating** — 张力过高，需要冷却
- **cooling** — 张力过低，需要升温

**监控指标**：
- beat 数量、字数、平均张力
- 对话比例、动作比例、内心独白比例
- 角色密度

### 13. 好奇心账本（Curiosity Ledger）

追踪读者好奇心问题的陈旧度：

- **dormant** — 休眠（<3章未提及）
- **warm** — 温热（3-5章未提及）
- **urgent** — 紧急（5-8章未提及）
- **overdue** — 过期（>8章未提及）

**功能**：
- 自动计算问题陈旧度
- 强制引用检查
- 人类覆盖机制

### 14. 叙事漂移检测（Narrative Drift Detector）

每 5 章检测叙事一致性：

**严重度等级**：
- `nominal` — 正常（<15% 偏差）
- `watch` — 关注（15-25% 偏差）
- `alert` — 警告（25-40% 偏差）
- `critical` — 严重（>40% 偏差）

**检测指标**：
- 平均张力、平均字数
- 对话比例、内心独白比例、动作比例

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
├── pipeline/
│   ├── adaptation-orchestrator.ts  # 主编排器，串联所有模块
│   ├── index.ts                    # Pipeline 导出
│   └── FLOW.md                     # 完整流程文档
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
│   ├── cascade-auditor.ts    # 级联审计，5 层验证
│   └── index.ts              # 审计模块导出
├── generation/
│   └── adversarial-refiner.ts  # 对抗精炼循环 (Attacker/Referee/Writer)
├── simulation/
│   └── reader-simulator.ts   # 三读者模拟器
├── character/
│   └── knowledge-boundary.ts # 角色知识边界检查
├── narrative/
│   ├── drift-detector.ts     # 叙事漂移检测器
│   ├── curiosity-ledger.ts   # 好奇心账本
│   └── metabolism.ts         # 叙事代谢
├── scene/
│   └── exit-conditions.ts    # 场景退出条件
├── llm/
│   └── api-constraints.ts    # API 约束，max_tokens 计算
├── integration/
│   ├── hooks.ts              # 适配层钩子
│   ├── beat-orchestrator.ts  # 节拍编排，3 路并行
│   ├── chapter-pipeline.ts   # 章节管线适配
│   └── index.ts              # 集成模块导出
├── types/
│   └── state-types.ts        # 核心状态类型定义
└── index.ts                  # 主导出文件
```

## 与 InkOS 的关系

Monarch 构建于 InkOS 之上，继承了 InkOS 的核心管线和工作流。主要区别在于：

| 特性     | InkOS          | Monarch                           |
| ------ | -------------- | --------------------------------- |
| 定位     | 通用长篇小说写作 Agent | 小模型写作 Agent，专注复杂逻辑处理              |
| 架构     | 多 Agent 协作     | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | 处理逻辑和写作        | 仅负责生成文本，逻辑由 TypeScript 处理         |

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
