/**
 * DSH 插件入口：把本包自带的 skills/ 目录作为技能提供方注册进 `ctx.skills`。
 *
 * 为什么不是「往 customSkillDirs 里塞一行配置」：那样只能作用在改过配置文件的那台机器上，
 * 而作为插件包分发时，用户 `dsh plugin add` 之后不希望再手工建联接或改 YAML。
 * 插件自己实现 SkillProvider 后，技能目录随包走，安装即生效。
 *
 * 实现刻意保持零依赖：frontmatter 只用本文件里的极简解析器（本插件的 SKILL.md 只有
 * `name` / `description` / `whenToUse` / `metadata` 四个键，其中 metadata 为嵌套映射），
 * 这样插件即使在没有 js-yaml 的环境里也能加载。
 *
 * 契约来源（与 @deepseek-ai/dsh-skill 的实现一致）：
 *   - 在 `apply()` 中同步调用 `ctx.skills.registerProvider(create)`；
 *   - `create(control)` 返回 `{ name, list, get }`；
 *   - `list(options)` 返回候选数组或 `{ candidates, complete }`；
 *   - 候选必须带 name / description / source / rank / provider / locator（invocation 可选）；
 *   - `get(candidate, options)` 返回带 `content` 的完整技能定义，资源基址用
 *     `resourceBase.kind = "directory"` 指到技能目录。
 */

import { watch, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'resume-job-search';
export const inject = ['skills'];

/** 默认技能根目录：lib/ 的同级 skills/ */
const DEFAULT_SKILLS_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'skills');
/** 候选优先级：比项目级(100/200)、运行时(250)低，比用户级(400/500)、内置(600)高 */
const PROVIDER_RANK = 300;
/** 技能来源标签（SkillSource 接受任意字符串） */
const SKILL_SOURCE = 'installed';
/** 文件监视：合并抖动窗口，避免连续写入触发多次失效 */
const WATCH_DEBOUNCE_MS = 150;

/**
 * 极简 frontmatter 解析：只处理本插件用到的键。
 * @param {string} text - SKILL.md 全文
 * @returns {{ data: Record<string, unknown>, content: string } | undefined}
 */
function parseFrontmatter(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 容忍 BOM，但不鼓励
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (match === null) return undefined;
  const block = match[1];
  const data = {};
  let currentKey;
  let nested = null;
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) continue;
    const indented = /^[ \t]/.test(rawLine);
    const line = rawLine.trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = stripQuotes(unquote(line.slice(separator + 1).trim()));
    if (!indented) {
      if (value === '') {
        nested = {};
        data[key] = nested;
        currentKey = key;
      } else {
        nested = null;
        currentKey = undefined;
        data[key] = value;
      }
      continue;
    }
    if (nested !== null && currentKey !== undefined) nested[key] = value;
  }
  return { data, content: text.slice(match[0].length) };
}

function unquote(value) {
  return /^["'].*["']$/.test(value) ? value.slice(1, -1) : value;
}

function stripQuotes(value) {
  return typeof value === 'string' ? value : String(value);
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * 扫描技能根目录的第一层：`<root>/<技能名>/SKILL.md`。
 * @param {string} root - 技能根目录
 * @returns {Array<{ directory: string, path: string }>}
 */
function discoverSkillFiles(root) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue;
    const directory = join(root, entry);
    let stats;
    try {
      stats = statSync(directory);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;
    const path = join(directory, 'SKILL.md');
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    found.push({ directory, path });
  }
  return found;
}

/**
 * 读取并解析一个技能文件；解析失败返回 undefined，由调用方决定是否记录警告。
 * @param {string} path - SKILL.md 路径
 */
function readSkill(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
  const parsed = parseFrontmatter(text);
  if (parsed === undefined) return undefined;
  const skillName = stringOrUndefined(parsed.data.name);
  const description = stringOrUndefined(parsed.data.description);
  if (skillName === undefined || description === undefined) return undefined;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) return undefined;
  const metadata = parsed.data.metadata;
  return {
    name: skillName,
    description,
    whenToUse: stringOrUndefined(parsed.data.whenToUse),
    metadata: metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : undefined,
    content: parsed.content,
  };
}

/**
 * 构造提供给 ctx.skills 的提供方。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文
 * @param {SkillProviderControl} control - 注册作用域控制（signal / invalidate）
 * @param {{ skillsDir: string, logger?: { warn?: (message: string) => void }, onDispose?: (dispose: () => void) => void }} options
 */
