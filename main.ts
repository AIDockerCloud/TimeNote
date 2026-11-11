// TimeNote 源码：TypeScript 入口，构建产物为根目录 main.js
// 请修改本文件后执行 npm run build，不要直接编辑 main.js
//
// ⚠️ 本文件是 **Obsidian 宿主适配层**（DEC-023）。平台无关的纯逻辑
// （时间轴数学 / 解析 / 布局 / 配色 / 行首改写）都在 core/ 里，由 Blinko、
// 思源两个宿主共用 —— 改核心逻辑请改 core/，不要在这里改出一份副本。
import {
  Plugin,
  ItemView,
  WorkspaceLeaf,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  Modal,
  setIcon,
  normalizePath
} from "obsidian";
import {
  // 时间轴与布局
  buildTimeScale,
  estimateBlockNeed,
  layoutTimeBlockClusters,
  layoutPointLines,
  isPointEntry,
  ELASTIC_EMPTY_RATIO,
  ELASTIC_CONTENT_RATIO,
  ELASTIC_MIN_EMPTY_ROW,
  ELASTIC_MIN_CONTENT_ROW,
  ELASTIC_ROW_PAD,
  ELASTIC_MAX_BLOCK,
  ELASTIC_MAX_VIEWPORT_SCALE,
  MIN_RENDER_BLOCK_PX,
  POINT_ROW_H,
  POINT_LABEL_GAP,
  POINT_CLUSTER_WINDOW_SEC,
  POINT_SNAP_MINUTES,
  // 时间工具
  formatSecondsToTime,
  parseTimeToSeconds,
  addMinutesToTime,
  snapSeconds,
  blockEdgeHit,
  formatDuration,
  getTagColor,
  BLOCK_TOP_GUTTER,
  BLOCK_BOTTOM_GUTTER,
  BLOCK_RULER_W,
  DRAG_SNAP_MINUTES,
  MIN_BLOCK_SECONDS,
  POINT_CREATE_SNAP_MINUTES,
  // 配色
  assignDayTints,
  resolveTint,
  tintCssOf,
  tintEntryKey,
  hashTintKey,
  BLOCK_TINTS,
  // 解析与改写
  parseLine,
  normalizeAddType,
  rewriteEntryLineTime,
  collectSubItemLines,
  parseQuickAddSection,
  sectionHeaderRegex
} from "./core/index";
import {
  // 数据源层（DEC-023）：聚合远程来源
  AggregateSource,
  MemosSource,
  BlinkoSource,
  isExternalSource,
  sourceBadge,
  sourceCssClass,
  sourceLabel
} from "./sources/index";
// 本地日记数据源（DEC-026）：第一个可写 NoteSource。
// 解析 / 回写逻辑全在 sources/daily.ts，这里只做装配与转发。
import { DailySource } from "./sources/daily";
// 本地 Blinko 导出 md（DEC-027）：读写 vault 里的 Blinko/Notes/*.md，
// 与上面走 HTTP API 的 BlinkoSource 是两回事，只是共用 source="blinko"。
import { BlinkoLocalSource } from "./sources/blinko-local";
import { createObsidianFileStore } from "./hosts/obsidian/vault-store";
import {
  // 共享浏览器基础设施（DEC-024）：宿主注入的日期实现
  moment
} from "./ui/index";
import { prepareHostEnvironment, mountTimeNote } from "./apps/bootstrap";
import { createObsidianHostAdapter } from "./hosts/obsidian/adapter";

// 渐进类型化：现有实现大量依赖运行时动态挂载的实例属性。
// 先以索引签名放行，后续按模块逐步替换为显式字段与具体类型。
declare global {
  interface DomElementInfo {
    style?: string;
  }
}

const VIEW_TYPE_TIMENOTE = "timenote-calendar-view";

// 远程来源的渲染缓存（DEC-023）。
// 视图重渲染很频繁，每次重拉 HTTP 既慢又费流量；60 秒足够挡住同一批操作里的
// 重复请求，又不至于让用户觉得「刚在 memos 写的没出现」。
const REMOTE_CACHE_TTL = 60 * 1000;
const REMOTE_CACHE_MAX = 16;

const DEFAULT_SETTINGS = {
  periodicNotesFolder: "SpiralNotes",
  includeBlinko: true,
  defaultView: "week", // 'day', '3day', 'week', 'month', 'quarter', 'year', 'timeline'
  startHour: 0,
  endHour: 24,
  slotHeight: 52,
  firstDayOfWeek: 1, // 1: Monday, 0: Sunday
  parseAllBullets: true,
  // 允许直接写 "## 灵感闪念" / "### 随手记" 指定层级与标题；纯文本（旧配置）按二级兼容
  quickAddSection: "## 灵感闪念",
  layoutMode: "block",
  defaultDuration: 60,
  // 新建记录的默认类型：block = 起止时间块，point = 只有一个时刻的时间点（DEC-022）
  defaultAddType: "block",
  allDayHeight: 36,
  // 自适应时间轴：行高由内容决定，轴高随内容伸缩（DEC-013）
  elasticTimeline: true,

  // ---- 远程来源聚合（DEC-023）----
  // 这里走 HTTP API，与上面 includeBlinko 的「读 vault 里的导出 md 文件」是两回事：
  // 一个是本地文件（可写、可拖拽），一个是远程接口（只读聚合）。
  // 聚合进来的条目一律只读（entry.readonly = true）。
  memosEnabled: false,
  memosBaseUrl: "", // 如 https://memos.example.com
  memosToken: "", // memos 的 Access Token（Bearer）
  blinkoApiEnabled: false,
  blinkoBaseUrl: "", // 如 https://blinko.example.com
  blinkoApiKey: "" // Blinko 的 API Token（Bearer）
};

