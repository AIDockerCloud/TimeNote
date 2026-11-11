// sources/meta.ts — 来源元数据（DEC-023）
//
// 渲染层曾经到处写 `entry.source === "blinko"`，一旦接入第二个外部来源
// （memos / 思源）就会全部漏判：徽标显示成「灵感闪念」、页脚显示成
// 「点击定位日记」、只读守卫也失效。这里把「来源 → 显示信息」集中成
// 一张表，渲染层只问 sourceMeta()，不再认识具体来源。
//
// 新增一个来源只需要在 SOURCE_META 里加一行 + 实现一个 NoteSource，
// 渲染层零改动。

/** 来源的展示信息 */
export interface SourceMeta {
  /** 来源标识（对应 entry.source） */
  id: string;
  /** 显示名，用于徽标与设置页 */
  label: string;
  /** 徽标前缀 emoji，让色盲用户也能区分来源 */
  badge: string;
  /** 来源主色（CSS 变量名），供样式复用 */
  color: string;
}

/** 内置来源表。未登记的来源会走 fallbackSourceMeta()。 */
const SOURCE_META: Record<string, SourceMeta> = {
  daily: { id: "daily", label: "灵感闪念", badge: "📝", color: "var(--text-muted)" },
  blinko: { id: "blinko", label: "Blinko", badge: "🟣", color: "var(--color-purple)" },
  memos: { id: "memos", label: "Memos", badge: "🟢", color: "var(--color-green)" },
  siyuan: { id: "siyuan", label: "思源", badge: "🔵", color: "var(--color-blue)" }
};

/** 未登记来源的兜底：仍然可渲染，只是没有专属颜色 */
function fallbackSourceMeta(id: string): SourceMeta {
  return { id, label: id, badge: "🔗", color: "var(--text-muted)" };
}

/**
 * 取来源元数据。undefined / 空串按本地日记处理（历史数据没有 source 字段）。
 */
export function sourceMeta(source?: string | null): SourceMeta {
  if (!source) return SOURCE_META.daily;
  return SOURCE_META[source] || fallbackSourceMeta(source);
}

/**
 * 是否「外部来源」（聚合进来的、不可回写的）。
 *
 * 判据刻意只看 source 是否存在且不是 daily —— 与 DEC-018 / DEC-022 的既有
 * 边界一致，不引入第二套概念。注意：本地 Blinko **导出文件**（vault 里的 md）
 * 历史上也标 source="blinko"，但它在本地有真实文件、可以点开定位，
 * 所以判断「能不能回写」「有没有本地文件」都要看 entry.readonly，不是这个函数。
 */
export function isExternalSource(source?: string | null): boolean {
  return !!source && source !== "daily";
}

/** 徽标文案，如「🟣 Blinko」 */
export function sourceBadge(source?: string | null): string {
  const m = sourceMeta(source);
  return `${m.badge} ${m.label}`;
}

/** 来源显示名 */
export function sourceLabel(source?: string | null): string {
  return sourceMeta(source).label;
}

/**
 * 渲染用的 CSS 类后缀。
 *
 * 本地日记返回空串（保持既有 DOM 结构不变），外部来源返回
 * `is-external is-<source>`：`is-external` 给通用样式（虚线边、透明度等），
 * `is-<source>` 给来源专属配色。`is-blinko` 因此照旧命中老样式。
 */
export function sourceCssClass(source?: string | null): string {
  if (!isExternalSource(source)) return "";
  const id = String(source).replace(/[^a-zA-Z0-9_-]/g, "");
  return id === "external" ? "is-external" : `is-external is-${id}`;
}

/** 内置来源 id 列表（设置页遍历用；不含 daily） */
export function externalSourceIds(): string[] {
  return Object.keys(SOURCE_META).filter(id => id !== "daily");
}
