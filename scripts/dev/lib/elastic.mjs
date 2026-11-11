// 加载 core 的真实实现，供开发脚本调用。
//
// 为什么这么写（DEC-023）：core 从 main.ts 抽成独立文件后，esbuild 会丢弃
// 源码里的 `// --- XXX_BEGIN ---` 注释，于是「按位置切片取实现」这条老路
// 在多文件下必然错位。改为：core 编译出独立 ESM 产物 core/index.mjs，
// 这里直接 import —— 测的仍然是真正打进产物的那份代码，且不再依赖源码物理位置。
//
// 用法前提：先跑 `npm run build:core`（或 `npm run build`，它会顺带编 core）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// scripts/dev/lib/ → 项目根
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);

const CORE_ENTRY = path.join(PROJECT_ROOT, "core", "index.mjs");

/**
 * 载入 core 的导出。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<Object>} core/index.mjs 的全部导出
 */
export async function loadCore(root = PROJECT_ROOT) {
  const entry = path.join(root, "core", "index.mjs");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 core 产物 ${entry}。请先执行 npm run build:core（或 npm run build）。`
    );
  }
  return await import(entry);
}

/**
 * 载入 sources 层的导出（数据源契约与实现）。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<Object>} sources/index.mjs 的全部导出
 */
export async function loadSources(root = PROJECT_ROOT) {
  const entry = path.join(root, "sources", "index.mjs");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 sources 产物 ${entry}。请先执行 npm run build:sources（或 npm run build）。`
    );
  }
  return await import(entry);
}

/**
 * 载入「插件应用源码全集」（DEC-025）。
 *
 * 视图引擎从 main.ts 搬进 ui/view.ts、宿主能力搬进 hosts/obsidian/adapter.ts 后，
 * 按方法签名切片 / 静态断言的脚本只读 main.ts 就会找不到东西。这里按固定顺序
 * 拼成一份源码，让老脚本的 `indexOf("  async xxx(")` 继续有效。
 *
 * 顺序固定：main.ts → ui/view.ts → hosts/obsidian/adapter.ts。
 * 计数型断言（「恰好 2 处」）不会因拼接产生重复命中 —— 这几个模式只存在于 view。
 */
const PLUGIN_SOURCE_FILES = [
  "main.ts",
  "ui/view.ts",
  "hosts/obsidian/adapter.ts",
  "apps/bootstrap.ts"
];

export function loadPluginSources(root = PROJECT_ROOT) {
  return PLUGIN_SOURCE_FILES.map(f => {
    const p = path.join(root, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  }).join("\n");
}

/** 只读某一个源文件（需要针对特定层做断言时用） */
export function loadPluginSource(name, root = PROJECT_ROOT) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

/**
 * 载入 ui 层的导出（平台无关 DOM 辅助 + 日期抽象，DEC-024）。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<Object>} ui/index.mjs 的全部导出
 */
export async function loadUi(root = PROJECT_ROOT) {
  const entry = path.join(root, "ui", "index.mjs");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 ui 产物 ${entry}。请先执行 npm run build:ui（或 npm run build）。`
    );
  }
  return await import(entry);
}

/**
 * 载入 hosts 层的平台无关导出（HostAdapter 契约 + 内存参考宿主，DEC-025）。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<Object>} hosts/index.mjs 的全部导出
 */
export async function loadHosts(root = PROJECT_ROOT) {
  const entry = path.join(root, "hosts", "index.mjs");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 hosts 产物 ${entry}。请先执行 npm run build:hosts（或 npm run build）。`
    );
  }
  return await import(entry);
}

/**
 * 载入 apps 装配入口（DEC-025）。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<Object>} apps/index.mjs 的全部导出
 */
export async function loadApps(root = PROJECT_ROOT) {
  const entry = path.join(root, "apps", "index.mjs");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `找不到 apps 产物 ${entry}。请先执行 npm run build:apps（或 npm run build）。`
    );
  }
  return await import(entry);
}

/**
 * 载入弹性时间轴相关内部函数（保持老名字，脚本调用点不用大改）。
 * @param {string} [root] 项目根目录，默认自动推断
 * @returns {Promise<{ buildTimeScale: Function, estimateBlockNeed: Function,
 *                     layoutPointLines: Function, isPointEntry: Function }>}
 */
export async function loadElasticInternals(root = PROJECT_ROOT) {
  const core = await loadCore(root);
  return {
    buildTimeScale: core.buildTimeScale,
    estimateBlockNeed: core.estimateBlockNeed,
    layoutPointLines: core.layoutPointLines,
    isPointEntry: core.isPointEntry
  };
}

// 保留 require 句柄，供个别脚本需要 CommonJS 语义时使用
export const require = createRequire(import.meta.url);
