// apps/siyuan/index.ts — 思源插件入口（DEC-032）
//
// 思源加载器（app/src/plugin/loader.ts）用 window.eval 执行 index.js，
// 传入 (require, module, exports)，再取 `module.exports.default`：
//   · 产物必须是 CommonJS；
//   · 必须 `extends require("siyuan").Plugin`（加载器会做 instanceof 校验）；
//   · CSS 由宿主自动加载同目录 index.css。
//
// 除 require("siyuan") 外不依赖任何运行时包：渲染引擎、解析器、远程聚合
// 全部从仓库源码 bundle 进来。

import { prepareHostEnvironment, mountTimeNote } from "../bootstrap";
import { REFERENCE_SETTINGS } from "../../hosts/memory/adapter";
import type { HostAdapter, TimenoteSettings } from "../../hosts/types";
import { HostNoteService } from "../../sources/host-service";
import { SiyuanKernel, createFetchTransport } from "../../hosts/siyuan/kernel";
import { SiyuanFileStore } from "../../hosts/siyuan/file-store";
import { createSiyuanHostAdapter } from "../../hosts/siyuan/adapter";
import { buildSettingsPanel } from "../shared/settings";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk: any = require("siyuan");
const PluginBase: any = sdk.Plugin;

const TAB_TYPE = "timenote_calendar";
const SETTINGS_KEY = "timenote-settings.json";

/** 与 Obsidian 默认值一致，另加思源专有项；本地 Blinko 导出通道在思源不存在 */
export const DEFAULT_SIYUAN_SETTINGS: TimenoteSettings = {
  ...REFERENCE_SETTINGS,
  includeBlinko: false,
  dailyNoteTemplate: "off",
  siyuanNotebookId: ""
};

export default class TimeNoteSiyuanPlugin extends PluginBase {
  /** 共享引用：Object.assign 载入已存设置后，adapter / service 读到的仍是同一份 */
  settings: TimenoteSettings = { ...DEFAULT_SIYUAN_SETTINGS };

  // TODO(types): 渐进替换为显式字段声明（与 main.ts 同策略）
  [key: string]: any;

  onload(): void {
    // 必须早于任何视图创建：装 DOM 垫片 + 注入零依赖 nativeMoment
    prepareHostEnvironment();

    this.setupService();
    this.registerUi();

    // loadData 是异步的；settings 是共享引用，回来后 Object.assign 立即生效，
    // 不需要重建 service / adapter。
    Promise.resolve(this.loadData(SETTINGS_KEY))
      .then((data: any) => {
        if (data && typeof data === "object") Object.assign(this.settings, data);
        this.syncStoreConfig();
        if (this.rendererRef) void this.rendererRef.renderView();
      })
      .catch((err: any) => console.warn("[TimeNote/思源] 读取设置失败", err));
  }

  private setupService(): void {
    const kernel = new SiyuanKernel(createFetchTransport());
    this.store = new SiyuanFileStore({
      kernel,
      folder: this.settings.periodicNotesFolder,
      notebookId: this.settings.siyuanNotebookId,
      warn: (msg: string) => console.warn(msg)
    });
    this.service = new HostNoteService({ store: this.store, settings: this.settings });
    this.adapter = createSiyuanHostAdapter({
      settings: this.settings,
      service: this.service,
      store: this.store,
      sdk,
      app: this.app,
      eventBus: this.eventBus,
      saveSettings: () => this.saveSettings()
    });
  }

  private syncStoreConfig(): void {
    if (!this.store) return;
    this.store.setFolder(this.settings.periodicNotesFolder);
    this.store.setNotebookId(this.settings.siyuanNotebookId || "");
    this.service?.clearRemoteCache();
    this.service?.clearIndex();
  }

  private saveSettings(): Promise<void> {
    return Promise.resolve(this.saveData(SETTINGS_KEY, this.settings))
      .then(() => {
        this.syncStoreConfig();
        if (this.rendererRef) void this.rendererRef.renderView();
      });
  }

