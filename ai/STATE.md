---
pcmp_version: "2.2"
revision: 27
updated: 2026-11-10
---

# 项目当前状态与活动任务快照 (STATE.md — Lite)

- **Last Updated**: 2026-11-10
- **Overall Status**: [事实] 插件主体功能已实现（7 视图 + 日记解析 + 双向回写 + 设置页）；[已确认] 时间块记录按 DEC-007 落地——共享块布局渲染层、可切换、默认块布局、只做实际记录；TypeScript + esbuild 构建链与 PCMP v2.2 Lite 上下文体系已在 `8b110bd` 入库。截至 `e5285db` 的代码**已推送到 `origin/main`**（2026-11-08 23:06 核实，本地与远端同一 SHA）。`versions.json` 与 `npm run bump` 版号机制已补（DEC-010）。**`feat/elastic-timeline` 的 1.0.1–1.0.5 五个签名提交已于 2026-11-09 快进合入 `main`（`5a2909a`），后续一律在 `main` 上推进**；当前版本 **1.0.7**（DEC-017 日期标题直接打开当天日记 + DEC-018 时间点线合并为一次提交），已 build / 174 项测试 / PCMP check 通过并部署真机 vault，**2026-11-09 14:2x 已在会话内完成签名提交并经 SSH 推送到 `origin/main`**，本地与远端同一 SHA。`origin` 为 `git@github.com:AIDockerCloud/TimeNote.git`（SSH）。DEC-018 时间点线把单时间点记录从 30 分钟任务块改成精确时刻的横线（线下信息、整条拖动只改时刻、无边缘拉伸）；三件套 + README 已备份后覆盖到真机 vault（备份 `~/tmp/timenote-backup-20261109-1245`，四个文件 md5 与仓库一致），待 reload 肉眼验收。仍无 LICENSE / 自动化测试。**发版链路已补（DEC-019）**：`.github/workflows/release.yml` 由 `v*` tag 触发 `npm ci` / build / `npm run pack`，把三件套 + `timenote-<version>.zip` 挂到 Release，并硬校验 tag 与 `manifest.json` 版本一致；`scripts/pack.mjs` 纯 Node 打 zip（根目录三件套、`dist/` 不入库）。版本已 `1.0.7 → 1.0.8`，本地 `dist/timenote-1.0.8.zip` 校验通过，**首次发版只差用户推 tag**（DEC-019）。**同批未提交的还有 DEC-020**：快速记录插入标题改由配置值指定层级与名称（`## 灵感闪念` / `### 随手记`），纯函数 + 四处调用点 + 44 项新测试已完成、`npm test` 218 项全过，版本维持 1.0.8 不重复 bump，`dist/timenote-1.0.8.zip` 已重打；三件套 + README 已备份后部署真机 vault（备份 `~/tmp/timenote-backup-20261109-1711`，四文件 md5 与仓库一致，`data.json` 未动、仍是旧纯文本 `灵感闪念`，正好验兼容），待 reload 验收。**最新状态（2026-11-09 17:3x，覆盖本行以上历史措辞）**：1.0.8 已签名提交 `6a58e59` 并推 `v1.0.8` 正式发布（Actions run `42592193408` 全绿、Release 4 个资产、包内容与源码一致），DEC-019 / DEC-020 均已入库；当前工作区是 **1.0.9 未提交** 的 DEC-021 bugfix —— 修「新建时间块后页面下方重复渲染一个日历视图」（async `renderView` 并发竞态 → `renderGeneration` 代号防线 + 容器改 `contentEl`），新增 18 项测试、`npm test` 236 项全过，真机 vault 已重新备份部署。
- **最新状态（2026-11-10 17:xx，覆盖本行以上历史措辞）**：v1.0.9 已签名提交 `931074d` 并推 `v1.0.9`（Release 已发），工作区从干净状态起步。本轮 **DEC-022**（用户 2026-11-10 17:2x 指令「时间块拖动不能跨天，请支持跨天；新增只能新增时间块，请提供新增时间点信息的功能」）已完成：① 块（中部平移）与时间点线可横向拖到当前视图其它日期列，按 `dataset.dateStr` 找落点、目标列描边高亮，回写走新增的 `DailyNoteService.moveEntryToDate()`（行号漂移校验 → 先写目标日记 → 再删源行，连带缩进子项，块仍是范围 / 点仍是单时间，外部来源与跨零点仍不支持）；② 新增「时间点」显式入口 —— `defaultAddType` 设置 + 工具栏「新增：时间块 / 时间点」按钮 + 快速记录弹窗「记录类型」下拉 + 空白槽点模式（15 分钟吸附、虚线预览、`Alt` 临时切换）。`main.ts` / `styles.css` / `test-quick-add-section.mjs`（`addEntry` 切片按方法名定位并同步签名）/ `package.json` / README / AGENTS / DEC-022 ADR 已改；新增 `scripts/dev/test-cross-day.mjs`（84 项），`npm test` = **320 项全绿**，`npm run typecheck` / `build` 通过。**版本 `1.0.9 → 1.0.10`（已 bump + 重新 build），未提交、未打 tag**；真机 vault 三件套 + README 已备份后覆盖，待 reload 验收。
- **档位**：PCMP Lite（活动任务合并维护于此，无 `TASK.md` / `PLAN.md` / `sessions/`）。

