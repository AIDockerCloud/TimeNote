# TimeNote for Blinko

把 TimeNote 的时间轴 / 全周期日历带进 Blinko，与 Obsidian、思源版共用同一份
渲染引擎、解析规则与远程聚合逻辑。

> ⚠️ **首版状态**：按 Blinko 主仓插件运行时源码实现并跑通离线模拟测试，
> **尚未在真机 Blinko 验证**。安装后请按文末「验收清单」逐项试一遍。

## 安装

Blinko 的插件安装器从插件 `url` 指向的 GitHub 仓库下载 Release 资产：

```
https://github.com/AIDockerCloud/TimeNote/releases/download/v<version>/release.zip
```

从 `v1.1.3-beta.1` 起，`.github/workflows/release.yml` 会随每个 `v*` tag 自动构建，
并把 `dist/blinko/release.zip` 作为名为 **`release.zip`** 的资产挂到 Release 上，
无需手工上传。正式版在 Blinko「设置 → 插件 → 市场」里安装；**预发布 tag 带后缀**
（如 `v1.1.3-beta.1`），安装器一般只读 Latest，预发布阶段请手动下载
`releases/download/v1.1.3-beta.1/release.zip` 解压安装。
`plugin.json` 的 `version` 是主版本段（如 `1.1.3`），由打包脚本读 `manifest.json` 覆盖。

手动安装（开发调试）：把 `release.zip` 解压到
`<Blinko 容器>/.blinko/plugins/timenote-blinko/`，目录内直接是
`index.js` / `index.css` / `plugin.json`；再在数据库的 plugin 表里注册
`path = /plugins/timenote-blinko/index.js`，重启 Blinko。
正式发布走上面的 Release 路径更省事。

## 数据存在哪里（重要）

记录就是**Blinko 自己的笔记**，不是插件私有文件：

| TimeNote 概念 | Blinko 里的对应物 |
|---|---|
| 一天日记 `YYYY-MM-DD.md` | 归属该日的一组 notes |
| 一条记录（md 的一行） | 一条 note |
| 行首时间 `09:00` / `09:00-10:30` | note 正文首行的时间前缀 + `metadata.timenote.time` |
| 归属日期 | `metadata.timenote.date`，没有时回退 `createdAt` |
| 缩进子项 | note 正文的后续行 |
| 拖拽改时间 / 勾选待办 | 行级 diff → `notes.upsert.mutate` |
| 跨天搬移 | 目标日新建 note + 源 note 移入回收站（`trashMany`，可恢复） |

插件走 `window.Blinko.api` 的登录会话，不需要额外 API Token。删除一律进回收站，
不做硬删。列表查询用 `startDate / endDate` 在服务端过滤，默认只回看 90 天，
避免把整个实例拖回来（手机热点流量敏感）。

> `metadata` 会与 note 原有 metadata 合并，不会冲掉 Blinko 自己的字段。

## 功能

- 日 / 3 天 / 周 / 月 / 季 / 年 / 时间线 7 种视图、块布局与紧凑流；
- 时间块 / 时间点拖拽改时间、横向跨天搬移、点击勾选待办、快速记录弹窗（**标题必填、正文选填**，正文每行写成 Tab 缩进子项；拖拽创建时保留「待创建」预览并随弹窗时间范围实时变化）；
- 远程来源聚合：memos 与另一台 Blinko 的 HTTP 接口（只读，需自行填地址 + 令牌），
  60 秒区间缓存、单源失败不打断日历；
- 工具栏图标 → 「打开 TimeNote 日历」全屏对话框；设置 → 插件 → TimeNote 里有完整设置面板。

## 设置

字段与 Obsidian 版一致，另有 Blinko 专有项：

| 项 | 说明 |
|---|---|
| 本地笔记回看天数 | 默认 90；越大首次同步越费流量 |
| 日记根目录 | 虚拟路径前缀，默认 `SpiralNotes` |

`includeBlinko`（读 vault 里的导出 md）与 `dailyNoteTemplate`（Obsidian 日记模板）
在 Blinko 端不生效。

## 已知边界（首版）

- 「打开当天日记」显示的是当天的笔记文本弹窗（只读），不是 Blinko 原生编辑页；
  新增记录请用日历里的「+ 记一条」。
- 点某条记录会显示该 note 的内容弹窗；Blinko 没有公开的「跳转到笔记」插件 API。
- 外部变更检测用 120 秒低频轮询 + 若干常见事件名兜底，页面不可见时不轮询；
  日历里的刷新按钮可随时手动触发。
- 跨天搬移时，源记录的缩进子项不会一起复制到目标 note（子项归属上一条 note）。
- 弹窗是插件自绘 DOM（内联样式），不跟随 Blinko 主题深浅色；日历主体复用
  `styles.css`，会跟随主题。
- `destroy()` 无法移除已注册的工具栏图标（宿主 API 没有 remove），图标会留到页面刷新。

## 验收清单

1. 安装启用后工具栏出现日历图标，点「打开 TimeNote 日历」能看到周视图，无控制台报错。
2. 在 Blinko 里写一条 `- 09:00 到公司` → 日历当天 09:00 出现点线（或按 createdAt 出现）。
3. 点「+ 记一条」加时间块 → Blinko 笔记列表里多一条带时间前缀的 note。
4. 把记录横拖到隔壁日期列 → 目标日出现新 note，源 note 进回收站（不是彻底删除）。
5. 设置里填 memos 地址 + 令牌 → 日历出现 memos 条目且不可拖动。
