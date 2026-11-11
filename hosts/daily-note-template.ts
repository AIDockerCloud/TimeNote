// hosts/daily-note-template.ts — Obsidian 日记模板读取与变量替换（DEC-028）
//
// 背景：TimeNote 以前建日记是自己拼 `# 日期\n\n## 灵感闪念\n` 然后 vault.create，
// 把 Obsidian 核心「日记」插件配置的模板整条绕过。本文件负责把模板内容取回来，
// 由 sources/daily.ts 在新建日记时写进去。
//
// 分层：这里**不 import obsidian、不读 window / 全局**，宿主对象一律通过参数注入，
// 所以能进 hosts/index.mjs（ESM 产物）被测试直接 import 真实现。
// 变量替换规则对齐 Obsidian 核心模板插件 / obsidian-daily-notes-interface：
//   {{date}} / {{title}} → 按日记插件的 format 展开（注意 format 可能含目录）
//   {{time}}             → 当前 HH:mm
//   {{date:FORMAT}}      → 当天按 FORMAT 展开，可带偏移如 {{date+1d:YYYY-MM-DD}}
//   {{time:FORMAT}}      → 当前时刻按 FORMAT 展开
//   {{yesterday}} / {{tomorrow}} → 相邻日期按 format 展开
// 未知变量原样保留，不吞掉用户内容。

import type { MomentFactory } from "../ui/date";

/** 设置值里显式关闭模板的关键字（大小写不敏感） */
const OFF_RE = /^(off|none|disable|关闭|禁用)$/i;
/** Obsidian 核心日记插件的默认文件名格式 */
export const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

/**
 * 复合变量里的单字母时间单位归一化成完整名。
 * Obsidian 注入的 moment 认 "d" / "w"，但零依赖的 nativeMoment 只认
 * "day" / "week"（ui/native-moment.ts 的 add 分支）。统一成完整名，
 * 两种实现算出来的日期才一致，也不依赖 moment 的别名支持。
 */
const UNIT_ALIASES: Record<string, string> = {
  y: "year", q: "quarter", m: "month", w: "week",
  d: "day", h: "hour", s: "second"
};

export interface DailyNotesConfig {
  folder: string;
  format: string;
  template: string;
}

/**
 * 决定最终使用哪个模板文件。
 *
 * 三态（DEC-028）：
 *   off / none / disable / 关闭 / 禁用 → null，回退到 TimeNote 内置日记结构
 *   其它非空值                        → 插件自定义模板路径（覆盖 Obsidian 的）
 *   空（默认）                        → 跟随 Obsidian 日记插件的 template
 * Obsidian 没配模板时也返回 null，行为与旧版逐字一致。
 */
export function resolveTemplatePath(setting: unknown, obsidianTemplate: unknown): string | null {
  const raw = String(setting ?? "").trim();
  if (OFF_RE.test(raw)) return null;
  if (raw) return raw;
  const fromObsidian = String(obsidianTemplate ?? "").trim();
  return fromObsidian || null;
}

export interface TemplateRenderOptions {
  /** 日记日期，YYYY-MM-DD */
  dateStr: string;
  /** Obsidian 日记插件的 format（可能含目录与 [] 转义） */
  format?: string;
  /** 宿主注入的日期实现（Obsidian 侧来自宿主注入，测试可传 nativeMoment） */
  makeMoment: MomentFactory;
  /** 可注入的当前时间，便于断言；缺省从 makeMoment() 取 HH:mm */
  nowTime?: string;
}

/** 把模板里的 Obsidian 变量换成实际值。纯函数（无全局、无宿主 API）。 */
export function renderTemplateVariables(content: string, opts: TemplateRenderOptions): string {
  const text = String(content ?? "");
  const format = String(opts.format || DEFAULT_DAILY_NOTE_FORMAT);
  const makeMoment = opts.makeMoment;
  const now = makeMoment();
  const date = makeMoment(opts.dateStr, "YYYY-MM-DD");
  const filename = date.format(format);
  const nowTime = opts.nowTime ?? now.format("HH:mm");

  let out = text
    .replace(/\{\{\s*date\s*\}\}/gi, filename)
    .replace(/\{\{\s*time\s*\}\}/gi, nowTime)
    .replace(/\{\{\s*title\s*\}\}/gi, filename);

  // 带自定义格式 / 日期偏移的复合变量。正则沿用 obsidian-daily-notes-interface，
  // 保证与核心插件的书写习惯一致（{{date:YYYY-MM-DD}}、{{date+1d:YYYY/MM/DD}} 等）。
  out = out.replace(
    /\{\{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?\}\}/gi,
    (_m, kind: string, _calc: string, delta: string, unit: string, fmt: string) => {
      let base = String(kind).toLowerCase() === "time"
        ? makeMoment()
        : makeMoment(opts.dateStr, "YYYY-MM-DD");
      if (delta) base = base.add(parseInt(delta, 10), UNIT_ALIASES[unit] || unit);
      const pattern = fmt ? fmt.substring(1).trim() : format;
      return base.format(pattern);
    }
  );

  out = out
    .replace(/\{\{\s*yesterday\s*\}\}/gi,
      makeMoment(opts.dateStr, "YYYY-MM-DD").clone().subtract(1, "day").format(format))
    .replace(/\{\{\s*tomorrow\s*\}\}/gi,
      makeMoment(opts.dateStr, "YYYY-MM-DD").clone().add(1, "day").format(format));

  return out;
}