---

## 🎯 当前唯一活动任务 (Active Task)

- **任务名称**：自适应时间轴 + 目标态视觉（DEC-013 / DEC-014）—— 行高由内容决定、块高恒等于时间跨度、周视图一整张表格化、无把手且任意块高可拖边缘（实验分支）
- **背景与范围**：用户 2026-11-08 23:28 提出「自适应高度」，23:47 追加「全天任务行和开始时间有个奇怪的空行，风格不统一，参考 tasknotes/taskquence 美化，高度和内容强相关，内容不多不必拉高」；2026-11-09 00:09 要求「块的时间范围要和时间轴一致」；00:35–00:50 两轮效果图确认目标态（时间刻度加重、ALL DAY 行并入表格、块实色不遮字、表头不割裂）；00:51 批准效果图并追加「为什么要把手？去掉把手，我希望边缘自然拖动，无论大小都要可以，……请实现」。范围：`main.ts` 的 `buildTimeScale()` / `estimateBlockNeed()` / `renderBlockGrid()` / `attachBlockDrag()` / `tickNowLine()`、`styles.css` 全量视觉、`scripts/dev/preview-target-design.mjs`、`AGENTS.md` 红线、README 与 DEC；不改数据源、不改视图体系、不改紧凑流渲染、不改已确认的弹性行高策略。
- **约束与非目标**：块高 **必须** 恒等于自身时间跨度（`yOf(end) - yOf(start)`），「内容多就高」只能靠行高实现，禁止再把块从跨度里截短；`BLOCK_TOP_GUTTER` 恒 0（任何正值都会在全天区与第一个整点之间多出一条空行）；映射必须严格单调且连续；**不画任何把手 DOM/CSS，任意块高都必须能改起止**（DEC-014 / AGENTS 红线 11）；保留弹性行高（等距仍由设置开关提供）；关闭 `elasticTimeline` 后逐像素回到旧等距实现；不做跨日连续轴、不做真实 DOM 文字测量（用字数估算）。
- **关联文件**：`main.ts`、`main.js`、`styles.css`、`manifest.json`、`package.json`、`versions.json`、`README.md`、`AGENTS.md`、`ai/STATE.md`、`ai/DECISIONS.md`、`scripts/dev/`（弹性轴测试、拖拽回写测试、静态预览生成）
- **验收标准**：
  - [x] 行高改为内容定高：空档行 `slotHeight*0.34`（下限 16px）、有条目行 `max(slotHeight*0.9, 40px)`，再按纵向槽位装箱把块需要的高度补足；
  - [x] 放弃总高守恒（DEC-013）。内容不足视口时整体等比放大行距；块本身仍按内容定高；
  - [x] 块渲染高度恒等于自身时间跨度（上沿=开始时间、下沿=结束时间），同 lane 的块不重叠；被长条目覆盖的中间小时抬到最小内容行高，不被掐成细条；
  - [x] 消灭「全天区与第一个整点之间的空行」：`BLOCK_TOP_GUTTER` → 0、起始刻度用 `.is-first`、分隔条改绝对定位；
  - [x] 视觉统一：表头 1px 单线、全天区与表头同底色、刻度列去双线、今日列淡色底（块的 6px 圆角 / 3px 左色条 / 淡色底已由 DEC-014 改为 7px / 4px / 20% 实色底 + 42% 边）；
  - [x] 33 个数学用例通过（行高恒正 / 严格单调 / `yOf`↔`secOf` 互逆 / 端点对齐 / 空档压缩 / 内容量单调 / 长跨度装得下 / 视口填充 / 等距回退 / 非零起点 / 全空退化 / 同小时多条 / 典型一天形态）；
  - [x] `npm run typecheck` / `build` / `python3 scripts/pcmp_index.py --check` 全部通过；
  - [x] 版本 `1.0.3` → `1.0.4`，已构建并部署到真机 vault；
  - [x] 目标态视觉落地（DEC-014）：表头 / ALL DAY / 整点网格同底同竖线、ALL DAY 行无独立底色与粗线、刻度 600 字重正文色 + 当前小时主色、块实色不遮字、时长落右下角；
  - [x] 去掉所有把手：删除 `.timenote-block-edge` / `.grip` 与 `< 30px` 退化分支，命中区按 `clamp(h/3, 2, 9)` 自适应，最短 16px 块也能改起止，光标 `ns-resize` / `grab` / `grabbing` 切换；拖拽结果夹在可见轴内；`tickNowLine` 删除手写等距 fallback；
  - [x] `npm run build` / 33+23 项开发脚本测试 / `python3 scripts/pcmp_index.py --check` / `node --check main.js` 全部通过；版本 `1.0.4` → `1.0.5` 并部署真机 vault；
  - [x] 真机反馈修复（DEC-015）：29 处失效 `rgba(var(--*-rgb), a)` → 「固定 rgba 兜底 + `color-mix` 主题色」双声明，背景色恢复且跟随明暗主题；刻度列 52→64px 并与 `BLOCK_RULER_W` 同步、spacer 禁止被 `ALL DAY` 标签撑宽、网格列去 `border-right`、滚动条补偿改 `syncHeaderGutter()` 持续同步。浏览器探针（浅/深色）7 列偏差全部 0px；新增 `test:visual` 17 项断言与 `preview:real`，`npm test` 扩为 33+23+17 项；`~/tmp/tn-v105-snapshot` 已重新同步；
  - [x] 按天自动配色（DEC-016）：8 个官方扩展色 + `assignDayTints()` 确定性分配，同天互异、新块拿未用色、重渲染不跳色；`#color/blue` / `#色/绿` / `#color/#7c5cff` 指定通道；CSS 改 `--tn-tint` 变量驱动、任务块不再固定橙色；新增 `test:tints` 25 项，`npm test` 扩为 33+23+20+25 项；浏览器探针（浅/深）确认同天块色互异、7 列偏差 0px；版本 `1.0.5` → `1.0.6` 并部署真机 vault；
  - [x] 分支合并：`git checkout main && git merge --ff-only feat/elastic-timeline` 完成（不产生新提交、无需签名），DEC-013 / DEC-014 / DEC-015 全部进入 `main`；
  - [ ] **肉眼验收**：等用户 reload 插件后确认「同一天的时间块颜色互不相同、指定色生效、整张表格浑然一体、块上下沿与刻度对齐、无把手也能拖任意大小的块」，据此微调 `ELASTIC_EMPTY_RATIO` / `ELASTIC_ROW_PAD` / `estimateBlockNeed` 的行高系数。
  - [x] DEC-018：单时间点记录改画精确时刻线（线下信息 / 同簇错开 / 整条拖动只改时刻 / 无边缘拉伸）、`updateEntryPointTime` 不生成范围、点线弹性轴需求、57 项新断言、浅/深预览；
  - [ ] DEC-018 待肉眼验收：点线是否真的贴在对应时刻、拖动后日记行仍是单时间、Blinko 只读不可拖、信息放线下是否合意（线上已由 `.is-above` 预留）。

