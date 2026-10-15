# 本地岗位检索（jobfetch）

把「找岗位」变成 agent 可调用、可复跑、可去重的一步，等价于原 Claude Code 版插件里的 portal-search CLI。

```bash
node lib/jobfetch.mjs search --city 南京 --limit 12 --keywords 安全,渗透测试,安全服务,网络安全 \
  --state ./workspace/job_scraper/seen_jobs.json
```

- `--city`：多个城市用逗号分隔，留空不限城市
- `--keywords`：逐个作为检索词跑列表页，结果合并去重
- `--state`：去重状态文件（与 `job-search-intel` 技能的 `seen_jobs.json` 同结构）
- `--json`：输出机器可读 JSON（供 agent 直接消费）

## 实测能力矩阵（2026-10 实测，非推测）

| 渠道 | 列表能否匿名取 | 详情能否匿名取 | 结论 |
|---|---|---|---|
| **牛客网 nowcoder.com** | ✅ 浏览器渲染可取岗位 ID | ✅ 详情页内嵌 `__INITIAL_STATE__`，字段完整 | **主渠道，已实现** |
| BOSS直聘 | ❌ 强制登录 | ❌ | 命令行走不通，需人工浏览 |
| 猎聘 / 智联 / 前程无忧 | ❌ 强制登录或强反爬 | ❌ | 同上 |
| 实习僧 shixiseng.com | ⚠️ 首屏 SSR 不携带列表，需登录才加载 | ❌ | 同上 |
| 高校就业网 / 公司官网招聘页 | ✅ 多为静态页 | ✅ | 待扩展（需先知道 URL） |

### 已实现：牛客网（nowcoder）

「渲染列表 + 解析详情」两段式：

1. **列表**：`https://www.nowcoder.com/jobs/intern/center?city=…` 由 Edge/Chrome 无头渲染（`--dump-dom`），从 DOM 抽 `/jobs/detail/<id>`；
2. **详情**：直接 HTTP 取页面，解析内嵌 `__INITIAL_STATE__.store.jobDetail.detail`，得到岗位名、城市、薪资、时长、毕业年份、投递截止、岗位关键词与要求正文。

### 已知限制（务必知道）

- **该列表接口目前不按关键词过滤**：实测带 `keyword=` 与不带返回同一批 ID，因此结果里可能出现 Java、测试、产品等无关岗位；筛选要在结果层做（`quickFit` 只做粗筛）。
- **列表页不带公司名**：详情页数据里也有缺失（实测 `companyName` 字段为空），公司名需另行确认（点开详情页或在平台内查看企业主页）。
- **没有开放检索 API**：`gw-c.nowcoder.com/api/sparta/*` 的候选路径均返回 404，只能走渲染。
- 抓取节流：详情之间 1.5 秒、关键词之间 1.5 秒，单次结果上限受 `--limit` 约束；**不做高频/批量请求**，遇风控即停止。

## 模块结构

| 导出 | 用途 |
|---|---|
| `runSearch(options)` | 端到端检索：列表 → 详情 → 去重 → 速评 → 落盘 |
| `nowcoder.searchIds / fetchDetail` | 渠道实现（可仿此新增渠道） |
| `renderDom(url)` | 通用浏览器渲染（给需要 JS 的页面用） |
| `parseInitialState(html)` | 解析页面内嵌 JSON（牛客网等同类站点复用） |
| `quickFit(job, keywords)` | 粗粒度匹配速评（high/medium/low），不是完整评估 |
| `loadState / saveState` | 去重状态机（`seen_jobs.json`） |

新增渠道只需实现 `{ name, label, searchIds(), fetchDetail() }`，其余流程复用。

## 测试

```bash
# 走 CLI（推荐，与 agent 调用一致）
node <repo>/lib/jobfetch.mjs search --city 南京 --limit 3 --state <临时状态文件>

# 走模块（便于断点调试字段）
node -e "const m=await import('./lib/jobfetch.mjs'); console.log(m.findBrowser())"
```

首次运行会启动一次无头浏览器（约 10–20 秒），之后每个详情约 0.5–1 秒。
