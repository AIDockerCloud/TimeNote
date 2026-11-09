---
pcmp_version: "2.2"
revision: 14
updated: 2026-11-09
---

# 架构与技术决策记录 (DECISIONS.md — Lite)

> 规则：未经人类确认的决策一律标 `Proposed`；推翻已 Accepted 决策须新开 DEC 并写明 `Supersedes`。

## DEC-001 — 引入 PCMP v2.2 作为项目上下文管理协议
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 会话中明确指令「利用 https://github.com/Inverstar/PCMP/tree/main 进行初始化」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 上游协议发布新主版本，或项目治理需求发生实质变化时复审
- 背景 (Context): TimeNote 处于早期开发，上下文散落在 README 与代码注释中，跨会话接管容易丢失硬约束与决策链。
- 决策 (Decision): 将 PCMP v2.2 协议原版（中 / 英）落到项目根目录，并建立 `ai/` 上下文体系；Markdown 为唯一权威，派生索引可选可弃。
- 理由 (Reason): PCMP 与 IDE / 模型无关、零外部依赖，适合单人插件项目；能把硬约束、状态与决策沉淀为可恢复上下文。
- 备选方案 (Alternatives): 仅靠 README（缺状态与决策链）；引入数据库或在线协作文档（增加依赖与治理成本）。
- 影响 (Consequences): 新增若干治理文档；AI 接管须遵循必读顺序；协议文件不得进入产品运行时代码。

## DEC-002 — 采用 PCMP Lite 档位（极简 4 件套）
日期: 2026-11-08 | 状态: Proposed
- 确认来源: 无（待 inverstar 确认）
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 项目转为多人协作、多阶段长期交付，或需要独立 TASK.md / 会话归档时升级为 Full 档位
- 背景 (Context): [事实] 当前为单人、单仓库的原型期插件，直接上 Full 会造成治理通胀。
- 决策 (Decision): 采用 Lite：`AGENTS.md` + `ai/PROJECT.md` + `ai/STATE.md`（含活动任务）+ `ai/DECISIONS.md`，免建 TASK / PLAN / ISSUES / sessions。
- 理由 (Reason): 协议 §3.2 明确单人项目、原型验证适用 Lite；需要时可平滑升级为 Full。
- 备选方案 (Alternatives): 直接采用 Full（文档维护成本与当前规模不匹配）。
- 影响 (Consequences): 状态与任务合并维护，历史轨迹主要依赖 Git 提交信息；跨会话恢复依赖 STATE.md 的及时更新。

## DEC-003 — 现阶段维持零构建、CommonJS 单文件形态
日期: 2026-11-08 | 状态: Superseded
- 确认来源: 无（提出时未经确认）
- Supersedes: 无
- Superseded-by: DEC-005
- 复审触发条件 (Review Trigger): 已由用户 2026-11-08 21:49 指令触发复审并被 DEC-005 取代，不再复审
- 背景 (Context): [事实] 当时仓库无 `package.json`、无构建与测试配置，`main.js` 是可被 Obsidian 直接加载的 CommonJS 产物。
- 决策 (Decision): 曾提议维持三件套直提形态，不引入构建链。
- 理由 (Reason): 当时零构建让安装与调试成本最低。
- 备选方案 (Alternatives): 立即引入 TypeScript + esbuild + 测试框架。
- 影响 (Consequences): 该提议未被采纳；用户随后明确要求引入构建链，见 DEC-005。

## DEC-004 — 统一插件标识为 timenote / TimeNote
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:29 会话中指令「统一为 timenote 吧，展示 TimeNote，但是 obsidian 插件目录是 timenote」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 插件已在 Obsidian 社区市场发布并产生外部用户后，若需再次变更 id 必须复审（会破坏既有 data.json）
- 背景 (Context): [事实] 原 `manifest.json` 为 `id=time-notes` / `name=Time Notes (时间笔记)`，与仓库名 `TimeNote` 及用户称呼不一致；JS / CSS 内部命名空间亦为 `time-notes-*`，三套标识长期分裂。
- 决策 (Decision): `id` 与 Obsidian 插件目录统一为 `timenote`（`<vault>/.obsidian/plugins/timenote/`），显示名统一为 `TimeNote`；同时把 view type、CSS 类名与 JS 类名前缀统一为 `timenote` / `Timenote` 命名空间；中文功能描述「时间笔记」保留。
- 理由 (Reason): 插件尚未发布、无外部用户，改 id 无兼容成本；一次性统一避免目录名、内部命名空间与显示名长期不一致。
- 备选方案 (Alternatives): 仅改 manifest、保留内部 `time-notes` 命名空间（改动最小但标识仍分裂）；保留 `id=time-notes` 只改显示名（插件目录与仓库名仍不一致）。
- 影响 (Consequences): 本地若已有旧插件目录 `time-notes/` 需手动改名为 `timenote/` 并迁移 `data.json`；设置数据键与业务逻辑不变；`author` 字段另行由 DEC-006 授权改为 `AIDockerCloud`。

## DEC-005 — 引入 TypeScript + esbuild 构建链
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:49 会话中指令「引入 TypeScript + esbuild 构建链、改成 AIDockerCloud」
- Supersedes: DEC-003
- Superseded-by: 无
- 复审触发条件 (Review Trigger): TypeScript / esbuild 主版本升级、决定不再把 `main.js` 入库（改为 CI 生成），或引入自动化测试 / 发布流水线时复审
- 背景 (Context): [事实] 原仓库只有可直接加载的 `main.js`（1922 行 JS），无依赖声明、无类型检查、无构建；首次 `tsc` 检查暴露 244 个错误（234 个动态实例属性 TS2339、6 个 `DomElementInfo.style` TS2353、4 个 `content` TS2551）。
- 决策 (Decision): 把源码迁到 `main.ts`（ESM + `import ... from "obsidian"` + `export default`），用 esbuild 产出 CJS `main.js` 并**继续入库**以保留零构建安装；新增 `package.json` / `tsconfig.json` / `esbuild.config.mjs` / `package-lock.json`，提供 `dev` / `build` / `typecheck` / `check` 脚本；TS7 使用 `moduleResolution: bundler`（`node10` 已移除）；采用渐进类型化（类索引签名 + DOM 事件断言 + 全局扩展 `DomElementInfo.style`），产物不压缩便于审阅与 diff。
- 理由 (Reason): 一次把 1922 行 JS 全量强类型化成本过高且易引入回归；渐进方案既不改变运行时行为，又立即获得类型检查、可复现构建与依赖锁定，同时不破坏现有三件套安装方式。
- 备选方案 (Alternatives): 一次性重写为严格类型 TS（工作量大、回归风险高）；`main.js` 不入库仅由 CI 构建（破坏零构建安装）；仅加 `@ts-nocheck`（类型检查形同虚设）。
- 影响 (Consequences): 新增 4 个 devDependencies，`node_modules/` 约 53 MB（不入库）；`main.js` 变为生成文件，提交前必须先 `npm run build`；类型检查已通过但 `strict: false` + 索引签名意味着类型安全仍有限；未引入运行时依赖与自动化测试。

## DEC-006 — manifest author 统一为 AIDockerCloud
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:49 会话中指令「引入 TypeScript + esbuild 构建链、改成 AIDockerCloud」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 项目归属、发布主体或署名策略变更时复审
- 背景 (Context): [事实] `manifest.json` 的 `author` 原为 `Antigravity`（生成代码的工具名），与仓库 owner `AIDockerCloud` 不一致。
- 决策 (Decision): `manifest.json` 与 `package.json` 的 `author` 统一为 `AIDockerCloud`。
- 理由 (Reason): 署名应与仓库归属一致；该字段仅用于展示，不影响 `id` 与用户 `data.json`。
- 备选方案 (Alternatives): 保留 `Antigravity`（署名与归属割裂）；改用个人名（用户未指定）。
- 影响 (Consequences): 仅元数据变化，无运行时影响；DEC-004 中「author 未获授权修改」的记录已由此决策补齐。

## DEC-007 — 时间块作为共享渲染层融入现有视图（块布局默认）
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 22:28 指令「方案B，可切换，默认是块布局，只做实际记录」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要支持计划排程 / 容量规划、跨日时间块，或月 / 季 / 年视图需要展示时间块统计时复审
- 背景 (Context): [事实] `parseLine` 已算出每条定时记录的 `startSeconds`/`endSeconds`，但 `renderTimeGrid` 仅用压缩流画横线，README 宣称的时间网格与重叠避让未实现；参考 TaskNotes（`timeEntries` + FullCalendar 共用画布、仅重叠分 lane）与 OpenTodo（Day/Week 拖放 time blocking，仍在同一日历画布）。
- 决策 (Decision): 不新增第 8 种视图模式；在 day / 3day / week 的时间网格中新增共享块布局（`renderBlockGrid`）：绝对定位 `top/height`、仅重叠簇内分 lane、时长徽标、标签 / 子项 / hover / 跳原笔记沿用现有交互。原压缩流保留为「紧凑流」（`renderCompactGrid`），工具栏可切换，设置项 `layoutMode` 默认 `block`、`defaultDuration` 默认 60 分钟。添加端：`QuickAddModal` 增加结束时间与实时时长提示及校验、空白槽点击按位置预填起止；`addEntry` 写日记行内 `HH:mm-HH:mm`，`parseLine` 增加 `isRange` 与跨零点兜底；时间线视图显示时长。时间块**只做实际记录**，不做计划排程、容量规划、计时器或计划/实际区分。
- 理由 (Reason): 7 个视图是时间尺度维度、时间块是条目形态维度，两者正交；做成 tab 会造成同一份数据两套渲染且月/季/年无法复用。两个参考项目都把时间块放在共享日历画布。数据层已具备起止时间，改动集中在渲染与添加交互，且块布局首次让 README 宣称的「时间网格」与实现对齐。
- 备选方案 (Alternatives): 新增「时间块」视图模式（组合爆炸、重复渲染）；保持压缩流只加时长标签（无法表达时间段跨度）；引入 frontmatter / 独立笔记（违反日记唯一数据源硬约束）。
- 影响 (Consequences): 紧凑流仍可用，用户可随时切回；跨零点范围一期不支持（兜底 30 分钟块）；月/季/年仍只显示计数；拖拽创建与块边缘调整起止未实现（P2）；新增 12 个 `timenote-block-*` / `timenote-event-*` 样式类。

