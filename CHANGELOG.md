# Changelog

本文件记录本插件的公开变更。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 修复

- **`job-search-intel/SKILL.md` 曾带 UTF-8 BOM**，导致 DSH 无法解析其 frontmatter（文件不再以 `---` 开头），该技能被静默跳过；已另存为 UTF-8 无 BOM。
- `scripts/validate-skills.mjs` 与 `scripts/privacy-scan.mjs` 增加 BOM 检测，同类问题在 CI 与本地即时报错，不再静默失败。
- `job-evaluation` 正文里过时的交叉引用 `cv-tailoring/SKILL.md` 更正为 `resume-writing/SKILL.md`（frontmatter 流水线列表此前已修正，正文遗漏）。

### 文档

- 安装说明修正为**逐技能建联接**：把整个 `skills/` 目录链成一层会让 `SKILL.md` 深两层，DSH 只扫描技能根目录第一层，因此技能不会被发现。三种方式（工作区逐技能联接 / 用户级逐技能联接 / `customSkillDirs` 直指技能根）均已给出可直接执行的脚本，并在排错清单中补充该现象与 BOM 现象。

## [0.1.0] - 2026-10-15

### 新增

- 首个公开版本：8 个 DSH 技能（`SKILL.md` + frontmatter 契约，无运行时代码）
  - `resume-job-analysis`：端到端主工作流（解析 JD → 核实公司 → 评分 → 门控确认 → 改写简历 → 求职信 → 面试准备 → 台账）
  - `candidate-profile`：个人事实底本模板（唯一事实来源，含填写纪律与变更记录）
  - `job-evaluation`：五维加权评分（技能 30% / 经验 25% / 行为 15% / 地点通过或不通过 / 职业对齐 30%）与阈值判定
  - `resume-writing`：简历改写、篇幅预算、LaTeX 与 Markdown 双路线、导出后逐页校验、ATS 文本层校验
  - `cover-letter`：结构、语气与六条禁用表达，公司相关主张必须独立核实
  - `interview-prep`：轮次地图、STAR 时长纪律、项目深挖、难题应对、反问清单、模拟面试流程
  - `behavioral-profile`：行为画像维度与「画像→语气→岗位适配」映射
  - `job-search-intel`：中国求职渠道检索式、`seen_jobs.json` 去重状态机、批量排序、投递台账、技能差距计划
- `templates/`：工作区样板（`cv/`、`cover_letters/`、`job_scraper/seen_jobs.json`、使用顺序与命名约定）
- `scripts/validate-skills.mjs`：技能契约校验（本地 `npm test` 与 CI 复用）
- `cordis.patch.yml`：以 dsh 插件方式绑定技能目录（`customSkillDirs`）
- `.github/workflows/validate.yml`：CI 校验技能契约并扫描邮箱 / 手机号 / 身份证号等隐私模式
- 文档：`README.md`、`README.en.md`、`INSTALL.md`、`CONTRIBUTING.md`

### 隐私

- 所有技能与模板均为占位符形式（`<姓名>`、`<学校>`、`<项目名>`、`<证书名>`），不含任何真实个人数据。
- `.gitignore` 默认排除 `config/`、`cv/`、`cover_letters/`、`job_scraper/`、`gap-plans/`、`job_search_tracker.csv` 等工作区产出。

### 已知限制

- 本插件只提供方法与流程，不代替你向招聘平台投递，也不抓取需要登录的受限数据。
- 岗位渠道检索式以中国主流平台为主；其他地区用户需要按 `job-search-intel` 的占位规则替换渠道与地域词。
