// core/section.ts — 快速记录插入标题（DEC-020，平台无关纯函数）

// --- SECTION_HEADING_BEGIN ---
// 快速记录默认插入标题允许自带层级：设置里写 "## 灵感闪念" / "### 随手记"
// 就用二级 / 三级标题；写纯文本（旧 data.json 里的值）时按二级标题兼容。
// 两个纯函数供各 adapter 与测试共用。
export function parseQuickAddSection(raw) {
  const FALLBACK_TITLE = "灵感闪念";
  const text = String(raw == null ? "" : raw).trim();
  let level = 2;
  let title = text;
  const m = /^(#+)\s*(.*)$/.exec(text);
  if (m) {
    level = Math.min(m[1].length, 6); // Markdown 标题最多 6 级
    title = (m[2] || "").trim();
  }
  // ATX 标题也允许行尾闭合井号，如 "## 灵感闪念 ##"
  title = title.replace(/\s+#+\s*$/, "").trim() || FALLBACK_TITLE;
  return { level, title, heading: `${"#".repeat(level)} ${title}` };
}

export function sectionHeaderRegex(title) {
  const esc = String(title).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*#{1,6}\\s+${esc}\\s*$`);
}
// --- SECTION_HEADING_END ---

// ---------------------------------------------------------------------------
// DEC-033：快速记录的「正文」→ 缩进子项行
// ---------------------------------------------------------------------------
// 正文框允许回车写多行。若把整段文本塞进 content，第二行会变成一条没有
// 时间前缀的顶层行 → parseDailyFile 把它解析成 ALL DAY 任务。这里把正文
// 切成一行一条，交给 DailySource 在每行前加 Tab，成为标题记录的子项。
//
// ⚠️ 空行必须丢掉：parseDailyFile 遇到空行会清空 currentParent，留一个 "\t"
// 空行会直接把后面的子项从父记录上摘掉（而且它自己不该占一条子项）。
export function normalizeQuickAddBodyLines(body: any): string[] {
  return String(body == null ? "" : body)
    .split(/\r?\n/)
    .map(l => l.replace(/\s+$/, ""))
    .filter(l => l.trim().length > 0);
}

// 把「标题 + 正文」拼成可直接写进日记的行数组：第一行是带时间前缀的标题行，
// 其余每行加一个 Tab 前缀。纯函数，弹窗与 DailySource 共用同一套规则。
export function buildQuickAddLines(headLine: string, bodyLines: string[]): string {
  const subs = (bodyLines || []).map(l => `\t${l}`);
  return [headLine, ...subs].join("\n");
}
// --- QUICK_ADD_BODY_END ---
