// 视觉回归静态断言：防止「真机背景色全透明」与「表头/网格逐列错位」再次出现。
//
// 用法：node scripts/dev/test-visual-regression.mjs
// 只做源码静态检查，不依赖浏览器；真机等效 DOM 的数值探针见 preview-real-dom.mjs。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");
const ts = fs.readFileSync(path.join(PROJECT_ROOT, "main.ts"), "utf8");
// 去掉块注释，避免文件头的说明文字被误判成失效写法
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0;
const fails = [];
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name); console.log(`  ✗ ${name}`); }
};
const rule = (selector) => {
  const i = cssCode.indexOf(selector + " {");
  if (i < 0) return "";
  return cssCode.slice(i, cssCode.indexOf("}", i));
};

console.log("--- 颜色：不能用 Obsidian 未定义的 -rgb 变量 ---");
ok("CSS 里没有 rgba(var(--*-rgb), a) 失效写法",
  !/rgba\(var\(--[\w-]+-rgb\)/.test(cssCode));
ok("所有半透明色都有 color-mix 主题色版本",
  (cssCode.match(/color-mix\(/g) || []).length >= 25);
ok("color-mix 只引用官方存在的颜色变量",
  [...cssCode.matchAll(/color-mix\(in srgb, var\((--[\w-]+)/g)]
    .every(m => ["--color-accent", "--color-orange", "--color-green",
                 "--color-purple", "--background-modifier-border"].includes(m[1])));
const cssLines = cssCode.split("\n");
const mixLines = cssLines
  .map((l, i) => ({ l, i }))
  .filter(x => x.l.includes("color-mix("));
ok("每个 color-mix 声明前一行都有同属性的固定 rgba 兜底",
  mixLines.length >= 25 && mixLines.every(({ l, i }) => {
    const prop = l.trim().split(":")[0];
    const prev = cssLines[i - 1] || "";
    return prev.trim().startsWith(`${prop}:`) && /rgba\(/.test(prev);
  }));
ok("时间块是实色底（20%）且带边框",
  /\.timenote-event-block \{[\s\S]*?color-mix\(in srgb, var\(--color-accent[^\n]*20%, transparent\)/.test(cssCode) &&
  /\.timenote-event-block \{[\s\S]*?border: 1px solid/.test(cssCode));
ok("今日列表头 / 网格底色浓度一致",
  (cssCode.match(/var\(--color-accent, #7c5cff\) 5%, transparent\)/g) || []).length === 2);

console.log("--- 对齐：刻度列宽度与竖线 ---");
const cssW = (cssCode.match(/--tn-ruler-w:\s*(\d+)px/) || [])[1];
const tsW = (ts.match(/BLOCK_RULER_W\s*=\s*(\d+)/) || [])[1];
ok("CSS --tn-ruler-w 与 TS BLOCK_RULER_W 数值一致", !!cssW && cssW === tsW);
ok("刻度列宽度足够放下 ALL DAY 标签（>= 64px）", Number(cssW) >= 64);
ok("表头 spacer 禁止被内容撑宽（min-width:0 + overflow:hidden）",
  /min-width:\s*0/.test(rule(".timenote-block-ruler-spacer")) &&
  /overflow:\s*hidden/.test(rule(".timenote-block-ruler-spacer")));
ok("表头 spacer 与时间 ruler 同宽",
  rule(".timenote-block-ruler-spacer").includes("var(--tn-ruler-w") &&
  rule(".timenote-block-ruler").includes("var(--tn-ruler-w"));
ok("网格列去掉了紧凑流的 border-right（避免双线错位）",
  /border-right:\s*none/.test(rule(".timenote-block-column")));
ok("当前时间线起点跟随刻度列宽",
  /left:\s*var\(--tn-ruler-w/.test(rule(".timenote-now-line")));
ok("当前时间胶囊宽度受刻度列约束",
  /max-width:\s*calc\(var\(--tn-ruler-w/.test(rule(".timenote-now-label")));

console.log("--- 滚动条补偿：持续同步而非只量首帧 ---");
ok("syncHeaderGutter 方法存在", /syncHeaderGutter\(wrapper, header, scrollArea\) \{/.test(ts));
ok("两个渲染器都调用 syncHeaderGutter",
  (ts.match(/this\.syncHeaderGutter\(/g) || []).length === 2);
ok("使用 ResizeObserver 持续同步", /new ResizeObserver\(/.test(ts));
ok("不残留手写等距换算 / 硬编码 52px 刻度宽",
  !/\(viewWidth - 52\)/.test(ts) && !/left: 52px/.test(cssCode));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) process.exit(1);
