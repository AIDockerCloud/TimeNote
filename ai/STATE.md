---
pcmp_version: "2.2"
revision: 12
updated: 2026-11-08
---

# 项目当前状态与活动任务快照 (STATE.md — Lite)

- **Last Updated**: 2026-11-08
- **Overall Status**: [事实] 插件主体功能已实现（7 视图 + 日记解析 + 双向回写 + 设置页）；[已确认] 时间块记录按 DEC-007 落地——共享块布局渲染层、可切换、默认块布局、只做实际记录；TypeScript + esbuild 构建链与 PCMP v2.2 Lite 上下文体系已在 `8b110bd` 入库。截至 `e5285db` 的代码**已推送到 `origin/main`**（2026-11-08 23:06 核实，本地与远端同一 SHA）。`versions.json` 与 `npm run bump` 版号机制已补（DEC-010），当前版本 **1.0.2**。仍无 LICENSE / 自动化测试。
- **档位**：PCMP Lite（活动任务合并维护于此，无 `TASK.md` / `PLAN.md` / `sessions/`）。

---

## 🎯 当前唯一活动任务 (Active Task)

- **任务名称**：实现时间块记录（方案 B：共享块布局渲染层，可切换、默认块布局、只做实际记录）
- **背景与范围**：用户 2026-11-08 22:28 指令「方案B，可切换，默认是块布局，只做实际记录」。范围：`main.ts` 的渲染 / 添加 / 解析、`styles.css`、设置项、文档同步；不新增视图模式，不引入新数据源，不做计划排程。
- **约束与非目标**：块布局与紧凑流必须都能用且默认块布局；时间块只表达「一段时间做了什么」；数据仍是日记行内 `HH:mm-HH:mm`；不擅改 README 时间轴默认值差异；不绕过全局 GPG 签名配置。
- **关联文件**：`main.ts`、`main.js`、`styles.css`、`README.md`、`AGENTS.md`、`ai/PROJECT.md`、`ai/STATE.md`、`ai/DECISIONS.md`、`~/tn-commit.sh`
- **验收标准**：
  - [x] `renderTimeGrid` 按 `layoutMode` 分发；`renderBlockGrid` 在 day / 3day / week 复用，按 `startSeconds`/`endSeconds` 绝对定位画块；
  - [x] 仅重叠簇内分 lane、不重叠占满整列；时长徽标、标签、子项、hover、点击跳原笔记均保留；
  - [x] 原压缩流保留为「紧凑流」，工具栏可切换，设置项 `layoutMode` 默认 `block`、`defaultDuration` 默认 60；
  - [x] 添加端：`QuickAddModal` 结束时间 + 实时时长提示 + 校验；空白槽点击按位置预填起止；`addEntry` 写 `HH:mm-HH:mm`；
  - [x] `parseLine` 增加 `isRange` 与跨零点兜底；时间线视图显示时长；
  - [x] `npm run typecheck` / `build` / `check`、`node --check main.js`、模拟 Obsidian require 全部通过；
  - [x] 7 个核心逻辑用例通过（范围解析 / 时长标签 / 跨零点兜底 / 时长格式化 / 24:00 / 深夜加时长 / 仅重叠分列）；
  - [x] 设置页补齐「时间轴起始时间 / 结束时间」两个下拉（DEC-008），块布局与紧凑流共用，改动即保存并重渲染；
  - [x] 设置页暴露「每小时槽高」滑块 28–96px / 步长 4 / 默认 52，拖动防抖 150ms 后重渲染（DEC-009）；
  - [x] 块布局加入当前时间指示线：按分钟定位、左侧 `HH:mm` 胶囊、30s 刷新、越界隐藏、仅在所显示日期含今天时创建（DEC-009）；
  - [x] 定时器三处收口：`renderTimeGrid` 重渲染前 `stopNowClock()`、`onClose()` 停表、`isConnected=false` 静默返回；
  - [x] 指示线逻辑 7 个用例通过（全天 754px / 06:00 起 510px / 09-18 内可见 / 早于起点隐藏 / 晚于终点隐藏 / 24:00 边界 1248px / DOM 移除安全返回）；
  - [x] 本地终端执行 `bash ~/tn-commit.sh` 完成 GPG 签名提交（`e5285db`）；
  - [x] 推送到远端 `origin/main`（`3ee3025..e5285db`，远端已核实同一 SHA）；
  - [x] 块布局上下留白：`BLOCK_TOP_GUTTER=12` / `BLOCK_BOTTOM_GUTTER=14`，刻度标签 / 小时线 / 时间块 / 当前时间线 / 落点层统一偏移，起始与结束时刻标签完整可见（DEC-010）；
  - [x] 末行贴近底部（容器底距最后一行 14px）且标签完整；全天区加高至 56–180px 承接释放的空间（DEC-010）；
  - [x] 落点层只覆盖网格本体，点击留白区不再误建记录；
  - [x] 补 `versions.json` + `scripts/bump-version.mjs`（`npm run bump`），版本 `1.0.0` → `1.0.1`，三处版本一致（DEC-010）；
  - [x] 12 个用例通过（指示线 7 项 + 几何自洽 5 项：容器高 1274 / 首标签不裁切 / 末标签在容器内 / 末行距底 14px / 首块不贴表头）；
  - [x] 全天区高度可拖拽调节：`.timenote-header-resizer` 分隔条 + 设置项 `allDayHeight`（40–320，默认 56），实时改内联高度、松手才持久化（DEC-011）；
  - [x] 空白槽拖拽创建：15 分钟吸附、最短 15 分钟、虚线预览实时显示起止与时长，松手打开快速记录并预填范围；单击行为保持不变（DEC-011）；
  - [x] 已有块拖拽调节：上/下边缘改起止、中部平移（块高 < 30px 仅平移），松手经 `updateEntryTime` 回写行首时间前缀（DEC-011）；
  - [x] 12 个用例通过（吸附 4 项 + 时间前缀回写 8 项，含保留 `[ ]`、去 `30m` 标签、多行只改目标行、24:00 边界）；
  - [ ] LICENSE 与自动化测试仍待人类裁决。

