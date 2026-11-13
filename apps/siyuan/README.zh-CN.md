# TimeNote for 思源笔记

把 TimeNote 的时间轴 / 全周期日历带进思源。与 Obsidian 版共用同一份渲染引擎、
解析规则与远程聚合逻辑，行为一致。

> ⚠️ **首版状态**：按思源内核源码实现并跑通离线模拟测试，**尚未在真机思源验证**。
> 安装后请先按文末「验收清单」逐项试一遍，有问题把控制台日志发回来。

## 安装

1. 本地执行 `npm run build:plugins`，产物在 `dist/siyuan/package.zip`
   （`plugin.json` 的 version 由脚本读仓库 `manifest.json` 覆盖）。
2. 解压到 `<思源工作空间>/data/plugins/timenote-siyuan/`，目录内应直接看到
   `plugin.json` / `index.js` / `index.css` / `i18n/`。
3. 重启思源（或「设置 → 插件 → 重新加载」），在插件列表里启用 TimeNote。
4. 顶栏右侧出现日历图标，点它打开「TimeNote 时间笔记」页签。

> **发布状态（从 v1.1.3-beta.1 起）**：`.github/workflows/release.yml` 会随每个
> `v*` tag 自动构建并把 **`package.zip`** 挂到 Release（与 Blinko 的 `release.zip`
> 不冲突）。正式版可从 `releases/download/v<version>/package.zip` 下载；
> **预发布 tag 带后缀**，例如本次是
> `releases/download/v1.1.3-beta.1/package.zip`。下载后按上面第 2 步解压即可。

集市安装：思源集市要求「插件名与仓库名一致」，本插件寄居在
`AIDockerCloud/TimeNote` 单仓里，因此**首版不走集市**，用上面的手动安装方式。

## 数据存在哪里（重要）

本插件把记录写进**思源自己的文档**，不是插件私有的 md 文件：

| TimeNote 概念 | 思源里的对应物 |
|---|---|
| 一天日记 `<folder>/YYYY/Daily/MM/YYYY-MM-DD.md` | 路径 `/<folder>/YYYY/Daily/MM/YYYY-MM-DD` 的文档，标题为 `YYYY-MM-DD` |
| 一条记录（md 的一行） | 文档里的一个块（列表项 / 段落 / 标题） |
| 缩进子项 | 该块的子块 |
| 拖拽改时间 / 跨天搬移 / 勾选待办 | 行级 diff → `updateBlock` / `insertBlock` / `deleteBlock` |

**绝不整篇覆盖**：写回只动变化的那几个块，块 id、块引用、其它内容都保留。
默认日记目录是 `SpiralNotes`，可在设置里改；新建文档走
`/api/filetree/createDocWithMd`，读取走 `/api/query/sql`，全程使用思源内核 API
（符合官方「不许直接 fs 读写 data 目录」的规范）。

思源原生「每日笔记」也能被读进来：插件会顺带扫描
`custom-dailynote-yyyymmdd` 属性的文档，按日期合并进同一张日历。

### 记录格式（与 Obsidian 版完全一致）

```markdown
- 09:00 到公司
  - 顺手买咖啡
- 14:00-15:30 需求评审 #color/blue
- [ ] 19:30 复盘
```

时间点写单个 `HH:mm`（画精确时刻线），时间块写 `HH:mm-HH:mm`（画有高度的块）。

## 功能

- 日 / 3 天 / 周 / 月 / 季 / 年 / 时间线 7 种视图、块布局与紧凑流可切换；
- 时间块 / 时间点拖拽改时间、横向拖到别的日期列跨天搬移、点击勾选待办；
- 快速记录弹窗（单击切换时间点 / 时间块；**标题必填、正文选填**，正文每行写成 Tab 缩进子项，不会再冒出无时间的 ALL DAY 条目；从空白槽拖拽创建时日历上保留「待创建」预览，随弹窗的时间范围 / 标题实时变化，取消或保存才消失）、子项详情、日期标题直达当天日记；
- 远程来源聚合：memos 与 Blinko HTTP 接口，与 Obsidian 版同为只读，
  60 秒区间缓存（保护手机热点流量）、单源失败不打断日历；
- 点记录可跳回思源文档，点日期标题会打开 / 新建当天文档。

## 设置

设置 → 插件 → TimeNote → 设置。字段与 Obsidian 版一致，另有思源专有项：

| 项 | 说明 |
|---|---|
| 思源笔记本 ID | 留空自动取第一个已打开的笔记本；多笔记本时建议明确指定 |
| 日记根目录 | 默认 `SpiralNotes`，决定文档路径前缀 |

`dailyNoteTemplate` 在思源端固定走内置结构（`# 日期` + 快速记录标题），
不读 Obsidian 日记插件的模板配置；`includeBlinko`（读 vault 里的导出 md）
是 Obsidian 专有通道，思源端恒关闭。

## 已知边界（首版）

- 只处理 `i / p / h / l` 四类块；表格、代码块、数据库等复杂块不进日历，
  但也不会被改写或删除。
- 新插入的块按 `previousID` 尽量贴近原位置，跨块大范围重排未做。
- 空行不建块；虚拟文本按「块行拼接」生成，`lineNum` 因此保持稳定。
- `onExternalChange` 订阅 `ws-main`，目前按命令名粗过滤事务类消息；
  若发现刷新不及时，可在日历里点刷新按钮手动触发。
- 弹窗是插件自绘的 DOM（内联样式），不跟随思源主题的深浅色；
  日历主体仍复用 `styles.css`，会跟随主题。
- 未做移动端适配（`frontends` 只声明桌面 / 浏览器桌面 / 独立窗口）。

## 验收清单

1. 启用后顶栏出现图标，点开能看到周视图，没有控制台报错。
2. 在思源里新建一篇 `/SpiralNotes/2026/Daily/11/2026-11-12` 文档，写
   `- 09:00 到公司` → 日历当天 09:00 出现一条点线。
3. 点工具栏「+ 记一条」加一条时间块 → 文档里多出一个块，且原有块 id 不变。
4. 把记录横拖到隔壁日期列 → 源文档少一个块、目标日期文档多一个块。
5. 设置里填 memos 地址 + 令牌 → 日历出现 memos 条目，且不可拖动。
