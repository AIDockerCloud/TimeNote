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
- **拖拽交互（DEC-011 / DEC-014）**：`attachSlotDrag` 负责空白槽拖拽创建（15 分钟吸附、最小 15 分钟、`timenote-block-ghost` 预览，拖动阈值 5px，未拖动则沿用单击默认时长）；`attachBlockDrag` 负责已有块「上/下边缘改起止、中部整体平移」（阈值 4px，**命中区按块高 1/3 取，2–9px，任何块高都能改边界，不再有 `< 30px` 退化分支**；起止一律夹在 `scale.dayStartSec`–`dayEndSec` 内），松手后经 `DailyNoteService.updateEntryTime` 回写并重渲染；`attachAllDayResizer` 负责拖动分隔条调 ALL DAY 行高度（32–320px，实时改内联样式，松手才存 `settings.allDayHeight`）。**拖拽结束浏览器会补一次 click**，块上用 `dataset.dragMoved` 标记吃掉，否则会误跳原笔记。
- **回写边界**：`updateEntryTime` 只改目标行的行首时间前缀（`rangeRe` / `singleRe` 两个锚定正则），并删掉行尾与时长相冲突的 `30m`/`1h` 标签；其余文本、标签、缩进、复选框一律不动。跨出可见时间轴（`startHour`–`endHour`）的记录不参与拖拽，避免把隐藏部分裁掉。
- **块布局网格留白（DEC-013 修订 DEC-010）**：`colsContainer` / 每个 `col` 高度为 `totalHeight + BLOCK_TOP_GUTTER + BLOCK_BOTTOM_GUTTER`，其中 **`BLOCK_TOP_GUTTER` 恒为 0**、`BLOCK_BOTTOM_GUTTER = 14`。**顶部留白一律不许加回来**：任何 > 0 的值都会在「全天区」和第一个整点之间多出一条空行（用户明确反馈过）。起始时刻的刻度标签改用 `.is-first`（`transform: translateY(0)`）贴住轴线，不再靠留白躲避裁切；底部留白保留，因为结束时刻的标签仍用 `translateY(-50%)` 居中、需要半行余量。全天区与网格之间的分隔条 `.timenote-header-resizer` 是**绝对定位**压在表头底边上的（8px 命中区），**不参与布局高度**，改成常规流元素会立刻多出一条空行。
- **块高恒等于时间跨度（DEC-013）**：块渲染高度 = `yOf(end) - yOf(start)`（下限 `MIN_RENDER_BLOCK_PX = 16`），**块的上下沿必须与刻度精确对齐**，否则下沿就不再代表结束时间（用户 2026-11-09 明确要求「块的时间范围要和时间轴一致」，此前 `min(跨度, estimateBlockNeed)` 的做法已被否掉）。**「内容多就高」只能靠行高实现**：`buildTimeScale` 里按行聚合 `estimateBlockNeed`（中文按 2 个宽度单位、行高 15.5px、最多 6 行、上限 240px），内容多的行自然变高，块随跨度一起变高。因此**任何行高改动都会直接改变块高**，调参时两者不能分开想。
- **表格化视觉 + 无把手边缘拖动（DEC-014）**：`renderBlockGrid` 的 `timenote-block-ruler-spacer` 拆成「日期行占位 + `ALL DAY` 行标签」两层 flex，标签随 `allDayHeight` 自动居中；表头 / ALL DAY 行 / 网格统一 `background-primary` + 同一套 `border-left` 竖线（表头列从 `border-right` 改 `border-left`），`ALL DAY` 行不加底色、不加粗线、chip 横向 wrap；刻度 0.72rem/600/正文色 + `text-shadow` 描边断线，当前小时加 `.is-now`（主色 + 9px 引出线），当前时间线也改主色；块 20% 底 / 42% 边 / 4px 左色条 / 7px 圆角，文字一律正文色，meta 只写起止时刻，时长在右下角 `.timenote-event-block-duration`。**不创建任何 `.timenote-block-edge` / grip DOM**：边缘命中判定与 `cursor`（ns-resize / grab / grabbing）全在 `attachBlockDrag` 里按 `getBoundingClientRect()` 实时算；`.timenote-header-resizer::after` 也改为仅 hover 时浮现，静态表格里看不到把手。
- **当前时间线（DEC-009）**：仅块布局绘制。`renderBlockGrid` 在 `colsContainer`（已加 `position: relative`）末尾创建 `.timenote-now-line`，`left: var(--tn-ruler-w, 64px)` 起（让开刻度列）横跨整行，左侧 `.timenote-now-label` 显示 `HH:mm`；`tickNowLine()` 按 `scale.yOf(nowSec)` 定位（**不许**再手写 `(now-startHour)/3600*slotHeight`，弹性轴下行高不等距会跑偏），当前时刻早于 `startHour` 或晚于 `endHour` 时 `display:none`，DOM 已被移除（`isConnected=false`）则直接返回。视图 `onOpen` 后由 `startNowClock()` 起 30s 定时器，`renderTimeGrid` 每次重渲染先 `stopNowClock()` 再重建，`onClose()` 兜底停表 —— **新增定时器务必在这三处收口**。
- **真机颜色与列对齐（DEC-015）**：Obsidian **从未定义** `--color-accent-rgb`，`--color-orange-rgb` / `--color-green-rgb` / `--color-purple-rgb` 自 1.13 起弃用，`--background-modifier-border-rgb` 也不存在 → 旧写法 `rgba(var(--xxx-rgb), a)` 在真机上整条声明失效（预览脚本自己补了变量，所以「预览有颜色、真机全透明」）。现在全量改为「固定 `rgba()` 兜底 + `color-mix(in srgb, var(--color-accent 等) N%, transparent)`」双声明。**列错位**根因是 `.timenote-block-ruler-spacer` 作为 flex item 默认 `min-width:auto`，被 `ALL DAY` 标签的 min-content 撑宽约 6px，导致 7 个日期列相对网格逐列偏移；修法是刻度列统一 `--tn-ruler-w: 64px`（与 `main.ts` 的 `BLOCK_RULER_W` 同值）、spacer 加 `min-width:0` + `overflow:hidden`、网格列显式 `border-right: none`（去掉紧凑流继承来的双线），并把滚动条补偿抽成 `syncHeaderGutter()`（rAF 首帧 + `ResizeObserver` 持续同步，两个渲染器共用）。`scripts/dev/preview-real-dom.mjs` 复刻真实 DOM 且**故意不定义**那些 `-rgb` 变量，页面底部探针会输出 7 列的 left/width 偏差与各类 computed background-color。
- **按天自动配色（DEC-016）**：同一天的时间块默认颜色两两不同。调色板 = Obsidian 官方 8 个扩展色 `purple/blue/cyan/green/yellow/orange/red/pink`（`var(--color-*, #fallback)`，明暗主题自动适配、主题缺变量时也不会全透明）。`assignDayTints(items)` 是模块级纯函数（`main.ts` 的 `BLOCK_TINT_BEGIN/END` 区块）：显式指定先占位 → 未指定块以 `tintEntryKey()` 的 hash 为偏好色 → 当天已用过则顺延到下一个未用色 → 超过 8 个块时允许复用但不与相邻同色。调用前按「开始时间 → 行号 → 文本」稳定排序，保证重渲染不跳色、新块自动拿到当天未用色。**指定通道**：日记行写 `#color/blue`、`#色/绿` 或 `#color/#7c5cff`，`parseLine` 解析成 `entry.tint` 并从 `tags` 中剔除；CSS 侧统一用 `--tn-tint` 变量驱动背景/边框/左色条，任务块不再固定橙色（任务语义由复选框表达）。ALL DAY chip 与紧凑流不参与配色。
- 唯一数据源：周期日记 `SpiralNotes/YYYY/Daily/MM/YYYY-MM-DD.md`（`periodicNotesFolder` 可配置）；可选聚合 Blinko（`includeBlinko`）。
- 7 种视图：`day` / `3day` / `week` / `month` / `quarter` / `year` / `timeline`；默认设置见 `main.ts` 的 `DEFAULT_SETTINGS`。月 / 季 / 年仍只显示计数，不画块。
- **时间轴范围（DEC-008）**：`startHour` / `endHour` 默认 `0` / `24`（全天，**不改默认**），设置页有「时间轴起始/结束时间」两个下拉，块布局与紧凑流共用，改动即保存并重渲染；起始 ≥ 结束时自动抬高结束时间（`起始+1`，上限 24）并提示，结束 ≤ 起始时拒绝并提示。`slotHeight`（每小时槽高，默认 52px）自 DEC-009 起有滑块 UI（28–96px，步长 4，拖动防抖 150ms 后重渲染）。
- `manifest.json`：`minAppVersion 1.0.0`、`isDesktopOnly=false`，`version` 见文件本身（当前为 1.0.6）；**特性分支 `feat/elastic-timeline` 已于 2026-11-09 快进合入 `main`，后续一律在 `main` 上推进**；用户设置存于插件目录 `data.json`，不入库。真机 vault 的 `data.json` 当前为 `startHour=6` / `endHour=24` / `slotHeight=36` / `allDayHeight=32` / `elasticTimeline=true`（2026-11-09 复核），已与目标态一致；改默认值不会影响它。
- **版本号规则（DEC-010）**：**每次提交 patch +1**（`1.0.1` → `1.0.2`），用 `npm run bump` 自动同步 `manifest.json` / `package.json` / `versions.json`（后者为版本→`minAppVersion` 映射，社区发布必需）。bump 后必须 `npm run build` 再提交；`versions.json` 已被 Obsidian 校验，勿手改单处。