---

## 已完成里程碑 (Completed)
- [事实] 插件功能主体、7 种视图、全天栏、子项收纳、勾选回写、快速记录、设置页。
- [已确认] DEC-001 PCMP v2.2 上下文协议；DEC-004 标识统一；DEC-005 TypeScript + esbuild 构建链；DEC-006 author → AIDockerCloud。
- [已确认] [DEC-007] 时间块作为共享渲染层融入现有视图，块布局默认、紧凑流可切换、只做实际记录（用户 2026-11-08 22:28 指令）。
- [已确认] [DEC-008] 时间轴默认保持 `00:00-24:00` 不改，补齐设置页起止时间控件，README 同步更正（用户 2026-11-08 22:41 指令）。
- [已确认] [DEC-009] 暴露每小时槽高滑块；块布局新增当前时间指示线（用户 2026-11-08 22:47 指令）。设置页共 10 项。
- [已确认] [DEC-010] 补 `versions.json` 与 patch 版号规则；块布局上下留白修复、全天区加高（用户 2026-11-08 23:14 指令）。版本 1.0.1。
- [已确认] [DEC-011] 全天区高度可拖拽调节；时间块支持拖拽创建与拖拽调范围（用户 2026-11-08 23:22 指令）。版本 1.0.2。
- [已确认] [DEC-012] 弹性时间轴 v1.0.3：`buildTimeScale()` 收口全部「秒 ↔ 像素」换算、拖拽改走反函数，`elasticTimeline` 可一键回退。分配策略（总高守恒）已被 DEC-013 取代。
- [进行中] [DEC-013] 内容定高 + 视觉统一 v1.0.4：行高由内容决定、轴高随内容伸缩、块高恒等于时间跨度、消灭表头空行、统一块布局视觉。33 个用例通过，待肉眼验收。
- [已确认] [DEC-022] 时间块 / 时间点跨天拖动 + 新增时间点入口（用户 2026-11-10 17:2x 指令）：跨天按「先写目标日记、再删源行」搬记录，新增类型由 `defaultAddType` 单一状态驱动；84 项新测试，`npm test` 320 项，版本 1.0.10 待提交。
- [事实] 块布局落地后，README 原先宣称的「时间网格 / 并发重叠智能避让」首次与实现对齐。
- [事实] 已签名提交 `e5285db`（三件事合并：PCMP 初始化 + 标识统一 + 时间块），并由用户确认；`.workbuddy/`、`.Trash-*/`、`node_modules/` 已忽略。
- [事实][已推送] 2026-11-08 23:06 推送 `origin/main`（`3ee3025..e5285db`，2 个提交），远端 `refs/heads/main` 与本地 HEAD 同为 `e5285db894499a24ee518946ba2836c911187f0f`。
- [事实][已部署] 2026-11-08 22:56 覆盖部署到真机 vault `/home/inverstar/文档/Time/.obsidian/plugins/timenote/`：三件套 + README 全部 md5 与仓库一致；同时修正该目录 `manifest.json`（旧 id `time-notes` / name `Time Notes (时间笔记)` / author `Antigravity` → `timenote` / `TimeNote` / `AIDockerCloud`）与 `.obsidian/community-plugins.json`（`time-notes` → `timenote`）。旧文件备份在 `/home/inverstar/tmp/timenote-plugin-backup-20261108-225620`。该 vault 无 `data.json`，无需迁移。

