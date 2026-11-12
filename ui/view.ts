// ui/view.ts — 三宿主共用的时间笔记渲染引擎（DEC-025）
//
// 由 main.ts 的 `TimenoteView` 逐字搬迁而来，只把 63 处宿主 API 调用
// 换成 `this.host.*`（HostAdapter）。这里**不许**出现 `import obsidian`、
// `window.moment`、`app.vault` 之类的宿主依赖 —— 三端共用同一份渲染逻辑。
//
// Obsidian 侧只剩一个 `extends ItemView` 的薄壳负责生命周期转发；
// Blinko / 思源宿主实现同一个 HostAdapter 即可复用全部视图。
import {
  buildTimeScale, estimateBlockNeed, layoutTimeBlockClusters, layoutPointLines, isPointEntry,
  formatSecondsToTime, parseTimeToSeconds, addMinutesToTime, snapSeconds, blockEdgeHit,
  formatDuration, getTagColor, assignDayTints, resolveTint, tintCssOf, tintEntryKey,
  hashTintKey, BLOCK_TINTS, normalizeAddType, parseQuickAddSection, sectionHeaderRegex,
  ELASTIC_EMPTY_RATIO, ELASTIC_CONTENT_RATIO, ELASTIC_MIN_EMPTY_ROW, ELASTIC_MIN_CONTENT_ROW,
  ELASTIC_ROW_PAD, ELASTIC_MAX_BLOCK, ELASTIC_MAX_VIEWPORT_SCALE, MIN_RENDER_BLOCK_PX,
  POINT_ROW_H, POINT_LABEL_GAP, POINT_CLUSTER_WINDOW_SEC, POINT_SNAP_MINUTES,
  BLOCK_TOP_GUTTER, BLOCK_BOTTOM_GUTTER, BLOCK_RULER_W, DRAG_SNAP_MINUTES,
  MIN_BLOCK_SECONDS, POINT_CREATE_SNAP_MINUTES
} from "../core/index";
import { moment } from "./date";
import { isExternalSource, sourceBadge, sourceCssClass, sourceLabel } from "../sources/meta";
import type { HostAdapter } from "../hosts/types";

export class TimenoteRenderer {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(root: HTMLElement, host: HostAdapter) {
    this.root = root;
    this.host = host;
    this.currentDate = moment();
    this.currentViewMode = host.settings.defaultView || "week";
    this.currentFilterType = "all"; // 'all', 'task', 'memo', 'external'
    this.searchQuery = "";
    this.entriesMap = new Map();
    this.currentTooltip = null;
    // onExternalChange 返回的解绑函数。必须持有并在 onClose 里调用：
    // 重构前用 ItemView.registerEvent()，视图销毁时 Obsidian 自动解绑；
    // 改成宿主订阅后若不显式解绑，关掉视图后 vault 每次 modify 仍会
    // 调这个已关闭实例的 renderView()，且反复开关会不断累加监听。
    this._unsubExternalChange = null;
  }


  async onOpen() {
    // 幂等：同一实例重复 onOpen（如 leaf 复用时）不重复订阅
    if (!this._unsubExternalChange) {
      // 由宿主订阅「外部数据变了」（Obsidian 是 vault.on("modify")）
      this._unsubExternalChange = this.host.onExternalChange(() => {
        this.renderView();
      });
    }
    await this.renderView();
  }

  async onClose() {
    if (this._unsubExternalChange) {
      this._unsubExternalChange();
      this._unsubExternalChange = null;
    }
    this.hideHoverTooltip();
    this.stopNowClock();
  }

