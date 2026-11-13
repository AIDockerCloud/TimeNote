// apps/shared/dialogs.ts — 两个新宿主共用的纯 DOM 弹窗（DEC-032）
//
// Obsidian 的 QuickAddModal / SubItemsModal 定义在 main.ts 且继承 Obsidian 的
// Modal，思源 / Blinko 没法用。这里用**原生 DOM + 内联样式**重写一份同语义的：
//   · 不依赖 createEl 垫片、不依赖任何宿主 CSS 变量（两个平台主题变量不同）；
//   · 样式全部内联，所以 styles.css 一行都不用改，Obsidian 产物零影响；
//   · 字段与校验规则逐字对齐 main.ts 的 QuickAddModal（DEC-029 单击切换类型）。
//
// 纯校验逻辑单独导出，测试不用搭 DOM 就能验证。

import {
  parseTimeToSeconds, addMinutesToTime, formatDuration, normalizeAddType
} from "../../core/index";
import type { NoteEntry } from "../../sources/types";
import type { QuickAddHooks } from "../../hosts/types";

export interface QuickAddDeps {
  settings: { defaultAddType?: string; defaultDuration?: number; [key: string]: any };
  notice(message: string): void;
  /** 与 DailySource.addEntry 对应；第 7 参数是 DEC-033 的正文（rawLines 由服务层填 null） */
  addEntry(
    dateStr: string, timeStr: string, content: string, isTask: boolean,
    tags: string[], endTimeStr: string, body?: string
  ): Promise<any>;
}

export interface QuickAddInput {
  dateStr: string;
  timeStr: string;
  endTimeStr: string;
  /** DEC-033：content 语义收窄为「标题」（单行、必填） */
  content: string;
  /** DEC-033：正文（多行、选填），落盘时每行加 Tab 成为标题的子项 */
  body?: string;
  isTask: boolean;
  tagsStr: string;
  addType: string;
  defaultDuration: number;
}

export interface QuickAddValidation {
  ok: boolean;
  message: string;
  /** 规范化后的写入参数 */
  value?: {
    dateStr: string;
    timeStr: string;
    content: string;
    body: string;
    isTask: boolean;
    tags: string[];
    endTimeStr: string;
  };
  addType?: string;
}

/** 与 QuickAddModal.onOpen 的 saveBtn.onclick 校验逐条对应 */
export function validateQuickAddInput(input: QuickAddInput): QuickAddValidation {
  const addType = normalizeAddType(input.addType);
  // DEC-033：标题必填且只允许一行。旧调用方若仍塞进多行文本，取第一行当
  // 标题，其余交给 addEntry 并进正文，绝不生成无时间前缀的 ALL DAY 行。
  const content = String(input.content || "").split(/\r?\n/)[0].trim();
  if (!content) return { ok: false, message: "请输入标题！" };

  const startStr = String(input.timeStr || "").trim();
  const hasExplicitRange = /[-~至到]/.test(startStr);
  if (addType === "point" && hasExplicitRange) {
    return { ok: false, message: "时间点只记一个时刻：请去掉开始时间里的范围，或切换成时间块" };
  }

  let endStr = addType === "point" ? "" : String(input.endTimeStr || "").trim();
  if (addType === "block" && !endStr && !hasExplicitRange && startStr) {
    endStr = addMinutesToTime(startStr, input.defaultDuration || 60);
  }
  if (startStr && !hasExplicitRange && parseTimeToSeconds(startStr) === null) {
    return { ok: false, message: "时间格式不正确，请使用 HH:mm！" };
  }
  if (!hasExplicitRange && endStr) {
    const sSec = parseTimeToSeconds(startStr);
    const eSec = parseTimeToSeconds(endStr);
    if (sSec === null || eSec === null) {
      return { ok: false, message: "时间格式不正确，请使用 HH:mm！" };
    }
    if (eSec <= sSec) {
      return { ok: false, message: "结束时间必须晚于开始时间（暂不支持跨日）！" };
    }
  }

  const tags = String(input.tagsStr || "").split(/[,，\s]+/).filter(t => t.trim().length > 0);
  return {
    ok: true,
    message: "",
    addType,
    value: {
      dateStr: input.dateStr,
      timeStr: startStr,
      content,
      body: String(input.body || ""),
      isTask: !!input.isTask,
      tags,
      endTimeStr: hasExplicitRange ? "" : endStr
    }
  };
}

export function addTypeLabel(raw: string): string {
  return normalizeAddType(raw) === "point" ? "时间点（只记时刻）" : "时间块（起止时间）";
}