## 进行中 (In Progress)
- [事实][已完成] [Git 状态] 当前在 **`main`**，v1.0.7 已签名提交并推送，`origin/main` 与本地 HEAD 同一 SHA；该提交把 DEC-017（日期标题跳转）、DEC-018（时间点线）、两批测试与全部文档同步一次性带入，工作区干净。1.0.1–1.0.6 共 6 个签名提交已于 2026-11-09 全部推送。**HTTPS 凭据提示的根因**：`origin` 原为 `https://github.com/...`，GitHub 自 2021-08 起禁用账号密码（HTTPS push 需 PAT），脚本里的 `git push` 遂弹出「用户名/密码」，会话内非交互 push 也正是卡在这里超时（非网络故障）。已改为 SSH 地址，实测 `ssh -T git@github.com` 返回 `Hi AIDockerCloud!`，推送成功。旧的 `~/tn-split-commit.sh` 与 `~/tmp/tn-v10*-snapshot` 已完成使命，**不要再跑**；`~/tn-main-commit.sh` 已改造为可复用的通用签名提交+推送脚本。
- [进行中] [DEC-012] 弹性时间轴已构建、已部署真机 vault，等肉眼验收。
- [进行中] [DEC-017] 日期标题直接打开当天日记：日 / 3天 / 周 × 块布局 / 紧凑流 + 时间线共 7 个点击点统一走 `openDailyNoteForDate`，已 build / 16 项新断言 / 174 项全量测试 / PCMP check 通过并部署真机 vault，已随 v1.0.7 签名提交推送，待 reload 验收。
- [进行中] [DEC-018] 时间点线：`main.ts` / `styles.css` / README / AGENTS / 本文件 / DEC-018 ADR 已改，新增 `test-point-lines.mjs`（57 项）与 `preview-point-lines.mjs`（浅+深预览 + 探针），`npm test` = 174 项全绿；已与 DEC-017 **合并成 v1.0.7 一次签名提交并推送**（版号沿用上一轮已 bump 的 1.0.7，不额外跳号）；已部署真机 vault（备份 + md5 核对完成），待 reload 验收。

