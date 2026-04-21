# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Monarch** is a small-model writing agent built on InkOS, designed to handle complex narrative logic (worldbuilding, characters, events) using pure TypeScript while delegating only text generation to small LLMs (4B parameters).

**Core Philosophy**: "Model only writes sentences, system tracks worldview."

4B parameter models lack capacity for simultaneous complex reasoning and creative writing. Monarch's approach:
- **Pure TypeScript handles all logic**: motif tracking, emotional arcs, beat planning, consistency auditing
- **LLM only generates text**: outputs prose under strict API constraints

## Monorepo Structure

This is a pnpm workspace with three packages:

- **packages/cli** - Command-line interface (`@actalk/monarch`)
- **packages/core** - Core engine with adaptation layer (`@actalk/monarch-core`)
- **packages/studio** - Studio interface (`@actalk/monarch-studio`)

## Build Commands

**Requirements**: Node >= 20.0.0, pnpm >= 9.0.0

```bash
# Build all packages
pnpm build

# Development mode (watch)
pnpm dev

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Full release build
pnpm release
```

Individual package commands:
```bash
# Build specific package
cd packages/core && pnpm build

# Run tests in specific package
cd packages/core && pnpm test

# Run single test file
cd packages/core && pnpm vitest run <test-file-name>

# Watch mode for specific package
cd packages/cli && pnpm dev

# Watch mode for tests
cd packages/core && pnpm vitest
```

## Two Execution Modes

The write command supports two modes:

### 1. Adaptation Mode (Default)
Uses small models with the adaptation layer. All complex logic handled by TypeScript.

```bash
monarch write next <book-id>
```

**Pipeline**: User Input → AdaptationHooks → ChapterPipelineAdapter → BeatOrchestrator → InkOS Pipeline

### 2. Full Model Mode
Bypasses adaptation layer, uses complete InkOS multi-agent pipeline with full model capabilities.

```bash
monarch write next <book-id> --no-adaptation
```

**Pipeline**: User Input → InkOS Pipeline (direct)

Use full model mode when you need stronger generation capabilities but accept higher token consumption.

## Adaptation Pipeline Architecture

The adaptation layer is organized into three levels:

### Chapter Level
- **Narrative Drift Detector**: Every 5 chapters, checks consistency (tension, pacing, dialogue ratio)
- **Curiosity Ledger**: Tracks reader questions and staleness (dormant/warm/urgent/overdue)
- **Metabolism Reporter**: Chapter health monitoring (stable/warming/overheating/cooling)
- **Emotional Debt Analysis**: Tracks unresolved emotional threads and payoff timing
- **Unconscious Analysis**: Detects implicit patterns and subconscious narrative elements
- **Timeline Analysis**: Validates temporal consistency and detects timeline conflicts

### Scene Level
- **Scene Exit Evaluator**: 9 exit conditions (beat_limit, word_limit, tension_drop, location_change, time_skip, mandatory_hook, human_override, character_exit, narrative_saturation)
- **Narrative Metabolism**: Real-time scene health metrics

### Beat Level (11-step process)
1. **Beat Planning**: DNA Compiler + Kinetic Scaffold
2. **Generation**: LLM generates initial prose with DNA constraints
3. **Adversarial Refinement**: Writer/Attacker/Referee loop (max 6 rounds)
4. **Reader Simulation**: Three readers (Impatient/Suspicious/Visual) evaluate in parallel
5. **Knowledge Boundary**: Validates character dialogue against knowledge state
6. **Subtext Analysis**: Detects and validates implicit meaning layers
7. **Voice Fingerprint**: Ensures character voice consistency
8. **Dialogue Validation**: Validates dialogue against character knowledge and voice
9. **Cascade Audit**: 5-layer quality gate (word count, proper nouns, DNA compliance, voice, continuity, lexical)
10. **State Update**: Event sourcing - extract events and apply to state
11. **Show-Don't-Tell Scalpel**: Post-processing to remove explicit causation

