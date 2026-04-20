<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

***

## 概要

**Monarch** は [InkOS](https://github.com/Narcooo/inkos) をベースに構築された小型モデル執筆エージェントで、小型モデル（4Bパラメータ）を使用して複雑な物語ロジックを処理することに特化しています。

> [!WARNING]
> ⚠️ Monarch は現在初期テスト開発版です。一部の機能はまだ安定していません。

> [!NOTE]
> Monarch は InkOS と同じ環境設定を共有しており、個別の設定は不要です。
>
> 完全な機能、コマンド、使用方法については、[InkOS 公式リポジトリ](https://github.com/Narcooo/inkos)を参照してください。

### 核心理念

**モデルは文章を書くだけ、システムが世界観を追跡する。**

4Bパラメータの小型モデルは、複雑な論理推論と創造的な執筆を同時に処理できません。Monarch のアプローチ：

- **純粋な TypeScript がすべてのロジックを処理**：モチーフ追跡、感情アーク、ビート計画、一貫性監査
- **LLM はテキスト生成のみ**：厳格な API 制約の下で仕様に準拠した散文を出力

## アーキテクチャ概要

<p align="center">
  <img src="assets/monarch v2.svg" width="100%" alt="Monarch Architecture">
</p>

### Adaptation Pipeline 三層アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  Chapter Level（章レベル）                                        │
│  ├── Narrative Drift Detector    # 5章ごとに物語の逸脱を検出    │
│  ├── Curiosity Ledger            # 読者の疑問を追跡              │
│  └── Metabolism Reporter         # 章の健全性監視                │
├─────────────────────────────────────────────────────────────────┤
│  Scene Level（シーンレベル）                                      │
│  ├── Scene Exit Evaluator        # 9種類の退出条件               │
│  └── Narrative Metabolism        # リアルタイム監視              │
├─────────────────────────────────────────────────────────────────┤
│  Beat Level（ビートレベル）- 8ステッププロセス                    │
│  ├── 1. Beat Planning            # DNA Compiler + Kinetic       │
│  ├── 2. Generation               # LLM生成                       │
│  ├── 3. Adversarial Refinement   # Writer/Attacker/Referee      │
│  ├── 4. Reader Simulation        # 三読者シミュレーション        │
│  ├── 5. Knowledge Boundary       # キャラクター知識境界チェック  │
│  ├── 6. Cascade Audit            # 5層カスケード監査             │
│  ├── 7. State Update             # Event Sourcing               │
│  └── 8. Show-Don't-Tell Scalpel  # 後処理                        │
└─────────────────────────────────────────────────────────────────┘
```

## 使用方法

### 2つの実行モード

```bash
# Adaptation モード（デフォルト）- 小型モデル + 適応層
monarch write next <book-id>

# フルモデルモード - 直接 InkOS マルチエージェントパイプライン
monarch write next <book-id> --no-adaptation
```

| モード | 説明 | 使用ケース |
|--------|------|-----------|
| **Adaptation** | 小型モデル + TypeScript ロジック | トークン節約、長期創作 |
| **フルモデル** | 完全な InkOS パイプライン | より強力な生成能力 |

### コアワークフロー

```
ユーザー入力
    ↓
章入力準備（IntentCompiler がストーリーファイルをコンパイル）
    ↓
AdaptationHooks 初期化（EventSourcer + LexicalMonitor）
    ↓
ChapterPipelineAdapter.generateChapter()
    ├── planBeats() → ビート計画
    └── generateBeat() → ビートごとに生成
        ├── DNA 圧縮（250トークン予算）
        ├── 3方向並列生成（terse/internal/sensory）
        ├── 監査 + 最適候補選択
        └── イベント抽出 + 状態更新
    ↓
完全な InkOS パイプライン
    ├── 監査 + 修正
    ├── 真実ファイル生成（ChapterAnalyzerAgent）
    ├── 真実ファイル検証
    └── 永続化 + スナップショット + 通知
```

## 主要機能

### 1. DNA 圧縮
完全なストーリー状態を ≤250 トークンの NarrativeDNA に圧縮：
- `who` - 現在のシーンのキャラクター
- `where` - 場所の説明
- `mustInclude` / `mustNotInclude` - 必須/禁止要素
- `motifEcho` - モチーフ共鳴
- `sensoryEcho` - 感覚フラッシュバック

### 2. 推測生成
3つの意味バリアントを並列生成、各バリアントに3つの構文戦略：
- **Variant A**: terse（簡潔、temp 0.7）
- **Variant B**: internal（内面、temp 0.8）
- **Variant C**: sensory（感覚、temp 0.75）

### 3. カスケード監査
5層品質検証：
1. ルール監査 - HardBan チェック
2. 固有名詞監査 - スペル一貫性
3. 構造監査 - 文字数とビートタイプ
4. 声監査 - AI 痕跡語
5. 連続性監査 - プロット一貫性

### 4. イベントソーシング
LLM は状態ファイルを直接変更しません。すべての状態変更はイベント抽出と適用を通じて：
- `ADD_CHARACTER`、`UPDATE_RELATIONSHIP`、`MOVE_CHARACTER`
- `UPDATE_SUBPLOT`、`ACQUIRE_PARTICLE`、`KNOWLEDGE_GAIN`
- 状態差分生成、章ごとに追跡可能

## ストーリーファイルサポート

適応層は10種類以上のストーリーファイルを読み取り処理：
- `story_bible.md` - ストーリー設定
- `style_guide.md` - スタイルガイドライン
- `volume_outline.md` - 巻アウトライン
- `chapter_summaries.md` - 章要約
- `subplot_board.md` - サブプロットボード
- `emotional_arcs.md` - 感情アーク
- `character_matrix.md` - キャラクターマトリックス
- `parent_canon.md` / `fanfic_canon.md` - 原作設定

## RED LINES（アーキテクチャ制約）

- **NO LLM FOR LOGIC** - すべてのロジックは純粋な TypeScript である必要があります
- **MAX 3 PARALLEL CALLS** - Promise.all の LLM 呼び出しは3つまで
- **EVENT SOURCING ONLY** - LLM は状態ファイルを直接変更しません
- **NO MODIFICATION OF BASE INKOS** - すべてのコードは `src/adaptation/` ディレクトリ内

## ディレクトリ構造

```
packages/core/src/adaptation/
├── pipeline/          # メインオーケストレーター
├── state/             # イベントソーシング、意図コンパイル、モチーフインデックス
├── beat/              # ビート計画、推測生成
├── context/           # DNA 圧縮
├── audit/             # カスケード監査
├── generation/        # 敵対的精錬ループ
├── simulation/        # 三読者シミュレーター
├── character/         # 知識境界チェック
├── narrative/         # ドリフト検出、好奇心台帳、代謝
├── scene/             # シーン退出条件
├── llm/               # API 制約
└── integration/       # フック、オーケストレーター、パイプラインアダプター
```

## InkOS との関係

| 機能 | InkOS | Monarch |
|------|-------|---------|
| 位置付け | 汎用長編小説執筆エージェント | 小型モデル執筆エージェント |
| アーキテクチャ | マルチエージェント協調 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | ロジックと執筆を処理 | テキスト生成のみ、ロジックは TypeScript |

### 環境設定

Monarch は InkOS と同じ環境設定を使用し、追加設定は不要です。[InkOS 設定ガイド](https://github.com/Narcooo/inkos#configuration)を参照してください。

## ライセンス

[AGPL-3.0](LICENSE)
