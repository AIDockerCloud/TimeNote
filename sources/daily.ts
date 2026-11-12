// sources/daily.ts — 本地周期笔记（日记）数据源（DEC-026）
//
// 这是**第一个可写的 NoteSource**。在此之前 memos / blinko 两个来源都是只读的，
// 契约里的 5 个写方法（updateEntryTime / updateEntryPointTime / moveEntryToDate /
// toggleTask / createEntry）全部指向 READONLY_REJECT —— 可写半边零实现。
// daily 把这条路径真正跑通，才能证明契约对「可写来源」是够用的，
// 而不是等接 Blinko / 思源宿主时才发现缺字段、三端一起返工。
//
// 逻辑逐字搬自 main.ts 的 DailyNoteService（本地日记部分），只做两处替换：
//   app.vault.*  → this.store.*（宿主注入，见 sources/fs.ts）
//   moment(d).format("YYYY"/"MM") → dateStr 切片（sources/ 不许引 ui 层）
//
// ⚠️ 搬运纪律：这些解析 / 回写正则一个字符都不要"顺手优化"。它们对应
// 用户日记里真实存在的格式，改动会静默破坏已有笔记（参照红线 24）。

import {
  parseLine,
  parseQuickAddSection,
  sectionHeaderRegex,
  formatSecondsToTime,
  rewriteEntryLineTime,
  collectSubItemLines,
  isPointEntry
} from "../core/index";
import type { NoteEntry, NoteSource } from "./types";
import type { NoteFile, NoteFileStore } from "./fs";

/** 只用到设置里的这几项，不引宿主设置类型（sources/ 不依赖宿主） */
export interface DailySourceSettings {
  /** 周期笔记根目录，默认 SpiralNotes */
  periodicNotesFolder?: string;
  /** 快速记录插入的标题配置（含 # 层级） */
  quickAddSection?: string;
}

export interface DailySourceConfig {
  /** 宿主提供的文件存储 */
  store: NoteFileStore;
  settings: DailySourceSettings;
  /**
   * 索引缓存有效期（毫秒）。索引要遍历全库文件名，建一次不便宜，
   * 但用户新建日记后要能立刻看到 —— 5 秒是原实现的取值，保持不变。
   */
  indexTtlMs?: number;
  /**
   * 宿主注入：返回「已经渲染好变量」的日记模板内容（DEC-028）。
   * 返回 null / 空串表示不使用模板，DailySource 逐字回退到旧版内置结构。
   * sources/ 不认 Obsidian，模板怎么读、变量怎么替换由宿主层决定。
   * 只在**新建日记**时调用，已有日记直接走原来的插入逻辑。
   */
  resolveTemplate?: (dateStr: string) => Promise<string | null>;
}

