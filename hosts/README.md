# hosts/ — 宿主适配层（DEC-025）

`ui/view.ts` 的渲染引擎只认 `HostAdapter`，不认识任何具体宿主。
每个宿主把下面 14 个能力实现一遍，就能复用全部视图逻辑。

```
ui/view.ts  (怎么画)
    ↓ 只调 this.host.*
hosts/types.ts  (契约)
    ↓ 实现
hosts/obsidian/  ✅ 已落地      hosts/memory/  ✅ 参考实现
hosts/blinko/    ⏳ 待写        hosts/siyuan/  ⏳ 待写
    ↓ 装配
apps/bootstrap.ts → mountTimeNote(root, host)
```

## HostAdapter 契约（`types.ts`）

| 类别 | 方法 | 说明 |
|---|---|---|
| 设置 | `settings` / `saveSettings()` | 渲染层可直接改字段再落盘 |
| 宿主 UI | `notice()` / `setIcon()` | 轻提示、按钮图标；无图标体系可 no-op |
| 弹窗 | `openQuickAdd()` / `openSubItems()` | 弹窗形态差异留在宿主侧 |
| 跳转 | `openEntry()` / `openDailyNote()` | 后者含 DEC-017 的「不存在则创建」规则 |
| 事件 | `onExternalChange(cb)` | 订阅外部数据变更，返回取消订阅函数 |
| 数据 | `getEntriesForRange()` / `invalidateCache()` | 按 `dateStr` 分桶取条目 |
| 写操作 | `toggleTask` / `updateEntryTime` / `updateEntryPointTime` / `moveEntryToDate` | 只读来源一律返回 `false` |

契约只依赖 `MomentLike`（ui/date）与 `NoteEntry`（sources/types）两个抽象类型，
**不 import 任何宿主 SDK**。`hosts/types.ts` 的静态断言在 `test:hosts` 里守着。

## 已有实现

### `hosts/obsidian/adapter.ts` — ✅ 生产实现

集中了从渲染层移出的全部 Obsidian 专有调用：
`app.vault` / `app.workspace` / `Notice` / `setIcon` / `normalizePath` / `TFile`、
`QuickAddModal` / `SubItemsModal`、以及「找-建-打开日记」逻辑（DEC-017）。

⚠️ **两个 Modal 构造函数通过 `deps` 注入**，不是直接 import：

```ts
createObsidianHostAdapter({
  app, plugin,
  service: plugin.dailyNoteService,
  QuickAddModal, SubItemsModal
});
```

原因：两个 Modal 定义在 `main.ts`，adapter 反向 import 会形成循环依赖。
`deps` 注入也保留了它们的静态断言仍指向 `main.ts`，减少改动面。

`onExternalChange` 原先用 `ItemView.registerEvent(vault.on("modify"))`，
现在挂在 `plugin.registerEvent` 上（插件卸载时自动解绑），并提供 `offref` 取消订阅。

`invalidateCache()` **只清 `fileCache` 与 `dailyNoteIndex`**，与原「刷新」按钮逐字一致；
DEC-023 的 60 秒远程缓存由 `saveSettings()` 单独作废，避免每次刷新都打接口。

### `hosts/memory/adapter.ts` — ✅ 参考实现 / 测试宿主

不是第四个交付插件。它的作用是：

- 证明契约**不依赖 Obsidian**（全文件没有一个 obsidian import）；
- 给测试提供可断言的行为（`state.notices` / `quickAdds` / `opened` / `cacheClears` …）；
- 作为未来 `apps/web/` 独立演示宿主的起点。

写操作直接改内存条目，`readonly: true` 的条目一律拒绝（与 DEC-023 边界一致）。

### 待写：`hosts/blinko/` / `hosts/siyuan/`

需要各自解决「本地笔记 ↔ `NoteEntry`」的映射：

| 平台 | 本地数据形态 | 关键映射 |
|---|---|---|
| Blinko | 纯数据库，无本地文件 | `id` / `content` / `createdAt` → 条目；时间前缀靠正文或创建时刻 |
| 思源 | 文档块树 | 一个块 ↔ 一条记录；块 id 作为 `filePath`；写走内核 `/api/block/*` |

聚合来源（memos / 对端 Blinko）直接复用 `sources/` 里的只读 adapter。

## 构建与测试

```bash
npm run build:hosts   # hosts/index.ts → hosts/index.mjs（ESM，已 gitignore）
npm run test:hosts    # 43 项
```

`hosts/index.ts` **刻意不导出 obsidian adapter**：`obsidian` 包只有类型定义、
没有运行时实现，打进测试用的 ESM 产物会失败。Obsidian 适配器由 app 入口直接引用。
