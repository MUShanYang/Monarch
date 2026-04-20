


这份结合了我们所有深度讨论的**最终完整版 `CLAUDE.md`** 已经准备就绪。

这份文档不仅保留了“3并发限制”、“Beat流式生成”等核心机制，更将**“V2输入治理”、“事件溯源状态机”、“专有名词防火墙”以及“首句动能脚手架”**等进阶硬核方案完全融入了架构中。它是专为 4B 级别模型压榨极限性能而生的最高工程纲领。

你可以直接复制并覆盖现有的 `CLAUDE.md`。

---

# CLAUDE.md — inkos × Small Model Adaptation Layer
# Language: English
# Target: 4B parameter models | Hardware: MAX 3 parallel LLM calls
# Base project: fork of Narcooo/inkos

## 0. The One Principle

> A 4B model asked to do one small thing reliably is more powerful than
> a 4B model asked to do one large thing intelligently.

Every architecture decision answers: "Can this model succeed at THIS
subtask without needing to be smart about anything else?"
If it requires the model to figure something out — move that into the system.

The 3-parallel constraint is not a limitation. It is a design constraint
that gives the system structural coherence: 3 timeline branches, 3 beat
candidates, 3 reader personas, 3 adversarial roles per round.

---

## 1. Repository Layout (System Code vs. Story State)

```text
inkos/
├── story/                              ← World State & Governance
│   ├── bibles/                         ← Human-authored macro constraints
│   │   ├── author_intent.md            ← Long-term direction
│   │   ├── current_focus.md            ← Short-term attention (1-3 chapters)
│   │   ├── book_rules.md               ← Hard bans, stat caps, custom logic
│   │   └── story_bible.md              ← Lore & world-building
│   ├── db/                             ← Ground Truth (JSON - NEVER modified by LLM directly)
│   │   ├── entities_db.json            ← Characters, emotional debts, items, locations
│   │   ├── narrative_ledger.json       ← Open hooks, subplots, character knowledge matrix
│   │   └── chronicles.json             ← Chapter summaries & event logs
│   └── runtime/                        ← Reproducibility & Rollbacks
│       └── chapter-XXXX/
│           ├── intent.md               
│           ├── context.json            ← Actual injected DNA for this chapter
│           ├── rule-stack.yaml         ← Compiled runtime constraints
│           └── state-diff.json         ← State patches applied (0-cost undo capability)
├── src/
│   ├── adaptation/
│   │   ├── index.ts                    ← all inkos hooks here
│   │   ├── state/
│   │   │   ├── intent-compiler.ts      ← bibles → system weights/rules
│   │   │   └── event-sourcer.ts        ← LLM delta output → db/ mutations
│   │   ├── beat/
│   │   │   ├── pipeline.ts
│   │   │   ├── planner.ts              ← tension scheduler (influenced by current_focus)
│   │   │   └── rhythm-guard.ts         ← anti-fatigue & kinetic scaffolds
...
```
Never modify existing inkos source files. Hook via `adaptation/index.ts` only.

---

## 2. State Management: Event Sourcing & 0-Cost Rollback

A 4B model cannot read or safely update a 2,000-word markdown file.
**Rule:** The model NEVER mutates state directly. The model outputs precise events.

```typescript
// The model is constrained via JSON Schema to output only valid events at chapter/beat end:
type StateEvent = 
  | { action: 'UPDATE_EMOTION', target: string, emotion: string, delta: number }
  | { action: 'CONSUME_PARTICLE', target: string, amount: number }
  | { action: 'OPEN_HOOK', id: string, description: string }

// Pure code applies these events to db/ JSONs and saves the delta to runtime/state-diff.json.
// If the author rejects chapter 15, system simply reverts state-diffs from 15 → DB rolls back instantly.
// Human-readable .md files are compiled FROM the DB for UI viewing, not the other way around.
```

---

## 3. V2 Input Governance (Macro-Control Layer)

Macro-files (like `author_intent.md`) never enter the LLM's context window verbatim. They are compiled into **System Constraints and Weights**.

