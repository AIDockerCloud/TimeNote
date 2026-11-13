// hosts/blinko/note-store.ts — Blinko note ↔ 虚拟 markdown 文件（DEC-032）
//
// Blinko 的笔记是数据库记录，没有「日记文件」也没有「行」。这里把
// 「一天的所有 note」映射成一个虚拟 md 文件，让 DailySource 的解析 / 拖拽 /
// 跨天 / 勾选全套逻辑原样复用：
//
//   虚拟路径 <folder>/YYYY/Daily/MM/YYYY-MM-DD.md
//        ↓ dateStr
//   该日的 Blinko notes（按 metadata.timenote.date 或 createdAt 归组）
//        ↓ 一条 note
//   md 的一行：`- 09:00 内容`；note 的后续行变成缩进子项
//
// 时间 / 日期存在两处，互为保险：
//   · 正文行首的 `HH:mm`（Blinko 里可见、可搜索，也是 TimeNote 的数据格式）
//   · note.metadata.timenote = {date, time}（跨天搬移后不会被 createdAt 拉回原日期）
// createdAt 也尽量同步成 date+time（tRPC 有 superjson，能直接传 Date）。
//
// 删除一律走回收站（trashMany），不是硬删 —— 跨天搬移中途失败还能恢复。

import type { NoteFile, NoteFileStore } from "../../sources/fs";
import { diffLines } from "../../apps/shared/line-diff";
import { BlinkoNoteApi } from "./api";
import type { BlinkoNote } from "./api";

/** 从虚拟路径里取 YYYY-MM-DD */
export function dateOfPath(path: string): string | null {
  const name = String(path || "").split("/").pop() || "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:\.md)?$/i.exec(name);
  return m ? m[1] : null;
}

export interface LocalStamp { dateStr: string; timeStr: string; }

/** ISO / Date → 本地时区的日期与 HH:mm（与 sources/memos.ts 的换算一致） */
export function localStamp(value: any): LocalStamp | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { dateStr: `${y}-${m}-${day}`, timeStr: `${hh}:${mm}` };
}

/** TimeNote 元数据藏在 note.metadata.timenote，不污染用户可见正文 */
export function timenoteMeta(note: BlinkoNote): { date?: string; time?: string } {
  const v = note && note.metadata && note.metadata.timenote;
  if (!v || typeof v !== "object") return {};
  return {
    date: typeof v.date === "string" ? v.date : undefined,
    time: typeof v.time === "string" ? v.time : undefined
  };
}

/** 行首时间前缀（点 `09:23` 或块 `09:00-10:30` 都算） */
export function timePrefixOf(line: string): string | null {
  const m = /^\s*[-*+]\s+(?:\[[ xX\-\/]\]\s*)?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-~至到/]\s*\d{1,2}:\d{2}(?::\d{2})?)?)(?=\s|$)/.exec(String(line || ""));
  return m ? m[1] : null;
}

export interface VirtualLine {
  timeStr: string;
  isTask: boolean;
  isCompleted: boolean;
  body: string;
}

/** 拆一条虚拟 md 行，得到写回 note 所需的全部字段 */
export function parseVirtualLine(line: string): VirtualLine {
  let s = String(line || "").replace(/^\s+/, "");
  s = s.replace(/^[-*+]\s+/, "");
  let isTask = false;
  let isCompleted = false;
  const box = /^\[([ xX\-\/])\]\s*/.exec(s);
  if (box) {
    isTask = true;
    isCompleted = box[1] === "x" || box[1] === "X";
    s = s.slice(box[0].length);
  }
  const t = /^(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[-~至到/]\s*\d{1,2}:\d{2}(?::\d{2})?)?)(?:\s+|$)/.exec(s);
  const timeStr = t ? t[1] : "";
  if (t) s = s.slice(t[0].length);
  return { timeStr, isTask, isCompleted, body: s.trim() };
}

/** 虚拟行 → 写进 Blinko 的 note.content（时间前缀留在正文里，下次 read 能识别） */
export function buildNoteContent(line: string): string {
  const v = parseVirtualLine(line);
  const prefix = v.isTask ? `- [${v.isCompleted ? "x" : " "}] ` : "- ";
  return `${prefix}${v.timeStr ? `${v.timeStr} ` : ""}${v.body}`.trimEnd();
}

/** date + 行首时间 → Date。范围时间只取开始；无效时间退到当天 00:00 */
export function timestampFor(dateStr: string, timeStr: string): Date {
  const hhmm = String(timeStr || "").split(/\s*[-~至到/]\s*/)[0] || "00:00";
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  const hh = m ? Number(m[1]) : 0;
  const mm = m ? Number(m[2]) : 0;
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, hh, mm, 0);
}

