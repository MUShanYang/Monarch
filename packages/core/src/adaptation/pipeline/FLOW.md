# Adaptation Pipeline 完整流程

## 概述

这是将CLAUDE.md中所有adaptation模块串联起来的完整write流程。

## 流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Chapter Level (章节级别)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Scene 1   │───>│   Scene 2   │───>│   Scene 3   │───>│    ...      │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                  │                  │                             │
│         └──────────────────┴──────────────────┘                             │
│                            │                                                │
│                    ┌───────▼────────┐                                       │
│                    │ Chapter Summary │                                      │
│                    │  - wordCount    │                                      │
│                    │  - keyEvents    │                                      │
│                    │  - pacing       │                                      │
│                    └───────┬────────┘                                       │
│                            │                                                │
│              ┌─────────────┼─────────────┐                                  │
│              ▼             ▼             ▼                                  │
│    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐             │
│    │ Curiosity Check │ │ Narrative Drift │ │  Metabolism     │             │
│    │  (staleness)    │ │   Detection     │ │    Report       │             │
│    └─────────────────┘ └─────────────────┘ └─────────────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Scene Level (场景级别)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Scene Exit Conditions                            │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │ beat_limit  │ │ word_limit  │ │tension_drop │ │location_ch..│   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │  time_skip  │ │mandatory_h..│ │human_over.. │ │character_e..│   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  │  ┌─────────────┐                                                   │   │
│  │  │narrative_s..│                                                   │   │
│  │  └─────────────┘                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │  Beat 1 │───>│  Beat 2 │───>│  Beat 3 │───>│  Beat 4 │───>│   ...   │  │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘  │
│       │              │              │              │              │       │
│       └──────────────┴──────────────┴──────────────┴──────────────┘       │
│                                    │                                        │
│                           ┌────────▼─────────┐                              │
│                           │ Scene Metabolism │                              │
│                           │  - stable        │                              │
│                           │  - warming       │                              │
│                           │  - overheating   │                              │
│                           │  - cooling       │                              │
│                           └──────────────────┘                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           Beat Level (节拍级别)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 1. BEAT PLANNING (DNA Compiler + Kinetic Scaffold)                   │   │
│  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │    │  who (POV)  │    │where (loc)  │    │mustInclude  │           │   │
│  │    └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │    │mustNotIncl..│    │tensionCtx   │    │hookContext  │           │   │
│  │    └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  │    ┌─────────────┐    ┌─────────────┐                              │   │
│  │    │emotionalCtx │    │spatialCons..│                              │   │
│  │    └─────────────┘    └─────────────┘                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 2. GENERATION                                                        │   │
│  │    - LLM generates initial prose based on DNA                        │   │
│  │    - Temperature: 0.65                                               │   │
│  │    - maxTokens based on beat type                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 3. ADVERSARIAL REFINEMENT LOOP (Writer/Attacker/Referee)             │   │
│  │                                                                     │   │
│  │    ┌─────────┐     ┌─────────┐     ┌─────────┐                     │   │
│  │    │ Attacker│────>│ Referee │────>│ Writer  │                     │   │
│  │    │(find 1  │     │(judge)  │     │(fix)    │                     │   │
│  │    │ problem)│     │         │     │         │                     │   │
│  │    └────┬────┘     └────┬────┘     └────┬────┘                     │   │
│  │         │               │               │                          │   │
│  │         └───────────────┴───────────────┘                          │   │
│  │                         │                                          │   │
│  │              ┌──────────▼──────────┐                               │   │
│  │              │ Exit Conditions:    │                               │   │
│  │              │ - YES_FIXED_TWICE   │                               │   │
│  │              │ - SAME_PROBLEM_TWICE│                               │   │
│  │              │ - MAX_ROUNDS (6)    │                               │   │
│  │              │ - INTRODUCED_NEW_.. │                               │   │
│  │              │ - NO_PROBLEM_FOUND  │                               │   │
│  │              └─────────────────────┘                               │   │
│  │                                                                     │   │
│  │    Parallel: Attacker + Referee (2 slots)                           │   │
│  │    Sequential: Writer (after both complete)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 4. THREE-READER SIMULATION                                           │   │
│  │                                                                     │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │  Impatient  │  │  Suspicious │  │   Visual    │               │   │
│  │    │ "Did this   │  │ "Did anything│  │ "Can I      │               │   │
│  │    │  give me a  │  │  confuse me?"│  │  picture    │               │   │
│  │    │  reason to  │  │              │  │  this?"     │               │   │
│  │    │  read next?"│  │              │  │             │               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │                                                                     │   │
│  │    Parallel: All 3 readers (3 slots)                                │   │
│  │                                                                     │   │
│  │    Results:                                                         │   │
│  │    - All YES: Keep                                                  │   │
│  │    - All NO: Discard (optional)                                     │   │
│  │    - Mixed: Degrade or Keep                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 5. KNOWLEDGE BOUNDARY CHECK                                          │   │
│  │                                                                     │   │
│  │    For each character in dialogue:                                  │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │    knows    │  │   suspects  │  │ doesNotKnow │               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │                                                                     │   │
│  │    Checks:                                                          │   │
│  │    - Character says something they don't know                       │   │
│  │    - Character treats suspicion as confirmed fact                   │   │
│  │    - Character reveals another's secret                             │   │
│  │                                                                     │   │
│  │    Features:                                                        │   │
│  │    - Stemming (词干提取)                                             │   │
│  │    - Synonym expansion (同义词扩展)                                   │   │
│  │    - Similarity threshold: 0.72                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 6. CASCADE AUDITOR (5 Layers)                                        │   │
│  │                                                                     │   │
│  │    Layer 1: Word Count        - Hard range check                     │   │
│  │    Layer 1.5: Proper Noun     - Unknown entity check                 │   │
│  │    Layer 2: DNA Compliance    - mustInclude/mustNotInclude           │   │
│  │    Layer 3: Voice Fingerprint - Style consistency                    │   │
│  │    Layer 4: Continuity        - State consistency                    │   │
│  │    Layer 5: Lexical Monitor   - AI tell words                        │   │
│  │                                                                     │   │
│  │    Exit on first FAIL (unless configured otherwise)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 7. STATE UPDATE (Event Sourcing)                                     │   │
│  │                                                                     │   │
│  │    Extract events from prose:                                       │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │ADD_CHARACTER│  │UPDATE_REL.. │  │MOVE_CHARAC..│               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │UPDATE_SUBP..│  │ACQUIRE_PAR..│  │UPDATE_PHYS..│               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │    │MOTIF_REFER..│  │KNOWLEDGE_G..│  │  CLOSE_HOOK │               │   │
│  │    └─────────────┘  └─────────────┘  └─────────────┘               │   │
│  │                                                                     │   │
│  │    Apply events to EntitiesDb + NarrativeLedger                     │   │
│  │    Generate State Diff per chapter                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 8. SHOW-DON'T-TELL SCALPEL (Post-processing)                         │   │
│  │                                                                     │   │
│  │    Detects: "because X, Y" patterns                                  │   │
│  │    Action: Rewrite as physical manifestation                        │   │
│  │                                                                     │   │
│  │    Example:                                                         │   │
│  │    Before: "Because she was angry, she slammed the door."           │   │
│  │    After:  "She slammed the door."                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PARALLEL CONSTRAINTS (3-Parallel Rule)                               │   │
│  │                                                                     │   │
│  │  Slot 1: Generation / Adversarial Attacker / Reader 1                │   │
│  │  Slot 2: Adversarial Referee / Reader 2                              │   │
│  │  Slot 3: Reader 3 / Other parallel tasks                             │   │
│  │                                                                     │   │
│  │  Sequential: Writer (must wait for Attacker+Referee)                 │   │
│  │  Sequential: State Update (must wait for all above)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 数据流