  showHoverTooltip(entry, targetEl, event) {
    this.hideHoverTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "timenote-hover-card";
    this.currentTooltip = tooltip;

    // Header: Time & Source
    const header = tooltip.createEl("div", { cls: "timenote-hover-header" });
    header.createEl("span", {
      text: entry.hasTime ? `🕒 ${entry.timeStr}` : "📅 全天",
      cls: "timenote-hover-time"
    });
    if (entry.isTask) {
      header.createEl("span", {
        text: entry.isCompleted ? "✅ 已完成" : "⏳ 待办事项",
        cls: `timenote-hover-badge ${entry.isCompleted ? "is-completed" : "is-task"}`
      });
    } else {
      header.createEl("span", {
        text: sourceBadge(entry.source),
        cls: "timenote-hover-badge"
      });
    }

    // Body: Full Text
    tooltip.createEl("div", {
      text: entry.text,
      cls: "timenote-hover-body"
    });

    // Tags
    if (entry.tags && entry.tags.length > 0) {
      const tagsRow = tooltip.createEl("div", { cls: "timenote-hover-tags" });
      entry.tags.forEach(t => {
        const colors = getTagColor(t);
        tagsRow.createEl("span", {
          text: `#${t}`,
          cls: "timenote-tag-chip",
          style: `background-color: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border};`
        });
      });
    }

    // Sub-items
    if (entry.subItems && entry.subItems.length > 0) {
      const subWrap = tooltip.createEl("div", { cls: "timenote-hover-subitems" });
      subWrap.createEl("div", {
        text: `📋 子项列表 (${entry.subItems.length}项):`,
        cls: "timenote-hover-sub-title"
      });
      const ul = subWrap.createEl("ul");
      entry.subItems.slice(0, 10).forEach(s => {
        ul.createEl("li", { text: s });
      });
      if (entry.subItems.length > 10) {
        ul.createEl("li", { text: `...及更多 ${entry.subItems.length - 10} 项`, style: "color: var(--text-muted);" });
      }
    }

    // Footer：本地记录显示「文件 #行号 + 点击定位」，远程聚合来源显示来源与只读提示。
    // 之前这里无条件写「📄 文件名 #L1 / 点击定位日记」，接 memos 后会显示成
    // 「📄 users/1 #L1」，点下去又没反应（DEC-023）。
    const footer = tooltip.createEl("div", { cls: "timenote-hover-footer" });
    if (entry.readonly) {
      footer.createEl("span", { text: sourceBadge(entry.source) });
      footer.createEl("span", { text: "🔒 远程来源 · 只读", style: "color: var(--text-muted);" });
    } else {
      const fileName = entry.filePath ? entry.filePath.split(/[\\/]/).pop() : "";
      footer.createEl("span", { text: `📄 ${fileName} #L${entry.lineNum}` });
      footer.createEl("span", { text: "💡 点击定位日记", style: "color: var(--color-accent);" });
    }

    document.body.appendChild(tooltip);

    // Position tooltip safely near target
    const rect = targetEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left;
    if (left + tooltipRect.width > window.innerWidth - 12) {
      left = window.innerWidth - tooltipRect.width - 12;
    }
    if (left < 10) left = 10;

    let top = rect.bottom + 6;
    if (top + tooltipRect.height > window.innerHeight - 12) {
      top = rect.top - tooltipRect.height - 6;
    }

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  hideHoverTooltip() {
    if (this.currentTooltip && this.currentTooltip.parentNode) {
      this.currentTooltip.parentNode.removeChild(this.currentTooltip);
      this.currentTooltip = null;
    }
  }

  async refreshData() {
    let startMoment, endMoment;

    if (this.currentViewMode === "day" || this.currentViewMode === "timeline") {
      startMoment = this.currentDate.clone().startOf("day");
      endMoment = this.currentDate.clone().endOf("day");
    } else if (this.currentViewMode === "3day") {
      startMoment = this.currentDate.clone().startOf("day");
      endMoment = this.currentDate.clone().add(2, "days").endOf("day");
    } else if (this.currentViewMode === "week") {
      // 7-day rolling window matching currentDate for seamless day-by-day navigation
      startMoment = this.currentDate.clone().startOf("day");
      endMoment = this.currentDate.clone().add(6, "days").endOf("day");
    } else if (this.currentViewMode === "month") {
      startMoment = this.currentDate.clone().startOf("month").startOf("week");
      endMoment = this.currentDate.clone().endOf("month").endOf("week");
    } else if (this.currentViewMode === "quarter") {
      startMoment = this.currentDate.clone().startOf("quarter").startOf("day");
      endMoment = this.currentDate.clone().endOf("quarter").endOf("day");
    } else if (this.currentViewMode === "year") {
      startMoment = this.currentDate.clone().startOf("year").startOf("day");
      endMoment = this.currentDate.clone().endOf("year").endOf("day");
    } else {
      startMoment = this.currentDate.clone().startOf("day");
      endMoment = this.currentDate.clone().add(6, "days").endOf("day");
    }

    // 把结果返回给调用方，不要在这里写 this.entriesMap：
    // 并发的 renderView 会各自 await refreshData()，旧调用若晚于新调用完成，
    // 就会用「写文件前」的旧数据覆盖共享状态，导致跨天拖动 / 新建后视图弹回旧内容。
    // 由 renderView 在 generation 检查通过后再落地（见下）。
    return await this.host.getEntriesForRange(startMoment, endMoment);
  }

  async renderView() {
    this.hideHoverTooltip();

    // 一次写日记会同时触发两条渲染路径：vault.on("modify") 和 QuickAdd 的 onSaved()。
    // 本方法是 async：两者都先 empty() 再 await refreshData()，等各自恢复后就会
    // 往同一个容器 append 一整套 DOM —— 页面下方出现第二个日历视图（刷新才恢复）。
    // 用递增代号做「只让最后一次渲染落地」，旧调用在 await 后直接丢弃。
    const gen = (this.renderGeneration || 0) + 1;
    this.renderGeneration = gen;
    const container = this.root;
    container.empty();
    container.addClass("timenote-container");

    // 旧调用即使被下面的 generation 检查丢弃，也不能让它把旧数据写进共享状态。
    // 先收进局部变量，检查通过后再赋给 this.entriesMap。
    const entriesMap = await this.refreshData();
    if (gen !== this.renderGeneration) return;
    this.entriesMap = entriesMap;

    // 1. Primary Header Bar
    this.renderHeader(container);

    // 2. Sub-Header: Filter Pills & Stats Summary
    this.renderSubHeader(container);

    // 3. View Mode Body
    if (this.currentViewMode === "day") {
      this.renderDayView(container);
    } else if (this.currentViewMode === "3day") {
      this.render3DayView(container);
    } else if (this.currentViewMode === "week") {
      this.renderWeekView(container);
    } else if (this.currentViewMode === "month") {
      this.renderMonthView(container);
    } else if (this.currentViewMode === "quarter") {
      this.renderQuarterView(container);
    } else if (this.currentViewMode === "year") {
      this.renderYearView(container);
    } else if (this.currentViewMode === "timeline") {
      this.renderTimelineView(container);
    }
  }

  renderHeader(container) {
    const header = container.createEl("div", { cls: "timenote-header" });

    // Left: Navigation & Title
    const nav = header.createEl("div", { cls: "timenote-nav" });

    // 1. Period Prev (⏮ 上周期)
    const prevPeriodBtn = nav.createEl("button", {
      text: "⏮ 上周期",
      cls: "timenote-nav-btn",
      attr: { title: "按当前视图周期切换 (天/3天/7天/月/季/年)" }
    });
    prevPeriodBtn.onclick = () => this.navigatePeriod(-1);

    // 2. Day Prev (◀ -1天)
    const prevDayBtn = nav.createEl("button", {
      text: "◀ -1天",
      cls: "timenote-nav-btn",
      attr: { title: "向前翻动 1 天" }
    });
    prevDayBtn.onclick = () => this.navigateDay(-1);

    // 3. Today (今天)
    const todayBtn = nav.createEl("button", { text: "今天", cls: "timenote-tab-btn" });
    todayBtn.onclick = () => {
      if (this.currentViewMode === "week") {
        this.currentDate = moment().startOf(this.host.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
      } else {
        this.currentDate = moment();
      }
      this.renderView();
    };

    // 4. Day Next (+1天 ▶)
    const nextDayBtn = nav.createEl("button", {
      text: "+1天 ▶",
      cls: "timenote-nav-btn",
      attr: { title: "向后翻动 1 天" }
    });
    nextDayBtn.onclick = () => this.navigateDay(1);

    // 5. Period Next (下周期 ⏭)
    const nextPeriodBtn = nav.createEl("button", {
      text: "下周期 ⏭",
      cls: "timenote-nav-btn",
      attr: { title: "按当前视图周期切换 (天/3天/7天/月/季/年)" }
    });
    nextPeriodBtn.onclick = () => this.navigatePeriod(1);

    const titleText = this.getTitleString();
    nav.createEl("span", { text: titleText, cls: "timenote-title" });

    // Right: Actions (Search, Mode Tabs, Add, Refresh)
    const actions = header.createEl("div", { cls: "timenote-actions" });

    // Search Input
    const searchInput = actions.createEl("input", {
      cls: "timenote-search",
      attr: { placeholder: "搜索记录/标签...", value: this.searchQuery }
    });
    searchInput.oninput = (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderView();
    };

    // View Mode Tabs: 日, 3天, 周, 月, 季度, 年度, 时间线
    const tabs = actions.createEl("div", { cls: "timenote-tabs" });
    const modes = [
      { id: "day", label: "日" },
      { id: "3day", label: "3天" },
      { id: "week", label: "周" },
      { id: "month", label: "月" },
      { id: "quarter", label: "季度" },
      { id: "year", label: "年度" },
      { id: "timeline", label: "时间线" }
    ];

    modes.forEach(m => {
      const btn = tabs.createEl("button", {
        text: m.label,
        cls: `timenote-tab-btn ${this.currentViewMode === m.id ? "active" : ""}`
      });
      btn.onclick = () => {
        if (m.id === "week") {
          this.currentDate = this.currentDate.clone().startOf(this.host.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
        }
        this.currentViewMode = m.id;
        this.renderView();
      };
    });

    // 布局切换：显示密度，不是视图模式
    const layoutBtn = actions.createEl("button", {
      text: this.getLayoutMode() === "block" ? "块布局" : "紧凑流",
      cls: "timenote-layout-toggle"
    });
    layoutBtn.onclick = async () => {
      this.host.settings.layoutMode = this.getLayoutMode() === "block" ? "compact" : "block";
      await this.host.saveSettings();
    };

    // 新增类型切换（DEC-022）：决定空白槽点击 / 拖拽与「+ 记一条」默认创建块还是时间点。
    // 只改设置与按钮文字，不重渲染 —— 槽位交互每次按下时都读当前设置，切换立即生效，
    // 也不会像整视图重建那样把用户的滚动位置重置掉。
    const addTypeBtn = actions.createEl("button", {
      text: this.getAddType() === "point" ? "新增：时间点" : "新增：时间块",
      cls: "timenote-layout-toggle",
      attr: {
        title: "单击切换新建记录类型：时间块（起止时间）/ 时间点（只有时刻）。按住 Alt 点空白槽可临时切到另一种类型。"
      }
    });
    addTypeBtn.onclick = async () => {
      this.host.settings.defaultAddType = this.getAddType() === "point" ? "block" : "point";
      await this.host.saveSettings();
      const isPoint = this.getAddType() === "point";
      addTypeBtn.textContent = isPoint ? "新增：时间点" : "新增：时间块";
      this.host.notice(isPoint ? "新建记录：时间点（只记时刻）" : "新建记录：时间块（起止时间）");
    };

    // Quick Add Button
    const addBtn = actions.createEl("button", { text: "+ 记一条", cls: "timenote-btn-primary" });
    addBtn.onclick = () => {
      // 默认记「今天」，不要用 currentDate：周视图下 currentDate 会被对齐到周起始日
      // （即视图第一天），拿它当默认日期会把新建记录记到周一去（2026-11-12 实测）。
      // 空白槽点击仍按所点列日期，那是「点哪天记哪天」的既有设计。
      this.host.openQuickAdd(moment().format("YYYY-MM-DD"), () => {
        this.renderView();
      });
    };

    // Refresh Button
    const refreshBtn = actions.createEl("button", { cls: "clickable-icon" });
    this.host.setIcon(refreshBtn, "refresh-cw");
    refreshBtn.onclick = () => {
      this.host.invalidateCache();
      this.renderView();
      this.host.notice("已刷新时间笔记数据！");
    };
  }

  renderSubHeader(container) {
    const subHeader = container.createEl("div", { cls: "timenote-sub-header" });

    // Filter pills
    const pillsWrap = subHeader.createEl("div", { cls: "timenote-filter-pills" });
    const filters = [
      { id: "all", label: "全部" },
      { id: "task", label: "待办" },
      { id: "memo", label: "闪念" },
      // 原为「Blinko」，接入 memos 后改为覆盖全部聚合来源（DEC-023）
      { id: "external", label: "外部来源" }
    ];

    filters.forEach(f => {
      const pill = pillsWrap.createEl("button", {
        text: f.label,
        cls: `timenote-filter-pill ${this.currentFilterType === f.id ? "active" : ""}`
      });
      pill.onclick = () => {
        this.currentFilterType = f.id;
        this.renderView();
      };
    });

    // Compute stats across current entries
    let totalTasks = 0;
    let completedTasks = 0;
    let totalMemos = 0;

    for (const [_, entries] of this.entriesMap.entries()) {
      const filtered = this.filterEntries(entries);
      filtered.forEach(e => {
        if (e.isTask) {
          totalTasks++;
          if (e.isCompleted) completedTasks++;
        } else {
          totalMemos++;
        }
      });
    }

    const statsBadge = subHeader.createEl("div", { cls: "timenote-stats-badge" });
    statsBadge.createEl("span", { text: `📊 待办：` });
    statsBadge.createEl("strong", { text: `${completedTasks}/${totalTasks}` });
    statsBadge.createEl("span", { text: ` · 闪念：` });
    statsBadge.createEl("strong", { text: `${totalMemos}` });
  }

  getTitleString() {
    if (this.currentViewMode === "day" || this.currentViewMode === "timeline") {
      return this.currentDate.format("YYYY年MM月DD日 dddd");
    } else if (this.currentViewMode === "3day") {
      const end = this.currentDate.clone().add(2, "days");
      if (this.currentDate.year() === end.year()) {
        return `${this.currentDate.format("YYYY年MM月DD日")} - ${end.format("MM月DD日")} (3天)`;
      } else {
        return `${this.currentDate.format("YYYY年MM月DD日")} - ${end.format("YYYY年MM月DD日")} (3天)`;
      }
    } else if (this.currentViewMode === "week") {
      const start = this.currentDate.clone();
      const end = start.clone().add(6, "days");
      if (start.isoWeekday() === 1 && end.isoWeekday() === 7) {
        return `${start.format("YYYY年MM月DD日")} - ${end.format("MM月DD日")} (第${start.isoWeek()}周)`;
      } else {
        return `${start.format("YYYY年MM月DD日")} - ${end.format("MM月DD日")} (7天)`;
      }
    } else if (this.currentViewMode === "month") {
      return this.currentDate.format("YYYY年 MM月");
    } else if (this.currentViewMode === "quarter") {
      const q = this.currentDate.quarter();
      const sm = (q - 1) * 3 + 1;
      const em = q * 3;
      return `${this.currentDate.format("YYYY年")} 第${q}季度 (${sm}月 - ${em}月)`;
    } else if (this.currentViewMode === "year") {
      return `${this.currentDate.format("YYYY年")} 全景概览`;
    }
    return "";
  }

  // Navigate by view-specific period (1d, 3d, 7d, 1m, 1q, 1y)
  navigatePeriod(direction) {
    if (this.currentViewMode === "day" || this.currentViewMode === "timeline") {
      this.currentDate.add(direction, "days");
    } else if (this.currentViewMode === "3day") {
      this.currentDate.add(direction * 3, "days");
    } else if (this.currentViewMode === "week") {
      this.currentDate.add(direction * 7, "days");
    } else if (this.currentViewMode === "month") {
      this.currentDate.add(direction, "months");
    } else if (this.currentViewMode === "quarter") {
      this.currentDate.add(direction, "quarters");
    } else if (this.currentViewMode === "year") {
      this.currentDate.add(direction, "years");
    }
    this.renderView();
  }

  // Strictly navigate by 1 day (shifts week and 3day windows day-by-day!)
  navigateDay(direction) {
    this.currentDate.add(direction, "days");
    this.renderView();
  }

  filterEntries(entries) {
    let result = entries;

    if (this.currentFilterType === "task") {
      result = result.filter(e => e.isTask);
    } else if (this.currentFilterType === "memo") {
      result = result.filter(e => !e.isTask);
    } else if (this.currentFilterType === "external") {
      // 覆盖所有聚合进来的来源（Blinko / memos / 思源…）。
      // 旧版这里是 source === "blinko"，接入第二个来源后会漏筛（DEC-023）。
      result = result.filter(e => isExternalSource(e.source));
    }

    if (this.searchQuery) {
      result = result.filter(e => {
        const matchText = e.text.toLowerCase().includes(this.searchQuery);
        const matchTag = e.tags.some(t => t.toLowerCase().includes(this.searchQuery));
        return matchText || matchTag;
      });
    }
    return result;
  }

  // ==========================================================================
  // Week, 3-Day & Day Grid View Renderer
  // ==========================================================================

  renderDayView(container) {
    this.renderTimeGrid(container, [this.currentDate.clone()]);
  }

  render3DayView(container) {
    const days = [];
    for (let i = 0; i < 3; i++) {
      days.push(this.currentDate.clone().add(i, "days"));
    }
    this.renderTimeGrid(container, days);
  }

  renderWeekView(container) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(this.currentDate.clone().add(i, "days"));
    }
    this.renderTimeGrid(container, days);
  }

  renderTimeGrid(container, days) {
    // 每次重渲染前先停表并清引用，避免指向已移除的 DOM
    this.stopNowClock();
    this.nowLineEl = null;
    this.nowLabelEl = null;
    this.currentTimeScale = null;
    if (this.getLayoutMode() === "compact") {
      return this.renderCompactGrid(container, days);
    }
    return this.renderBlockGrid(container, days);
  }

  getLayoutMode() {
    return this.host.settings.layoutMode === "compact" ? "compact" : "block";
  }

  // 新建记录类型：设置页与工具栏共用同一个状态，非法值一律回退成时间块（DEC-022）
  getAddType() {
    return normalizeAddType(this.host.settings.defaultAddType);
  }

  // 拖动时按指针横坐标找目标日期列。只认当前视图里真实存在的列：
  // 落在刻度列 / 容器外返回 null，不臆造视图范围之外的日期。
  findDropDate(clientX, homeDate, columns) {
    for (const c of columns) {
      const r = c.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) {
        const ds = c.dataset.dateStr;
        return ds && ds !== homeDate ? ds : null;
      }
    }
    return null;
  }

