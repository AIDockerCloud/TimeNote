// core/crossday.ts — 跨天移动与新增类型（DEC-022，平台无关纯函数）
//
// 「把一条定时记录从 A 天搬到 B 天」这件事里，有一半是纯文本改写 ——
// 与宿主无关（无论是 md 行、memos 正文还是思源块内容，规则一样）；
// 另一半是「先写目标再删源」的顺序保证，属于 adapter 层。
//
// 这里只放纯文本改写部分。行号漂移校验、跨文件移动的原子性在 sources/ 里做。

import { formatSecondsToTime } from "./time";

// --- CROSS_DAY_BEGIN ---
// 跨天拖动（DEC-022）：把一条定时记录从 A 天日记搬到 B 天日记。
// 判定 / 行首改写 / 子项收集都放在模块级纯函数里，方便测试直接验证
// 「只搬目标行、绝不误删用户内容」这条红线。
export function normalizeAddType(raw) {
  return String(raw || "").toLowerCase() === "point" ? "point" : "block";
}

// 按记录类型改写行首时间前缀：块写 HH:mm-HH:mm，点只写一个 HH:mm。
// 不认识的行返回 null —— 调用方必须据此放弃整个移动，不能删任何东西。
export function rewriteEntryLineTime(line, startSec, endSec, isPoint) {
  const rangeRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s*[-~至到/]\s*\d{1,2}:\d{2}(?::\d{2})?)(\s+)/;
  const singleRe = /^(\s*[-*+]\s*(?:\[[ xX]\]\s*)?)(\d{1,2}:\d{2}(?::\d{2})?)(\s+|$)/;
  if (isPoint) {
    // 点永远不能被悄悄扩成块：范围行直接拒绝，单时间行只换那一刻
    if (rangeRe.test(line) || !singleRe.test(line)) return null;
    return line.replace(singleRe, (_m, pre, _t, sp) => `${pre}${formatSecondsToTime(startSec)}${sp || ""}`);
  }
  const rangeStr = `${formatSecondsToTime(startSec)}-${formatSecondsToTime(endSec)}`;
  let out;
  if (rangeRe.test(line)) {
    out = line.replace(rangeRe, (_m, pre, _s, _r, sp) => `${pre}${rangeStr}${sp || ""}`);
  } else if (singleRe.test(line)) {
    out = line.replace(singleRe, (_m, pre, _t, sp) => `${pre}${rangeStr}${sp || ""}`);
  } else {
    return null;
  }
  // 行尾时长标签（30m / 1h）与新范围冲突，去掉那一个，其余正文一字不动
  return out.replace(/\s+\d+(?:\.\d+)?\s*(?:m|min|h|小时|分钟)(?=\s*$)/i, '');
}

// 目标行后面连续的缩进子项属于这条记录，必须一起搬走；否则它们会留在
// 原日记变成没有父项的孤儿行（parseDailyFile 会直接忽略）。
export function collectSubItemLines(lines, idx) {
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || !/^(?:\t+| {2,})/.test(l)) break;
    out.push(l);
  }
  return out;
}
// --- CROSS_DAY_END ---