```
Input: ChapterRequest
  │
  ▼
┌─────────────────┐
│  State Snapshot │ (EntitiesDb + NarrativeLedger + Chronicles)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Beat Planning │ (DNA Compiler + Kinetic Scaffold)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Beat Generation│ (LLM with DNA constraints)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      Adversarial Refinement Loop        │
│  (Attacker finds → Referee judges →     │
│   Writer fixes, up to 6 rounds)         │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      Three-Reader Simulation            │
│  (Impatient + Suspicious + Visual)      │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│Knowledge Boundary│ (Character knowledge check)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cascade Audit  │ (5-layer quality gate)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   State Update  │ (Event Sourcing)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Scene Exit?    │ (Check 9 exit conditions)
└────────┬────────┘
         │
    Yes ─┴─ No
    │       │
    ▼       ▼
Next Scene  Next Beat
    │
    ▼
Chapter Summary
    │
    ▼
Narrative Drift Detection (every 5 chapters)
```

## 模块依赖关系

```
AdaptationPipelineOrchestrator
    │
    ├── BeatPipeline
    │   ├── Planner (DNA Compiler)
    │   ├── RhythmGuard (Kinetic Scaffold)
    │   └── SpeculativeGenerator (3×3 variants)
    │
    ├── AdversarialRefiner
    │   ├── Attacker (find problems)
    │   ├── Referee (judge validity)
    │   └── Writer (fix problems)
    │
    ├── ReaderSimulator
    │   ├── Impatient Reader
    │   ├── Suspicious Reader
    │   └── Visual Reader
    │
    ├── KnowledgeBoundaryChecker
    │   ├── Stemming
    │   ├── Synonym Expansion
    │   └── Cross-character Leak Detection
    │
    ├── CascadeAuditor
    │   ├── Word Count Check
    │   ├── Proper Noun Firewall
    │   ├── DNA Compliance
    │   ├── Voice Fingerprint
    │   ├── Continuity Check
    │   └── Lexical Monitor
    │
    ├── StateManager
    │   ├── EventSourcer
    │   ├── StateDiff
    │   └── MotifIndexer
    │
    ├── SceneExitEvaluator
    │   └── 9 Exit Conditions
    │
    ├── NarrativeMetabolism
    │   └── Chapter Health Metrics
    │
    ├── CuriosityLedger
    │   └── Question Staleness Tracking
    │
    └── DriftDetector
        └── Long-span Consistency Check
```

