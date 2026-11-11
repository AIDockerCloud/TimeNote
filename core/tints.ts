// core/tints.ts — 按天自动配色（DEC-016，平台无关纯函数）
//
// 调色板直接借用 Obsidian 官方扩展色变量：明暗主题自动适配，不必维护两套色值。
// 「指定」通道：日记行里写 #color/blue 或 #色/蓝；未指定则由本模块按天自动分配。
//
// 注意：色值用 `var(--color-NAME, #fallback)` 形式 —— Obsidian 从未定义
// `--color-accent-rgb`，1.13 起 `-rgb` 系列弃用，写成 rgba(var(--xxx-rgb), a)
// 会让整条声明失效（DEC-015）。所以这里只认 `--color-NAME` 这类独立变量。

// --- BLOCK_TINT_BEGIN ---
export const BLOCK_TINTS = ["purple", "blue", "cyan", "green", "yellow", "orange", "red", "pink"];
// 主题若没定义某个扩展色，也不能让块变成全透明（DEC-015 的教训）
const TINT_FALLBACKS = {
  purple: "#7852ee", blue: "#086ddd", cyan: "#00bfbc", green: "#08b94e",
  yellow: "#e0ac00", orange: "#ec7500", red: "#e93147", pink: "#d53984"
};
const TINT_ALIASES = {
  紫: "purple", 蓝: "blue", 青: "cyan", 绿: "green",
  黄: "yellow", 橙: "orange", 红: "red", 粉: "pink"
};

export function tintCssOf(index) {
  const name = BLOCK_TINTS[index];
  return `var(--color-${name}, ${TINT_FALLBACKS[name]})`;
}

export function hashTintKey(key) {
  let hash = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

export function tintEntryKey(entry, dateStr) {
  return entry.id || `${dateStr}#${entry.lineNum || 0}#${entry.text || ""}`;
}

// 把 #color/blue、#色/绿、#7c5cff、未知名字都解析成一个确定的 CSS 颜色值。
// 返回 index 仅用于「占位」：显式指定的调色板色不应再被自动分配的块占用。
export function resolveTint(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  const idx = BLOCK_TINTS.indexOf(TINT_ALIASES[raw] || lower);
  if (idx >= 0) return { css: tintCssOf(idx), index: idx };
  if (/^(#|hsl\(|rgb\(|var\()/i.test(raw)) return { css: raw, index: -1 };
  const fallback = hashTintKey(raw) % BLOCK_TINTS.length;
  return { css: tintCssOf(fallback), index: fallback };
}

/**
 * 为「一天」的所有定时块分配颜色，返回与 items 等长的 CSS 颜色值数组。
 * - 显式指定的先占位；
 * - 未指定的以 entry key 的 hash 作为偏好色，若当天已用过就顺延到下一个未用色；
 * - 因此只要当天块数不超过调色板容量，颜色必然两两不同，新块自动拿到当天未用色；
 * - 纯函数 + 稳定排序（由调用方保证），重渲染不会跳色。
 */
export function assignDayTints(items) {
  const used = new Set();
  const result = new Array(items.length);

  items.forEach((it, i) => {
    const resolved = resolveTint(it.tint);
    if (!resolved) return;
    result[i] = resolved.css;
    if (resolved.index >= 0) used.add(resolved.index);
  });

  const n = BLOCK_TINTS.length;
  items.forEach((it, i) => {
    if (result[i]) return;
    const preferred = hashTintKey(it.key) % n;
    let chosen = -1;
    for (let k = 0; k < n; k++) {
      const c = (preferred + k) % n;
      if (!used.has(c)) { chosen = c; break; }
    }
    if (chosen < 0) {
      // 超过调色板容量时允许复用，但至少不与相邻块同色。
      // 注意 prev 是「上一个块的 CSS 色值」，所以这里必须拿 tintCssOf(c) 比，
      // 不能拿调色板索引比 —— 索引与 CSS 字符串恒不相等，这道防线会形同虚设。
      const prev = i > 0 ? result[i - 1] : null;
      for (let k = 0; k < n; k++) {
        const c = (preferred + k) % n;
        if (tintCssOf(c) !== prev) { chosen = c; break; }
      }
      if (chosen < 0) chosen = preferred;
    }
    result[i] = tintCssOf(chosen);
    used.add(chosen);
  });

  return result;
}
// --- BLOCK_TINT_END ---