## 常用命令
- 安装依赖：`npm install`（首次 / 更新 lock 后）。
- 开发：`npm run dev`（watch，自动重建 `main.js`）；生产构建：`npm run build`（含 `tsc` 类型检查）。**改完 `main.ts` 必须先 build 再提交**。
- 校验：`npm run typecheck`、`npm run check`（类型检查 + PCMP 合规）、`node --check main.js`、`python3 scripts/pcmp_index.py --check`。
- 本地部署（真机 vault）：`/home/inverstar/文档/Time/.obsidian/plugins/timenote/`，只需覆盖 `manifest.json` + `main.js` + `styles.css`（README 可一并覆盖）。**Obsidian 要求文件夹名 == `manifest.id`**，故该目录必须是 `timenote/`，且 `.obsidian/community-plugins.json` 里要列 `"timenote"`（旧值是 `"time-notes"`，改 id 时务必一起换，否则插件不加载）。该 vault 目前**没有** `data.json`，改 id 无配置迁移风险；覆盖前把旧文件备份到 `~/tmp/`。
- 版本递增：`npm run bump`（自动 +0.0.1，也可 `npm run bump -- 1.2.0` 指定），随后 `npm run build`。
- 开发脚本（都在 `scripts/dev/`，需要先 `npm run build`，测的是产物里的真实实现）：
  - `npm run test:timeline` —— 弹性时间轴数学与分配 33 项断言（单调、互逆、空档压缩、内容单调、视口封顶、等距回退等）。
  - `npm run preview:timeline` —— 生成静态对比预览到 `scripts/dev/out/timeline-preview.html`（等距 vs 弹性）；加 `-- --compare=clip` 换成「块被截短 vs 块铺满跨度」。
  - `npm run test:drag` —— 拖拽吸附与 `updateEntryTime` 回写 23 项（只改目标行、保留复选框 / 缩进 / 列表符 / 标签；另含 DEC-014 的「任意块高都有三段命中区、源码无把手 DOM / 无 `< 30px` 退化分支」断言）。
  - `npm run preview:target` —— 生成目标态视觉稿到 `scripts/dev/out/target-design.html`（加 `-- --dark` 生成深色版）。稿子里的块可交互：光标移到上/下沿会变 ns-resize，用来核对「无把手」的手感。
  - `npm run test:visual` —— 20 项视觉回归静态断言（无失效 `-rgb` 写法、双声明兜底、刻度列宽 CSS/TS 一致、spacer 不撑宽、网格无双线、`syncHeaderGutter` 两处调用、块色由 `--tn-tint` 驱动）。
  - `npm run test:tints` —— 25 项按天配色断言（同天互异、8 色用满、重渲染稳定、新块拿未用色、显式指定优先、跨天独立、超容量不撞相邻、`parseLine` 指定通道）。
  - `npm run preview:real` —— 生成 `scripts/dev/out/real-dom.html` / `real-dom-dark.html`：复刻真实 DOM + 内联真实 `styles.css`，变量环境对齐 Obsidian（不补 `-rgb`）。用浏览器打开可看底部探针（列偏差应为 0px、背景色非空、同一天块色互异）；这是「预览好看但真机没色」这类问题的第一排查入口。
  - `npm test` —— 上面四套测试一起跑（33+23+20+25）。
  - `scripts/dev/lib/elastic.mjs` 负责从 `main.js` 切出 `buildTimeScale` / `estimateBlockNeed`（产物不导出内部函数），改了常量名或函数顺序要同步这里的切分标记；拖拽测试则直接从 `main.ts` 抽函数源码。