## 配置选项

```typescript
interface AdaptationPipelineConfig {
  // 功能开关
  enableAdversarialRefinement: boolean;  // 启用对抗精炼
  enableReaderSimulation: boolean;       // 启用读者模拟
  enableKnowledgeBoundary: boolean;      // 启用知识边界

  // 对抗精炼参数
  maxAdversarialRounds: number;          // 最大轮数 (默认6)

  // 读者模拟参数
  requireAllReadersYes: boolean;         // 是否需要所有读者YES
  discardOnAllReadersNo: boolean;        // 全NO时是否丢弃

  // 知识边界参数
  strictKnowledgeBoundary: boolean;      // 严格模式

  // 通用参数
  maxRetriesPerBeat: number;             // 每beat最大重试
}
```

## 退出条件

### Adversarial Refinement Loop 退出
- `YES_FIXED_TWICE`: 连续两次确认修复
- `SAME_PROBLEM_TWICE`: 同一问题出现两次
- `MAX_ROUNDS`: 达到最大轮数
- `INTRODUCED_NEW_PROBLEM`: 引入新问题
- `NO_PROBLEM_FOUND`: 未发现问题

### Scene 退出
- `beat_limit`: 达到最大beat数
- `word_limit`: 达到最大字数
- `tension_drop`: 张力下降超过阈值
- `location_change`: 位置变化
- `time_skip`: 时间跳跃
- `mandatory_hook`: 强制钩子已处理
- `human_override`: 人类作者覆盖
- `character_exit`: 角色退出场景
- `narrative_saturation`: 叙事饱和

### Chapter 退出
- 完成所有场景
- 达到最大场景数
- 人类作者停止
