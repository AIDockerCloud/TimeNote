---
pcmp_version: "2.2"
revision: 16
updated: 2026-11-08
---

# 项目当前状态与活动任务快照 (STATE.md — Lite)

- **Last Updated**: 2026-11-08
- **Overall Status**: [事实] 插件主体功能已实现（7 视图 + 日记解析 + 双向回写 + 设置页）；[已确认] 时间块记录按 DEC-007 落地——共享块布局渲染层、可切换、默认块布局、只做实际记录；TypeScript + esbuild 构建链与 PCMP v2.2 Lite 上下文体系已在 `8b110bd` 入库。截至 `e5285db` 的代码**已推送到 `origin/main`**（2026-11-08 23:06 核实，本地与远端同一 SHA）。`versions.json` 与 `npm run bump` 版号机制已补（DEC-010），当前版本 **1.0.4**（在实验分支 `feat/elastic-timeline` 上，对应 DEC-013 的「内容定高」自适应轴 + 视觉统一）。仍无 LICENSE / 自动化测试。
- **档位**：PCMP Lite（活动任务合并维护于此，无 `TASK.md` / `PLAN.md` / `sessions/`）。

---

## 🎯 当前唯一活动任务 (Active Task)

- **任务名称**：自适应时间轴（内容定高 + 视觉统一）—— 行高由内容决定、轴高随内容伸缩、块高恒等于时间跨度（实验分支）
- **背景与范围**：用户 2026-11-08 23:28 提出「自适应高度」，23:47 追加「全天任务行和开始时间有个奇怪的空行，风格不统一，参考 tasknotes/taskquence 美化，高度和内容强相关，内容不多不必拉高」。范围：`main.ts` 的 `buildTimeScale()` / `estimateBlockNeed()` / `renderBlockGrid()` / `attachBlockDrag()`、`styles.css` 全量视觉、`AGENTS.md` 红线、README 与 DEC；不改数据源、不改视图体系、不改紧凑流渲染。
- **约束与非目标**：块高 **必须** 恒等于自身时间跨度（`yOf(end) - yOf(start)`），「内容多就高」只能靠行高实现，禁止再把块从跨度里截短；`BLOCK_TOP_GUTTER` 恒 0（任何正值都会在全天区与第一个整点之间多出一条空行）；映射必须严格单调且连续；关闭 `elasticTimeline` 后逐像素回到旧等距实现；不做跨日连续轴、不做真实 DOM 文字测量（用字数估算）。
- **关联文件**：`main.ts`、`main.js`、`styles.css`、`manifest.json`、`package.json`、`versions.json`、`README.md`、`AGENTS.md`、`ai/STATE.md`、`ai/DECISIONS.md`、`scripts/dev/`（弹性轴测试、拖拽回写测试、静态预览生成）
- **验收标准**：
  - [x] 行高改为内容定高：空档行 `slotHeight*0.34`（下限 16px）、有条目行 `max(slotHeight*0.9, 40px)`，再按纵向槽位装箱把块需要的高度补足；
  - [x] 放弃总高守恒（DEC-013）。内容不足视口时整体等比放大行距；块本身仍按内容定高；
  - [x] 块渲染高度恒等于自身时间跨度（上沿=开始时间、下沿=结束时间），同 lane 的块不重叠；被长条目覆盖的中间小时抬到最小内容行高，不被掐成细条；
  - [x] 消灭「全天区与第一个整点之间的空行」：`BLOCK_TOP_GUTTER` → 0、起始刻度用 `.is-first`、分隔条改绝对定位；
  - [x] 视觉统一：表头 1px 单线、全天区与表头同底色、chip 与块共用 6px 圆角 / 3px 左色条 / 淡色底 / 统一字阶、刻度列去双线、小时线 0.6 透明度、今日列淡色底；
  - [x] 32 个数学用例通过（行高恒正 / 严格单调 / `yOf`↔`secOf` 互逆 / 端点对齐 / 空档压缩 / 内容量单调 / 长跨度装得下 / 视口填充 / 等距回退 / 非零起点 / 全空退化 / 同小时多条 / 典型一天形态）；
  - [x] `npm run typecheck` / `build` / `python3 scripts/pcmp_index.py --check` 全部通过；
  - [x] 版本 `1.0.3` → `1.0.4`，已构建并部署到真机 vault；
  - [ ] **肉眼验收**：等用户 reload 插件后确认「空行消失、块上下沿与刻度对齐、视觉统一」，据此微调 `ELASTIC_EMPTY_RATIO` / `ELASTIC_ROW_PAD` / `estimateBlockNeed` 的行高系数，通过后 DEC-013 转 Accepted 并合回 `main`。

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
- [事实] 块布局落地后，README 原先宣称的「时间网格 / 并发重叠智能避让」首次与实现对齐。
- [事实] 已签名提交 `e5285db`（三件事合并：PCMP 初始化 + 标识统一 + 时间块），并由用户确认；`.workbuddy/`、`.Trash-*/`、`node_modules/` 已忽略。
- [事实][已推送] 2026-11-08 23:06 推送 `origin/main`（`3ee3025..e5285db`，2 个提交），远端 `refs/heads/main` 与本地 HEAD 同为 `e5285db894499a24ee518946ba2836c911187f0f`。
- [事实][已部署] 2026-11-08 22:56 覆盖部署到真机 vault `/home/inverstar/文档/Time/.obsidian/plugins/timenote/`：三件套 + README 全部 md5 与仓库一致；同时修正该目录 `manifest.json`（旧 id `time-notes` / name `Time Notes (时间笔记)` / author `Antigravity` → `timenote` / `TimeNote` / `AIDockerCloud`）与 `.obsidian/community-plugins.json`（`time-notes` → `timenote`）。旧文件备份在 `/home/inverstar/tmp/timenote-plugin-backup-20261108-225620`。该 vault 无 `data.json`，无需迁移。

