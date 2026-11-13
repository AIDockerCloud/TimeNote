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

  private registerUi(): void {
    const plugin = this;

    this.addTab({
      type: TAB_TYPE,
      init() {
        const el: HTMLElement = this.element;
        el.style.display = "block";
        el.style.height = "100%";
        el.style.overflow = "auto";
        el.style.padding = "0";
        const renderer = mountTimeNote(el, plugin.adapter as HostAdapter);
        plugin.rendererRef = renderer;
        void renderer.onOpen();
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
    if (typeof sdk.openTab === "function") {
      sdk.openTab({
        app: this.app,
        custom: {
          id: this.name + TAB_TYPE,
          title: "TimeNote 时间笔记",
          icon: "iconCalendar"
        }
      });
    }
  }

  onunload(): void {
    if (this.rendererRef) {
      void this.rendererRef.onClose();
      this.rendererRef = null;
    }
  }
}
