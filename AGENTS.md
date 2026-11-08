# 工程智能体规范 (AGENTS.md — TimeNote / PCMP Lite)

## 项目硬事实
- **TimeNote**：Obsidian 社区插件，仓库 `AIDockerCloud/TimeNote`，默认分支 `main`；`author=AIDockerCloud`（DEC-006）。
- 生效协议：**PCMP v2.2 Lite**（纯 Markdown 权威、零运行时依赖）。原版 [PROJECT_CONTEXT_ZH.md](PROJECT_CONTEXT_ZH.md) / [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) 严禁改动。
- 接管必读顺序：`ai/PROJECT.md`（硬约束）→ `ai/STATE.md`（状态 + 活动任务，Lite 下无 TASK.md）→ `ai/DECISIONS.md`（ADR）。
- **标识（DEC-004）**：`id=timenote`、显示名 `TimeNote`、插件目录 `<vault>/.obsidian/plugins/timenote/`；内部命名空间 `timenote-*`（view type `timenote-calendar-view`、CSS 类 `.timenote-*`、类名前缀 `Timenote`）。中文功能描述「时间笔记」保留。
- **源码与产物**：`main.ts` 是唯一源码；`main.js` 是 esbuild 生成的 CJS 产物，**仍入库**以支持零构建安装；严禁直接编辑 `main.js`。交付三件套 = `manifest.json` + `main.js` + `styles.css`。
- **构建链（DEC-005）**：TypeScript 7.0.2 + esbuild 0.28.2，`obsidian` 1.14.4 仅提供类型；`tsconfig.json` 用 `moduleResolution: bundler`（TS7 已移除 `node10`）、`noEmit`、`strict: false`；`esbuild.config.mjs` 输出 CJS / browser，external 排除 `obsidian` / `electron` / `node:*`，产物不压缩。`package.json` 与 `package-lock.json` 入库，`node_modules/` 忽略。
- **渐进类型化现状**：6 个类暂用 `[key: string]: any` 索引签名并标 `TODO(types)`；全局扩展 `DomElementInfo.style`；事件 target 用 `HTMLInputElement` 断言；`leaf.view` 断言为 `TimenoteView`。`tsc` 已通过，但类型安全有限，后续按模块收紧。
- **时间块（DEC-007）**：不新增视图模式。`renderTimeGrid` 按 `settings.layoutMode` 分发到 `renderBlockGrid`（块布局，**默认**）或 `renderCompactGrid`（原压缩流 / 紧凑流）；块布局在 day / 3day / week 共用，绝对定位 `top/height` 由 `startSeconds`/`endSeconds` 换算，仅重叠簇内分 lane。工具栏可切换，设置项 `layoutMode`、`defaultDuration`（默认 60 分钟）。
- **时间块数据**：日记行内 `HH:mm-HH:mm`（也支持 `~`、`至`、`到`、`/`）、`30m`/`1h`/`45min` 时长标签；`parseLine` 给每条定时记录都算 `startSeconds`/`endSeconds`（单时间默认 30 分钟），并返回 `isRange`；`addEntry` 支持 `endTimeStr` 生成范围行。跨零点范围一期不支持（兜底为 30 分钟块）。
- **时间块边界**：只做「实际记录」（记录一段时间做了什么）；不做计划排程、容量规划、计时器、计划/实际区分；勾选任务待办是原有功能，不算排程。
- **当前时间线（DEC-009）**：仅块布局绘制。`renderBlockGrid` 在 `colsContainer`（已加 `position: relative`）末尾创建 `.timenote-now-line`，`left: 52px` 起（让开刻度列）横跨整行，左侧 `.timenote-now-label` 显示 `HH:mm`；`tickNowLine()` 按 `(now-startHour)/3600*slotHeight` 定位，当前时刻早于 `startHour` 或晚于 `endHour` 时 `display:none`，DOM 已被移除（`isConnected=false`）则直接返回。视图 `onOpen` 后由 `startNowClock()` 起 30s 定时器，`renderTimeGrid` 每次重渲染先 `stopNowClock()` 再重建，`onClose()` 兜底停表 —— **新增定时器务必在这三处收口**。
- 唯一数据源：周期日记 `SpiralNotes/YYYY/Daily/MM/YYYY-MM-DD.md`（`periodicNotesFolder` 可配置）；可选聚合 Blinko（`includeBlinko`）。
- 7 种视图：`day` / `3day` / `week` / `month` / `quarter` / `year` / `timeline`；默认设置见 `main.ts` 的 `DEFAULT_SETTINGS`。月 / 季 / 年仍只显示计数，不画块。
- **时间轴范围（DEC-008）**：`startHour` / `endHour` 默认 `0` / `24`（全天，**不改默认**），设置页有「时间轴起始/结束时间」两个下拉，块布局与紧凑流共用，改动即保存并重渲染；起始 ≥ 结束时自动抬高结束时间（`起始+1`，上限 24）并提示，结束 ≤ 起始时拒绝并提示。`slotHeight`（每小时槽高，默认 52px）自 DEC-009 起有滑块 UI（28–96px，步长 4，拖动防抖 150ms 后重渲染）。
- `manifest.json`：`version 1.0.0`、`minAppVersion 1.0.0`、`isDesktopOnly=false`；用户设置存于插件目录 `data.json`，不入库。