## DEC-008 — 时间轴默认范围以代码 00:00-24:00 为准，并补齐设置项
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 22:41 指令「默认的设置没什么问题，设置里面可以调就可以」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要按「首次可见时段」自动滚动、或默认值需随用户作息自适应时复审
- 背景 (Context): 本条收敛 STATE 中长期挂起的 [未决] 差异项。[事实][差异] `README.md` 曾称时间轴默认 `06:00 - 24:00` 且「设置中可配置」，但 `main.ts` 的 `DEFAULT_SETTINGS` 为 `startHour: 0, endHour: 24`，且**设置页并无起止时间控件**——文档宣称的可调项在 UI 上不存在，`startHour`/`endHour`/`slotHeight` 只能靠手改 `data.json`。块布局与紧凑流两个渲染器都读这两项。
- 决策 (Decision): 默认值保持代码现状 `startHour: 0` / `endHour: 24`（全天覆盖，不漏记录），**不改默认**；在设置页新增「时间轴起始时间」（00:00–23:00）与「时间轴结束时间」（01:00–24:00）两个下拉，块布局与紧凑流共用，改动后立即保存并重渲染所有 TimeNote 叶子；起始时间调到不早于结束时间时自动把结束时间抬到 `起始+1`（上限 24:00）并提示，结束时间选到不晚于起始时间时拒绝并提示。文档同步为「默认 00:00 - 24:00，可按作息收窄」。
- 理由 (Reason): 默认全天是保守选择——记录不会被「视野外」的时间段丢掉；而「只关心 06:00 之后」是个人作息偏好，属于设置项而非默认值的职责。补 UI 后 README 的「可配置」才成为事实，差异从根上消除，而不是只改文档措辞掩盖。
- 备选方案 (Alternatives): 把默认改成 06:00-24:00（会让 00:00-06:00 的记录在网格中不可见，且改变既有用户观感）；只改 README 措辞为 0-24 而不补 UI（文档仍会宣称不存在的设置项）；引入时段预设（如「工作时段 09:00-18:00」）——留待有真实需求再做。
- 影响 (Consequences): 设置页新增 2 项、共 9 项；`slotHeight` 仍无 UI（属显示密度，暂不暴露）；全天默认下 24h × 52px ≈ 1248px，日视图需滚动（未做「自动滚动到当前时间/首条记录」，列为 P2 候选）。

## DEC-009 — 暴露每小时槽高设置，并加入当前时间指示线
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 22:47 指令「slotHeight（每小时槽高）开出来在设置里面可配置，另外有没有当前时间线？没有的话加一下」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要「首次打开自动滚动到当前时间 / 首条记录」、需要在紧凑流或月 / 季 / 年视图也显示当前时间位置、或需要指示线可关闭时复审
- 背景 (Context): 本条补齐 DEC-008 遗留的 `slotHeight` 无 UI 事项。[事实] `slotHeight` 自始存在于 `DEFAULT_SETTINGS`（默认 52px），块布局与紧凑流都读它，但设置页无入口，只能手改 `data.json`；DEC-008 已把 `startHour`/`endHour` 开出来，本条补齐同组最后一个显示参数。[事实] 代码中**不存在**任何当前时间指示（全仓无 `now-line` / `nowIndicator` 相关实现，也没有任何 `setInterval`），日历无法回答「我现在处在今天的哪个位置」。
- 决策 (Decision): ① 设置页新增「每小时槽高」滑块，范围 28–96px、步长 4、`setDynamicTooltip()` 显示当前值，默认 52；拖动会连续触发 `onChange`，故保存后经 150ms 防抖再统一重渲染所有 TimeNote 叶子。② 块布局新增当前时间指示线：`colsContainer` 末尾插入 `.timenote-now-line`，`left: 52px` 让开刻度列、`border-top: 2px`、`z-index: 6`、`pointer-events: none`；左侧 `.timenote-now-label` 用红底白字显示 `HH:mm`（`var(--color-red)` 带 `#e5484d` 兜底）；`tickNowLine()` 每 30s 更新 `top` 与标签，超出 `[startHour, endHour]` 时隐藏，`isConnected=false` 时静默返回；只在所显示日期包含今天时创建；定时器在 `renderTimeGrid` 重渲染前、`onClose` 中清除。
- 理由 (Reason): 槽高是同一维度（时间轴显示范围 / 密度）的最后一块拼图，收进设置页才能和不暴露 `data.json` 的普通用户对齐；当前时间线是日历类产品的默认预期（TaskNotes / OpenTodo / Google Calendar 皆有），且实现只需一个绝对定位元素 + 30s 定时器，不触碰数据层。
- 备选方案 (Alternatives): 槽高用下拉档位（30/40/52/64/80）——不如滑块细粒度；当前时间线做成每秒刷新的 `requestAnimationFrame`（无必要，分钟级足够，还费电）；在紧凑流里也画（时间轴已折叠，位置会误导）；首帧自动滚动到当前时刻（会与「文件修改即重渲染」冲突，用户滚动位置被反复夺走，故不做）。
- 影响 (Consequences): 设置页共 10 项；块布局 DOM 多 1 个元素 + 1 个 30s 定时器（紧凑流不起表）；`slotHeight` 改动会重建网格并重置滚动位置（防抖后一次）；默认全天 + 52px 时当前时间线可能在首屏之外，需要滚动才能看到；未实现「自动滚动到当前时间」。

## DEC-010 — 补 versions.json 与 patch 版号规则；块布局上下留白修复
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 23:14 指令「补一下，并按每次提交递进0.0.1递进，目前时间块视图最上面一行，应该是全天任务块把开始时间遮住了，解决这个问题就到1.0.1版本，同时最后一行要尽可能贴近底部，留一点空间方便看到时间，多出来的空间用于全天任务块的高度增加」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要自定义留白像素、改为「首屏自动滚动到当前时间」、或版本号规则改为语义化 minor / major 时复审
- 背景 (Context): ① [事实] 仓库缺 `versions.json`（社区插件发布必需），且 `manifest.json` / `package.json` 版本停在 `1.0.0`，功能迭代后版本号无变化，本地与远端无法区分新旧构建。② [事实][缺陷] 块布局中所有刻度标签用 `transform: translateY(-50%)` 垂直居中，起始小时标签 `top = 0`，其上半截落在滚动内容区之外被裁切 —— 视觉上「00:00」紧贴表头下方并只剩一半，用户描述为「全天任务块把开始时间遮住了」；同理末行 `24:00` 标签下半截超出容器，底部无余量可看。全天区仅 `min-height: 40px / max-height: 120px`，条目稍多即滚动。
- 决策 (Decision): ① 新增 `versions.json`（`1.0.0` → 映射 `minAppVersion 1.0.0`）与 `scripts/bump-version.mjs`（`npm run bump`，默认 patch +1，也可 `npm run bump -- x.y.z` 指定），一次同步 `manifest.json` / `package.json` / `versions.json` 三处并保持 `versions.json` 按版本号升序；确立「每次提交 patch +1」的版本规则（本次 `1.0.0` → `1.0.1`）。② 块布局引入 `BLOCK_TOP_GUTTER = 12` / `BLOCK_BOTTOM_GUTTER = 14`：容器与每列高度改为 `totalHeight + 12 + 14`，刻度标签 / 小时线 / 时间块 / 当前时间线 / 落点层的 `top` 统一加 12，落点层点击换算的 `y` 统一减 12 且落点层只覆盖网格本体（`top=12`、`height=totalHeight`、`bottom=auto`）；全天区调整为 `min-height: 56px` / `max-height: 180px`、`padding: 6px`。③ 文档同步：AGENTS 写入「新增绝对定位元素必须套用留白偏移」的约定与版本规则，README 增「版本号」小节与留白说明。
- 理由 (Reason): 刻度标签是半小时高的视觉锚点，被裁一半会让「最上面一行是几点」判断失真，也让人误以为是全天区压住了网格；统一用一个偏移量包住所有绝对定位元素，比逐个微调 `top` 更不容易错位。`versions.json` 是社区发布硬门槛，补齐后 `npm run bump` 把「记得改三个文件」变成一条命令，避免版本漂移。底部留白 14px 刚好容纳半个标签高度（约 6px）再留 8px 呼吸，末行既完整可见又贴近底部；全天区用释放的余量加高到 56–180px，能多显示 1–3 条全天条目。
- 备选方案 (Alternatives): 用 `padding-top` 撑开滚动区（绝对定位元素仍以 padding box 为参考，`top:0` 依然贴边，不解决问题）；把刻度标签改成 `translateY(-100%)` 贴底对齐（起始标签会整体跑到容器外，更糟）；给 `startHour` 默认值加半小时偏移（污染数据语义）；版本号用 `npm version`（会创建 tag 并触发 npm 语义，与 Obsidian 插件发布流程不符）。
- 影响 (Consequences): 网格总高 +26px（全天 52px 槽高下 1248 → 1274）；落点层不再覆盖上下留白，点击留白区不会误建记录；`versions.json` 需随每次提交追加，忘记 bump 会导致版本回退风险（已写入 AGENTS 红线 7）；`package-lock.json` 由 `npm install --package-lock-only` 同步；LICENSE 仍未补（授权协议需人类确认，未擅自选定）。

