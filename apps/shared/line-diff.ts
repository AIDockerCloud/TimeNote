// apps/shared/line-diff.ts — 虚拟 md 文件的行级 diff（DEC-032）
//
// 思源（块）与 Blinko（note）都把记录映射成「虚拟 md 的一行」。
// 写回时不能整篇覆盖，必须精确知道哪些行变了，才能只更新那一个块 / 那条 note。
// 两边共用这一份 LCS 实现，避免行为分叉。

export interface LineOp {
  op: "keep" | "delete" | "insert" | "replace";
  oldLine?: string;
  newLine?: string;
  /** 旧行对应的实体 id（思源块 id / Blinko note id 的字符串形式） */
  blockId?: string | null;
}

/**
 * 行级 LCS diff。相邻的 delete→insert 合并成 replace，好让「拖一下时间」
 * 走「更新同一个实体」，而不是「删掉再新建」把块引用 / note id 弄丢。
 */
export function diffLines(
  oldLines: string[], newLines: string[], oldIds: Array<string | null>
): LineOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: LineOp[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      raw.push({ op: "keep", oldLine: oldLines[i], newLine: newLines[j], blockId: oldIds[i] || null });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ op: "delete", oldLine: oldLines[i], blockId: oldIds[i] || null });
      i++;
    } else {
      raw.push({ op: "insert", newLine: newLines[j] });
      j++;
    }
  }
  while (i < n) { raw.push({ op: "delete", oldLine: oldLines[i], blockId: oldIds[i] || null }); i++; }
  while (j < m) { raw.push({ op: "insert", newLine: newLines[j] }); j++; }

  const out: LineOp[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k];
    const next = raw[k + 1];
    if (cur.op === "delete" && next && next.op === "insert") {
      out.push({
        op: "replace", oldLine: cur.oldLine, newLine: next.newLine,
        blockId: cur.blockId
      });
      k++;
    } else {
      out.push(cur);
    }
  }
  return out;
}
