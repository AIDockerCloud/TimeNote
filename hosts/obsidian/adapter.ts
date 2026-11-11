// hosts/obsidian/adapter.ts — Obsidian 宿主的 HostAdapter 实现（DEC-025）
//
// 把渲染引擎需要的一切宿主能力集中在这里：vault 读写、workspace 跳转、Notice、
// setIcon、两个 Modal，以及「打开日记」的入口（建目录 / 建文件的规则在
// sources/daily.ts 的 ensureDailyNote 里，DEC-026）。
// ui/view.ts 因此完全不认识 Obsidian。
//
// 弹窗构造函数由 main.ts 通过 deps 注入，避免 main.ts ↔ adapter 的循环 import
// （两个 Modal 定义在 main.ts 里，且它们的静态断言仍指向该文件）。
import { Notice, TFile, setIcon } from "obsidian";
import { sourceLabel } from "../../sources/meta";
import type { HostAdapter, TimenoteSettings } from "../types";
import type { NoteEntry } from "../../sources/types";
import type { MomentLike } from "../../ui/date";

/** main.ts 注入的依赖（避免循环 import） */
export interface ObsidianHostDeps {
  app: any;
  plugin: any;
  /** DailyNoteService 实例 */
  service: any;
  /** QuickAddModal 构造函数 */
  QuickAddModal: any;
  /** SubItemsModal 构造函数 */
  SubItemsModal: any;
}

export function createObsidianHostAdapter(deps: ObsidianHostDeps): HostAdapter {
  const { app, plugin, service } = deps;

  return {
    get settings(): TimenoteSettings { return plugin.settings; },

    async saveSettings() {
      await plugin.saveSettings();
    },

    notice(message: string) {
      new Notice(message);
    },

    setIcon(el: HTMLElement, icon: string) {
      setIcon(el, icon);
    },

    openQuickAdd(dateStr, onSaved, prefillTime = "", prefillEndTime = undefined, prefillType = "") {
      new deps.QuickAddModal(
        app, plugin, dateStr, onSaved, prefillTime, prefillEndTime, prefillType
      ).open();
    },

    openSubItems(entry: NoteEntry) {
      new deps.SubItemsModal(app, entry).open();
    },

    async openEntry(entry: NoteEntry) {
      // 远程聚合来源没有对应的本地文件，跳转会静默失败 —— 明确告诉用户原因
      // 比「点了没反应」好（DEC-023）
      if (entry && entry.readonly) {
        new Notice(`${sourceLabel(entry.source)} 记录来自远程接口，Obsidian 里没有对应笔记`);
        return;
      }
      const file = app.vault.getAbstractFileByPath(entry.filePath);
      if (!(file instanceof TFile)) return;

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file, { eState: { line: Math.max(0, entry.lineNum - 1) } });
    },

    // DEC-017：存在则直接打开，不存在时按 QuickAdd 的目录规则创建后再打开。
    // 日 / 3 天 / 周视图的日期标题、时间线视图的「打开日记 ↗」共用这一入口。
    async openDailyNote(dateStr: string) {
      // 索引有 5 秒缓存，点击前强制重建，避免刚在别处创建的日记查不到
      service.clearIndex();
      // 建目录 / 建日记的规则已随 DEC-026 迁进 DailySource（它握有文件存储），
      // 这里只负责把「路径」换回真正的 TFile 交给 workspace 打开。
      let note = await service.findDailyNoteFile(dateStr);
      let file: any = note ? app.vault.getAbstractFileByPath(note.path) : null;

      if (!(file instanceof TFile)) {
        note = await service.ensureDailyNote(dateStr);
        file = app.vault.getAbstractFileByPath(note.path);
        if (file instanceof TFile) new Notice(`已创建并打开 ${dateStr} 日记`);
      }
      if (!(file instanceof TFile)) return;

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
    },

    onExternalChange(cb: () => void) {
      // 原实现用 ItemView.registerEvent(vault.on("modify", ...))；
      // 现在由 adapter 挂在 plugin 上，插件卸载时自动解绑，语义等价。
      const ref = app.vault.on("modify", cb);
      if (plugin.registerEvent) plugin.registerEvent(ref);
      return () => app.vault.offref(ref);
    },

    getEntriesForRange(start: MomentLike, end: MomentLike) {
      return service.getEntriesForRange(start, end);
    },

    invalidateCache() {
      // 与原「刷新」按钮逐字一致：只清本地解析缓存，不动远程缓存（DEC-023 的
      // 60 秒区间缓存由 saveSettings 单独作废，避免刷新按钮每次都打接口）。
      // DEC-027 起 Blinko 导出有了自己的缓存 Map，必须一起清 ——
      // 原实现两者共用 service.fileCache，一次 clear() 就都清了。
      service.fileCache.clear();
      service.dailyNoteIndex.clear();
      service.blinkoCache.clear();
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
