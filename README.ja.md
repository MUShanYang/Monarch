<p align="center">
  <img src="assets/logo.svg" width="120" height="120" alt="Monarch Logo">
</p>

<h1 align="center">Monarch</h1>

<p align="center">
  <a href="README.md">中文</a> | <a href="README.en.md">English</a> | <a href="README.ja.md">日本語</a>
</p>

***

> [!IMPORTANT]
> 🚧 **プロジェクトは活発に開発中** - この README は現在のコードベースを反映していない可能性があります。正確な情報については、コードと `CLAUDE.md` を参照してください。

> [!WARNING]
> ⚠️ Monarch は現在初期テスト開発版です。一部の機能はまだ安定していません。

## 概要

**Monarch** は [InkOS](https://github.com/Narcooo/inkos) をベースに構築された小型モデル執筆エージェントで、小型モデル（4Bパラメータ）を使用して複雑な物語ロジックを処理することに特化しています。

> [!NOTE]
> Monarch は InkOS と同じ環境設定を共有しており、個別の設定は不要です。
>
> 完全な機能、コマンド、使用方法については、[InkOS 公式リポジトリ](https://github.com/Narcooo/inkos)を参照してください。

### 核心理念

**モデルは文章を書くだけ、システムが世界観を追跡する。**

4Bパラメータの小型モデルは、複雑な論理推論と創造的な執筆を同時に処理できません。Monarch のアプローチ：

- **純粋な TypeScript がすべてのロジックを処理**：モチーフ追跡、感情アーク、ビート計画、一貫性監査、キャラクター知識追跡
- **LLM はテキスト生成のみ**：厳格な API 制約の下で仕様に準拠した散文を出力

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

## アーキテクチャ概要

![Adaptation Pipeline](assets/adaptation-pipeline.svg)

### Adaptation Pipeline 三層アーキテクチャ

```
Chapter Level（章レベル）
  ├─ Hook Prioritizer（プロットスレッドの優先度を自動調整、長期フック対応）
  ├─ Drift Detector（5章ごとに物語の逸脱を検出）
  ├─ Curiosity Ledger（読者の疑問を追跡）
  ├─ Chapter Health Monitor（リアルタイム品質監視）
  ├─ Emotional Debt Analysis（感情的負債）
  ├─ Unconscious Analysis（無意識コンテンツ）
  └─ Timeline Analysis（タイムライン矛盾）

Scene Level（シーンレベル）
  ├─ Scene Exit Evaluator（9種類の退出条件）
  └─ Narrative Metabolism（リアルタイム監視）

Beat Level（ビートレベル）- 11ステッププロセス
  1. Beat Planning（DNA圧縮 ≤250トークン + ビートタイプ推奨）
  2. Generation（LLM生成）
  3. Adversarial Refinement（最大6ラウンド）
  4. Reader Simulation（三読者）
  5. Knowledge Boundary（知識チェック + キャラクター知識追跡）
  6. Subtext Analysis（サブテキスト検出）
  7. Voice Fingerprint（声の一貫性）
  8. Dialogue Validation（対話検証）
  9. Cascade Audit（5層品質ゲート）
  10. State Update（イベントソーシング）
  11. Show-Don't-Tell Scalpel（後処理）
```

### インテリジェントシステム（新機能）

**1. Hook Prioritizer（フック優先度調整器）**
- プロットスレッドの優先度を自動調整し、忘れられるのを防ぐ
- 長期フック対応（50章以上にわたるメインプロット）
- 章の進行、フックの年齢、停滞時間に基づいて自動調整

**2. Beat Type Recommender（ビートタイプ推奨器）**
- 次のビートタイプをインテリジェントに推奨し、単調なリズムを回避
- 6つのルールに基づく：連続同一回避、対話/アクション比率バランス、緊張レベル、フック要件、章の進行、パターン打破

**3. Chapter Health Monitor（章健全性モニター）**
- 章生成品質のリアルタイム監視（6つの指標）
- 対話比率、アクション比率、緊張変化、文字数分布、リズム単調度、進行推定

**4. Style Consistency Checker（スタイル一貫性チェッカー）**
- 新しい章が確立された執筆スタイルに合致しているかチェック
- 文の長さ、語彙の多様性、句読点の使用を分析

**5. Dynamic Motif Extractor（動的モチーフ抽出器）**
- story_bible と章コンテンツからストーリー固有のモチーフを自動抽出
- ハードコードされた汎用モチーフ語彙を置き換え、各ストーリーの独自イメージに適応

**6. Knowledge Tracker（知識追跡器）** ⭐ 新機能
- **核心問題を解決**：AIがキャラクターに知るべきでない情報を言わせるのを防ぐ
- 各キャラクターの知識状態を追跡（knows/suspects/doesNotKnow）
- 各ビート生成後に知識境界を自動検証
- 新しい知識を自動抽出し、追跡状態を更新
- 詳細：`packages/core/src/adaptation/character/KNOWLEDGE_TRACKING.md`

### 主要機能

**DNA 圧縮**: 完全なストーリー状態を ≤250 トークンに圧縮
- `who` / `where` / `mustInclude` / `mustNotInclude` / `motifEcho` / `sensoryEcho`

**推測生成**: 3つの意味バリアント × 3つの構文戦略を並列生成

**カスケード監査**: 5層品質検証（文字数/固有名詞/DNA準拠/声/連続性）

**イベントソーシング**: LLM は状態を直接変更せず、すべての変更はイベント適用を通じて

**並列制約**: 最大3つの同時 LLM 呼び出し

## InkOS との関係

| 機能 | InkOS | Monarch |
|------|-------|---------|
| 位置付け | 汎用長編小説執筆エージェント | 小型モデル執筆エージェント |
| アーキテクチャ | マルチエージェント協調 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | ロジックと執筆を処理 | テキスト生成のみ、ロジックは TypeScript |

Monarch は InkOS と同じ環境設定を使用し、追加設定は不要です。[InkOS 設定ガイド](https://github.com/Narcooo/inkos#configuration)を参照してください。

## ライセンス

[AGPL-3.0](LICENSE)
