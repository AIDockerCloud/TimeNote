// 弹性时间轴（行高内容驱动）的数学与分配测试
//
// 用法：node scripts/dev/test-elastic-timeline.mjs
// 前置：npm run build:core（测的是 core/index.mjs 里的真实实现，不是源码副本）
import { loadCore } from "./lib/elastic.mjs";

const { buildTimeScale, estimateBlockNeed } = await loadCore();

let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra ? `  [${extra}]` : ""));
};
const near = (a, b, eps, name) => ok(Math.abs(a - b) <= eps, name, `${a} vs ${b}`);

const H = (h) => h * 3600;
const SLOT = 52;
const entry = (s, en, text, extra) => ({ s, en, entry: { text, ...(extra || {}) } });

function build(entries, opts) {
  const list = entries.map((e) => ({
    s: e.s,
    en: e.en,
    needH: estimateBlockNeed(e.entry, (opts && opts.width) || 320)
  }));
  return buildTimeScale({
    startHour: 0,
    endHour: 24,
    slotHeight: SLOT,
    top: 0,
    elastic: true,
    viewportHeight: 0,
    ...(opts || {}),
    entries: list
  });
}

// ---------- 1. 结构性质：行高恒正、严格单调、互为反函数 ----------
{
  const sc = build([
    entry(H(9), H(9) + 1800, "系统巡检"),
    entry(H(10), H(11), "写周报"),
    entry(H(14), H(15.5), "排查线上告警并写复盘，内容比较长一些看看折行"),
    entry(H(20), H(21), "读书")
  ]);
  ok(sc.heights.every((h) => h > 0), "所有行高 > 0");
  ok(
    sc.bounds.every((b, i) => i === 0 || b > sc.bounds[i - 1]),
    "bounds 严格递增"
  );
  near(sc.bounds[0], 0, 1e-9, "轴顶 = top");
  near(sc.bounds[sc.rowCount], sc.totalHeight, 1e-9, "轴底 = totalHeight");
  ok(sc.yOf(H(0)) === 0, "yOf(起始) = top");
  near(sc.yOf(H(24)), sc.totalHeight, 1e-9, "yOf(结束) = 轴底");

  let prev = -1;
  let mono = true;
  for (let t = 0; t <= 24 * 3600; t += 300) {
    const y = sc.yOf(t);
    if (y <= prev && t > 0) mono = false;
    prev = y;
  }
  ok(mono, "yOf 在 5 分钟步长上严格单调");

  let maxErr = 0;
  for (let t = 0; t <= 24 * 3600; t += 427) {
    maxErr = Math.max(maxErr, Math.abs(sc.secOf(sc.yOf(t)) - t));
  }
  ok(maxErr < 1.0, "yOf / secOf 互逆", `最大误差 ${maxErr.toFixed(3)}s`);
}

// ---------- 2. 空档压缩：没有记录的小时必须是扁的 ----------
{
  const sc = build([entry(H(9), H(10), "只有一条")]);
  const maxEmpty = Math.max(...sc.heights.filter((_, i) => i !== 9));
  ok(maxEmpty <= SLOT * 0.4, "空档行压到槽高 40% 以内", `${maxEmpty.toFixed(1)}px`);
  ok(sc.heights[9] >= SLOT * 0.85, "有内容的行没被压扁", `${sc.heights[9].toFixed(1)}px`);
  ok(sc.totalHeight < 24 * SLOT, "内容少时整轴比等距轴短", `${sc.totalHeight.toFixed(0)} vs ${24 * SLOT}`);
}

// ---------- 3. 内容强相关：内容越多块越高，行高跟着涨 ----------
{
  const longText =
    "把这一周所有线上告警逐条复盘，并整理成文档发给团队所有人，再把结论同步到知识库与周报里";
  const shortNeed = estimateBlockNeed({ text: "开会" }, 320);
  const longNeed = estimateBlockNeed({ text: longText }, 320);
  ok(longNeed > shortNeed * 1.3, "长文本的块高显著大于短文本", `${shortNeed.toFixed(1)} → ${longNeed.toFixed(1)}`);

  const scShort = build([entry(H(9), H(10), "开会")]);
  const scLong = build([entry(H(9), H(10), longText)]);
  ok(
    scLong.heights[9] > scShort.heights[9],
    "内容多的行更高",
    `${scShort.heights[9].toFixed(1)} → ${scLong.heights[9].toFixed(1)}`
  );

  const text = "把这一周所有线上告警逐条复盘并整理成文档";
  const narrow = estimateBlockNeed({ text }, 160);
  const wide = estimateBlockNeed({ text }, 900);
  ok(narrow > wide, "列越窄块越高（折行更多）", `${wide.toFixed(1)} → ${narrow.toFixed(1)}`);
  ok(wide >= 28 && narrow <= 240, "块高落在 [28, 240] 区间");
}