/* ---------------- 通用 overlay ---------------- */

export interface OverlayHandle {
  overlay: HTMLElement;
  panel: HTMLElement;
  close(): void;
}

/**
 * 自绘遮罩层。不用宿主的 Dialog，是因为思源 Dialog / Blinko showDialog 的
 * 生命周期与尺寸语义都不一样；自绘一层反而两端行为完全一致。
 */
export function createOverlay(title: string, width = "560px", onClose?: () => void): OverlayHandle {
  const doc = (globalThis as any).document;
  const overlay = doc.createElement("div");
  overlay.className = "timenote-plugin-overlay";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "100000",
    background: "rgba(0,0,0,.46)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: "16px"
  } as any);

  const panel = doc.createElement("div");
  panel.className = "timenote-plugin-panel";
  Object.assign(panel.style, {
    width, maxWidth: "94vw", maxHeight: "88vh", overflow: "auto",
    background: "#23272e", color: "#f2f3f5", borderRadius: "10px",
    boxShadow: "0 16px 48px rgba(0,0,0,.45)", padding: "18px 20px",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "14px"
  } as any);

  const head = doc.createElement("div");
  Object.assign(head.style, {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: "14px", fontWeight: "600", fontSize: "16px"
  } as any);
  const titleEl = doc.createElement("span");
  titleEl.textContent = title;
  const closeBtn = doc.createElement("button");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, buttonStyle());
  head.append(titleEl, closeBtn);
  panel.appendChild(head);
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);

  // DEC-033：关闭是幂等的 —— 保存成功后调 close()、Escape / 点遮罩 / 点 ✕
  // 都走这里，onDismiss 只能触发一次，不能重复移除预览或抛错。
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    doc.removeEventListener("keydown", onKey);
    if (onClose) onClose();
  };
  const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
  closeBtn.onclick = close;
  overlay.addEventListener("click", (ev: MouseEvent) => { if (ev.target === overlay) close(); });
  doc.addEventListener("keydown", onKey);
  return { overlay, panel, close };
}

function buttonStyle(primary = false): Record<string, string> {
  return {
    border: primary ? "1px solid #4b8cff" : "1px solid #4a5058",
    background: primary ? "#3b7cf6" : "#2d323a",
    color: "#f2f3f5", borderRadius: "6px", padding: "6px 12px",
    cursor: "pointer", fontSize: "13px"
  };
}

function inputStyle(): Record<string, string> {
  return {
    border: "1px solid #4a5058", background: "#1c2026", color: "#f2f3f5",
    borderRadius: "6px", padding: "6px 8px", fontSize: "13px",
    boxSizing: "border-box"
  };
}

function row(panel: HTMLElement, label: string): HTMLElement {
  const doc = (globalThis as any).document;
  const wrap = doc.createElement("div");
  Object.assign(wrap.style, {
    display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap"
  } as any);
  if (label) {
    const lab = doc.createElement("span");
    lab.textContent = label;
    Object.assign(lab.style, { minWidth: "72px", opacity: ".85" } as any);
    wrap.appendChild(lab);
  }
  panel.appendChild(wrap);
  return wrap;
}

/* ---------------- 快速记录 ---------------- */