  // 拖动中的落点提示：高亮目标列，其余列清掉
  markDropDate(columns, targetDate) {
    columns.forEach(c => {
      if (c.dataset.dateStr === targetDate) c.classList.add("is-drop-target");
      else c.classList.remove("is-drop-target");
    });
  }

  renderCompactGrid(container, days) {
    const wrapper = container.createEl("div", { cls: "timenote-timegrid-wrapper" });

    // 1. Fixed Header: Dedicated Day column for EACH day (Title on top, that day's all-day box below)
    const header = wrapper.createEl("div", { cls: "timenote-timegrid-header" });
    const headerDays = header.createEl("div", { cls: "timenote-header-days" });

    days.forEach(d => {
      const dateStr = d.format("YYYY-MM-DD");
      const isToday = d.isSame(moment(), "day");

      const dayCol = headerDays.createEl("div", {
        cls: `timenote-header-day-col ${isToday ? "is-today" : ""}`
      });

      // Top: Day Title
      const titleRow = dayCol.createEl("div", { cls: "timenote-day-title-row" });
      titleRow.createEl("span", { text: d.format("ddd"), cls: "timenote-day-name" });
      titleRow.createEl("span", { text: d.format("D"), cls: "timenote-day-num" });
      // 日期标题直接打开当天的日记（DEC-017）；下钻到日视图仍可用顶部「日」标签
      titleRow.setAttribute("title", `打开 ${dateStr} 日记`);
      titleRow.onclick = () => this.openDailyNoteForDate(dateStr);

      // Bottom: Dedicated All-Day box strictly inside THIS day's column
      const allDayContainer = dayCol.createEl("div", { cls: "timenote-day-allday-container" });
      const entries = this.filterEntries(this.entriesMap.get(dateStr) || []);
      const allDayEntries = entries.filter(e => !e.hasTime);

      allDayEntries.forEach(entry => {
        const chip = allDayContainer.createEl("div", {
          cls: `timenote-all-day-chip ${entry.isTask ? "is-task" : "is-memo"} ${entry.isCompleted ? "completed" : ""}`
        });

        if (entry.isTask) {
          const cb = chip.createEl("input", {
            cls: "timenote-card-checkbox",
            attr: { type: "checkbox" }
          });
          cb.checked = entry.isCompleted;
          cb.onclick = async (ev) => {
            ev.stopPropagation();
            this.hideHoverTooltip();
            await this.host.toggleTask(entry);
            this.renderView();
          };
        }

        chip.createEl("span", { text: entry.text, cls: "timenote-all-day-chip-text" });

        if (entry.subItems && entry.subItems.length > 0) {
          const badge = chip.createEl("span", {
            text: `▾${entry.subItems.length}`,
            cls: "timenote-tag-chip",
            style: "cursor: pointer; flex-shrink: 0;"
          });
          badge.onclick = (ev) => {
            ev.stopPropagation();
            this.hideHoverTooltip();
            this.host.openSubItems(entry);
          };
        }

        chip.onmouseenter = (ev) => {
          this.showHoverTooltip(entry, chip, ev);
        };
        chip.onmouseleave = () => {
          this.hideHoverTooltip();
        };

        chip.onclick = () => {
          this.hideHoverTooltip();
          this.jumpToFileLine(entry);
        };
      });
    });

    // 2. Scrollable Body: Columns matching header columns 1:1
    const scrollArea = wrapper.createEl("div", { cls: "timenote-scroll-area" });
    scrollArea.onscroll = () => this.hideHoverTooltip();

    const colsContainer = scrollArea.createEl("div", { cls: "timenote-columns-container" });

    days.forEach(d => {
      const dateStr = d.format("YYYY-MM-DD");
      const isToday = d.isSame(moment(), "day");
      const col = colsContainer.createEl("div", {
        cls: `timenote-column ${isToday ? "is-today" : ""}`
      });

      const entries = this.filterEntries(this.entriesMap.get(dateStr) || []);
      const timeEntries = entries.filter(e => e.hasTime);

      // Sort strictly by exact startSeconds (down to seconds)
      timeEntries.sort((a, b) => (a.startSeconds || 0) - (b.startSeconds || 0));

      // If no timed entries for the whole day:
      if (timeEntries.length === 0) {
        const emptyRow = col.createEl("div", {
          cls: "timenote-compressed-gap",
          attr: { title: `点击在 ${dateStr} 快速记一条` }
        });
        emptyRow.createEl("span", {
          text: "00:00 ~ 24:00 (全天无定时记录)",
          cls: "timenote-compressed-gap-text"
        });
        emptyRow.onclick = () => {
          this.host.openQuickAdd(dateStr, () => {
            this.renderView();
          }, "09:00");
        };
        return;
      }

      // Generate compressed stream: Gaps + Lines
      const dayStartSec = 0; // 00:00:00
      const dayEndSec = 86400; // 24:00:00
      const MIN_GAP_SECONDS = 1800; // 30 minutes threshold for gap compression

      let lastEndSec = dayStartSec;

      timeEntries.forEach(entry => {
        const entryStartSec = entry.startSeconds || 0;

        // Gap before this entry
        if (entryStartSec - lastEndSec >= MIN_GAP_SECONDS) {
          const gapStartStr = formatSecondsToTime(lastEndSec);
          const gapEndStr = formatSecondsToTime(entryStartSec);
          const gapRow = col.createEl("div", {
            cls: "timenote-compressed-gap",
            attr: { title: `点击在 ${gapStartStr} 快速记一条` }
          });
          gapRow.createEl("span", {
            text: `┄ ${gapStartStr} ~ ${gapEndStr} (空闲) ┄`,
            cls: "timenote-compressed-gap-text"
          });
          gapRow.onclick = () => {
            this.host.openQuickAdd(dateStr, () => {
              this.renderView();
            }, gapStartStr.slice(0, 5));
          };
        }

        // Render Event as a Line Row (展示为线，线周围标识具体时间点，一行一个，不要并列，精确到秒)
        const srcCls = sourceCssClass(entry.source);
        const lineRow = col.createEl("div", {
          cls: `timenote-time-line-row ${entry.isTask ? "is-task" : "is-memo"} ${entry.isCompleted ? "is-completed" : ""} ${srcCls}`
        });

        // 1. Line & Time Badge Wrapper
        const lineWrapper = lineRow.createEl("div", { cls: "timenote-line-wrapper" });
        lineWrapper.createEl("span", { text: entry.timeStr, cls: "timenote-line-time" });
        lineWrapper.createEl("span", { cls: "timenote-line-dot" });
        lineWrapper.createEl("div", { cls: "timenote-line-bar" });

        // 2. Line Content
        const lineContent = lineRow.createEl("div", { cls: "timenote-line-content" });

        if (entry.isTask) {
          const cb = lineContent.createEl("input", {
            cls: "timenote-card-checkbox",
            attr: { type: "checkbox" }
          });
          cb.checked = entry.isCompleted;
          cb.onclick = async (ev) => {
            ev.stopPropagation();
            this.hideHoverTooltip();
            await this.host.toggleTask(entry);
            this.renderView();
          };
        }

        lineContent.createEl("span", { text: entry.text, cls: "timenote-line-text" });

        if (entry.tags && entry.tags.length > 0) {
          entry.tags.slice(0, 2).forEach(t => {
            const colors = getTagColor(t);
            lineContent.createEl("span", {
              text: `#${t}`,
              cls: "timenote-tag-chip",
              style: `background-color: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border}; flex-shrink: 0;`
            });
          });
        }

        if (entry.subItems && entry.subItems.length > 0) {
          const subBadge = lineContent.createEl("span", {
            text: `▾${entry.subItems.length}`,
            cls: "timenote-tag-chip",
            style: "cursor: pointer; flex-shrink: 0; background-color: var(--background-modifier-border);"
          });
          subBadge.onclick = (ev) => {
            ev.stopPropagation();
            this.hideHoverTooltip();
            this.host.openSubItems(entry);
          };
        }

        // Hover Preview (鼠标移动上去可以预览具体内容)
        lineRow.onmouseenter = (ev) => {
          this.showHoverTooltip(entry, lineRow, ev);
        };
        lineRow.onmouseleave = () => {
          this.hideHoverTooltip();
        };

        // Click to jump to line in daily note
        lineRow.onclick = () => {
          this.hideHoverTooltip();
          this.jumpToFileLine(entry);
        };

        // 时间点不占时长：算空闲段时不能再把它当 30 分钟块（DEC-018）
        lastEndSec = isPointEntry(entry)
          ? entryStartSec
          : (entry.endSeconds || (entryStartSec + 1800));
      });

      // Gap after last entry to end of day
      if (dayEndSec - lastEndSec >= MIN_GAP_SECONDS) {
        const gapStartStr = formatSecondsToTime(lastEndSec);
        const gapRow = col.createEl("div", {
          cls: "timenote-compressed-gap",
          attr: { title: `点击在 ${gapStartStr} 快速记一条` }
        });
        gapRow.createEl("span", {
          text: `┄ ${gapStartStr} ~ 24:00 (空闲) ┄`,
          cls: "timenote-compressed-gap-text"
        });
        gapRow.onclick = () => {
          this.host.openQuickAdd(dateStr, () => {
            this.renderView();
          }, gapStartStr.slice(0, 5));
        };
      }
    });

    // Sync scrollbar width to header
    this.syncHeaderGutter(wrapper, header, scrollArea);
  }

  /**
   * 表头在固定容器、时间网格在滚动容器：垂直滚动条会吃掉网格的可见宽度，
   * 不把同等宽度补给表头，日期列就会和下面的时间列逐列错位。
   * 弹性轴会二次重渲染、内容高度变化会让滚动条出现/消失，所以用 ResizeObserver
   * 持续同步，而不是只在首帧量一次。
   */
  syncHeaderGutter(wrapper, header, scrollArea) {
    const sync = () => {
      if (!wrapper.isConnected) return false;
      const gutter = Math.max(0, scrollArea.offsetWidth - scrollArea.clientWidth);
      header.style.paddingRight = `${gutter}px`;
      return true;
    };
    requestAnimationFrame(() => {
      if (!sync()) return;
      const ro = new ResizeObserver(() => {
        if (!sync()) ro.disconnect();
      });
      ro.observe(scrollArea);
      ro.observe(wrapper);
      // 每次重渲染只保留最新的 observer，避免旧视图泄漏
      if (this.headerGutterObserver && this.headerGutterObserver !== ro) {
        this.headerGutterObserver.disconnect();
      }
      this.headerGutterObserver = ro;
    });
  }