/** 一条 note → 虚拟 md 的若干行（首行是记录，后续行是缩进子项） */
export function noteToLines(note: BlinkoNote, fallbackDate: string): string[] {
  const meta = timenoteMeta(note);
  const stamp = localStamp(note.createdAt || note.updatedAt);
  const timeStr = meta.time || (stamp ? stamp.timeStr : "00:00");
  const raw = String(note.content || "").split("\n");
  const first = raw.shift() || "";
  let head: string;
  if (timePrefixOf(first)) {
    head = first; // 正文已自带时间前缀，原样保留
  } else {
    const bullet = /^(\s*[-*+]\s+(?:\[[ xX\-\/]\]\s*)?)(.*)$/.exec(first);
    if (bullet) head = `${bullet[1]}${timeStr} ${bullet[2]}`.trimEnd();
    else head = `- ${timeStr} ${first}`.trimEnd();
  }
  const out = [head];
  for (const line of raw) {
    if (!line.trim()) continue;
    out.push(`  ${line.trim()}`);
  }
  void fallbackDate;
  return out;
}

/** note → 归属日期（metadata 优先，createdAt 兜底） */
export function noteDate(note: BlinkoNote): string | null {
  const meta = timenoteMeta(note);
  if (meta.date && /^\d{4}-\d{2}-\d{2}$/.test(meta.date)) return meta.date;
  const stamp = localStamp(note.createdAt || note.updatedAt);
  return stamp ? stamp.dateStr : null;
}

export interface BlinkoNoteStoreConfig {
  api: BlinkoNoteApi;
  folder?: string;
  /** 回看天数（设置项 blinkoLookbackDays），用函数以便设置改了立即生效 */
  lookbackDays?: () => number;
  /** 列表缓存毫秒数，默认 10 秒；避免 5 秒索引 TTL 每次都打 tRPC */
  listCacheMs?: number;
  warn?: (msg: string) => void;
}

interface Snapshot { lines: string[]; ids: Array<string | null>; }

export class BlinkoNoteStore implements NoteFileStore {
  private api: BlinkoNoteApi;
  private folder: string;
  private lookback: () => number;
  private warn: (msg: string) => void;
  private listCacheMs: number;

  private notesByDate = new Map<string, BlinkoNote[]>();
  private snapshots = new Map<string, Snapshot>();
  private mtimes = new Map<string, number>();
  private listCacheUntil = 0;
  private lastFiles: NoteFile[] = [];

  constructor(config: BlinkoNoteStoreConfig) {
    this.api = config.api;
    this.folder = config.folder || "SpiralNotes";
    this.lookback = config.lookbackDays || (() => 90);
    this.warn = config.warn || (() => {});
    this.listCacheMs = config.listCacheMs ?? 10000;
  }

  setFolder(folder: string): void {
    const next = folder || "SpiralNotes";
    if (next !== this.folder) {
      this.folder = next;
      this.invalidateList();
    }
  }

  invalidateList(): void { this.listCacheUntil = 0; }

  private virtualPath(dateStr: string): string {
    const f = this.folder.replace(/^\/+|\/+$/g, "");
    return `${f}/${dateStr.slice(0, 4)}/Daily/${dateStr.slice(5, 7)}/${dateStr}.md`;
  }