## 进行中 (In Progress)
- [进行中] [Git 状态] 工作区当前叠加了**三批未提交改动**：v1.0.2（全天区拖拽 + 拖拽创建/调范围，DEC-011）、v1.0.3（弹性时间轴，DEC-012）、v1.0.4（内容定高 + 视觉统一，DEC-013）。分支 `feat/elastic-timeline` 从 `main` 的 `e5285db` 切出；暂存区仍是 v1.0.1 的快照。计划用四段式脚本按「1.0.1 → 1.0.2 → 1.0.3 → 1.0.4」拆成四个签名提交。
- [进行中] [DEC-012] 弹性时间轴已构建、已部署真机 vault，等肉眼验收。

## 阻塞项 (Blocked)
- [事实][环境] 会话沙箱内 `gpg-agent` 无法在 `~/.gnupg` 创建锁文件（EPERM），全局 `commit.gpgsign=true` 导致会话内提交失败；用户已选择「本地终端提交」，非业务阻塞。

## 当前风险与焦点 (Risks & Focus)
- [事实][中] **渐进类型化**：6 个类仍用 `[key: string]: any` 索引签名（标 `TODO(types)`），类型检查通过但类型安全有限。
- [事实][中] `createEl` / `createDiv` 传入 `style` 不在 Obsidian `DomElementInfo` 定义内，本轮仅通过全局类型扩展放行类型检查，**运行时该样式可能未生效**；新块布局已改用直接 `el.style.*` 设置，不受影响。
- [事实][中] `main.js` 是生成文件，提交前必须先 `npm run build`。
- [事实][中] **弹性轴的可读性代价**：整点刻度不再等距，连续空档的小时标签会被压到 18px 一行（字号降到 0.6rem），视觉上较拥挤；用户对「几点大概在屏幕哪个位置」的肌肉记忆需要重建（DEC-013）。
- [事实][中] **轴总高不再恒定**（DEC-013 主动放弃）：内容少的一天轴会明显变短（全空时约 24×18 = 432px），滚动范围随之变化；块不再铺满自己的时间跨度，长时长低内容的记录呈现为「起点处的一张小卡片」。
- [事实][低] 拖拽落进压缩区时块会瞬间变矮（仍用旧 scale 渲染），松手重算后恢复；未做「拖拽中实时重算」。
- [事实][低] `estimateBlockNeed` 是字数估算（中文按 2 个宽度单位、行高 15.5px），不同字体/主题下会有 ±1 行误差；未改用真实 DOM 测量。
- [事实][低] 网格留白写死为常量（顶部恒 0 / 底部 14px），未开设置项；顶部**不允许**改回非 0（DEC-013）。
- [事实][低] 拖拽吸附固定 15 分钟、最短 15 分钟，未开设置项；无跨日拖拽、无撤销；拖拽松手即写盘并整视图重渲染（DEC-011）。
- [事实][低] 跨零点范围（如 `23:00-01:00`）一期不支持，解析时兜底为 30 分钟块；拖拽创建 / 块边缘调整起止尚未实现（P2）。
- [事实][低] 月 / 季 / 年视图仍只显示计数，不画块、不显示时长统计（P2）。
- [事实][已收敛] 时间轴默认值差异已由 DEC-008 裁决：保留代码 `00:00-24:00`，**并补上设置页起止时间控件**（此前 README 宣称可调但 UI 不存在）；README 已同步为「默认 00:00 - 24:00，可按作息收窄」。`slotHeight` 已由 DEC-009 开成滑块（28–96px，默认 52）。
- [事实][低] 当前时间线只画在块布局；默认 `00:00-24:00` + 52px 时线高约 1183px（22:47），**首屏之外需滚动才可见**；未实现「自动滚动到当前时间」（与「文件修改即重渲染」会互相打架，列为复审触发条件）。
- [事实][低] 调 `slotHeight` 会重建网格并重置滚动位置（防抖后只重渲染一次）。
- [事实][中] 缺 LICENSE、自动化测试，尚不满足社区插件发布要求（`versions.json` 已补，版本机制见 DEC-010）。
- [事实][提醒] 本机若已有旧插件目录 `.../plugins/time-notes/`，需改名 `timenote/` 并迁移 `data.json`；项目根目录 `.Trash-0/`（系统回收站）已忽略，未做任何删除操作。