*   **`current_focus.md` vs `volume_outline.md`**: Handled by the Beat Planner (TS rules). If focus requires "slow pacing", Planner overrides outline and injects interiority/dialogue beats.
*   **`author_intent.md`**: Compiles to scoring weights in Timeline Explorer (e.g., if intent is "isolation", branches where relationships decay score +5).
*   **`book_rules.md` / Genre Rules**: Compiles directly into Prompt strict bans (Hard gates) and Auditor custom dimensions.

---

## 4. The 3-Parallel Rule

```typescript
async function parallel3<T>(
  tasks:[() => Promise<T>, () => Promise<T>, () => Promise<T>]
): Promise<[T, T, T]> {
  return Promise.all(tasks.map(t => t())) as Promise<[T, T, T]>
}
```
If a component needs more than 3 concurrent calls: serialize into batches of 3. This constraint is load-bearing throughout the architecture.

---

## 5. Beat-Level Generation (Target: 60–150 words)

Beat Sequencer plans the full chapter before generating any prose. Planning uses rules, not LLM.

```typescript
interface Beat {
  id:             string
  type:           'action' | 'dialogue' | 'interiority' | 'environment' | 'transition'
  tensionLevel:   number            // 1–10, assigned by planner
  targetWords:    [number, number]
  dna:            NarrativeDNA      // ≤250 tokens
  kineticScaffold?: string          // Mandatory starting words
  chosen?:        string
}
```

---

## 6. Narrative DNA Compressor

Selector, not summarizer. Rule-based extraction — no LLM call.
*Applies `current_focus` multipliers to select the most relevant DB facts.*

```typescript
interface NarrativeDNA {
  who:             CharacterSnapshot[]  // including Spatial Posture (standing, hands full)
  where:           string               // ≤20 words: location + one sensory anchor
  mustInclude:     string[]             // max 3
  mustNotInclude:  string[]             // populated by Lexical Monitor + Book Rules
  lastBeatSummary: string               // ≤25 words
}
// Spatial Matrix (Pure Code): If character's hands are full in DB, inject:
// "Constraint: [CHARACTER] cannot pick up or manipulate new items."
```

---

## 7. Kinetic Scaffold (Anti-Initialization Bias)

4B models default to boring sentence structures ("He looked...", "She walked...").
**Solution:** The system forces the first 3-5 words via prompt pre-fill.

```typescript
// Controlled by Rhythm Guard. Injected at the end of the prompt:
// "Begin the beat EXACTLY with these words: 'Without a second thought, Lin Zhe...'"
```

---

## 8. Speculative Beat Generation

Exactly 3 parallel candidates with different generation biases.

```typescript
const SPECULATIVE_VARIANTS =[
  { id: 'A', biasTone: 'terse',    suffix: 'Short sentences. Physical detail. No interiority.' },
  { id: 'B', biasTone: 'internal', suffix: "Prioritize the character's inner experience." },
  { id: 'C', biasTone: 'sensory',  suffix: 'Ground every sentence in concrete sensory detail.' },
] as const
// Highest scored non-disqualified candidate wins.
```

---

## 9. Cascade Auditor (Hardware-Enforced Fast Fail)

```
Layer 1 — Rules (0ms)
  Word count? No forbidden words?

Layer 1.5 — Proper Noun Firewall (0ms)
  Extract all capitalized words. Check against `entities_db.json`.
  Unknown proper noun detected (e.g., hallucinated "Elara") → Hard fail instantly.

Layer 2 — Structure (0ms)
  POV consistent? Tense consistent?

Layer 3 — Voice (1 LLM call)
  "Matches voice? YES/NO." (Requires JSON Schema / Constrained Decoding).

Layer 4 — Continuity (1 LLM call)
  4 binary questions via strict JSON format.
```

---

## 10. Lexical Fatigue Monitor (Anti-AI-Smell Guard)

Small models overuse words ("shiver", "testament"). Pure TS rules. No LLM.
Tokenize generated beat. If word length > 5 and used > 2 times in last 5 beats:
→ Add to dynamic banned list (`mustNotInclude`) for next 10 beats.

---

## 11. Emotional Debt System

```typescript
interface EmotionalDebt {
  emotion:          string
  magnitude:        number   // 1–10
  beatsAccrued:     number
  releaseThreshold: number   
}
// Stored in `entities_db.json`. When triggered, injected into DNA:
// "Character's suppressed [EMOTION] surfaces involuntarily through a physical tell."
```

