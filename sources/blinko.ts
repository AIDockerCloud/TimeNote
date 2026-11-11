// sources/blinko.ts — Blinko 数据源（只读聚合源）
//
// ⚠️ 与现有 Obsidian 侧的「读 Blinko 导出文件」是**两回事**：
//   · 现有实现（main.ts 的 parseBlinkoFile）读的是 vault 里 Blinko 导出的
//     markdown 文件 + frontmatter，靠 `date:` 字段拿时间；
//   · 本实现直连 Blinko 服务端的 API，拿 note 的 `createdAt`。
// 两者可以并存：导出文件方式适合离线 / 无 API Token 场景，API 方式更实时。
//
// 接口形态（已核实 blinko 官方 API 与成熟第三方实现的一致用法）：
//   POST {base}/api/v1/note/list
//        Authorization: Bearer <apiKey>
//        { page, size, orderBy, type, tagId, isArchived, searchText }
//   → [ { id, content, createdAt, tags, ... } ]   ← 直接是数组
//
// type 取值：0 = 闪念、1 = 笔记、2 = 待办、-1 = 全部。
//
// 时间语义：Blinko note 自带 `createdAt`（ISO 时间戳），天然是一个时间点，
// 对应 TimeNote 的「时间点记录」（DEC-018）。正文里的 `HH:mm-HH:mm` 会被
// core 的 parseLine 识别成时间块；两者并存时以正文的显式区间为准。
//
// ⚠️ 只读：聚合进来的 Blinko 一律不可写、不可移动、不可勾选。

import { NoteEntry, NoteSource, READONLY_REJECT } from "./types";
import { parseLine } from "../core/index";

/** Blinko 实例地址与访问令牌 */
export interface BlinkoConfig {
  /** 实例地址，如 https://blinko.example.com */
  baseUrl: string;
  /** 访问令牌（Blinko 设置 → 访问令牌） */
  apiKey: string;
}

interface BlinkoNote {
  id?: number | string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: { name?: string }[] | string[];
  type?: number;
}

const API_PATH = "/api/v1/note/list";
/** 单页条数 */
const PAGE_SIZE = 100;
/** 翻页上限，防止配置错误导致无限循环 */
const MAX_PAGES = 20;

function apiUrl(baseUrl: string): string {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}${API_PATH}`;
}

/**
 * ISO 时间戳 → 「当天第几秒 + 日期」。
 * 换算成**本地时区**的当天时刻 —— 用户记录的那一刻，就是日历上该显示的时刻。
 */
function isoToLocalSeconds(iso: string): { dateStr: string; seconds: number } | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return { dateStr: `${y}-${m}-${day}`, seconds: secs };
}

/** Blinko 的 tags 既可能是对象数组也可能是字符串数组，两种都兼容 */
function extractTags(raw: BlinkoNote["tags"]): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const name = typeof t === "string" ? t : (t && t.name) || "";
    const clean = String(name).trim().replace(/^#/, "");
    if (clean) out.push(clean);
  }
  return out;
}

/**
 * Blinko 数据源：只读聚合源。
 *
 * 用法：
 *   const src = new BlinkoSource({ baseUrl: "https://blinko.example.com", apiKey: "xxx" });
 *   const entries = await src.listEntries("2026-11-01", "2026-11-30");
 */
export class BlinkoSource implements NoteSource {
  readonly id = "blinko";
  readonly label = "Blinko";
  readonly readonly = true;

  private config: BlinkoConfig;

  constructor(config: BlinkoConfig) {
    this.config = config || ({} as BlinkoConfig);
  }

  /** 供设置页显示当前配置是否可用 */
  get configured(): boolean {
    return !!(this.config && this.config.baseUrl && this.config.apiKey);
  }

  /**
   * 拉取区间内的 note 并映射成条目。
   *
   * Blinko 的 list 接口不支持按时间区间过滤，只能按时间倒序翻页后本地筛。
   * 因此这里取「区间结束日之后往前翻页」，翻到早于区间开始就停 ——
   * 否则会把整个实例的笔记都拖回来。
   */
  async listEntries(startDate: string, endDate: string): Promise<NoteEntry[]> {
    if (!this.configured) return [];

    const out: NoteEntry[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(apiUrl(this.config.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          page,
          size: PAGE_SIZE,
          orderBy: "desc",   // 最新在前，配合「翻到早于区间开始就停」
          type: -1,          // 闪念 / 笔记 / 待办 全要
          tagId: null,
          isArchived: false,
          searchText: ""
        })
      });
      if (!res.ok) break; // 认证失败 / 实例不可达：聚合源失败不打断整个视图
      const data = await res.json();
      const notes: BlinkoNote[] = Array.isArray(data) ? data : (data && data.data) || [];
      if (!notes.length) break;

      let reachedStart = false;
      for (const note of notes) {
        const created = isoToLocalSeconds(String(note.createdAt || note.updatedAt || ""));
        if (!created) continue;
        // 倒序排列，一旦早于区间起点就可以停 —— 后面的只会更早
        if (created.dateStr < startDate) { reachedStart = true; break; }
        if (created.dateStr > endDate) continue;
        const entry = this.toEntry(note, created);
        if (entry) out.push(entry);
      }
      if (reachedStart) break;
    }
    return out;
  }

  /** 单条 note → 条目 */
  private toEntry(note: BlinkoNote, created: { dateStr: string; seconds: number }): NoteEntry | null {
    const content = String(note.content || "");
    const parsed = parseLine(content, 1, created.dateStr, `blinko:${note.id}`, true);
    const hasExplicitRange = !!(parsed && parsed.hasTime && parsed.isRange);
    const explicitSeconds = parsed && parsed.hasTime ? parsed.startSeconds : null;

    const startSeconds = hasExplicitRange && explicitSeconds !== null
      ? explicitSeconds
      : created.seconds;
    const endSeconds = hasExplicitRange && parsed
      ? parsed.endSeconds
      : Math.min(86400, startSeconds + 1800);

    const tags = extractTags(note.tags);
    const body = content.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (m, t) => {
      if (!tags.includes(t)) tags.push(t);
      return "";
    }).trim();

    const hh = String(Math.floor(startSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((startSeconds % 3600) / 60)).padStart(2, "0");

    return {
      id: `blinko:${note.id}`,
      filePath: `blinko:${note.id}`,
      dateStr: created.dateStr,
      lineNum: 1,
      rawLine: content,
      isTask: !!(parsed && parsed.isTask),
      isCompleted: !!(parsed && parsed.isCompleted),
      hasTime: true,
      isRange: hasExplicitRange,
      startSeconds,
      endSeconds,
      startMinutes: Math.floor(startSeconds / 60),
      endMinutes: Math.floor(endSeconds / 60),
      timeStr: hasExplicitRange
        ? `${hh}:${mm}-${String(Math.floor(endSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((endSeconds % 3600) / 60)).padStart(2, "0")}`
        : `${hh}:${mm}`,
      text: body.slice(0, 80) || (tags.length ? tags.map(t => "#" + t).join(" ") : "Blinko 闪念"),
      tags,
      tint: parsed ? parsed.tint : null,
      subItems: [],
      source: "blinko",
      readonly: true
    };
  }

  // 只读源：所有写操作一律明确拒绝（返回 false = 未写入）
  updateEntryTime = READONLY_REJECT.updateEntryTime;
  updateEntryPointTime = READONLY_REJECT.updateEntryPointTime;
  moveEntryToDate = READONLY_REJECT.moveEntryToDate;
  toggleTask = READONLY_REJECT.toggleTask;
  createEntry = READONLY_REJECT.createEntry;
}
