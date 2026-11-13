// sources/host-service.ts — 新宿主共用的「数据装配 + 远程聚合」服务（DEC-032）
//
// Obsidian 侧的 DailyNoteService（main.ts）留在原地不动：它已经上线，改它等于
// 拿已验证的行为冒险。Blinko / 思源两个新宿主共用这里的 HostNoteService：
//
//   · 本地记录 → DailySource（可写，解析 / 拖拽 / 跨天 / 勾选全套逻辑）
//   · 远程来源 → MemosSource / BlinkoSource（只读聚合，三项齐全才挂载）
//   · 区间缓存 → 与 Obsidian 同规则（60 秒 / 16 个区间），保护手机热点流量
//
// 本文件属于 sources/ 层：**不 import hosts/、不 import ui/、不读任何全局**。
// 时间区间只要求调用方给一个能 format("YYYY-MM-DD") 的对象（MomentLike 形状）。

import { DailySource, addDays } from "./daily";
import { AggregateSource } from "./aggregate";
import { MemosSource } from "./memos";
import { BlinkoSource } from "./blinko";
import type { NoteSource, NoteEntry } from "./types";
import type { NoteFileStore, NoteFile } from "./fs";
import type { DailySourceConfig } from "./daily";

/** 与 hosts/types.ts 的 TimenoteSettings 结构兼容，但不反向依赖宿主层 */
export interface HostServiceSettings {
  periodicNotesFolder?: string;
  quickAddSection?: string;
  memosEnabled?: boolean;
  memosBaseUrl?: string;
  memosToken?: string;
  blinkoApiEnabled?: boolean;
  blinkoBaseUrl?: string;
  blinkoApiKey?: string;
  [key: string]: any;
}

/** 只要能取到 YYYY-MM-DD 就行，不绑定 moment 的具体实现 */
export interface RangeDateLike {
  format(fmt: string): string;
}

export interface HostServiceConfig {
  store: NoteFileStore;
  settings: HostServiceSettings;
  resolveTemplate?: DailySourceConfig["resolveTemplate"];
  /** 远程来源缓存有效期（毫秒），默认 60 秒，与 Obsidian 一致 */
  remoteCacheTtlMs?: number;
  /** 缓存区间数上限，默认 16 */
  remoteCacheMax?: number;
}

const DEFAULT_REMOTE_TTL = 60 * 1000;
const DEFAULT_REMOTE_MAX = 16;

/**
 * 三宿主共用语义的轻服务。
 *
 * ⚠️ 与 main.ts 的 DailyNoteService 有意保持**同规则但不同实现**：
 * Obsidian 那份还带「本地 Blinko 导出 md」通道（vault 专有文件），
 * 新宿主没有导出文件，所以这里不挂 BlinkoLocalSource。
 */
export class HostNoteService {
  readonly settings: HostServiceSettings;
  readonly daily: DailySource;
  /** 设置页排障用：上一次各远程来源的错误信息 */
  lastRemoteErrors: Record<string, string> = {};

  private remoteCache = new Map<string, { at: number; entries: NoteEntry[] }>();
  private remoteCacheTtl: number;
  private remoteCacheMax: number;

  constructor(config: HostServiceConfig) {
    this.settings = config.settings || {};
    this.daily = new DailySource({
      store: config.store,
      settings: config.settings,
      resolveTemplate: config.resolveTemplate
    });
    this.remoteCacheTtl = config.remoteCacheTtlMs ?? DEFAULT_REMOTE_TTL;
    this.remoteCacheMax = config.remoteCacheMax ?? DEFAULT_REMOTE_MAX;
  }

  // ---- 本地日记：转发到 DailySource ----

  get fileCache() { return this.daily.fileCache; }
  get dailyNoteIndex() { return this.daily.index; }

