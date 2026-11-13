# hosts/ — 宿主适配层（DEC-025）

`ui/view.ts` 的渲染引擎只认 `HostAdapter`，不认识任何具体宿主。
每个宿主把下面 14 个能力实现一遍，就能复用全部视图逻辑。

```
ui/view.ts  (怎么画)
    ↓ 只调 this.host.*
hosts/types.ts  (契约)
    ↓ 实现
hosts/obsidian/  ✅ 生产实现     hosts/memory/  ✅ 参考实现
hosts/blinko/    ✅ 已落地       hosts/siyuan/  ✅ 已落地（DEC-032）
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

### `hosts/siyuan/` — ✅ 已落地（DEC-032）

**本地数据形态**：文档块树，没有「文件」概念。用一层虚拟 `NoteFileStore` 接上 `DailySource`：

| 文件 | 职责 |
|---|---|
| `kernel.ts` | `SiyuanKernel` 封装内核 `/api/*`（`query/sql` / `lsNotebooks` / `createDocWithMd` / `updateBlock` / `insertBlock` / `deleteBlock`），**禁止直接 fs** |
| `file-store.ts` | 一篇每日笔记文档 ↔ 一个虚拟 `YYYY-MM-DD.md`，一个块 ↔ 一行；`blocksToLines()` / `stripIal()` 处理 IAL 与块类型，只收 `i / p / h / l` |
| `adapter.ts` | `createSiyuanHostAdapter()`：通知 / 图标 / 打开原生文档 / 订阅 `ws-main`（按命令名粗过滤）/ 设置落盘 |

写回走 `apps/shared/line-diff.ts` 的行级 diff，`keep` / `replace` 保留原块 id，新块暂为 `null` —— **块引用与块链接全靠 id 不丢**。

### `hosts/blinko/` — ✅ 已落地（DEC-032）

**本地数据形态**：数据库里的 note。同样映射成虚拟 md 文件：

| 文件 | 职责 |
|---|---|
| `api.ts` | `BlinkoNoteApi` 封装 `window.Blinko.api` 的 tRPC（`notes.list.query` / `notes.upsert.mutate` / `notes.trashMany.mutate`）；superjson 下 `createdAt` 可传 `Date` |
| `note-store.ts` | 一天所有 notes ↔ 一个虚拟 `YYYY-MM-DD.md`、一条 note ↔ 一行；日期写进 `metadata.timenote.date`，缺省回退 `createdAt`；删除进回收站不硬删 |
| `adapter.ts` | `createBlinkoHostAdapter()`：toast / 只读 note 文本弹窗 / 120 秒低频轮询（页面不可见时不轮询）/ 设置落盘 |

`upsertFromLine()` 返回新建或更新后的 note id，写回后 `snapshots` 必须带着它 —— 否则下一次拖时间 / 跨天就找不到实体（`test:platforms` 有反证）。

两个宿主都用 `apps/shared/host-adapter.ts` 的 `createSharedHostAdapter()` 实现 `HostAdapter` 的大部分能力，数据装配统一走 `sources/host-service.ts`；聚合来源（memos / 对端 Blinko）直接复用 `sources/` 里的只读 adapter，恒 `readonly: true`。⚠️ **两者均尚未在真机验证**。

### 数据服务为什么不放 `sources/index.ts`

`sources/host-service.ts` 的 `HostNoteService` 是思源 / Blinko 共用的装配入口，但**刻意不从 `sources/index.ts` 导出**：`main.ts` import 后者，多一个 re-export 就会把 `DEFAULT_REMOTE_TTL` 这类顶层常量打进 Obsidian 的 `main.js`（实测多 3 行）。两个新宿主直接 import `host-service.ts` 即可，`npm run build` 后 `git diff -- main.js` 应保持为空。

## 构建与测试

```bash
npm run build:hosts    # hosts/index.ts → hosts/index.mjs（ESM，已 gitignore）
npm run test:hosts     # 51 项
npm run test:platforms # 164 项：模拟 kernel / tRPC + 虚拟文件层 + 加载期冒烟
npm test               # 951 项（18 套）
```

`hosts/index.ts` **刻意不导出 obsidian adapter**：`obsidian` 包只有类型定义、
没有运行时实现，打进测试用的 ESM 产物会失败。Obsidian 适配器由 app 入口直接引用。
思源 / Blinko 各自有独立的 `index.ts` 作为宿主层出口（`test:platforms` 直接 import 它们），
不经 `hosts/index.ts` —— 避免把任何新宿主的顶层代码带进 Obsidian 产物。
