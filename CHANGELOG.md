# Changelog

本文件记录本插件的公开变更。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-10-15

### 新增

- **运行时入口 `lib/index.js`：本仓库从「纯技能目录」升级为真正的 dsh 插件包。**
  - 在 `apply(ctx)` 中通过 `ctx.skills.registerProvider(...)` 注册自实现的技能提供方，扫描包内 `skills/`；用户 `dsh plugin add` 后即生效，不再需要逐技能建联接或改 `customSkillDirs`。
  - 提供方实现注册表要求的 `list()` / `get()`，并给出 `resourceBase`（目录型）供技能内相对路径解析。
  - 自建文件监视：优先整树递归，平台不支持时回退到「技能根目录 + 每个技能目录」深度 1；技能文件增删改触发缓存失效，实现热更新。
  - 零运行时依赖：frontmatter 用内置极简解析器（本插件 SKILL.md 只用到 name / description / whenToUse / metadata）。
- `cordis.patch.yml` 改为 bundle patch（`insert: [{ id: resume-job-search, name: dsh-resume-job-search }]`）；`package.json` 增加 `dsh.bundle.patch` / `main` / `exports`，版本升到 0.2.0。
- 测试：`test/provider.test.mjs`（mock ctx，按注册表校验规则检查候选、正文加载、热更新、容错）与 `test/integration.test.mjs`（用真实 `@deepseek-ai/dsh-skill` + `@deepseek-ai/cordis` 驱动，未安装 DSH 时自动跳过）；CI 增加这两个步骤。
- 许可合规：`THIRD-PARTY-NOTICES.md` 记录上游 `ai-job-search`（MIT，Copyright (c) 2026 Mads Lorentzen）被使用的部分与本仓库的全部改动；`LICENSE` 增加衍生来源声明；README 致谢写入具体作者与许可。

### 变更

- `scripts/validate-skills.mjs` 支持 `SKILLS_DIR` 环境变量指定技能目录，便于测试。
- 安装文档重构为「插件形态 A ~ E」，补充 `dsh plugin add` 的安装、验证与卸载流程。

### 修复

- **`job-search-intel/SKILL.md` 曾带 UTF-8 BOM**，导致 DSH 无法解析其 frontmatter（文件不再以 `---` 开头），该技能被静默跳过；已另存为 UTF-8 无 BOM。
- `scripts/validate-skills.mjs` 与 `scripts/privacy-scan.mjs` 增加 BOM 检测，同类问题在 CI 与本地即时报错，不再静默失败。
- `job-evaluation` 正文里过时的交叉引用 `cv-tailoring/SKILL.md` 更正为 `resume-writing/SKILL.md`（frontmatter 流水线列表此前已修正，正文遗漏）。

### 文档

- 安装说明修正为**逐技能建联接**：把整个 `skills/` 目录链成一层会让 `SKILL.md` 深两层，DSH 只扫描技能根目录第一层，因此技能不会被发现。
- 排错清单补充「深层链接」与「BOM」两个高频坑。

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