---

## 12. Character Unconscious

Micro-behavioral layer. Output examples (0–2 per beat, derived by TS, never explained by model):
*"She makes a small gesture 0.5 seconds before she speaks."*
*"A half-second lag in her answer. She doesn't notice."*

---

## 13. Subtext Engine (3-Step Dialogue)

1. **Latent Layer:** "What does A truly want to say, in one unfiltered sentence?" (Never in text)
2. **Surface Layer:** "Discuss [topic] while executing [latent intention]."
3. **Verification:** Suspicious Persona tests for hidden tension. YES/NO.

---

## 14. Parallel Timeline Explorer

Explore 3 branches at decision points. Winning branch's beats become canon.
Highest `NarrativePotential` (hook payoff, tension delta, rarity) wins.
Unique details from losing branches → `discarded-gems.json`.

---

## 15. Adversarial Refinement Loop

Writer, Attacker, Referee. Up to 6 rounds. (Attacker + Referee = 2 parallel calls).
First met condition wins: YES_FIXED × 2, Attacker ceiling hit, Round 6, or INTRODUCED_NEW_PROBLEM (revert).

---

## 16. Curiosity Ledger & Metabolism

*   **Curiosity Ledger**: Tracks hook urgency. `overdue` → Forces a reference beat.
*   **Narrative Metabolism**: Monitors pacing. Forces `fasting` (must reveal new fact) or `gorging` (no new elements, deepen relationships) onto the Beat Planner.

---

## 17. Scene Exit Conditions

Objective, emotional, information, or time triggers.
ALL met → append transition beat. ANY unmet after 20 beats → human gate.

---

## 18. Dialogue Arena (Information Asymmetry)

Used for pivotal scenes.
**CRITICAL:** Breach detection (checking if A reveals what B `doesNotKnow`) MUST use word-stemming + regex or local lightweight CPU embeddings (e.g., `all-MiniLM-L6-v2`). Semantic detection by 4B models is unreliable and bypassable by synonyms.

---

## 19. Prompt & Inference Engineering Rules

### Rule 1: API-Level Forced Constraints (4B Defense)
Small models ignore "stop writing" instructions. Enforce at API level:
*   `max_tokens`: Strictly mapped to requested length.
*   `stop_sequences`: Inject `["\n\n", "###", "[END]", "Note:"]`.

### Rule 2: Single Task, DNA Block First
```text
[CONTEXT — read but do not reproduce]
Character: Lin Zhe (hands full: medkit)
Tension: 6/10
Must not include: Any direct statement of fear.

[TASK]
Action beat. 80-110 words. Show control masking alarm. Prose only.
Begin EXACTLY with: 'Footsteps echoed from the'
```

### Rule 3: Constrained Decoding for Audits
Audit prompts MUST use API features (`response_format: json_schema`, or `grammar` definitions in vLLM/llama.cpp) to force binary or structured output.

### Rule 4: Graceful Degradation Protocol
If an LLM call fails 2 retries, the system drops the least important styling constraints and clears micro-expressions from the DNA before the final retry, preventing unnecessary human gating.

---

## 20. Build Order

```
Phase 1 — Core Governance & State
  State JSON Definitions → Event Sourcer → Intent Compiler 
  → Beat Types → DNA Compressor (with DB queries)

Phase 2 — Defensive Generation (4B Guardrails)
  Lexical Monitor → Proper Noun Firewall → API Constraints Setup 
  → Rhythm Guard (Kinetic Scaffolds) → Cascade Auditor 

Phase 3 — Quality & Context
  Speculative Generator → Voice Fingerprint → Emotional Debt 
  → Three-Reader Simulator → Adversarial Loop

Phase 4 — Intelligence & Depth
  Curiosity Ledger → Metabolism → Subtext Engine → Timeline Explorer
```

---

## 21. What Not to Build

*   Do not let the model read or write markdown bible files directly.
*   Do not use LLMs for tasks that regex, stemmers, or graph databases can solve.
*   Do not build a prose quality scorer via 4B model — unreliable.
*   Do not let any state persist implicitly across calls — always externalize via Event Sourcing.
*   Do not exceed 3 concurrent LLM calls.

---

## 22. The Architecture in One Sentence