function normalizeConfig(raw: any): DailyNotesConfig {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    folder: str(raw?.folder),
    format: str(raw?.format) || DEFAULT_DAILY_NOTE_FORMAT,
    template: str(raw?.template)
  };
}

/**
 * 读 Obsidian 日记插件配置，按社区既有做法排列优先级：
 *   ① periodic-notes 社区插件且启用了 daily（它的设置覆盖核心插件）
 *   ② 核心 daily-notes 插件 instance.options（私有 API，但被大量插件使用）
 *   ③ 兜底直接读 .obsidian/daily-notes.json（vault.adapter 能读隐藏目录）
 * 任一步失败都继续往下走，最终回退到默认值，绝不因读配置失败而阻止建日记。
 */
export async function readObsidianDailyNotesConfig(app: any): Promise<DailyNotesConfig> {
  try {
    const periodic = app?.plugins?.getPlugin?.("periodic-notes");
    const daily = periodic?.settings?.daily;
    if (daily?.enabled) return normalizeConfig(daily);
  } catch { /* 插件未安装 / 内部 API 变更 */ }

  try {
    const options = app?.internalPlugins?.getPluginById?.("daily-notes")?.instance?.options;
    if (options && typeof options === "object") return normalizeConfig(options);
  } catch { /* 内部 API 变更 */ }

  try {
    const raw = await app?.vault?.adapter?.read?.(".obsidian/daily-notes.json");
    if (raw) return normalizeConfig(JSON.parse(raw));
  } catch { /* 文件不存在 / JSON 损坏 */ }

  return { folder: "", format: DEFAULT_DAILY_NOTE_FORMAT, template: "" };
}

/**
 * 读模板文件内容。模板路径按 Obsidian 惯例是 vault 内相对路径，可带或不带 .md。
 * 优先 metadataCache.getFirstLinkpathDest（与核心模板插件一致），再退到
 * getAbstractFileByPath，最后退到 adapter.read —— 后者能读到未被索引的文件。
 */
export async function readTemplateFile(app: any, templatePath: string): Promise<string | null> {
  const base = String(templatePath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!base || base === "/") return null;
  const candidates = [base];
  if (!/\.md$/i.test(base)) candidates.push(`${base}.md`);

  for (const candidate of candidates) {
    try {
      const file = app?.metadataCache?.getFirstLinkpathDest?.(candidate, "")
        || app?.vault?.getAbstractFileByPath?.(candidate);
      if (file && app?.vault?.cachedRead) {
        const content = await app.vault.cachedRead(file);
        if (typeof content === "string") return content;
      }
      if (await app?.vault?.adapter?.exists?.(candidate)) {
        const content = await app.vault.adapter.read(candidate);
        if (typeof content === "string") return content;
      }
    } catch { /* 换下一个候选路径 */ }
  }
  return null;
}

export interface TemplateResolverDeps {
  makeMoment: MomentFactory;
  /** 模板读不到时的提示（控制台即可，不弹 Notice —— 每次新建都弹太吵） */
  warn?: (message: string) => void;
}

/**
 * 装配成 sources/daily.ts 需要的 resolveTemplate(dateStr) 回调。
 * settings 是宿主共享的可变对象，每次调用都读最新值，改完设置立即生效。
 * 返回 null 表示「不使用模板」，DailySource 会逐字回退到旧版内置日记结构。
 */
export function createObsidianTemplateResolver(
  app: any,
  settings: any,
  deps: TemplateResolverDeps
): (dateStr: string) => Promise<string | null> {
  return async (dateStr: string): Promise<string | null> => {
    const cfg = await readObsidianDailyNotesConfig(app);
    const path = resolveTemplatePath(settings?.dailyNoteTemplate, cfg.template);
    if (!path) return null;

    const content = await readTemplateFile(app, path);
    if (content === null || !String(content).trim()) {
      deps.warn?.(`TimeNote: 日记模板「${path}」读取失败或为空，回退到内置日记结构`);
      return null;
    }
    return renderTemplateVariables(content, {
      dateStr,
      format: cfg.format,
      makeMoment: deps.makeMoment
    });
  };
}