// --- BLOCK_TINT_BEGIN ---
// 同一天的时间块默认使用互不相同的颜色（DEC-016）。
// 调色板直接借用 Obsidian 官方扩展色变量：明暗主题自动适配，不必维护两套色值。
// 「指定」通道：日记行里写 #color/blue 或 #色/蓝；未指定则由本模块按天自动分配。
// 主题若没定义某个扩展色，也不能让块变成全透明（DEC-015 的教训）




// 把 #color/blue、#色/绿、#7c5cff、未知名字都解析成一个确定的 CSS 颜色值。
// 返回 index 仅用于「占位」：显式指定的调色板色不应再被自动分配的块占用。

/**
 * 为「一天」的所有定时块分配颜色，返回与 items 等长的 CSS 颜色值数组。
 * - 显式指定的先占位；
 * - 未指定的以 entry key 的 hash 作为偏好色，若当天已用过就顺延到下一个未用色；
 * - 因此只要当天块数不超过调色板容量，颜色必然两两不同，新块自动拿到当天未用色；
 * - 纯函数 + 稳定排序（由调用方保证），重渲染不会跳色。
 */
// --- BLOCK_TINT_END ---

// Deterministic tag color generator


// 块布局网格的上下留白（px）：
// 顶部 —— 必须为 0：任何留白都会在「全天区」和第一个整点之间多出一条空行。
//          起始时刻的刻度标签改用 .is-first 规则下移贴住轴线，不再靠留白躲避裁切。
// 底部 —— 结束小时的刻度标签需要半行余量，同时让最后一行尽量贴近底部。
// 时间刻度列宽度：必须与 styles.css 的 --tn-ruler-w 一致。
// 列宽估算、当前时间线起点都依赖它，改一处就要改另一处。

// 时间吸附：拖拽创建 / 调节范围时按 N 分钟取整，避免出现 14:37 这种脏时间
// 从空白槽新建「时间点」也按 15 分钟吸附；已有点线的拖动仍是 1 分钟（DEC-018），
// 两者不能混：一个是凭空定时刻，一个是微调已有记录。


// 无把手边缘命中区（DEC-014）：按块高的 1/3 取，2–9px 夹取。
// 任何高度都留得出「上沿 / 中部平移 / 下沿」三段，最矮的 16px 块也不例外。




// 只在真正重叠的区间内分列；不重叠的区间占满整列（借鉴 TaskNotes lane 策略）

// ============================================================================
// Elastic Time Scale（弹性时间轴）
// ============================================================================
// 行高由「内容本身需要多少像素」决定：
//   - 完全没有记录的小时压到 slotHeight * ELASTIC_EMPTY_RATIO（默认约 18px）
//   - 被记录覆盖到的小时（含跨行条目的中间段）至少给到最小内容行高，避免长条目被掐细
//   - 行内条目按内容高度求和，内容多的行自然变高
//   - 整轴不足视口时整体等比放大行距，但设上限，防止块被拉成大片留白
//
// 重要：块的高度恒等于它在轴上的时间跨度（height = yOf(end) - yOf(start)），
// 所以「内容多就高」只能靠行高实现，绝不允许再把块从跨度里截短 ——
// 一旦块比跨度矮，块的下沿就不再对应结束时间，与时间轴刻度自相矛盾。
//
// 关键约束：sec -> y 的映射必须在整条轴上严格单调递增且连续 ——
// 时间块的 top/height、整点刻度线、当前时间线、拖拽的像素↔时间换算全部依赖它。
// 一旦出现高度为 0 的行，映射就不再是一一对应，拖拽会直接失效。
//
// ============================================================================
// Parser & Data Engine
// ============================================================================

