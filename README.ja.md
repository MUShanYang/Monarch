<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>


---

## 概要

**Monarch** は [InkOS](https://github.com/Narcooo/inkos) を基盤に構築された小モデル執筆 Agentです。世界観、キャラクター、出来事などの複雑なロジック処理に特化しています。

> [!WARNING]
> ⚠️ Monarch は現在早期テスト開発バージョンです。一部の機能はまだ不安定な可能性があります。フィードバックやご提案を歓迎します。
>
> ⚠️ 現在可用性の検証中で、本番環境での使用はおすすめしません。

> [!NOTE]
> Monarch は InkOS と同一の環境設定を共有しており、別途設定は不要です。InkOS のインストール、設定コマンド、操作方法は Monarch に完全に適用されます。
>
> InkOS の完全な機能、コマンド、使用方法については、[InkOS 公式レポジトリ](https://github.com/Narcooo/inkos) を参照してください。

### コアフィロソフィー

モデルは文の執筆のみを担当し、システムが世界観を追跡する。

4Bパラメータの小モデルは、複雑な論理的推論と創造的執筆を同時に処理する能力を持ちません。Monarch のアプローチは：

- **ロジックは全てPure TypeScriptで処理**：モティーフ追跡、感情弧、ビート計画、一貫性監査
- **LLMはテキスト生成のみを担当**：厳密なAPI制約の下で仕様に準拠した散文を出力

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────┐
│                    Monarch CLI                          │
│                                                         │
│  ユーザー入力 → Adaptation Layer → InkOS Pipeline → 出力  │
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

## Write コマンド実行フロー

### 1. CLI エントリポイント

**ファイル**: `packages/cli/src/commands/write.ts`

ユーザーが `inkos write next <book-id>` を実行すると、CLI は Adaptation モード是否に応じて異なる Pipeline メソッドを選択：

```typescript
// 54-56行目
const result = useAdaptation
  ? await pipeline.writeNextChapterWithAdaptation(bookId, { wordCount, maxRetries })
  : await pipeline.writeNextChapter(bookId, wordCount);
```

| モード | メソッド | 説明 |
|--------|----------|------|
| **Adaptation モード**（デフォルト） | `writeNextChapterWithAdaptation()` | 小モデル適応レイヤを使用、tokenを節約 |
| **完整モデルモード** | `writeNextChapter()` | 標準 InkOS Pipeline を直接呼び出し、完整モデル能力を使用 |

#### モードの切り替え

```bash
# デフォルト：Adaptation モード（小モデル）
monarch write next my-book

# 完整モデルモードに切り替え
monarch write next my-book --no-adaptation  
```

> [!NOTE]
> `--no-adaptation` は Adaptation Layer をスキップし、標準 InkOS マルチエージェントパイプラインを直接使用します。より強力な生成能力を必要とするが token 消費は高くなるシナリオに適しています。

---

### 2. Adaptation モードメインフロー

**ファイル**: `packages/core/src/pipeline/runner.ts` → `_writeNextChapterWithAdaptationLocked()`

```
┌─────────────────────────────────────────────────────────────┐
│         _writeNextChapterWithAdaptationLocked               │
├─────────────────────────────────────────────────────────────┤
│  1. AdaptationHooks の初期化                               │
│     └── hooks.initialize()                                  │
│         ├── EventSourcer.loadSnapshot() → エンティティ状態LOAD│
│         ├── IntentCompiler.compile() → bible を重みにコンパイル│
│         └── LexicalMonitor.addAiTellWords() → AI口말語LOAD │
│                                                              │
│  2. 標準 InkOS Pipeline の実行                             │
│     └── _writeNextChapterLocked()                           │
│         ├── prepareWriteInput() → 章入力を準備               │
│         ├── Writer.writeChapter() → 草稿生成                 │
│         └── runChapterReviewCycle() → 監査+修正ループ       │
│                                                              │
│  3. Adaptation Layer 監査                                  │
│     └── CascadeAuditor.audit() → 最終監査                   │
│                                                              │
│  4. 状態の保存                                             │
│     └── hooks.saveState() → スナップショットの永続化         │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. AdaptationHooks コンポーネント詳解

**ファイル**: `packages/core/src/adaptation/integration/hooks.ts`

`AdaptationHooks` は Adaptation Layer のコアオーケストレータです：

| コンポーネント | クラス | 責務 |
|----------------|--------|------|
| **EventSourcer** | `event-sourcer.ts` | イベント溯源、エンティティ状態スナップショット管理 |
| **IntentCompiler** | `intent-compiler.ts` | bible ドキュメントをシステム重みにコンパイル |
| **LexicalMonitor** | `lexical-monitor.ts` | 語彙モニタリング、AI口말検出 |
| **RhythmGuard** | `rhythm-guard.ts` | リズム守卫、連続同タイプビートの防止 |
| **CascadeAuditor** | `cascade-auditor.ts` | 5層監査検証 |

#### preGenerationBeat フロー

```typescript
async preGenerationBeat(params): Promise<PreGenerationHooksResult> {
  // 1. リズム守卫 — 強制ビートタイプ挿入が必要かチェック
  const rhythmResult = this.rhythmGuard.guard(params.beatType);
  const effectiveBeatType = rhythmResult.forcedType ?? params.beatType;

  // 2. 禁止語の取得
  const lexicalState = {
    bannedWords: this.lexicalMonitor.getBannedWords(),
    // ...
  };

  // 3. DNA 圧縮 — 250トークンバジェット
  const dnaInput: DnaCompressorInput = {
    snapshot: this.currentSnapshot!,
    intentOutput: this.currentIntent!,  // IntentCompiler 出力
    lexicalState,
    beatType: effectiveBeatType,
    tensionLevel: params.tensionLevel,
    // ...
  };
  const dnaResult = new DnaCompressor().compress(dnaInput);

  // 4. API 制約の計算
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

### 4. BeatOrchestrator の LLM 呼び出し統合

**ファイル**: `packages/core/src/adaptation/integration/beat-orchestrator.ts`

#### 新規インターフェース

```typescript
// LLM 呼び出しインターフェース
export interface BeatOrchestratorLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

// LLM 実装を注入
setLLMInterface(llm: BeatOrchestratorLLMInterface): void;
```

#### executeSpeculativeCalls - 3方向並行生成の実行

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

#### buildSystemPrompt - システムプロンプトの構築

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

  // ... 他の部分
  parts.push(`Style: ${variant.suffix}`);

  return parts.join("\n");
}
```

| バリアント | スタイル | Temperature |
|-----------|----------|-------------|
| **A** | terse（簡潔） | 0.7 |
| **B** | internal（内面） | 0.8 |
| **C** | sensory（感覚） | 0.75 |

---

### 5. ChapterPipelineAdapter の LLM 呼び出し統合

**ファイル**: `packages/core/src/adaptation/integration/chapter-pipeline.ts`

#### 新規インターフェース

```typescript
export interface ChapterPipelineLLMInterface {
  callLLMWithConfig(config: LLMCallConfig): Promise<string>;
}

setLLMInterface(llm: ChapterPipelineLLMInterface): void;
```

#### generateBeat - 完全なビート生成フロー

```typescript
async generateBeat(params: {
  beatIndex: number;
  beatType: BeatType;
  tensionLevel: TensionLevel;
  // ...
  isChapterEnd: boolean;
}): Promise<BeatGenerationStep> {
  // 1. preGenerationBeat - DNA 圧縮と API 制約の準備
  const preGen = await this.hooks.preGenerationBeat({...});

  // 2. リクエストの構築
  const request: BeatGenerationRequest = {
    beatId: `beat-${params.beatIndex}`,
    beatType: params.beatType,
    dna: preGen.dna,
    kineticScaffold: preGen.kineticScaffold,
    // ...
  };

  // 3. BeatOrchestrator を呼び出して3方向並行生成を実行
  const candidates = await this.orchestrator.executeSpeculativeCalls(request);

  // 4. 監査と最優秀候補の選択
  const selection = this.orchestrator.selectBestCandidate(candidates, preGen.dna);

  // 5. postGenerationBeat - 監査とイベント抽出
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

### 6. 完全なデータフロー

```
monarch write next (デフォルト: Adaptation モード)
    │
    ▼
writeNextChapterWithAdaptationLocked
    │
    ├── AdaptationHooks の初期化
    │   ├── IntentCompiler.compile() → HardBan, DnaWeight, FocusMultiplier
    │   ├── EventSourcer.loadSnapshot() → エンティティ状態
    │   └── LexicalMonitor.addAiTellWords() → AI口말語
    │
    ├── LLM インターフェースを構築
    │   └── buildAdaptationLLMInterface() → InkOS LLMProvider へのブリッジ
    │
    ▼
ChapterPipelineAdapter.generateChapter()
    │
    ├── planBeats() → ビート計画（位置選好 + リズム守卫）
    │
    └── generateBeat() → 各ビート
         │
         ├─ hooks.preGenerationBeat()
         │    └─ DnaCompressor 状態を NarrativeDNA に圧縮
         │    └─ RhythmGuard Kinetic Scaffold を生成
         │
         └─ BeatOrchestrator.executeSpeculativeCalls()
              │
              ├─ 3方向並行生成 (A/B/C セマンティックバリアント)
              │    └─ LLM 呼び出し + API 制約
              │    └─ Show-Don't-Tell Scalpel 後処理
              │
              ├─ hooks.postGenerationBeat()
              │    └─ CascadeAuditor 監査
              │    └─ EventSourcer イベント抽出
              │
              └─ 最優秀候補を選択
    │
    ▼
章ファイルに書き込み + 状態の更新
```

---

### 7. 現在の実装状況

> [!NOTE]
> **統合済み**：
> - `BeatOrchestratorLLMInterface` — LLM 呼び出しインターフェース定義
> - `setLLMInterface()` — LLM 実装の注入
> - `executeSpeculativeCalls()` — 3方向並行 LLM 呼び出し
> - `buildSystemPrompt()` — motifEcho と sensoryEcho 指令の統合
> - `ChapterPipelineAdapter.setLLMInterface()` — LLM インターフェース注入
> - `generateBeat()` — 完全なビートレベル生成フロー
> - `_writeNextChapterWithAdaptationLocked()` — 元の InkOS パイプラインの代わりに ChapterPipelineAdapter を使用

## ワークフロー

### 1. インテントコンパイラ（Intent Compiler）

作者のビリーブドキュメント（bible）を読み込み、システム重みにコンパイル：
- `HardBan` — 絶対禁止ルール
- `DnaWeight` — 各DNAフィールドの重み配分
- `FocusMultiplier` — キャラクター焦点倍率

### 2. DNA圧縮（DnaCompressor）

完整なストーリー状態を250トークン以内の NarrativeDNA に圧縮：
- `who` — 現在のシーンのキャラクタースナップショット
- `where` — 場所描写（200文字制限）
- `mustInclude` — 含める必要がある要素（最大3つ）
- `mustNotInclude` — 禁止語彙リスト
- `motifEcho` — モティーフエコー指示
- `sensoryEcho` — 感覚フラッシュバック微量注入

### 3. ビートプランナ（BeatPlanner）

テンションと感情負債に基づいて各ビートのタイプを計画：
- **負空間トリガー**：連続高強度＋感情負債 > 5 → サイレントビートを挿入
- **ダイアログ密度トリガー**：3つの連続ダイアログビート → 環境描写を挿入
- Kinetic Scaffold を自動挿入して4Bモデルの初期化バイアスを打破

### 4. 投機的ジェネレータ（Speculative Generator）

3つのセマンティックバリアントを並行生成（terse / internal / sensory）：
- 各バリアントに3つの構文戦略を添付（parataxis / hypotaxis / nominal）
- 合計9候補、3バッチで並行処理
- 自己回帰偏好：2回連続勝利した構文戦略は自動ロック

### 5. モティーフインデクサ（MotifIndexer）

章を跨いだモティーフインデックスを維持：
- テキストに現れる40以上の事前定義モティーフをスキャン
- 各出現の感情ベクトルと関連キャラクターを追跡
- 弧を自動計算：REINFORCE / CONTRAST / TRANSMUTE / DORMANT
- 感覚フラッシュバック微量注入：モティーフ再現時、モデルにキャラクター身体レベルで0.5秒の干扰を埋め込むことを要求

### 6. カスケード監査（CascadeAuditor）

生成テキストの階層的検証：
1. **ルール監査** — HardBan ルール違反をチェック
2. **固有名詞監査** — 人名/地名拼写の一貫性をチェック
3. **構造監査** — 文字数目標とビートタイプのマッチングをチェック
4. **声監査** — 語彙繰り返しとAI口말をチェック
5. **連続性監査** — 前のビートとの筋の連続性をチェック

### 7. 後処理（Show-Don't-Tell Scalpel）

露骨な因果表現を強制切除：
- `以此掩饰` / `因为他感到` / `仿佛在说` / `试图以此`
- 产生的多余标点を清理（`,。` → `。`）

## API制約

すべてのLLM呼び出しには以下を含める必要があります：
- `max_tokens` — ビートタイプに応じて動的に計算（action: 180, dialogue: 220, 等）
- `stop_sequences` — モデルが範囲外のコンテンツを生成するのを防止
- `temperature` — バリアントタイプに応じて差別化（A: 0.7, B: 0.8, C: 0.75）
- `frequency_penalty` — 0.3
- `presence_penalty` — 0.2

## 章の切り詰め修正

章の最後のビートに50トークンの終端空間を予約し、コンテンツが切り詰められるのを防止。

```typescript
const CHAPTER_END_RESERVE_TOKENS = 50;

// getApiConstraintsForBeat(beatType, wordTarget, { isChapterEnd: true })
// → maxTokens += CHAPTER_END_RESERVE_TOKENS
```

## RED LINES

- **NO LLM FOR LOGIC** — ロジックは全てPure TypeScriptでなければならない
- **MAX 3 PARALLEL CALLS** — Promise.all のLLM呼び出しは3つを超えてはならない
- **EVENT SOURCING ONLY** — LLMは絶対に状態ファイルを直接修正してはならない
- **NO MODIFICATION OF BASE INKOS** — 全てのコードは `src/adaptation/` ディレクトリにある

## ディレクトリ構造

```
packages/core/src/adaptation/
├── state/
│   ├── event-sourcer.ts      # イベント溯源、純粋TS状態変異
│   ├── intent-compiler.ts    # インテントコンパイル、bible → SystemWeights
│   ├── motif-indexer.ts      # モティーフインデックス、章を跨いだメモリ
│   └── motif-types.ts        # モティーフデータ構造定義
├── beat/
│   ├── beat-types.ts         # Beat, NarrativeDNA, SensoryEcho
│   ├── planner.ts            # ビート計画、負空間トリガー
│   ├── rhythm-guard.ts       # リズム守卫、Kinetic Scaffolds
│   ├── speculative-generator.ts  # 投機的生成、構文バリアント
│   └── show-dont-tell-scalpel.ts # 露骨因果語切除
├── context/
│   └── dna-compressor.ts     # DNA圧縮、250トークンバジェット
├── audit/
│   ├── lexical-monitor.ts    # 語彙モニタリング、AI口말検出
│   └── cascade-auditor.ts    # カスケード監査、5層検証
├── llm/
│   └── api-constraints.ts    # API制約、max_tokens計算
├── integration/
│   ├── hooks.ts              # 適応層フック
│   ├── beat-orchestrator.ts  # ビートオーケストレーション、3方向並行
│   └── chapter-pipeline.ts   # 章パイプライン適応
└── types/
    └── state-types.ts        # コア状態型定義
```

## InkOS との関係

Monarch は InkOS の上に構築され、InkOS のコアパイプラインとワークフローを継承しています。主な違いは：

| 機能 | InkOS | Monarch |
|------|-------|---------|
| 定位 | 汎用長編小説執筆 Agent | 小モデル執筆Agent、複雑なロジック処理に特化 |
| アーキテクチャ | マルチAgent協力 | Adaptation Layer + InkOS Pipeline |
| LLM使用 | ロогиックと執筆を処理 | テキスト生成のみ、ロジックはTypeScriptで処理 |

### 環境設定

Monarch は InkOS と同じ環境設定方式を使用します。追加設定は不要です。[InkOS 設定ガイド](https://github.com/Narcooo/inkos#%E9%85%8D%E7%BD%AE)を参照してください。

### その他の機能

InkOS は以下の豊かな機能を提供します：
- 複数のインタラクションモード（TUI / Studio / CLI）
- 既存作品の続編執筆
- 二次創作
- 文体クローニング
- マルチモデルルーティング
- デーモンモード

これらの機能の詳細情報と使用方法について は、[InkOS 公式レポジトリ](https://github.com/Narcooo/inkos) をご覧ください。

## ライセンス

[AGPL-3.0](LICENSE)