const DEFAULT_INDEX_TTL = 5000;
/** 日期文件名：2026-11-11.md */
const DATE_BASENAME_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 日期字符串加减天数。
 * 用 Date.UTC 算，不受本地时区 / 夏令时影响（纯算术，不是宿主 API）。
 */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const t = Date.UTC(y, (m || 1) - 1, d || 1) + delta * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export class DailySource implements NoteSource {
  readonly id = "daily";
  readonly label = "日记";
  /** 本地文件，可写 */
  readonly readonly = false;

  private store: NoteFileStore;
  private settings: DailySourceSettings;
  private indexTtlMs: number;
  private resolveTemplate: ((dateStr: string) => Promise<string | null>) | null;

  /** dateStr -> 文件元数据。名字沿用原实现，方便调用方迁移 */
  readonly index = new Map<string, NoteFile>();
  /**
   * filePath -> { mtime, entries, gen }。按 mtime + 写代数判失效：
   * 只靠 mtime 挡不住「写盘前发起、写盘后才回填」的并发读取 —— index 里的
   * mtime 在 5 秒 TTL 内不会变，旧读取回填的旧内容会被当成命中，跨天拖动后
   * 视图就弹回搬移前的数据（2026-11-12 实测）。每次写盘递增 gen 即可作废它。
   */
  readonly fileCache = new Map<string, { mtime: number; entries: NoteEntry[]; gen: number }>();
  private cacheGeneration = 0;
  private indexBuiltTime = 0;

  constructor(config: DailySourceConfig) {
    this.store = config.store;
    this.settings = config.settings || {};
    this.indexTtlMs = config.indexTtlMs ?? DEFAULT_INDEX_TTL;
    this.resolveTemplate = config.resolveTemplate || null;
  }

  /** 设置对象是宿主共享的可变对象，改了要立刻生效，所以每次读都取最新 */
  private get folder(): string {
    return this.settings.periodicNotesFolder || "SpiralNotes";
  }
  private get quickAddSectionCfg(): string {
    return this.settings.quickAddSection || "";
  }

  /** 索引作废（设置里改了日记目录、或在别处新建了日记时用） */
  clearIndex(): void {
    this.index.clear();
    this.indexBuiltTime = 0;
  }

  /**
   * 写盘后作废旧缓存。递增 gen 是为了让「写盘前发起的异步读取」即使晚到、
   * 把旧内容回填进 fileCache，也会因 gen 不匹配而在下次读取时被丢弃。
   */
  private invalidateFile(path: string): void {
    this.cacheGeneration++;
    this.fileCache.delete(path);
  }

  /**
   * 建立「日期 → 文件」索引。
   *
   * 只认文件名严格等于 YYYY-MM-DD 的 md；同名文件里**优先**周期笔记目录下的，
   * 目录外的作为兜底（历史日记可能散落在别处）。
   */
  async buildIndexIfNeeded(): Promise<void> {
    const now = Date.now();
    if (this.index.size > 0 && now - this.indexBuiltTime < this.indexTtlMs) return;

    this.index.clear();
    const files = await this.store.listMarkdownFiles();
    const folder = this.folder.toLowerCase();

    for (const f of files) {
      if (!DATE_BASENAME_RE.test(f.basename)) continue;
      const inFolder = f.path.toLowerCase().includes(folder);
      if (inFolder || !this.index.has(f.basename)) {
        this.index.set(f.basename, f);
      }
    }
    this.indexBuiltTime = now;
  }

  /** 找某一天的日记文件（不创建） */
  async findDailyNoteFile(dateStr: string): Promise<NoteFile | null> {
    await this.buildIndexIfNeeded();
    return this.index.get(dateStr) || null;
  }

  /** 建目录，逐级创建（已存在的层级跳过） */
  private async ensureFolder(folder: string): Promise<void> {
    let curr = "";
    for (const part of folder.split("/")) {
      if (!part) continue;
      curr = curr ? `${curr}/${part}` : part;
      if (!(await this.store.exists(curr))) {
        await this.store.createFolder(curr);
      }
    }
  }

  /** 日记在周期笔记目录下的位置：<folder>/<YYYY>/Daily/<MM>/<date>.md */
  private folderOf(dateStr: string): string {
    return `${this.folder}/${dateStr.slice(0, 4)}/Daily/${dateStr.slice(5, 7)}`;
  }

  /**
   * 新建日记的内容（DEC-028）。两个创建入口（ensureDailyNote / addEntry）都走这里，
   * 避免「点日期标题建的是模板、QuickAdd 建的还是三行」这类分叉（DEC-020 的教训）。
   *
   * 无模板时**逐字保持旧行为**：`# 日期` + 空行 + 快速记录标题（+ 首条记录）。
   * 有模板时直接用模板内容，不再额外补 `# 日期` 一级标题（与 Obsidian 一致，
   * 否则会破坏模板自己的标题结构）；模板里没有配置的那节标题才在文末补一节。
   */
  private async buildNewNoteContent(dateStr: string, newLine: string | null = null): Promise<string> {
    const section = parseQuickAddSection(this.quickAddSectionCfg);
    const template = this.resolveTemplate ? await this.resolveTemplate(dateStr) : null;

    if (template === null || template === undefined || !String(template).trim()) {
      return newLine === null
        ? `# ${dateStr}\n\n${section.heading}\n`
        : `# ${dateStr}\n\n${section.heading}\n${newLine}\n`;
    }

    const lines = String(template).replace(/\s+$/, "").split("\n");
    const headerRe = sectionHeaderRegex(section.title);
    const headerIdx = lines.findIndex(l => headerRe.test(l));
    if (headerIdx >= 0) {
      if (newLine !== null) lines.splice(headerIdx + 1, 0, newLine);
    } else {
      lines.push("", section.heading);
      if (newLine !== null) lines.push(newLine);
    }
    return lines.join("\n") + "\n";
  }

  /**
   * 确保某天日记存在并返回它，不存在则按约定新建（DEC-017）。
   * 内容规则已收口到 buildNewNoteContent：默认沿用宿主日记模板（DEC-028）。
   */
  async ensureDailyNote(dateStr: string): Promise<NoteFile> {
    await this.buildIndexIfNeeded();
    const hit = this.index.get(dateStr);
    if (hit) return hit;

    const folder = this.folderOf(dateStr);
    await this.ensureFolder(folder);
    const path = `${folder}/${dateStr}.md`;
    await this.store.create(path, await this.buildNewNoteContent(dateStr));

    const file: NoteFile = { path, basename: dateStr, mtime: Date.now() };
    this.index.set(dateStr, file);
    return file;
  }

  /** 解析单篇日记（只取顶层条目，缩进行挂成子项） */
  async parseDailyFile(file: NoteFile, dateStr: string): Promise<NoteEntry[]> {
    const cached = this.fileCache.get(file.path);
    if (cached && cached.mtime === file.mtime && cached.gen === this.cacheGeneration) {
      return cached.entries;
    }

    const content = await this.store.read(file.path);
    const lines = content.split("\n");
    const entries: NoteEntry[] = [];
    let currentParent: NoteEntry | null = null;
    let currentSection = "";
    // 自定义标题也要能被识别为「随手记区」；旧的关键词启发式保留，兼容已有日记
    const memoTitle = parseQuickAddSection(this.quickAddSectionCfg).title;

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
        currentSection = trimmed.replace(/^#+\s*/, "").replace(/\s+#+\s*$/, "").trim();
        currentParent = null;
        continue;
      }

      // Check if this line is an indented sub-item (starts with tab or 2+ spaces before list symbol)
      const isSubItem = /^(?:\t+| {2,})/.test(rawLine);

      if (isSubItem) {
        // Child item: append to parent's subItems for context, do NOT create standalone entry
        if (currentParent) {
          const cleanSub = trimmed.replace(/^[-*+]\s*(?:\[[ xX\-\/]\]\s*)?/, "").trim();
          if (cleanSub) currentParent.subItems.push(cleanSub);
        }
        continue;
      }

      // Top-level main item
      const inMemoSection = currentSection === memoTitle ||
        currentSection.includes("灵感") || currentSection.includes("闪念") ||
        currentSection.includes("Inspirations") || currentSection.includes("Memos");
      const entry = parseLine(rawLine, i + 1, dateStr, file.path, inMemoSection);
      if (entry) {
        entries.push(entry);
        currentParent = entry;
      } else {
        currentParent = null;
      }
    }

    this.fileCache.set(file.path, { mtime: file.mtime, entries, gen: this.cacheGeneration });
    return entries;
  }

  /**
   * 列区间内条目（契约方法）。
   * 含首尾两天；没有日记的日子不产出任何条目（不报错）。
   */
  async listEntries(startDate: string, endDate: string): Promise<NoteEntry[]> {
    await this.buildIndexIfNeeded();
    const out: NoteEntry[] = [];
    let curr = startDate;
    while (curr <= endDate) {
      const file = await this.findDailyNoteFile(curr);
      if (file) out.push(...await this.parseDailyFile(file, curr));
      curr = addDays(curr, 1);
    }
    return out;
  }

  /** 勾选 / 取消勾选。原实现不校验来源，只按 filePath + lineNum 定位 */
  async toggleTask(entry: NoteEntry): Promise<boolean> {
    const path = entry.filePath;
    if (!(await this.store.exists(path))) return false;

    const content = await this.store.read(path);
    const lines = content.split("\n");
    const targetIdx = entry.lineNum - 1;
    if (targetIdx < 0 || targetIdx >= lines.length) return false;

    const line = lines[targetIdx];
    let newLine = line;
    if (line.includes("[ ]")) {
      newLine = line.replace("[ ]", "[x]");
      entry.isCompleted = true;
    } else if (line.includes("[x]") || line.includes("[X]")) {
      newLine = line.replace(/\[[xX]\]/, "[ ]");
      entry.isCompleted = false;
    } else {
      // 行内没有复选框：原实现会原样写回（等于空操作），这里直接返回 false 更明确
      return false;
    }
    lines[targetIdx] = newLine;
    await this.store.write(path, lines.join("\n"));
    this.invalidateFile(path);
    return true;
  }

  /** 拖拽调节时间范围后回写：只改目标行的行首时间前缀，其余内容原样保留 */
  async updateEntryTime(entry: NoteEntry, startSec: number, endSec: number): Promise<boolean> {
    const path = entry.filePath;
    if (!(await this.store.exists(path))) return false;

    const content = await this.store.read(path);
    const lines = content.split("\n");
    const idx = entry.lineNum - 1;
    if (idx < 0 || idx >= lines.length) return false;

    const line = lines[idx];
    const rangeStr = `${formatSecondsToTime(startSec)}-${formatSecondsToTime(endSec)}`;
    const rangeRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s*[-~至到/]\s*\d{1,2}:\d{2}(?::\d{2})?)(\s+)/;
    const singleRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s+)/;

    let newLine: string;
    if (rangeRe.test(line)) {
      newLine = line.replace(rangeRe, (_m, pre, _s, _r, sp) => `${pre}${rangeStr}${sp}`);
    } else if (singleRe.test(line)) {
      newLine = line.replace(singleRe, (_m, pre, _t, sp) => `${pre}${rangeStr}${sp}`);
    } else {
      return false;
    }

    // 旧的时长标签（30m / 1h）与新范围冲突，去掉行尾那一个
    newLine = newLine.replace(/\s+\d+(?:\.\d+)?\s*(?:m|min|h|小时|分钟)(?=\s*$)/i, "");
    if (newLine === line) return false;

    lines[idx] = newLine;
    await this.store.write(path, lines.join("\n"));
    this.invalidateFile(path);
    return true;
  }

  // 拖动时间点线后回写：只替换行首的单时间前缀，绝不生成结束时间 / 范围（DEC-018）。
  // 与 updateEntryTime 分开是为了让「点」永远不会被悄悄扩成「块」；
  // 范围行、无时间行一律拒绝，缩进 / 复选框 / 列表符 / 标签 / 行尾文字全部原样保留。
  async updateEntryPointTime(entry: NoteEntry, startSec: number): Promise<boolean> {
    const path = entry.filePath;
    if (!(await this.store.exists(path))) return false;

    const content = await this.store.read(path);
    const lines = content.split("\n");
    const idx = entry.lineNum - 1;
    if (idx < 0 || idx >= lines.length) return false;

    const line = lines[idx];
    const rangeRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s*[-~至到/]\s*\d{1,2}:\d{2}(?::\d{2})?)/;
    const singleRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s+|$)/;
    if (rangeRe.test(line) || !singleRe.test(line)) return false;

    const newLine = line.replace(
      singleRe,
      (_m, pre, _t, sp) => `${pre}${formatSecondsToTime(startSec)}${sp}`
    );
    if (newLine === line) return false;

    lines[idx] = newLine;
    await this.store.write(path, lines.join("\n"));
    this.invalidateFile(path);
    return true;
  }

  // 跨天拖动回写（DEC-022）：把目标行连同缩进子项从原日记搬到另一天的日记。
  // 只搬「一条记录」，不重写两篇笔记的其它内容；行号对不上时宁可拒绝，绝不误删。
  async moveEntryToDate(
    entry: NoteEntry, targetDate: string, startSec: number, endSec: number
  ): Promise<boolean> {
    if (!entry || !targetDate || entry.dateStr === targetDate) return false;
    // 非本地日记来源没有可安全删除的行，只读。
    // entry.readonly 覆盖「走 HTTP API 聚合进来」的条目（DEC-023），
    // 它们甚至连本地文件都没有。
    if (entry.readonly || (entry.source && entry.source !== "daily")) return false;

    const path = entry.filePath;
    if (!(await this.store.exists(path))) return false;

    const content = await this.store.read(path);
    const lines = content.split("\n");
    const idx = entry.lineNum - 1;
    if (idx < 0 || idx >= lines.length) return false;
    // 解析之后日记可能被外部改过：行号漂移时整笔操作作废，防止删掉别人的内容
    if (lines[idx] !== entry.rawLine) return false;

    const movedLine = rewriteEntryLineTime(lines[idx], startSec, endSec, isPointEntry(entry));
    if (movedLine === null) return false;
    const moving = [movedLine, ...collectSubItemLines(lines, idx)];

    // 先写目标文件再删源行：中途失败最多留下一份重复，绝不会把记录弄丢。
    // 复用 addEntry 的建目录 / 建日记 / 找标题下插入逻辑，避免第二套路径约定。
    // 目标文件写失败时直接放弃，源文件一个字都不动。
    try {
      await this.addEntry(targetDate, "", "", false, [], "", moving);
    } catch {
      return false;
    }

    const remaining = lines.slice();
    remaining.splice(idx, moving.length);
    await this.store.write(path, remaining.join("\n"));
    this.invalidateFile(path);
    return true;
  }

  /** 契约入口：新建一条（供未来宿主表单直接调用） */
  async createEntry(
    dateStr: string,
    timeStr: string,
    content: string,
    isTask: boolean,
    tags: string[] = [],
    endTimeStr = ""
  ): Promise<boolean> {
    try {
      await this.addEntry(dateStr, timeStr, content, isTask, tags, endTimeStr);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 追加一条记录到日记的快速记录区。
   *
   * rawLines（DEC-022）：跨天移动时直接搬原始行（含子项），不再拼装新行，
   * 这样复选框 / 缩进 / 标签 / 正文 / 块引用全部原样保留。
   */
  async addEntry(
    dateStr: string,
    timeStr: string,
    content: string,
    isTask: boolean,
    tags: string[] = [],
    endTimeStr = "",
    rawLines: string[] | null = null
  ): Promise<void> {
    await this.buildIndexIfNeeded();
    let file = this.index.get(dateStr) || null;

    const tagPart = tags.length > 0 ? " " + tags.map(t => "#" + t).join(" ") : "";
    const linePrefix = isTask ? "- [ ] " : "- ";
    const rangeStr = endTimeStr ? `${timeStr}-${endTimeStr}` : timeStr;
    const timePrefix = rangeStr ? `${rangeStr} ` : "";
    const generatedLine = `${linePrefix}${timePrefix}${content}${tagPart}`;
    const newLine = (rawLines && rawLines.length) ? rawLines.join("\n") : generatedLine;
    // 层级与标题都来自设置，不再写死 "## "
    const section = parseQuickAddSection(this.quickAddSectionCfg);
    const headerRe = sectionHeaderRegex(section.title);

    if (!file) {
      const folder = this.folderOf(dateStr);
      await this.ensureFolder(folder);
      const path = `${folder}/${dateStr}.md`;
      await this.store.create(path, await this.buildNewNoteContent(dateStr, newLine));
      file = { path, basename: dateStr, mtime: Date.now() };
      this.index.set(dateStr, file);
    } else {
      let fileText = await this.store.read(file.path);
      const lines = fileText.split("\n");
      // 已有同名标题（任意层级）就插在它下面、不新建重复标题；
      // 完全没有才按配置层级在文末追加一节。逐行精确匹配，避免正文里的同名文字误命中。
      const headerIdx = lines.findIndex(l => headerRe.test(l));
      if (headerIdx >= 0) {
        lines.splice(headerIdx + 1, 0, newLine);
        fileText = lines.join("\n");
      } else {
        fileText = fileText.trimEnd() + `\n\n${section.heading}\n${newLine}\n`;
      }
      await this.store.write(file.path, fileText);
    }
    this.invalidateFile(file.path);
  }
}
