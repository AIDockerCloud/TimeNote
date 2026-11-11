// core/scale.ts — 弹性时间轴与块布局（平台无关纯函数）
//
// 本文件里的东西不许碰 DOM、不许碰任何宿主 API：
// 它们是「时间 → 像素」的唯一换算来源（红线 9），三端共用同一份实现。
//
// 迁移说明（DEC-023）：原先这些代码内联在 main.ts 里，开发脚本靠
// `// --- XXX_BEGIN ---` 注释标记按位置切片取真实实现。抽到独立文件后，
// 切片方式改为「编译成 ESM 后 import 整个模块」——esbuild 会丢弃注释，
// 位置切片在多文件下不可靠（详见 ai/DECISIONS.md DEC-023 背景 ④）。
//
// 注释标记 `// --- XXX_BEGIN/END ---` 保留下来，降级为「给人看的区域标注」，
// 不再是机器锚点。

/**
 * 估算一条记录「按内容」需要多高（不依赖 DOM，纯字数折算）
 * 中文按 2 个宽度单位、西文按 1 个，宽度用列宽近似，行高 15.5px 对 0.775rem
 */
export function estimateBlockNeed(entry, widthPx) {
  const text = String(entry && entry.text ? entry.text : "");
  let units = 0;
  for (const ch of text) {
    units += /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(ch) ? 2 : 1;
  }
  const usable = Math.max(40, (Number(widthPx) || 200) - 22);
  const perLine = Math.max(5, Math.floor(usable / 6.9));
  // 周 / 3 天视图列很窄，折太多行会把整条轴撑爆；窄列只给 3 行
  const maxLines = (Number(widthPx) || 200) < 200 ? 3 : 6;
  const lines = Math.min(maxLines, Math.max(1, Math.ceil(units / perLine)));
  let h = 10 + lines * 15.5;                                  // 上下内边距 + 标题行
  h += 15;                                                    // 时间行
  if (entry && entry.subItems && entry.subItems.length) h += 14;
  return Math.max(28, Math.min(ELASTIC_MAX_BLOCK, h));
}

// ============================================================================
// Elastic Time Scale（弹性时间轴）
// ============================================================================
// 行高由「内容本身需要多少像素」决定：
//   - 完全没有记录的小时压到 slotHeight * ELASTIC_EMPTY_RATIO（默认约 18px）
//   - 被记录覆盖到的小时（含跨行条目的中间段）至少给到最小内容行高，避免长条目被掐细
//   - 行内条目按内容高度求和，内容多的行自然变高
//   - 整轴不足视口时整体等比放大行距，但设上限，防止块被拉成大片留白
//
// 重要：块的高度恒等于它在轴上的时间跨度（height = yOf(end) - yOf(start)），
// 所以「内容多就高」只能靠行高实现，绝不允许再把块从跨度里截短 ——
// 一旦块比跨度矮，块的下沿就不再对应结束时间，与时间轴刻度自相矛盾。
//
// 关键约束：sec -> y 的映射必须在整条轴上严格单调递增且连续 ——
// 时间块的 top/height、整点刻度线、当前时间线、拖拽的像素↔时间换算全部依赖它。
// 一旦出现高度为 0 的行，映射就不再是一一对应，拖拽会直接失效。
export const ELASTIC_EMPTY_RATIO = 0.34;    // 空档行高度 = slotHeight * 该系数
export const ELASTIC_CONTENT_RATIO = 0.9;   // 有条目行的最小高度 = slotHeight * 该系数
export const ELASTIC_MIN_EMPTY_ROW = 16;    // 空档行绝对下限（再矮刻度标签就糊成一团）
export const ELASTIC_MIN_CONTENT_ROW = 40;  // 有条目行绝对下限（够放标题 + 时间两行）
export const ELASTIC_ROW_PAD = 8;           // 行内给块留的上下呼吸
export const ELASTIC_MAX_BLOCK = 240;       // 行高计算时单个条目按内容撑高的上限
export const ELASTIC_MAX_VIEWPORT_SCALE = 1.5; // 内容不足一屏时行距最多放大到 1.5 倍（块高恒等于跨度，不能再放宽）
export const MIN_RENDER_BLOCK_PX = 16;      // 时间块最小渲染高度（低于它的极短记录会轻微溢出一两像素）

