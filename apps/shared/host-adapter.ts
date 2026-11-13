// apps/shared/host-adapter.ts — 两个新宿主共用的 HostAdapter 骨架（DEC-032）
//
// HostAdapter 的 14 个能力里，绝大多数与平台无关：
//   · 数据读写 → 一律委托 HostNoteService（内部是 DailySource）
//   · 弹窗     → 一律用 apps/shared/dialogs.ts 的纯 DOM 版本
//   · 设置     → 共享引用 + 落盘回调 + 作废远程缓存
// 宿主真正要自己写的只有 5 件事：通知、图标、跳转、订阅变更、打开当天日记。
//
// 这样思源 / Blinko 的 adapter 各只剩几十行胶水，行为不会分叉。

import type { HostAdapter, TimenoteSettings, QuickAddHooks } from "../../hosts/types";
import type { NoteEntry } from "../../sources/types";
import type { MomentLike } from "../../ui/date";
import type { HostNoteService } from "../../sources/host-service";
import { sourceLabel } from "../../sources/meta";
import { openQuickAddDialog, openSubItemsDialog } from "./dialogs";

export interface HostGlue {
  settings: TimenoteSettings;
  saveSettings(): Promise<void>;
  service: HostNoteService;
  notice(message: string): void;
  /** 无图标体系的宿主可不实现，默认 no-op */
  setIcon?(el: HTMLElement, icon: string): void;
  /** 跳转到某条记录的原文。只读来源由通用层先拦下 */
  openEntry(entry: NoteEntry): Promise<void>;
  /** 打开 / 创建某一天的日记（DEC-017 语义） */
  openDailyNote(dateStr: string): Promise<void>;
  /** 订阅外部数据变更，返回取消订阅函数 */
  onExternalChange(cb: () => void): (() => void) | void;
  /** 覆盖默认的纯 DOM 弹窗（可选） */
  openQuickAdd?(
    dateStr: string, onSaved: () => void, prefillTime?: string,
    prefillEndTime?: string | undefined, prefillType?: string, hooks?: QuickAddHooks
  ): void;
  openSubItems?(entry: NoteEntry): void;
}

export function createSharedHostAdapter(glue: HostGlue): HostAdapter {
  const { service, settings } = glue;

  return {
    get settings(): TimenoteSettings { return settings; },

    async saveSettings() {
      // 与 Obsidian 侧 saveSettings 一致：改完设置立即作废远程缓存，
      // 否则用户填完 memos 地址还得等 60 秒才看到数据。
      await glue.saveSettings();
      service.clearRemoteCache();
    },

    notice(message: string) { glue.notice(message); },
    setIcon(el: HTMLElement, icon: string) {
      if (glue.setIcon) glue.setIcon(el, icon);
    },

    openQuickAdd(dateStr, onSaved, prefillTime, prefillEndTime, prefillType, hooks) {
      if (glue.openQuickAdd) {
        glue.openQuickAdd(dateStr, onSaved, prefillTime, prefillEndTime, prefillType, hooks);
        return;
      }
      openQuickAddDialog(
        {
          settings,
          notice: glue.notice,
          // DEC-033：第 7 参数 rawLines 固定 null（跨天搬移专用），第 8 参数才是正文。
          addEntry: (d, t, c, task, tags, end, body) =>
            service.addEntry(d, t, c, task, tags, end, null, body)
        },
        dateStr, onSaved, prefillTime, prefillEndTime, prefillType, hooks
      );
    },

    openSubItems(entry: NoteEntry) {
      if (glue.openSubItems) { glue.openSubItems(entry); return; }
      openSubItemsDialog(entry);
    },

    async openEntry(entry: NoteEntry) {
      if (entry && entry.readonly) {
        glue.notice(`${sourceLabel(entry.source)} 记录来自远程接口，当前宿主里没有对应笔记`);
        return;
      }
      await glue.openEntry(entry);
    },

    async openDailyNote(dateStr: string) {
      await glue.openDailyNote(dateStr);
    },

    onExternalChange(cb: () => void) {
      return glue.onExternalChange(cb);
    },

    getEntriesForRange(start: MomentLike, end: MomentLike) {
      return service.getEntriesForRange(start, end);
    },

    invalidateCache() {
      // 与 Obsidian 的「刷新」按钮同语义：只清本地解析缓存与索引，
      // 不动 60 秒远程缓存（避免频繁刷新把接口打爆）。
      service.daily.fileCache.clear();
      service.clearIndex();
    },

    toggleTask(entry: NoteEntry) { return service.toggleTask(entry); },
    updateEntryTime(entry: NoteEntry, startSec: number, endSec: number) {
      return service.updateEntryTime(entry, startSec, endSec);
    },
    updateEntryPointTime(entry: NoteEntry, startSec: number) {
      return service.updateEntryPointTime(entry, startSec);
    },
    moveEntryToDate(entry: NoteEntry, targetDate: string, startSec: number, endSec: number) {
      return service.moveEntryToDate(entry, targetDate, startSec, endSec);
    }
  };
}