export function openQuickAddDialog(
  deps: QuickAddDeps,
  dateStr: string,
  onSaved?: () => void,
  prefillTime = "",
  prefillEndTime: string | undefined = undefined,
  prefillType = "",
  hooks?: QuickAddHooks
): OverlayHandle {
  const doc = (globalThis as any).document;
  const settings = deps.settings || {};
  const defaultDuration = settings.defaultDuration || 60;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const state: QuickAddInput = {
    dateStr,
    addType: normalizeAddType(prefillType || settings.defaultAddType || "point"),
    timeStr: prefillTime || hhmm,
    endTimeStr: prefillEndTime !== undefined
      ? prefillEndTime
      : (normalizeAddType(prefillType || settings.defaultAddType || "point") === "point"
        ? "" : addMinutesToTime(prefillTime || hhmm, defaultDuration)),
    content: "",
    body: "",
    tagsStr: "",
    isTask: false,
    defaultDuration
  };

  // DEC-033：把表单状态推给渲染层，更新「待创建」块的位置 / 高度 / 文字。
  const notifyPreview = () => {
    if (!hooks || !hooks.onPreview) return;
    const s = parseTimeToSeconds(state.timeStr.trim());
    const e = state.addType === "point" ? null : parseTimeToSeconds(state.endTimeStr.trim());
    hooks.onPreview({
      dateStr: state.dateStr,
      startSec: s,
      endSec: e,
      isPoint: state.addType === "point",
      title: String(state.content || "").trim()
    });
  };

  const handle = createOverlay("⚡ 快速记录至时间笔记", "560px", () => {
    if (hooks && hooks.onDismiss) hooks.onDismiss();
  });
  const form = handle.panel;

  const typeRow = row(form, "记录类型");
  const typeBtn = doc.createElement("button");
  typeBtn.textContent = addTypeLabel(state.addType);
  Object.assign(typeBtn.style, buttonStyle());
  typeBtn.title = "点击切换记录类型";
  typeRow.appendChild(typeBtn);

  const timeRow = row(form, "日期 / 时间");
  const dateInput = doc.createElement("input");
  dateInput.type = "date";
  dateInput.value = state.dateStr;
  Object.assign(dateInput.style, inputStyle());
  const timeInput = doc.createElement("input");
  timeInput.type = "text";
  timeInput.placeholder = "时间 (如 14:30，留空为全天)";
  timeInput.value = state.timeStr;
  Object.assign(timeInput.style, { ...inputStyle(), width: "170px" });
  const endTimeInput = doc.createElement("input");
  endTimeInput.type = "text";
  endTimeInput.placeholder = "结束时间（时间点不需要）";
  endTimeInput.value = state.endTimeStr;
  Object.assign(endTimeInput.style, { ...inputStyle(), width: "190px" });
  const hint = doc.createElement("span");
  Object.assign(hint.style, { fontSize: "12px", opacity: ".72" } as any);
  timeRow.append(dateInput, timeInput, endTimeInput, hint);

  const updateHint = () => {
    if (state.addType === "point") {
      hint.textContent = "时间点（只记时刻，不成块）";
      return;
    }
    const sSec = parseTimeToSeconds(state.timeStr);
    const eSec = parseTimeToSeconds(state.endTimeStr);
    hint.textContent = (sSec !== null && eSec !== null && eSec > sSec)
      ? `时长 ${formatDuration(eSec - sSec)}`
      : (state.endTimeStr ? "结束需晚于开始" : `默认时长 ${defaultDuration} 分钟`);
  };
  const syncType = () => {
    const isPoint = state.addType === "point";
    typeBtn.textContent = addTypeLabel(state.addType);
    endTimeInput.disabled = isPoint;
    endTimeInput.style.opacity = isPoint ? "0.45" : "1";
    if (isPoint) {
      state.endTimeStr = "";
      endTimeInput.value = "";
    } else if (!state.endTimeStr) {
      state.endTimeStr = addMinutesToTime(state.timeStr, defaultDuration);
      endTimeInput.value = state.endTimeStr;
    }
    updateHint();
  };
  typeBtn.onclick = () => {
    state.addType = state.addType === "point" ? "block" : "point";
    syncType();
    notifyPreview();
  };
  dateInput.onchange = () => { state.dateStr = dateInput.value; notifyPreview(); };
  timeInput.oninput = () => { state.timeStr = timeInput.value.trim(); updateHint(); notifyPreview(); };
  endTimeInput.oninput = () => { state.endTimeStr = endTimeInput.value.trim(); updateHint(); notifyPreview(); };
  syncType();

  const taskRow = row(form, "");
  const taskBox = doc.createElement("input");
  taskBox.type = "checkbox";
  taskBox.id = "timenote-plugin-is-task";
  const taskLabel = doc.createElement("label");
  taskLabel.textContent = "作为任务待办 (- [ ])";
  taskLabel.htmlFor = taskBox.id;
  taskBox.onchange = () => { state.isTask = taskBox.checked; };
  taskRow.append(taskBox, taskLabel);

  // DEC-033：标题必填且单行；正文选填、可多行，落盘时每行加 Tab 成为子项。
  const titleRow = row(form, "标题 *");
  const titleInput = doc.createElement("input");
  titleInput.type = "text";
  titleInput.placeholder = "这条记录叫什么？（必填，单行）";
  Object.assign(titleInput.style, { ...inputStyle(), flex: "1", minWidth: "200px" });
  titleInput.oninput = () => { state.content = titleInput.value; notifyPreview(); };
  titleInput.onkeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter") { ev.preventDefault(); void save(); }
  };
  titleRow.appendChild(titleInput);

  const bodyArea = doc.createElement("textarea");
  bodyArea.placeholder = "正文（选填，可多行；每行会作为子项缩进写进日记，Ctrl+Enter 保存）";
  Object.assign(bodyArea.style, {
    ...inputStyle(), width: "100%", minHeight: "90px", resize: "vertical", marginBottom: "10px"
  });
  bodyArea.oninput = () => { state.body = bodyArea.value; notifyPreview(); };
  form.appendChild(bodyArea);

  const tagsInput = doc.createElement("input");
  tagsInput.type = "text";
  tagsInput.placeholder = "标签 (逗号分隔，如 工作, AI)";
  Object.assign(tagsInput.style, { ...inputStyle(), width: "100%", marginBottom: "10px" });
  tagsInput.oninput = () => { state.tagsStr = tagsInput.value; };
  form.appendChild(tagsInput);

  const btnRow = row(form, "");
  Object.assign(btnRow.style, { justifyContent: "flex-end", marginTop: "4px" } as any);
  const cancelBtn = doc.createElement("button");
  cancelBtn.textContent = "取消";
  Object.assign(cancelBtn.style, buttonStyle());
  const saveBtn = doc.createElement("button");
  saveBtn.textContent = "保存并插入日记";
  Object.assign(saveBtn.style, buttonStyle(true));
  btnRow.append(cancelBtn, saveBtn);

  const save = async () => {
    const result = validateQuickAddInput(state);
    if (!result.ok || !result.value) {
      deps.notice(result.message);
      return;
    }
    try {
      const v = result.value;
      await deps.addEntry(v.dateStr, v.timeStr, v.content, v.isTask, v.tags, v.endTimeStr, v.body);
      deps.notice(`✅ 已记录${result.addType === "point" ? "时间点" : "时间块"}到 ${v.dateStr} 日记中！`);
      handle.close();
      if (onSaved) onSaved();
    } catch (err) {
      deps.notice(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };
  cancelBtn.onclick = () => handle.close();
  saveBtn.onclick = () => { void save(); };
  bodyArea.onkeydown = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) void save();
  };
  titleInput.focus();
  // 打开时先画一次预览，让拖拽留下的 ghost 立即变成「待创建」块
  notifyPreview();
  return handle;
}