## 阻塞项 (Blocked)
- [事实][环境] 曾记录「会话沙箱内 `gpg-agent` 无法在 `~/.gnupg` 创建锁文件（EPERM），签名提交必须本地终端执行」；**2026-11-09 14:2x 复测该限制已解除**：`gpg --clearsign` 与 `git commit -S` 在会话内均成功（口令命中 agent 缓存），`ssh -T git@github.com` 返回 `Hi AIDockerCloud!`（22 端口），会话内可直接完成签名提交 + 推送。若日后口令缓存过期，仍需本地终端执行 `bash ~/tn-main-commit.sh "msg"`。

## 当前风险与焦点 (Risks & Focus)
- [事实][中] **渐进类型化**：6 个类仍用 `[key: string]: any` 索引签名（标 `TODO(types)`），类型检查通过但类型安全有限。
- [事实][中] `createEl` / `createDiv` 传入 `style` 不在 Obsidian `DomElementInfo` 定义内，本轮仅通过全局类型扩展放行类型检查，**运行时该样式可能未生效**；新块布局已改用直接 `el.style.*` 设置，不受影响。
- [事实][中] `main.js` 是生成文件，提交前必须先 `npm run build`。
- [事实][中] **弹性轴的可读性代价**：整点刻度不再等距，连续空档的小时标签会被压到 18px 一行（字号降到 0.6rem），视觉上较拥挤；用户对「几点大概在屏幕哪个位置」的肌肉记忆需要重建（DEC-013）。
- [事实][中] **轴总高不再恒定**（DEC-013 主动放弃）：内容少的一天轴会明显变短（全空时约 24×18 = 432px），滚动范围随之变化；块高恒等于跨度，因此长时长低内容的记录会有留白（DEC-013 已修订，不再是「起点处的小卡片」）。
- [事实][低] 拖拽落进压缩区时块会瞬间变矮（仍用旧 scale 渲染），松手重算后恢复；未做「拖拽中实时重算」。
- [事实][低] `estimateBlockNeed` 是字数估算（中文按 2 个宽度单位、行高 15.5px），不同字体/主题下会有 ±1 行误差；未改用真实 DOM 测量。
- [事实][低] 网格留白写死为常量（顶部恒 0 / 底部 14px），未开设置项；顶部**不允许**改回非 0（DEC-013）。
- [事实][低] 块拖拽吸附固定 15 分钟、最短 15 分钟，未开设置项；**跨日拖拽已支持，但只到当前视图可见列、且无撤销**；拖拽松手即写盘并整视图重渲染（DEC-011 / DEC-022）。**点线拖拽仍用 1 分钟吸附，从空白槽新建时间点用 15 分钟吸附**（DEC-018 / DEC-022）。
- [事实][中] **跨天移动是「搬」不是「复制」**：成功即从源日记删掉该行（含紧跟的缩进子项），没有撤销，需反向拖回；解析后日记被外部改动导致 `lines[idx] !== entry.rawLine` 时整笔拒绝并提示，不会误删。只认当前视图真实存在的日期列（拖到视图范围外不生效，先翻页）；Blinko 等外部来源只读；跨零点范围（`23:00-01:00`）仍不支持（DEC-022）。
- [事实][低] 点线标签默认线下，CSS 里的 `.is-above` 线上变体未接设置项；簇紧贴小时起点时线上标签可能向上溢到上一行，真机若启用需复核（DEC-018）。
- [事实][低] 同一 15 分钟簇里点记录过多（>6 条）时，标签按 20px/条向下错开可能越出该小时行、盖到下一小时；`pointNeeds` 已按条数撑高该行，但簇内 y 仍按秒线性分布，未做二次堆叠收敛（DEC-018）。
- [事实][低] 拖动点线后带秒的原始时刻会归一到分钟（1 分钟吸附 + `formatSecondsToTime` 只输出 `HH:mm`）；未拖动时仍按 `entry.timeStr` 原样显示秒（DEC-018）。
- [事实][低] 跨零点范围（如 `23:00-01:00`）一期不支持，解析时兜底为 30 分钟块；拖拽创建 / 块边缘调整起止尚未实现（P2）。
- [事实][低] 月 / 季 / 年视图仍只显示计数，不画块、不显示时长统计（P2）。
- [事实][已收敛] 时间轴默认值差异已由 DEC-008 裁决：保留代码 `00:00-24:00`，**并补上设置页起止时间控件**（此前 README 宣称可调但 UI 不存在）；README 已同步为「默认 00:00 - 24:00，可按作息收窄」。`slotHeight` 已由 DEC-009 开成滑块（28–96px，默认 52）。
- [事实][低] 当前时间线只画在块布局；默认 `00:00-24:00` + 52px 时线高约 1183px（22:47），**首屏之外需滚动才可见**；未实现「自动滚动到当前时间」（与「文件修改即重渲染」会互相打架，列为复审触发条件）。
- [事实][低] 调 `slotHeight` 会重建网格并重置滚动位置（防抖后只重渲染一次）。
- [事实][中] 缺 LICENSE、自动化测试，尚不满足社区插件发布要求（`versions.json` 已补，版本机制见 DEC-010；发布产物链路见 DEC-019）。
- [事实][中] Release 从此只能由 `v*` tag 触发（DEC-019）：tag 去 `v` 必须等于 `manifest.json.version`，否则 workflow 直接失败；手工 `gh release create` 或网页传包属于违规路径，首次真跑尚未验证过 Actions 全链路（本地只验到 `npm run pack` 产出合法 zip）。
- [事实][提醒] 本机若已有旧插件目录 `.../plugins/time-notes/`，需改名 `timenote/` 并迁移 `data.json`；项目根目录 `.Trash-0/`（系统回收站）已忽略，未做任何删除操作。

