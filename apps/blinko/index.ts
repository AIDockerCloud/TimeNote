// apps/blinko/index.ts — Blinko 插件入口（DEC-032）
//
// Blinko 用 SystemJS 加载插件：System.import("/plugins/<name>/index.js")，
// 取 `module.default` 作为插件类，调用 `new Plugin()` → `init()` / `destroy()`。
// 打包脚本会把本文件编成 IIFE 再包一层 System.register，所以这里只写类，
// 不出现 System.register / window.Blinko 之外的运行时依赖。
//
// 全局 API（已核实 blinko-space/blinko 主仓 app/src/store/plugin/）：
//   addToolBarIcon / showDialog / closeDialog / toast / api / store.StorageState
//   renderSettingPanel()（withSettingPanel = true 时宿主会调用）

import { prepareHostEnvironment, mountTimeNote } from "../bootstrap";
import { REFERENCE_SETTINGS } from "../../hosts/memory/adapter";
import type { HostAdapter, TimenoteSettings } from "../../hosts/types";
import { HostNoteService } from "../../sources/host-service";
import { BlinkoNoteApi } from "../../hosts/blinko/api";
import { BlinkoNoteStore } from "../../hosts/blinko/note-store";
import { createBlinkoHostAdapter } from "../../hosts/blinko/adapter";
import { buildSettingsPanel } from "../shared/settings";

const SETTINGS_KEY = "timenote-settings";
const TOOLBAR_NAME = "timenote-calendar";

/** 与 Obsidian 默认值一致，另加 Blinko 专有项 */
export const DEFAULT_BLINKO_SETTINGS: TimenoteSettings = {
  ...REFERENCE_SETTINGS,
  includeBlinko: false,
  dailyNoteTemplate: "off",
  blinkoLookbackDays: 90
};

export default class TimeNoteBlinkoPlugin {
  // 插件元数据（plugin.json 是权威，这里只是运行时展示用）
  name = "timenote-blinko";
  author = "AIDockerCloud";
  url = "https://github.com/AIDockerCloud/TimeNote";
  version = "1.1.2";
  minAppVersion = "0.0.0";
  withSettingPanel = true;

  /** 共享引用：设置面板直接改它，HostAdapter 与 HostNoteService 读同一份 */
  settings: TimenoteSettings = { ...DEFAULT_BLINKO_SETTINGS };

  // TODO(types): 渐进替换为显式字段声明
  [key: string]: any;

  init(): void {
    // 必须早于任何视图创建：DOM 垫片 + 零依赖 nativeMoment
    prepareHostEnvironment();

    const B = (globalThis as any).Blinko;
    if (!B) {
      console.error("[TimeNote/Blinko] window.Blinko 不可用，插件未初始化");
      return;
    }
    this.blinko = B;

    // 设置持久化：Blinko 的 StorageState 就是带 JSON 解析的 localStorage 封装
    try {
      this.storage = new B.store.StorageState({ key: SETTINGS_KEY, default: {} });
      const saved = this.storage.value;
      if (saved && typeof saved === "object") Object.assign(this.settings, saved);
    } catch (err) {
      console.warn("[TimeNote/Blinko] 读取设置失败，使用默认值", err);
    }

    this.setupService();
    this.registerUi();
  }

  private setupService(): void {
    const api = new BlinkoNoteApi(this.blinko.api);
    this.store = new BlinkoNoteStore({
      api,
      folder: this.settings.periodicNotesFolder,
      lookbackDays: () => Number(this.settings.blinkoLookbackDays) || 90,
      warn: (msg: string) => console.warn(msg)
    });
    this.service = new HostNoteService({ store: this.store, settings: this.settings });
    this.adapter = createBlinkoHostAdapter({
      settings: this.settings,
      service: this.service,
      store: this.store,
      blinko: this.blinko,
      saveSettings: () => this.saveSettings()
    });
  }

  private saveSettings(): Promise<void> {
    try {
      if (this.storage && typeof this.storage.save === "function") {
        this.storage.save({ ...this.settings });
      } else {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      }
    } catch (err) {
      this.adapter.notice(`设置保存失败：${err instanceof Error ? err.message : String(err)}`);
      return Promise.resolve();
    }
    this.store.setFolder(this.settings.periodicNotesFolder);
    this.store.invalidateList();
    this.service.clearRemoteCache();
    this.service.clearIndex();
    if (this.rendererRef) void this.rendererRef.renderView();
    return Promise.resolve();
  }

  private registerUi(): void {
    const plugin = this;
    // 工具栏 popover 只有几百 px，放不下整张周视图；给一个按钮打开全屏对话框。
    this.blinko.addToolBarIcon({
      name: TOOLBAR_NAME,
      icon: "tabler:calendar-time",
      tooltip: "TimeNote 时间笔记",
      placement: "bottom",
      maxWidth: 320,
      content: () => {
        const box = document.createElement("div");
        box.className = "timenote-blinko-launcher";
        box.style.padding = "10px";
        const btn = document.createElement("button");
        btn.textContent = "打开 TimeNote 日历";
        Object.assign(btn.style, {
          border: "1px solid currentColor", background: "transparent",
          color: "inherit", borderRadius: "6px", padding: "8px 12px",
          cursor: "pointer", width: "100%"
        } as any);
        btn.onclick = () => {
          if (this.blinko.closeToolBarContent) this.blinko.closeToolBarContent(TOOLBAR_NAME);
          plugin.openCalendar();
        };
        const hint = document.createElement("div");
        hint.textContent = "时间轴 / 全周期日历 · 可聚合 memos 与远程 Blinko";
        hint.style.cssText = "opacity:.65;font-size:12px;margin-top:8px;";
        box.append(btn, hint);
        return box;
      }
    });
  }

  renderSettingPanel(): HTMLElement {
    return buildSettingsPanel({
      settings: this.settings,
      host: "blinko",
      notice: (msg: string) => this.adapter.notice(msg),
      onChange: () => this.saveSettings(),
      footer: (root: HTMLElement) => {
        const tip = document.createElement("div");
        tip.textContent = "提示：本地记录直接写入 Blinko 笔记，时间存在行首与 metadata.timenote 中。";
        tip.style.cssText = "opacity:.6;font-size:11px;margin-top:14px;";
        root.appendChild(tip);
      }
    });
  }

  openCalendar(): void {
    if (!this.blinko.showDialog) return;
    // 每次打开都重建渲染引擎：Blinko 的对话框关闭没有回调，
    // 复用旧 renderer 会指向一个已经被销毁的容器。
    if (this.rendererRef) {
      void this.rendererRef.onClose();
      this.rendererRef = null;
    }
    const plugin = this;
    this.blinko.showDialog({
      title: "TimeNote 时间笔记",
      size: "full",
      content: () => {
        const root = document.createElement("div");
        root.className = "timenote-blinko-root";
        root.style.cssText = "height:100%;min-height:520px;overflow:auto;";
        // content() 返回的节点还没插入文档，等宿主挂载完再建渲染引擎
        setTimeout(() => {
          const renderer = mountTimeNote(root, plugin.adapter as HostAdapter);
          plugin.rendererRef = renderer;
          void renderer.onOpen();
        }, 0);
        return root;
      }
    });
  }

  destroy(): void {
    if (this.rendererRef) {
      void this.rendererRef.onClose();
      this.rendererRef = null;
    }
    // PluginApiStore 没有 removeToolBarIcon，图标会留到下次页面刷新；
    // 关闭对话框避免留下一个指向已销毁 renderer 的 DOM。
    if (this.blinko && typeof this.blinko.closeDialog === "function") {
      this.blinko.closeDialog();
    }
  }
}
