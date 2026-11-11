# sources/ — 数据源层（DEC-023）

「数据从哪来」与「怎么渲染」彻底解耦。宿主只认 `NoteSource` 接口，不关心底下
是 vault 文件、HTTP 接口还是块树。

## 目录

| 文件 | 作用 |
|---|---|
| `types.ts` | `NoteSource` 契约、`NoteEntry` 条目结构、`READONLY_REJECT` |
| `meta.ts` | **来源元数据**：`label` / `badge` / `color`，以及 `sourceBadge()` / `sourceCssClass()` / `isExternalSource()`。渲染层只调这些函数，不认识具体来源 |
| `fs.ts` | **本地文件存储抽象**：`NoteFile` / `NoteFileStore`（6 个方法）+ `MemoryFileStore`。让「本地文件类来源」不依赖任何宿主 API |
| `daily.ts` | **本地日记来源（可写）**：唯一实现了全部 5 个写方法的 `NoteSource`，DEC-026 |
| `blinko.ts` | Blinko **聚合**源（只读），直连 Blinko HTTP API |
| `blinko-local.ts` | Blinko **本地导出 md** 来源：读 vault 里 `Blinko/Notes/*.md` 的 frontmatter，DEC-027。与 `blinko.ts` 是两回事，只是共用 `source="blinko"` |
| `memos.ts` | memos 聚合源（只读），直连 memos REST API |
| `aggregate.ts` | 多来源聚合器：合并条目、统计、错误隔离 |

新增一个来源只需要两步：实现 `NoteSource`，再往 `meta.ts` 的 `SOURCE_META` 加一行。
**渲染层零改动** —— 这是「三宿主 × 多来源」能成立的真正原因。

## 两个 blinko，别搞混（DEC-027）

| | `blinko.ts` | `blinko-local.ts` |
|---|---|---|
| 数据从哪来 | `POST /api/v1/note/list` | vault 里的 `Blinko/Notes/*.md` |
| 开关 | 设置项 `blinkoApiEnabled` + 地址 + key | 设置项 `includeBlinko` |
| `source` | `"blinko"` | `"blinko"`（沿用历史数据） |
| `readonly` | `true` | `false` |
| 时间存在哪 | 接口字段 | frontmatter 的 `date:` |
| 能拖拽改时间吗 | 不能（没有本地行） | **也不能**（没有行首锚点，见下） |

关于本地导出的「可拖拽改时间」：历史注释（`ui/view.ts` / `types.ts` / `meta.ts`）
都写着「历史上一直允许拖拽改时间」，**实测不成立**。这类条目 `lineNum` 硬编码为 1、
`rawLine` 是去掉 frontmatter 的正文，而 `DailySource.updateEntryTime` 要求
`lines[lineNum-1]` 匹配「列表项 + 行首时间前缀」——导出文件第 1 行恒为 `---`，
所以三个写方法全部返回 `false`、零次写入（`test-blinko-local.mjs` 有一组断言把这条
反证钉住）。而且它们 `isRange` 为假 → 画成时间点线，点线的拖拽入口本就挡掉了
非 daily 来源，用户眼前从来没有过可拖的把手。

真要支持，得改写 YAML frontmatter 的 `date:` —— 那是独立功能，不在迁移范围。

**`readonly` 现在兼着两个语义**（`openEntry` 用它判断「有没有本地文件可跳转」），
所以本地 Blinko 导出不能标成 true，否则点击会提示「来自远程接口，没有对应笔记」。
这层耦合已登记为待办。

## 可写来源：`DailySource`（DEC-026）

`sources/` 不许 `import obsidian`，但日记读写天然要文件系统 —— 所以中间加一层
`NoteFileStore`（`fs.ts`），由宿主提供实现：

```
sources/daily.ts  ──依赖──▶  NoteFileStore  ◀──实现──  hosts/obsidian/vault-store.ts
                                  ▲
                                  └── MemoryFileStore（测试 / 无文件系统宿主）
```

