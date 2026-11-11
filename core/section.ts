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