export function buildTimeScale(opts) {
  const { startHour, endHour, slotHeight, top, entries, elastic, viewportHeight, pointNeeds } = opts;
  const rowCount = Math.max(1, endHour - startHour);
  const dayStartSec = startHour * 3600;
  const dayEndSec = endHour * 3600;
  let heights: number[] = [];

  if (!elastic) {
    // 等距模式：与原实现完全一致，出问题可一键退回
    for (let i = 0; i < rowCount; i++) heights.push(slotHeight);
  } else {
    const emptyH = Math.max(ELASTIC_MIN_EMPTY_ROW, Math.round(slotHeight * ELASTIC_EMPTY_RATIO));
    const contentH = Math.max(ELASTIC_MIN_CONTENT_ROW, Math.round(slotHeight * ELASTIC_CONTENT_RATIO));

    // 1) 每行先给基础高度：有条目起点的行才拿到「内容行」的额度
    const startsAt = new Array(rowCount).fill(0);
    (entries || []).forEach(e => {
      const s = Math.max(Number(e.s) || 0, dayStartSec);
      if (s >= dayEndSec) return;
      const idx = Math.floor((s - dayStartSec) / 3600);
      if (idx >= 0 && idx < rowCount) startsAt[idx] += 1;
    });
    for (let i = 0; i < rowCount; i++) heights[i] = startsAt[i] > 0 ? contentH : emptyH;

    // 2) 每行按「块真正需要的高度」撑开：把落在该行的块按时间先后塞进纵向槽位，
    //    同时发生的块左右并排（不同槽）、先后发生的块上下叠放（同一槽），取最满的一个槽。
    //    这样块永远不会因为被压扁而互相盖住，内容多的行自然变高。
    const rowItems = Array.from({ length: rowCount }, () => []);
    (entries || []).forEach(e => {
      const s = Math.max(Number(e.s) || 0, dayStartSec);
      const en = Math.min(Number(e.en) || 0, dayEndSec);
      const needH = Math.min(ELASTIC_MAX_BLOCK, Number(e.needH) || 0);
      if (en <= s) return;
      const span = en - s;
      for (let i = 0; i < rowCount; i++) {
        const rs = dayStartSec + i * 3600;
        const ov = Math.min(en, rs + 3600) - Math.max(s, rs);
        if (ov > 0) rowItems[i].push({ s, en, need: needH * (ov / span) });
      }
    });

    for (let i = 0; i < rowCount; i++) {
      const items = rowItems[i];
      // 时间点线不画块，但每条要占一行标签（DEC-018）。pointNeeds 由渲染层按小时
      // 聚合好传进来；多天并排时各天取最大值，不能把 7 天累加成一条巨高的行。
      const pointNeed = Math.max(0, Number((pointNeeds && pointNeeds[i]) || 0));
      if (!items.length) {
        if (pointNeed > 0) heights[i] = Math.max(heights[i], contentH + pointNeed);
        continue;
      }
      // 被记录覆盖到的小时（含跨行长条目的中间段）至少给最小内容行高：
      // 块高恒等于跨度，中间段若被压成空档高度，长条目会被掐成细细一条
      if (heights[i] < contentH) heights[i] = contentH;
      items.sort((a, b) => a.s - b.s || a.en - b.en);
      const slots: { end: number; sum: number }[] = [];
      items.forEach(it => {
        let slot = slots.find(x => x.end <= it.s);
        if (!slot) { slot = { end: it.en, sum: 0 }; slots.push(slot); }
        slot.sum += it.need;
        slot.end = it.en;
      });
      // 点线标签与块在同一列里纵向叠加，需求直接加进这一行的总高
      const need = Math.max(...slots.map(x => x.sum)) + ELASTIC_ROW_PAD + pointNeed;
      if (need > heights[i]) heights[i] = need;
    }

    // 3) 内容不足一屏：整体等比放大行距，避免 24 小时全挤在上半屏、下面一大片空白。
    //    块高恒等于跨度，所以放大倍数必须封顶，否则一条记录的小时会连同块一起被拉虚。
    const sum = heights.reduce((a, b) => a + b, 0);
    const vh = Number(viewportHeight) || 0;
    if (vh > 0 && sum > 0 && sum < vh) {
      const k = Math.min(ELASTIC_MAX_VIEWPORT_SCALE, vh / sum);
      heights = heights.map(h => h * k);
    }
  }

  const bounds = [0];
  for (let i = 0; i < rowCount; i++) bounds.push(bounds[i] + heights[i]);
  const totalHeight = bounds[rowCount];

  const yOf = (sec) => {
    const rel = Math.max(0, Math.min(rowCount, ((Number(sec) || 0) - dayStartSec) / 3600));
    const i = Math.min(rowCount - 1, Math.floor(rel));
    return top + bounds[i] + (rel - i) * heights[i];
  };

  const secOf = (y) => {
    const rel = Math.max(0, Math.min(totalHeight, (Number(y) || 0) - top));
    let lo = 0;
    let hi = rowCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rel < bounds[mid + 1]) hi = mid;
      else lo = mid + 1;
    }
    const frac = heights[lo] > 0 ? (rel - bounds[lo]) / heights[lo] : 0;
    return dayStartSec + (lo + frac) * 3600;
  };

  return {
    yOf, secOf, top, totalHeight, rowCount, heights, bounds,
    startHour, endHour, dayStartSec, dayEndSec,
    elastic: !!elastic
  };
}