`DailySource` 是**第一个、也是目前唯一**真正实现全部 5 个写方法的来源。
在此之前 `memos` / `blinko` 全是 `READONLY_REJECT`，契约的可写半边**零实现** ——
这意味着接口从没被「可写来源」验证过。迁它的目的就是把这个缺口补上：
Blinko / 思源宿主将来要接自己的本地笔记，靠的就是这条已经跑通的路径。

| 方法 | 行为 |
|---|---|
| `listEntries(start, end)` | 含首尾两天；没有日记的日子不报错，直接跳过 |
| `updateEntryTime(entry, s, e)` | 只改行首时间前缀；范围行、单时间行都能改；顺带清掉冲突的 `30m` 标签 |
| `updateEntryPointTime(entry, s)` | 只改行首单时间；**范围行一律拒绝**（点永远不会被扩成块，DEC-018） |
| `moveEntryToDate(entry, date, s, e)` | 先校验 `rawLine` 未漂移 → 先写目标日记 → 再删源行（连带缩进子项） |
| `toggleTask(entry)` | 就地改 `[ ]` / `[x]`，同步更新条目的 `isCompleted` |
| `createEntry(...)` | 建目录 + 建日记（含日期标题与快速记录标题），或插入已有同名标题下 |
| `ensureDailyNote(dateStr)` | 只保证日记存在并返回元数据，不写记录（DEC-017 的「打开即建」） |

**为什么读 / 写必须走 `vault.read(file)` / `vault.modify(file)`，而不是
`vault.adapter.read/write`**：只有前者会触发 `vault.on("modify")`，而多视图同步、
外部改动后自动刷新全靠这个事件。用更底层的 adapter 会静默丢掉整条刷新链路。
`hosts/obsidian/vault-store.ts` 因此按路径找回 `TFile` 再调 vault 方法。

## 宿主 × 来源矩阵

```
Obsidian 宿主 → 本地日记 + [Blinko 聚合] + [memos 聚合]
Blinko  宿主 → 本地 Blinko + [memos 聚合]
思源    宿主 → 本地思源块 + [Blinko 聚合] + [memos 聚合]
```

**每个宿主都能聚合全部来源**；聚合来源一律只读。

## 只读语义

聚合进来的条目**不可写、不可移动、不可勾选任务** —— 与 DEC-018 / DEC-022
已定的「外部来源不参与跨天移动」边界一致。

实现上不需要到处写 `if (source.readonly)`：只读来源直接复用
`READONLY_REJECT`，所有写方法都返回 `false`（= 未写入），行为明确且不会静默成功。

```ts
export const READONLY_REJECT = {
  updateEntryTime: async () => false,
  updateEntryPointTime: async () => false,
  moveEntryToDate: async () => false,
  toggleTask: async () => false,
  createEntry: async () => false
};
```

### ⚠️ 判「能不能回写」只能看 `entry.readonly`，不能看 `entry.source`

本地 Blinko 导出文件与 HTTP 聚合的 Blinko 条目 `source` **都是 `"blinko"`**，
但前者是 vault 里可写的 md 文件、后者连本地文件都没有：

| 条目 | `source` | `readonly` | 能拖拽改时间 |
|---|---|---|---|
| 本地日记行 | `"daily"` 或无 | 否 | 能 |
| vault 里 Blinko 导出的 md | `"blinko"` | 否 | 能（历史行为，保持不变） |
| Blinko API 聚合 | `"blinko"` | **是** | 不能 |
| memos API 聚合 | `"memos"` | **是** | 不能 |

所以聚合源产出条目时必须写 `readonly: true`（`memos.ts` / `blinko.ts` 的
`toEntry()` 里都有）。漏了它，用户就能拖远程记录：拖动时有反馈、松手后弹回，
而且 `updateEntryTime` 会去 vault 里找一个不存在的文件。