## 未决问题 (Open Questions)
- [未决] 是否确认采用 PCMP **Lite** 档位，或升级为 Full？见 DEC-002。
- [未决] `createEl({ style })` 是否改为受支持的 `attr: { style }` 以让内联样式生效？
- [未决] LICENSE 采用哪种协议（MIT / Apache-2.0 / 其他）？自动化测试是否引入（vitest）？
- [未决] 是否实现 P2（拖拽创建与调整、月/季/年时长统计）？

## 下一步即时动作 (Immediate Next Action)
- 用户侧（**本轮 DEC-022 验收，优先**）：在 Obsidian 里 reload TimeNote 后，① 周视图里把某个时间块**中部**横向拖到隔壁日期列（目标列应高亮、块内出现 `→ YYYY-MM-DD`），松手后检查原日记那一行消失、目标日记多出同一条（含标签 / 复选框 / 缩进子项），时间范围仍是范围；② 对一条时间点线同样横拖，确认目标日记里仍是单个 `HH:mm`、没有变成范围；③ 工具栏点「新增：时间块」切成「新增：时间点」，再点空白槽，应看到虚线时刻线预览 + 快速记录弹窗里结束时间框禁用留空，保存后日历上是线不是块；④ 按住 `Alt` 点空白槽可在不切换按钮的情况下临时记时间点。设置页「新建记录默认类型」与工具栏按钮应保持一致。
- 提交与发版：DEC-022 改动**尚未提交**；确认后 `bash ~/tn-main-commit.sh "…"` → `git tag -s v1.0.10 -m "v1.0.10"` → `git push origin v1.0.10`。`v1.0.9` 已发布，勿复用；tag 去 `v` 必须等于 `manifest.json` 的 `1.0.10`，否则 workflow 直接红。
- 用户侧（沿用，DEC-021 已随 v1.0.9 发布）：reload TimeNote 后在空白槽拖出一个新时间块并保存，确认**页面下方不再出现第二个日历视图**；再试拖拽改已有块起止、QuickAdd 手动新增、切视图 / 切日期，都不应叠加视图（旧现象是刷新才恢复，现在无需刷新）。
- 用户侧（沿用）：DEC-020 插入标题 —— 设置填 `### 随手记` → 点空白日期新建日记应看到三级标题、QuickAdd 紧插其下且不重复建标题；`data.json` 仍是旧纯文本 `灵感闪念`，按二级兼容。DEC-018 点线 / DEC-017 日期标题直达日记也待一次性肉眼复核（真机 vault 已覆盖，reload 即可）。
- 用户侧：① 在真机 Obsidian 里 reload TimeNote（设置 → 第三方插件 → 关闭再开启），核对**点 `ALL DAY` 上方日期标题能直接打开当天日记**（日 / 3天 / 周、块布局与紧凑流都试一下；空白日期会新建一篇空日记并 Notice），顺带复核同一天块色互异、`#color/blue` 指定色、列对齐与背景色；② 签名提交 + SSH 推送已于 2026-11-09 14:2x 由会话内完成，无需再跑 `~/tn-main-commit.sh`。真机 `data.json` 复核为 `0–24` 时 / `slotHeight=36` / `allDayHeight=32` / 自适应开（此前记的 `6–24` 已过时）；设置页「自适应时间轴」开关可 A/B 对比内容驱动 / 等距 36px。
- 用户侧（DEC-018）：先看 `scripts/dev/out/point-lines.html`（浅）/ `point-lines-dark.html`（深）确认「信息在线下」是否合意 —— 第 2 天是 `.is-above` 线上对照；三件套已覆盖真机 vault，**在 Obsidian 里 reload TimeNote 即可**，检查写 `- 09:23 到公司` 只出现一条线、上下拖动后日记行仍是 `- 10:xx 到公司`（没有变成范围）、范围记录仍是块、Blinko 闪念不可拖。
- 版号与提交：DEC-017 + DEC-018 **合并成一个签名提交、一个 patch 版号 1.0.7**（manifest / package / versions.json 上一轮已从 1.0.6 bump 到 1.0.7，本次不再重复 bump，避免 1.0.6 → 1.0.8 跳号）；2026-11-09 14:2x 会话内 `git commit -S` + `git push origin main` 成功，工作区干净。会话内签名能力已复测可用，详见「阻塞项」环境条目。
- 我这边：按验收反馈调 `ELASTIC_MIN_EMPTY_ROW`（空档压缩下限）/ `ELASTIC_ROW_PAD` / `estimateBlockNeed` 的行高系数；**后续所有改动都在 `main` 上做**，不再开实验分支。
- Git：`origin/main` = 本地 HEAD = v1.0.9 签名提交 `931074d`（DEC-022 的 1.0.10 尚未提交）；remote 为 SSH，不会再要密码。`~/tn-main-commit.sh` 保留为通用脚本（口令缓存过期时用），旧的历史提交脚本一律不要再跑。可选：若其它 GitHub 仓库也要免密码，可配全局 `url.git@github.com:.insteadOf`，未擅自改动全局配置。
- 仍需裁决 LICENSE 与自动化测试（vitest）。