class DailyNoteService {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    // 本地日记的解析 / 索引 / 回写已迁到 sources/daily.ts（DEC-026），
    // 本地 Blinko 导出 md 的解析迁到 sources/blinko-local.ts（DEC-027）。
    // 这里只保留两件宿主侧的事：装配文件存储、远程来源聚合编排。
    this.store = createObsidianFileStore(app);
    this.daily = new DailySource({ store: this.store, settings });
    this.blinkoLocal = new BlinkoLocalSource({ store: this.store });
    // 上一轮远程来源的错误（id -> message）。设置页「测试连接」与排障用，
    // 不在打开日历时弹 Notice —— 那太吵了（DEC-023）。
    this.lastRemoteErrors = {};
    // 远程条目的区间缓存："2026-11-10..2026-11-16" -> { at, entries }
    this.remoteCache = new Map();
  }

  // ---- 本地日记：全部转发到 DailySource ----
  // 保留这两个 Map 的 getter，是因为 HostAdapter 与设置页仍在调
  // `service.fileCache.clear()` / `service.dailyNoteIndex.clear()`。
  // 改成方法会让改动扩散到 adapter，而这些调用语义本来就只是「清缓存」。
  get fileCache() { return this.daily.fileCache; }
  get dailyNoteIndex() { return this.daily.index; }
  /** 本地 Blinko 导出的解析缓存（DEC-027）。原实现与日记共用一个 Map，
   *  迁成独立来源后必须单独清 —— 否则「刷新」按钮清不掉它 */
  get blinkoCache() { return this.blinkoLocal.fileCache; }

  buildIndexIfNeeded() { return this.daily.buildIndexIfNeeded(); }
  findDailyNoteFile(dateStr) { return this.daily.findDailyNoteFile(dateStr); }
  ensureDailyNote(dateStr) { return this.daily.ensureDailyNote(dateStr); }
  clearIndex() { return this.daily.clearIndex(); }
  toggleTask(entry) { return this.daily.toggleTask(entry); }
  updateEntryTime(entry, startSec, endSec) { return this.daily.updateEntryTime(entry, startSec, endSec); }
  updateEntryPointTime(entry, startSec) { return this.daily.updateEntryPointTime(entry, startSec); }
  moveEntryToDate(entry, targetDate, startSec, endSec) {
    return this.daily.moveEntryToDate(entry, targetDate, startSec, endSec);
  }
  addEntry(dateStr, timeStr, content, isTask, tags = [], endTimeStr = "", rawLines = null) {
    return this.daily.addEntry(dateStr, timeStr, content, isTask, tags, endTimeStr, rawLines);
  }

  // Scan entries for a date range [startMoment, endMoment]
  // 返回 Map<dateStr, NoteEntry[]>，**每一天都建桶**（哪怕是空数组）——
  // Blinko / 远程合并时只在桶存在时 push，空桶是「这一天可见」的标记。
  async getEntriesForRange(startMoment, endMoment) {
    const results = new Map(); // dateStr -> NoteEntry[]
    const days = [];
    const curr = startMoment.clone();
    while (curr.isSameOrBefore(endMoment, 'day')) {
      days.push(curr.format('YYYY-MM-DD'));
      curr.add(1, 'day');
    }
    for (const d of days) results.set(d, []);

    // 本地日记：走 NoteSource 契约（DEC-026），这里不再直接读 vault
    if (days.length) {
      const localEntries = await this.daily.listEntries(days[0], days[days.length - 1]);
      for (const entry of localEntries) {
        const bucket = results.get(entry.dateStr);
        if (bucket) bucket.push(entry);
      }
    }

    // 本地 Blinko 导出 md（DEC-027）：同样走 NoteSource 契约，
    // 不再直接摸 vault.getMarkdownFiles()。
    // 注意 includeBlinko 是「读 vault 里的导出文件」，与 blinkoApiEnabled
    // 的 HTTP 聚合是两套开关，别混。
    if (this.settings.includeBlinko && days.length) {
      const blinkoEntries = await this.blinkoLocal.listEntries(days[0], days[days.length - 1]);
      this.mergeIntoBuckets(results, blinkoEntries);
    }

    // 远程来源聚合（DEC-023）：memos / Blinko API。
    // 单个来源失败只记错误、不清空日历 —— 这是聚合模式的硬要求。
    await this.collectRemoteEntries(results, startMoment, endMoment);

    return results;
  }

  /**
   * 按当前设置装配远程来源。
   *
   * 每次调用都新建实例：设置改了立即生效，不必重启插件或重建服务。
   * 只在「启用 + 地址 + 令牌」三项齐全时才挂载，避免设置页填一半就开始
   * 发无效请求（那会在控制台刷一堆 401）。
   */
  buildRemoteSources() {
    const s = this.settings || {};
    const sources = [];

    if (s.memosEnabled && s.memosBaseUrl && s.memosToken) {
      sources.push(new MemosSource({ baseUrl: s.memosBaseUrl, token: s.memosToken }));
    }
    if (s.blinkoApiEnabled && s.blinkoBaseUrl && s.blinkoApiKey) {
      sources.push(new BlinkoSource({ baseUrl: s.blinkoBaseUrl, apiKey: s.blinkoApiKey }));
    }
    return sources;
  }

  /**
   * 拉取远程来源并合并进 results（dateStr → 条目数组）。
   *
   * 区间外的条目直接丢弃：memos / Blinko 的接口是按时间过滤的，但服务端
   * 支持的过滤精度不一（有的按天、有的按秒），本地再挡一道才不会越界。
   */
  async collectRemoteEntries(results, startMoment, endMoment) {
    const sources = this.buildRemoteSources();
    if (!sources.length) return;

    const startDate = startMoment.format("YYYY-MM-DD");
    const endDate = endMoment.format("YYYY-MM-DD");

    // 渲染很频繁（切视图、改设置、时钟/文件变更都会触发），每次重拉远程接口
    // 既慢又费流量 —— 这台机器可能是走手机热点的。用 60 秒的区间缓存兜住，
    // 用户感觉不到延迟，也不会把配额浪费在重复请求上。
    const cacheKey = `${startDate}..${endDate}`;
    const cached = this.remoteCache.get(cacheKey);
    if (cached && Date.now() - cached.at < REMOTE_CACHE_TTL) {
      this.mergeIntoBuckets(results, cached.entries);
      return;
    }

    const agg = new AggregateSource(sources);
    const { entries, errors } = await agg.listEntries(startDate, endDate);

    // 失败信息不弹 Notice 打扰用户（打开日历就弹太吵），只落到实例上供设置页查询
    this.lastRemoteErrors = errors;
    this.cacheRemoteEntries(cacheKey, entries);
    this.mergeIntoBuckets(results, entries);
  }

  /**
   * 把条目按 dateStr 装进可见日期桶。
   * 区间外的条目没有桶，直接丢弃 —— 服务端过滤精度不一，本地再挡一道。
   */
  mergeIntoBuckets(results, entries) {
    for (const entry of entries) {
      const bucket = results.get(entry.dateStr);
      if (bucket) bucket.push(entry);
    }
  }

  /** 写缓存并做容量上限：只留最近若干个区间，别让 Map 无限长 */
  cacheRemoteEntries(key, entries) {
    this.remoteCache.set(key, { at: Date.now(), entries });
    while (this.remoteCache.size > REMOTE_CACHE_MAX) {
      const oldest = this.remoteCache.keys().next().value;
      this.remoteCache.delete(oldest);
    }
  }

  /** 设置变更 / 手动刷新时调用：下次渲染一定重新拉取 */
  clearRemoteCache() {
    this.remoteCache.clear();
  }
}