## 时间点语义

memos 与 Blinko 的每条记录都自带**创建时刻**（`createTime` / `createdAt`），
天然对应 TimeNote 的「时间点记录」（DEC-018：只有时刻、没有区间 → 画成线而非块）。

若正文里写了 `HH:mm-HH:mm`，则由 core 的 `parseLine` 判定为**时间块**；
两者并存时以正文的显式区间为准，否则用创建时刻。

时间戳统一换算成**本地时区**的当天时刻 —— 用户记录的那一刻，就是日历上该显示的那一刻。

## 接口形态（已核实）

**memos** — 官方 API 文档：
```
GET  {base}/api/v1/memos?pageSize=N&pageToken=T&filter=<CEL>
     Authorization: Bearer <token>
→ { memos: [{ name, createTime, content, tags, ... }], nextPageToken }
```
筛选用 CEL（`create_time >= "..." && create_time <= "..."`），在服务端做，避免拖回整个实例。

**Blinko** — 官方 API 与成熟第三方实现一致用法：
```
POST {base}/api/v1/note/list
     Authorization: Bearer <apiKey>
     { page, size, orderBy, type, tagId, isArchived, searchText }
→ [ { id, content, createdAt, tags, ... } ]     ← 直接是数组
```
`type`：0 = 闪念、1 = 笔记、2 = 待办、-1 = 全部。

Blinko 的 list 不支持按时间区间过滤，只能倒序翻页后本地筛 —— 实现里
「翻到早于区间起点就停」，否则会把整个实例都拖回来。

## 容错要求

**单个来源失败不得打断整个视图。** 聚合器逐来源 try/catch，把失败记进
`errors`、该来源本次计数为 0，其余来源照常渲染。

这是聚合模式最关键的健壮性要求：memos 服务挂了，Obsidian 日历还得能用。

## 构建与测试

```bash
npm run build:sources   # sources/index.ts → sources/index.mjs（ESM）
npm run test:sources     # 64 项：契约 / 映射 / 容错 / 只读拒绝 / 元数据 / 宿主接线 / 边界
npm run test:daily       # 79 项：可写路径（改时间 / 改时刻 / 跨天搬行 / 勾选 / 新建 / 缓存）
npm run test:blinko-local # 57 项：本地 Blinko 导出解析 / 路径规则 / 缓存 / 不可回写反证
```

## ⚠️ 与 Obsidian 侧「读 Blinko 导出文件」的区别

`main.ts` 的 `parseBlinkoFile` 读的是 **vault 里 Blinko 导出的 markdown 文件**
（靠 frontmatter 的 `date:` 拿时间），**不是**连 Blinko API。

两者可以并存，设置页是两个独立开关：`includeBlinko`（本地导出文件，可写）
与 `blinkoApiEnabled`（远程 API，只读）。导出文件方式适合离线 / 无 Token 场景，
API 方式更实时。

**`source` 字段虽然都叫 `"blinko"，宿主侧必须靠 `readonly` 区分二者** ——
详见上面「只读语义」的表格。

## 宿主接线（Obsidian，已完成）

| 位置 | 作用 |
|---|---|
| `DailyNoteService.buildRemoteSources()` | 按「启用 + 地址 + 令牌」三项齐全装配来源，缺一项不挂载（避免刷 401） |
| `DailyNoteService.collectRemoteEntries()` | 挂在 `getEntriesForRange` 末尾，按 `dateStr` 装桶，区间外丢弃 |
| `REMOTE_CACHE_TTL = 60s` | 区间级缓存，避免频繁重渲染反复打接口（移动网络尤其重要） |
| `saveSettings()` → `clearRemoteCache()` | 改完设置立即生效，不用等 TTL |
| 设置页「聚合远程来源」分组 | 两个来源各自：启用开关 / 地址 / 令牌（密码框）/ **测试连接** |