The model writes sentences; the system tracks the universe.


这份结合了我们所有深度讨论的**最终完整版 `CLAUDE.md`** 已经准备就绪。

这份文档不仅保留了“3并发限制”、“Beat流式生成”等核心机制，更将**“V2输入治理”、“事件溯源状态机”、“专有名词防火墙”以及“首句动能脚手架”**等进阶硬核方案完全融入了架构中。它是专为 4B 级别模型压榨极限性能而生的最高工程纲领。

你可以直接复制并覆盖现有的 `CLAUDE.md`。

---

# CLAUDE.md — inkos × Small Model Adaptation Layer
# Language: English
# Target: 4B parameter models | Hardware: MAX 3 parallel LLM calls
# Base project: fork of Narcooo/inkos

## 0. The One Principle

> A 4B model asked to do one small thing reliably is more powerful than
> a 4B model asked to do one large thing intelligently.

Every architecture decision answers: "Can this model succeed at THIS
subtask without needing to be smart about anything else?"
If it requires the model to figure something out — move that into the system.

The 3-parallel constraint is not a limitation. It is a design constraint
that gives the system structural coherence: 3 timeline branches, 3 beat
candidates, 3 reader personas, 3 adversarial roles per round.

---

## 1. Repository Layout (System Code vs. Story State)

```text
inkos/
├── story/                              ← World State & Governance
│   ├── bibles/                         ← Human-authored macro constraints
│   │   ├── author_intent.md            ← Long-term direction
│   │   ├── current_focus.md            ← Short-term attention (1-3 chapters)
│   │   ├── book_rules.md               ← Hard bans, stat caps, custom logic
│   │   └── story_bible.md              ← Lore & world-building
│   ├── db/                             ← Ground Truth (JSON - NEVER modified by LLM directly)
│   │   ├── entities_db.json            ← Characters, emotional debts, items, locations
│   │   ├── narrative_ledger.json       ← Open hooks, subplots, character knowledge matrix
│   │   └── chronicles.json             ← Chapter summaries & event logs
│   └── runtime/                        ← Reproducibility & Rollbacks
│       └── chapter-XXXX/
│           ├── intent.md               
│           ├── context.json            ← Actual injected DNA for this chapter
│           ├── rule-stack.yaml         ← Compiled runtime constraints
│           └── state-diff.json         ← State patches applied (0-cost undo capability)
├── src/
│   ├── adaptation/
│   │   ├── index.ts                    ← all inkos hooks here
│   │   ├── state/
│   │   │   ├── intent-compiler.ts      ← bibles → system weights/rules
│   │   │   └── event-sourcer.ts        ← LLM delta output → db/ mutations
│   │   ├── beat/
│   │   │   ├── pipeline.ts
│   │   │   ├── planner.ts              ← tension scheduler (influenced by current_focus)
│   │   │   └── rhythm-guard.ts         ← anti-fatigue & kinetic scaffolds
...
```
Never modify existing inkos source files. Hook via `adaptation/index.ts` only.

---

## 2. State Management: Event Sourcing & 0-Cost Rollback

A 4B model cannot read or safely update a 2,000-word markdown file.
**Rule:** The model NEVER mutates state directly. The model outputs precise events.

```typescript
// The model is constrained via JSON Schema to output only valid events at chapter/beat end:
type StateEvent = 
  | { action: 'UPDATE_EMOTION', target: string, emotion: string, delta: number }
  | { action: 'CONSUME_PARTICLE', target: string, amount: number }
  | { action: 'OPEN_HOOK', id: string, description: string }

// Pure code applies these events to db/ JSONs and saves the delta to runtime/state-diff.json.
// If the author rejects chapter 15, system simply reverts state-diffs from 15 → DB rolls back instantly.
// Human-readable .md files are compiled FROM the DB for UI viewing, not the other way around.
```

---

## 3. V2 Input Governance (Macro-Control Layer)

Macro-files (like `author_intent.md`) never enter the LLM's context window verbatim. They are compiled into **System Constraints and Weights**.