See `packages/core/src/adaptation/pipeline/FLOW.md` for complete flow diagrams.

## RED LINES (Critical Constraints)

These are architectural invariants that MUST NOT be violated:

1. **NO LLM FOR LOGIC** - All logic must be pure TypeScript. LLM only generates prose.
2. **MAX 3 PARALLEL CALLS** - `Promise.all` with LLM calls must not exceed 3 concurrent requests.
3. **EVENT SOURCING ONLY** - LLM never directly modifies state files. All state changes via event extraction and application.
4. **NO MODIFICATION OF BASE INKOS** - All adaptation code lives in `packages/core/src/adaptation/`. Do not modify InkOS core files.

## Directory Organization

```
packages/core/src/adaptation/
├── pipeline/          # Main orchestrator
├── state/             # Event sourcing, intent compilation, motif indexing
├── beat/              # Beat planning, rhythm guard, speculative generation
├── context/           # DNA compression (250 token budget)
├── audit/             # Lexical monitoring, cascade auditor
├── generation/        # Adversarial refinement loop
├── simulation/        # Three-reader simulator
├── character/         # Knowledge boundary checker, voice fingerprint, dialogue validation
├── narrative/         # Drift detection, curiosity ledger, metabolism, emotional debt, unconscious analysis, timeline analysis
├── scene/             # Scene exit conditions, subtext analysis
├── llm/               # API constraints, token calculations
├── integration/       # Hooks, beat orchestrator, chapter pipeline adapter
└── types/             # Core state type definitions
```

**Principle**: Organize by domain concern, not by technical layer. Each directory contains related functionality for a specific aspect of the adaptation system.

## Story File System

The adaptation layer reads and processes 10+ story file types:

- `story_bible.md` - Story setting and rules
- `style_guide.md` - Writing style guidelines
- `volume_outline.md` - Volume-level planning
- `chapter_summaries.md` - Chapter summaries (used for continuity)
- `subplot_board.md` - Subplot tracking
- `emotional_arcs.md` - Character emotional arcs
- `character_matrix.md` - Character relationships
- `parent_canon.md` / `fanfic_canon.md` - Canon for fanfiction

**IntentCompiler** (`packages/core/src/adaptation/state/intent-compiler.ts`) compiles these files into system weights:
- `HardBan` - Absolute prohibitions
- `DnaWeight` - DNA field weight allocation
- `FocusMultiplier` - Character focus multipliers
- Chapter continuity from recent 3 chapters

## Key Architectural Patterns

### DNA Compression
**DnaCompressor** (`packages/core/src/adaptation/context/dna-compressor.ts`) compresses full story state into ≤250 tokens of NarrativeDNA:
- `who` - Current scene characters
- `where` - Location (200 char limit)
- `mustInclude` - Required elements (max 3)
- `mustNotInclude` - Banned words
- `motifEcho` - Motif resonance instructions
- `sensoryEcho` - Sensory flashback micro-dosing

### Event Sourcing
**EventSourcer** (`packages/core/src/adaptation/state/event-sourcer.ts`) manages state through events:
- Extracts events from generated prose (ADD_CHARACTER, UPDATE_RELATIONSHIP, MOVE_CHARACTER, etc.)
- Applies events to EntitiesDb + NarrativeLedger
- Generates state diffs per chapter
- Never allows LLM to directly modify state

### Speculative Generation
**SpeculativeGenerator** (`packages/core/src/adaptation/beat/speculative-generator.ts`) generates 3 semantic variants in parallel:
- Variant A: terse (temp 0.7)
- Variant B: internal (temp 0.8)
- Variant C: sensory (temp 0.75)

Each variant uses different syntactic strategies (parataxis/hypotaxis/nominal). Best candidate selected via cascade audit.