## 常用命令
- 安装依赖：`npm install`（首次 / 更新 lock 后）。
- 开发：`npm run dev`（watch，自动重建 `main.js`）；生产构建：`npm run build`（含 `tsc` 类型检查）。**改完 `main.ts` 必须先 build 再提交**。
- 校验：`npm run typecheck`、`npm run check`（类型检查 + PCMP 合规）、`node --check main.js`、`python3 scripts/pcmp_index.py --check`。
- 本地试用：复制三件套到 `<vault>/.obsidian/plugins/timenote/`，在 Obsidian 中启用。
- 注意：本项目**无自动化测试框架**；`npm run check` 是类型 + 文档合规检查，不是单元测试。
- **坑：查产物里的中文会假阴性**。esbuild 默认 `charset: "ascii"`，`main.js` 内的中文字符串被转义成**大写**十六进制 `\uXXXX`（如「时间轴」= `\u65F6\u95F4\u8F74`，只有 banner 是原样中文）。验证新文案是否进产物，请按大写转义序列 grep 或 `node -e "require('./main.js')"`，不要用 `grep 中文 main.js` 下结论。

## 红线与禁区
1. **协议与产品解耦**：PCMP 治理文件严禁被 `main.ts` 引用、打包或成为运行时依赖。
2. **锁定 `id=timenote`**：变更会使既有用户的 `data.json` 失效；改显示名、定位或数据源格式须先经人类确认并登记 ADR。
3. **产物不可手改**：只改 `main.ts`，再 `npm run build` 生成 `main.js`；提交前确保两者同步。
4. **日记是用户数据**：写回必须走 `app.vault.modify` 且只改目标行，保持其余内容、缩进与顺序不变；禁止批量重写用户笔记。
5. **时间块边界**：不得把时间块扩展成计划排程 / 容量规划 / 计时器，也不得引入 frontmatter 或独立笔记文件作为时间块数据源（DEC-007）。
6. **重大变更先留痕**：升级 TS / esbuild 主版本、增删依赖、改变产物入库策略前，在 `ai/DECISIONS.md` 追加 ADR，未经人类确认一律标 `Proposed`。
7. **收尾更新**：实质变更后递增 `ai/STATE.md` 的 `revision`，同步 `Last Updated` 与 Immediate Next Action；Lite 档位不建 TASK.md / sessions/。
8. **审阅授权**：审阅、审计或样式检查的材料由人类指定，未获许可不得擅自扫描全工程扩大范围。
