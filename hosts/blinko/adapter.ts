// hosts/blinko/adapter.ts — Blinko 宿主能力胶水（DEC-032）
//
// 通用部分交给 apps/shared/host-adapter.ts，这里只处理 Blinko 特有的：
// toast、跳转弹窗、事件订阅、设置落盘（StorageState / localStorage）。
//
// ⚠️ Blinko 的 eventBus 是裸 EventEmitter，插件侧没有稳定的「笔记变更」事件名。
//    所以 onExternalChange 用「低频轮询 + 若干常见事件名」兜底：
//    轮询只在页面可见时触发，默认 120 秒，避免打断拖拽、也省流量。

import { createSharedHostAdapter } from "../../apps/shared/host-adapter";
import type { HostGlue } from "../../apps/shared/host-adapter";
import { openNoteDialog } from "../../apps/shared/dialogs";
import type { HostAdapter, TimenoteSettings } from "../types";
import type { HostNoteService } from "../../sources/host-service";
import type { BlinkoNoteStore } from "./note-store";
import type { NoteEntry } from "../../sources/types";

export interface BlinkoHostDeps {
  settings: TimenoteSettings;
  service: HostNoteService;
  store: BlinkoNoteStore;
  /** window.Blinko */
  blinko: any;
  saveSettings(): Promise<void>;
  /** 轮询间隔毫秒，默认 120000；测试可传 0 关闭 */
  pollMs?: number;
  /** 注入计时器，测试可替换 */
  timers?: { setInterval: (cb: () => void, ms: number) => any; clearInterval: (id: any) => void };
}

const COMMON_EVENTS = ["note:update", "notes:update", "refresh", "globalRefresh", "plugin:refresh"];

export function createBlinkoHostAdapter(deps: BlinkoHostDeps): HostAdapter {
  const { blinko, store, service, settings } = deps;
  const timers = deps.timers || {
    setInterval: (cb: () => void, ms: number) => setInterval(cb, ms),
    clearInterval: (id: any) => clearInterval(id)
  };
  const pollMs = deps.pollMs === undefined ? 120000 : deps.pollMs;

  const notice = (message: string) => {
    const toast = blinko && blinko.toast;
    if (toast) {
      if (/失败|错误|无法|找不到/.test(message) && typeof toast.error === "function") {
        toast.error(message);
        return;
      }
      if (typeof toast.success === "function") { toast.success(message); return; }
    }
    console.log(`[TimeNote] ${message}`);
  };

  const glue: HostGlue = {
    settings,
    service,
    notice,
    saveSettings: deps.saveSettings,
    setIcon(el: HTMLElement, _icon: string) {
      if (el && !el.textContent) el.textContent = "↻";
    },

    async openEntry(entry: NoteEntry) {
      const noteId = store.getNoteIdAt(entry.filePath, entry.lineNum);
      const note = noteId ? store.findNoteById(noteId) : undefined;
      if (!note) {
        // 远程聚合条目已在通用层拦下；这里是索引还没热起来的本地条目
        notice(`没找到 ${entry.dateStr} 对应的 Blinko 笔记，点一下刷新再试`);
        return;
      }
      openNoteDialog({
        title: `${entry.dateStr} · ${entry.timeStr || "全天"}`,
        text: String(note.content || ""),
        readOnly: true
      });
    },

    async openDailyNote(dateStr: string) {
      const notes = store.getNotes(dateStr);
      const text = notes.length
        ? notes.map((n, i) => `# ${i + 1}\n${String(n.content || "")}`).join("\n\n")
        : `（${dateStr} 还没有 Blinko 笔记。点日历里的「+ 记一条」即可新建。）`;
      openNoteDialog({ title: `${dateStr} · Blinko 笔记`, text, readOnly: true });
    },

    onExternalChange(cb: () => void) {
      const handler = () => {
        store.invalidateList();
        cb();
      };
      const bus = blinko && blinko.eventBus;
      if (bus && typeof bus.on === "function") {
        for (const name of COMMON_EVENTS) bus.on(name, handler);
      }
      let id: any = null;
      if (pollMs > 0) {
        id = timers.setInterval(() => {
          const doc = (globalThis as any).document;
          if (doc && doc.visibilityState && doc.visibilityState !== "visible") return;
          handler();
        }, pollMs);
      }
      return () => {
        if (id !== null) timers.clearInterval(id);
        if (bus && typeof bus.off === "function") {
          for (const name of COMMON_EVENTS) bus.off(name, handler);
        }
      };
    }
  };

  return createSharedHostAdapter(glue);
}
