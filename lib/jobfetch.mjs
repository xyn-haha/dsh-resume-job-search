/**
 * 本地岗位检索模块（插件能力，非个人信息）。
 *
 * 设计目标：把「找岗位」从「每次手工点招聘网站」变成 agent 可调用、可复跑、可去重的命令行步骤，
 * 等价于原 Claude Code 版插件里的 portal-search CLI（.agents/skills/&lt;portal&gt;/cli）。
 *
 * 现状与边界（实测结论）：
 *   - BOSS直聘 / 猎聘 / 智联 / 前程无忧：需登录 + 强反爬，命令行无法匿名检索；
 *   - 牛客网：可用。列表页需浏览器渲染取岗位 ID，详情页内嵌 INITIAL_STATE JSON 可直接解析；
 *   - 公司官网招聘页 / 高校就业网 / 聚合站：多为静态页，可用普通 HTTP 抓取（后续按需扩展）。
 *
 * 因此采用「渲染列表 + 解析详情」两段式：列表用 Edge/Chrome 无头渲染，详情用纯 HTTP 快取。
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 招聘类型编码（与牛客网 recruitType 语义一致） */
export const RECRUIT_TYPES = { campus: 1, intern: 2, social: 3 };

/** 平台节流（毫秒）：宁可慢，也不要触发风控 */
const THROTTLE = { detail: 1500 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 找一个可用的 Chromium 内核浏览器（用于需要 JS 渲染的列表页） */
export function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

/** 用浏览器渲染页面并返回 DOM（dump-dom），临时 profile 用完即删 */
export async function renderDom(url, { timeoutMs = 90000, profileDir } = {}) {
  const browser = findBrowser();
  if (browser === undefined) throw new Error('未找到 Edge/Chrome，无法渲染需要 JS 的列表页（可设置 EDGE_PATH）');
  const profile = profileDir ?? join(process.env.TEMP ?? '/tmp', 'jobfetch-profile-' + process.pid);
  mkdirSync(profile, { recursive: true });
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--disable-extensions',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=15000',
    '--dump-dom',
    url,
  ];
  try {
    const { stdout } = await run(browser, args, { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs });
    return stdout;
  } finally {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响结果 */
    }
  }
}

/** 从渲染后的 DOM 里抽出岗位详情 ID（列表页不内嵌结构化数据，只给链接） */
export function extractJobIds(dom) {
  const ids = new Set();
  for (const match of dom.matchAll(/\/jobs\/detail\/(\d{4,})/g)) ids.add(match[1]);
  return [...ids];
}

