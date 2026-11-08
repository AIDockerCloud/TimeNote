// TimeNote 源码：TypeScript 入口，构建产物为根目录 main.js
// 请修改本文件后执行 npm run build，不要直接编辑 main.js
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

// 渐进类型化：现有实现大量依赖运行时动态挂载的实例属性。
// 先以索引签名放行，后续按模块逐步替换为显式字段与具体类型。
declare global {
  interface DomElementInfo {
    style?: string;
  }
}

const VIEW_TYPE_TIMENOTE = "timenote-calendar-view";

const DEFAULT_SETTINGS = {
  periodicNotesFolder: "SpiralNotes",
  includeBlinko: true,
  defaultView: "week", // 'day', '3day', 'week', 'month', 'quarter', 'year', 'timeline'
  startHour: 0,
  endHour: 24,
  slotHeight: 52,
  firstDayOfWeek: 1, // 1: Monday, 0: Sunday
  parseAllBullets: true,
  quickAddSection: "灵感闪念"
};

// Deterministic tag color generator
function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsla(${hue}, 70%, 50%, 0.15)`,
    text: `hsl(${hue}, 75%, 45%)`,
    border: `hsla(${hue}, 70%, 50%, 0.3)`
  };
}

function formatSecondsToTime(sec) {
  const clamped = Math.max(0, Math.min(86400, sec));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ============================================================================
// Parser & Data Engine
// ============================================================================

function parseLine(line, lineNum, dateStr, filePath, inMemoSection = false) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---") || trimmed.startsWith("```")) {
    return null;
  }

  // Check if task checkbox
  const taskMatch = line.match(/^(\s*[-*+]?\s*)\[([ xX\-\/])\]\s*(.*)$/);
  const isTask = !!taskMatch;
  const isCompleted = isTask && (taskMatch[2] === 'x' || taskMatch[2] === 'X');

  // Extract core content after bullet/checkbox
  let content = isTask ? taskMatch[3] : line.replace(/^\s*[-*+]?\s*/, '').trim();

  // Time range regex: e.g. 14:00:00-15:30:00, 14:00-15:30, 09:30 ~ 11:00, 14:00至15:00
  const rangeRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~至到/]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/;
  // Single time regex: e.g. 14:00:31, 14:00, 09:15
  const singleRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/;

  let hasTime = false;
  let startMinutes = 0;
  let endMinutes = 0;
  let startSeconds = 0;
  let endSeconds = 0;
  let timeStr = "";

  const rangeMatch = content.match(rangeRegex);
  if (rangeMatch) {
    hasTime = true;
    const sh = parseInt(rangeMatch[1], 10);
    const sm = parseInt(rangeMatch[2], 10);
    const ss1 = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 0;
    const eh = parseInt(rangeMatch[4], 10);
    const em = parseInt(rangeMatch[5], 10);
    const ss2 = rangeMatch[6] ? parseInt(rangeMatch[6], 10) : 0;

    startSeconds = sh * 3600 + sm * 60 + ss1;
    endSeconds = eh * 3600 + em * 60 + ss2;
    startMinutes = Math.floor(startSeconds / 60);
    endMinutes = Math.floor(endSeconds / 60);

    const hasSeconds = !!(rangeMatch[3] || rangeMatch[6]);
    const startPart = hasSeconds
      ? `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:${String(ss1).padStart(2, '0')}`
      : `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    const endPart = hasSeconds
      ? `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:${String(ss2).padStart(2, '0')}`
      : `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

    timeStr = `${startPart} - ${endPart}`;
    content = content.replace(rangeMatch[0], ' ').trim();
  } else {
    const singleMatch = content.match(singleRegex);
    if (singleMatch) {
      hasTime = true;
      const sh = parseInt(singleMatch[1], 10);
      const sm = parseInt(singleMatch[2], 10);
      const ss = singleMatch[3] ? parseInt(singleMatch[3], 10) : 0;

      startSeconds = sh * 3600 + sm * 60 + ss;
      startMinutes = Math.floor(startSeconds / 60);

      // Check duration tag e.g. 30m, 1h, 45min
      const durationMatch = content.match(/(?:^|\s)(\d+)(m|min|h|小时|分钟)(?:\s|$)/i);
      let durationSeconds = 1800; // default 30 min duration
      if (durationMatch) {
        const val = parseInt(durationMatch[1], 10);
        const unit = durationMatch[2].toLowerCase();
        durationSeconds = (unit.startsWith('h') || unit === '小时') ? val * 3600 : val * 60;
        content = content.replace(durationMatch[0], ' ').trim();
      }
      endSeconds = Math.min(86400, startSeconds + durationSeconds);
      endMinutes = Math.floor(endSeconds / 60);

      if (singleMatch[3]) {
        timeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      } else {
        timeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
      }
      content = content.replace(singleMatch[0], ' ').trim();
    }
  }

  // Remove block reference ^1770058242
  content = content.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '').trim();
  // Remove task completion date ✅ 2026-02-24
  content = content.replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trim();

  // Extract tags
  const tags = [];
  content = content.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (_, t) => {
    tags.push(t);
    return "";
  }).trim();

  // If no time, only parse if it's a task, explicit list bullet, OR inside a designated memo section
  if (!hasTime) {
    if (!isTask && !line.trim().startsWith('-') && !line.trim().startsWith('*') && !line.trim().startsWith('+') && !inMemoSection) {
      return null;
    }
  }

  const displayText = content || (tags.length > 0 ? tags.map(t => '#' + t).join(' ') : (isTask ? "待办事项" : "随手记录"));

  return {
    id: `${filePath}#L${lineNum}`,
    filePath,
    dateStr,
    lineNum,
    rawLine: line,
    isTask,
    isCompleted,
    hasTime,
    startSeconds,
    endSeconds,
    startMinutes,
    endMinutes,
    timeStr,
    text: displayText,
    tags,
    subItems: [],
    source: "daily"
  };
}

