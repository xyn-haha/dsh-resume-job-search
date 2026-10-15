#!/usr/bin/env node
/**
 * 插件契约测试（不依赖 DSH 安装）：用 mock 的 ctx.skills 驱动本包注册的提供方，
 * 按 @deepseek-ai/dsh-skill 注册表的真实校验规则检查每个候选。
 *
 * 校验点：
 *   1. 导出 apply() / inject / 默认导出；
 *   2. apply() 中同步调用 ctx.skills.registerProvider，并注册 dispose 清理；
 *   3. list() 的候选字段满足注册表校验（kebab-case name、description、source、rank、provider、locator）；
 *   4. get() 能载入正文，并给出 resourceBase 目录基址；
 *   5. 技能文件变化触发 control.invalidate()（热更新）；
 *   6. 坏 frontmatter / 缺 SKILL.md 的目录被安全跳过。
 *
 * 用法：node test/provider.test.mjs
 */

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = await import(pathToFileURL(join(repoRoot, 'lib', 'index.js')).href);

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

// —— mock ctx：只实现插件真正用到的能力 ——
let registration;
let disposeCb;
const warnings = [];
const makeCtx = () => ({
  logger: { warn: (m) => warnings.push(m), info: () => {} },
  on: (event, cb) => {
    if (event === 'dispose') disposeCb = cb;
  },
  skills: {
    registerProvider: (create) => {
      registration = create;
    },
  },
});

console.log('1) 导出与注册');
const ctx = makeCtx();
plugin.apply(ctx);
check(typeof plugin.apply === 'function', '导出 apply()');
check(Array.isArray(plugin.inject) && plugin.inject.includes('skills'), 'inject 声明 ["skills"]');
check(typeof registration === 'function', 'apply() 中同步调用 ctx.skills.registerProvider');
check(typeof disposeCb === 'function', '注册了 dispose 清理钩子');

let invalidations = 0;
const provider = registration({ signal: new AbortController().signal, invalidate: () => (invalidations += 1) });
check(provider?.name === 'resume-job-search', `提供方名称 = ${provider?.name}`);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const output = await provider.list({});
const candidates = Array.isArray(output) ? output : output.candidates;
console.log(`\n2) list() 候选（${candidates.length} 个）`);
check(candidates.length === 8, `候选数 = 8（实际 ${candidates.length}）`);
for (const candidate of candidates) {
  const problems = [];
  if (!KEBAB.test(candidate.name)) problems.push('name 非 kebab-case');
  if (typeof candidate.description !== 'string' || candidate.description.length === 0) problems.push('description 缺失');
  if (candidate.whenToUse !== undefined && typeof candidate.whenToUse !== 'string') problems.push('whenToUse 非字符串');
  if (typeof candidate.source !== 'string') problems.push('source 非字符串');
  if (!Number.isFinite(candidate.rank)) problems.push('rank 非法');
  if (candidate.provider !== provider.name) problems.push('provider 与提供方名不一致');
  if (typeof candidate.locator?.path !== 'string') problems.push('locator.path 缺失');
  check(problems.length === 0, `${candidate.name.padEnd(22)} rank=${candidate.rank} source=${candidate.source}${problems.length ? ' → ' + problems.join('; ') : ''}`);
}

console.log('\n3) get() 载入正文');
for (const candidate of candidates) {
  const definition = await provider.get(candidate, {});
  check(
    definition !== undefined &&
      typeof definition.content === 'string' &&
      definition.content.length > 200 &&
      definition.name === candidate.name &&
      definition.provider === provider.name &&
      definition.source === candidate.source &&
      definition.resourceBase?.kind === 'directory' &&
      typeof definition.resourceBase.path === 'string',
    `${candidate.name.padEnd(22)} content=${definition?.content?.length ?? 0} 字符`,
  );
}

console.log('\n4) 文件监视 → 缓存失效');
const watchDir = mkdtempSync(join(tmpdir(), 'rjs-watch-'));
mkdirSync(join(watchDir, 'one'));
writeFileSync(join(watchDir, 'one', 'SKILL.md'), '---\nname: one\ndescription: 监视测试技能一\n---\n正文\n', 'utf8');
const watchCtx = makeCtx();
plugin.apply(watchCtx, { skillsDir: watchDir });
const watchProvider = registration({ signal: new AbortController().signal, invalidate: () => (invalidations += 1) });
const before = (await watchProvider.list({})).length;
mkdirSync(join(watchDir, 'two'));
writeFileSync(join(watchDir, 'two', 'SKILL.md'), '---\nname: two\ndescription: 监视测试技能二\n---\n正文\n', 'utf8');
await new Promise((resolve) => setTimeout(resolve, 800));
const after = (await watchProvider.list({})).length;
check(invalidations > 0, `新建技能目录后 invalidate 被调用（${invalidations} 次）`);
check(before === 1 && after === 2, `list() 随磁盘变化：${before} → ${after}`);

console.log('\n5) 容错');
const brokenDir = mkdtempSync(join(tmpdir(), 'rjs-'));
mkdirSync(join(brokenDir, 'broken'));
writeFileSync(join(brokenDir, 'broken', 'SKILL.md'), '# 没有 frontmatter\n', 'utf8');
mkdirSync(join(brokenDir, 'no-skill-md'));
check(plugin.listSkills(brokenDir).length === 0, '坏文件与缺 SKILL.md 的目录都被安全跳过');
check(plugin.listSkills().length === 8, 'listSkills() 不依赖 ctx 也能列出 8 个技能');

disposeCb?.();
console.log(failures.length === 0 ? '\n全部通过。' : `\n失败 ${failures.length} 项`);
process.exit(failures.length === 0 ? 0 : 1);
