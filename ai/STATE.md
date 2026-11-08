---
pcmp_version: "2.2"
revision: 13
updated: 2026-11-08
---

# 项目当前状态与活动任务快照 (STATE.md — Lite)

- **Last Updated**: 2026-11-08
- **Overall Status**: [事实] 插件主体功能已实现（7 视图 + 日记解析 + 双向回写 + 设置页）；[已确认] 时间块记录按 DEC-007 落地——共享块布局渲染层、可切换、默认块布局、只做实际记录；TypeScript + esbuild 构建链与 PCMP v2.2 Lite 上下文体系已在 `8b110bd` 入库。截至 `e5285db` 的代码**已推送到 `origin/main`**（2026-11-08 23:06 核实，本地与远端同一 SHA）。`versions.json` 与 `npm run bump` 版号机制已补（DEC-010），当前版本 **1.0.3**（在实验分支 `feat/elastic-timeline` 上，对应 DEC-012 的自适应槽高）。仍无 LICENSE / 自动化测试。
- **档位**：PCMP Lite（活动任务合并维护于此，无 `TASK.md` / `PLAN.md` / `sessions/`）。

---

## 🎯 当前唯一活动任务 (Active Task)

- **任务名称**：自适应槽高（弹性时间轴）—— 空档压缩、有内容的小时按内容量撑开，轴总高不变（实验分支）
- **背景与范围**：用户 2026-11-08 23:28 指令「自适应高度，对于有内容的时间块其高度随内容增加而变高，无内容的时间块则自动压缩高度，总高度不变，兼顾内容显示和全面展示，请单开一个分支进行尝试 看看效果如何」。范围：`main.ts` 新增 `buildTimeScale()` 并把六处「秒 ↔ 像素」换算全部收口、`styles.css` 的弹性样式、设置项 `elasticTimeline`、文档同步；不改数据源、不改视图体系、不改紧凑流渲染。
- **约束与非目标**：轴总高必须恒等于 `(endHour - startHour) * slotHeight`（用户明确要求「总高度不变」）；映射必须严格单调且连续，否则拖拽与当前时间线失效；关闭 `elasticTimeline` 后必须逐像素回到旧等距实现；不做跨日连续轴、不做「拖拽中实时重算权重」、不引入独立配置面板。
- **关联文件**：`main.ts`、`main.js`、`styles.css`、`manifest.json`、`package.json`、`versions.json`、`README.md`、`AGENTS.md`、`ai/STATE.md`、`ai/DECISIONS.md`
- **验收标准**：
  - [x] `buildTimeScale()` 统一产出 `yOf` / `secOf` / `heights` / `bounds`，六处换算全部改为经它调用，`grep` 确认无遗留旧公式（仅 `tickNowLine` 保留 `scale` 为空时的等距兜底）；
  - [x] 三档水位分配（min / desire / max）实现，总高恒为 `rowCount * slotHeight`，浮点误差在末行收口；
  - [x] 空档行压到 `ELASTIC_MIN_EMPTY_ROW = 14px` 且不参与富余瓜分；有内容行 `desire` 随覆盖时长 / 条目数 / 文本量增长，`max = min(desire*1.9, slotHeight*4.2)`；
  - [x] 51 个数学用例通过（总高守恒 / 行高恒正 / 边界严格单调 / `yOf`↔`secOf` 互逆 / 端点对齐 / 内容量单调性 / 全天满档回落到槽高 / 全天无内容退化为等距 / 关闭弹性与旧公式逐像素一致 / 非零起点 / 极短记录）；
  - [x] 拖拽创建与调节改用反函数换算，跨压缩区不跳；`attachSlotDrag` / `attachBlockDrag` 签名由 `(dayStartSec, dayEndSec, slotHeight)` 改为 `(scale)`；
  - [x] 渲染层按块高加 `is-dense` / `is-tiny`，弹性模式下标题可折行（`-webkit-line-clamp: 4`）；
  - [x] 设置项 `elasticTimeline` 默认 `true`，切换即重渲染；页面共 12 项；
  - [x] `npm run typecheck` / `build` / `python3 scripts/pcmp_index.py --check` 全部通过；
  - [x] 版本 `1.0.2` → `1.0.3`，已构建并部署到真机 vault；
  - [ ] **肉眼验收**：等用户 reload 插件后确认空档压缩幅度与内容块高度是否符合预期，据此决定是否调 `ELASTIC_HARD_CAP` / `ELASTIC_MIN_EMPTY_ROW`，通过后 DEC-012 转 Accepted 并合回 `main`。

---

