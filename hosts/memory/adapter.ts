// hosts/memory/adapter.ts — 内存参考宿主（DEC-025）
//
// 不是给最终用户用的第四个插件，而是：
//   ① 证明 HostAdapter 契约**不依赖 Obsidian**：这里没有一个 obsidian import；
//   ② 给测试提供可断言的宿主行为（通知、写操作、缓存失效都能被记录）；
//   ③ 未来 `apps/web/` 独立 Web 演示宿主的起点。
//
// 有了它，「三宿主共用渲染层」第一次有了第二份可运行的实现，
// 而不是只靠静态断言声称解耦完成。
import { nativeMoment } from "../../ui/native-moment";
import type { MomentLike } from "../../ui/date";
import type { NoteEntry } from "../../sources/types";
import type { HostAdapter, TimenoteSettings } from "../types";

export const REFERENCE_SETTINGS: TimenoteSettings = {
  periodicNotesFolder: "SpiralNotes",
  includeBlinko: false,
  defaultView: "week",
  startHour: 0,
  endHour: 24,
  slotHeight: 52,
  firstDayOfWeek: 1,
  parseAllBullets: true,
  quickAddSection: "## 灵感闪念",
  layoutMode: "block",
  defaultDuration: 60,
  defaultAddType: "block",
  allDayHeight: 36,
  elasticTimeline: true,
  memosEnabled: false,
  memosBaseUrl: "",
  memosToken: "",
  blinkoApiEnabled: false,
  blinkoBaseUrl: "",
  blinkoApiKey: ""
};

export interface MemoryHostState {
  /** 收到的所有通知 */
  notices: string[];
  /** 被打开的快速记录弹窗参数 */
  quickAdds: any[];
  /** 被打开的子项详情 */
  subItems: NoteEntry[];
  /** 被请求跳转的原文 / 日记 */
  opened: Array<{ kind: string; value: string }>;
  /** invalidateCache 被调用的次数 */
  cacheClears: number;
  /** saveSettings 被调用的次数 */
  saves: number;
  /** 当前订阅的变更回调 */
  listeners: Array<() => void>;
}

export interface MemoryHostOptions {
  settings?: Partial<TimenoteSettings>;
  /** 初始条目，按 dateStr 分桶 */
  entries?: Map<string, NoteEntry[]> | Record<string, NoteEntry[]>;
}

/**
 * 构造内存宿主。所有写操作直接改内存里的条目，不碰任何文件系统。
 */
export function createMemoryHostAdapter(opts: MemoryHostOptions = {}): HostAdapter & { state: MemoryHostState } {
  const settings: TimenoteSettings = { ...REFERENCE_SETTINGS, ...(opts.settings || {}) };
  const buckets = new Map<string, NoteEntry[]>(
    opts.entries instanceof Map
      ? [...opts.entries.entries()].map(([k, v]) => [k, v.slice()])
      : Object.entries(opts.entries || {}).map(([k, v]) => [k, v.slice()])
  );

  const state: MemoryHostState = {
    notices: [], quickAdds: [], subItems: [], opened: [],
    cacheClears: 0, saves: 0, listeners: []
  };

  const findEntry = (entry: NoteEntry): NoteEntry | undefined => {
    for (const list of buckets.values()) {
      const hit = list.find(e => e.id === entry.id);
      if (hit) return hit;
    }
    return undefined;
  };

  return {
    state,
    get settings() { return settings; },

    async saveSettings() { state.saves++; },
    notice(message: string) { state.notices.push(message); },
    setIcon(_el: HTMLElement, _icon: string) { /* 内存宿主没有图标体系 */ },

    openQuickAdd(dateStr, onSaved, prefillTime, prefillEndTime, prefillType) {
      state.quickAdds.push({ dateStr, onSaved, prefillTime, prefillEndTime, prefillType });
    },
    openSubItems(entry: NoteEntry) { state.subItems.push(entry); },

    async openEntry(entry: NoteEntry) {
      state.opened.push({ kind: "entry", value: entry.id });
    },
    async openDailyNote(dateStr: string) {
      state.opened.push({ kind: "daily", value: dateStr });
    },
    onExternalChange(cb: () => void) {
      state.listeners.push(cb);
      return () => {
        const i = state.listeners.indexOf(cb);
        if (i >= 0) state.listeners.splice(i, 1);
      };
    },

    async getEntriesForRange(start: MomentLike, end: MomentLike) {
      const out = new Map<string, NoteEntry[]>();
      const cur = nativeMoment(start.valueOf());
      const endStr = end.format("YYYY-MM-DD");
      for (let guard = 0; guard < 3660; guard++) {
        const key = cur.format("YYYY-MM-DD");
        out.set(key, (buckets.get(key) || []).slice());
        if (key === endStr) break;
        cur.add(1, "day");
      }
      return out;
    },

    invalidateCache() { state.cacheClears++; },

    async toggleTask(entry: NoteEntry) {
      const hit = findEntry(entry);
      if (!hit || hit.readonly) return false;
      hit.isCompleted = !hit.isCompleted;
      return true;
    },
    async updateEntryTime(entry: NoteEntry, startSec: number, endSec: number) {
      const hit = findEntry(entry);
      if (!hit || hit.readonly) return false;
      hit.startSeconds = startSec; hit.endSeconds = endSec;
      return true;
    },
    async updateEntryPointTime(entry: NoteEntry, startSec: number) {
      const hit = findEntry(entry);
      if (!hit || hit.readonly) return false;
      hit.startSeconds = startSec; hit.endSeconds = startSec;
      return true;
    },
    async moveEntryToDate(entry: NoteEntry, targetDate: string) {
      const hit = findEntry(entry);
      if (!hit || hit.readonly) return false;
      for (const [key, list] of buckets) {
        const i = list.indexOf(hit);
        if (i >= 0) list.splice(i, 1);
        if (key === entry.dateStr) break;
      }
      if (!buckets.has(targetDate)) buckets.set(targetDate, []);
      hit.dateStr = targetDate;
      buckets.get(targetDate)!.push(hit);
      return true;
    }
  };
}
