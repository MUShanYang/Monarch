<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | English | <a href="README.ja.md">日本語</a>
</p>

---

## Overview

**Monarch** is a small-model writing Agent built on [InkOS](https://github.com/Narcooo/inkos). Focused on handling complex logic such as worldbuilding, characters, and events.

> [!WARNING]
> ⚠️ Monarch is currently an early test/development version. Some features may be unstable. Feedback and suggestions are welcome.

> [!NOTE]
> Monarch shares the same environment configuration with InkOS and requires no separate setup. InkOS installation, configuration commands, and operation methods fully apply to Monarch.
>
> For InkOS's complete features, commands, and usage, please refer to the [InkOS official repository](https://github.com/Narcooo/inkos).

### Core Philosophy

The model only writes sentences; the system tracks worldbuilding.

A 4B-parameter small model lacks sufficient capacity to handle complex logical reasoning and creative writing simultaneously. Monarch's approach is:

- **Pure TypeScript handles all logic**: Motif tracking, emotional arcs, beat planning, consistency auditing
- **LLM only generates text**: Outputs specification-compliant prose under strict API constraints

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Monarch CLI                          │
│                                                         │
│  User Input → Adaptation Layer → InkOS Pipeline → Output│
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

## Write Command Execution Flow

### 1. CLI Entry Point

**File**: `packages/cli/src/commands/write.ts`

When user executes `inkos write next <book-id>`, CLI chooses different Pipeline method based on Adaptation mode:

```typescript
// Lines 54-56
const result = useAdaptation
  ? await pipeline.writeNextChapterWithAdaptation(bookId, { wordCount, maxRetries })
  : await pipeline.writeNextChapter(bookId, wordCount);
```

| Mode | Method | Description |
|------|--------|-------------|
| **Adaptation Mode** (default) | `writeNextChapterWithAdaptation()` | Uses small model adaptation layer, saves tokens |
| **Full Model Mode** | `writeNextChapter()` | Directly calls standard InkOS Pipeline, full model capability |

#### Switching Modes

```bash
# Default: Use Adaptation mode (small model)
monarch write next my-book

# Switch to full model mode
monarch write next my-book --no-adaptation
```

> [!NOTE]
> `--no-adaptation` skips the Adaptation Layer and directly uses the full InkOS multi-Agent pipeline. Suitable for scenarios requiring stronger generation capability but with higher token consumption.

---

### 2. Adaptation Mode Main Flow

**File**: `packages/core/src/pipeline/runner.ts` → `_writeNextChapterWithAdaptationLocked()`

```
┌─────────────────────────────────────────────────────────────┐
│         _writeNextChapterWithAdaptationLocked               │
├─────────────────────────────────────────────────────────────┤
│  1. Initialize AdaptationHooks                               │
│     └── hooks.initialize()                                  │
│         ├── EventSourcer.loadSnapshot() → Load entity state │
│         ├── IntentCompiler.compile() → Compile bible to weights│
│         └── LexicalMonitor.addAiTellWords() → Load AI tell words│
│                                                              │
│  2. Build LLM Interface                                     │
│     └── buildAdaptationLLMInterface()                       │
│         └── Bridge to InkOS LLMProvider                    │
│                                                              │
│  3. Call ChapterPipelineAdapter                             │
│     └── ChapterPipelineAdapter.generateChapter()            │
│         ├── planBeats() → Beat planning                    │
│         └── generateBeat() → Each beat                     │
│                                                              │
│  4. Write chapter file + Update state                      │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. AdaptationHooks Components

**File**: `packages/core/src/adaptation/integration/hooks.ts`

`AdaptationHooks` is the core orchestrator of the Adaptation Layer:

| Component | Class | Responsibility |
|-----------|-------|----------------|
| **EventSourcer** | `event-sourcer.ts` | Event sourcing, entity state snapshot management |
| **IntentCompiler** | `intent-compiler.ts` | Compile bible documents to system weights |
| **LexicalMonitor** | `lexical-monitor.ts` | Lexical monitoring, AI tell detection |
| **RhythmGuard** | `rhythm-guard.ts` | Rhythm guard, prevent consecutive same-type beats |
| **CascadeAuditor** | `cascade-auditor.ts` | 5-layer audit verification |

#### preGenerationBeat Flow

```typescript
async preGenerationBeat(params): Promise<PreGenerationHooksResult> {
  // 1. Rhythm Guard — Check if forced beat type insertion is needed
  const rhythmResult = this.rhythmGuard.guard(params.beatType);
  const effectiveBeatType = rhythmResult.forcedType ?? params.beatType;

  // 2. Get banned words
  const lexicalState = {
    bannedWords: this.lexicalMonitor.getBannedWords(),
    // ...
  };

  // 3. DNA Compression — 250 token budget
  const dnaInput: DnaCompressorInput = {
    snapshot: this.currentSnapshot!,
    intentOutput: this.currentIntent!,  // IntentCompiler output
    lexicalState,
    beatType: effectiveBeatType,
    tensionLevel: params.tensionLevel,
    // ...
  };
  const dnaResult = new DnaCompressor().compress(dnaInput);

  // 4. API constraints calculation
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

### 4. BeatOrchestrator LLM Integration

**File**: `packages/core/src/adaptation/integration/beat-orchestrator.ts`

#### New Interface

```typescript
// LLM Call Interface
export interface BeatOrchestratorLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

// Inject LLM implementation
setLLMInterface(llm: BeatOrchestratorLLMInterface): void;
```

#### executeSpeculativeCalls - Execute 3-way Parallel Generation

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

#### buildSystemPrompt - Build System Prompt

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

  // ... other parts
  parts.push(`Style: ${variant.suffix}`);

  return parts.join("\n");
}
```

| Variant | Style | Temperature |
|---------|-------|-------------|
| **A** | terse | 0.7 |
| **B** | internal | 0.8 |
| **C** | sensory | 0.75 |

---

### 5. ChapterPipelineAdapter LLM Integration

**File**: `packages/core/src/adaptation/integration/chapter-pipeline.ts`

#### New Interface

```typescript
export interface ChapterPipelineLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

setLLMInterface(llm: ChapterPipelineLLMInterface): void;
```

#### generateBeat - Complete Beat Generation Flow

```typescript
async generateBeat(params: {
  beatIndex: number;
  beatType: BeatType;
  tensionLevel: TensionLevel;
  // ...
  isChapterEnd: boolean;
}): Promise<BeatGenerationStep> {
  // 1. preGenerationBeat - DNA compression and API constraint preparation
  const preGen = await this.hooks.preGenerationBeat({...});

  // 2. Build request
  const request: BeatGenerationRequest = {
    beatId: `beat-${params.beatIndex}`,
    beatType: params.beatType,
    dna: preGen.dna,
    kineticScaffold: preGen.kineticScaffold,
    // ...
  };

  // 3. Call BeatOrchestrator to execute 3-way parallel generation
  const candidates = await this.orchestrator.executeSpeculativeCalls(request);

  // 4. Audit and select best candidate
  const selection = this.orchestrator.selectBestCandidate(candidates, preGen.dna);

  // 5. postGenerationBeat - Audit and event extraction
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

### 6. Complete Data Flow

```
monarch write next (default: Adaptation mode)
    │
    ▼
writeNextChapterWithAdaptationLocked
    │
    ├── Initialize AdaptationHooks
    │   ├── IntentCompiler.compile() → HardBan, DnaWeight, FocusMultiplier
    │   ├── EventSourcer.loadSnapshot() → Entity state
    │   └── LexicalMonitor.addAiTellWords() → AI tell words
    │
    ├── Build LLM Interface
    │   └── buildAdaptationLLMInterface() → Bridge to InkOS LLMProvider
    │
    ▼
ChapterPipelineAdapter.generateChapter()
    │
    ├── planBeats() → Beat planning (position preference + rhythm guard)
    │
    └── generateBeat() → Each beat
         │
         ├─ hooks.preGenerationBeat()
         │    └─ DnaCompressor compress state to NarrativeDNA
         │    └─ RhythmGuard generate Kinetic Scaffold
         │
         └─ BeatOrchestrator.executeSpeculativeCalls()
              │
              ├─ 3-way parallel generation (A/B/C semantic variants)
              │    └─ LLM call + API constraints
              │    └─ Show-Don't-Tell Scalpel post-processing
              │
              ├─ hooks.postGenerationBeat()
              │    └─ CascadeAuditor audit
              │    └─ EventSourcer event extraction
              │
              └─ Select best candidate
    │
    ▼
Write chapter file + Update state
```

---

### 7. Current Implementation Status

> [!NOTE]
> **Integrated**:
> - `BeatOrchestratorLLMInterface` — LLM call interface definition
> - `setLLMInterface()` — LLM implementation injection
> - `executeSpeculativeCalls()` — 3-way parallel LLM calls
> - `buildSystemPrompt()` — Integrate motifEcho and sensoryEcho directives
> - `ChapterPipelineAdapter.setLLMInterface()` — LLM interface injection
> - `generateBeat()` — Complete beat-level generation flow
> - `_writeNextChapterWithAdaptationLocked()` — Use ChapterPipelineAdapter instead of original InkOS pipeline

## Workflow

### 1. Intent Compiler

Reads the author's bible document and compiles it into system weights:
- `HardBan` — Absolute prohibited rules
- `DnaWeight` — Weight distribution for each DNA field
- `FocusMultiplier` — Character focus multiplier

### 2. DNA Compressor

Compresses the full story state into a NarrativeDNA within 250 tokens:
- `who` — Character snapshot for the current scene
- `where` — Location description (200 character limit)
- `mustInclude` — Elements that must be included (max 3)
- `mustNotInclude` — Prohibited vocabulary list
- `motifEcho` — Motif echo directives
- `sensoryEcho` — Sensory flashback micro-dose injection

### 3. Beat Planner

Plans each beat's type based on tension and emotional debt:
- **Negative Space Trigger**: Continuous high intensity + emotional debt > 5 → Insert silent beat
- **Dialogue Density Trigger**: 3 consecutive dialogue beats → Insert environmental description
- Auto-inserts Kinetic Scaffold to break 4B model's initialization bias

### 4. Speculative Generator

Generates 3 semantic variants in parallel (terse / internal / sensory):
- Each variant attached with 3 syntactic strategies (parataxis / hypotaxis / nominal)
- 9 candidates total, batched in 3 parallel calls
- Autoregressive preference: Syntax strategy that wins 2 consecutive times auto-locks

### 5. Motif Indexer

Maintains cross-chapter motif index:
- Scans 40+ predefined motifs appearing in text
- Tracks emotional vectors and associated characters for each occurrence
- Auto-calculates arcs: REINFORCE / CONTRAST / TRANSMUTE / DORMANT
- Sensory flashback micro-dose injection: When motif recurs, requires the model to embed a 0.5-second interference at the character's physical level

### 6. Cascade Auditor

Layered verification of generated text:
1. **Rule Audit** — Check if HardBan rules are violated
2. **Proper Noun Audit** — Check character/location name spelling consistency
3. **Structure Audit** — Check word count target and beat type matching
4. **Voice Audit** — Check vocabulary repetition and AI tell words
5. **Continuity Audit** — Check plot coherence with the previous beat

### 7. Post-processing (Show-Don't-Tell Scalpel)

Brutally removes explicit causal expressions:
- `以此掩饰` / `因为他感到` / `仿佛在说` / `试图以此`
- Cleans up resulting extra punctuation (`,。` → `。`)

## API Constraints

Every LLM call must include:
- `max_tokens` — Dynamically calculated based on beat type (action: 180, dialogue: 220, etc.)
- `stop_sequences` — Prevents model from generating content beyond scope
- `temperature` — Differentiated by variant type (A: 0.7, B: 0.8, C: 0.75)
- `frequency_penalty` — 0.3
- `presence_penalty` — 0.2

## Chapter Truncation Fix

Reserves 50 tokens of closing space for the chapter's last beat to prevent content truncation.

```typescript
const CHAPTER_END_RESERVE_TOKENS = 50;

// getApiConstraintsForBeat(beatType, wordTarget, { isChapterEnd: true })
// → maxTokens += CHAPTER_END_RESERVE_TOKENS
```

## RED LINES

- **NO LLM FOR LOGIC** — All logic must be pure TypeScript
- **MAX 3 PARALLEL CALLS** — Promise.all LLM calls must not exceed 3
- **EVENT SOURCING ONLY** — LLM must never directly modify state files
- **NO MODIFICATION OF BASE INKOS** — All code resides in `src/adaptation/` directory

## Directory Structure

```
packages/core/src/adaptation/
├── state/
│   ├── event-sourcer.ts      # Event sourcing, pure TS state mutation
│   ├── intent-compiler.ts    # Intent compilation, bible → SystemWeights
│   ├── motif-indexer.ts      # Motif index, cross-chapter memory
│   └── motif-types.ts        # Motif data structure definition
├── beat/
│   ├── beat-types.ts         # Beat, NarrativeDNA, SensoryEcho
│   ├── planner.ts            # Beat planning, negative space triggers
│   ├── rhythm-guard.ts       # Rhythm guard, Kinetic Scaffolds
│   ├── speculative-generator.ts  # Speculative generation, syntactic variants
│   └── show-dont-tell-scalpel.ts # Explicit causal word removal
├── context/
│   └── dna-compressor.ts     # DNA compression, 250 token budget
├── audit/
│   ├── lexical-monitor.ts    # Lexical monitoring, AI tell detection
│   └── cascade-auditor.ts    # Cascade audit, 5-layer verification
├── llm/
│   └── api-constraints.ts    # API constraints, max_tokens calculation
├── integration/
│   ├── hooks.ts              # Adaptation layer hooks
│   ├── beat-orchestrator.ts  # Beat orchestration, 3-way parallel
│   └── chapter-pipeline.ts   # Chapter pipeline adaptation
└── types/
    └── state-types.ts        # Core state type definitions
```

## Relationship with InkOS

Monarch is built on top of InkOS, inheriting InkOS's core pipeline and workflow. The main differences are:

| Feature | InkOS | Monarch |
|---------|-------|---------|
| Purpose | General-purpose novel writing Agent | Small-model writing Agent, focused on complex logic |
| Architecture | Multi-Agent collaboration | Adaptation Layer + InkOS Pipeline |
| LLM Usage | Handles logic and writing | Only generates text, logic handled by TypeScript |

### Environment Configuration

Monarch uses the same environment configuration method as InkOS. No additional setup is required. Please refer to the [InkOS Configuration Guide](https://github.com/Narcooo/inkos#configure).

### More Features

InkOS provides rich features including but not limited to:
- Multiple interaction modes (TUI / Studio / CLI)
- Continuation of existing works
- Fan fiction creation
- Style cloning
- Multi-model routing
- Daemon mode

For detailed information and usage of these features, please visit the [InkOS official repository](https://github.com/Narcooo/inkos).

## License

[AGPL-3.0](LICENSE)
