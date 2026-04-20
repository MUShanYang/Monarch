# Adaptation 模块补全计划

## 目标
补全 CLAUDE.md 中确实缺失的模块和部分实现的模块，并修复所有 TypeScript 构建错误。

## 当前状态

### 已创建的模块 (9个)
1. ✅ `state/state-compiler.ts` - JSON → .md 编译器
2. ✅ `state/rollback.ts` - 状态 Diff + 回滚系统
3. ✅ `context/attention-multipliers.ts` - 注意力乘数
4. ✅ `audit/voice-fingerprint.ts` - 声纹系统
5. ✅ `character/emotional-debt.ts` - 情感债务系统
6. ✅ `character/unconscious.ts` - 角色无意识系统
7. ✅ `generation/subtext-engine.ts` - 潜台词引擎
8. ✅ `narrative/timeline-explorer.ts` - 时间线探索器
9. ✅ `simulation/dialogue-arena.ts` - 对话竞技场

### 待修复的构建错误

#### 1. 类型命名冲突
**问题**: `EmotionalDebt` 类型在 `types/state-types.ts` 和 `character/emotional-debt.ts` 中重复定义

**解决方案**: 将 `character/emotional-debt.ts` 中的类型重命名为 `CharacterEmotionalDebt` 和 `CharacterEmotionalDebtSchema`，避免与状态类型冲突

#### 2. `StateDiff` 类型重复导出
**问题**: `StateDiff` 在 `types/state-types.ts` 和 `state/rollback.ts` 中都有定义

**解决方案**: 
- `types/state-types.ts` 中的 `StateDiff` 是事件级别的差异（单个 beat 的事件列表）
- `state/rollback.ts` 中的 `StateDiff` 是章节级别的差异（包含前后状态快照）
- 将 rollback.ts 中的重命名为 `ChapterStateDiff` 和 `ChapterRollbackResult`

#### 3. `VoiceFeature.value` 类型不匹配
**问题**: `voice-fingerprint.ts` 中的 feature value 返回对象类型，但 schema 定义为 `z.union([z.string(), z.number(), z.array(z.string())])`

**解决方案**: 修改 schema 以支持对象类型，或者将返回值转换为兼容类型

## 实施步骤

### Phase 1: 修复类型命名冲突

#### 1.1 修复 emotional-debt.ts
- 重命名 `EmotionalDebtSchema` → `CharacterEmotionalDebtSchema`
- 重命名 `EmotionalDebt` → `CharacterEmotionalDebt`
- 更新所有相关引用

#### 1.2 修复 rollback.ts
- 重命名 `StateDiff` → `ChapterStateDiff`
- 重命名 `RollbackResult` → `ChapterRollbackResult`
- 更新所有相关引用

#### 1.3 修复 voice-fingerprint.ts
- 修改 `VoiceFeatureSchema` 支持对象类型的 value
- 或者调整 feature 提取方法返回兼容类型

### Phase 2: 更新 index.ts 导出

#### 2.1 更新 character/index.ts
- 更新导出类型名称为新的命名

#### 2.2 更新 state/index.ts
- 更新导出类型名称为新的命名

### Phase 3: 验证构建

#### 3.1 运行 TypeScript 编译
```bash
pnpm --filter @actalk/monarch-core build
```

#### 3.2 运行测试
```bash
pnpm test
```

## 文件修改清单

### 需要修改的文件
1. `packages/core/src/adaptation/character/emotional-debt.ts` - 重命名类型
2. `packages/core/src/adaptation/character/index.ts` - 更新导出
3. `packages/core/src/adaptation/state/rollback.ts` - 重命名类型
4. `packages/core/src/adaptation/state/index.ts` - 更新导出
5. `packages/core/src/adaptation/audit/voice-fingerprint.ts` - 修复 value 类型

## 验收标准
1. ✅ 所有 9 个新模块文件存在且完整
2. ✅ TypeScript 编译通过，无错误
3. ✅ 所有测试通过
4. ✅ 类型导出无冲突
5. ✅ 模块可正确导入使用
