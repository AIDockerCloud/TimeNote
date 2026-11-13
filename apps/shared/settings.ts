// apps/shared/settings.ts — 两个新宿主共用的设置面板（DEC-032）
//
// Obsidian 的设置页是 `PluginSettingTab`（main.ts），思源用 `Setting`、
// Blinko 用 `renderSettingPanel()`，三者容器不同但**字段与语义必须一致**。
// 这里用「字段元数据 + 原生 DOM」生成面板，宿主只负责把返回的 HTMLElement
// 塞进自己的设置容器，并在 onChange 里落盘。
//
// 纯 DOM、内联样式，不依赖任何宿主 CSS / DOM 扩展。

import type { TimenoteSettings } from "../../hosts/types";

export type SettingsFieldType = "text" | "password" | "number" | "toggle" | "select";

export interface SettingsFieldSpec {
  key: string;
  label: string;
  group: string;
  type: SettingsFieldType;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  /** 只在指定宿主出现；留空 = 两端都有 */
  hosts?: Array<"siyuan" | "blinko">;
}

export const SETTINGS_GROUPS = ["视图", "记录与日记", "远程来源聚合", "宿主专有"] as const;

export const SETTINGS_FIELDS: SettingsFieldSpec[] = [
  // ---- 视图 ----
  {
    key: "defaultView", label: "默认视图", group: "视图", type: "select",
    options: [
      { value: "day", label: "日" }, { value: "3day", label: "3 天" },
      { value: "week", label: "周" }, { value: "month", label: "月" },
      { value: "quarter", label: "季度" }, { value: "year", label: "年" },
      { value: "timeline", label: "时间线" }
    ]
  },
  {
    key: "firstDayOfWeek", label: "每周起始日", group: "视图", type: "select",
    options: [{ value: "1", label: "周一" }, { value: "0", label: "周日" }]
  },
  {
    key: "layoutMode", label: "默认布局", group: "视图", type: "select",
    options: [{ value: "block", label: "时间块网格" }, { value: "compact", label: "紧凑流" }]
  },
  { key: "startHour", label: "时间轴起点（时）", group: "视图", type: "number", min: 0, max: 23 },
  { key: "endHour", label: "时间轴终点（时）", group: "视图", type: "number", min: 1, max: 24 },
  { key: "slotHeight", label: "每小时槽高（px）", group: "视图", type: "number", min: 28, max: 96 },
  { key: "allDayHeight", label: "全天区高度（px）", group: "视图", type: "number", min: 20, max: 120 },
  { key: "elasticTimeline", label: "自适应时间轴", group: "视图", type: "toggle", hint: "行高由内容决定；关闭后回到等距网格" },

  // ---- 记录与日记 ----
  { key: "periodicNotesFolder", label: "日记根目录", group: "记录与日记", type: "text", hint: "虚拟路径，形如 SpiralNotes" },
  { key: "quickAddSection", label: "快速记录插入标题", group: "记录与日记", type: "text", hint: "可写 ## 灵感闪念 / ### 随手记 指定层级" },
  { key: "dailyNoteTemplate", label: "新建日记模板", group: "记录与日记", type: "text", hint: "留空 = 内置结构；off = 关闭；也可填模板内容标识" },
  { key: "defaultDuration", label: "默认时长（分钟）", group: "记录与日记", type: "number", min: 5, max: 480 },
  {
    key: "defaultAddType", label: "新建记录默认类型", group: "记录与日记", type: "select",
    options: [{ value: "point", label: "时间点（只记时刻）" }, { value: "block", label: "时间块（起止时间）" }]
  },
  { key: "parseAllBullets", label: "解析所有无序列表项", group: "记录与日记", type: "toggle" },

  // ---- 远程来源聚合（三宿主一致）----
  { key: "memosEnabled", label: "聚合 memos", group: "远程来源聚合", type: "toggle" },
  { key: "memosBaseUrl", label: "memos 地址", group: "远程来源聚合", type: "text", hint: "如 https://memos.example.com" },
  { key: "memosToken", label: "memos 令牌", group: "远程来源聚合", type: "password" },
  { key: "blinkoApiEnabled", label: "聚合 Blinko 接口", group: "远程来源聚合", type: "toggle" },
  { key: "blinkoBaseUrl", label: "Blinko 地址", group: "远程来源聚合", type: "text", hint: "如 https://blinko.example.com" },
  { key: "blinkoApiKey", label: "Blinko API Key", group: "远程来源聚合", type: "password" },

  // ---- 宿主专有 ----
  {
    key: "siyuanNotebookId", label: "思源笔记本 ID", group: "宿主专有", type: "text",
    hint: "留空自动取第一个已打开的笔记本", hosts: ["siyuan"]
  },
  {
    key: "blinkoLookbackDays", label: "本地笔记回看天数", group: "宿主专有", type: "number",
    min: 7, max: 3650, hint: "每次同步拉取的天数；越大越费流量", hosts: ["blinko"]
  }
];