*   **`current_focus.md` vs `volume_outline.md`**: Handled by the Beat Planner (TS rules). If focus requires "slow pacing", Planner overrides outline and injects interiority/dialogue beats.
*   **`author_intent.md`**: Compiles to scoring weights in Timeline Explorer (e.g., if intent is "isolation", branches where relationships decay score +5).
*   **`book_rules.md` / Genre Rules**: Compiles directly into Prompt strict bans (Hard gates) and Auditor custom dimensions.

---

## 4. The 3-Parallel Rule

```typescript
async function parallel3<T>(
  tasks:[() => Promise<T>, () => Promise<T>, () => Promise<T>]
): Promise<[T, T, T]> {
  return Promise.all(tasks.map(t => t())) as Promise<[T, T, T]>
}
```
If a component needs more than 3 concurrent calls: serialize into batches of 3. This constraint is load-bearing throughout the architecture.

---

## 5. Beat-Level Generation (Target: 60–150 words)

Beat Sequencer plans the full chapter before generating any prose. Planning uses rules, not LLM.

```typescript
interface Beat {
  id:             string
  type:           'action' | 'dialogue' | 'interiority' | 'environment' | 'transition'
  tensionLevel:   number            // 1–10, assigned by planner
  targetWords:    [number, number]
  dna:            NarrativeDNA      // ≤250 tokens
  kineticScaffold?: string          // Mandatory starting words
  chosen?:        string
}
```

---

## 6. Narrative DNA Compressor

Selector, not summarizer. Rule-based extraction — no LLM call.
*Applies `current_focus` multipliers to select the most relevant DB facts.*

```typescript
interface NarrativeDNA {
  who:             CharacterSnapshot[]  // including Spatial Posture (standing, hands full)
  where:           string               // ≤20 words: location + one sensory anchor
  mustInclude:     string[]             // max 3
  mustNotInclude:  string[]             // populated by Lexical Monitor + Book Rules
  lastBeatSummary: string               // ≤25 words
}
// Spatial Matrix (Pure Code): If character's hands are full in DB, inject:
// "Constraint: [CHARACTER] cannot pick up or manipulate new items."
```

---

## 7. Kinetic Scaffold (Anti-Initialization Bias)

4B models default to boring sentence structures ("He looked...", "She walked...").
**Solution:** The system forces the first 3-5 words via prompt pre-fill.

```typescript
// Controlled by Rhythm Guard. Injected at the end of the prompt:
// "Begin the beat EXACTLY with these words: 'Without a second thought, Lin Zhe...'"
```

---

## 8. Speculative Beat Generation

Exactly 3 parallel candidates with different generation biases.

```typescript
const SPECULATIVE_VARIANTS =[
  { id: 'A', biasTone: 'terse',    suffix: 'Short sentences. Physical detail. No interiority.' },
  { id: 'B', biasTone: 'internal', suffix: "Prioritize the character's inner experience." },
  { id: 'C', biasTone: 'sensory',  suffix: 'Ground every sentence in concrete sensory detail.' },
] as const
// Highest scored non-disqualified candidate wins.
```

---

## 9. Cascade Auditor (Hardware-Enforced Fast Fail)

```
Layer 1 — Rules (0ms)
  Word count? No forbidden words?

Layer 1.5 — Proper Noun Firewall (0ms)
  Extract all capitalized words. Check against `entities_db.json`.
  Unknown proper noun detected (e.g., hallucinated "Elara") → Hard fail instantly.

Layer 2 — Structure (0ms)
  POV consistent? Tense consistent?

Layer 3 — Voice (1 LLM call)
  "Matches voice? YES/NO." (Requires JSON Schema / Constrained Decoding).

Layer 4 — Continuity (1 LLM call)
  4 binary questions via strict JSON format.
```

---

## 10. Lexical Fatigue Monitor (Anti-AI-Smell Guard)

Small models overuse words ("shiver", "testament"). Pure TS rules. No LLM.
Tokenize generated beat. If word length > 5 and used > 2 times in last 5 beats:
→ Add to dynamic banned list (`mustNotInclude`) for next 10 beats.

---

## 11. Emotional Debt System

```typescript
interface EmotionalDebt {
  emotion:          string
  magnitude:        number   // 1–10
  beatsAccrued:     number
  releaseThreshold: number   
}
// Stored in `entities_db.json`. When triggered, injected into DNA:
// "Character's suppressed [EMOTION] surfaces involuntarily through a physical tell."
```

---