## DEC-011 — 全天区高度可拖拽调节；时间块支持拖拽创建与拖拽调范围
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 23:22 指令「全天任务行的高度要可以手动拖来调节，另外创建块的方式要和tasknotes体验一致，可以拖动来选择和调节时间范围」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要横向拖拽跨日、需要拖拽时显示吸附时间气泡、需要撤销（Ctrl+Z）拖拽结果，或需要把吸附粒度/最小块时长做成设置项时复审
- 背景 (Context): [事实] 全天区高度此前是 CSS 写死的 `min-height: 56px / max-height: 180px`（DEC-010 调整），用户无法按自己一天的全天条目数量调整；块布局的创建入口只有「单击空白槽」与「+ 记一条」弹窗，已有块的时间范围只能靠手改日记文本。参考 TaskNotes 的日历交互：空白处按住拖动直接圈出时间范围并创建，已有事件拖边缘改起止、拖主体平移。
- 决策 (Decision): ① 新增设置项 `allDayHeight`（默认 56，范围 40–320），块布局按它给每个 `.timenote-day-allday-container` 设内联 `height/minHeight/maxHeight`；全天区与网格之间插入 `.timenote-header-resizer`（6px 高、`cursor: ns-resize`），按住拖动实时改所有日列的内联高度，松手才 `saveSettings()`。设置页同步提供「全天区高度」滑块（步长 4）。② 空白槽改为指针拖拽创建：`pointerdown` 记录吸附锚点，位移 > 5px 才进入拖拽并显示 `.timenote-block-ghost` 虚线预览（实时 `起 - 止 · 时长`），松手用预览的起止打开 `QuickAddModal`；未拖动则沿用「吸附 30 分钟 + 默认时长」的单击行为。吸附粒度 15 分钟（`DRAG_SNAP_MINUTES`），最短 15 分钟（`MIN_BLOCK_SECONDS`）。③ 已有块支持拖拽调节：顶部/底部 8px 命中区改起止，中部整体平移（块高 < 30px 时仅平移）；拖拽中实时改 `top/height` 与 meta 文案，松手经新增的 `DailyNoteService.updateEntryTime` 回写日记行首时间前缀并重渲染。④ 拖拽结束浏览器补发的 click 用 `block.dataset.dragMoved` 吃掉，避免误跳原笔记；跨出 `startHour`–`endHour` 的记录不参与拖拽。
- 理由 (Reason): 全天区高度是「我一天有多少条无时间记录」的私人差异，写死必然有人不够用有人浪费；用分隔条比翻设置页更符合日历类工具的直觉。拖拽创建把「选范围」这件事从「先开弹窗再输两个时间」变成一次手势，和 TaskNotes 一致；而回写走「只改行首时间前缀」的正则，能把对用户笔记的改动面压到最小，符合既有「日记是用户数据」红线。
- 备选方案 (Alternatives): 用 HTML5 原生 drag-and-drop（无法精确按像素换算时间，且拖影不可控）；按住后先弹窗再拖（多一步，失去所见即所得）；把时间范围改成 frontmatter 字段以便自由拖拽（违反日记单行数据源约束，DEC-007）；拖拽后不立即写盘、等弹窗确认（会与「松手即创建」的直觉冲突，TaskNotes 也是松手即建）。
- 影响 (Consequences): 设置页共 11 项；块内多了 2 个 `.timenote-block-edge` 装饰元素（`pointer-events: none`，不拦截点击）；拖拽期间 `user-select: none`，块内文本不可直接选中复制；每次拖拽松手都会写盘并整视图重渲染（与勾选任务一致）；15 分钟吸附意味着无法通过拖拽得到 5 分钟级的精确范围（需要时仍可手改文本）；尚无跨日拖拽与撤销。

## DEC-012 — 自适应槽高（弹性时间轴）：空档压缩、有内容的小时按内容量撑开，轴总高不变
日期: 2026-11-08 | 状态: Superseded（分配策略被 DEC-013 取代；`buildTimeScale` 收口与拖拽反函数部分仍有效）
- 确认来源: inverstar 于 2026-11-08 23:28 指令「我有一个超棒的想法，自适应高度，对于有内容的时间块其高度随内容增加而变高，无内容的时间块则自动压缩高度，总高度不变，兼顾内容显示和全面展示，请单开一个分支进行尝试 看看效果如何」
- Supersedes: 无
- Superseded-by: DEC-013
- 复审触发条件 (Review Trigger): 肉眼验收后认为空档压缩不足 / 内容块过高、需要把压缩强度与放大上限做成设置项、需要跨日连续轴（周视图按天各自分配行高）、或需要「自动滚动到当前时间」时复审
- 背景 (Context): [事实] 块布局此前是严格等距时间轴 —— 每小时恒为 `slotHeight`（默认 52px），全天 24 行 1248px。空档时段与有记录的时段占据完全相同的像素，一屏装不下一天，且低信息量的空档大量浪费纵向空间；同时块高被时长锁死，一条 30 分钟的记录只有 26px，标题只能一行省略，`meta` 时间行几乎放不下，内容多反而看不清。[事实] 所有「秒 ↔ 像素」换算此前以 `BLOCK_TOP_GUTTER + (sec - dayStart)/3600 * slotHeight` 的形式散落在刻度、小时线、时间块、当前时间线、拖拽创建、拖拽调节六处，任何非线性改动都必须先统一收口，否则各自跑偏。
- 决策 (Decision): ① 新增 `buildTimeScale()`（`main.ts` 模块级）产出统一的时间轴对象，对外只暴露 `yOf(sec)` / `secOf(y)` / `heights[]` / `bounds[]` 等，六处换算全部改为经它调用，禁止再手写旧公式（写入 AGENTS 红线）。② 按「每小时一行」统计三个内容量指标：`covered`（该小时被记录覆盖的秒数）、`counts`（起点落在该小时的条目数）、`textLens`（这些条目的文本总长）；空档行 `min = desire = max = ELASTIC_MIN_EMPTY_ROW(14px)`，有内容行 `min = max(30, slotHeight*0.55)`、`desire = slotHeight*(1 + 覆盖比例*0.65 + 额外条目数*0.18 + 文本量*0.3)`、`max = min(desire*1.9, slotHeight*4.2)`。③ 用三档水位分配消耗固定总高 `rowCount * slotHeight`：`total ≤ Σmin` 时整体等比压缩；`Σmin < total ≤ Σdesire` 时在 min 与 desire 间解 λ；`Σdesire < total ≤ Σmax` 时在 desire 与 max 间解 λ（富余优先喂有内容的行）；全到上限仍有富余则均分给所有行。④ 行内保持线性、行间连续，`yOf`/`secOf` 互为反函数且严格单调（行高恒 > 0，映射不会退化）。⑤ 拖拽换算改用反函数：创建用 `secOf(clientY - rect.top)`，调节用 `secOf(原位置 + dy) - 原位置`（上边缘取起点基准、下边缘取终点基准），跨压缩区不跳。⑥ 渲染层按实际块高加 `is-dense`（<34px 收起时间行）/ `is-tiny`（<24px 收内边距与子项徽章）类；弹性模式下块标题允许折行（`-webkit-line-clamp: 4`），把撑开的高度真正用于显示文字。⑦ 新增设置项 `elasticTimeline`（默认 `true`），关闭后 `buildTimeScale` 走等距分支、输出与旧实现逐像素一致，可一键回退；`colsContainer` 加 `is-elastic` 类，折行等样式只在弹性模式生效。
- 理由 (Reason): 用户的核心诉求是「一屏既看全一天、又能看清内容」—— 等距轴本质是把「时间均匀」错当成「信息均匀」，而一天里空档的信息量远低于有记录的时段。把行高按内容量重分配、总高锁定，等于在不改变滚动范围与心理地图（上午在上、晚上在下）的前提下，把纵向空间从空档挪给内容。三档水位而不是简单按比例，是因为内容稀疏时「富余均分」会把压缩效果完全抹平（实测：3 条记录时空档仍为 42.5px，1 条 5 分钟记录时全天仍是 52px 等距）；改成「空档不参与富余瓜分、内容行按自身倍数膨胀、都吃满才均分」后，同样数据下空档 32.4px、内容行 203.5px，效果才成立。上限用 `desire*1.9` 而非固定值，是为了保留「条目越多越高」的单调性 —— 固定封顶会让条目多少在撞顶后失去区别（实测 1 条与 5 条都是 210.8px）。
- 备选方案 (Alternatives): 按「记录区间的并集」切分而非整点切分（更精细，但跨行块的映射与拖拽换算复杂一个量级，且与整点刻度天然对不齐，留作后续）；让轴总高随内容收缩（视觉最紧凑，但用户明确要求「总高度不变」，且会改变滚动范围与滚动位置）；用 CSS `flex` 弹性布局按 `flex-grow` 分配（无法做「秒 → 像素」的反算，拖拽与当前时间线会失去依据）；把空档行压到 0 或 `display:none`（映射不再一一对应，拖拽直接失效）；每行独立 `min-height` 不做总高守恒（会出现累计高度漂移，末行对不上轴底）。
- 影响 (Consequences): 设置页共 12 项；轴总高与滚动范围不变，但整点刻度变为不等距（视觉上时间不再均匀），用户对「某小时在哪个位置」的直觉需要重新建立；连续空档的小时标签密度升高，`.is-dense` 降字号到 0.6rem / 透明度 0.5 缓解，仍可能出现视觉拥挤；内容稀疏时（只有 1–2 条记录）数学上无法既压空档又保总高，此时效果退化为「空档 48px、内容行 190px」左右；周 / 3 天视图共用一条轴，按所有可见日的并集分配行高，因此某一天的重心升高会带动整行变化；块高不足 20px 时按 `MIN_RENDER_BLOCK_PX` 渲染，会轻微溢出自身时间段（内容极满时）；拖拽落到压缩区时块会瞬间变矮，松手重算权重后恢复，尚未做「拖拽中实时重算」。