// ---------- 4. 长跨度块：覆盖的行加起来必须放得下 ----------
{
  const text = "跨三小时的长会议，需要说明很多细节，标题会折成好几行才放得下这段文字内容";
  const sc = build([entry(H(9), H(12), text)]);
  const need = estimateBlockNeed({ text }, 320);
  const span = sc.yOf(H(12)) - sc.yOf(H(9));
  ok(span >= Math.min(need, 240), "三小时跨度放得下块内容", `span ${span.toFixed(1)} / need ${need.toFixed(1)}`);
  ok(
    sc.heights[10] >= 40 && sc.heights[11] >= 40,
    "跨度内的中间小时至少给到内容行高",
    `${sc.heights[10].toFixed(0)}/${sc.heights[11].toFixed(0)}`
  );
  ok(sc.heights[8] < sc.heights[9], "真正的空档小时仍被压扁");
}

// ---------- 5. 视口填充：内容很少时放大行距，但封顶 1.5 倍 ----------
{
  const scRaw = build([entry(H(9), H(10), "开会")]);
  const scFill = build([entry(H(9), H(10), "开会")], { viewportHeight: 900 });
  ok(scFill.totalHeight > scRaw.totalHeight, "填充后比原始内容轴高");
  ok(scFill.totalHeight <= scRaw.totalHeight * 1.5 + 1e-6, "填充倍数封顶 1.5", scFill.totalHeight.toFixed(0));
  const k = scFill.totalHeight / scRaw.totalHeight;
  near(scFill.heights[9] / scRaw.heights[9], k, 1e-6, "等比放大：行高同比例");
}

// ---------- 6. 关闭弹性：与旧等距实现逐像素一致 ----------
{
  const sc = buildTimeScale({
    startHour: 0,
    endHour: 24,
    slotHeight: SLOT,
    top: 0,
    elastic: false,
    entries: [{ s: H(9), en: H(10), needH: 200 }],
    viewportHeight: 900
  });
  ok(sc.heights.every((h) => h === SLOT), "等距模式每行都等于槽高");
  ok(sc.totalHeight === 24 * SLOT, "等距模式总高 = 24 * slotHeight");
  near(sc.yOf(H(9)), 9 * SLOT, 1e-9, "等距模式 09:00 位置");
}

// ---------- 7. 非零起点 / 极短记录 ----------
{
  const sc = buildTimeScale({
    startHour: 6,
    endHour: 22,
    slotHeight: SLOT,
    top: 0,
    elastic: true,
    viewportHeight: 0,
    entries: [{ s: H(6), en: H(6) + 300, needH: 38 }]
  });
  ok(sc.rowCount === 16, "非零起点行数正确");
  near(sc.yOf(H(6)), 0, 1e-9, "非零起点轴顶对齐");
  near(sc.yOf(H(22)), sc.totalHeight, 1e-9, "非零起点轴底对齐");
}

// ---------- 8. 全空的一天 ----------
{
  const sc = build([]);
  ok(sc.heights.every((h) => h === sc.heights[0]), "全空时各行等高");
  ok(sc.totalHeight === 24 * sc.heights[0], "全空时总高 = 行数 * 行高");
  ok(sc.heights[0] <= SLOT * 0.4, "全空时保持压缩", `${sc.heights[0].toFixed(1)}px`);
}

// ---------- 9. 同一小时内多条记录：行高随条数增长 ----------
{
  const one = build([entry(H(9), H(9.5), "开会")]);
  const three = build([
    entry(H(9), H(9.25), "开会"),
    entry(H(9.25), H(9.5), "写纪要"),
    entry(H(9.5), H(9.75), "发邮件")
  ]);
  ok(
    three.heights[9] > one.heights[9],
    "同小时条目多时该行更高",
    `${one.heights[9].toFixed(1)} → ${three.heights[9].toFixed(1)}`
  );
}

// ---------- 10. 典型一天的整体形态 ----------
{
  const sc = build(
    [
      entry(H(9), H(10.5), "系统巡检：ALB 证书续期与告警复核"),
      entry(H(10.5), H(11), "写周报"),
      entry(H(11), H(12), "例会"),
      entry(H(14), H(15.5), "排查线上告警"),
      entry(H(16), H(16.5), "复盘"),
      entry(H(20), H(21), "读书")
    ],
    { viewportHeight: 900 }
  );
  const contentIdx = [9, 10, 11, 14, 16, 20];
  const avgContent = contentIdx.reduce((a, i) => a + sc.heights[i], 0) / contentIdx.length;
  const empties = sc.heights.filter((_, i) => !contentIdx.includes(i));
  const avgEmpty = empties.reduce((a, b) => a + b, 0) / empties.length;
  ok(avgContent > avgEmpty * 1.5, "内容行显著高于空档行", `${avgEmpty.toFixed(1)} → ${avgContent.toFixed(1)}`);
  ok(sc.totalHeight >= 899, "典型一天填满屏", `${sc.totalHeight.toFixed(0)}`);
  console.log(
    `\n[典型一天] 内容行平均 ${avgContent.toFixed(1)}px / 空档行平均 ${avgEmpty.toFixed(1)}px / 轴高 ${sc.totalHeight.toFixed(0)}px`
  );
  contentIdx.forEach((i) => {
    console.log(`  ${String(i).padStart(2, "0")}:00 行高 ${sc.heights[i].toFixed(1).padStart(6)}  y=${sc.yOf(H(i)).toFixed(0)}`);
  });
}

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("FAILED:");
  fails.forEach((f) => console.log("  ✗", f));
  process.exit(1);
}