/** 从页面 HTML 中取出 INITIAL_STATE 的平衡 JSON 主体并解析 */
export function parseInitialState(html) {
  const marker = html.indexOf('__INITIAL_STATE__');
  if (marker < 0) return undefined;
  const start = html.indexOf('{', marker);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

function firstString(...values) {
  for (const value of values) if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 把牛客网 jobDetail.detail 归一化成统一岗位结构 */
export function normalizeNowcoder(detail, fallbackId) {
  const salary =
    typeof detail.salaryMin === 'number' && typeof detail.salaryMax === 'number'
      ? detail.salaryMin + '-' + detail.salaryMax + ' 元/天'
      : undefined;
  const deadline =
    typeof detail.deliverEnd === 'number' && detail.deliverEnd < 4e12
      ? new Date(detail.deliverEnd).toISOString().slice(0, 10)
      : undefined;
  const ext = typeof detail.ext === 'string' ? safeJson(detail.ext) : detail.ext;
  const id = detail.id ?? fallbackId;
  return {
    source: 'nowcoder',
    id: String(id),
    uid: 'nowcoder:' + id,
    title: firstString(detail.jobName),
    company: firstString(detail.recommendInternCompany?.name, detail.companyName, detail.company?.name),
    city: firstString(detail.jobCity, Array.isArray(detail.jobCityList) ? detail.jobCityList.join('/') : undefined),
    address: firstString(detail.jobAddress),
    salary,
    salaryNote: salary ? '平台展示日薪，仅区间参考' : undefined,
    recruitType: detail.recruitTypeName ?? detail.recruitType,
    industry: firstString(detail.industryName),
    graduationYear: firstString(detail.graduationYear),
    duration: detail.durationMonths ? detail.durationMonths + ' 个月' : undefined,
    education: firstString(detail.eduLevelName),
    keywords: Array.isArray(detail.jobKeys) ? detail.jobKeys : undefined,
    requirements: firstString(ext?.requirements),
    description: firstString(ext?.infos, detail.jobDesc),
    deadline,
    url: 'https://www.nowcoder.com/jobs/detail/' + id,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.text();
}

/** 牛客网来源：列表页浏览器渲染取 ID，详情页 HTTP 取内嵌 JSON */
export const nowcoder = {
  name: 'nowcoder',
  label: '牛客网',
  async searchIds({ keyword, city, limit = 20, recruitType = 2, render = renderDom, log = () => {} }) {
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (keyword) params.set('keyword', keyword);
    const url = 'https://www.nowcoder.com/jobs/' + (recruitType === 2 ? 'intern/' : '') + 'center?' + params.toString();
    log('渲染列表页：' + url);
    const dom = await render(url);
    const ids = extractJobIds(dom).slice(0, limit);
    log('列表页解析到 ' + ids.length + ' 个岗位 ID');
    return ids;
  },
  async fetchDetail(id, { fetch = fetchText, context = {}, log = () => {} } = {}) {
    const url = 'https://www.nowcoder.com/jobs/detail/' + id;
    log('抓取详情：' + url);
    const html = await fetch(url);
    const state = parseInitialState(html);
    const detail = state?.store?.jobDetail?.detail;
    if (detail === undefined) return undefined;
    return {
      ...normalizeNowcoder(detail, id),
      searchKeyword: context.keyword,
      searchCity: context.city,
      recruitKind: context.recruitType,
    };
  },
};

/** 去重状态机：与 seen_jobs.json 兼容（键为 uid） */
export function loadState(file) {
  if (!existsSync(file)) return { seen: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed !== null && typeof parsed === 'object' && parsed.seen !== null && typeof parsed.seen === 'object') {
      return parsed;
    }
  } catch {
    /* 损坏则重建 */
  }
  return { seen: {} };
}

export function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** 快速适配速评：高/中/低（只用于排序与预筛，不是完整评估） */
export function quickFit(job, keywords = []) {
  const haystack = [job.title, job.description, job.requirements, ...(job.keywords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const hits = keywords.filter((word) => haystack.includes(word.toLowerCase()));
  if (hits.length >= 3) return { fit: 'high', hits };
  if (hits.length >= 1) return { fit: 'medium', hits };
  return { fit: 'low', hits };
}

/** 端到端检索：列表 → 详情 → 去重 → 速评 → 落盘（只抓未见过的新岗位） */
export async function runSearch({
  keyword = '安全',
  keywords = [],
  cities = [],
  limit = 20,
  recruitType = 2,
  stateFile,
  source = nowcoder,
  fetchDetail,
  log = () => {},
  throttleMs = THROTTLE.detail,
  renderThrottleMs = 1500,
}) {
  const state = loadState(stateFile);
  const fresh = [];
  const errors = [];
  let scanned = 0;
  const seenThisRun = new Set();

  for (const city of cities.length > 0 ? cities : ['']) {
    for (const word of [keyword, ...keywords.filter((k) => k !== keyword)]) {
      let ids;
      try {
        ids = await source.searchIds({ keyword: word, city, limit, recruitType, log });
      } catch (error) {
        errors.push(`列表页失败（${city || '不限城市'} / ${word}）：${error.message}`);
        log(`列表页失败：${error.message}`);
        continue;
      }
      scanned += ids.length;
      for (const id of ids) {
        const uid = source.name + ':' + id;
        if (state.seen[uid] !== undefined || seenThisRun.has(uid)) continue;
        seenThisRun.add(uid);
        let job;
        try {
          job = await source.fetchDetail(id, { fetch: fetchDetail, context: { keyword: word, city, recruitType }, log });
        } catch (error) {
          errors.push(`详情失败 ${id}：${error.message}`);
          log('详情抓取失败 ' + id + '：' + error.message);
          continue;
        }
        if (job === undefined) {
          log('详情解析失败 ' + id + '（页面结构可能变了）');
          continue;
        }
        const fit = quickFit(job, [keyword, ...keywords]);
        state.seen[uid] = {
          title: job.title,
          company: job.company,
          url: job.url,
          city: job.city,
          salary: job.salary,
          first_seen: new Date().toISOString().slice(0, 10),
          fit: fit.fit,
          fit_hits: fit.hits,
          status: 'new',
        };
        fresh.push({ ...job, fit: fit.fit, fitHits: fit.hits });
        if (fresh.length >= limit) break;
        await sleep(throttleMs);
      }
      if (fresh.length >= limit) break;
      await sleep(renderThrottleMs);
    }
    if (fresh.length >= limit) break;
  }

  saveState(stateFile, state);
  return { fresh, scanned, skipped: seenThisRun.size - fresh.length, errors, stateFile };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

/** 命令行入口：node lib/jobfetch.mjs search --keyword 安全 --city 南京 --limit 20 --state <seen_jobs.json> */
export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
    options[key] = value;
  }
  if (command !== 'search') {
    console.log(
      [
        '用法:',
        '  node lib/jobfetch.mjs search --city 南京 --limit 12 [--keywords 安全,渗透,红队] [--state <seen_jobs.json>] [--json]',
        '',
        '说明：',
        '  --city      可多城市用逗号分隔；留空则不限城市',
        '  --keywords  作为独立检索词逐个跑列表页（去重合并）',
        '  --state     去重状态文件，默认 ./job_scraper/seen_jobs.json',
      ].join('\n'),
    );
    return 1;
  }
  const stateFile = options.state ?? join(process.cwd(), 'job_scraper', 'seen_jobs.json');
  const keywords = (options.keywords ?? '安全,渗透测试,安全服务,红队')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  const cities = (options.city ?? '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean);
  const result = await runSearch({
    keyword: keywords[0] ?? '安全',
    keywords,
    cities,
    limit: Number(options.limit ?? 12),
    stateFile,
    log: (message) => console.error('· ' + message),
  });
  if (options.json === 'true') {
    console.log(JSON.stringify(result.fresh, null, 2));
  } else {
    const order = { high: 0, medium: 1, low: 2 };
    const rows = [...result.fresh].sort((a, b) => order[a.fit] - order[b.fit]);
    console.log(
      '\n扫描 ' + result.scanned + ' 条列表命中，去重跳过 ' + result.skipped + '，新增 ' + rows.length + ' 个岗位\n',
    );
    console.log('| # | 匹配 | 岗位 | 公司 | 城市 | 薪资 | 时长 | 毕业要求 | 链接 |');
    console.log('|---|------|------|------|------|------|------|----------|------|');
    rows.forEach((job, index) => {
      console.log(
        '| ' +
          [index + 1, job.fit, job.title ?? '', job.company ?? '', job.city ?? '', job.salary ?? '', job.duration ?? '', job.graduationYear ?? '', job.url].join(
            ' | ',
          ) +
          ' |',
      );
    });
    if (result.errors.length > 0) {
      console.log('\n抓取异常 ' + result.errors.length + ' 条：');
      for (const message of result.errors.slice(0, 5)) console.log('  - ' + message);
    }
  }
  return 0;
}

if (isDirectRun()) {
  main().then((code) => process.exit(code));
}