## DEC-013 — 行高改为「内容定高」：行高跟内容走、块高恒等于时间跨度，并统一块布局视觉
日期: 2026-11-08 | 状态: Accepted（实验分支 `feat/elastic-timeline`，v1.0.4；块高规则于 2026-11-09 00:09 按用户追加指令修订）
- 确认来源: inverstar 于 2026-11-08 23:47 指令「全天任务行和开始时间有个奇怪的空行，而且整体风格不统一，请参考tasknotes或taskquence进行美化，另外高度和笔记内容强相关，如果内容不多不必拉高，随内容增多而增高」；同日 2026-11-09 00:09 追加指令「块的时间范围要和时间轴一致」，据此修订 ③（块高不再截短）
- Supersedes: DEC-012
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 出现「一小时里塞十条短记录」导致该行异常膨胀、或需要「块高不设上限、改为块内滚动」、或需要把 `estimateBlockNeed` 的估算换成真实 DOM 测量时复审
- 背景 (Context): [事实] v1.0.3 按 DEC-012 把轴总高锁死为 `rowCount * slotHeight`，富余空间必须被某一行吃掉，结果一条只有一行字的记录被拉到 150–200px 高，块内大片留白 —— 用户判定为「为了填满而拉高」，与初衷相反。[事实] 表头 `.timenote-timegrid-header` 有 2px 底边、其下还有一个 6px 的 `.timenote-header-resizer`（常规流元素）、滚动区顶部再留 `BLOCK_TOP_GUTTER = 12px`，三者叠加在全天区与第一个整点之间形成一条约 20px 的空白带（用户说的「奇怪的空行」）。[事实] 全天区用 `background-primary`（白）而表头是 `background-secondary`（灰），时间块/全天 chip/按钮各自用 4px / 6px 圆角、实线边框、不同字号，视觉不成体系。
- 决策 (Decision): ① **放弃总高守恒**。行高由内容决定：空档行 = `slotHeight * 0.34`（下限 16px）；有条目起点的行 = `max(slotHeight * 0.9, 40px)`；再按「该行内块实际需要的高度」做纵向槽位装箱（同时发生的块左右并排不同槽、先后发生的块上下叠放同槽，取最满的槽 + 8px 呼吸），保证块不会被压扁重叠。② 轴高不足视口时整体等比放大行距，倍数**封顶 1.5**（`ELASTIC_MAX_VIEWPORT_SCALE`），避免整条轴挤在面板上半截、同时不让块被拉虚。③ **块渲染高度恒等于它在轴上的时间跨度**（`yOf(end) - yOf(start)`，下限 16px）：上沿对齐开始时间、下沿对齐结束时间，与刻度严格一致；「内容多就高」全部由行高承担（内容多的行被 `estimateBlockNeed` 撑开，块随跨度一起变高）。**禁止**再把块从跨度里截短 —— 截短后下沿不再代表结束时间，会让块看起来只占时间段的一小截（首版 `min(跨度, need)` 的做法已被用户否掉）。同时把「被记录覆盖到的小时」（含跨行长条目的中间段）从空档高度抬到最小内容行高，否则跨小时的长条目会被掐成细条。④ `BLOCK_TOP_GUTTER` 改为 **0**，起始刻度标签用 `.is-first` 下移贴住轴线；`.timenote-header-resizer` 改为**绝对定位**压在表头底边上（8px 命中区、不占布局高度），彻底消除那条空行。⑤ 视觉统一（参照 tasknotes）：表头 1px 单线、全天区与表头同底色、全天 chip 与时间块共用一套语言（圆角 6px / 无实边框 / 左侧 3px 色条 / 淡色底 0.08–0.10 透明度 / 标题 0.775rem·500 / 时间 0.675rem·muted / 等宽数字）、刻度列去掉 `border-right`（交给列自己的 `border-left`，消除双线）、小时线降到 0.6 透明度、今日列加 3.5% 淡色底、当前时间线胶囊圆角 4px。
- 理由 (Reason): 「填满」和「内容定高」在数学上互斥 —— 只要总高锁死，稀疏的一天就必须有人吃掉富余，而唯一有意义的位置只有内容块本身（空档被压到底后没有别的去处），于是块被迫变胖。所以让轴高随内容伸缩才是唯一自洽解，代价是滚动范围不再恒定。把块高与行高解耦后还有一个额外好处：行距可以为了「一屏看全」自由放大，而块始终紧凑，信息密度不再被行距绑架。
- 备选方案 (Alternatives): 保留总高守恒、把富余喂给空档行（空档会涨回 45px 左右，压缩效果消失）；块高直接 `height: auto` 由 CSS 撑（绝对定位下无法参与避让计算，同 lane 的块会互相压住）；用 `ResizeObserver` 真实测量文字高度替代字数估算（最准，但要重排两轮、且每次渲染都要读布局，暂不引入）；只改视觉不改高度分配（用户的核心诉求就是高度）。
- 影响 (Consequences): 轴总高不再恒定，内容少的一天轴会明显变短（全空时约 24×18 = 432px），滚动范围随之变化；**块高与跨度绑定后，行高即块高** —— 一条时长两小时但只写了一行字的记录，块就是两小时的高度、下方留白（这是时间范围的真实体现，不再是「起点处的小卡片」），反之内容多的小时会把行和块一起撑高；`分列（lane）` 逻辑不变，同一簇内仍按时间重叠分列；拖拽时上下边缘可直接改起止（块的下沿就是结束时刻，不再需要「先拉满跨度」这一步）；`estimateBlockNeed` 是字数估算，不同字体/主题下会有 ±1 行误差。**修订（2026-11-09）**：原「仅块高 < 30px 时才退化为整体平移」条款已由 DEC-014 废止 —— 任意块高都必须能改起止。

## DEC-014 — 目标态视觉落地：把周视图做成一整张表格，并去掉所有拖拽把手
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 00:51 指令「为什么要把手？去掉把手，我希望边缘自然拖动，无论大小都要可以，目前这个看起来还行，请实现」；目标态视觉经 2026-11-09 00:35–00:50 两轮效果图确认（时间字体更粗/显眼/鲜艳、ALL DAY 行并入表格、块实色不遮字、表头不再格格不入）
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要可见的拖拽尺寸气泡 / 吸附提示、需要按块高改变命中策略（如固定 8px）、需要把「等距 36px/行」改回默认行高策略、或 ALL DAY 行需要独立底色时复审
- 背景 (Context): ① [事实] 效果图与 DEC-011 实现都在块的上下边缘画了条状把手（`.grip` / `.timenote-block-edge`），并且用「块高 < 30/44px 时只保留整体平移」来避免两条把手把矮块占满；用户明确反对这个思路 —— 把手本身多余，且「无论大小都要可以」改边界。② [事实] 表头是 `background-secondary` 灰底、ALL DAY 行与网格分属两块拼贴，时间刻度用 `text-muted` 0.68rem 无字重，整体不像一张表（用户两轮反馈）。③ [事实] 目标态此前只存在于 `scripts/dev/out/target-design.html`，插件代码一直没动；用户在本轮批准效果图并要求实现。④ [事实] `tickNowLine()` 还留了一条 `scale` 缺失时手写等距公式的 fallback，与 AGENTS 红线 9 冲突。
- 决策 (Decision): ① **删除所有把手 DOM 与 CSS**：`attachBlockDrag` 不再创建 `.timenote-block-edge`，`styles.css` 删掉对应规则；设计稿 `preview-target-design.mjs` 同步删 `.grip` 并用脚本演示光标切换。② **任意块高都能改起止**：命中区 `edgeOf(h) = clamp(h/3, 2, 9)`，上/下沿各一段、中间留平移段，最矮 16px 的块也有三段；删除 `compact = rect.height < 30` 退化分支。光标是唯一提示：`pointermove` 按位置切 `ns-resize` / `grab`，拖动中 `grabbing`，松手清空。③ 拖拽结果一律夹在 `scale.dayStartSec`–`scale.dayEndSec` 内（原来夹 0–86400，会把块拖出可见轴）。④ **整张表格化**：表头 / ALL DAY / 网格统一 `background-primary`；表头列 `border-right` 改 `border-left` 与网格列共用竖线；`timenote-block-ruler-spacer` 拆成 36px 日期行占位 + 自适应 `ALL DAY` 标签两层，标签随行高居中；ALL DAY 行无独立底色/粗线，chip 横向 wrap；`.timenote-header-resizer::after` 仅 hover 浮现。时间刻度 0.72rem/600/正文色 + `text-shadow` 描边断线，当前小时 `.is-now` 主色 + 9px 引出线，当前时间线同步改主色。⑤ 块：20% 底 / 42% 边 / 4px 左色条 / 7px 圆角、文字正文色、标题 600 字重；meta 只写 `起 – 止`，时长移入右下角 `.timenote-event-block-duration`，矮块随次要信息一起收起。⑥ `allDayHeight` 默认 56 → 36、下限 40 → 32（与整点行同量级）；`tickNowLine` 无 `scale` 时隐藏而不手写公式。⑦ 保留弹性时间轴（对应效果图右栏「内容驱动」），等距 36px/行仍由设置页「自适应时间轴」开关提供（效果图左栏）。
- 理由 (Reason): 把手是「把不可见的命中区画出来」的补丁，代价是矮块被两条 9px 条占满、于是又得加退化分支，越补越复杂；直接让边缘本身成为命中区、按高度比例自适应，一条规则同时解决「好看」和「无论大小都能拖」。视觉上先对齐目标再写代码，是为了避免重复出现「解决了错误的问题」—— 表头灰底、刻度淡化、ALL DAY 独立底色都是同一处结构性割裂，必须一起改，逐个微调只会继续拼贴。
- 备选方案 (Alternatives): 保留可见把手但做矮块自动隐藏（用户明确否决）；用 `ResizeObserver` 真实测量块高再决定命中区（每次渲染多一轮布局读取，无收益）；固定 8px 命中区（16px 块会被上下两片占满，中部平移消失）；把拖拽改到键盘 / 弹窗（失去 TaskNotes 手感）；改用等距 36px/行重排整条轴（会推翻 DEC-013 已确认的「内容定高」，用户本轮没有要求改行高策略）。
- 影响 (Consequences): 版本 1.0.4 → 1.0.5；`attachBlockDrag` 签名多了 `duration` 参数，调用处与拖拽中的 `paint()` 同步更新 meta 与时长；`allDayHeight` 默认值与下限变化只影响新配置（真机 `data.json` 里已是 89，需用户自行调回 36–40 才能完全对齐效果图）；`scripts/dev/out/*.png` 旧截图因沙箱拒绝 chromium 截图而未重生成并已清理，视觉基准以 `target-design.html`（可交互）为准；提交脚本升级为五段式，新增 `~/tmp/tn-v105-snapshot` 快照，否则第 4 段的 `rsync --delete` 会把本次改动抹回 1.0.4。

