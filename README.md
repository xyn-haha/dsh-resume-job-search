# 简历编写与求职分析 · DSH 插件

> 一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）的**求职技能包**：把你的简历、投递与面试准备交给 agent，用一套明确的流程和纪律完成，而不是每次从零开始对话。
>
> English: [README.en.md](README.en.md)

[![validate](https://github.com/xyn-haha/dsh-resume-job-search/actions/workflows/validate.yml/badge.svg)](https://github.com/xyn-haha/dsh-resume-job-search/actions/workflows/validate.yml)
![skills](https://img.shields.io/badge/skills-8-blue)
![license](https://img.shields.io/badge/license-MIT-green)

---

## 它解决什么问题

求职真正的痛点不是「写不出简历」，而是：

- **每次都要重讲一遍自己**：agent 不知道你的真实经历，容易编造或写得空泛。
- **匹配度靠感觉**：看到一个 JD 不知道该不该投、差距在哪。
- **投递无台账**：投了 30 家，谁面试到哪一轮、用的哪版简历，全靠脑子记。
- **明明能过简历筛，却因为 PDF 跨页、关键词缺失被机器刷掉**。

本插件用 8 个技能把这些环节固定成流程：**事实底本 → 岗位情报 → 匹配度评分 → 简历/求职信 → 面试准备 → 投递台账**。

## 技能一览

| 技能 | 作用 | 典型触发语 |
|---|---|---|
| `resume-job-analysis` | 主入口，端到端编排整条链路 | 「投这个岗位」「求职分析」 |
| `candidate-profile` | 个人事实底本，唯一事实来源 | 「更新我的资料」 |
| `job-search-intel` | 渠道检索、去重、批量排序、台账、技能差距计划 | 「找新岗位」「批量排序」 |
| `job-evaluation` | 五维加权评分与结论（含红旗） | 「评估这个 JD」 |
| `resume-writing` | 简历改写、篇幅控制、导出与 ATS 校验 | 「针对这家公司改简历」 |
| `cover-letter` | 求职信结构、语气与禁用表达 | 「写求职信」 |
| `interview-prep` | 轮次地图、STAR 骨架、反问清单、模拟面试 | 「面试准备」 |
| `behavioral-profile` | 行为画像 → 写作语气与岗位适配 | 「帮我判断这个岗位合不合性格」 |

## 三条核心纪律

1. **不编造**：所有写入简历与求职信的内容，必须能在 `candidate-profile` 找到对应事实与可证明材料；不支持的要求保留差距可见，禁止堆砌关键词。
2. **先评估后写作**：拿到 JD 先出匹配度评分与结论，**等你确认**才生成材料；不确认不写。
3. **产出必校验**：简历与求职信导出后逐页目视检查（跨页断行、标题孤行、超页、字号），有 `pdftotext` 时额外校验 ATS 文本层与联系方式是否可解析。

## 安装（四种方式）

**方式 A：装成 dsh 插件（推荐，最省事）**

本仓库现在是**真正的 dsh 插件包**：入口 `lib/index.js` 实现技能提供方，安装后由 profile 的 bundle 机制自动加载，**不需要建联接、不需要改配置**。

```bash
# 从 npm 安装（发布后）
dsh plugin --profile web add dsh-resume-job-search

# 从本地目录或 tarball 安装（开发 / 未发布时）
dsh plugin --profile web add file:/绝对路径/dsh-resume-job-search
dsh plugin --profile web add file:/绝对路径/dsh-resume-job-search-0.2.0.tgz
```

装完重启 DSH 或新开会话即生效，8 个技能对所有工作区可用。

**方式 B：接入某个工作区（不装插件时）**

DSH 只扫描技能根目录的第一层，所以要**为每个技能建一个联接**（脚本会自动处理）：

```powershell
git clone https://github.com/xyn-haha/dsh-resume-job-search.git D:\dsh-plugins\dsh-resume-job-search
$plugin = 'D:\dsh-plugins\dsh-resume-job-search'; $root = 'D:\你的工作区\.dsh\skills'
New-Item -ItemType Directory -Force -Path $root | Out-Null
Get-ChildItem -Directory "$plugin\skills" | ForEach-Object {
  New-Item -ItemType Junction -Path (Join-Path $root $_.Name) -Target $_.FullName | Out-Null
}
```

**方式 C：接入用户级技能目录（全工作区可用，无需装插件）**

```bash
git clone https://github.com/xyn-haha/dsh-resume-job-search.git ~/dsh-plugins/dsh-resume-job-search
mkdir -p ~/.dsh/skills
for d in ~/dsh-plugins/dsh-resume-job-search/skills/*/; do ln -sfn "$d" ~/.dsh/skills/"$(basename "$d")"; done
```

**方式 D：`customSkillDirs` 精确挂载（技能目录与工作区解耦）**

把仓库里 `cordis.patch.yml` 的 `<PLUGIN_DIR>` 换成你的克隆路径，再把该条目复制到 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`。

> 详细步骤、验证方法与排错清单见 [INSTALL.md](INSTALL.md)。

安装后在 DSH 会话里说一句「我有哪些求职技能」或直接给一个 JD，技能目录会被自动发现（新增/改名无需重启，正文编辑下次加载生效）。

## 快速上手

1. 打开 `skills/candidate-profile/SKILL.md`，按模板填你的真实资料（或先跑模板目录：`templates/`）。
2. 对 DSH 说：**「评估这个岗位：<粘贴 JD 或链接>」**。
3. 看完评分与红旗，确认是否投递。
4. 确认后：**「给这家公司改简历，写一封求职信」** → 产出写入你的工作区 `cv/`、`cover_letters/`。
5. **「帮我准备面试」** → 轮次预判、STAR 骨架、反问清单。
6. 投递后：**「更新台账」** → 记录状态与下一步跟进时间。

## 隐私设计

- 本仓库**不含任何个人数据**：技能里的姓名、学校、项目、竞赛一律是 `<姓名>` `<项目名>` 这类占位符。
- 你的真实资料留在**自己的工作区**（`config/`、`cv/`、`cover_letters/`），仓库自带的 `.gitignore` 默认排除这些目录，避免误提交。
- CI 会扫描技能与文档中的邮箱、手机号、身份证号模式，防止隐私回填到公开仓库。

## 目录结构

```
dsh-resume-job-search/
├─ lib/                         运行时入口（dsh 插件形态）
│  ├─ index.js                  实现技能提供方：ctx.skills.registerProvider
│  └─ README.md                 提供方契约、可选配置与已知限制
├─ skills/                      DSH 技能（每个目录一个 SKILL.md）
│  ├─ resume-job-analysis/      入口工作流
│  ├─ candidate-profile/        事实底本模板
│  ├─ job-evaluation/           匹配度评分
│  ├─ resume-writing/           简历写作
│  ├─ cover-letter/             求职信
│  ├─ interview-prep/           面试准备
│  ├─ behavioral-profile/       行为画像
│  └─ job-search-intel/         岗位情报 + 投递台账 CSV
├─ templates/                   工作区样板（复制到你的求职工作区）
├─ docs/                        English 安装指引 + 资料库填写示例
├─ scripts/
│  ├─ validate-skills.mjs       技能契约校验（支持 SKILLS_DIR 覆盖）
│  └─ privacy-scan.mjs          隐私扫描（真实邮箱/手机号/身份证号/BOM）
├─ test/
│  ├─ provider.test.mjs         提供方契约测试（mock ctx）
│  └─ integration.test.mjs      真实 SkillRegistry 集成测试（无 DSH 时跳过）
├─ cordis.patch.yml             bundle patch：把本插件插入 profile 插件栈
├─ package.json                 插件清单（dsh.bundle.patch / main / files）
├─ THIRD-PARTY-NOTICES.md       上游内容与许可声明
├─ INSTALL.md / README.md       中文文档
└─ .github/workflows/           CI：契约校验 + 提供方测试 + 隐私扫描 + 集成测试
```

## 发布到 GitHub 前的检查清单

仓库信息已按 `xyn-haha/dsh-resume-job-search` 填好（`package.json` 的 repository/homepage/bugs、README 与 INSTALL 的克隆地址、CI 徽章、LICENSE 版权行）。剩余要做的是：

1. 在 GitHub 建**公开仓库**，名字建议就用 `dsh-resume-job-search`（与 `package.json` 里的地址一致；若用别的名字，记得同步改 `package.json`、README、README.en.md、`docs/INSTALL.en.md`、`INSTALL.md` 里的地址）。
2. 本地跑一次全套检查：`npm test`；装了 DSH 的机器再跑 `npm run test:integration`。
3. 确认 `git status` 里没有 `config/`、`cv/`、`cover_letters/`、`job_scraper/`、`gap-plans/`、`job_search_tracker.csv` 等个人数据（`.gitignore` 已默认排除，仅保留模板）。
4. 推送后确认 GitHub Actions 的 `validate-skills` 工作流为绿（技能契约 + 提供方测试 + 隐私扫描 + 集成测试）。徽章图片要等仓库真正存在、工作流跑过一次之后才会显示。
5. 打标签发布：`git tag v0.2.1 && git push --tags`，并在 Release 里粘贴 `CHANGELOG.md` 的对应段落。
6. 若还要发到 npm：`npm publish`（`publishConfig.access = public` 已就绪），用户的安装方式即为 `dsh plugin --profile web add dsh-resume-job-search`。

## 参与贡献

欢迎提交新的岗位渠道检索式、写作规则、面试题库或英文/其他语种版本。改动技能后请先跑：

```bash
node scripts/validate-skills.mjs
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 来源与致谢

结构参考并改写自一个 Claude Code 风格的求职工作区（LaTeX CV/求职信模板 + 评估框架 + 面试准备），改写为 DSH 技能契约（`SKILL.md` + frontmatter，无斜杠命令）、中国求职渠道与中文优先的 Markdown 产出路线。

## 许可

[MIT](LICENSE)