/* ---------------- 子项详情 / 文本查看 ---------------- */

export function openSubItemsDialog(entry: NoteEntry): OverlayHandle {
  const doc = (globalThis as any).document;
  const handle = createOverlay(`📋 ${entry.text || "记录详情"}`, "480px");
  const p = doc.createElement("div");
  p.textContent = `${entry.dateStr} · ${entry.hasTime ? entry.timeStr : "全天"}`;
  Object.assign(p.style, { opacity: ".75", marginBottom: "10px" } as any);
  handle.panel.appendChild(p);
  const list = doc.createElement("ul");
  for (const sub of entry.subItems || []) {
    const li = doc.createElement("li");
    li.textContent = sub;
    list.appendChild(li);
  }
  if (!(entry.subItems || []).length) {
    const li = doc.createElement("li");
    li.textContent = "（没有子项）";
    list.appendChild(li);
  }
  handle.panel.appendChild(list);
  return handle;
}

/** 思源 / Blinko 的「打开当天日记」：宿主原生笔记不便直接跳到某一行时，
 *  至少给出一份可读、可编辑的当天记录视图。 */
export function openNoteDialog(options: {
  title: string;
  text: string;
  readOnly?: boolean;
  onSave?: (text: string) => Promise<void> | void;
  notice?: (msg: string) => void;
}): OverlayHandle {
  const doc = (globalThis as any).document;
  const handle = createOverlay(options.title, "720px");
  const ta = doc.createElement("textarea");
  ta.value = options.text;
  ta.readOnly = !!options.readOnly;
  Object.assign(ta.style, {
    ...inputStyle(), width: "100%", minHeight: "340px",
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "12px"
  });
  handle.panel.appendChild(ta);

  if (options.onSave && !options.readOnly) {
    const btnRow = row(handle.panel, "");
    Object.assign(btnRow.style, { justifyContent: "flex-end" } as any);
    const saveBtn = doc.createElement("button");
    saveBtn.textContent = "保存";
    Object.assign(saveBtn.style, buttonStyle(true));
    saveBtn.onclick = async () => {
      try {
        await options.onSave!(ta.value);
        options.notice?.("✅ 已保存");
        handle.close();
      } catch (err) {
        options.notice?.(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    };
    btnRow.appendChild(saveBtn);
  }
  return handle;
}