## DEC-015 — 修复真机「背景色全无 + 表头逐列错位」
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 01:30 反馈「有错位，而且背景色没了」（v1.0.5 部署后真机 reload 所见）
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): Obsidian 升级后 `color-mix()` 兼容性变化、需要自定义主题强调色变量、刻度列宽需要随语言/字号变化、或要把表头并入同一滚动容器时复审
- 背景 (Context): ① [事实] 查 Obsidian 官方 CSS 变量文档：**没有** `--color-accent-rgb`；`--color-orange-rgb` / `--color-green-rgb` / `--color-purple-rgb` 自 1.13 起弃用；`--background-modifier-border-rgb` 从未定义。插件 `styles.css` 里 29 处 `rgba(var(--xxx-rgb), a)` 展开后因变量未定义导致**整条声明失效**，时间块、全天 chip、今日列、热力图等在真机上全部透明。② [事实] `scripts/dev/preview-*.mjs` 自己补了 `--color-accent-rgb: 124,92,255`，所以预览稿一直是「有颜色」的，问题被完全掩盖 —— 这是「预览好看、真机没色」的根因。③ [事实] 用复刻真实 DOM 的浏览器探针测得：表头第 1 列相对网格左偏 6.23px、每列宽差 0.89px，逐列累积到 0。根因是 `.timenote-block-ruler-spacer` 作为 flex item 默认 `min-width: auto`，被 `ALL DAY` 标签的 min-content（约 58px）撑宽到 58.23px，而网格刻度列仍是 52px。④ [事实] 网格列继承 `.timenote-column` 的 `border-right`，与 `.timenote-block-column` 的 `border-left` 叠加成双线，表头列只有 `border-left`。⑤ [事实] 滚动条补偿只在一帧 `requestAnimationFrame` 里量一次，弹性轴二次重渲染、内容高度变化导致滚动条出现/消失后不再同步。
- 决策 (Decision): ① `styles.css` 所有失效写法改为**双声明**：先固定 `rgba()` 兜底（老内核至少不会全透明），再 `color-mix(in srgb, var(--color-accent / --color-orange / --color-green / --color-purple / --background-modifier-border, #fallback) N%, transparent)` 跟随主题；文件头写明禁用原因。今日列底色由 3.5% 提到设计稿的 5%。② 刻度列统一 `--tn-ruler-w: 64px`（`main.ts` 同步 `BLOCK_RULER_W = 64`，列宽估算、当前时间线 `left`、时间胶囊 `max-width` 全部走变量，不再硬编码 52px）；spacer 加 `min-width: 0` + `overflow: hidden`、ruler 加 `min-width: 0`，杜绝内容撑宽。③ 网格列显式 `border-right: none`，与表头共用唯一一条 `border-left` 竖线。④ 抽 `syncHeaderGutter(wrapper, header, scrollArea)`：rAF 首帧同步 + `ResizeObserver` 持续观察 `scrollArea` / `wrapper`，把 `offsetWidth - clientWidth` 补成表头 `padding-right`；两个渲染器共用，重渲染时断开旧 observer。⑤ 新增 `scripts/dev/preview-real-dom.mjs`（复刻真实 DOM + 内联真实 CSS，**故意不定义** `-rgb` 变量，页面底部探针输出 7 列 left/width 偏差与各类 computed background-color）与 `scripts/dev/test-visual-regression.mjs`（17 项静态断言），并接入 `npm test` / `npm run preview:real`。
- 理由 (Reason): 颜色失效是「预览环境比真机多几个变量」造成的假阳性，靠肉眼看设计稿永远发现不了，必须让预览与真机变量环境一致并用 computed style 断言。列错位不是视觉调参问题，而是 flex 自动最小尺寸把表头刻度列撑宽的结构性偏差 —— 只要 spacer 还能被内容撑宽，任何 padding 补偿都救不了；加宽到能容纳标签 + 显式禁止撑宽，才是一次性闭合。
- 备选方案 (Alternatives): 在插件 CSS 里自行补 `--color-accent-rgb` 变量（等于继续粉饰预览/真机差异，且不会跟随主题）；改回 `var(--background-secondary)` 灰底表头（只是遮住问题，且推翻 DEC-014 已确认的表格化视觉）；把 ALL DAY 标签缩小到能塞进 52px（字重与可辨识度下降，且不同语言/字号仍可能撑宽）；表头与网格合并到同一滚动容器并用 sticky 定位（改动面大，涉及两个渲染器与拖拽坐标）；用 `scrollbar-gutter: stable` 纯 CSS 补偿（滚动条始终占位，但表头仍需同等 padding，且旧版 Electron 不支持）。
- 影响 (Consequences): 本轮**不递增版本**（1.0.5 尚未提交，修复并入同一批次），但 `~/tmp/tn-v105-snapshot` 必须重新同步，否则五段式脚本第 4 段 `rsync --delete` 会把修复抹掉；真机 vault 的 `main.js` / `styles.css` 已重新覆盖，需 reload 插件。浏览器探针（浅色 / 深色）结果：7 列 left / width 偏差全部 0px，时间块 `color(srgb … / 0.2)`、任务块 `/ 0.22`、chip `/ 0.14`、今日列 `/ 0.05` 均非空；`npm test` 由 33+23 项扩为 33+23+17 项。

## DEC-016 — 时间块按天自动配色，并合入 main 继续推进
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 02:03 指令「每天的时间块的颜色不应该相同，没有指定的情况下，请给新块安排一个和当天其他块不同的颜色，现在把特性分支合入main，并在main分支继续推进」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要用户可自定义调色板 / 按标签或项目固定配色、需要跨天保持同一记录同色、需要让 ALL DAY chip 或紧凑流也参与配色、或块数长期超过 8 个需要更大调色板时复审
- 背景 (Context): ① [事实] DEC-014 把块的颜色收敛为「备忘 = 主题紫、任务 = 橙」两套固定色，于是同一天里所有普通块长得一模一样，密集时段难以区分不同记录。② [事实] 插件此前没有任何「指定颜色」通道，`parseLine` 只解析时间与标签。③ [事实] DEC-015 刚修过「主题变量未定义导致整条声明失效、真机全透明」，新配色若沿用 `rgba(var(--*-rgb), a)` 或未带 fallback 的 `var(--color-*)` 会重蹈覆辙。④ [事实] `feat/elastic-timeline` 上 1.0.1–1.0.5 五个签名提交已由用户本地执行完毕，工作区干净，`main` 仍是 `e5285db`（`feat` 的祖先），具备快进合并条件。
- 决策 (Decision): ① **调色板**用 Obsidian 官方 8 个扩展色 `purple / blue / cyan / green / yellow / orange / red / pink`，以 `var(--color-NAME, #fallback)` 形式提供 —— 明暗主题自动适配，且主题缺变量时仍有固定色兜底。② **分配算法** `assignDayTints(items)`（模块级纯函数）：显式指定先占位 → 未指定块以 `tintEntryKey()` 的 hash 为偏好色 → 若当天已用过就顺延到下一个未用色 → 超过 8 个块时允许复用但不与相邻同色。调用方按「开始时间 → 行号 → 文本」稳定排序，因此重渲染不跳色，新块自动拿到当天未用色，各天独立分配。③ **指定通道**：日记行写 `#color/blue`、`#色/绿` 或 `#color/#7c5cff`，`parseLine` 解析为 `entry.tint` 并从 `tags` 中剔除（不污染块内 meta / hover 标签）；`updateEntryTime` 只改行首时间前缀，指令原样保留。④ CSS 统一用 `--tn-tint` 驱动背景 / 边框 / 左色条，删除 `.is-task` 固定橙色规则（任务语义由复选框表达），`is-blinko` 灰左条、`is-completed` 透明度保留；ALL DAY chip 与紧凑流不参与配色。⑤ **分支**：`git checkout main && git merge --ff-only feat/elastic-timeline` 把 1.0.1–1.0.5 快进合入 `main`（不产生新提交，无需签名），后续一律在 `main` 上推进；版本 `1.0.5 → 1.0.6`。
- 理由 (Reason): 「同一天不同色」若靠随机或按渲染顺序取色，重渲染就会跳色、拖拽后颜色乱变，用户无法建立颜色记忆；用「内容 hash 偏好 + 当天冲突消解」既保证确定性，又天然让新块落到空位。调色板直接借官方扩展色变量，比自造一套 HSL 色板更贴主题，也避免 DEC-015 那类「预览有、真机无」的环境差异。指定通道用标签形态而不是新字段或 frontmatter，是为了不改动日记数据格式、且回写时不会被破坏。
- 备选方案 (Alternatives): 按 `getTagColor(tag)` 的标签 hash 上色（不同标签可能撞色、无标签的块仍同色，且不满足「新块一定不同」）；按 `isTask` 继续分两类色（就是当前被否掉的方案）；渲染时随机取色（重渲染跳色，无法复现）；把颜色写进日记文件持久化（每次新建块都要改写用户数据，且回写复杂度高，用户只要求「没有指定时自动安排」）；自造 8 组 HSL 常量（明暗主题要维护两套，且不跟随用户主题）；用 `--no-ff` 生成合并提交（沙箱 GPG 签名不可用，快进合并不产生新提交，正好绕开限制）。
- 影响 (Consequences): `main.ts` 新增 `BLOCK_TINT_BEGIN/END` 纯函数区块（测试按标记抽取）、`parseLine` 增加 `tint` 字段、`renderBlockGrid` 每天构建 `tintsByDay` 并给块 `setProperty("--tn-tint", …)`；`styles.css` 块颜色规则改为变量驱动；新增 `scripts/dev/test-block-tints.mjs`（25 项）并接入 `npm test`（33+23+20+25）；`preview-real-dom.mjs` 补齐 8 个扩展色变量并展示多色块（探针新增「同一天互不撞色」）。`npm run bump` 到 1.0.6，真机 vault 已重新部署。**签名提交仍需用户本地执行**（沙箱里 `gpg` 无法创建 lock 文件），交付 `~/tn-main-commit.sh`；`git push origin main` 在会话内超时，也一并交给该脚本。`scripts/dev/out/` 下的预览 HTML 曾随早期提交误入库（`.gitignore` 已声明忽略），提交脚本会用 `git rm --cached` 让它们退出版本库、本地文件保留。
- 执行结果 (2026-11-09 02:2x 补记): 用户已运行该脚本，`fd9af37` v1.0.6 签名提交完成、工作区干净；但 push 弹出「用户名/密码」未成功。根因经查为 `origin = https://github.com/AIDockerCloud/TimeNote.git` —— GitHub 自 2021-08-13 起不再接受 HTTPS 账号密码（须用 PAT / OAuth），此前的「push 超时」也是卡在非交互凭据提示，并非网络故障。用户本机 `~/.ssh/config` 早已配好 `git@github.com` + `id_ed25519`（22 端口可通），只是 remote 没用上。已执行 `git remote set-url origin git@github.com:AIDockerCloud/TimeNote.git`，`ssh -T` 实测返回 `Hi AIDockerCloud! You've successfully authenticated`，随后 `e5285db..fd9af37 main -> main` 推送成功，`origin/main` 与本地一致。此后 Git 远端一律走 SSH（AGENTS 红线 15）；`~/tn-main-commit.sh` 去掉 1.0.6 硬编码检查，改为可复用的通用签名提交+推送脚本。

