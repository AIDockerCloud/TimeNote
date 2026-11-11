// core/parse.ts — 日记行解析（平台无关纯函数）
//
// 输入一行 markdown，输出一个「定时记录条目」结构。
// 三个宿主（Obsidian / Blinko / 思源）共用这一份解析规则 —— 各家的
// 「一行」载体不同（md 行 / memo 正文 / 块内容），但「怎么从一行文字里
// 认出时间、任务、标签」的规则是一样的，所以解析放在 core，
// 由各 adapter 负责把「行」喂进来。

import { parseTimeToSeconds } from "./time";

/**
 * 解析一行日记，返回条目；不是定时记录则返回 null。
 *
 * @param line      原始行文本
 * @param lineNum   行号（用于稳定排序与回写定位）
 * @param dateStr   归属日期 YYYY-MM-DD
 * @param filePath  来源标识（宿主内唯一路径 / id，用于回写定位）
 * @param inMemoSection 是否位于「随手记」节内（该节内的无时间纯文本也算记录）
 */
export function parseLine(line, lineNum, dateStr, filePath, inMemoSection = false) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---") || trimmed.startsWith("```")) {
    return null;
  }

  // Check if task checkbox
  const taskMatch = line.match(/^(\s*[-*+]?\s*)\[([ xX\-\/])\]\s*(.*)$/);
  const isTask = !!taskMatch;
  const isCompleted = isTask && (taskMatch[2] === 'x' || taskMatch[2] === 'X');

  // Extract core content after bullet/checkbox
  let content = isTask ? taskMatch[3] : line.replace(/^\s*[-*+]?\s*/, '').trim();

  // Time range regex: e.g. 14:00:00-15:30:00, 14:00-15:30, 09:30 ~ 11:00, 14:00至15:00
  const rangeRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[-~至到/]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/;
  // Single time regex: e.g. 14:00:31, 14:00, 09:15
  const singleRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/;

  let hasTime = false;
  let startMinutes = 0;
  let endMinutes = 0;
  let startSeconds = 0;
  let endSeconds = 0;
  let timeStr = "";
  let explicitRange = false;

  const rangeMatch = content.match(rangeRegex);
  if (rangeMatch) {
    hasTime = true;
    explicitRange = true;
    const sh = parseInt(rangeMatch[1], 10);
    const sm = parseInt(rangeMatch[2], 10);
    const ss1 = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 0;
    const eh = parseInt(rangeMatch[4], 10);
    const em = parseInt(rangeMatch[5], 10);
    const ss2 = rangeMatch[6] ? parseInt(rangeMatch[6], 10) : 0;

    startSeconds = sh * 3600 + sm * 60 + ss1;
    endSeconds = eh * 3600 + em * 60 + ss2;
    if (endSeconds <= startSeconds) {
      // 一期不支持跨零点：兜底为 30 分钟块，避免负高度
      endSeconds = Math.min(86400, startSeconds + 1800);
    }
    startMinutes = Math.floor(startSeconds / 60);
    endMinutes = Math.floor(endSeconds / 60);

    const hasSeconds = !!(rangeMatch[3] || rangeMatch[6]);
    const startPart = hasSeconds
      ? `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:${String(ss1).padStart(2, '0')}`
      : `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
    const endPart = hasSeconds
      ? `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:${String(ss2).padStart(2, '0')}`
      : `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

    timeStr = `${startPart} - ${endPart}`;
    content = content.replace(rangeMatch[0], ' ').trim();
  } else {
    const singleMatch = content.match(singleRegex);
    if (singleMatch) {
      hasTime = true;
      const sh = parseInt(singleMatch[1], 10);
      const sm = parseInt(singleMatch[2], 10);
      const ss = singleMatch[3] ? parseInt(singleMatch[3], 10) : 0;

      startSeconds = sh * 3600 + sm * 60 + ss;
      startMinutes = Math.floor(startSeconds / 60);

      // Check duration tag e.g. 30m, 1h, 45min
      const durationMatch = content.match(/(?:^|\s)(\d+)(m|min|h|小时|分钟)(?:\s|$)/i);
      let durationSeconds = 1800; // default 30 min duration
      if (durationMatch) {
        explicitRange = true;
        const val = parseInt(durationMatch[1], 10);
        const unit = durationMatch[2].toLowerCase();
        durationSeconds = (unit.startsWith("h") || unit === "小时") ? val * 3600 : val * 60;
        content = content.replace(durationMatch[0], ' ').trim();
      }
      endSeconds = Math.min(86400, startSeconds + durationSeconds);
      endMinutes = Math.floor(endSeconds / 60);

      if (singleMatch[3]) {
        timeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      } else {
        timeStr = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
      }
      content = content.replace(singleMatch[0], ' ').trim();
    }
  }

  // Remove block reference ^1770058242
  content = content.replace(/\s*\^[a-zA-Z0-9_-]+\s*$/, '').trim();
  // Remove task completion date ✅ 2026-02-24
  content = content.replace(/✅\s*\d{4}-\d{2}-\d{2}/, '').trim();

  // Extract tags。#color/blue、#色/蓝（或 #color/#7c5cff）是显式配色指令（DEC-016），
  // 先摘出来，不算普通标签 —— 这样它不会出现在块内 meta、hover 标签列表里，却能决定块的颜色。
  const tags = [];
  let tint = null;
  content = content.replace(/#(?:color|色)\/(#?[\w\u4e00-\u9fa5-]+)/gi, (_, v) => {
    tint = v;
    return "";
  }).trim();
  content = content.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (_, t) => {
    tags.push(t);
    return "";
  }).trim();

  // If no time, only parse if it's a task, explicit list bullet, OR inside a designated memo section
  if (!hasTime) {
    if (!isTask && !line.trim().startsWith('-') && !line.trim().startsWith('*') && !line.trim().startsWith('+') && !inMemoSection) {
      return null;
    }
  }

  const displayText = content || (tags.length > 0 ? tags.map(t => '#' + t).join(' ') : (isTask ? "待办事项" : "随手记录"));

  return {
    id: `${filePath}#L${lineNum}`,
    filePath,
    dateStr,
    lineNum,
    rawLine: line,
    isTask,
    isCompleted,
    hasTime,
    isRange: explicitRange,
    startSeconds,
    endSeconds,
    startMinutes,
    endMinutes,
    timeStr,
    text: displayText,
    tags,
    tint,
    subItems: [],
    source: "daily"
  };
}
