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

### Adaptation Pipeline 三層アーキテクチャ

```
Chapter Level（章レベル）
  ├─ Drift Detector（5章ごとに物語の逸脱を検出）
  ├─ Curiosity Ledger（読者の疑問を追跡）
  ├─ Metabolism Reporter（章の健全性）
  ├─ Emotional Debt Analysis（感情的負債）
  ├─ Unconscious Analysis（無意識コンテンツ）
  └─ Timeline Analysis（タイムライン矛盾）

Scene Level（シーンレベル）
  ├─ Scene Exit Evaluator（9種類の退出条件）
  └─ Narrative Metabolism（リアルタイム監視）

Beat Level（ビートレベル）- 11ステッププロセス
  1. Beat Planning（DNA圧縮 ≤250トークン）
  2. Generation（LLM生成）
  3. Adversarial Refinement（最大6ラウンド）
  4. Reader Simulation（三読者）
  5. Knowledge Boundary（知識チェック）
  6. Subtext Analysis（サブテキスト検出）
  7. Voice Fingerprint（声の一貫性）
  8. Dialogue Validation（対話検証）
  9. Cascade Audit（5層品質ゲート）
  10. State Update（イベントソーシング）
  11. Show-Don't-Tell Scalpel（後処理）
```

### 主要機能

**DNA 圧縮**: 完全なストーリー状態を ≤250 トークンに圧縮
- `who` / `where` / `mustInclude` / `mustNotInclude` / `motifEcho` / `sensoryEcho`

**推測生成**: 3つの意味バリアント × 3つの構文戦略を並列生成

**カスケード監査**: 5層品質検証（文字数/固有名詞/DNA準拠/声/連続性）

**イベントソーシング**: LLM は状態を直接変更せず、すべての変更はイベント適用を通じて

**並列制約**: 最大3つの同時 LLM 呼び出し（RED LINE）

## RED LINES（アーキテクチャ制約）

- **NO LLM FOR LOGIC** - すべてのロジックは純粋な TypeScript である必要があります
- **MAX 3 PARALLEL CALLS** - Promise.all の LLM 呼び出しは3つまで
- **EVENT SOURCING ONLY** - LLM は状態ファイルを直接変更しません
- **NO MODIFICATION OF BASE INKOS** - すべてのコードは `src/adaptation/` ディレクトリ内

## InkOS との関係

| 機能 | InkOS | Monarch |
|------|-------|---------|
| 位置付け | 汎用長編小説執筆エージェント | 小型モデル執筆エージェント |
| アーキテクチャ | マルチエージェント協調 | Adaptation Layer + InkOS Pipeline |
| LLM 使用 | ロジックと執筆を処理 | テキスト生成のみ、ロジックは TypeScript |

Monarch は InkOS と同じ環境設定を使用し、追加設定は不要です。[InkOS 設定ガイド](https://github.com/Narcooo/inkos#configuration)を参照してください。

## ライセンス

[AGPL-3.0](LICENSE)