## DEC-017 — 日期标题直接打开对应日记（日 / 3天 / 周 / 时间线）
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 11:55 指令「在各个周期视图中点击 all day 上面的标题，应该直接跳转到对应的日记」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要让月 / 季 / 年视图的日期格也直接打开日记、需要自定义日记创建模板或路径、需要改为新标签页打开以保留日历视图时复审
- 背景 (Context): ① [事实] `renderTimeGrid` 是日 / 3天 / 周三个视图的共享渲染层，按布局分派到 `renderCompactGrid` / `renderBlockGrid`，两张表都在 `ALL DAY` 容器上方画 `.timenote-day-title-row`；此前 `titleRow.onclick` 把 `currentDate` 设为该天并切到 `day` 视图，点击后仍停在日历里。② [事实] 时间线视图另有「打开日记 ↗」链接，只在 `findDailyNoteFile` 命中时打开，日记不存在时点击无任何反应。③ [事实] `DailyNoteService.addEntry` 已有「逐级建目录 + 创建 `# 日期` / `## quickAddSection` 日记」的成熟路径规则，`findDailyNoteFile` 的索引有 5 秒缓存。
- 决策 (Decision): ① 在 `TimeNoteView` 新增统一入口 `openDailyNoteForDate(dateStr)`：点击前清 `dailyNoteIndex` 强制重建 → 命中已有日记直接打开；未命中则按 `<periodicNotesFolder>/YYYY/Daily/MM/YYYY-MM-DD.md` 逐级建目录、创建与 QuickAdd 同结构的日记、写回索引并 `Notice`，最后 `getLeaf(false).openFile`。② `renderCompactGrid` / `renderBlockGrid` 两处 `titleRow.onclick` 一律改为调用该入口，并加 `title="打开 YYYY-MM-DD 日记"`。③ 时间线视图「打开日记 ↗」改走同一入口，消除「无日记时无反应」。④ 下钻到日视图仍由顶部「日」标签提供；月 / 季 / 年的日期格点击行为不变（它们没有 `ALL DAY` 行）。⑤ 版本 `1.0.6 → 1.0.7`，新增 `scripts/dev/test-open-daily-note.mjs`（16 项静态断言）接入 `npm test`。
- 理由 (Reason): 用户要的是「跳转到日记」而不是「在插件里换一个视图」，两者不能靠同一个点击同时满足；统一到一个入口可保证三种周期 × 两种布局 × 时间线共 7 个点击点行为一致，且复用 `addEntry` 的目录/模板规则，不引入第二套日记路径约定。自动创建空日记是为了点空白日期也能到达目标，而不是静默无反应。
- 备选方案 (Alternatives): 保留点击切日视图、另加右键或图标按钮打开日记（多一步操作，且用户明确要求「直接」）；只在日记存在时打开、缺文件时弹 Notice（点空白日仍到不了日记）；为每个视图各写一份打开逻辑（7 处重复，易漂移）；用 `app.workspace.openLinkText` 走 Obsidian 内部链接（依赖 Daily Notes 插件配置，路径与本插件自己的 `SpiralNotes/YYYY/Daily/MM` 不一致）；改月 / 季 / 年日期格也跳日记（会破坏既有下钻交互，超出本次指令范围）。
- 影响 (Consequences): `main.ts` 两处 `titleRow.onclick` 与时间线链接共 3 处改为统一入口，新增 `openDailyNoteForDate`；`styles.css` 未改（`.timenote-day-title-row` 已有 `cursor:pointer` / hover）。`npm test` 由 33+23+20+25 扩为 33+23+20+25+16 = 117 项；`npm run bump` 到 1.0.7、真机 vault 重新部署。**签名提交仍需用户本地执行**（会话内 GPG 不可用），连同 2026-11-09 02:2x 遗留的 3 个纯文档同步文件一并 `bash ~/tn-main-commit.sh "提交信息"` 提交并 SSH 推送；点击空白日期会在 vault 里新建一篇空日记，属预期行为。

## DEC-018 — 单时间点记录画成线，不扩展成任务 / 时间块
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 12:2x 指令「对于时间点的记录不要扩展成任务并展示成时间块，而是用线展示对应时间点，至于信息显示在线上或线下，线也可以拖动改变时间，但是不需要拖动边缘来扩展为时间块」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要把「信息在线上 / 线下」做成设置项、需要让点线支持跨日拖动或秒级回写、需要把「单时间 + `30m` 标签」也改成线、需要点线独立于按天配色体系、同簇点记录常超过 6 条需要更紧凑的堆叠策略时复审
- 背景 (Context): ⓪ [事实] 本决策**部分修订** DEC-007 / DEC-013 中关于「单时间点默认按 30 分钟绘制成块」的渲染约定，但不推翻两条 ADR 的主体（共享块布局、内容定高、块高恒等于跨度仍全部有效，只是不再适用于点记录），日记数据格式与 `parseLine` 输出也未改动，故 `Supersedes` 记「无」。① [事实] `parseLine` 对单时间点记录一律补 `endSeconds = startSeconds + 1800`，`renderBlockGrid` 再把所有 `hasTime` 条目交给 `layoutTimeBlockClusters` 画成 30 分钟卡片（还带任务复选框），用户看到的是凭空多出来的「任务块」。② [事实] `updateEntryTime` 会把单时间行改写成 `HH:mm-HH:mm` 范围行 —— 拖一次就把点永久变成块。③ [事实] 紧凑流的空闲段计算、时间线视图徽标、QuickAdd 弹窗提示都沿用了这个虚构的 30 分钟。④ [事实] DEC-013「块高恒等于跨度」与 DEC-014「任意块高都能拖边缘改起止」只对有范围的记录成立，套到时间点上就是问题本身。
- 决策 (Decision): ① **判定**：模块级纯函数 `isPointEntry(e) = !!e.hasTime && !e.isRange`；显式范围与「单时间 + `30m`/`1h`/`45min` 标签」仍是有跨度的块，保留用户显式表达的时长。② **渲染**：点记录从 `layoutTimeBlockClusters` 剔除，改由 `layoutPointLines()` 按「时间 → 行号 → 文本」稳定排序、15 分钟窗口归簇，每条画一条 `top = scale.yOf(startSeconds)` 的水平线；圆点 + 线下标签（时刻 / 内容 / 标签），簇内标签按 `POINT_ROW_H = 20px` 逐行错开；**不创建时间块 DOM、不创建复选框**。③ **信息位置**：默认「线下」（用户把选择权交给我方）；CSS 同时内置 `.timenote-point-line.is-above` 变体，靠 `--tn-label-offset` 翻转到线上，零 JS 改动即可切换，本期不增设设置项。④ **弹性轴**：点线不再按内容撑最多 6 行，改为按小时汇总 `pointNeeds`（每条 20px、多天取最大值）传进 `buildTimeScale` 并加到该行总高；映射仍严格单调 / `yOf`↔`secOf` 互逆，关闭自适应后等距模式忽略该需求。⑤ **拖拽**：新增 `attachPointDrag` —— 整条线上下拖动，位移走 `scale.secOf(baseY + dy)` 反函数、`POINT_SNAP_MINUTES = 1` 吸附，实时改 `top` 与时间胶囊；**没有 `blockEdgeHit`、没有 start/end 模式、没有把手 DOM**，光标全程 `ns-resize`；Blinko 等外部来源标 `is-readonly`、不绑拖拽（仍可点击跳转）。⑥ **回写**：新增 `updateEntryPointTime(entry, startSec)`，只替换行首那个单时间前缀，范围行 / 无时间行拒绝，其余文本、缩进、复选框、列表符、标签一字不动；`updateEntryTime` 原样保留供块拖拽使用，两个入口互不转换。⑦ 时间线视图徽标、QuickAdd 提示、紧凑流 `lastEndSec` 同步去掉虚构的 30m；点线沿用 `--tn-tint` 按天配色。⑧ 新增 `scripts/dev/test-point-lines.mjs`（57 项）与 `preview-point-lines.mjs`（浅/深真机等效预览 + 浏览器探针），`npm test` 扩为 174 项。
- 理由 (Reason): 「时间点」和「时间段」是两种语义，把所有定时记录都塞进 30 分钟块既篡改了用户数据的含义，也让拖拽回写把数据永久改写掉。判定只看 `isRange`（解析时已区分「显式范围 / 显式时长 / 纯时刻」），不引入新字段、不改日记格式，回写边界可以收得很干净。线精确落在 `yOf(sec)` 上，才能和 DEC-013 的「上下沿 = 真实时刻」保持一致；同簇标签错开而非横向分 lane，是沿用紧凑流「一行一条、不要并列」的既有偏好。点线不参与内容撑高、只按行计 20px，避免一条短记录把整条弹性轴拉高。1 分钟吸附比块的 15 分钟更贴合「精确到秒的时间点」，且不会把 `09:23` 悄悄变成 `09:30`。
- 备选方案 (Alternatives): 继续用 30 分钟块但改成窄条 / 半透明（仍是块，用户明确否决）；把点记录渲染成零高度块再靠 CSS 伪装成线（拖拽与边缘命中逻辑仍会漏出来，且 `updateEntryTime` 仍会把行改成范围）；复用 `updateEntryTime` 加 `keepPoint` 参数（一个方法两种语义，测试与红线更难守，且容易误把范围行压成点）；线也做上下边缘拖动并允许拉成块（用户明确「不需要拖动边缘来扩展为时间块」）；给信息位置做设置项（本期只是视觉取舍，先交付默认线下 + CSS 变体，等真机反馈再决定是否占一个设置位）；把「单时间 + 30m」也改成线（会抹掉用户显式写下的时长，超出本次指令）。
- 影响 (Consequences): `main.ts` 新增 `POINT_LINE_BEGIN/END` 纯函数区块（位于 `buildTimeScale` 与 `parseLine` 之间，开发脚本按既有切片自动取到）、`buildTimeScale` 增加可选 `pointNeeds`、`renderBlockGrid` 分流出点线渲染、`DailyNoteService.updateEntryPointTime` 与视图层 `attachPointDrag` / `commitEntryPoint`；`styles.css` 新增 12 条 `.timenote-point-line*` 规则（颜色走 `--tn-tint`，新增的 `color-mix` 遵守「固定 rgba 兜底」红线）。紧凑流仍保留 checkbox 与线行形态，只改空闲段计算；月 / 季 / 年视图不受影响。拖动后带秒的原始时刻会归一到分钟（1 分钟吸附），属已知取舍。**本轮不 bump、不签名提交**：工作区仍叠加未提交的 v1.0.7（DEC-017）改动，按红线 7 由用户在本地决定版号后统一 `npm run bump && npm run build` 再 `bash ~/tn-main-commit.sh "..."`；三件套 + README 已备份后覆盖到真机 vault（`~/tmp/timenote-backup-20261109-1245`，四文件 md5 与仓库一致），用户 reload 插件即可肉眼验收；`data.json` 未动。