## 12. Character Unconscious

Micro-behavioral layer. Output examples (0–2 per beat, derived by TS, never explained by model):
*"She makes a small gesture 0.5 seconds before she speaks."*
*"A half-second lag in her answer. She doesn't notice."*

---

## 13. Subtext Engine (3-Step Dialogue)

1. **Latent Layer:** "What does A truly want to say, in one unfiltered sentence?" (Never in text)
2. **Surface Layer:** "Discuss [topic] while executing [latent intention]."
3. **Verification:** Suspicious Persona tests for hidden tension. YES/NO.

---

## 14. Parallel Timeline Explorer

Explore 3 branches at decision points. Winning branch's beats become canon.
Highest `NarrativePotential` (hook payoff, tension delta, rarity) wins.
Unique details from losing branches → `discarded-gems.json`.

---

## 15. Adversarial Refinement Loop

Writer, Attacker, Referee. Up to 6 rounds. (Attacker + Referee = 2 parallel calls).
First met condition wins: YES_FIXED × 2, Attacker ceiling hit, Round 6, or INTRODUCED_NEW_PROBLEM (revert).

---

## 16. Curiosity Ledger & Metabolism

*   **Curiosity Ledger**: Tracks hook urgency. `overdue` → Forces a reference beat.
*   **Narrative Metabolism**: Monitors pacing. Forces `fasting` (must reveal new fact) or `gorging` (no new elements, deepen relationships) onto the Beat Planner.

---

## 17. Scene Exit Conditions

Objective, emotional, information, or time triggers.
ALL met → append transition beat. ANY unmet after 20 beats → human gate.

---

## 18. Dialogue Arena (Information Asymmetry)

Used for pivotal scenes.
**CRITICAL:** Breach detection (checking if A reveals what B `doesNotKnow`) MUST use word-stemming + regex or local lightweight CPU embeddings (e.g., `all-MiniLM-L6-v2`). Semantic detection by 4B models is unreliable and bypassable by synonyms.

---

## 19. Prompt & Inference Engineering Rules

### Rule 1: API-Level Forced Constraints (4B Defense)
Small models ignore "stop writing" instructions. Enforce at API level:
*   `max_tokens`: Strictly mapped to requested length.
*   `stop_sequences`: Inject `["\n\n", "###", "[END]", "Note:"]`.

### Rule 2: Single Task, DNA Block First
```text
[CONTEXT — read but do not reproduce]
Character: Lin Zhe (hands full: medkit)
Tension: 6/10
Must not include: Any direct statement of fear.

[TASK]
Action beat. 80-110 words. Show control masking alarm. Prose only.
Begin EXACTLY with: 'Footsteps echoed from the'
```

### Rule 3: Constrained Decoding for Audits
Audit prompts MUST use API features (`response_format: json_schema`, or `grammar` definitions in vLLM/llama.cpp) to force binary or structured output.

### Rule 4: Graceful Degradation Protocol
If an LLM call fails 2 retries, the system drops the least important styling constraints and clears micro-expressions from the DNA before the final retry, preventing unnecessary human gating.

---

## 20. Build Order

```
Phase 1 — Core Governance & State
  State JSON Definitions → Event Sourcer → Intent Compiler 
  → Beat Types → DNA Compressor (with DB queries)

Phase 2 — Defensive Generation (4B Guardrails)
  Lexical Monitor → Proper Noun Firewall → API Constraints Setup 
  → Rhythm Guard (Kinetic Scaffolds) → Cascade Auditor 

Phase 3 — Quality & Context
  Speculative Generator → Voice Fingerprint → Emotional Debt 
  → Three-Reader Simulator → Adversarial Loop

Phase 4 — Intelligence & Depth
  Curiosity Ledger → Metabolism → Subtext Engine → Timeline Explorer
```

---

## 21. What Not to Build

*   Do not let the model read or write markdown bible files directly.
*   Do not use LLMs for tasks that regex, stemmers, or graph databases can solve.
*   Do not build a prose quality scorer via 4B model — unreliable.
*   Do not let any state persist implicitly across calls — always externalize via Event Sourcing.
*   Do not exceed 3 concurrent LLM calls.

---

## 22. The Architecture in One Sentence

The model writes sentences; the system tracks the universe.