  addEntry(
    dateStr: string, timeStr: string, content: string, isTask: boolean,
    tags: string[] = [], endTimeStr = "", rawLines: string[] | null = null, body = ""
  ): Promise<void> {
    return this.daily.addEntry(dateStr, timeStr, content, isTask, tags, endTimeStr, rawLines, body);
  }
  toggleTask(entry: NoteEntry): Promise<boolean> { return this.daily.toggleTask(entry); }
  updateEntryTime(entry: NoteEntry, startSec: number, endSec: number): Promise<boolean> {
    return this.daily.updateEntryTime(entry, startSec, endSec);
  }
  updateEntryPointTime(entry: NoteEntry, startSec: number): Promise<boolean> {
    return this.daily.updateEntryPointTime(entry, startSec);
  }
  moveEntryToDate(entry: NoteEntry, targetDate: string, startSec: number, endSec: number): Promise<boolean> {
    return this.daily.moveEntryToDate(entry, targetDate, startSec, endSec);
  }
  findDailyNoteFile(dateStr: string): Promise<NoteFile | null> {
    return this.daily.findDailyNoteFile(dateStr);
  }
  ensureDailyNote(dateStr: string): Promise<NoteFile> {
    return this.daily.ensureDailyNote(dateStr);
  }
  clearIndex(): void { this.daily.clearIndex(); }

  /** 手动刷新：清本地解析缓存与索引，同时作废远程区间缓存 */
  invalidateCache(): void {
    this.daily.fileCache.clear();
    this.daily.clearIndex();
    this.clearRemoteCache();
  }

  // ---- 远程来源聚合 ----

  /** 只在「启用 + 地址 + 令牌」三项齐全时挂载，避免填一半就刷 401 */
  buildRemoteSources(): NoteSource[] {
    const s = this.settings || {};
    const out: NoteSource[] = [];
    if (s.memosEnabled && s.memosBaseUrl && s.memosToken) {
      out.push(new MemosSource({ baseUrl: s.memosBaseUrl, token: s.memosToken }));
    }
    if (s.blinkoApiEnabled && s.blinkoBaseUrl && s.blinkoApiKey) {
      out.push(new BlinkoSource({ baseUrl: s.blinkoBaseUrl, apiKey: s.blinkoApiKey }));
    }
    return out;
  }

  /** 设置变更后调用：下次渲染一定重新拉 */
  clearRemoteCache(): void { this.remoteCache.clear(); }

  private cacheRemoteEntries(key: string, entries: NoteEntry[]): void {
    this.remoteCache.set(key, { at: Date.now(), entries });
    while (this.remoteCache.size > this.remoteCacheMax) {
      const oldest = this.remoteCache.keys().next().value;
      if (oldest === undefined) break;
      this.remoteCache.delete(oldest);
    }
  }

  private mergeIntoBuckets(results: Map<string, NoteEntry[]>, entries: NoteEntry[]): void {
    for (const entry of entries) {
      const bucket = results.get(entry.dateStr);
      if (bucket) bucket.push(entry);
    }
  }

  /**
   * 取 [start, end] 区间条目，按 dateStr 分桶。
   * 每一天都建桶（哪怕是空数组）—— 与 Obsidian 侧语义一致，空桶是「这天可见」的标记。
   */
  async getEntriesForRange(start: RangeDateLike, end: RangeDateLike): Promise<Map<string, NoteEntry[]>> {
    const startDate = start.format("YYYY-MM-DD");
    const endDate = end.format("YYYY-MM-DD");
    const results = new Map<string, NoteEntry[]>();
    const days: string[] = [];
    let cur = startDate;
    // 上限防止异常日期对象导致死循环（年视图也只有 366 天）
    for (let guard = 0; guard < 3660 && cur <= endDate; guard++) {
      days.push(cur);
      results.set(cur, []);
      cur = addDays(cur, 1);
    }
    if (!days.length) return results;

    // 本地可写来源：单源失败不能把整个日历打空
    try {
      const local = await this.daily.listEntries(days[0], days[days.length - 1]);
      this.mergeIntoBuckets(results, local);
    } catch (err) {
      this.lastRemoteErrors.daily = err instanceof Error ? err.message : String(err);
    }

    const sources = this.buildRemoteSources();
    if (!sources.length) return results;

    const key = `${startDate}..${endDate}`;
    const cached = this.remoteCache.get(key);
    if (cached && Date.now() - cached.at < this.remoteCacheTtl) {
      this.mergeIntoBuckets(results, cached.entries);
      return results;
    }

    const agg = new AggregateSource(sources);
    const { entries, errors } = await agg.listEntries(startDate, endDate);
    this.lastRemoteErrors = errors;
    this.cacheRemoteEntries(key, entries);
    this.mergeIntoBuckets(results, entries);
    return results;
  }
}