## DEC-019 — 发版链路：`v*` tag 触发 GitHub Actions，产物为三件套 + 插件 zip
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 16:31 指令「增加 release 发包，把插件打包成 zip 作为产物，随版本发布」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 要提交 Obsidian 官方社区插件市场（需额外校验 `fundingUrl` / 清单白名单、可能要 `main.js` 之外的产物）、需要预发布 / beta 通道或按 patch 之外的发版节奏、需要给资产加校验和或签名、需要把同一 tag 同时发到 npm / BRAT 之外的渠道时复审
- 背景 (Context): ① [事实] 仓库此前**没有任何 tag 与 Release**（`git tag --list` 为空），也没有 `.github/`；分发完全靠「手动把三件套覆盖到真机 vault」和 `~/tn-main-commit.sh`，外人拿到仓库不知道「这一版该装哪几个文件」。② [事实] 交付物固定在 `manifest.json` + `main.js` + `styles.css` 三件套（AGENTS 硬事实），但没有任何机器可读的打包步骤，`zip` 需人工去压、极易压成「多套一层目录」导致 Obsidian 装不上。③ [事实] 版本一致性只靠 `npm run bump` 同步三处（DEC-010），发布时没有第二道校验，手工打 tag 很容易与 `manifest.json` 漂移（tag 说 1.0.9、插件其实是 1.0.8）。④ [事实] `gh` CLI 在 GitHub runner 上预装，`GITHUB_TOKEN` 配 `permissions: contents: write` 即可建 Release，无需第三方 action。
- 决策 (Decision): ① **触发口径**：`on.push.tags: ["v*"]` 才发版；`workflow_dispatch` 仅构建并上传 artifact 供试跑，**不建 Release**（避免手动触发误发）。② **硬校验**：tag 去掉 `v` 后必须与 `manifest.json.version` 完全相等，不等即 `exit 1`（报错信息提示先 `npm run bump`）。③ **打包**：新增 `scripts/pack.mjs`，用 Node 内置 `zlib.deflateRawSync` + 手写 zip（local file header / central directory / EOCD / CRC32），**不依赖系统 `zip` 命令、零第三方依赖**，Windows/macOS/CI 行为一致；zip **根目录**直接放三件套、不套文件夹；压缩后反而变大时降级为 store。`npm run pack` 只打包（`dist/timenote-<version>.zip`），`npm run dist` = `build` + `pack`；`dist/` 进 `.gitignore`，二进制产物不入库。④ **Release 资产**：`timenote-<version>.zip` + 三件套共 4 个附件 —— zip 给人手动装 / BRAT，独立三件套给需要单文件抓取的场景；已有同名 release 时走 `gh release upload --clobber` 覆盖而不是失败；说明用 `--generate-notes` 自动生成。⑤ workflow 步骤顺序：checkout → setup-node(22, npm cache) → tag 校验 → `npm ci` → `npm run build`（含 `tsc`）→ `npm run pack` → `upload-artifact@v4` → `gh release create/upload`。⑥ 落红线 19：Release 只能由 tag workflow 生成，禁止手工 `gh release create` 或网页传临时包绕过；zip 只能由 `scripts/pack.mjs` 生成。
- 理由 (Reason): tag 是唯一不可变、可回溯的版本锚点，把「发不发版」交给 `git push v1.0.8` 这一个动作，比让人记得「先 bump、再 build、再手工压 zip、再点网页上传」可靠得多。版本校验放在最前面，是因为漂移一旦进了 Release 就是用户侧装错版本、回滚要重发 tag，成本远高于让 CI 红一次。zip 结构用代码生成而不是文档约定，是因为「多套一层目录」这种错误肉眼看不出来、装进 Obsidian 才报错；同时纯 Node 实现在本机（Zorin）与 CI 上产出字节一致，`npm run pack` 可以在本地先验一遍再推 tag。用 `gh` 而不是第三方 release action，是为了不把一个需要长期维护的第三方供应链拉进发布路径 —— 发布失败时排查面越小越好。
- 备选方案 (Alternatives): `softprops/action-gh-release`（省几行脚本，但多一个第三方 action 与其 token 处理方式）；直接 `zip -r timenote.zip .`（会把 `.git` / `node_modules` / README 一起打进去，或套出 `timenote/` 子目录）；把 zip 提交进仓库（每版 35KB 二进制且与 tag 内容重复，`git diff` 不可读）；`bump` 后自动打 tag（会把「只改文档的提交」也变成一次发版，发版节奏失控）；只发 zip 不发三件套（BRAT / 需要单文件抓取的场景要解压一遍）；用 GitHub 自动生成的 source tarball 当产物（不含构建后的 `main.js` 语义保证，且名字不固定）。
- 影响 (Consequences): 新增 `.github/workflows/release.yml`（8 步）、`scripts/pack.mjs`；`package.json` 增加 `pack` / `dist` 两个 script；`.gitignore` 增加 `dist/`；README「快速上手」安装段改为优先下载 Release zip，新增「发版靠 tag」段落与 `pack` / `dist` 命令；AGENTS 常用命令补两条、红线补第 19 条。版本 `1.0.7 → 1.0.8`（`main.js` 字节不变 —— esbuild banner 不含版本号，只有 `manifest.json` / `package.json` / `versions.json` 变动）。本地已验证 `dist/timenote-1.0.8.zip`：3 个条目、`testzip()` 通过、CRC 正确、解出的 `main.js` 与源文件字节一致、`manifest.version=1.0.8`。**首次真实发版仍需用户执行 `git push origin v1.0.8`**（签名 tag 与推送不在会话内代做），之后每次发版 = 一次 tag 推送。

