#!/usr/bin/env node
/**
 * 校验 skills/ 下每个技能的 SKILL.md 是否符合 DSH 技能契约。
 * 用途：CI（GitHub Actions）与本地 `npm test`。
 *
 * 校验项：
 *   1. 存在 <skills>/<name>/SKILL.md；
 *   2. frontmatter 以 --- 开头并以 --- 闭合；
 *   3. frontmatter 含非空 name 与 description；
 *   4. name 为 kebab-case，且与目录名一致；
 *   5. 不含 DSH 不认识的 allowed-tools 字段；
 *   6. name 在全部技能中唯一。
 *
 * 无第三方依赖，直接 `node scripts/validate-skills.mjs`。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(root, 'skills');
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];
const seen = new Map();
const results = [];

function fail(skill, message) {
  errors.push(`${skill}: ${message}`);
}

function readFrontmatter(skill, file) {
  const buffer = readFileSync(file);
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    // UTF-8 BOM 会让 DSH 的 frontmatter 解析失败（文件不再以 --- 开头），技能被静默跳过
    fail(skill, '文件带 UTF-8 BOM；请另存为「UTF-8 无 BOM」，否则 DSH 无法解析 frontmatter');
  }
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    fail(skill, 'frontmatter 缺失：首行必须是 ---');
    return null;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) {
    fail(skill, 'frontmatter 未闭合：缺少第二个 ---');
    return null;
  }
  const block = lines.slice(1, end).join('\n');
  if (/^\s*allowed-tools\s*:/m.test(block)) {
    fail(skill, '含 DSH 不支持的 allowed-tools 字段');
  }
  if (!/^name:\s*\S/m.test(block)) fail(skill, 'frontmatter 缺少 name');
  if (!/^description:\s*\S/m.test(block) && !/^description:\s*[>|]/m.test(block)) {
    fail(skill, 'frontmatter 缺少 description');
  }
  const name = /^name:\s*(.+)$/m.exec(block)?.[1]?.trim();
  const description = /^description:\s*([\s\S]+?)(?=^[a-zA-Z-]+:\s|\Z)/m.exec(`${block}\n`)?.[1]?.trim();
  if (name && seen.has(name)) fail(skill, `name 与 ${seen.get(name)} 重复：${name}`);
  if (name) seen.set(name, skill);
  return { name, description, bodyLines: lines.length - end - 1 };
}

let entries = [];
try {
  entries = readdirSync(skillsDir).filter((entry) => statSync(join(skillsDir, entry)).isDirectory());
} catch (error) {
  console.error(`无法读取技能目录 ${skillsDir}: ${error.message}`);
  process.exit(1);
}

if (entries.length === 0) {
  console.error(`技能目录为空：${skillsDir}`);
  process.exit(1);
}

for (const entry of entries.sort()) {
  const file = join(skillsDir, entry, 'SKILL.md');
  try {
    statSync(file);
  } catch {
    fail(entry, '缺少 SKILL.md（技能必须是 <skills>/<name>/SKILL.md 的单层结构）');
    continue;
  }
  const fm = readFrontmatter(entry, file);
  if (!fm) continue;
  if (fm.name && !KEBAB.test(fm.name)) fail(entry, `name 不是 kebab-case：${fm.name}`);
  if (fm.name && fm.name !== entry) {
    warnings.push(`${entry}: 目录名与 name 不一致（name=${fm.name}），DSH 以 name 为准，建议保持一致`);
  }
  results.push({ dir: entry, name: fm.name, descLength: fm.description?.length ?? 0, bodyLines: fm.bodyLines });
}

console.log(`技能目录：${skillsDir}`);
console.log(`发现技能：${entries.length}\n`);
for (const row of results) {
  console.log(
    `  ✓ ${row.dir.padEnd(22)} name=${String(row.name).padEnd(22)} description=${row.descLength} 字符  正文 ${row.bodyLines} 行`,
  );
}

if (warnings.length > 0) {
  console.log('\n警告：');
  for (const warning of warnings) console.log(`  ! ${warning}`);
}

if (errors.length > 0) {
  console.error('\n校验失败：');
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}

console.log(`\n校验通过：${results.length} 个技能均符合 DSH 技能契约。`);
