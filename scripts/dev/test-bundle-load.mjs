// 产物加载冒烟测试（DEC-023）
//
// 为什么需要它：`main.js` 是直接分发给用户的产物，一旦顶层代码在加载期抛错
// （例如有人在模块作用域调了 `window.moment`、或者 import 了一个不存在的导出），
// 整台机器上的插件都会变成「无法加载」，而 tsc 与单元测试都抓不到这类问题 ——
// 它们从不真正 require 产物。
//
// 用法：node scripts/dev/test-bundle-load.mjs
// 前置：npm run build
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

const bundlePath = path.join(PROJECT_ROOT, "main.js");
if (!fs.existsSync(bundlePath)) {
  console.error("找不到 main.js，请先执行 npm run build");
  process.exit(1);
}

console.log("--- 产物加载 ---");

// 用桩替换 obsidian：这里只验证「模块能加载、导出形状对」，不跑真实逻辑
const require_ = createRequire(import.meta.url);
const Module = require_("node:module");
const origLoad = Module._load;
const stub = new Proxy({}, {
  get(target, key) {
    if (key === "__esModule") return true;
    if (!(key in target)) target[key] = class {};
    return target[key];
  }
});

let exported = null;
let loadError = null;
Module._load = function (request) {
  if (request === "obsidian") return stub;
  return origLoad.apply(this, arguments);
};
try {
  const mod = require_(bundlePath);
  exported = mod && (mod.default || mod);
} catch (err) {
  loadError = err;
} finally {
  Module._load = origLoad;
}

ok("main.js 能在加载期无异常执行", !loadError, loadError && loadError.message);
ok("默认导出是插件类", typeof exported === "function", typeof exported);
ok("插件类有 onload / onunload（Obsidian 的钩子是小写）",
  !!(exported && exported.prototype && exported.prototype.onload && exported.prototype.onunload));

console.log("--- 产物内容 ---");
const bundle = fs.readFileSync(bundlePath, "utf8");

ok("core 的实现确实进了产物（不是空引用）",
  /assignDayTints/.test(bundle) && /buildTimeScale/.test(bundle));
ok("sources 的实现确实进了产物",
  /api\/v1\/memos/.test(bundle) && /api\/v1\/note\/list/.test(bundle));
// 来源类名是运行时拼的（`is-external is-${id}`），产物里不会有 "is-memos" 字面量，
// 所以这里校验「拼接逻辑在 + 来源标识在」，具体产出由 test:sources 覆盖。
ok("来源类名拼接逻辑进了产物", /is-external is-/.test(bundle) && /memos/.test(bundle));
ok("产物里安装的 DOM 垫片是「不覆盖」模式（Obsidian 侧零变化）",
  /prepareHostEnvironment\(\{ momentFactory: window\.moment \}\)/.test(bundle) &&
  /installDomHelpers\(opts\.forceDomHelpers === true\)/.test(bundle) &&
  !/forceDomHelpers:\s*true/.test(bundle));
ok("产物里日期实现由宿主注入", /setMomentFactory\(/.test(bundle));
ok("产物没有被打包成 ESM（Obsidian 要 CJS）",
  /module\.exports|exports\./.test(bundle));

// ---------- 开发脚本接线 ----------
// 上一轮把 loadCore/loadSources/loadElasticInternals 改成 async 后，
// 两个预览脚本仍同步取值，静默变成 undefined —— 全量测试却是绿的。
// 这里守住「所有 loader 调用都必须 await」。
console.log("--- 开发脚本接线 ---");
{
  const devDir = path.join(PROJECT_ROOT, "scripts", "dev");
  const loaders = ["loadCore", "loadSources", "loadUi", "loadElasticInternals"];
  const bad = [];
  for (const f of fs.readdirSync(devDir).filter(f => f.endsWith(".mjs"))) {
    const s = fs.readFileSync(path.join(devDir, f), "utf8");
    for (const fn of loaders) {
      const re = new RegExp(`(?<!await\\s)(?<!\\.)\\b${fn}\\s*\\(`, "g");
      // 排除函数定义 / import 行
      for (const line of s.split("\n")) {
        if (/^\s*(import|export)\b/.test(line) || /function\s/.test(line)) continue;
        if (re.test(line)) bad.push(`${f}: ${fn} 未 await`);
        re.lastIndex = 0;
      }
    }
  }
  ok("所有 core/sources/ui loader 调用都有 await", bad.length === 0, bad.join("; "));
}

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log(fails.map(f => "  - " + f).join("\n"));
  process.exit(1);
}