  /**
   * 渲染异常必须**看得见**。
   * 旧写法 `void renderer.onOpen()` 会把异常吞成 unhandledRejection：控制台
   * 里只有一行小红字，页面上却只剩「画了一半的工具栏」，用户完全无从判断。
   * 现在把错误直接写进页签，方便一眼定位（真机反馈时只要截图即可）。
   */
  private reportRenderError(el: HTMLElement | null, err: unknown): void {
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    console.error("[TimeNote/思源] 日历渲染失败", err);
    if (!el || typeof document === "undefined") return;
    const box = document.createElement("div");
    box.className = "timenote-host-error";
    box.style.cssText =
      "margin:12px;padding:12px 14px;border:1px solid #d9534f;border-radius:6px;" +
      "background:rgba(217,83,79,.08);color:#d9534f;font:12px/1.6 monospace;" +
      "white-space:pre-wrap;word-break:break-all;user-select:text;";
    box.textContent = "TimeNote 渲染失败，请把下面这段发给开发者：\n" + message;
    el.appendChild(box);
  }

  private registerUi(): void {
    const plugin = this;

    this.addTab({
      type: TAB_TYPE,
      init() {
        // 3.8 的自定义页签模型仍提供 element；老版本 / 变体可能叫 panelElement。
        const el: HTMLElement | null = this.element || this.panelElement || null;
        if (!el) {
          console.error("[TimeNote/思源] 自定义页签没有可用的 element，无法挂载日历");
          return;
        }
        el.style.display = "block";
        el.style.height = "100%";
        el.style.overflow = "auto";
        el.style.padding = "0";
        try {
          const renderer = mountTimeNote(el, plugin.adapter as HostAdapter);
          plugin.rendererRef = renderer;
          renderer.onOpen().catch((err: unknown) => plugin.reportRenderError(el, err));
        } catch (err) {
          plugin.reportRenderError(el, err);
        }
      },
      beforeDestroy() {
        if (plugin.rendererRef) void plugin.rendererRef.onClose();
      },
      destroy() {
        plugin.rendererRef = null;
      }
    });

    this.addTopBar({
      icon: "iconCalendar",
      title: "TimeNote 时间笔记",
      position: "right",
      callback: () => plugin.openCalendar()
    });

    // 设置面板：思源用 sdk.Setting，内容由 apps/shared/settings.ts 生成。
    // SDK 版本差异不该让插件加载失败，所以整段包在 try/catch 里。
    try {
      if (typeof sdk.Setting === "function") {
        this.settingPanel = new sdk.Setting({
          confirmCallback: () => { void plugin.saveSettings(); }
        });
        this.settingPanel.addItem({
          title: "TimeNote 设置",
          direction: "column",
          createActionElement: () => buildSettingsPanel({
            settings: plugin.settings,
            host: "siyuan",
            notice: (msg: string) => plugin.adapter.notice(msg),
            onChange: () => plugin.saveSettings()
          })
        });
      }
    } catch (err) {
      console.warn("[TimeNote/思源] 设置面板注册失败（不影响日历）", err);
    }
  }

  openCalendar(): void {
    try {
      if (typeof sdk.openTab !== "function") {
        throw new Error("当前思源 SDK 没有导出 openTab()，无法打开自定义页签");
      }
      sdk.openTab({
        app: this.app,
        custom: {
          id: this.name + TAB_TYPE,
          title: "TimeNote 时间笔记",
          icon: "iconCalendar"
        }
      });
    } catch (err) {
      // 点按钮「没反应」是最难排查的一类问题，这里必须出声。
      const message = err instanceof Error ? err.message : String(err);
      console.error("[TimeNote/思源] 打开日历页签失败", err);
      if (typeof sdk.showMessage === "function") {
        sdk.showMessage("TimeNote 打开失败：" + message, 6000, "error");
      }
    }
  }

  onunload(): void {
    if (this.rendererRef) {
      void this.rendererRef.onClose();
      this.rendererRef = null;
    }
  }
}
