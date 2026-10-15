#!/usr/bin/env node
/**
 * 真机集成测试（需要本机已安装 DSH）：用 DSH 自带的真实 `@deepseek-ai/dsh-skill`
 * 注册表驱动本插件，验证「注册 → 列出 → 加载正文 → 热更新」全链路，
 * 与宿主里发生的过程一致。
 *
 * 找不到 DSH 安装（`@deepseek-ai/dsh-skill` / `@deepseek-ai/cordis`）时自动跳过，
 * 退出码 0，不阻塞 CI。
 *
 * 用法：node test/integration.test.mjs
 * 指定 DSH 安装位置：DSH_MODULES_DIR=<.../node_modules/@deepseek-ai>
 */

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  ...(process.env.DSH_MODULES_DIR ?? '').split(','),
  join(repoRoot, 'node_modules', '@deepseek-ai'),
  'D:/nodejs/npm-global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai',
  join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
  '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai',
  '/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai',
]
  .map((value) => value.trim())
  .filter((value) => value !== '');

const modulesDir = candidates.find(
  (dir) => existsSync(join(dir, 'dsh-skill', 'lib', 'index.js')) && existsSync(join(dir, 'cordis', 'lib', 'index.js')),
);

if (modulesDir === undefined) {
  console.log('跳过集成测试：未找到 DSH 安装（@deepseek-ai/dsh-skill + @deepseek-ai/cordis）。');
  console.log('如已安装，可用 DSH_MODULES_DIR=<.../node_modules/@deepseek-ai> 指定位置。');
  process.exit(0);
}

const { SkillRegistry } = await import(pathToFileURL(join(modulesDir, 'dsh-skill', 'lib', 'index.js')).href);
const { Context } = await import(pathToFileURL(join(modulesDir, 'cordis', 'lib', 'index.js')).href);
const plugin = await import(pathToFileURL(join(repoRoot, 'lib', 'index.js')).href);
const skillApi = await import(pathToFileURL(join(modulesDir, 'dsh-skill', 'lib', 'index.js')).href);

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

/** 建一个真实 cordis 上下文并挂上真实 SkillRegistry（与宿主相同的形态）。 */
function makeCtx() {
  const ctx = new Context();
  new SkillRegistry(ctx);
  if (ctx.skills === undefined) throw new Error('SkillRegistry 未注册为 ctx.skills');
  return ctx;
}

const readCatalog = async (ctx) => (await ctx.skills.list({})).map((skill) => skill.name);

console.log(`使用 DSH 安装：${modulesDir}\n`);
console.log('1) 真实注册表列出技能');
const ctx = makeCtx();
plugin.apply(ctx);
const names = await readCatalog(ctx);
check(names.length === 8, `catalog 含 8 个技能（实际 ${names.length}: ${names.join(',')})`);
check(names.includes('job-evaluation'), '包含 job-evaluation');

console.log('\n2) 真实注册表加载正文');
const definition = await ctx.skills.get('job-evaluation', {});
check(typeof definition?.content === 'string' && definition.content.length > 1000, `get() 返回正文 ${definition?.content?.length ?? 0} 字符`);
check(definition?.provider === 'resume-job-search', `provider = ${definition?.provider}`);
check(definition?.resourceBase?.kind === 'directory', `resourceBase = ${JSON.stringify(definition?.resourceBase)}`);

console.log('\n2b) 与宿主一致的消费方式（曾在这里崩溃：invocation 缺失）');
try {
  const summaries = await ctx.skills.list({});
  const invocable = summaries.filter(skillApi.isModelInvocable);
  check(invocable.length === summaries.length, `isModelInvocable 过滤后仍为 ${invocable.length}/${summaries.length} 个技能`);
  const rendered = skillApi.renderSkillContent({
    name: definition.name,
    provider: definition.provider,
    resourceBase: definition.resourceBase,
    content: definition.content,
  });
  check(rendered.includes('<skill_content') && rendered.includes('job-evaluation'), `renderSkillContent 产出 ${rendered.length} 字符的 <skill_content> 标记`);
} catch (error) {
  check(false, `宿主式消费抛错：${error.message}`);
}

console.log('\n3) 热更新：新增技能目录');
const dir = mkdtempSync(join(tmpdir(), 'rjs-live-'));
mkdirSync(join(dir, 'alpha'));
writeFileSync(join(dir, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: 集成测试技能 alpha\n---\n# alpha\n', 'utf8');
const liveCtx = makeCtx();
plugin.apply(liveCtx, { skillsDir: dir });
const first = await readCatalog(liveCtx);
check(first.length === 1 && first[0] === 'alpha', `初次 catalog = [${first.join(',')}]`);
mkdirSync(join(dir, 'beta'));
writeFileSync(join(dir, 'beta', 'SKILL.md'), '---\nname: beta\ndescription: 集成测试技能 beta\n---\n# beta\n', 'utf8');
await new Promise((resolve) => setTimeout(resolve, 900));
const second = await readCatalog(liveCtx);
check(second.includes('beta'), `新增技能目录后 catalog = [${second.join(',')}]`);

console.log('\n4) 热更新：正文改动后重新读取');
appendFileSync(join(dir, 'alpha', 'SKILL.md'), '\n追加一行：热更新可见\n', 'utf8');
const alpha = await liveCtx.skills.get('alpha', {});
check(alpha?.content?.includes('热更新可见') === true, `重新 get() 拿到新增内容（${alpha?.content?.length ?? 0} 字符）`);

console.log('\n5) 同名竞争：更低 rank 的提供方胜出（插件 rank 300 vs 内置目录 rank 100）');
const competeDir = mkdtempSync(join(tmpdir(), 'rjs-rank-'));
for (const name of ['project-one', 'plugin-two']) {
  mkdirSync(join(competeDir, name));
  writeFileSync(join(competeDir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: rank 竞争测试 ${name}\n---\n# ${name}\n`, 'utf8');
}
const rankCtx = makeCtx();
plugin.apply(rankCtx, { skillsDir: competeDir, quiet: true });
// 再注册一个 rank 更低的提供方，声明同名技能，验证项目级优先
const projectDefinition = {
  name: 'project-one',
  description: '来自 rank 100 的同名技能',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'project-dsh',
  provider: 'project-like',
  content: '# project-one（rank 100）\n',
};
rankCtx.skills.registerProvider(() => ({
  name: 'project-like',
  async list() {
    const { content, ...summary } = projectDefinition;
    return [{ ...summary, rank: 100, locator: { kind: 'memory' } }];
  },
  async get() {
    return { ...projectDefinition };
  },
}));
const summaries = await rankCtx.skills.list({});
const winner = summaries.find((skill) => skill.name === 'project-one');
check(winner?.provider === 'project-like', `同名技能由低 rank 提供方胜出（provider=${winner?.provider}）`);
const winningBody = await rankCtx.skills.get('project-one', {});
check(winningBody?.content?.includes('rank 100') === true, '胜出提供方的正文可加载');
check((await readCatalog(rankCtx)).length === 2, '竞争后技能总数仍为 2（未被重复列出）');

console.log(failures.length === 0 ? '\n全部通过。' : `\n失败 ${failures.length} 项`);
process.exit(failures.length === 0 ? 0 : 1);
