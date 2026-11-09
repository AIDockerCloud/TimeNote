// 从构建产物 main.js 里取出弹性时间轴的内部函数，供开发脚本调用。
//
// 为什么需要这个：main.js 是 esbuild 打出来的 CJS 包，只导出插件类，
// buildTimeScale / estimateBlockNeed 是模块内私有函数，测试无法直接 import。
// 这里的做法是按标记切出那段源码再用 new Function 求值 —— 好处是测的永远是
// 真正打进产物的那份代码，而不是源码的另一份拷贝。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// scripts/dev/lib/ → 项目根
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

const START_MARK = "var ELASTIC_EMPTY_RATIO";
const END_MARK = "function parseLine";

/**
 * 从产物里取出弹性时间轴的内部函数。
 * @param {string} [root] 项目根目录，默认自动推断
 * @param {Record<string, number>} [overrides] 临时覆盖常量值（仅用于预览里试参数，不改源码）
 * @returns {{ buildTimeScale: Function, estimateBlockNeed: Function,
 *            layoutPointLines: Function, isPointEntry: Function }}
 */
export function loadElasticInternals(root = PROJECT_ROOT, overrides = null) {
  const bundlePath = path.join(root, "main.js");
  const bundle = fs.readFileSync(bundlePath, "utf8");

  const start = bundle.indexOf(START_MARK);
  const end = bundle.indexOf(END_MARK);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `在 ${bundlePath} 里找不到弹性时间轴代码段（标记 ${START_MARK} … ${END_MARK}）。` +
        `如果改动过常量名或函数顺序，请同步更新 scripts/dev/lib/elastic.mjs 的标记。`
    );
  }

  let source = bundle.slice(start, end);

  // 预览调参用：把 `const NAME = 123;` 换成指定的值，得到「假如改了这个常量」的行为
  if (overrides) {
    for (const [name, value] of Object.entries(overrides)) {
      const re = new RegExp(`const ${name} = [^;]+;`);
      if (!re.test(source)) throw new Error(`覆盖失败：${name} 不在弹性轴代码段里`);
      source = source.replace(re, `const ${name} = ${value};`);
    }
  }
  // 用 new Function 求值，函数内部引用的常量都在同一段源码里，作用域自洽
  // POINT_LINE 区块位于 buildTimeScale 与 parseLine 之间，同属这段切片（DEC-018）。
  const factory = new Function(
    `${source}\nreturn { buildTimeScale, estimateBlockNeed, layoutPointLines, isPointEntry };`
  );
  return factory();
}