  private windowRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const days = Math.max(7, Math.min(3650, Number(this.lookback()) || 90));
    const start = new Date(now.getTime() - days * 86400000);
    const end = new Date(now.getTime() + 366 * 86400000);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { startDate: fmt(start), endDate: fmt(end) };
  }

  async listMarkdownFiles(): Promise<NoteFile[]> {
    if (Date.now() < this.listCacheUntil) return this.lastFiles.slice();
    const { startDate, endDate } = this.windowRange();
    const notes = await this.api.listNotes({ startDate, endDate });
    const grouped = new Map<string, BlinkoNote[]>();
    for (const note of notes) {
      if (note.isRecycle || note.isArchived) continue;
      const d = noteDate(note);
      if (!d || d < startDate || d > endDate) continue;
      if (!grouped.has(d)) grouped.set(d, []);
      grouped.get(d)!.push(note);
    }
    this.notesByDate = grouped;
    for (const [d, list] of grouped) {
      const latest = list.reduce((max, n) => {
        const t = Date.parse(String(n.updatedAt || n.createdAt || ""));
        return Number.isFinite(t) && t > max ? t : max;
      }, 0);
      if (!this.mtimes.has(d)) this.mtimes.set(d, latest || 1);
    }
    this.lastFiles = [...grouped.keys()].sort().map(d => ({
      path: this.virtualPath(d),
      basename: d,
      mtime: this.mtimes.get(d) || 1
    }));
    this.listCacheUntil = Date.now() + this.listCacheMs;
    return this.lastFiles.slice();
  }

  /** 供 adapter 的跳转 / 详情弹窗用 */
  getNotes(dateStr: string): BlinkoNote[] {
    return (this.notesByDate.get(dateStr) || []).slice();
  }

  /** 虚拟文件的第 lineNum 行属于哪条 note（子项行向上归属到首行） */
  getNoteIdAt(path: string, lineNum: number): string | null {
    const snap = this.snapshots.get(path);
    if (!snap) return null;
    const from = Math.min(Math.max(1, lineNum), snap.ids.length) - 1;
    for (let i = from; i >= 0; i--) {
      if (snap.ids[i]) return snap.ids[i];
    }
    return null;
  }

  findNoteById(id: string): BlinkoNote | undefined {
    return this.findNote(id);
  }

  private findNote(id: string): BlinkoNote | undefined {
    for (const list of this.notesByDate.values()) {
      const hit = list.find(n => String(n.id) === id);
      if (hit) return hit;
    }
    return undefined;
  }

  async read(path: string): Promise<string> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    await this.listMarkdownFiles();
    const notes = this.notesByDate.get(dateStr) || [];
    const lines: string[] = [];
    const ids: Array<string | null> = [];
    for (const note of notes) {
      const noteLines = noteToLines(note, dateStr);
      for (let i = 0; i < noteLines.length; i++) {
        lines.push(noteLines[i]);
        // 子项行也指向同一个 note，写回时只按首行 id 处理
        ids.push(i === 0 ? String(note.id) : null);
      }
    }
    this.snapshots.set(path, { lines, ids });
    return lines.join("\n");
  }

  private async upsertFromLine(line: string, dateStr: string, existing?: BlinkoNote): Promise<string | null> {
    const v = parseVirtualLine(line);
    const time = v.timeStr || "00:00";
    const metadata = {
      ...((existing && existing.metadata) || {}),
      timenote: { date: dateStr, time }
    };
    const body: any = {
      content: buildNoteContent(line),
      type: 0,
      metadata,
      createdAt: timestampFor(dateStr, time)
    };
    if (existing) body.id = Number(existing.id);
    const result = await this.api.upsertNote(body);
    if (existing) return String(existing.id);
    const id = result && (result.id ?? result.data?.id ?? result.note?.id);
    return id === undefined || id === null ? null : String(id);
  }

  async write(path: string, content: string): Promise<void> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    let snap = this.snapshots.get(path);
    if (!snap) {
      await this.read(path);
      snap = this.snapshots.get(path);
    }
    const oldLines = snap ? snap.lines : [];
    const oldIds = snap ? snap.ids : [];
    // 虚拟文件里没有标题行：DailySource 写回时若发现没有「快速记录」标题会补一节，
    // 这一节只是 TimeNote 的插入锚点，不该变成一条 Blinko note。
    const newLines = String(content || "").split("\n")
      .filter(l => l.trim().length > 0 && !/^\s*#{1,6}\s/.test(l));
    const ops = diffLines(oldLines, newLines, oldIds);
    const toTrash: number[] = [];
    // 同上：写回后要带着实体 id 进入下一轮 diff，否则第二次删 / 改就找不到 note。
    const nextIds: Array<string | null> = [];

    for (const op of ops) {
      // 缩进子项行属于上一条 note 的正文，不单独建 / 改实体；
      // 但保留在行序列里，行号才不会漂移（DailySource 靠 lineNum 定位回写）。
      const targetLine = String(op.newLine || "");
      const isSubItem = /^\s{2,}|^\t/.test(targetLine);
      try {
        if (op.op === "keep") {
          nextIds.push(op.blockId || null);
        } else if ((op.op === "replace" || op.op === "insert") && !isSubItem) {
          const existing = op.blockId ? this.findNote(op.blockId) : undefined;
          const id = await this.upsertFromLine(targetLine, dateStr, existing);
          nextIds.push(id || op.blockId || null);
        } else if ((op.op === "replace" || op.op === "insert") && isSubItem) {
          nextIds.push(op.blockId || null);
        } else if (op.op === "delete" && !isSubItem) {
          if (op.blockId) toTrash.push(Number(op.blockId));
        }
      } catch (err) {
        this.warn(`[TimeNote/Blinko] note 写入失败 ${op.op}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }
    if (toTrash.length) await this.api.trashNotes(toTrash.filter(n => Number.isFinite(n)));

    this.snapshots.set(path, { lines: newLines, ids: nextIds });
    this.mtimes.set(dateStr, Date.now());
    this.invalidateList();
  }

  async create(path: string, content: string): Promise<void> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    const lines = String(content || "").split("\n")
      .filter(l => l.trim() && !/^\s*#{1,6}\s/.test(l)); // 标题行不建 note
    if (!lines.length) return;
    for (const line of lines) {
      // 缩进子项不单独建 note：它们属于上一条记录
      if (/^\s{2,}|^\t/.test(line)) continue;
      await this.upsertFromLine(line, dateStr);
    }
    this.mtimes.set(dateStr, Date.now());
    this.snapshots.delete(path);
    this.invalidateList();
  }

  async exists(path: string): Promise<boolean> {
    if (!/\.md$/i.test(String(path || ""))) return true; // 虚拟目录一律放行
    const dateStr = dateOfPath(path);
    if (!dateStr) return false;
    await this.listMarkdownFiles();
    return this.notesByDate.has(dateStr);
  }

  async createFolder(_path: string): Promise<void> { /* 无需目录 */ }
}