---

## 已完成里程碑 (Completed)
- [事实] 插件功能主体、7 种视图、全天栏、子项收纳、勾选回写、快速记录、设置页。
- [已确认] DEC-001 PCMP v2.2 上下文协议；DEC-004 标识统一；DEC-005 TypeScript + esbuild 构建链；DEC-006 author → AIDockerCloud。
- [已确认] [DEC-007] 时间块作为共享渲染层融入现有视图，块布局默认、紧凑流可切换、只做实际记录（用户 2026-11-08 22:28 指令）。
- [已确认] [DEC-008] 时间轴默认保持 `00:00-24:00` 不改，补齐设置页起止时间控件，README 同步更正（用户 2026-11-08 22:41 指令）。
- [已确认] [DEC-009] 暴露每小时槽高滑块；块布局新增当前时间指示线（用户 2026-11-08 22:47 指令）。设置页共 10 项。
- [已确认] [DEC-010] 补 `versions.json` 与 patch 版号规则；块布局上下留白修复、全天区加高（用户 2026-11-08 23:14 指令）。版本 1.0.1。
- [已确认] [DEC-011] 全天区高度可拖拽调节；时间块支持拖拽创建与拖拽调范围（用户 2026-11-08 23:22 指令）。版本 1.0.2。
- [事实] 块布局落地后，README 原先宣称的「时间网格 / 并发重叠智能避让」首次与实现对齐。
- [事实] 已签名提交 `e5285db`（三件事合并：PCMP 初始化 + 标识统一 + 时间块），并由用户确认；`.workbuddy/`、`.Trash-*/`、`node_modules/` 已忽略。
- [事实][已推送] 2026-11-08 23:06 推送 `origin/main`（`3ee3025..e5285db`，2 个提交），远端 `refs/heads/main` 与本地 HEAD 同为 `e5285db894499a24ee518946ba2836c911187f0f`。
- [事实][已部署] 2026-11-08 22:56 覆盖部署到真机 vault `/home/inverstar/文档/Time/.obsidian/plugins/timenote/`：三件套 + README 全部 md5 与仓库一致；同时修正该目录 `manifest.json`（旧 id `time-notes` / name `Time Notes (时间笔记)` / author `Antigravity` → `timenote` / `TimeNote` / `AIDockerCloud`）与 `.obsidian/community-plugins.json`（`time-notes` → `timenote`）。旧文件备份在 `/home/inverstar/tmp/timenote-plugin-backup-20261108-225620`。该 vault 无 `data.json`，无需迁移。

## 进行中 (In Progress)
- [进行中] 仅剩文档同步（本文件的 revision 10 与 `AGENTS.md` 部署说明）待签名提交；产品代码已全部提交并推送。

## 阻塞项 (Blocked)
- [事实][环境] 会话沙箱内 `gpg-agent` 无法在 `~/.gnupg` 创建锁文件（EPERM），全局 `commit.gpgsign=true` 导致会话内提交失败；用户已选择「本地终端提交」，非业务阻塞。

## 当前风险与焦点 (Risks & Focus)
- [事实][中] **渐进类型化**：6 个类仍用 `[key: string]: any` 索引签名（标 `TODO(types)`），类型检查通过但类型安全有限。
- [事实][中] `createEl` / `createDiv` 传入 `style` 不在 Obsidian `DomElementInfo` 定义内，本轮仅通过全局类型扩展放行类型检查，**运行时该样式可能未生效**；新块布局已改用直接 `el.style.*` 设置，不受影响。
- [事实][中] `main.js` 是生成文件，提交前必须先 `npm run build`。
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
- 本地终端执行 `bash ~/tn-commit.sh`：脚本会**连做两次签名提交**（先 1.0.1 的留白修复，再 1.0.2 的拖拽交互），提交后由我负责 `git push`。随后在真机 Obsidian 验证：拖分隔条调全天区高度、空白处拖拽建块、拖块边缘改范围是否按预期写回日记。仍需裁决 LICENSE 与测试。
