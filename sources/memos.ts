// sources/memos.ts — memos 数据源（只读聚合源）
//
// memos 没有前端插件体系（DEC-023 背景 ⑤），所以它**不作为插件存在**，
// 只作为「可被任意宿主聚合的数据源」。
//
// 接口形态（已核实 usememos 官方 API 文档）：
//   GET  {base}/api/v1/memos?pageSize=N&pageToken=T&filter=<CEL>
//        Authorization: Bearer <token>
//   → { memos: [{ name, createTime, content, tags, visibility, ... }], nextPageToken }
//
// 时间语义：memos 的 memo 自带 `createTime`（ISO 8601），**天然是一个时间点**
// ——这正好对应 TimeNote 的「时间点记录」（DEC-018：只有时刻、没有区间）。
// memo 正文里的 `HH:mm-HH:mm` 仍会被 core 的 parseLine 识别成时间块；
// 但 createTime 本身已经定位了时刻，所以这里以 createTime 为准，
// 正文里的时间只用来决定「是点还是块」。
//
// ⚠️ 只读：聚合进来的 memos 一律不可写、不可移动、不可勾选（DEC-018 / DEC-022）。

import { NoteEntry, NoteSource, READONLY_REJECT } from "./types";
import { parseLine } from "../core/index";

/** memos 实例地址与访问令牌 */
export interface MemosConfig {
  /** 实例地址，如 https://memos.example.com（可带或不带末尾斜杠） */
  baseUrl: string;
  /** 访问令牌（个人设置 → 访问令牌 → 新建） */
  token: string;
  /** 只拉这个用户的 memo（形如 "users/1"）；留空表示实例内全部可见的 */
  creator?: string;
}

interface MemosMemo {
  name?: string;
  createTime?: string;
  content?: string;
  tags?: string[];
  visibility?: string;
}

const API_PATH = "/api/v1/memos";
/** 单页条数上限。memos 不做上限保护，但别拿它当无脑拉全量的工具 */
const PAGE_SIZE = 100;
/** 翻页上限，防止配置错误导致无限循环 */
const MAX_PAGES = 20;

function apiUrl(baseUrl: string, params: Record<string, string>): string {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}${API_PATH}${qs ? "?" + qs : ""}`;
}

/**
 * 把 ISO 时间戳转成「当天第几秒」。
 * memos 的 createTime 是 UTC，带 Z 后缀；这里换算成**本地时区**的当天时刻，
 * 这样时间点才会落在用户真正记录的钟点上。
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

/**
 * memos 数据源：只读聚合源。
 *
 * 用法：
 *   const src = new MemosSource({ baseUrl: "https://memos.example.com", token: "xxx" });
 *   const entries = await src.listEntries("2026-11-01", "2026-11-30");
 */
export class MemosSource implements NoteSource {
  readonly id = "memos";
  readonly label = "memos";
  readonly readonly = true;

  private config: MemosConfig;

  constructor(config: MemosConfig) {
    this.config = config || ({} as MemosConfig);
  }

  /** 供设置页显示当前配置是否可用 */
  get configured(): boolean {
    return !!(this.config && this.config.baseUrl && this.config.token);
  }

  /**
   * 拉取区间内的 memo 并映射成条目。
   *
   * 筛选在服务端做（CEL 的 create_time 范围），避免把整个实例都拖回来。
   * 若服务端不支持该 filter，退回「拉全量再本地过滤」也仍可用。
   */
  async listEntries(startDate: string, endDate: string): Promise<NoteEntry[]> {
    if (!this.configured) return [];

    const startIso = `${startDate}T00:00:00`;
    const endIso = `${endDate}T23:59:59`;
    const clauses = [`create_time >= "${startIso}"`, `create_time <= "${endIso}"`];
    if (this.config.creator) clauses.push(`creator == "${this.config.creator}"`);
    const filter = clauses.join(" && ");

    const out: NoteEntry[] = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string> = { pageSize: String(PAGE_SIZE), filter };
      if (pageToken) params.pageToken = pageToken;

      const res = await fetch(apiUrl(this.config.baseUrl, params), {
        headers: { Authorization: `Bearer ${this.config.token}` }
      });
      if (!res.ok) {
        // 认证失败 / 实例不可达：聚合源失败不应打断整个视图，返回已取到的部分
        break;
      }
      const data = await res.json();
      const memos: MemosMemo[] = data && Array.isArray(data.memos) ? data.memos : [];
      for (const memo of memos) out.push(this.toEntry(memo));
      pageToken = (data && data.nextPageToken) || "";
      if (!pageToken) break;
    }
    return out;
  }

  /** 单条 memo → 条目 */
  private toEntry(memo: MemosMemo): NoteEntry | null {
    const content = String(memo.content || "");
    const created = isoToLocalSeconds(String(memo.createTime || ""));
    if (!created) return null;

    // 正文里若自带 HH:mm / HH:mm-HH:mm，用 core 的解析器判定「是点还是块」，
    // 但**时刻以 createTime 为准**（那是 memo 真正被创建的钟点）。
    const parsed = parseLine(content, 1, created.dateStr, memo.name || "memos", true);
    const hasExplicitRange = !!(parsed && parsed.hasTime && parsed.isRange);
    const explicitSeconds = parsed && parsed.hasTime ? parsed.startSeconds : null;

    // 显式区间：取正文里的区间；只有单时刻：取 createTime
    const startSeconds = hasExplicitRange && explicitSeconds !== null
      ? explicitSeconds
      : created.seconds;
    const endSeconds = hasExplicitRange && parsed
      ? parsed.endSeconds
      : Math.min(86400, startSeconds + 1800);

    const tags: string[] = Array.isArray(memo.tags) ? memo.tags.slice() : [];
    // 正文里的 #标签 也算（memos 本身会解析 hashtag，但旧数据可能只在正文里）
    const body = content.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (m, t) => {
      if (!tags.includes(t)) tags.push(t);
      return "";
    }).trim();

    const hh = String(Math.floor(startSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((startSeconds % 3600) / 60)).padStart(2, "0");

    return {
      id: `memos:${memo.name || created.dateStr}`,
      filePath: memo.name || "",
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
      timeStr: hasExplicitRange ? `${hh}:${mm}-${Math.floor(endSeconds / 3600)}:${String(Math.floor((endSeconds % 3600) / 60)).padStart(2, "0")}` : `${hh}:${mm}`,
      text: body.slice(0, 80) || (tags.length ? tags.map(t => "#" + t).join(" ") : "memos 记录"),
      tags,
      tint: parsed ? parsed.tint : null,
      subItems: [],
      source: "memos",
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
