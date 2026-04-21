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

## Architecture Overview

![Adaptation Pipeline](assets/adaptation-pipeline.svg)

### Adaptation Pipeline Three-Layer Architecture

```
Chapter Level
  ├─ Drift Detector (detect drift every 5 chapters)
  ├─ Curiosity Ledger (track reader questions)
  ├─ Metabolism Reporter (chapter health)
  ├─ Emotional Debt Analysis (emotional debts)
  ├─ Unconscious Analysis (unconscious content)
  └─ Timeline Analysis (timeline conflicts)

Scene Level
  ├─ Scene Exit Evaluator (9 exit conditions)
  └─ Narrative Metabolism (real-time monitoring)

Beat Level - 11-Step Process
  1. Beat Planning (DNA compression ≤250 tokens)
  2. Generation (LLM generation)
  3. Adversarial Refinement (max 6 rounds)
  4. Reader Simulation (three readers)
  5. Knowledge Boundary (knowledge check)
  6. Subtext Analysis (subtext detection)
  7. Voice Fingerprint (voice consistency)
  8. Dialogue Validation (dialogue validation)
  9. Cascade Audit (5-layer quality gate)
  10. State Update (event sourcing)
  11. Show-Don't-Tell Scalpel (post-processing)
```

### Key Features

**DNA Compression**: Compress full story state into ≤250 tokens
- `who` / `where` / `mustInclude` / `mustNotInclude` / `motifEcho` / `sensoryEcho`

**Speculative Generation**: 3 semantic variants × 3 syntactic strategies in parallel

**Cascade Audit**: 5-layer quality validation (word count / proper nouns / DNA compliance / voice / continuity)

**Event Sourcing**: LLM never directly modifies state, all changes through event application

**Parallel Constraint**: Max 3 concurrent LLM calls

## Relationship with InkOS

| Feature | InkOS | Monarch |
|---------|-------|---------|
| Positioning | General long-form novel writing Agent | Small model writing Agent |
| Architecture | Multi-Agent collaboration | Adaptation Layer + InkOS Pipeline |
| LLM Usage | Handle logic and writing | Only generate text, logic by TypeScript |

Monarch uses the same environment configuration as InkOS, no additional setup required. Please refer to [InkOS Configuration Guide](https://github.com/Narcooo/inkos#configuration).

## License

[AGPL-3.0](LICENSE)