function createProvider(ctx, control, options) {
  const { skillsDir } = options;
  const logger = options.logger ?? ctx?.logger ?? console;
  const warn = (message) => {
    try {
      logger.warn?.(`[resume-job-search] ${message}`);
    } catch {
      /* 日志失败不得影响技能加载 */
    }
  };

  /** 记录已警告过的解析失败项，避免每次 list() 刷屏 */
  const warned = new Set();
  const watchers = new Set();
  let watchedChildren = new Set();
  let timer;
  let closing = false;

  const invalidateSoon = () => {
    if (closing) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (!closing) control.invalidate();
    }, WATCH_DEBOUNCE_MS);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const addWatcher = (target, recursive) => {
    try {
      const handle = watch(target, { recursive }, invalidateSoon);
      if (typeof handle.unref === 'function') handle.unref();
      watchers.add(handle);
      return handle;
    } catch {
      return undefined;
    }
  };

  // 技能文件的增删改要触发缓存失效，这样编辑技能后无需重启 DSH。
  // 优先整树递归监视；平台不支持（Linux 的部分版本）时退回「根目录 + 每个技能目录」深度 1。
  let recursive = addWatcher(skillsDir, true) !== undefined;
  if (!recursive) {
    addWatcher(skillsDir, false);
    refreshChildWatchers();
  }

  /** 为 `<root>/<技能名>` 这一层补监视句柄，保持集合与磁盘一致。 */
  function refreshChildWatchers() {
    if (closing) return;
    const wanted = new Set(
      discoverSkillFiles(skillsDir).map((file) => file.directory),
    );
    for (const directory of watchedChildren) {
      if (!wanted.has(directory)) {
        for (const handle of watchers) {
          if (handle.__directory === directory) {
            try {
              handle.close();
            } catch {
              /* 已关闭 */
            }
            watchers.delete(handle);
          }
        }
      }
    }
    for (const directory of wanted) {
      if (watchedChildren.has(directory)) continue;
      const handle = addWatcher(directory, false);
      if (handle !== undefined) handle.__directory = directory;
    }
    watchedChildren = wanted;
  }

  options.onDispose?.(() => {
    closing = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const handle of watchers) {
      try {
        handle.close();
      } catch {
        /* 已关闭 */
      }
    }
    watchers.clear();
  });

  return {
    name: 'resume-job-search',

    /** @param {{ signal?: AbortSignal }} lookupOptions */
    async list(lookupOptions) {
      if (lookupOptions?.signal?.aborted === true) return [];
      const candidates = [];
      for (const file of discoverSkillFiles(skillsDir)) {
        const skill = readSkill(file.path);
        if (skill === undefined) {
          if (!warned.has(file.path)) {
            warned.add(file.path);
            warn(`跳过无法解析的技能文件：${file.path}（frontmatter 需含 kebab-case 的 name 与非空 description）`);
          }
          continue;
        }
        candidates.push({
          name: skill.name,
          description: skill.description,
          ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
          source: SKILL_SOURCE,
          provider: 'resume-job-search',
          rank: PROVIDER_RANK,
          locator: { path: file.path, directory: file.directory },
          path: file.path,
          ...(skill.metadata !== undefined ? { metadata: skill.metadata } : {}),
        });
      }
      return candidates;
    },

    /**
     * @param {{ locator?: { path?: string, directory?: string } }} candidate
     * @param {{ signal?: AbortSignal }} lookupOptions
     */
    async get(candidate, lookupOptions) {
      if (lookupOptions?.signal?.aborted === true) return undefined;
      const locator = candidate?.locator;
      if (locator === undefined || typeof locator.path !== 'string') return undefined;
      const skill = readSkill(locator.path);
      if (skill === undefined) return undefined;
      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
        source: SKILL_SOURCE,
        provider: 'resume-job-search',
        resourceBase: { kind: 'directory', path: locator.directory },
        path: locator.path,
        ...(skill.metadata !== undefined ? { metadata: skill.metadata } : {}),
        content: skill.content,
      };
    },
  };
}

/**
 * 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 插件上下文（需已加载 ctx.skills）
 * @param {{ skillsDir?: string, quiet?: boolean }} [config] - 可选配置：技能根目录（默认包内 skills/）
 */
export function apply(ctx, config = {}) {
  const skillsDir = resolve(config.skillsDir ?? DEFAULT_SKILLS_DIR);
  const disposers = [];

  const skills = ctx?.skills;
  if (skills === undefined || typeof skills.registerProvider !== 'function') {
    ctx?.logger?.warn?.(
      `[resume-job-search] 未找到 ctx.skills 服务，技能未注册；请确认 profile 已加载 @deepseek-ai/dsh-skill`,
    );
    return;
  }

  skills.registerProvider((control) =>
    createProvider(ctx, control, {
      skillsDir,
      logger: ctx.logger,
      onDispose: (dispose) => disposers.push(dispose),
    }),
  );

  if (typeof ctx.on === 'function') {
    ctx.on('dispose', () => {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* 释放失败不影响其余清理 */
        }
      }
    });
  }

  if (config.quiet !== true) {
    ctx?.logger?.info?.(`[resume-job-search] 已从 ${skillsDir} 注册技能提供方`);
  }
}

/** 供测试与诊断使用：不依赖 ctx，直接列出会被注册的技能名 */
export function listSkills(skillsDir = DEFAULT_SKILLS_DIR) {
  return discoverSkillFiles(resolve(skillsDir))
    .map((file) => readSkill(file.path))
    .filter((skill) => skill !== undefined)
    .map((skill) => ({ name: skill.name, description: skill.description, whenToUse: skill.whenToUse }));
}

export default { name, inject, apply, listSkills };