// ============================================================================
// SubItems Detail Modal
// ============================================================================

class SubItemsModal extends Modal {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, entry) {
    super(app);
    this.entry = entry;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: `📋 ${this.entry.text}` });
    contentEl.createEl("div", {
      text: `来源：${this.entry.dateStr} [${this.entry.timeStr || "全天"}]`,
      cls: "text-muted",
      style: "font-size: 0.82rem; margin-bottom: 12px;"
    });

    const list = contentEl.createEl("ul", { cls: "timenote-subitems-list" });
    this.entry.subItems.forEach(item => {
      list.createEl("li", { text: item });
    });

    const btnRow = contentEl.createEl("div", { style: "display: flex; justify-content: flex-end; margin-top: 16px; gap: 8px;" });
    const jumpBtn = btnRow.createEl("button", { text: "打开原笔记定位", cls: "mod-cta" });
    // 远程聚合来源没有本地笔记可定位：藏掉按钮，别让用户点了没反应（DEC-023）
    jumpBtn.style.display = this.entry.readonly ? "none" : "";
    jumpBtn.onclick = async () => {
      this.close();
      const file = this.app.vault.getAbstractFileByPath(this.entry.filePath);
      if (file instanceof TFile) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file, { eState: { line: Math.max(0, this.entry.lineNum - 1) } });
      }
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ============================================================================
// Calendar View Component
// ============================================================================

// ============================================================================
// Calendar View Component — Obsidian 宿主薄壳（DEC-025）
// ============================================================================
// 全部渲染逻辑在 ui/view.ts 的 TimenoteRenderer 里，由三个宿主共用。
// 这里只做两件事：把 ItemView 生命周期转发过去，以及装配 HostAdapter。
class TimenoteView extends ItemView {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    // 渲染引擎延迟到 onOpen 再装配：ItemView.contentEl 在构造期不保证已挂好
    // （Obsidian 内部是 containerEl.children[1]），而 mountTimeNote 会把 root
    // 引用固定下来。重构前也是 onOpen 才动 DOM，这里保持同一时机。
    this.renderer = null;
  }

  getViewType() { return VIEW_TYPE_TIMENOTE; }
  getDisplayText() { return "时间笔记日历 (TimeNote)"; }
  getIcon() { return "calendar-clock"; }

  async onOpen() {
    if (!this.renderer) {
      this.renderer = mountTimeNote(
        this.contentEl,
        createObsidianHostAdapter({
          app: this.app,
          plugin: this.plugin,
          service: this.plugin.dailyNoteService,
          QuickAddModal,
          SubItemsModal
        })
      );
    }
    await this.renderer.onOpen();
  }

  async onClose() {
    if (this.renderer) await this.renderer.onClose();
  }

  /** 供设置页 / QuickAdd 保存回调触发重渲染 */
  renderView() { return this.renderer ? this.renderer.renderView() : undefined; }
}


// ============================================================================
// Quick Add Modal
// ============================================================================