  // ==========================================================================
  // Time Block Grid Renderer（共享渲染层，日 / 3天 / 周 复用）
  // ==========================================================================
  renderBlockGrid(container, days) {
    const wrapper = container.createEl("div", { cls: "timenote-timegrid-wrapper" });
    const header = wrapper.createEl("div", { cls: "timenote-timegrid-header" });
    const headerDays = header.createEl("div", { cls: "timenote-header-days" });
    // 刻度列的表头不是一块留白：上格对齐日期行，下格就是 ALL DAY 行的行标签。
    // 用两层 flex 跟随全天区实际高度，标签永远与 ALL DAY 行垂直居中，且不占额外布局高度。
    const rulerSpacer = headerDays.createEl("div", { cls: "timenote-block-ruler-spacer" });
    rulerSpacer.createEl("div", { cls: "timenote-ruler-corner" });
    rulerSpacer.createEl("div", { cls: "timenote-allday-ruler-label", text: "ALL DAY" });

    // 全天区高度：设置项持久化，拖拽分隔条可实时调整（DEC-011）
    const allDayHeight = Math.max(32, Math.min(320, Number(this.host.settings.allDayHeight ?? 36)));

    days.forEach(d => {
      const dateStr = d.format("YYYY-MM-DD");
      const isToday = d.isSame(moment(), "day");
      const dayCol = headerDays.createEl("div", {
        cls: `timenote-header-day-col ${isToday ? "is-today" : ""}`
      });
      const titleRow = dayCol.createEl("div", { cls: "timenote-day-title-row" });
      titleRow.createEl("span", { text: d.format("ddd"), cls: "timenote-day-name" });
      titleRow.createEl("span", { text: d.format("D"), cls: "timenote-day-num" });
      // 日期标题直接打开当天的日记（DEC-017）；下钻到日视图仍可用顶部「日」标签
      titleRow.setAttribute("title", `打开 ${dateStr} 日记`);
      titleRow.onclick = () => this.openDailyNoteForDate(dateStr);
      const allDayContainer = dayCol.createEl("div", { cls: "timenote-day-allday-container" });
      allDayContainer.style.height = `${allDayHeight}px`;
      allDayContainer.style.minHeight = `${allDayHeight}px`;
      allDayContainer.style.maxHeight = `${allDayHeight}px`;
      const allDay = this.filterEntries(this.entriesMap.get(dateStr) || []).filter(e => !e.hasTime);
      allDay.forEach(entry => {
        const chip = allDayContainer.createEl("div", {
          cls: `timenote-all-day-chip ${entry.isTask ? "is-task" : "is-memo"} ${entry.isCompleted ? "completed" : ""}`
        });
        chip.createEl("span", { text: entry.text, cls: "timenote-all-day-chip-text" });
        chip.onclick = () => this.jumpToFileLine(entry);
      });
    });

    const startHour = Number(this.host.settings.startHour ?? 0);
    const endHour = Number(this.host.settings.endHour ?? 24);
    const slotHeight = Number(this.host.settings.slotHeight ?? 52);
    const dayStartSec = startHour * 3600;
    const dayEndSec = endHour * 3600;
    const nowAtRender = moment();
    const hasToday = days.some(d => d.isSame(nowAtRender, "day"));

    // 时间轴：行高由内容决定（DEC-012），所有「秒 ↔ 像素」换算一律经 scale
    const elastic = this.host.settings.elasticTimeline !== false;

    // 块的「内容高度」需要列宽（中文折行后要几行），先按可见宽度估一次
    const viewWidth = Math.max(320, wrapper.clientWidth || 880);
    const colWidth = Math.max(150, (viewWidth - BLOCK_RULER_W) / Math.max(1, days.length));
    // 视口高度 = 整个面板减去固定表头，用于「内容不足一屏时把行距放大」
    const measuredViewport = wrapper.clientHeight ? wrapper.clientHeight - header.offsetHeight : 0;
    const viewportHeight = measuredViewport > 120 ? measuredViewport - BLOCK_BOTTOM_GUTTER - 2 : 0;

    const clustersByDay = new Map();
    const tintsByDay = new Map();
    const pointLinesByDay = new Map();
    const scaleEntries = [];
    const rowCount = Math.max(1, endHour - startHour);
    const pointNeeds = new Array(rowCount).fill(0);
    days.forEach(d => {
      const ds = d.format("YYYY-MM-DD");
      const dayTimed = this.filterEntries(this.entriesMap.get(ds) || []).filter(e => e.hasTime);

      // 按天独立配色（DEC-016）：稳定排序保证重渲染不跳色；新块插进序列后
      // 会自动拿到当天尚未使用的颜色，不会和当天其它时间块撞色。
      const ordered = dayTimed.slice().sort((a, b) =>
        (a.startSeconds || 0) - (b.startSeconds || 0) ||
        (a.lineNum || 0) - (b.lineNum || 0) ||
        String(a.text || "").localeCompare(String(b.text || ""))
      );
      const tintCss = assignDayTints(ordered.map(e => ({ key: tintEntryKey(e, ds), tint: e.tint })));
      const dayTints = new Map();
      ordered.forEach((e, i) => dayTints.set(tintEntryKey(e, ds), tintCss[i]));
      tintsByDay.set(ds, dayTints);

      // 时间点（只有开始时刻）画成线，不参与块的分簇与行高内容估算（DEC-018）：
      // 每条只占一行标签的高度，按小时汇总后交给弹性轴把该行撑开。
      const points = layoutPointLines(dayTimed, dayStartSec, dayEndSec);
      pointLinesByDay.set(ds, points);
      const perDayPointNeeds = new Array(rowCount).fill(0);
      points.forEach(p => {
        const idx = Math.floor((p.sec - dayStartSec) / 3600);
        if (idx >= 0 && idx < rowCount) perDayPointNeeds[idx] += POINT_ROW_H;
      });
      perDayPointNeeds.forEach((v, i) => {
        if (v > pointNeeds[i]) pointNeeds[i] = v;
      });

      const timed = dayTimed
        .filter(e => !isPointEntry(e))
        .filter(e => (e.startSeconds || 0) < dayEndSec && (e.endSeconds || 0) > dayStartSec);
      const clusters = layoutTimeBlockClusters(timed, dayStartSec, dayEndSec);
      clustersByDay.set(ds, clusters);
      if (!elastic) return;
      clusters.forEach(cluster => {
        const laneWidth = colWidth / Math.max(1, cluster.laneCount);
        cluster.items.forEach(it => {
          scaleEntries.push({ s: it.s, en: it.en, needH: estimateBlockNeed(it.entry, laneWidth) });
        });
      });
    });

    const scale = buildTimeScale({
      startHour, endHour, slotHeight, top: BLOCK_TOP_GUTTER,
      entries: scaleEntries, pointNeeds, elastic, viewportHeight
    });
    this.currentTimeScale = scale;
    const totalHeight = scale.totalHeight;

    // 首次渲染时面板可能还没完成布局（clientHeight = 0），此时测不到视口就不做等比放大。
    // 下一帧补一次重渲染，避免整条轴挤在面板上半截；最多补两次，防止死循环。
    if (viewportHeight > 0) {
      this.viewportRetry = 0;
    } else if ((this.viewportRetry || 0) < 2) {
      this.viewportRetry = (this.viewportRetry || 0) + 1;
      requestAnimationFrame(() => {
        if (wrapper.isConnected) this.renderView();
      });
    }

    // 全天区与时间网格之间的可拖拽分隔条：绝对定位压在表头底边上，不占布局高度，
    // 否则会在全天区和第一个整点之间多出一条空行（用户反馈的「奇怪的空行」）
    const resizer = header.createEl("div", {
      cls: "timenote-header-resizer",
      attr: { title: "拖动调节全天区高度" }
    });
    this.attachAllDayResizer(resizer, header);

    const scrollArea = wrapper.createEl("div", { cls: "timenote-scroll-area timenote-block-scroll" });
    scrollArea.onscroll = () => this.hideHoverTooltip();
    const colsContainer = scrollArea.createEl("div", {
      cls: `timenote-columns-container timenote-block-columns ${elastic ? "is-elastic" : ""}`
    });
    colsContainer.style.height = `${totalHeight + BLOCK_TOP_GUTTER + BLOCK_BOTTOM_GUTTER}px`;

    const ruler = colsContainer.createEl("div", { cls: "timenote-block-ruler" });
    for (let h = startHour; h <= endHour; h++) {
      const label = ruler.createEl("div", {
        cls: "timenote-block-ruler-label",
        text: h === 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`
      });
      label.style.top = `${scale.yOf(h * 3600)}px`;
      // 第一条刻度顶到轴顶，标签下移贴住轴线，避免 translateY(-50%) 被滚动容器裁掉半截
      if (h === startHour) label.addClass("is-first");
      // 当前小时用主色标记，和时间线同色；不再是淡化的一行小字
      if (hasToday && h === nowAtRender.hour()) label.addClass("is-now");
      // 被压扁的空档行：标签略缩小，避免一行行糊在一起（但不降字重、不淡到看不清）
      const rowH = scale.heights[Math.min(scale.rowCount - 1, h - startHour)];
      if (scale.elastic && rowH < slotHeight * 0.5) label.addClass("is-dense");
    }

    days.forEach(d => {
      const dateStr = d.format("YYYY-MM-DD");
      const isToday = d.isSame(moment(), "day");
      const col = colsContainer.createEl("div", {
        cls: `timenote-column timenote-block-column ${isToday ? "is-today" : ""}`
      });
      // 跨天拖动靠列上的日期标识找落点（DEC-022）
      col.dataset.dateStr = dateStr;
      col.style.height = `${totalHeight + BLOCK_TOP_GUTTER + BLOCK_BOTTOM_GUTTER}px`;

      for (let h = startHour; h <= endHour; h++) {
        const line = col.createEl("div", { cls: "timenote-block-hour-line" });
        line.style.top = `${scale.yOf(h * 3600)}px`;
      }

      // 空白槽：按住拖动选择时间范围创建（TaskNotes 手感）；单击仍按默认时长预填
      const slotLayer = col.createEl("div", { cls: "timenote-block-slot-layer" });
      slotLayer.style.top = `${BLOCK_TOP_GUTTER}px`;
      slotLayer.style.height = `${totalHeight}px`;
      slotLayer.style.bottom = "auto";
      this.attachSlotDrag(col, slotLayer, dateStr, scale);

      const clusters = clustersByDay.get(dateStr) || [];

      clusters.forEach(cluster => {
        const laneWidth = colWidth / Math.max(1, cluster.laneCount);
        cluster.items.forEach(it => {
          const e = it.entry;
          const top = scale.yOf(it.s);
          // 块高 = 它在轴上的时间跨度：上沿对齐开始时间、下沿对齐结束时间，
          // 与整点刻度严格一致。「内容多就高」由行高承担（见 buildTimeScale），
          // 不允许再把块从跨度里截短 —— 截短后下沿就不代表结束时间了。
          const spanH = Math.max(MIN_RENDER_BLOCK_PX, scale.yOf(it.en) - top);
          const height = spanH;
          const widthPct = 100 / cluster.laneCount;
          const block = col.createEl("div", {
            cls: `timenote-event-block ${e.isTask ? "is-task" : "is-memo"} ${e.isCompleted ? "is-completed" : ""} ${sourceCssClass(e.source)} ${e.isRange ? "is-range" : ""}`
          });
          block.style.top = `${top}px`;
          block.style.height = `${height}px`;
          block.style.left = `${it.lane * widthPct}%`;
          block.style.width = `calc(${widthPct}% - 6px)`;
          // 同一天的块各用一种颜色；#color/xxx 显式指定时优先保留
          block.style.setProperty(
            "--tn-tint",
            tintsByDay.get(dateStr)?.get(tintEntryKey(e, dateStr)) || "var(--color-accent)"
          );
          // 块高恒等于时间跨度，块矮时按可用高度收起次要信息，别让文字挤成一团
          if (height < 34) block.addClass("is-dense");
          if (height < 24) block.addClass("is-tiny");

          const title = block.createEl("div", { cls: "timenote-event-block-title" });
          if (e.isTask) {
            const cb = title.createEl("input", { cls: "timenote-card-checkbox", attr: { type: "checkbox" } });
            cb.checked = e.isCompleted;
            cb.onclick = async (ev) => {
              ev.stopPropagation();
              this.hideHoverTooltip();
              await this.host.toggleTask(e);
              this.renderView();
            };
          }
          title.createEl("span", { text: e.text });

          // 块内只写标题 + 起止时刻，时长移到右下角，避免和时间轴刻度重复
          const tagSuffix = e.tags && e.tags.length > 0 ? ` · #${e.tags.slice(0, 2).join(" #")}` : "";
          const meta = block.createEl("div", {
            cls: "timenote-event-block-meta",
            text: `${formatSecondsToTime(it.s)} – ${formatSecondsToTime(it.en)}${tagSuffix}`
          });
          const duration = block.createEl("div", {
            cls: "timenote-event-block-duration",
            text: formatDuration(it.en - it.s)
          });
          if (e.subItems && e.subItems.length > 0) {
            const badge = block.createEl("div", { cls: "timenote-event-block-sub", text: `▾${e.subItems.length} 子项` });
            badge.onclick = (ev) => {
              ev.stopPropagation();
              this.hideHoverTooltip();
              this.host.openSubItems(e);
            };
          }

          // 上下边缘拖动改起止、中部拖动整体平移（无可见把手，任意块高都生效）
          this.attachBlockDrag(block, e, meta, duration, scale);

          block.onmouseenter = (ev) => this.showHoverTooltip(e, block, ev);
          block.onmouseleave = () => this.hideHoverTooltip();
          block.onclick = (ev) => {
            ev.stopPropagation();
            this.hideHoverTooltip();
            // 拖拽结束后浏览器仍会补一次 click，这里吃掉，避免误跳原笔记
            if (block.dataset.dragMoved === "1") return;
            this.jumpToFileLine(e);
          };
        });
      });

