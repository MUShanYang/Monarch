<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

***

## Overview

**Monarch** is a small-model writing Agent built on [InkOS](https://github.com/Narcooo/inkos), focused on handling complex narrative logic with small models (4B parameters).

> [!WARNING]
> ⚠️ Monarch is currently an early test/development version. Some features may be unstable.

> [!NOTE]
> Monarch shares the same environment configuration with InkOS and requires no separate setup.
>
> For complete features, commands, and usage, please refer to the [InkOS official repository](https://github.com/Narcooo/inkos).

### Core Philosophy

**The model only writes sentences; the system tracks worldbuilding.**

4B-parameter small models cannot handle complex logical reasoning and creative writing simultaneously. Monarch's approach:

- **Pure TypeScript handles all logic**: Motif tracking, emotional arcs, beat planning, consistency auditing
- **LLM only generates text**: Outputs specification-compliant prose under strict API constraints

## Architecture Overview

<p align="center">
  <img src="assets/monarch v2.svg" width="100%" alt="Monarch Architecture">
</p>

### Adaptation Pipeline Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Chapter Level                                                   │
│  ├── Narrative Drift Detector    # Detect drift every 5 chapters│
│  ├── Curiosity Ledger            # Track reader questions        │
│  └── Metabolism Reporter         # Chapter health monitoring     │
├─────────────────────────────────────────────────────────────────┤
│  Scene Level                                                     │
│  ├── Scene Exit Evaluator        # 9 exit conditions            │
│  └── Narrative Metabolism        # Real-time monitoring          │
├─────────────────────────────────────────────────────────────────┤
│  Beat Level - 8-Step Process                                    │
│  ├── 1. Beat Planning            # DNA Compiler + Kinetic       │
│  ├── 2. Generation               # LLM generation                │
│  ├── 3. Adversarial Refinement   # Writer/Attacker/Referee      │
│  ├── 4. Reader Simulation        # Three-reader simulation      │
│  ├── 5. Knowledge Boundary       # Character knowledge check    │
│  ├── 6. Cascade Audit            # 5-layer audit                │
│  ├── 7. State Update             # Event Sourcing               │
│  └── 8. Show-Don't-Tell Scalpel  # Post-processing              │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

### Two Execution Modes

```bash
# Adaptation Mode (default) - Small model with adaptation layer
monarch write next <book-id>

# Full Model Mode - Direct InkOS multi-Agent pipeline
monarch write next <book-id> --no-adaptation
```

| Mode | Description | Use Case |
|------|-------------|----------|
| **Adaptation** | Small model + TypeScript logic | Save tokens, long-term creation |
| **Full Model** | Complete InkOS pipeline | Stronger generation capability |

### Core Workflow

```
User Input
    ↓
Prepare Chapter Input (IntentCompiler compiles story files)
    ↓
Initialize AdaptationHooks (EventSourcer + LexicalMonitor)
    ↓
ChapterPipelineAdapter.generateChapter()
    ├── planBeats() → Beat planning
    └── generateBeat() → Generate beat by beat
        ├── DNA compression (250 token budget)
        ├── 3-way parallel generation (terse/internal/sensory)
        ├── Audit + select best candidate
        └── Event extraction + state update
    ↓
Complete InkOS Pipeline
    ├── Audit + revision
    ├── Generate truth files (ChapterAnalyzerAgent)
    ├── Truth file validation
    └── Persist + snapshot + notification
```

## Key Features

### 1. DNA Compression
Compress full story state into ≤250 tokens of NarrativeDNA:
- `who` - Current scene characters
- `where` - Location description
- `mustInclude` / `mustNotInclude` - Required/forbidden elements
- `motifEcho` - Motif resonance
- `sensoryEcho` - Sensory flashback

### 2. Speculative Generation
Generate 3 semantic variants in parallel, each with 3 syntactic strategies:
- **Variant A**: terse (temp 0.7)
- **Variant B**: internal (temp 0.8)
- **Variant C**: sensory (temp 0.75)

### 3. Cascade Audit
5-layer quality validation:
1. Rule audit - HardBan check
2. Proper noun audit - Spelling consistency
3. Structure audit - Word count and beat type
4. Voice audit - AI tell words
5. Continuity audit - Plot coherence

### 4. Event Sourcing
LLM never directly modifies state files. All state changes through event extraction and application:
- `ADD_CHARACTER`, `UPDATE_RELATIONSHIP`, `MOVE_CHARACTER`
- `UPDATE_SUBPLOT`, `ACQUIRE_PARTICLE`, `KNOWLEDGE_GAIN`
- Generate state diffs, traceable per chapter

## Story File Support

Adaptation layer reads and processes 10+ story file types:
- `story_bible.md` - Story setting
- `style_guide.md` - Style guidelines
- `volume_outline.md` - Volume outline
- `chapter_summaries.md` - Chapter summaries
- `subplot_board.md` - Subplot board
- `emotional_arcs.md` - Emotional arcs
- `character_matrix.md` - Character matrix
- `parent_canon.md` / `fanfic_canon.md` - Original work settings

## RED LINES (Architectural Constraints)

- **NO LLM FOR LOGIC** - All logic must be pure TypeScript
- **MAX 3 PARALLEL CALLS** - Promise.all LLM calls limited to 3
- **EVENT SOURCING ONLY** - LLM never directly modifies state files
- **NO MODIFICATION OF BASE INKOS** - All code in `src/adaptation/` directory

## Directory Structure

```
packages/core/src/adaptation/
├── pipeline/          # Main orchestrator
├── state/             # Event sourcing, intent compilation, motif indexing
├── beat/              # Beat planning, speculative generation
├── context/           # DNA compression
├── audit/             # Cascade audit
├── generation/        # Adversarial refinement loop
├── simulation/        # Three-reader simulator
├── character/         # Knowledge boundary check
├── narrative/         # Drift detection, curiosity ledger, metabolism
├── scene/             # Scene exit conditions
├── llm/               # API constraints
└── integration/       # Hooks, orchestrator, pipeline adapter
```

## Relationship with InkOS

| Feature | InkOS | Monarch |
|---------|-------|---------|
| Positioning | General long-form novel writing Agent | Small model writing Agent |
| Architecture | Multi-Agent collaboration | Adaptation Layer + InkOS Pipeline |
| LLM Usage | Handle logic and writing | Only generate text, logic by TypeScript |

### Environment Configuration

Monarch uses the same environment configuration as InkOS, no additional setup required. Please refer to [InkOS Configuration Guide](https://github.com/Narcooo/inkos#configuration).

## License

[AGPL-3.0](LICENSE)