class QuickAddModal extends Modal {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, plugin, defaultDate, onSaved, prefillTime = "", prefillEndTime = undefined, prefillType = "") {
    super(app);
    this.plugin = plugin;
    this.targetDate = defaultDate;
    // 记录类型（DEC-022）：显式传入优先，否则跟随设置里的默认类型。
    // prefillEndTime 用 undefined 区分「没传（按类型补默认时长）」与「传了空串（时间点，无结束时间）」。
    this.addType = normalizeAddType(prefillType || plugin.settings.defaultAddType);
    this.timeStr = prefillTime || moment().format("HH:mm:ss");
    this.endTimeStr = prefillEndTime !== undefined
      ? prefillEndTime
      : (this.addType === "point" ? "" : addMinutesToTime(this.timeStr, plugin.settings.defaultDuration || 60));
    this.isTask = false;
    this.content = "";
    this.tagsStr = "";
    this.onSaved = onSaved;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "⚡ 快速记录至时间笔记 (Daily Note)" });

    const form = contentEl.createEl("div", { cls: "timenote-modal-form" });

    // 记录类型（DEC-022）：把「只能新增时间块」补成显式二选一。
    // 时间块写 HH:mm-HH:mm；时间点只写一个 HH:mm，渲染成时刻线、不生成块。
    const typeRow = form.createEl("div", { cls: "timenote-modal-row" });
    typeRow.createEl("span", { text: "记录类型", cls: "timenote-modal-label" });
    const typeSelect = typeRow.createEl("select", { cls: "timenote-modal-input" }) as HTMLSelectElement;
    const blockOption = typeSelect.createEl("option", { text: "时间块（起止时间）" }) as HTMLOptionElement;
    const pointOption = typeSelect.createEl("option", { text: "时间点（只记时刻）" }) as HTMLOptionElement;
    blockOption.value = "block";
    pointOption.value = "point";
    typeSelect.value = this.addType;

    // Date & Time Row
    const row1 = form.createEl("div", { cls: "timenote-modal-row" });
    const dateInput = row1.createEl("input", {
      cls: "timenote-modal-input",
      attr: { type: "date", value: this.targetDate }
    });
    dateInput.onchange = (e) => this.targetDate = (e.target as HTMLInputElement).value;

    const timeInput = row1.createEl("input", {
      cls: "timenote-modal-input",
      attr: { type: "text", placeholder: "时间 (如 14:30 或 14:00:31，留空为全天)", value: this.timeStr }
    });
    const endTimeInput = row1.createEl("input", {
      cls: "timenote-modal-input",
      attr: { type: "text", placeholder: "结束时间（时间点模式不需要）", value: this.endTimeStr }
    }) as HTMLInputElement;
    const durationHint = row1.createEl("span", { cls: "timenote-duration-hint", text: "" });
    const updateDurationHint = () => {
      if (this.addType === "point") {
        durationHint.textContent = "时间点（只记时刻，不成块）";
        return;
      }
      const sSec = parseTimeToSeconds(this.timeStr);
      const eSec = parseTimeToSeconds(this.endTimeStr);
      durationHint.textContent = (sSec !== null && eSec !== null && eSec > sSec)
        ? `时长 ${formatDuration(eSec - sSec)}`
        : (this.endTimeStr ? "结束需晚于开始" : `默认时长 ${this.plugin.settings.defaultDuration || 60} 分钟`);
    };
    timeInput.oninput = (e) => {
      this.timeStr = (e.target as HTMLInputElement).value.trim();
      updateDurationHint();
    };
    endTimeInput.oninput = (e) => {
      this.endTimeStr = (e.target as HTMLInputElement).value.trim();
      updateDurationHint();
    };
    // 切类型时同步结束时间输入框：点模式清空并禁用，切回块模式补默认时长
    const syncType = () => {
      const isPoint = this.addType === "point";
      endTimeInput.disabled = isPoint;
      endTimeInput.style.opacity = isPoint ? "0.45" : "";
      if (isPoint) {
        this.endTimeStr = "";
        endTimeInput.value = "";
      } else if (!this.endTimeStr) {
        this.endTimeStr = addMinutesToTime(this.timeStr, this.plugin.settings.defaultDuration || 60);
        endTimeInput.value = this.endTimeStr;
      }
      updateDurationHint();
    };
    typeSelect.onchange = (e) => {
      this.addType = normalizeAddType((e.target as HTMLSelectElement).value);
      syncType();
    };
    syncType();

    // Is Task Row
    const row2 = form.createEl("div", { cls: "timenote-modal-row" });
    const taskCheckbox = row2.createEl("input", { attr: { type: "checkbox", id: "tn-is-task" } });
    taskCheckbox.onchange = (e) => this.isTask = (e.target as HTMLInputElement).checked;
    row2.createEl("label", { text: "作为任务待办 (- [ ])", attr: { for: "tn-is-task" } });

    // Content Textarea
    const textarea = form.createEl("textarea", {
      cls: "timenote-modal-textarea",
      attr: { placeholder: "输入灵感闪念、随手记或任务内容... (按 Ctrl+Enter 快捷保存)" }
    });
    textarea.focus();
    textarea.oninput = (e) => this.content = (e.target as HTMLInputElement).value;
    textarea.onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        saveBtn.click();
      }
    };

    // Tags Row
    const tagsInput = form.createEl("input", {
      cls: "timenote-modal-input",
      attr: { placeholder: "标签 (逗号分隔，如 工作, AI)" }
    });
    tagsInput.oninput = (e) => this.tagsStr = (e.target as HTMLInputElement).value;

    // Submit Buttons
    const btnRow = form.createEl("div", { cls: "timenote-modal-row", style: "justify-content: flex-end; margin-top: 8px;" });
    const cancelBtn = btnRow.createEl("button", { text: "取消" });
    cancelBtn.onclick = () => this.close();

    const saveBtn = btnRow.createEl("button", { text: "保存并插入日记", cls: "mod-cta" });
    saveBtn.onclick = async () => {
      if (!this.content.trim()) {
        new Notice("请输入内容！");
        return;
      }
      const startStr = this.timeStr.trim();
      const hasExplicitRange = /[-~至到]/.test(startStr);
      // 时间点模式是权威开关：不带结束时间、也不接受写在开始时间里的范围
      if (this.addType === "point" && hasExplicitRange) {
        new Notice("时间点只记一个时刻：请去掉开始时间里的范围，或切换成时间块");
        return;
      }
      let endStr = this.addType === "point" ? "" : this.endTimeStr.trim();
      if (this.addType === "block" && !endStr && !hasExplicitRange && startStr) {
        endStr = addMinutesToTime(startStr, this.plugin.settings.defaultDuration || 60);
      }
      if (startStr && !hasExplicitRange && parseTimeToSeconds(startStr) === null) {
        new Notice("时间格式不正确，请使用 HH:mm！");
        return;
      }
      if (!hasExplicitRange && endStr) {
        const sSec = parseTimeToSeconds(startStr);
        const eSec = parseTimeToSeconds(endStr);
        if (sSec === null || eSec === null) {
          new Notice("时间格式不正确，请使用 HH:mm！");
          return;
        }
        if (eSec <= sSec) {
          new Notice("结束时间必须晚于开始时间（暂不支持跨日）！");
          return;
        }
      }
      const tags = this.tagsStr.split(/[,，\s]+/).filter(t => t.trim().length > 0);
      await this.plugin.dailyNoteService.addEntry(
        this.targetDate,
        startStr,
        this.content.trim(),
        this.isTask,
        tags,
        hasExplicitRange ? "" : endStr
      );
      new Notice(`✅ 已记录${this.addType === "point" ? "时间点" : "时间块"}到 ${this.targetDate} 日记中！`);
      this.close();
      if (this.onSaved) this.onSaved();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ============================================================================
// Settings Tab
// ============================================================================

class TimenoteSettingTab extends PluginSettingTab {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "TimeNote 设置" });

    new Setting(containerEl)
      .setName("周期笔记存放文件夹")
      .setDesc("日记（Daily Notes）所在的根目录。插件会读取其中格式为 YYYY-MM-DD 的笔记文件。")
      .addText(text => text
        .setPlaceholder("SpiralNotes")
        .setValue(this.plugin.settings.periodicNotesFolder)
        .onChange(async (val) => {
          this.plugin.settings.periodicNotesFolder = val.trim() || "SpiralNotes";
          this.plugin.dailyNoteService.dailyNoteIndex.clear();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("同时在日历中聚合 Blinko 闪念")
      .setDesc("开启后，自动读取 Blinko/Notes 目录下的微笔记，按其创建时间一同在日历上呈现。")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeBlinko)
        .onChange(async (val) => {
          this.plugin.settings.includeBlinko = val;
          await this.plugin.saveSettings();
        }));

    // ---------- 聚合远程来源（DEC-023） ----------
    // 与上面那条的区别：上面读的是 vault 里的 Blinko **导出 md 文件**（本地、可写），
    // 这里走的是 memos / Blinko 的 HTTP API（远程、只读）。两条通道可以同时开。
    containerEl.createEl("h3", { text: "聚合远程来源" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "从 memos / Blinko 的 HTTP API 拉取记录，一并画在日历上。聚合进来的记录是只读的：不能拖拽改时间、不能跨天移动、不能勾选任务（与本地日记区分开）。"
    });

    new Setting(containerEl)
      .setName("启用 Memos")
      .setDesc("从 memos 实例拉取记录。需要实例地址与访问令牌（memos → 设置 → 访问令牌）。")
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.memosEnabled)
        .onChange(async (val) => {
          this.plugin.settings.memosEnabled = val;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Memos 地址")
      .setDesc("形如 https://memos.example.com，末尾不要带 /api/v1。")
      .addText(text => text
        .setPlaceholder("https://memos.example.com")
        .setValue(this.plugin.settings.memosBaseUrl || "")
        .onChange(async (val) => {
          this.plugin.settings.memosBaseUrl = val.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Memos 访问令牌")
      .setDesc("以 Bearer 方式发送。令牌存在插件目录的 data.json 里，注意该文件是明文的。")
      .addText(text => {
        text.inputEl.type = "password";
        text.setPlaceholder("memos 访问令牌")
          .setValue(this.plugin.settings.memosToken || "")
          .onChange(async (val) => {
            this.plugin.settings.memosToken = val.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => btn
        .setButtonText("测试连接")
        .onClick(async () => {
          btn.setButtonText("测试中…").setDisabled(true);
          const s = this.plugin.settings;
          try {
            const src = new MemosSource({ baseUrl: s.memosBaseUrl, token: s.memosToken });
            if (!src.configured) throw new Error("地址或令牌为空");
            const today = moment().format("YYYY-MM-DD");
            const list = await src.listEntries(today, today);
            new Notice(`Memos 连接成功：今天有 ${list.length} 条 memo`);
          } catch (err) {
            new Notice(`Memos 连接失败：${err instanceof Error ? err.message : String(err)}`);
          } finally {
            btn.setButtonText("测试连接").setDisabled(false);
          }
        }));

    new Setting(containerEl)
      .setName("启用 Blinko API")
      .setDesc("从 Blinko 实例实时拉取笔记。与上面的「聚合 Blinko 闪念（本地导出文件）」互不影响，可以只开一个。")
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.blinkoApiEnabled)
        .onChange(async (val) => {
          this.plugin.settings.blinkoApiEnabled = val;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Blinko 地址")
      .setDesc("形如 https://blinko.example.com。")
      .addText(text => text
        .setPlaceholder("https://blinko.example.com")
        .setValue(this.plugin.settings.blinkoBaseUrl || "")
        .onChange(async (val) => {
          this.plugin.settings.blinkoBaseUrl = val.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Blinko API Key")
      .setDesc("以 Bearer 方式发送。在 Blinko 的「设置 → 访问令牌」里生成。")
      .addText(text => {
        text.inputEl.type = "password";
        text.setPlaceholder("Blinko API Key")
          .setValue(this.plugin.settings.blinkoApiKey || "")
          .onChange(async (val) => {
            this.plugin.settings.blinkoApiKey = val.trim();
            await this.plugin.saveSettings();
          });
      })
      .addButton(btn => btn
        .setButtonText("测试连接")
        .onClick(async () => {
          btn.setButtonText("测试中…").setDisabled(true);
          const s = this.plugin.settings;
          try {
            const src = new BlinkoSource({ baseUrl: s.blinkoBaseUrl, apiKey: s.blinkoApiKey });
            if (!src.configured) throw new Error("地址或 API Key 为空");
            const today = moment().format("YYYY-MM-DD");
            const list = await src.listEntries(today, today);
            new Notice(`Blinko 连接成功：今天有 ${list.length} 条笔记`);
          } catch (err) {
            new Notice(`Blinko 连接失败：${err instanceof Error ? err.message : String(err)}`);
          } finally {
            btn.setButtonText("测试连接").setDisabled(false);
          }
        }));

    new Setting(containerEl)
      .setName("默认视图模式")
      .setDesc("打开日历时默认展示的视图。")
      .addDropdown(drop => drop
        .addOption("day", "日视图 (Day)")
        .addOption("3day", "3天视图 (3-Day)")
        .addOption("week", "周视图 (Week)")
        .addOption("month", "月视图 (Month)")
        .addOption("quarter", "季度视图 (Quarter)")
        .addOption("year", "年度视图 (Year)")
        .addOption("timeline", "时间线视图 (Timeline)")
        .setValue(this.plugin.settings.defaultView)
        .onChange(async (val) => {
          this.plugin.settings.defaultView = val;
          await this.plugin.saveSettings();
        }));

    // 时间轴起止时间：块布局与紧凑流共用，收窄范围可减少滚动
    const hourChoices = (from, to) =>
      Array.from({ length: to - from + 1 }, (_, i) => {
        const h = from + i;
        return { value: String(h), label: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00` };
      });

    new Setting(containerEl)
      .setName("时间轴起始时间")
      .setDesc("日 / 3天 / 周视图时间网格的起始小时。默认 00:00（全天），可按作息收窄，例如 06:00。")
      .addDropdown(drop => {
        hourChoices(0, 23).forEach(o => drop.addOption(o.value, o.label));
        drop.setValue(String(this.plugin.settings.startHour ?? 0));
        drop.onChange(async (val) => {
          const h = parseInt(val, 10);
          this.plugin.settings.startHour = h;
          if ((this.plugin.settings.endHour ?? 24) <= h) {
            this.plugin.settings.endHour = Math.min(24, h + 1);
            new Notice(`结束时间已自动调整为 ${String(this.plugin.settings.endHour).padStart(2, "0")}:00`);
          }
          await this.plugin.saveSettings();
          this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
            .forEach(leaf => (leaf.view as TimenoteView).renderView());
        });
      });

    new Setting(containerEl)
      .setName("时间轴结束时间")
      .setDesc("时间网格的结束小时，默认 24:00（全天）。必须晚于起始时间。")
      .addDropdown(drop => {
        hourChoices(1, 24).forEach(o => drop.addOption(o.value, o.label));
        drop.setValue(String(this.plugin.settings.endHour ?? 24));
        drop.onChange(async (val) => {
          const h = parseInt(val, 10);
          if (h <= (this.plugin.settings.startHour ?? 0)) {
            new Notice("结束时间必须晚于起始时间！");
            return;
          }
          this.plugin.settings.endHour = h;
          await this.plugin.saveSettings();
          this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
            .forEach(leaf => (leaf.view as TimenoteView).renderView());
        });
      });

    new Setting(containerEl)
      .setName("每小时槽高")
      .setDesc("时间网格中每小时占用的高度（像素）。调大时间块更宽松，调小可一屏看到更多小时；默认 52。")
      .addSlider(slider => slider
        .setLimits(28, 96, 4)
        .setValue(Number(this.plugin.settings.slotHeight ?? 52))
        .setDynamicTooltip()
        .onChange(async (val) => {
          this.plugin.settings.slotHeight = val;
          await this.plugin.saveSettings();
          // 拖动滑块会连续触发，防抖后统一重渲染
          if (this.slotRerenderTimer) window.clearTimeout(this.slotRerenderTimer);
          this.slotRerenderTimer = window.setTimeout(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
              .forEach(leaf => (leaf.view as TimenoteView).renderView());
          }, 150);
        }));

    new Setting(containerEl)
      .setName("自适应时间轴（内容定高）")
      .setDesc("行高跟着笔记内容走：没有记录的小时自动压扁，有记录的小时按内容多少撑开；时间块的高度恒等于它的时间跨度，所以内容多的时段块更高。整条轴随内容伸缩。关闭则回到每小时等距的传统样式。")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.elasticTimeline !== false)
        .onChange(async (val) => {
          this.plugin.settings.elasticTimeline = val;
          await this.plugin.saveSettings();
          this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
            .forEach(leaf => (leaf.view as TimenoteView).renderView());
        }));

    new Setting(containerEl)
      .setName("全天区高度")
      .setDesc("ALL DAY 行的高度（像素）。也可在视图里直接拖动该行与网格之间的分隔条调节；默认 36，与普通整点行一致。")
      .addSlider(slider => slider
        .setLimits(32, 320, 4)
        .setValue(Number(this.plugin.settings.allDayHeight ?? 36))
        .setDynamicTooltip()
        .onChange(async (val) => {
          this.plugin.settings.allDayHeight = val;
          await this.plugin.saveSettings();
          if (this.allDayRerenderTimer) window.clearTimeout(this.allDayRerenderTimer);
          this.allDayRerenderTimer = window.setTimeout(() => {
            this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
              .forEach(leaf => (leaf.view as TimenoteView).renderView());
          }, 150);
        }));

    new Setting(containerEl)
      .setName("时间网格布局")
      .setDesc("块布局按起止时间绘制有高度的记录块；紧凑流折叠空闲时段、按行展示。可在工具栏随时切换。")
      .addDropdown(drop => drop
        .addOption("block", "块布局（默认）")
        .addOption("compact", "紧凑流")
        .setValue(this.plugin.settings.layoutMode || "block")
        .onChange(async (val) => {
          this.plugin.settings.layoutMode = val;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("新建记录默认类型")
      .setDesc("空白槽点击 / 拖拽、工具栏「+ 记一条」与快速记录弹窗默认创建哪种记录。时间块写起止时间；时间点只记一个时刻、在日历上画成时刻线。工具栏的「新增：时间块 / 时间点」按钮可随时切换；块布局里按住 Alt 点空白槽可临时记时间点。")
      .addDropdown(drop => drop
        .addOption("block", "时间块（起止时间）")
        .addOption("point", "时间点（只记时刻）")
        .setValue(normalizeAddType(this.plugin.settings.defaultAddType))
        .onChange(async (val) => {
          this.plugin.settings.defaultAddType = normalizeAddType(val);
          await this.plugin.saveSettings();
          // 让工具栏「新增：…」按钮的文字跟着同步
          this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE)
            .forEach(leaf => (leaf.view as TimenoteView).renderView());
        }));

    new Setting(containerEl)
      .setName("新建时间块默认时长")
      .setDesc("从日历空白槽点击、或打开快速记录时，默认预填的结束时间（时间点模式不预填）。")
      .addDropdown(drop => drop
        .addOption("30", "30 分钟")
        .addOption("60", "1 小时")
        .addOption("90", "1.5 小时")
        .addOption("120", "2 小时")
        .setValue(String(this.plugin.settings.defaultDuration || 60))
        .onChange(async (val) => {
          this.plugin.settings.defaultDuration = parseInt(val, 10);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("一周第一天")
      .setDesc("设置周视图中每周以周一还是周日开始。")
      .addDropdown(drop => drop
        .addOption("1", "周一")
        .addOption("0", "周日")
        .setValue(String(this.plugin.settings.firstDayOfWeek))
        .onChange(async (val) => {
          this.plugin.settings.firstDayOfWeek = parseInt(val, 10);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("快速记录默认插入标题")
      .setDesc("写带 # 的标题即可同时指定层级与标题，如「## 灵感闪念」或「### 随手记」；不写 # 时按二级标题处理。已有日记里存在同名标题（任意层级）时沿用那一节，不会重复建标题。")
      .addText(text => text
        .setPlaceholder("## 灵感闪念")
        .setValue(this.plugin.settings.quickAddSection)
        .onChange(async (val) => {
          this.plugin.settings.quickAddSection = val.trim() || DEFAULT_SETTINGS.quickAddSection;
          await this.plugin.saveSettings();
        }));
  }
}

// ============================================================================
// Main Plugin Class
// ============================================================================

export default class TimenotePlugin extends Plugin {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  async onload() {
    // ---- 宿主装配（DEC-024 / DEC-025）----
    // 三宿主共用的装配入口，必须在任何视图创建之前执行。
    // installDomHelpers() 幂等且默认不覆盖已有实现：Obsidian 自己就提供了
    // .createEl() 等扩展，所以在这里它是 no-op，Obsidian 侧行为逐字不变；
    // Blinko / 思源宿主没有这些扩展，会自动补上标准 DOM 实现。
    // 日期实现也由宿主注入：Obsidian 用它自己的 window.moment，另外两个宿主
    // 不传 momentFactory、由 bootstrap 回落到零依赖的 nativeMoment。
    prepareHostEnvironment({ momentFactory: window.moment });

    await this.loadSettings();

    this.dailyNoteService = new DailyNoteService(this.app, this.settings);

    // Register View
    this.registerView(
      VIEW_TYPE_TIMENOTE,
      (leaf) => new TimenoteView(leaf, this)
    );

    // Left Ribbon Icon
    this.addRibbonIcon("calendar-clock", "打开时间笔记日历", () => {
      this.activateView();
    });

    // Commands
    this.addCommand({
      id: "open-timenote-calendar",
      name: "打开时间笔记日历视图 (TimeNote Calendar)",
      callback: () => {
        this.activateView();
      }
    });

    this.addCommand({
      id: "quick-add-time-note",
      name: "快速记一条带时间笔记 (Quick Add)",
      callback: () => {
        new QuickAddModal(this.app, this, moment().format("YYYY-MM-DD"), () => {
          const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE);
          leaves.forEach(leaf => (leaf.view as TimenoteView).renderView());
        }).open();
      }
    });

    // Settings Tab
    this.addSettingTab(new TimenoteSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TIMENOTE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // 远程来源的地址 / 令牌可能刚被改过，缓存必须作废，否则要等 TTL 才生效
    if (this.dailyNoteService) this.dailyNoteService.clearRemoteCache();
    // Refresh view
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE);
    leaves.forEach(leaf => (leaf.view as TimenoteView).renderView());
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMENOTE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true); // Open in active or new split tab
      await leaf.setViewState({ type: VIEW_TYPE_TIMENOTE, active: true });
    }

    workspace.revealLeaf(leaf);
  }
};