### API Constraints
**api-constraints.ts** (`packages/core/src/adaptation/llm/api-constraints.ts`) enforces strict LLM call parameters:
- `max_tokens` - Dynamic calculation based on beat type (action: 180, dialogue: 220, etc.)
- `stop_sequences` - Prevents out-of-scope generation
- `temperature` - Variant-specific
- `frequency_penalty` - 0.3
- `presence_penalty` - 0.2

Chapter-end beats get +50 token reserve to prevent truncation.

## Integration with InkOS

Monarch extends InkOS by adding an adaptation layer that preprocesses and postprocesses around the InkOS pipeline:

**Flow**: AdaptationHooks.initialize() → ChapterPipelineAdapter.generateChapter() → (beat-level adaptation) → InkOS Pipeline (review, truth files, validation, persistence)

The adaptation layer:
1. Compiles story files into system weights
2. Compresses state into DNA
3. Generates beats with strict constraints
4. Audits and refines output
5. Extracts events for state updates

Then hands off to InkOS for:
1. Chapter review cycle (ContinuityAuditor + ReviserAgent)
2. Truth file generation (ChapterAnalyzerAgent)
3. Truth file validation (StateValidatorAgent)
4. Artifact persistence (snapshots, notifications)

**Key Integration Points**:
- `packages/core/src/pipeline/runner.ts` - `_writeNextChapterWithAdaptationLocked()`
- `packages/core/src/adaptation/integration/hooks.ts` - AdaptationHooks
- `packages/core/src/adaptation/integration/chapter-pipeline.ts` - ChapterPipelineAdapter
- `packages/core/src/adaptation/integration/beat-orchestrator.ts` - BeatOrchestrator

## Testing

Tests use vitest and are located in `__tests__` directories:

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd packages/core && pnpm test

# Watch mode
cd packages/core && vitest
```

Test files follow naming convention: `<module-name>.test.ts`

Key test coverage areas:
- API constraints and token calculations
- Beat orchestration and speculative generation
- Cascade auditor and quality gates
- Chapter pipeline integration
- Graceful degradation handling
- Physical constraints validation
- Proper noun firewall
- Pipeline runner integration

## Common Development Tasks

### Adding a New Adaptation Module

1. Create module in appropriate `packages/core/src/adaptation/<domain>/` directory
2. Define types in `types/` if needed
3. Export from domain `index.ts`
4. Integrate into orchestrator or hooks
5. Add tests in `__tests__/`
6. Respect RED LINES (no LLM for logic, max 3 parallel calls, event sourcing only)

### Modifying Beat Generation Flow

The beat generation flow is in `packages/core/src/adaptation/integration/chapter-pipeline.ts`:

1. `preGenerationBeat()` - DNA compression, API constraints
2. `BeatOrchestrator.executeSpeculativeCalls()` - 3-way parallel generation
3. `selectBestCandidate()` - Audit and selection
4. `postGenerationBeat()` - Subtext analysis, voice fingerprint, dialogue validation, cascade audit, event extraction

Modifications should maintain the 11-step beat pipeline structure.

### Debugging Adaptation Issues

Key files to check:
- `packages/core/src/adaptation/integration/hooks.ts` - Hook initialization and lifecycle
- `packages/core/src/adaptation/context/dna-compressor.ts` - DNA compression logic
- `packages/core/src/adaptation/audit/cascade-auditor.ts` - Quality gates
- `packages/core/src/adaptation/state/event-sourcer.ts` - State management
- `packages/core/src/adaptation/character/voice-fingerprint.ts` - Voice consistency
- `packages/core/src/adaptation/narrative/emotional-debt.ts` - Emotional thread tracking
- `packages/core/src/adaptation/narrative/timeline-analyzer.ts` - Timeline validation

Enable debug logging by checking InkOS configuration (Monarch shares InkOS environment setup).

## Environment Configuration

Monarch uses the same environment configuration as InkOS. No separate configuration needed.

For InkOS configuration details, see: https://github.com/Narcooo/inkos

## License

AGPL-3.0-only
