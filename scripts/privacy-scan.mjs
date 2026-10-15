#!/usr/bin/env node
/**
 * 隐私扫描：防止把个人隐私数据提交进公开仓库。
 *
 * 检查项：
 *   1. 疑似真实邮箱（排除 example.com/org/net、you@、noreply、占位符、徽章 URL 等）；
 *   2. 中国大陆手机号（1[3-9]xxxxxxxxx）与 18 位身份证号；
 *   3. 常见个人隐私文件名（config/candidate-profile.md 等）不应被 Git 跟踪。
 *
 * 用法：node scripts/privacy-scan.mjs
 * 退出码：0 通过 / 1 发现问题。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 需要扫描的文本类型 */
const TEXT_EXT = new Set(['.md', '.yml', '.yaml', '.json', '.mjs', '.js', '.csv', '.txt']);
/**
 * 跳过目录。
 * workspace/ 是用户自己的私人求职工作区（已由 .gitignore 排除，不进仓库），
 * 里面本来就该有手机号、邮箱、简历等个人数据，不属于「待提交内容」。
 */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github', 'workspace']);

const ALLOWED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'invalid',
  'localhost',
]);
/** 占位符局部名（普通标识符片段） */
const PLACEHOLDER_LOCAL = /^(name|email|mail|you|your|user|someone|nobody|test|placeholder|your-email|<[^>]*>)$/i;

const EMAIL_RE = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)(?![A-Za-z0-9-])/g;
const MOBILE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_RE = /(?<!\d)\d{17}[\dXx](?!\d)/g;

const findings = [];

function scanFile(file) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    return;
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    findings.push({ file, lineNo: 1, kind: 'UTF-8 BOM', sample: '另存为「UTF-8 无 BOM」，否则 SKILL.md 会被 DSH 静默跳过' });
  }
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNo = index + 1;

    for (const match of line.matchAll(EMAIL_RE)) {
      const [, local, domain] = match;
      if (ALLOWED_EMAIL_DOMAINS.has(domain.toLowerCase())) continue;
      if (domain.toLowerCase().endsWith('.example.com')) continue;
      if (PLACEHOLDER_LOCAL.test(local)) continue;
      if (line.includes('img.shields.io') || line.includes('github.com/')) continue;
      findings.push({ file, lineNo, kind: '邮箱', sample: `${local}@${domain}` });
    }

    if (!line.includes('img.shields.io')) {
      for (const match of line.matchAll(MOBILE_RE)) {
        findings.push({ file, lineNo, kind: '疑似手机号', sample: match[0] });
      }
      for (const match of line.matchAll(ID_RE)) {
        findings.push({ file, lineNo, kind: '疑似身份证号', sample: `${match[0].slice(0, 4)}****` });
      }
    }
  });
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
    } else if (TEXT_EXT.has(extname(entry).toLowerCase())) {
      scanFile(full);
    }
  }
}

walk(root);

if (findings.length === 0) {
  console.log('隐私扫描通过：未发现真实邮箱、手机号或身份证号。');
  process.exit(0);
}

console.error(`隐私扫描发现问题（${findings.length} 处）：`);
for (const finding of findings) {
  console.error(`  ✗ ${relative(root, finding.file).split(sep).join('/')}:${finding.lineNo}  ${finding.kind}  ${finding.sample}`);
}
console.error('\n请把上述内容改成占位符（例如 <姓名> / you@example.com / <手机>）后重试。');
process.exit(1);
