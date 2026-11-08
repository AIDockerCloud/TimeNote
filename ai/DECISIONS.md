---
pcmp_version: "2.2"
revision: 7
updated: 2026-11-08
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