      // 时间点线：top 严格等于 yOf(startSeconds)，信息列在线下；同一簇逐行错开（DEC-018）。
      // 这里绝不创建时间块 DOM、也不创建复选框 —— 时间点不是任务块。
      (pointLinesByDay.get(dateStr) || []).forEach(p => {
        const e = p.entry;
        const line = col.createEl("div", {
          cls: `timenote-point-line ${e.isTask ? "is-task" : "is-memo"} ${e.isCompleted ? "is-completed" : ""} ${sourceCssClass(e.source)}`
        });
        line.style.top = `${scale.yOf(p.sec)}px`;
        line.style.setProperty(
          "--tn-tint",
          tintsByDay.get(dateStr)?.get(tintEntryKey(e, dateStr)) || "var(--color-accent)"
        );
        // 细线不好抓，给一条透明的 10px 命中带；标签本身也能冒泡触发拖动
        line.createEl("div", { cls: "timenote-point-line-hit" });
        line.createEl("div", { cls: "timenote-point-line-bar" });
        line.createEl("span", { cls: "timenote-point-line-dot" });

        const label = line.createEl("div", { cls: "timenote-point-line-label" });
        label.style.setProperty(
          "--tn-label-offset",
          `${POINT_LABEL_GAP + p.rowInCluster * POINT_ROW_H}px`
        );
        // 时间点可以精确到秒，展示沿用解析出来的原始时间字符串
        const timeBadge = label.createEl("span", {
          cls: "timenote-point-line-time",
          text: e.timeStr || formatSecondsToTime(p.sec)
        });
        label.createEl("span", { cls: "timenote-point-line-text", text: e.text });
        if (e.tags && e.tags.length > 0) {
          label.createEl("span", {
            cls: "timenote-point-line-tags",
            text: `#${e.tags.slice(0, 2).join(" #")}`
          });
        }

        this.attachPointDrag(line, e, timeBadge, scale);
        line.onmouseenter = (ev) => this.showHoverTooltip(e, line, ev);
        line.onmouseleave = () => this.hideHoverTooltip();
        line.onclick = (ev) => {
          ev.stopPropagation();
          this.hideHoverTooltip();
          if (line.dataset.dragMoved === "1") return;
          this.jumpToFileLine(e);
        };
      });
    });

    // 当前时间指示线：只在「今天」出现在所显示日期中时创建，位置由 tickNowLine 维护
    if (hasToday) {
      this.nowLineEl = colsContainer.createEl("div", { cls: "timenote-now-line" });
      this.nowLabelEl = this.nowLineEl.createEl("span", {
        cls: "timenote-now-label",
        text: nowAtRender.format("HH:mm")
      });
      this.tickNowLine();
      this.startNowClock();
    }

    // 表头与滚动区宽度对齐：补上垂直滚动条占掉的宽度，避免日期列与时间列错位
    this.syncHeaderGutter(wrapper, header, scrollArea);
  }

  // ==========================================================================
  // Drag Interactions（拖拽创建 / 调节范围 / 全天区高度）
  // ==========================================================================
  attachSlotDrag(col, slotLayer, dateStr, scale) {
    const dayStartSec = scale.dayStartSec;
    const dayEndSec = scale.dayEndSec;
    // 指针 y -> 秒：弹性轴下必须走 scale 反函数，否则压缩区会被算成错误时刻
    const secAt = (clientY) => {
      const rect = col.getBoundingClientRect();
      return scale.secOf(clientY - rect.top);
    };

    slotLayer.onpointerdown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      // 时间点模式（DEC-022 的工具栏切换 + DEC-029 的 Alt 语义）：只定一个时刻，不画范围预览。
      // 默认已是时间点，Alt 若仍是「强制记点」就变成空操作 —— 改成「临时切到相反类型」：
      // 默认点 + Alt → 块，默认块 + Alt → 点，两种默认值下都有意义。
      const asPoint = ev.altKey ? this.getAddType() !== "point" : this.getAddType() === "point";
      const anchorSec = snapSeconds(secAt(ev.clientY),
        asPoint ? POINT_CREATE_SNAP_MINUTES : DRAG_SNAP_MINUTES);
      const startY = ev.clientY;
      let moved = false;
      let ghost: HTMLElement | null = null;
      let pointSec = Math.max(dayStartSec, Math.min(dayEndSec, anchorSec));

      const onMove = (e: PointerEvent) => {
        if (!moved && Math.abs(e.clientY - startY) < 5) return;
        moved = true;
        if (asPoint) {
          pointSec = Math.max(dayStartSec, Math.min(dayEndSec,
            snapSeconds(secAt(e.clientY), POINT_CREATE_SNAP_MINUTES)));
          if (!ghost) ghost = col.createEl("div", { cls: "timenote-point-ghost" });
          ghost.style.top = `${scale.yOf(pointSec)}px`;
          ghost.textContent = formatSecondsToTime(pointSec);
          return;
        }
        const cur = snapSeconds(secAt(e.clientY));
        let s = Math.min(anchorSec, cur);
        let en = Math.max(anchorSec, cur);
        s = Math.max(dayStartSec, Math.min(s, dayEndSec - MIN_BLOCK_SECONDS));
        en = Math.min(dayEndSec, Math.max(en, s + MIN_BLOCK_SECONDS));
        if (!ghost) ghost = col.createEl("div", { cls: "timenote-block-ghost" });
        ghost.style.top = `${scale.yOf(s)}px`;
        ghost.style.height = `${Math.max(16, scale.yOf(en) - scale.yOf(s))}px`;
        ghost.dataset.start = String(s);
        ghost.dataset.end = String(en);
        ghost.textContent = `${formatSecondsToTime(s)} - ${formatSecondsToTime(en)} · ${formatDuration(en - s)}`;
      };

      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (asPoint) {
          if (ghost) ghost.remove();
          // 单击与拖动都只落一个时刻：不生成结束时间，弹窗里结束框也会被禁用
          const sec = moved ? pointSec : Math.max(dayStartSec, Math.min(dayEndSec,
            snapSeconds(secAt(e.clientY), POINT_CREATE_SNAP_MINUTES)));
          this.openQuickAdd(dateStr, sec, sec, "point");
          return;
        }
        if (moved && ghost) {
          const s = Number(ghost.dataset.start);
          const en = Number(ghost.dataset.end);
          ghost.remove();
          this.openQuickAdd(dateStr, s, en, "block");
          return;
        }
        if (ghost) ghost.remove();
        // 未拖动 = 单击：沿用原有「按位置吸附 30 分钟 + 默认时长」预填
        const rawSec = secAt(e.clientY);
        const snapped = Math.max(dayStartSec, Math.min(dayEndSec - MIN_BLOCK_SECONDS, Math.floor(rawSec / 1800) * 1800));
        const endSec = Math.min(dayEndSec, snapped + (Number(this.host.settings.defaultDuration) || 60) * 60);
        this.openQuickAdd(dateStr, snapped, endSec, "block");
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
  }

  openQuickAdd(dateStr, startSec, endSec, type = "block") {
    const isPoint = normalizeAddType(type) === "point";
    this.host.openQuickAdd(dateStr, () => this.renderView(),
      formatSecondsToTime(startSec),
      isPoint ? "" : formatSecondsToTime(endSec),
      isPoint ? "point" : "block"
    );
  }

  attachBlockDrag(block, entry, meta, duration, scale) {
    // 没有可见把手：块的上下边缘本身就是命中区，光标随指针位置变化。
    // 命中区由模块级 blockEdgeHit() 统一给出，任何块高都能改起止（DEC-014）。

    // 跨出可见时间轴范围的记录不参与拖拽，避免把隐藏部分裁掉
    if (entry.startSeconds < scale.dayStartSec || entry.endSeconds > scale.dayEndSec) return;

    // 远程聚合来源（memos / Blinko API）没有本地行可回写，拖了也只会弹回，
    // 干脆不绑拖拽并给出 default 光标（DEC-023）。这里只看 readonly：
    // 本地 Blinko 导出（source="blinko"）的 readonly 为假，但它的时间存在
    // frontmatter 里、没有行首锚点，写不回去 —— 不过它 isRange 为假，
    // 走的是点线分支，点线的拖拽入口本来就把非 daily 来源挡掉了（DEC-027）。
    if (entry.readonly) {
      block.addClass("is-readonly");
      return;
    }

    // 跨天拖动（DEC-022）：每列带 dataset.dateStr，指针横向进入别的列即换日期。
    // 边缘模式（start / end）只改起止、不允许跨天，免得「调时长」误变成「搬记录」。
    const col = block.parentElement as HTMLElement | null;
    const columns = col && col.parentElement
      ? Array.from(col.parentElement.querySelectorAll(".timenote-block-column")) as HTMLElement[]
      : [];
    const homeDate = entry.dateStr;
    const canMoveDay = !entry.readonly && (!entry.source || entry.source === "daily");

    // 位移 -> 时间增量：弹性轴的斜率逐行不同，用「原位置 + dy」查反函数比
    // 直接 dy/slotHeight 更准；上边缘用起点基准、下边缘用终点基准，手感才不会跳
    const origStart = Number(entry.startSeconds) || 0;
    const origEnd = Number(entry.endSeconds) || origStart + 1800;
    const baseStartY = scale.yOf(origStart);
    const baseEndY = scale.yOf(origEnd);

    // 唯一的可发现性提示：靠近上下沿时光标变 ns-resize，其余是 grab。
    // 不画任何条状把手，也不因为块矮就取消边缘调节。
    block.onpointermove = (ev: PointerEvent) => {
      if (block.hasClass("is-dragging")) return;
      const r = block.getBoundingClientRect();
      const edge = blockEdgeHit(r.height);
      const off = ev.clientY - r.top;
      block.style.cursor = (off <= edge || r.height - off <= edge) ? "ns-resize" : "grab";
    };
    block.onpointerleave = () => {
      if (!block.hasClass("is-dragging")) block.style.cursor = "";
    };

    block.onpointerdown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || (target.closest && target.closest(".timenote-event-block-sub")))) return;

      const rect = block.getBoundingClientRect();
      const offsetY = ev.clientY - rect.top;
      const edge = blockEdgeHit(rect.height);
      // 块高恒等于时间跨度，下沿就是结束时刻；任何高度都能抓上下沿改范围
      let mode = "move";
      if (offsetY <= edge) mode = "start";
      else if (rect.height - offsetY <= edge) mode = "end";

      const startX = ev.clientX;
      const startY = ev.clientY;
      let moved = false;
      let curStart = origStart;
      let curEnd = origEnd;
      let dragDx = 0;
      let targetDate = null;

      const tagSuffix = entry.tags && entry.tags.length > 0 ? ` · #${entry.tags.slice(0, 2).join(" #")}` : "";
      const paint = () => {
        const top = scale.yOf(curStart);
        const spanPx = Math.max(MIN_RENDER_BLOCK_PX, scale.yOf(curEnd) - top);
        block.style.top = `${top}px`;
        block.style.height = `${spanPx}px`;
        block.style.transform = dragDx ? `translateX(${dragDx}px)` : "";
        meta.textContent = `${formatSecondsToTime(curStart)} – ${formatSecondsToTime(curEnd)}${tagSuffix}${targetDate ? ` → ${targetDate}` : ""}`;
        duration.textContent = formatDuration(curEnd - curStart);
      };

      const onMove = (e: PointerEvent) => {
        const dy = e.clientY - startY;
        dragDx = e.clientX - startX;
        // 横向阈值单独放宽到 12px：纯横向拖动才能启动，又不至于轻微抖动就跨天
        if (!moved && Math.abs(dy) < 4 && Math.abs(dragDx) < 12) return;
        if (!moved) {
          moved = true;
          block.addClass("is-dragging");
          block.style.cursor = "grabbing";
          this.hideHoverTooltip();
        }
        // 只有中部平移模式认横向落点；边缘改起止时横向位移一律忽略
        targetDate = (mode === "move" && canMoveDay && Math.abs(dragDx) >= 12)
          ? this.findDropDate(e.clientX, homeDate, columns)
          : null;
        this.markDropDate(columns, targetDate);
        const deltaStart = snapSeconds(scale.secOf(baseStartY + dy) - origStart);
        const deltaEnd = snapSeconds(scale.secOf(baseEndY + dy) - origEnd);
        // 一律夹在可见时间轴内，避免把块拖出 startHour–endHour 后整块消失
        if (mode === "move") {
          const dur = origEnd - origStart;
          curStart = Math.max(scale.dayStartSec, Math.min(scale.dayEndSec - dur, origStart + deltaStart));
          curEnd = curStart + dur;
        } else if (mode === "start") {
          curStart = Math.max(scale.dayStartSec, Math.min(origEnd - MIN_BLOCK_SECONDS, origStart + deltaStart));
          curEnd = origEnd;
        } else {
          curEnd = Math.min(scale.dayEndSec, Math.max(origStart + MIN_BLOCK_SECONDS, origEnd + deltaEnd));
          curStart = origStart;
        }
        paint();
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        block.removeClass("is-dragging");
        block.style.cursor = "";
        this.markDropDate(columns, null);
        if (!moved) return;
        block.dataset.dragMoved = "1";
        window.setTimeout(() => { delete block.dataset.dragMoved; }, 80);
        const moveTo = targetDate;
        dragDx = 0;
        targetDate = null;
        block.style.transform = "";
        if (moveTo) {
          // 换日期时哪怕时刻没变也要提交：先写目标日记、再删原日记那一行
          void this.commitEntryMove(entry, moveTo, curStart, curEnd);
          return;
        }
        if (curStart === origStart && curEnd === origEnd) {
          paint();
          return;
        }
        void this.commitEntryRange(entry, curStart, curEnd);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
  }

  async commitEntryRange(entry, startSec, endSec) {
    const ok = await this.host.updateEntryTime(entry, startSec, endSec);
    if (!ok) {
      this.host.notice("时间范围未写入：找不到目标行，已恢复原状");
      this.renderView();
      return;
    }
    this.host.notice(`已更新：${formatSecondsToTime(startSec)} - ${formatSecondsToTime(endSec)}`);
    this.renderView();
  }

  // 跨天拖动回写（DEC-022）：与只改时刻的两个 commit 分开，失败一律整视图重渲染复原
  async commitEntryMove(entry, targetDate, startSec, endSec) {
    const ok = await this.host.moveEntryToDate(entry, targetDate, startSec, endSec);
    if (!ok) {
      this.host.notice("跨天移动未写入：目标行已变化或来源只读，已恢复原状");
      this.renderView();
      return;
    }
    this.host.notice(`已移动到 ${targetDate}：${formatSecondsToTime(startSec)} - ${formatSecondsToTime(endSec)}`);
    this.renderView();
  }

  async commitEntryPointMove(entry, targetDate, startSec) {
    const ok = await this.host.moveEntryToDate(entry, targetDate, startSec, startSec);
    if (!ok) {
      this.host.notice("跨天移动未写入：目标行已变化或来源只读，已恢复原状");
      this.renderView();
      return;
    }
    this.host.notice(`已移动到 ${targetDate}：${formatSecondsToTime(startSec)}`);
    this.renderView();
  }

  // 时间点线：整条上下拖动只改时刻（DEC-018）。没有边缘命中区、没有拉伸模式，
  // 光标全程 ns-resize，用户不会拿到「把点拖成块」的暗示。
  attachPointDrag(line, entry, timeBadge, scale) {
    // Blinko 等外部来源没有可回写的行首时间前缀：允许查看 / 点击，但不允许拖
    if (entry.readonly || (entry.source && entry.source !== "daily")) {
      line.addClass("is-readonly");
      return;
    }
    const origStart = Number(entry.startSeconds) || 0;
    if (origStart < scale.dayStartSec || origStart > scale.dayEndSec) return;

    // 点线也支持横向拖到别的日期列（DEC-022）：与时间块共用 findDropDate / 落点高亮
    const col = line.parentElement as HTMLElement | null;
    const columns = col && col.parentElement
      ? Array.from(col.parentElement.querySelectorAll(".timenote-block-column")) as HTMLElement[]
      : [];
    const homeDate = entry.dateStr;

    const baseY = scale.yOf(origStart);
    let curStart = origStart;
    line.onpointerdown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startY = ev.clientY;
      let moved = false;
      let dragDx = 0;
      let targetDate = null;

      const onMove = (e: PointerEvent) => {
        const dy = e.clientY - startY;
        dragDx = e.clientX - startX;
        if (!moved && Math.abs(dy) < 4 && Math.abs(dragDx) < 12) return;
        if (!moved) {
          moved = true;
          line.addClass("is-dragging");
          this.hideHoverTooltip();
        }
        targetDate = Math.abs(dragDx) >= 12
          ? this.findDropDate(e.clientX, homeDate, columns)
          : null;
        this.markDropDate(columns, targetDate);
        // 弹性轴行高不等距，位移 → 时刻必须走 scale 反函数（AGENTS 红线 9）
        const raw = scale.secOf(baseY + dy);
        curStart = Math.max(scale.dayStartSec,
          Math.min(scale.dayEndSec, snapSeconds(raw, POINT_SNAP_MINUTES)));
        line.style.top = `${scale.yOf(curStart)}px`;
        line.style.transform = dragDx ? `translateX(${dragDx}px)` : "";
        timeBadge.textContent = formatSecondsToTime(curStart) +
          (targetDate ? ` → ${targetDate.slice(5)}` : "");
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        line.removeClass("is-dragging");
        line.style.transform = "";
        this.markDropDate(columns, null);
        if (!moved) return;
        line.dataset.dragMoved = "1";
        window.setTimeout(() => { delete line.dataset.dragMoved; }, 80);
        const moveTo = targetDate;
        if (moveTo) {
          void this.commitEntryPointMove(entry, moveTo, curStart);
          return;
        }
        if (curStart === origStart) return;
        void this.commitEntryPoint(entry, curStart);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
  }

  async commitEntryPoint(entry, startSec) {
    const ok = await this.host.updateEntryPointTime(entry, startSec);
    if (!ok) {
      this.host.notice("时间点未写入：找不到目标行，已恢复原状");
      this.renderView();
      return;
    }
    this.host.notice(`已更新时间点：${formatSecondsToTime(startSec)}`);
    this.renderView();
  }

  attachAllDayResizer(resizer, header) {
    resizer.onpointerdown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startY = ev.clientY;
      const startH = Math.max(32, Math.min(320, Number(this.host.settings.allDayHeight ?? 36)));
      const containers = Array.from(header.querySelectorAll(".timenote-day-allday-container")) as HTMLElement[];
      let next = startH;

      const apply = (h) => {
        containers.forEach(el => {
          el.style.height = `${h}px`;
          el.style.minHeight = `${h}px`;
          el.style.maxHeight = `${h}px`;
        });
      };

      const onMove = (e: PointerEvent) => {
        next = Math.max(32, Math.min(320, Math.round(startH + (e.clientY - startY))));
        apply(next);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        resizer.removeClass("is-active");
        if (next !== startH) {
          this.host.settings.allDayHeight = next;
          void this.host.saveSettings();
        }
      };

      resizer.addClass("is-active");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
  }

  // ==========================================================================
  // Now Line Clock（当前时间指示线，30s 刷新）
  // ==========================================================================
  startNowClock() {
    this.stopNowClock();
    this.nowLineTimer = window.setInterval(() => this.tickNowLine(), 30000);
  }

  stopNowClock() {
    if (this.nowLineTimer) {
      window.clearInterval(this.nowLineTimer);
      this.nowLineTimer = null;
    }
  }

  tickNowLine() {
    const el = this.nowLineEl;
    if (!el || !el.isConnected) return;
    const now = moment();
    const scale = this.currentTimeScale;
    // 没有 scale 就没有可换算的轴（AGENTS 红线 9）：宁可隐藏，也不回退到手写等距公式
    if (!scale) { el.style.display = "none"; return; }
    const nowSec = now.hours() * 3600 + now.minutes() * 60 + now.seconds();
    if (nowSec < scale.dayStartSec || nowSec > scale.dayEndSec) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.style.top = `${scale.yOf(nowSec)}px`;
    if (this.nowLabelEl) this.nowLabelEl.textContent = now.format("HH:mm");
  }

  // ==========================================================================
  // Timeline / Stream View Renderer
  // ==========================================================================

  renderTimelineView(container) {
    const timeline = container.createEl("div", { cls: "timenote-timeline-view" });
    const dateStr = this.currentDate.format("YYYY-MM-DD");
    const entries = this.filterEntries(this.entriesMap.get(dateStr) || []);

    const group = timeline.createEl("div", { cls: "timenote-timeline-group" });
    const header = group.createEl("div", { cls: "timenote-timeline-date" });
    header.createEl("span", { text: `${this.currentDate.format("YYYY-MM-DD dddd")} (共 ${entries.length} 条记录)` });

    const openDailyLink = header.createEl("a", { text: "打开日记 ↗" });
    openDailyLink.setAttribute("title", `打开 ${dateStr} 日记`);
    openDailyLink.onclick = () => this.openDailyNoteForDate(dateStr);

    if (entries.length === 0) {
      group.createEl("div", { text: "今日暂无记录或时间标记", cls: "text-muted" });
      return;
    }

    entries.sort((a, b) => {
      if (!a.hasTime && b.hasTime) return -1;
      if (a.hasTime && !b.hasTime) return 1;
      return (a.startSeconds || 0) - (b.startSeconds || 0);
    });

    entries.forEach(entry => {
      const srcCls = sourceCssClass(entry.source);
      const item = group.createEl("div", { cls: "timenote-timeline-item" });

      const spanSec = entry.hasTime
        ? (entry.endSeconds || (entry.startSeconds || 0) + 1800) - (entry.startSeconds || 0)
        : 0;
      // 时间点没有时长：不再补一句虚构的「30m」（DEC-018）
      item.createEl("div", {
        text: !entry.hasTime ? "全天"
          : isPointEntry(entry) ? entry.timeStr
          : `${entry.timeStr} · ${formatDuration(spanSec)}`,
        cls: "timenote-timeline-badge"
      });

      item.createEl("div", {
        cls: `timenote-timeline-dot ${entry.isTask ? "is-task" : ""} ${entry.isCompleted ? "is-completed" : ""} ${srcCls}`
      });

      const card = item.createEl("div", { cls: "timenote-timeline-content" });
      if (entry.isTask) {
        const cb = card.createEl("input", {
          cls: "timenote-card-checkbox",
          attr: { type: "checkbox" }
        });
        cb.checked = entry.isCompleted;
        cb.onclick = async (ev) => {
          ev.stopPropagation();
          this.hideHoverTooltip();
          await this.host.toggleTask(entry);
          this.renderView();
        };
      }

      card.createEl("span", {
        text: entry.text,
        cls: entry.isCompleted ? "completed text-muted" : ""
      });

      if (entry.tags && entry.tags.length > 0) {
        const tagsWrap = card.createEl("div", { cls: "timenote-card-tags" });
        entry.tags.forEach(t => {
          const colors = getTagColor(t);
          tagsWrap.createEl("span", {
            text: `#${t}`,
            cls: "timenote-tag-chip",
            style: `background-color: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border};`
          });
        });
      }

      if (entry.subItems && entry.subItems.length > 0) {
        const subList = card.createEl("ul", {
          style: "margin: 6px 0 0 16px; padding: 0; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;"
        });
        entry.subItems.forEach(sub => {
          subList.createEl("li", { text: sub });
        });
      }

      card.onmouseenter = (ev) => {
        this.showHoverTooltip(entry, card, ev);
      };
      card.onmouseleave = () => {
        this.hideHoverTooltip();
      };

      card.onclick = () => {
        this.hideHoverTooltip();
        this.jumpToFileLine(entry);
      };
    });
  }

  // ==========================================================================
  // Month Grid View Renderer
  // ==========================================================================

  renderMonthView(container) {
    const monthContainer = container.createEl("div", { cls: "timenote-month-container" });

    // Weekday headers
    const weekdays = monthContainer.createEl("div", { cls: "timenote-month-weekdays" });
    const weekLabels = this.host.settings.firstDayOfWeek === 1
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];
    weekLabels.forEach(l => weekdays.createEl("div", { text: `周${l}` }));

    // Grid cells
    const grid = monthContainer.createEl("div", { cls: "timenote-month-grid" });
    const startOfMonth = this.currentDate.clone().startOf("month");
    const endOfMonth = this.currentDate.clone().endOf("month");
    const startGrid = startOfMonth.clone().startOf(this.host.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
    const endGrid = endOfMonth.clone().endOf(this.host.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");

    const curr = startGrid.clone();
    while (curr.isSameOrBefore(endGrid, "day")) {
      const dateStr = curr.format("YYYY-MM-DD");
      const isOtherMonth = curr.month() !== this.currentDate.month();
      const isToday = curr.isSame(moment(), "day");
      const entries = this.filterEntries(this.entriesMap.get(dateStr) || []);

      const cell = grid.createEl("div", {
        cls: `timenote-month-cell ${isOtherMonth ? "is-other-month" : ""} ${isToday ? "is-today" : ""}`
      });

      const cellHeader = cell.createEl("div", { cls: "timenote-month-cell-header" });
      cellHeader.createEl("span", { text: curr.format("D") });

      if (entries.length > 0) {
        const taskCount = entries.filter(e => e.isTask).length;
        const memoCount = entries.length - taskCount;
        cellHeader.createEl("span", {
          text: `${entries.length}`,
          cls: "timenote-month-badge",
          attr: { title: `${dateStr}: 共 ${entries.length} 条记录 (${taskCount} 待办, ${memoCount} 闪念)` }
        });
      }

      const itemsWrap = cell.createEl("div", { cls: "timenote-month-items" });

      // Intelligent Item Selection:
      // When viewing "全部", do NOT let repetitive habit tasks crowd out unique flash memos!
      let displayItems = [];
      if (this.currentFilterType === "all") {
        const memosAndTimed = entries.filter(e => !e.isTask || e.hasTime);
        const regularTasks = entries.filter(e => e.isTask && !e.hasTime);

        if (memosAndTimed.length > 0 && regularTasks.length > 0) {
          // Prioritize 2 memos/timed and 1 task
          displayItems = [...memosAndTimed.slice(0, 2), ...regularTasks.slice(0, 1)];
        } else if (memosAndTimed.length > 0) {
          displayItems = memosAndTimed.slice(0, 3);
        } else {
          displayItems = regularTasks.slice(0, 3);
        }
      } else {
        displayItems = entries.slice(0, 3);
      }

      displayItems.forEach(e => {
        const itemPill = itemsWrap.createEl("div", {
          cls: `timenote-month-item-pill ${e.isTask ? "is-task" : "is-memo"} ${e.isCompleted ? "is-completed" : ""} ${sourceCssClass(e.source)}`
        });

        if (e.hasTime) {
          itemPill.createEl("span", { text: e.timeStr.slice(0, 5), cls: "timenote-month-pill-time" });
        } else if (e.isTask) {
          itemPill.createEl("span", { text: e.isCompleted ? "☑" : "☐", cls: "timenote-month-pill-time" });
        } else {
          itemPill.createEl("span", { text: "💡", style: "font-size: 0.65rem;" });
        }

        itemPill.createEl("span", { text: e.text, cls: "timenote-month-pill-text" });

        // Hover Preview on Pill
        itemPill.onmouseenter = (ev) => {
          ev.stopPropagation();
          this.showHoverTooltip(e, itemPill, ev);
        };
        itemPill.onmouseleave = (ev) => {
          ev.stopPropagation();
          this.hideHoverTooltip();
        };

        itemPill.onclick = (ev) => {
          ev.stopPropagation();
          this.hideHoverTooltip();
          this.jumpToFileLine(e);
        };
      });

      // Show "+N" badge if more items exist
      if (entries.length > displayItems.length) {
        const moreCount = entries.length - displayItems.length;
        itemsWrap.createEl("div", {
          text: `+${moreCount} 项`,
          cls: "timenote-month-more-badge",
          attr: { title: `还有 ${moreCount} 项记录，点击下钻至该日查看全部` }
        });
      }

      const clickDate = curr.clone();
      cell.onclick = () => {
        this.hideHoverTooltip();
        this.currentDate = clickDate;
        this.currentViewMode = "day";
        this.renderView();
      };

      curr.add(1, "day");
    }
  }

  // ==========================================================================
  // Quarter View Renderer (3个月全景)
  // ==========================================================================

  renderQuarterView(container) {
    const quarterContainer = container.createEl("div", { cls: "timenote-quarter-container" });
    const currentQ = this.currentDate.quarter();
    const year = this.currentDate.year();

    // Stats
    let totalEntries = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let totalMemos = 0;
    let activeDays = 0;

    for (const [_, entries] of this.entriesMap.entries()) {
      const filtered = this.filterEntries(entries);
      if (filtered.length > 0) {
        activeDays++;
        totalEntries += filtered.length;
        filtered.forEach(e => {
          if (e.isTask) {
            totalTasks++;
            if (e.isCompleted) completedTasks++;
          } else {
            totalMemos++;
          }
        });
      }
    }

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    // 1. Quarter Banner
    const banner = quarterContainer.createEl("div", { cls: "timenote-quarter-banner" });
    const bannerLeft = banner.createEl("div");
    bannerLeft.createEl("h3", { text: `🎯 ${year}年 第${currentQ}季度全景回顾`, style: "margin: 0 0 4px 0;" });
    bannerLeft.createEl("div", {
      text: `覆盖 ${year}年${(currentQ - 1) * 3 + 1}月 至 ${year}年${currentQ * 3}月 · 记录活跃天数: ${activeDays} 天`,
      cls: "text-muted",
      style: "font-size: 0.8rem;"
    });

    const bannerRight = banner.createEl("div", { cls: "timenote-stats-badge", style: "gap: 8px; font-size: 0.82rem;" });
    bannerRight.createEl("span", { text: `📝 条目: ` }).createEl("strong", { text: `${totalEntries}` });
    bannerRight.createEl("span", { text: ` · ✅ 待办: ` }).createEl("strong", { text: `${completedTasks}/${totalTasks} (${completionRate}%)` });
    bannerRight.createEl("span", { text: ` · 💡 闪念: ` }).createEl("strong", { text: `${totalMemos}` });

    // 2. Quarter Grid (3 Month Cards)
    const grid = quarterContainer.createEl("div", { cls: "timenote-quarter-grid" });
    const startMonthIndex = (currentQ - 1) * 3;

    for (let offset = 0; offset < 3; offset++) {
      const monthMoment = moment().year(year).month(startMonthIndex + offset).startOf("month");
      const monthNum = monthMoment.month() + 1;
      const card = grid.createEl("div", { cls: "timenote-quarter-month-card" });

      // Count for this month
      let monthCount = 0;
      const daysInMonth = monthMoment.daysInMonth();
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = monthMoment.clone().date(d).format("YYYY-MM-DD");
        monthCount += (this.filterEntries(this.entriesMap.get(dStr) || [])).length;
      }

      const cardHeader = card.createEl("div", { cls: "timenote-quarter-month-title", style: "cursor: pointer;" });
      cardHeader.createEl("span", { text: `${monthNum}月 (${monthMoment.format("MMMM")})` });
      cardHeader.createEl("span", { text: `${monthCount} 条记录 ↗`, cls: "timenote-month-badge" });
      cardHeader.onclick = () => {
        this.currentDate = monthMoment.clone();
        this.currentViewMode = "month";
        this.renderView();
      };

      // Mini Weekday Headers
      const weekdaysRow = card.createEl("div", { cls: "timenote-mini-month-grid", style: "font-weight: 600; color: var(--text-muted); margin-bottom: 4px;" });
      const weekLabels = this.host.settings.firstDayOfWeek === 1 ? ["一", "二", "三", "四", "五", "六", "日"] : ["日", "一", "二", "三", "四", "五", "六"];
      weekLabels.forEach(w => weekdaysRow.createEl("div", { text: w }));

      // Mini Month Day Grid
      const miniGrid = card.createEl("div", { cls: "timenote-mini-month-grid" });
      const firstDay = monthMoment.clone().startOf("month");
      let dayOfWeek = firstDay.day();
      if (this.host.settings.firstDayOfWeek === 1) {
        dayOfWeek = (dayOfWeek + 6) % 7;
      }

      // Empty cells before month start
      for (let pad = 0; pad < dayOfWeek; pad++) {
        miniGrid.createEl("div", { cls: "timenote-mini-cell", style: "pointer-events: none;" });
      }

      // Days 1..daysInMonth
      for (let day = 1; day <= daysInMonth; day++) {
        const dMom = monthMoment.clone().date(day);
        const dStr = dMom.format("YYYY-MM-DD");
        const dEntries = this.filterEntries(this.entriesMap.get(dStr) || []);
        const isToday = dMom.isSame(moment(), "day");
        const hasEvents = dEntries.length > 0;

        const cell = miniGrid.createEl("div", {
          cls: `timenote-mini-cell ${hasEvents ? "has-events" : ""} ${isToday ? "is-today" : ""}`,
          text: `${day}`
        });

        if (hasEvents) {
          cell.createEl("div", { cls: "timenote-mini-cell-dot" });
          const taskCount = dEntries.filter(e => e.isTask).length;
          const memoCount = dEntries.length - taskCount;
          cell.setAttribute("title", `${dStr}: 共 ${dEntries.length} 条记录 (${taskCount} 待办, ${memoCount} 闪念)`);
        } else {
          cell.setAttribute("title", dStr);
        }

        cell.onclick = () => {
          this.currentDate = dMom;
          this.currentViewMode = "day";
          this.renderView();
        };
      }
    }
  }

  // ==========================================================================
  // Year View Renderer (12个月热力全景)
  // ==========================================================================

  renderYearView(container) {
    const yearContainer = container.createEl("div", { cls: "timenote-year-container" });
    const year = this.currentDate.year();

    // Stats
    let totalEntries = 0;
    let totalTasks = 0;
    let completedTasks = 0;
    let totalMemos = 0;
    let activeDays = 0;

    for (const [_, entries] of this.entriesMap.entries()) {
      const filtered = this.filterEntries(entries);
      if (filtered.length > 0) {
        activeDays++;
        totalEntries += filtered.length;
        filtered.forEach(e => {
          if (e.isTask) {
            totalTasks++;
            if (e.isCompleted) completedTasks++;
          } else {
            totalMemos++;
          }
        });
      }
    }

    // 1. Year Banner
    const banner = yearContainer.createEl("div", { cls: "timenote-year-banner" });
    const bannerLeft = banner.createEl("div");
    bannerLeft.createEl("h3", { text: `📅 ${year}年度 时间足迹全景`, style: "margin: 0 0 4px 0;" });
    bannerLeft.createEl("div", {
      text: `全年记录活跃天数: ${activeDays} / 365 天 · 活跃度: ${Math.round((activeDays / 365) * 100)}%`,
      cls: "text-muted",
      style: "font-size: 0.8rem;"
    });

    const bannerRight = banner.createEl("div", { cls: "timenote-stats-badge", style: "gap: 8px; font-size: 0.82rem;" });
    bannerRight.createEl("span", { text: `📝 累计条目: ` }).createEl("strong", { text: `${totalEntries}` });
    bannerRight.createEl("span", { text: ` · ✅ 待办完成: ` }).createEl("strong", { text: `${completedTasks}/${totalTasks}` });
    bannerRight.createEl("span", { text: ` · 💡 灵感闪念: ` }).createEl("strong", { text: `${totalMemos}` });

    // Heatmap Legend row
    const legendRow = yearContainer.createEl("div", {
      style: "display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 0.72rem; color: var(--text-muted); margin-top: -6px;"
    });
    legendRow.createEl("span", { text: "记录活跃度：" });
    legendRow.createEl("span", { text: "少" });
    for (let heat = 0; heat <= 4; heat++) {
      legendRow.createEl("span", {
        cls: `timenote-heat-${heat}`,
        style: "width: 12px; height: 12px; border-radius: 2px; border: 1px solid var(--background-modifier-border); display: inline-block;"
      });
    }
    legendRow.createEl("span", { text: "多" });

    // 2. 12-Month Heatmap Grid
    const grid = yearContainer.createEl("div", { cls: "timenote-year-grid" });

    for (let m = 0; m < 12; m++) {
      const monthMoment = moment().year(year).month(m).startOf("month");
      const monthNum = m + 1;
      const card = grid.createEl("div", { cls: "timenote-year-month-card" });

      // Count entries for this month
      let monthCount = 0;
      const daysInMonth = monthMoment.daysInMonth();
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = monthMoment.clone().date(d).format("YYYY-MM-DD");
        monthCount += (this.filterEntries(this.entriesMap.get(dStr) || [])).length;
      }

      const cardHeader = card.createEl("div", { cls: "timenote-year-month-header" });
      cardHeader.createEl("span", { text: `${monthNum}月` });
      if (monthCount > 0) {
        cardHeader.createEl("span", { text: `${monthCount}`, cls: "timenote-month-badge" });
      }
      cardHeader.onclick = () => {
        this.currentDate = monthMoment.clone();
        this.currentViewMode = "month";
        this.renderView();
      };

      // Weekday abbreviations
      const weekdaysRow = card.createEl("div", { cls: "timenote-mini-month-grid", style: "font-size: 0.65rem; color: var(--text-muted); margin-bottom: 2px;" });
      const weekLabels = this.host.settings.firstDayOfWeek === 1 ? ["一", "二", "三", "四", "五", "六", "日"] : ["日", "一", "二", "三", "四", "五", "六"];
      weekLabels.forEach(w => weekdaysRow.createEl("div", { text: w }));

      // Days grid
      const miniGrid = card.createEl("div", { cls: "timenote-mini-month-grid" });
      const firstDay = monthMoment.clone().startOf("month");
      let dayOfWeek = firstDay.day();
      if (this.host.settings.firstDayOfWeek === 1) {
        dayOfWeek = (dayOfWeek + 6) % 7;
      }

      // Pad before 1st
      for (let pad = 0; pad < dayOfWeek; pad++) {
        miniGrid.createEl("div", { cls: "timenote-mini-cell", style: "pointer-events: none;" });
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dMom = monthMoment.clone().date(day);
        const dStr = dMom.format("YYYY-MM-DD");
        const dEntries = this.filterEntries(this.entriesMap.get(dStr) || []);
        const isToday = dMom.isSame(moment(), "day");
        const count = dEntries.length;

        // Heat class
        let heatClass = "timenote-heat-0";
        if (count >= 10) heatClass = "timenote-heat-4";
        else if (count >= 6) heatClass = "timenote-heat-3";
        else if (count >= 3) heatClass = "timenote-heat-2";
        else if (count >= 1) heatClass = "timenote-heat-1";

        const cell = miniGrid.createEl("div", {
          cls: `timenote-mini-cell ${heatClass} ${isToday ? "is-today" : ""}`,
          text: `${day}`
        });

        if (count > 0) {
          cell.setAttribute("title", `${dStr}: ${count}条记录`);
        } else {
          cell.setAttribute("title", dStr);
        }

        cell.onclick = () => {
          this.currentDate = dMom;
          this.currentViewMode = "day";
          this.renderView();
        };
      }
    }
  }

  // Jump to specific line in daily note file
  async jumpToFileLine(entry) {
    return this.host.openEntry(entry);
  }

  // 打开某一天的日记：存在则直接打开，不存在时按 QuickAdd 的目录规则创建后再打开（DEC-017）。
  // 日 / 3 天 / 周视图的日期标题、时间线视图的「打开日记 ↗」共用这一入口。
  async openDailyNoteForDate(dateStr: string) {
    // 找 / 建 / 打开日记都属宿主能力（DEC-017 的规则由 adapter 实现）
    return this.host.openDailyNote(dateStr);
  }
}
