// hosts/siyuan/adapter.ts — 思源宿主能力胶水（DEC-032）
//
// 通用部分（数据 / 弹窗 / 设置）由 apps/shared/host-adapter.ts 承担，
// 这里只实现思源特有的 5 件事：通知、图标、跳转、事件订阅、设置落盘。

import { createSharedHostAdapter } from "../../apps/shared/host-adapter";
import type { HostGlue } from "../../apps/shared/host-adapter";
import type { HostAdapter, TimenoteSettings } from "../types";
import type { HostNoteService } from "../../sources/host-service";
import type { SiyuanFileStore } from "./file-store";
import type { NoteEntry } from "../../sources/types";

export interface SiyuanHostDeps {
  settings: TimenoteSettings;
  service: HostNoteService;
  store: SiyuanFileStore;
  /** require("siyuan") 拿到的 SDK，便于测试注入 */
  sdk: any;
  /** plugin.app */
  app: any;
  /** plugin.eventBus（思源插件实例自带） */
  eventBus: { on(name: string, cb: (e: any) => void): void; off(name: string, cb: (e: any) => void): void };
  saveSettings(): Promise<void>;
}

/** 思源没有 Obsidian 那套图标名，退化成字符（渲染层只有刷新按钮用到） */
function applySiyuanIcon(el: HTMLElement, icon: string): void {
  if (!el) return;
  const glyph = /refresh|reload|sync/i.test(icon) ? "↻" : "•";
  if (!el.textContent) el.textContent = glyph;
}

export function createSiyuanHostAdapter(deps: SiyuanHostDeps): HostAdapter {
  const { sdk, app, store, service, settings } = deps;

  const notice = (message: string) => {
    if (sdk && typeof sdk.showMessage === "function") {
      sdk.showMessage(message, 4000, "info");
    } else {
      console.log(`[TimeNote] ${message}`);
    }
  };

  const openDoc = async (docId: string) => {
    if (!docId) return;
    if (sdk && typeof sdk.openTab === "function") {
      await sdk.openTab({ app, doc: { id: docId } });
    }
  };

  const glue: HostGlue = {
    settings,
    service,
    notice,
    saveSettings: deps.saveSettings,
    setIcon: applySiyuanIcon,

    async openEntry(entry: NoteEntry) {
      const dateStr = entry && entry.dateStr;
      if (!dateStr) return;
      const docId = await store.getDocId(dateStr);
      if (!docId) {
        notice(`思源里找不到 ${dateStr} 的日记文档`);
        return;
      }
      await openDoc(docId);
    },

    async openDailyNote(dateStr: string) {
      let docId = await store.getDocId(dateStr);
      if (!docId) {
        // DEC-017 语义：不存在就按规则建好再打开
        await service.ensureDailyNote(dateStr);
        docId = await store.getDocId(dateStr);
      }
      if (!docId) {
        notice(`无法打开 ${dateStr} 日记：创建后仍拿不到文档 id`);
        return;
      }
      await openDoc(docId);
    },

    onExternalChange(cb: () => void) {
      // 思源把内核事务广播到 ws-main。只关心会影响文档内容的几类，
      // 避免每次鼠标移动 / 状态栏刷新都整视图重渲染。
      const handler = (ev: any) => {
        const cmd = ev && ev.detail && ev.detail.cmd;
        if (!cmd) { cb(); return; }
        if (/^(transactions|reloadDoc|rename|removeDoc|createdailynote|moveDoc|mount)$/i.test(String(cmd))) {
          cb();
        }
      };
      deps.eventBus.on("ws-main", handler);
      return () => deps.eventBus.off("ws-main", handler);
    }
  };

  return createSharedHostAdapter(glue);
}