## 已完成里程碑 (Completed)
- [事实] 插件功能主体、7 种视图、全天栏、子项收纳、勾选回写、快速记录、设置页。
- [已确认] DEC-001 PCMP v2.2 上下文协议；DEC-004 标识统一；DEC-005 TypeScript + esbuild 构建链；DEC-006 author → AIDockerCloud。
- [已确认] [DEC-007] 时间块作为共享渲染层融入现有视图，块布局默认、紧凑流可切换、只做实际记录（用户 2026-11-08 22:28 指令）。
- [已确认] [DEC-008] 时间轴默认保持 `00:00-24:00` 不改，补齐设置页起止时间控件，README 同步更正（用户 2026-11-08 22:41 指令）。
- [已确认] [DEC-009] 暴露每小时槽高滑块；块布局新增当前时间指示线（用户 2026-11-08 22:47 指令）。设置页共 10 项。
- [已确认] [DEC-010] 补 `versions.json` 与 patch 版号规则；块布局上下留白修复、全天区加高（用户 2026-11-08 23:14 指令）。版本 1.0.1。
- [已确认] [DEC-011] 全天区高度可拖拽调节；时间块支持拖拽创建与拖拽调范围（用户 2026-11-08 23:22 指令）。版本 1.0.2。
- [进行中] [DEC-012] 自适应槽高（弹性时间轴）：`buildTimeScale()` 收口全部「秒 ↔ 像素」换算；空档压到 14px、有内容行按内容量撑开、轴总高守恒；`elasticTimeline` 可一键回退。版本 1.0.3，在 `feat/elastic-timeline` 分支，51 个数学用例通过，待肉眼验收。
- [事实] 块布局落地后，README 原先宣称的「时间网格 / 并发重叠智能避让」首次与实现对齐。
- [事实] 已签名提交 `e5285db`（三件事合并：PCMP 初始化 + 标识统一 + 时间块），并由用户确认；`.workbuddy/`、`.Trash-*/`、`node_modules/` 已忽略。
- [事实][已推送] 2026-11-08 23:06 推送 `origin/main`（`3ee3025..e5285db`，2 个提交），远端 `refs/heads/main` 与本地 HEAD 同为 `e5285db894499a24ee518946ba2836c911187f0f`。
- [事实][已部署] 2026-11-08 22:56 覆盖部署到真机 vault `/home/inverstar/文档/Time/.obsidian/plugins/timenote/`：三件套 + README 全部 md5 与仓库一致；同时修正该目录 `manifest.json`（旧 id `time-notes` / name `Time Notes (时间笔记)` / author `Antigravity` → `timenote` / `TimeNote` / `AIDockerCloud`）与 `.obsidian/community-plugins.json`（`time-notes` → `timenote`）。旧文件备份在 `/home/inverstar/tmp/timenote-plugin-backup-20261108-225620`。该 vault 无 `data.json`，无需迁移。

## 进行中 (In Progress)
- [进行中] [Git 状态] 工作区当前叠加了**两批未提交改动**：v1.0.2（全天区拖拽 + 拖拽创建/调范围，DEC-011）与 v1.0.3（弹性时间轴，DEC-012）。分支 `feat/elastic-timeline` 从 `main` 的 `e5285db` 切出，两批改动都随之带了过去；暂存区仍是 v1.0.1 的快照。计划用三段式脚本按「1.0.1 → 1.0.2 → 1.0.3」拆成三个签名提交（先恢复 v1.0.2 快照提交，再恢复弹性快照提交），避免两个功能混在一个 commit 里。
- [进行中] [DEC-012] 弹性时间轴已构建、已部署真机 vault，等肉眼验收。

## 阻塞项 (Blocked)
- [事实][环境] 会话沙箱内 `gpg-agent` 无法在 `~/.gnupg` 创建锁文件（EPERM），全局 `commit.gpgsign=true` 导致会话内提交失败；用户已选择「本地终端提交」，非业务阻塞。

## 当前风险与焦点 (Risks & Focus)
- [事实][中] **渐进类型化**：6 个类仍用 `[key: string]: any` 索引签名（标 `TODO(types)`），类型检查通过但类型安全有限。
- [事实][中] `createEl` / `createDiv` 传入 `style` 不在 Obsidian `DomElementInfo` 定义内，本轮仅通过全局类型扩展放行类型检查，**运行时该样式可能未生效**；新块布局已改用直接 `el.style.*` 设置，不受影响。
- [事实][中] `main.js` 是生成文件，提交前必须先 `npm run build`。
- [事实][中] **弹性轴的可读性代价**：整点刻度不再等距，连续空档的小时标签会被压到 14px 一行（字号降到 0.6rem），视觉上较拥挤；用户对「几点大概在屏幕哪个位置」的肌肉记忆需要重建（DEC-012）。
- [事实][中] **内容稀疏时效果会退化**：只有 1–2 条记录时，数学上无法既把空档压扁又保持轴总高不变，此时退化为「空档 ~48px、内容行 ~190px」，压缩感不明显。要真正压扁必须放弃「总高不变」约束（DEC-012 复审触发条件）。
- [事实][低] 拖拽落进压缩区时块会瞬间变矮（仍用旧 scale 渲染），松手重算权重后才恢复；未做「拖拽中实时重算」。
- [事实][低] 块高不足 20px 时按 `MIN_RENDER_BLOCK_PX` 渲染，会轻微溢出自身时间段（仅内容极满时出现）。
- [事实][低] 网格留白写死为常量（12 / 14px），未开设置项；若刻度字号变化需同步调（DEC-010 复审触发条件）。
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
