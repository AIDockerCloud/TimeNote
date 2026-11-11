// core/time.ts — 时间格式化与吸附（平台无关纯函数）
//
// 只做「秒 ↔ HH:mm」与「按分钟吸附」这类纯算术，不碰日期库。
// 日期（今天是哪天、这一周的边界）属于宿主职责，见 core/dates.ts。

// 块布局网格的上下留白（px）：
// 顶部 —— 必须为 0：任何留白都会在「全天区」和第一个整点之间多出一条空行。
//          起始时刻的刻度标签改用 .is-first 规则下移贴住轴线，不再靠留白躲避裁切。
// 底部 —— 结束小时的刻度标签需要半行余量，同时让最后一行尽量贴近底部。
export const BLOCK_TOP_GUTTER = 0;
export const BLOCK_BOTTOM_GUTTER = 14;
// 时间刻度列宽度：必须与 styles.css 的 --tn-ruler-w 一致。
// 列宽估算、当前时间线起点都依赖它，改一处就要改另一处。
export const BLOCK_RULER_W = 64;

// 时间吸附：拖拽创建 / 调节范围时按 N 分钟取整，避免出现 14:37 这种脏时间
export const DRAG_SNAP_MINUTES = 15;
export const MIN_BLOCK_SECONDS = 15 * 60;
// 从空白槽新建「时间点」也按 15 分钟吸附；已有点线的拖动仍是 1 分钟（DEC-018），
// 两者不能混：一个是凭空定时刻，一个是微调已有记录。
export const POINT_CREATE_SNAP_MINUTES = 15;

export function formatSecondsToTime(sec) {
  const clamped = Math.max(0, Math.min(86400, sec));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTimeToSeconds(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = m[3] ? parseInt(m[3], 10) : 0;
  if (h > 24 || (h === 24 && (min > 0 || sec > 0)) || min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec;
}

export function addMinutesToTime(timeStr, minutes) {
  const sec = parseTimeToSeconds(timeStr);
  if (sec === null) return "";
  const total = Math.min(1440, Math.floor(sec / 60) + minutes);
  if (total >= 1440) return "24:00";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function snapSeconds(sec, minutes = DRAG_SNAP_MINUTES) {
  const step = Math.max(1, minutes) * 60;
  return Math.round(sec / step) * step;
}

// 无把手边缘命中区（DEC-014）：按块高的 1/3 取，2–9px 夹取。
// 任何高度都留得出「上沿 / 中部平移 / 下沿」三段，最矮的 16px 块也不例外。
export function blockEdgeHit(px) {
  return Math.max(2, Math.min(9, (Number(px) || 0) / 3));
}

export function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(Math.abs(seconds) / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// Deterministic tag color generator
export function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsla(${hue}, 70%, 50%, 0.15)`,
    text: `hsl(${hue}, 75%, 45%)`,
    border: `hsla(${hue}, 70%, 50%, 0.3)`
  };
}