class DailyNoteService {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.fileCache = new Map(); // filePath -> { mtime, entries }
    this.dailyNoteIndex = new Map(); // dateStr -> TFile
    this.indexBuiltTime = 0;
  }

  buildIndexIfNeeded() {
    const now = Date.now();
    if (this.dailyNoteIndex.size > 0 && (now - this.indexBuiltTime < 5000)) {
      return;
    }
    this.dailyNoteIndex.clear();
    const files = this.app.vault.getMarkdownFiles();
    const folder = (this.settings.periodicNotesFolder || "SpiralNotes").toLowerCase();

    for (const f of files) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(f.basename)) {
        const inFolder = f.path.toLowerCase().includes(folder);
        if (inFolder || !this.dailyNoteIndex.has(f.basename)) {
          this.dailyNoteIndex.set(f.basename, f);
        }
      }
    }
    this.indexBuiltTime = now;
  }

  // Find daily note file for a specific date (YYYY-MM-DD)
  findDailyNoteFile(dateStr) {
    this.buildIndexIfNeeded();
    return this.dailyNoteIndex.get(dateStr) || null;
  }

  // Parse a single daily note file (only top-level items, skip/attach sub-items)
  async parseDailyFile(file, dateStr) {
    const cached = this.fileCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) {
      return cached.entries;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const entries = [];
    let currentParent = null;
    let currentSection = "";

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      // Skip codeblocks, frontmatter delimiters, obsidian comments
      if (!trimmed || trimmed.startsWith("---") || trimmed.startsWith("```") || trimmed.startsWith("%%")) {
        currentParent = null;
        continue;
      }

      // Track section headings (e.g. ## 灵感闪念, ## 任务计划)
      if (trimmed.startsWith("#")) {
        currentSection = trimmed.replace(/^#+\s*/, '').trim();
        currentParent = null;
        continue;
      }

      // Check if this line is an indented sub-item (starts with tab or 2+ spaces before list symbol)
      const isSubItem = /^(?:\t+| {2,})/.test(rawLine);

      if (isSubItem) {
        // Child item: append to parent's subItems for context, do NOT create standalone entry
        if (currentParent) {
          const cleanSub = trimmed.replace(/^[-*+]\s*(?:\[[ xX\-\/]\]\s*)?/, '').trim();
          if (cleanSub) {
            currentParent.subItems.push(cleanSub);
          }
        }
        continue;
      }

      // Top-level main item
      const inMemoSection = currentSection.includes("灵感") || currentSection.includes("闪念") || currentSection.includes("Inspirations") || currentSection.includes("Memos");
      const entry = parseLine(rawLine, i + 1, dateStr, file.path, inMemoSection);
      if (entry) {
        entries.push(entry);
        currentParent = entry;
      } else {
        currentParent = null;
      }
    }

    this.fileCache.set(file.path, { mtime: file.stat.mtime, entries });
    return entries;
  }

  // Parse Blinko note
  async parseBlinkoFile(file) {
    const cached = this.fileCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) {
      return cached.entry;
    }

    const content = await this.app.vault.read(file);
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const yaml = fmMatch[1];
    const dateMatch = yaml.match(/date:\s*(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!dateMatch) return null;

    const dateStr = dateMatch[1];
    const sh = parseInt(dateMatch[2], 10);
    const sm = parseInt(dateMatch[3], 10);
    const ss = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
    const startSeconds = sh * 3600 + sm * 60 + ss;
    const endSeconds = Math.min(86400, startSeconds + 1800);
    const startMinutes = Math.floor(startSeconds / 60);
    const endMinutes = Math.floor(endSeconds / 60);
    const timeStr = dateMatch[4]
      ? `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;

    // Extract tags from yaml or body
    const tags = [];
    const tagMatch = yaml.match(/tags:\s*\[(.*?)\]/);
    if (tagMatch && tagMatch[1]) {
      tagMatch[1].split(',').forEach(t => {
        const clean = t.trim().replace(/^['"]|['"]$/g, '');
        if (clean) tags.push(clean);
      });
    }

    // Clean body
    let body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
    body = body.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (_, t) => {
      if (!tags.includes(t)) tags.push(t);
      return "";
    }).trim();

    const entry = {
      id: `${file.path}#blinko`,
      filePath: file.path,
      dateStr,
      lineNum: 1,
      rawLine: body,
      isTask: false,
      isCompleted: false,
      hasTime: true,
      startSeconds,
      endSeconds,
      startMinutes,
      endMinutes,
      timeStr,
      text: body.slice(0, 80) || (tags.length > 0 ? tags.map(t => '#' + t).join(' ') : "Blinko 闪念"),
      tags,
      subItems: [],
      source: "blinko"
    };

    this.fileCache.set(file.path, { mtime: file.stat.mtime, entry });
    return entry;
  }

  // Scan entries for a date range [startMoment, endMoment]
  async getEntriesForRange(startMoment, endMoment) {
    this.buildIndexIfNeeded();
    const results = new Map(); // dateStr -> TimeEntry[]
    const curr = startMoment.clone();

    while (curr.isSameOrBefore(endMoment, 'day')) {
      const dateStr = curr.format('YYYY-MM-DD');
      const file = this.findDailyNoteFile(dateStr);
      let dayEntries = [];

      if (file) {
        dayEntries = await this.parseDailyFile(file, dateStr);
      }
      results.set(dateStr, [...dayEntries]);
      curr.add(1, 'day');
    }

    // Optional Blinko notes integration
    if (this.settings.includeBlinko) {
      const allFiles = this.app.vault.getMarkdownFiles();
      const blinkoFiles = allFiles.filter(f => f.path.startsWith('Blinko/Notes') || f.path.includes('Blinko'));

      for (const bf of blinkoFiles) {
        const bEntry = await this.parseBlinkoFile(bf);
        if (bEntry && results.has(bEntry.dateStr)) {
          results.get(bEntry.dateStr).push(bEntry);
        }
      }
    }

    return results;
  }

  // Toggle task status [ ] <-> [x] in source note
  async toggleTask(entry) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const targetIdx = entry.lineNum - 1;

    if (targetIdx >= 0 && targetIdx < lines.length) {
      const line = lines[targetIdx];
      let newLine = line;
      if (line.includes('[ ]')) {
        newLine = line.replace('[ ]', '[x]');
        entry.isCompleted = true;
      } else if (line.includes('[x]') || line.includes('[X]')) {
        newLine = line.replace(/\[[xX]\]/, '[ ]');
        entry.isCompleted = false;
      }
      lines[targetIdx] = newLine;
      await this.app.vault.modify(file, lines.join('\n'));
      this.fileCache.delete(file.path);
    }
  }

  // Append new entry to daily note
  async addEntry(dateStr, timeStr, content, isTask, tags = []) {
    let file = this.findDailyNoteFile(dateStr);
    const tagPart = tags.length > 0 ? ' ' + tags.map(t => '#' + t).join(' ') : '';
    const linePrefix = isTask ? '- [ ] ' : '- ';
    const timePrefix = timeStr ? `${timeStr} ` : '';
    const newLine = `${linePrefix}${timePrefix}${content}${tagPart}`;

    if (!file) {
      const m = window.moment(dateStr);
      const year = m.format('YYYY');
      const month = m.format('MM');
      const targetFolder = `${this.settings.periodicNotesFolder}/${year}/Daily/${month}`;

      const parts = targetFolder.split('/');
      let currPath = "";
      for (const p of parts) {
        currPath = currPath ? `${currPath}/${p}` : p;
        if (!await this.app.vault.adapter.exists(currPath)) {
          await this.app.vault.createFolder(currPath);
        }
      }

      const newPath = `${targetFolder}/${dateStr}.md`;
      const initialText = `# ${dateStr}\n\n## ${this.settings.quickAddSection}\n${newLine}\n`;
      file = await this.app.vault.create(newPath, initialText);
      this.dailyNoteIndex.set(dateStr, file);
    } else {
      let fileText = await this.app.vault.read(file);
      const sectionHeader = `## ${this.settings.quickAddSection}`;
      if (fileText.includes(sectionHeader)) {
        fileText = fileText.replace(sectionHeader, `${sectionHeader}\n${newLine}`);
      } else {
        fileText = fileText.trimEnd() + `\n\n${sectionHeader}\n${newLine}\n`;
      }
      await this.app.vault.modify(file, fileText);
    }
    this.fileCache.delete(file.path);
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

class TimenoteView extends ItemView {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentDate = window.moment();
    this.currentViewMode = plugin.settings.defaultView || "week";
    this.currentFilterType = "all"; // 'all', 'task', 'memo', 'blinko'
    this.searchQuery = "";
    this.entriesMap = new Map();
    this.currentTooltip = null;
  }

  getViewType() {
    return VIEW_TYPE_TIMENOTE;
  }

  getDisplayText() {
    return "时间笔记日历 (TimeNote)";
  }

  getIcon() {
    return "calendar-clock";
  }

  async onOpen() {
    this.registerEvent(
      this.app.vault.on("modify", () => {
        this.renderView();
      })
    );

    await this.renderView();
  }

  async onClose() {
    this.hideHoverTooltip();
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
        text: entry.source === "blinko" ? "🟣 Blinko" : "📝 灵感闪念",
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

    // Footer
    const footer = tooltip.createEl("div", { cls: "timenote-hover-footer" });
    const fileName = entry.filePath ? entry.filePath.split(/[\\/]/).pop() : "";
    footer.createEl("span", { text: `📄 ${fileName} #L${entry.lineNum}` });
    footer.createEl("span", { text: "💡 点击定位日记", style: "color: var(--color-accent);" });

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

    this.entriesMap = await this.plugin.dailyNoteService.getEntriesForRange(startMoment, endMoment);
  }

  async renderView() {
    this.hideHoverTooltip();

    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("timenote-container");

    await this.refreshData();

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
        this.currentDate = window.moment().startOf(this.plugin.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
      } else {
        this.currentDate = window.moment();
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
          this.currentDate = this.currentDate.clone().startOf(this.plugin.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
        }
        this.currentViewMode = m.id;
        this.renderView();
      };
    });

    // Quick Add Button
    const addBtn = actions.createEl("button", { text: "+ 记一条", cls: "timenote-btn-primary" });
    addBtn.onclick = () => {
      new QuickAddModal(this.app, this.plugin, this.currentDate.format("YYYY-MM-DD"), () => {
        this.renderView();
      }).open();
    };

    // Refresh Button
    const refreshBtn = actions.createEl("button", { cls: "clickable-icon" });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.onclick = () => {
      this.plugin.dailyNoteService.fileCache.clear();
      this.plugin.dailyNoteService.dailyNoteIndex.clear();
      this.renderView();
      new Notice("已刷新时间笔记数据！");
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
      { id: "blinko", label: "Blinko" }
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
    } else if (this.currentFilterType === "blinko") {
      result = result.filter(e => e.source === "blinko");
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
    const wrapper = container.createEl("div", { cls: "timenote-timegrid-wrapper" });

    // 1. Fixed Header: Dedicated Day column for EACH day (Title on top, that day's all-day box below)
    const header = wrapper.createEl("div", { cls: "timenote-timegrid-header" });
    const headerDays = header.createEl("div", { cls: "timenote-header-days" });

    days.forEach(d => {
      const dateStr = d.format("YYYY-MM-DD");
      const isToday = d.isSame(window.moment(), "day");

      const dayCol = headerDays.createEl("div", {
        cls: `timenote-header-day-col ${isToday ? "is-today" : ""}`
      });

      // Top: Day Title
      const titleRow = dayCol.createEl("div", { cls: "timenote-day-title-row" });
      titleRow.createEl("span", { text: d.format("ddd"), cls: "timenote-day-name" });
      titleRow.createEl("span", { text: d.format("D"), cls: "timenote-day-num" });
      titleRow.onclick = () => {
        this.currentDate = d;
        this.currentViewMode = "day";
        this.renderView();
      };

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
            await this.plugin.dailyNoteService.toggleTask(entry);
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
            new SubItemsModal(this.app, entry).open();
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
      const isToday = d.isSame(window.moment(), "day");
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
          new QuickAddModal(this.app, this.plugin, dateStr, () => {
            this.renderView();
          }, "09:00").open();
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
            new QuickAddModal(this.app, this.plugin, dateStr, () => {
              this.renderView();
            }, gapStartStr.slice(0, 5)).open();
          };
        }

        // Render Event as a Line Row (展示为线，线周围标识具体时间点，一行一个，不要并列，精确到秒)
        const isBlinko = entry.source === "blinko";
        const lineRow = col.createEl("div", {
          cls: `timenote-time-line-row ${entry.isTask ? "is-task" : "is-memo"} ${entry.isCompleted ? "is-completed" : ""} ${isBlinko ? "is-blinko" : ""}`
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
            await this.plugin.dailyNoteService.toggleTask(entry);
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
            new SubItemsModal(this.app, entry).open();
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

        lastEndSec = entry.endSeconds || (entryStartSec + 1800);
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
          new QuickAddModal(this.app, this.plugin, dateStr, () => {
            this.renderView();
          }, gapStartStr.slice(0, 5)).open();
        };
      }
    });

    // Sync scrollbar width to header
    requestAnimationFrame(() => {
      const scrollbarWidth = scrollArea.offsetWidth - scrollArea.clientWidth;
      if (scrollbarWidth > 0) {
        header.style.paddingRight = `${scrollbarWidth}px`;
      } else {
        header.style.paddingRight = "0px";
      }
    });
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
    openDailyLink.onclick = () => {
      const file = this.plugin.dailyNoteService.findDailyNoteFile(dateStr);
      if (file) this.app.workspace.getLeaf().openFile(file);
    };

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
      const isBlinko = entry.source === "blinko";
      const item = group.createEl("div", { cls: "timenote-timeline-item" });

      item.createEl("div", {
        text: entry.hasTime ? entry.timeStr : "全天",
        cls: "timenote-timeline-badge"
      });

      item.createEl("div", {
        cls: `timenote-timeline-dot ${entry.isTask ? "is-task" : ""} ${entry.isCompleted ? "is-completed" : ""} ${isBlinko ? "is-blinko" : ""}`
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
          await this.plugin.dailyNoteService.toggleTask(entry);
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
    const weekLabels = this.plugin.settings.firstDayOfWeek === 1
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["日", "一", "二", "三", "四", "五", "六"];
    weekLabels.forEach(l => weekdays.createEl("div", { text: `周${l}` }));

    // Grid cells
    const grid = monthContainer.createEl("div", { cls: "timenote-month-grid" });
    const startOfMonth = this.currentDate.clone().startOf("month");
    const endOfMonth = this.currentDate.clone().endOf("month");
    const startGrid = startOfMonth.clone().startOf(this.plugin.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");
    const endGrid = endOfMonth.clone().endOf(this.plugin.settings.firstDayOfWeek === 1 ? "isoWeek" : "week");

    const curr = startGrid.clone();
    while (curr.isSameOrBefore(endGrid, "day")) {
      const dateStr = curr.format("YYYY-MM-DD");
      const isOtherMonth = curr.month() !== this.currentDate.month();
      const isToday = curr.isSame(window.moment(), "day");
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
        const isBlinko = e.source === "blinko";
        const itemPill = itemsWrap.createEl("div", {
          cls: `timenote-month-item-pill ${e.isTask ? "is-task" : "is-memo"} ${e.isCompleted ? "is-completed" : ""} ${isBlinko ? "is-blinko" : ""}`
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
      const monthMoment = window.moment().year(year).month(startMonthIndex + offset).startOf("month");
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
      const weekLabels = this.plugin.settings.firstDayOfWeek === 1 ? ["一", "二", "三", "四", "五", "六", "日"] : ["日", "一", "二", "三", "四", "五", "六"];
      weekLabels.forEach(w => weekdaysRow.createEl("div", { text: w }));

      // Mini Month Day Grid
      const miniGrid = card.createEl("div", { cls: "timenote-mini-month-grid" });
      const firstDay = monthMoment.clone().startOf("month");
      let dayOfWeek = firstDay.day();
      if (this.plugin.settings.firstDayOfWeek === 1) {
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
        const isToday = dMom.isSame(window.moment(), "day");
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
      const monthMoment = window.moment().year(year).month(m).startOf("month");
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
      const weekLabels = this.plugin.settings.firstDayOfWeek === 1 ? ["一", "二", "三", "四", "五", "六", "日"] : ["日", "一", "二", "三", "四", "五", "六"];
      weekLabels.forEach(w => weekdaysRow.createEl("div", { text: w }));

      // Days grid
      const miniGrid = card.createEl("div", { cls: "timenote-mini-month-grid" });
      const firstDay = monthMoment.clone().startOf("month");
      let dayOfWeek = firstDay.day();
      if (this.plugin.settings.firstDayOfWeek === 1) {
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
        const isToday = dMom.isSame(window.moment(), "day");
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
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) return;

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: Math.max(0, entry.lineNum - 1) } });
  }
}

// ============================================================================
// Quick Add Modal
// ============================================================================

class QuickAddModal extends Modal {
  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;
  constructor(app, plugin, defaultDate, onSaved, prefillTime = "") {
    super(app);
    this.plugin = plugin;
    this.targetDate = defaultDate;
    this.timeStr = prefillTime || window.moment().format("HH:mm:ss");
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
    timeInput.oninput = (e) => this.timeStr = (e.target as HTMLInputElement).value;

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
      const tags = this.tagsStr.split(/[,，\s]+/).filter(t => t.trim().length > 0);
      await this.plugin.dailyNoteService.addEntry(
        this.targetDate,
        this.timeStr.trim(),
        this.content.trim(),
        this.isTask,
        tags
      );
      new Notice(`✅ 已成功记录到 ${this.targetDate} 日记中！`);
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
    containerEl.createEl("h2", { text: "TimeNote (时间笔记) 设置" });

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
      .setDesc("快捷记录添加新条目时，日记中默认追加在哪个二级标题下方。")
      .addText(text => text
        .setPlaceholder("灵感闪念")
        .setValue(this.plugin.settings.quickAddSection)
        .onChange(async (val) => {
          this.plugin.settings.quickAddSection = val.trim() || "灵感闪念";
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
        new QuickAddModal(this.app, this, window.moment().format("YYYY-MM-DD"), () => {
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