## 未决问题 (Open Questions)
- [未决] 是否确认采用 PCMP **Lite** 档位，或升级为 Full？见 DEC-002。
- [未决] `createEl({ style })` 是否改为受支持的 `attr: { style }` 以让内联样式生效？
- [未决] LICENSE 采用哪种协议（MIT / Apache-2.0 / 其他）？自动化测试是否引入（vitest）？
- [未决] 是否实现 P2（拖拽创建与调整、月/季/年时长统计）？

## 下一步即时动作 (Immediate Next Action)
- 用户侧：在真机 Obsidian 里 reload TimeNote（设置 → 第三方插件 → 关闭再开启），用真实日记看弹性轴的压缩幅度与内容块高度是否符合预期；设置页「自适应槽高」开关可即时 A/B 对比。
- 我这边：按验收反馈调 `ELASTIC_MIN_EMPTY_ROW`（空档压缩下限）/ `ELASTIC_HARD_CAP`（内容块绝对上限）/ `ELASTIC_MAX_GROWTH`（相对上限）三个常量；确认后 DEC-012 转 `Accepted` 并合回 `main`。
- Git：执行三段式脚本 `~/tn-split-commit.sh` 完成 1.0.1 / 1.0.2 / 1.0.3 三次签名提交，之后由我 `git push -u origin feat/elastic-timeline`。
- 仍需裁决 LICENSE 与自动化测试（vitest）。