// 只在真正重叠的区间内分列；不重叠的区间占满整列（借鉴 TaskNotes lane 策略）
export function layoutTimeBlockClusters(entries, dayStartSec, dayEndSec) {
  const items = entries.map(e => {
    const st = Math.max(dayStartSec, e.startSeconds || 0);
    const rawEnd = e.endSeconds || (e.startSeconds || 0) + 1800;
    const en = Math.min(dayEndSec, Math.max(st + 60, rawEnd));
    return { entry: e, s: st, en, lane: 0 };
  }).sort((a, b) => a.s - b.s || a.en - b.en);

  const clusters = [];
  let current = null;
  items.forEach(it => {
    if (!current || it.s >= current.end) {
      current = { end: it.en, items: [], laneCount: 1 };
      clusters.push(current);
    }
    current.items.push(it);
    current.end = Math.max(current.end, it.en);
  });

  clusters.forEach(c => {
    const laneEnds = [];
    c.items.forEach(it => {
      let lane = laneEnds.findIndex(end => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.en);
      } else {
        laneEnds[lane] = it.en;
      }
      it.lane = lane;
    });
    c.laneCount = Math.max(1, laneEnds.length);
  });
  return clusters;
}

// ============================================================================
// Point Lines（时间点记录 — DEC-018）
// ============================================================================
// 只有 HH:mm、没有结束时间也没有 30m/1h 时长标签的记录是「时间点」，不是任务块：
// 块布局里画成一条精确落在 yOf(startSeconds) 的水平线，信息列在线下。
// 15 分钟内的点记录归为同一簇，簇内按行号向下错开标签，避免文字互相盖住。
// 线整条上下拖动只改时刻，没有任何边缘命中区，也绝不会把点扩成时间块。
export const POINT_ROW_H = 20;                     // 簇内每条记录占的垂直高度
export const POINT_LABEL_GAP = 3;                  // 线到第一行标签的间距
export const POINT_CLUSTER_WINDOW_SEC = 15 * 60;   // 归簇窗口
export const POINT_SNAP_MINUTES = 1;               // 点线拖动按 1 分钟吸附（块仍是 15 分钟）
// --- POINT_LINE_BEGIN ---
// 判定放在模块级纯函数里：开发脚本可以直接 import 测，不依赖 DOM / Obsidian。
export function isPointEntry(entry) {
  return !!entry && !!entry.hasTime && !entry.isRange;
}

// 把一天的点记录排好序、分簇，给出每条的簇号 / 簇内行号 / 簇大小。
// 稳定排序保证重渲染不跳位；越出可见时间轴的点直接丢掉，避免线画到轴外。
export function layoutPointLines(entries, dayStartSec, dayEndSec) {
  const list = (entries || [])
    .filter(e => isPointEntry(e))
    .map(e => ({ entry: e, sec: Number(e.startSeconds) || 0 }))
    .filter(p => p.sec >= dayStartSec && p.sec <= dayEndSec)
    .sort((a, b) =>
      a.sec - b.sec ||
      (a.entry.lineNum || 0) - (b.entry.lineNum || 0) ||
      String(a.entry.text || "").localeCompare(String(b.entry.text || ""))
    );

  const clusters = [];
  list.forEach(p => {
    const last = clusters[clusters.length - 1];
    if (!last || p.sec - last.sec >= POINT_CLUSTER_WINDOW_SEC) {
      clusters.push({ sec: p.sec, items: [] });
    }
    clusters[clusters.length - 1].items.push(p);
  });

  const out = [];
  clusters.forEach((c, ci) => {
    c.items.forEach((p, ri) => {
      out.push({
        entry: p.entry,
        sec: p.sec,
        clusterIndex: ci,
        rowInCluster: ri,
        clusterSize: c.items.length
      });
    });
  });
  return out;
}
// --- POINT_LINE_END ---