export interface BuildSettingsOptions {
  settings: TimenoteSettings;
  host: "siyuan" | "blinko";
  /** 字段变更后由宿主落盘；返回 Promise 时面板会等待 */
  onChange: (key: string, value: any) => void | Promise<void>;
  notice?: (msg: string) => void;
  /** 额外字段（宿主自定义设置） */
  extraFields?: SettingsFieldSpec[];
  /** 面板底部自定义区域（如「测试连接」按钮） */
  footer?: (container: HTMLElement) => void;
}

function styleOf(el: HTMLElement, s: Record<string, string>): void {
  Object.assign(el.style, s as any);
}

/**
 * 生成设置面板。返回的是一个完整 HTMLElement，宿主可自由挂载。
 * 所有控件都写回同一个 settings 引用（与 HostAdapter.settings 一致），
 * 再调 onChange 让宿主持久化并触发重渲染。
 */
export function buildSettingsPanel(opts: BuildSettingsOptions): HTMLElement {
  const doc = (globalThis as any).document;
  const root = doc.createElement("div");
  root.className = "timenote-plugin-settings";
  styleOf(root, {
    color: "inherit", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: "13px", maxWidth: "720px"
  });

  const fields = [...SETTINGS_FIELDS, ...(opts.extraFields || [])]
    .filter(f => !f.hosts || f.hosts.includes(opts.host));

  for (const group of SETTINGS_GROUPS) {
    const list = fields.filter(f => f.group === group);
    if (!list.length) continue;

    const h = doc.createElement("div");
    h.textContent = group;
    styleOf(h, { fontWeight: "600", fontSize: "14px", margin: "16px 0 8px", opacity: ".9" });
    root.appendChild(h);

    for (const spec of list) {
      const line = doc.createElement("div");
      styleOf(line, {
        display: "flex", alignItems: "center", gap: "10px",
        marginBottom: "8px", flexWrap: "wrap"
      });
      const label = doc.createElement("span");
      label.textContent = spec.label;
      styleOf(label, { minWidth: "160px", opacity: ".9" });
      line.appendChild(label);

      const current = (opts.settings as any)[spec.key];
      const commit = (value: any) => {
        (opts.settings as any)[spec.key] = value;
        try {
          const r = opts.onChange(spec.key, value);
          if (r && typeof (r as Promise<void>).catch === "function") {
            (r as Promise<void>).catch(err => opts.notice?.(String(err)));
          }
        } catch (err) {
          opts.notice?.(String(err));
        }
      };

      let control: HTMLElement;
      if (spec.type === "toggle") {
        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!current;
        cb.onchange = () => commit(cb.checked);
        control = cb;
      } else if (spec.type === "select") {
        const sel = doc.createElement("select");
        styleOf(sel, {
          background: "inherit", color: "inherit", border: "1px solid currentColor",
          borderRadius: "5px", padding: "4px 6px", opacity: ".9"
        });
        for (const o of spec.options || []) {
          const op = doc.createElement("option");
          op.value = o.value;
          op.textContent = o.label;
          sel.appendChild(op);
        }
        sel.value = String(current ?? "");
        sel.onchange = () => {
          // 数字型设置（firstDayOfWeek）仍以数字写回，避免渲染层拿到字符串
          const raw = sel.value;
          commit(/^\d+$/.test(raw) && typeof current === "number" ? Number(raw) : raw);
        };
        control = sel;
      } else {
        const inp = doc.createElement("input");
        inp.type = spec.type === "number" ? "number" : (spec.type === "password" ? "password" : "text");
        inp.value = current === undefined || current === null ? "" : String(current);
        if (spec.min !== undefined) inp.min = String(spec.min);
        if (spec.max !== undefined) inp.max = String(spec.max);
        styleOf(inp, {
          flex: "1", minWidth: "180px", background: "inherit", color: "inherit",
          border: "1px solid currentColor", borderRadius: "5px", padding: "4px 8px", opacity: ".95"
        });
        inp.onchange = () => {
          if (spec.type === "number") {
            const n = Number(inp.value);
            commit(Number.isFinite(n) ? n : current);
          } else {
            commit(inp.value);
          }
        };
        control = inp;
      }
      line.appendChild(control);

      if (spec.hint) {
        const hint = doc.createElement("span");
        hint.textContent = spec.hint;
        styleOf(hint, { fontSize: "11px", opacity: ".6", flexBasis: "100%", paddingLeft: "170px" });
        line.appendChild(hint);
      }
      root.appendChild(line);
    }
  }

  if (opts.footer) opts.footer(root);
  return root;
}