## DEC-020 — 快速记录插入标题由配置指定层级与名称，不再写死二级
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 17:01 指令「默认插入标题现在写死了二级，我希望可以通过写## 灵感闪念和### 灵感闪念来指定，方便调整标题和层级」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 需要按标题层级过滤条目 / 支持多个插入区 / 让设置值带大于 6 级或 Setext 标题（`===`）/ 需要把新条目插到该节末尾而不是标题下第一行、或需要跟随 Obsidian 模板插件生成的标题结构时复审
- 背景 (Context): ① [事实] `DEFAULT_SETTINGS.quickAddSection` 是纯文本 `"灵感闪念"`，`addEntry`（新建日记 + 已有日记两种路径）与 `openDailyNoteForDate` 三处都拼 `` `## ${settings.quickAddSection}` ``，层级硬编码为二级；设置项说明也直写「默认追加在哪个二级标题下方」。② [事实] `parseDailyFile` 判定「随手记区」靠 `currentSection.includes("灵感"|"闪念"|"Inspirations"|"Memos")` 的关键词启发式 —— 用户若把标题改成「随手记」，该节里无时间的纯文本行将不再被解析（无时间无任务无 bullet 的行会被 `parseLine` 丢弃）。③ [事实] `addEntry` 用 `fileText.includes(sectionHeader)` + `replace` 做子串匹配：正文里出现同名文字会误插；且已有日记若是 `###` 标题、配置是 `##`，会在文末再建一个同名的二级节。④ [事实] 真机 `data.json` 里存的是旧纯文本值，改成结构化配置会破坏既有用户设置。⑤ [事实] 上一轮 DEC-019 已把版本 bump 到 1.0.8 但尚未提交。
- 决策 (Decision): ① **配置值本身就是 Markdown 标题**：默认改为 `"## 灵感闪念"`，写 `"### 随手记"` 即三级标题 + 自定义标题名。模块级纯函数 `parseQuickAddSection(raw)`（`SECTION_HEADING_BEGIN/END` 区块）返回 `{level, title, heading}`：`^(#+)\s*(.*)$` 解析井号数（1–6 夹取），无 `#` 时 `level=2` 兼容旧 `data.json`，空值 / 只有井号回退标题 `灵感闪念`，行尾 ATX 闭合井号（`## 灵感闪念 ##`）清理掉。② `sectionHeaderRegex(title)` 生成 `^\s*#{1,6}\s+<转义后的标题>\s*$`，**按标题名匹配任意层级**的标题行。③ 四处调用统一：`addEntry` 新建日记用 `section.heading`；已有日记逐行 `findIndex(headerRe.test)`，命中则 `splice(idx+1, 0, newLine)`，未命中才在文末追加 `section.heading`；`openDailyNoteForDate` 新建日记用 `heading`；`parseDailyFile` 用 `memoTitle` 与 `currentSection` 精确比较（**保留**旧关键词启发式兼容老日记，并同步去掉 `currentSection` 行尾闭合井号）。④ 设置页文案改为「写带 # 的标题即可同时指定层级与标题」、placeholder `## 灵感闪念`、空值回退 `DEFAULT_SETTINGS.quickAddSection`。⑤ **已有日记沿用原有层级**，不按配置重建标题 —— 换层级只影响之后新建的日记，避免同一天出现两个同名不同层级的节。⑥ 新增 `scripts/dev/test-quick-add-section.mjs`（44 项：纯函数解析、标题行精确匹配、`addEntry` 假 vault 端到端插入 / 新建日记、四处调用点静态断言），接入 `npm test`（218 项）。
- 理由 (Reason): 「标题」在用户心智里就是一行 Markdown，让设置值直接写成 `### 随手记` 比再加一个层级下拉更直观，且天然把「层级」与「标题名」绑在同一个值里、不会各存一半导致漂移。解析集中到一个纯函数，是因为原先三处各自拼 `## `，只要漏改一处就会出现「新建日记是三级、QuickAdd 插入还是二级」；纯函数也便于开发脚本按标记切片测真实产物。把 `inMemoSection` 接上配置标题是必须的连带修改 —— 否则「方便调整标题」只做了一半，改完名字该区的记录就消失。逐行精确匹配顺手修掉子串误命中，同时让「改名 / 改层级」不会在旧日记里堆出重复标题。旧纯文本值按二级兜底，是为了不动真机 `data.json`（DEC-004 的用户设置兼容原则）。
- 备选方案 (Alternatives): 设置页另加「标题层级」下拉（多一个控件，层级与标题分离、容易改一个忘另一个）；只改 `addEntry` 不改 `openDailyNoteForDate`（两个建日记入口行为分叉）；保留 `fileText.includes` 只把 `##` 换成配置前缀（正文误命中仍在，且层级一变就会重复建节）；按配置 `heading` 精确匹配（改层级后同一天出现 `##`/`###` 两个同名节）；把 `data.json` 改成 `{level,title}` 结构（需要迁移旧配置，收益不抵复杂度）；用 Obsidian `MetadataCache` 的 heading 定位（异步、依赖编辑器缓存，且 `addEntry` 是同步读文件改写）；把新条目插到该节末尾（改变既有「最新在最上」的手感，未获用户确认）。
- 影响 (Consequences): `main.ts` 新增 `SECTION_HEADING_BEGIN/END` 纯函数区块、`DEFAULT_SETTINGS.quickAddSection` 默认值变更、`addEntry` 插入逻辑改为逐行匹配、`openDailyNoteForDate` / `parseDailyFile` / 设置页三处同步；`main.js` 已重新构建。**版本维持 1.0.8 不重复 bump**（DEC-019 的 bump 尚未提交，合并为同一次提交，避免 1.0.7 → 1.0.9 跳号）；`dist/timenote-1.0.8.zip` 已重新 `npm run dist` 生成（包内 `main.js` 与源码字节一致、含 `parseQuickAddSection`），否则发布包里还是旧的 `main.js`。新增 `test:section` script、`npm test` 由 174 扩为 218 项；README / AGENTS（硬事实、常用命令、红线 20）/ STATE 同步。真机验证路径：设置页填 `### 随手记` → 点空白日期新建日记，应看到三级标题；再 QuickAdd 一条，应紧插在标题下；把配置换回 `## 灵感闪念`，旧日记里仍沿用原来那个三级节。

## DEC-021 — 修复写日记后页面下方重复渲染一个日历视图（异步渲染竞态）
日期: 2026-11-09 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-09 17:27 反馈「有个 bug，创建新时间块的时候，页面下方会再渲染一个相同的日历视图，刷新后才能恢复，看看是什么原因？」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): `renderView` 需要增量渲染 / 局部刷新、需要把 `refreshData` 拆成多个 await 阶段、需要引入跨视图共享的刷新调度器、或真机仍出现重复视图（说明有绕过防线的入口）时复审
- 背景 (Context): ① [事实] `TimenoteView.onOpen()` 注册了 `this.app.vault.on("modify", () => this.renderView())` —— 全局监听，**任何**文件写入都会触发一次完整重渲染。② [事实] `QuickAddModal` 保存按钮的顺序是 `await addEntry(...)`（内部 `vault.modify` / `vault.create` 写日记）→ `Notice` → `close()` → `onSaved()` → 再次 `renderView()`；写文件本身已经派发了 modify 事件，因此一次「新建时间块」几乎同时产生两个 `renderView()`。③ [事实] `renderView()` 是 async：开头同步 `container.empty()` + `addClass()`，接着 `await this.refreshData()`（内部 `await getEntriesForRange` / `vault.read`），恢复后才同步调 `renderHeader` / `renderSubHeader` / `renderXxxView` 往**同一个 container** append 一整套 DOM。④ [推论→已由测试复现] 两次调用的 `empty()` 都发生在对方 append 之前：A empty → await，B empty → await，A 恢复 append 一套，B 恢复再 append 一套，于是页面下方叠出第二个完整日历视图；下一次刷新只有一次渲染，故「刷新后恢复」与用户观察完全吻合。⑤ [事实] 同源问题不止 QuickAdd：拖拽回写 `updateEntryTime` / `updateEntryPointTime` 是「vault.modify 事件 + 显式 renderView」，`saveSettings()` 遍历所有 leaves 调 renderView，都会并发。⑥ [事实] 1.0.8 已于 17:18 发布（签名 tag `v1.0.8` + Actions 全绿），修复必须走新 patch 版本。
- 决策 (Decision): ① **generation 防线**：`renderView()` 开头 `const gen = (this.renderGeneration || 0) + 1; this.renderGeneration = gen;`，`await this.refreshData()` 之后立即 `if (gen !== this.renderGeneration) return;` —— 并发时只有最后一次调用能落地，旧调用在 await 后直接丢弃。不做串行队列，避免同一批触发跑两次全量渲染和可见闪烁。② 容器由 `this.containerEl.children[1]` 改为 `this.contentEl`（ItemView 官方 API，不再依赖 children 索引）。③ **保留双触发路径**：modify 事件覆盖外部编辑 / 其它入口写入，onSaved 覆盖新建文件（`create` 事件）等 modify 不 firing 的情况；不靠删事件或删回调来「规避」。④ 新增 `scripts/dev/test-render-race.mjs`（18 项）：抽真实 `renderView` 方法体 + 假 DOM，覆盖单次 / 串行 / 2–3 次并发 / 乱序完成 / `renderHeader` 只跑一次；**并设对照组** —— 去掉代号检查后两次并发应叠出 6 个节点（两套 DOM），以此自证测试确实抓得到根因。接入 `npm test`（236 项）。⑤ 版本 `1.0.8 → 1.0.9`，重打 `dist/timenote-1.0.9.zip`，真机 vault 备份后重新部署。
- 理由 (Reason): 这是典型的「async 方法把清空与重建拆在 await 两侧」竞态，任何单个调用点去重都治标不治本 —— 触发源有 modify 事件、QuickAdd、拖拽、设置页四类，删掉一个还有别的。把防线放在 `renderView` 内部，等于给所有入口（含以后新增的）一次性兜底；代号比对只丢弃「已经过时的渲染意图」，不改数据来源、不改刷新时机，也不需要定时器（避开 AGENTS 里「新增定时器要在 startNowClock/stopNowClock 三处收口」的约束）。重复 DOM 不能只用 CSS 藏起来：两套 DOM 意味着两套点击监听、两套 ResizeObserver、两套 now-clock 定时器，会持续泄漏并让拖拽命中错元素。
- 备选方案 (Alternatives): 删掉 `onSaved` 只靠 modify 事件（新建日记走 `create` 而非 `modify` 时会漏刷新，且拖拽回写仍可能并发）；给 modify 加 debounce 定时器（要在 `onClose` 清理，且只是降低并发概率，不能保证顺序）；把 `renderView` 串行排队（同一批触发跑两次全量渲染，中间 `empty()` 造成闪烁，且旧结果随后被清掉纯属浪费）；把 `container.empty()` 移到 `await` 之后（并发时 A 渲染完可能被 B 的 empty 清掉，留空白页）；加 `display:none` 隐藏第二个容器（DOM / 监听 / 定时器仍翻倍，属遮丑）；给 `renderView` 加 `isRendering` 布尔锁直接 `return`（第二次调用若携带更新的数据/视图模式，会被整个丢掉，可能停在旧状态 —— 代号方案让最后一次生效，语义正确）。
- 影响 (Consequences): `main.ts` 的 `renderView` 增加代号领取与 await 后检查（4 行）+ 容器换成 `this.contentEl`，其余渲染逻辑不动；`main.js` 已重建。新增 `scripts/dev/test-render-race.mjs`（18 项）、`package.json` 的 `test:render`，`npm test` 由 218 扩为 236 项；AGENTS 补硬事实 / 常用命令 / 红线 21，STATE 升 revision 26 并清掉「v1.0.8 未提交 / 首次发版未跑」等过时措辞。版本 `1.0.9`，`dist/timenote-1.0.9.zip` 重打，真机 vault 三件套 + README 重新备份覆盖（`data.json` 不动）。**本轮未提交、未打 tag**：1.0.8 已发布，修复需等用户确认后按「签名提交 → `v1.0.9` tag → Actions 发版」标准流程走。