- 注意：本项目**无自动化测试框架**；`npm run check` 是类型 + 文档合规检查，不是单元测试。
- **坑：查产物里的中文会假阴性**。esbuild 默认 `charset: "ascii"`，`main.js` 内的中文字符串被转义成**大写**十六进制 `\uXXXX`（如「时间轴」= `\u65F6\u95F4\u8F74`，只有 banner 是原样中文）。验证新文案是否进产物，请按大写转义序列 grep 或 `node -e "require('./main.js')"`，不要用 `grep 中文 main.js` 下结论。

## 红线与禁区
1. **协议与产品解耦**：PCMP 治理文件严禁被 `main.ts` 引用、打包或成为运行时依赖。
2. **锁定 `id=timenote`**：变更会使既有用户的 `data.json` 失效；改显示名、定位或数据源格式须先经人类确认并登记 ADR。
3. **产物不可手改**：只改 `main.ts`，再 `npm run build` 生成 `main.js`；提交前确保两者同步。
4. **日记是用户数据**：写回必须走 `app.vault.modify` 且只改目标行，保持其余内容、缩进与顺序不变；禁止批量重写用户笔记。
5. **时间块边界**：不得把时间块扩展成计划排程 / 容量规划 / 计时器，也不得引入 frontmatter 或独立笔记文件作为时间块数据源（DEC-007）。
6. **重大变更先留痕**：升级 TS / esbuild 主版本、增删依赖、改变产物入库策略前，在 `ai/DECISIONS.md` 追加 ADR，未经人类确认一律标 `Proposed`。
7. **版本号先于提交**：任何进 Git 的功能/修复提交都必须先 `npm run bump`（patch +1）并重新 build（DEC-010）。
8. **收尾更新**：实质变更后递增 `ai/STATE.md` 的 `revision`，同步 `Last Updated` 与 Immediate Next Action；Lite 档位不建 TASK.md / sessions/。
9. **时间轴换算只能走 `buildTimeScale()`**：块的 `top/height`、整点刻度线、当前时间线、拖拽创建/调节的像素↔时间换算，一律经 `scale.yOf()` / `scale.secOf()`；**禁止**再手写 `BLOCK_TOP_GUTTER + (sec - dayStartSec)/3600 * slotHeight`。弹性时间轴下行高不等距，散落的旧公式不会报错、只会静默错位（DEC-012）。
10. **临时脚本落 `scripts/dev/`**：一次性脚本、探针、数据核对一律建在项目内 `scripts/dev/`，不要写到 `/tmp`、`$HOME` 或项目根；**能复用的留下并写进本文件的「常用命令」**，纯粹一次性（跑完就没用的核对脚本）在任务收尾时删除。预览等生成产物写 `scripts/dev/out/`（已 gitignore，可随时重建）。
11. **不画拖拽把手、任意块高都能改起止**：禁止再往块里塞 edge / grip DOM，也禁止恢复「块高 < N px 只允许平移」的退化分支；边缘命中区按当前 `rect.height / 3` 实时算（2–9px 夹取），光标变化是唯一提示（DEC-014）。
12. **颜色禁用 `rgba(var(--*-rgb), a)`**：Obsidian 没定义 `--color-accent-rgb`，1.13 起 `-rgb` 系列弃用；一律用「固定 rgba 兜底 + `color-mix(in srgb, var(--color-accent 等) N%, transparent)`」双声明。预览脚本**不许**自行补 `-rgb` 变量来「修好」画面，那只会掩盖真机问题（DEC-015）。
13. **表头与网格列必须逐列对齐**：刻度列宽由 `--tn-ruler-w`（CSS）与 `BLOCK_RULER_W`（TS）常量同步；spacer 必须 `min-width:0` + `overflow:hidden`（flex item 的 `min-width:auto` 会被文字撑宽）；网格列必须显式 `border-right: none`；滚动条补偿统一走 `syncHeaderGutter()`，禁止只在首帧 `requestAnimationFrame` 量一次（DEC-015）。
14. **块颜色只能由 `assignDayTints()` 决定**：禁止给 `.timenote-event-block` 按 `is-task` / `is-memo` 写死单一颜色，也禁止用未定义或已弃用的 `--*-rgb` 变量拼 `rgba()`；调色板色值必须带固定色 fallback。新增 / 删除块允许重新分配当天颜色，但同一天渲染结果必须两两不同、且重渲染可复现（DEC-016）。
15. **审阅授权**：审阅、审计或样式检查的材料由人类指定，未获许可不得擅自扫描全工程扩大范围。
