# 安装与接入 DSH

本插件是 **skills-only**（纯 Markdown 技能，没有运行时代码）。DSH 的本地技能由 `@deepseek-ai/dsh-skill-filesystem` 提供方发现，**扫描优先级**如下（rank 越小越优先）：

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | `project-dsh` | `<项目根>/.dsh/skills` |
| 200 | `project-agents` | `<项目根>/.agents/skills` |
| 300 | `custom` | 配置项 `customSkillDirs` |
| 400 | `user-dsh` | `<DSH_HOME>/skills`（默认 `~/.dsh/skills`） |
| 500 | `user-agents` | `<agentsHome>/skills` |

**发现规则**：只识别**一层**目录，即 `<根>/<技能名>/SKILL.md`，或平铺的 `<根>/<技能名>.md`；不支持嵌套的 `**/SKILL.md`。frontmatter 必须含 kebab-case 的 `name` 与非空 `description`（可选 `whenToUse`、`metadata`），否则该技能会被**静默跳过**。新增/改名/删除会被文件监视器捕获，无需重启；正文编辑在下次加载时生效。

---

## 方式 A：接入某个工作区（推荐）

把本插件的 `skills/` 映射到工作区技能目录：

```powershell
# Windows：目录联接，无需管理员权限
New-Item -ItemType Directory -Force -Path 'D:\你的工作区\.dsh\skills' | Out-Null
New-Item -ItemType Junction -Path 'D:\你的工作区\.dsh\skills\resume-job-search' `
         -Target 'D:\dsh-plugins\dsh-resume-job-search\skills'
```

```bash
# macOS / Linux：符号链接
mkdir -p ~/your-workspace/.dsh/skills
ln -s ~/dsh-plugins/dsh-resume-job-search/skills ~/your-workspace/.dsh/skills/resume-job-search
```

注意：`<项目根>` 定义为包含 `.git` 的最近祖先目录，否则回退到启动 DSH 时的工作目录。因此**在一个 Git 仓库里**启动 DSH 时，`.dsh/skills` 要放在该 Git 仓库根目录，而不是子目录。

## 方式 B：用户级技能目录（对所有工作区生效）

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.dsh\skills" | Out-Null
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\skills\resume-job-search" `
         -Target 'D:\dsh-plugins\dsh-resume-job-search\skills'
```

这样任何工作区启动的 DSH 都能调用这 8 个技能。适合你希望「到处都能用」的场景。

## 方式 C：以 dsh 插件方式绑定（`customSkillDirs`）

> 方式 A / B 不需要碰配置文件，优先用它们。方式 C 适合你想把技能目录与工作区解耦、或用 `dsh plugin` 管理插件依赖的场景。**本方式依赖 DSH 的 loader patch 结构**：`id` 与 `name` 字段的取值以你这台机器上生成的 profile 配置为准（`dsh --dump-config` 可查看合成后的配置树），若热加载未生效，请回退方式 A。

仓库自带 `cordis.patch.yml`，作用是把插件的 `skills/` 目录注册进技能提供方的 `customSkillDirs`（rank 300）。

1. 打开克隆目录里的 `cordis.patch.yml`，把 `<PLUGIN_DIR>` 换成你的克隆绝对路径：

   ```yaml
   - id: skill-filesystem
     name: '@deepseek-ai/dsh-skill-filesystem'
     config:
       customSkillDirs:
         - 'D:\dsh-plugins\dsh-resume-job-search\skills'
   ```

2. 二选一：
   - **复制该条目**到你自己的 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`（本机默认 `C:\Users\<你>\.dsh\profiles\web\cordis.patch.yml`）的顶层数组里；`customSkillDirs` 支持多个目录，可以并列写多项；
   - 或按 dsh 插件方式安装本仓库（`dsh plugin --profile <profile> add <包名或本地路径>`），由 profile 的 bundle patch 机制加载。

3. 保存后 `patchReload: live` 会热加载；若技能未出现，重启 DSH web 服务一次。

> `cordis.yml` 是启动生成的空入口列表，会被覆盖，**不要改它**；只改 `cordis.patch.yml`。

## 方式 D：复制而不是链接

只想临时试用时，直接把 `skills/` 下的子目录复制到 `~/.dsh/skills/` 或工作区 `.dsh/skills/` 即可，代价是后续更新需要重新复制。

---

## 验证安装

1. 新开一个 DSH 会话（Web GUI 请刷新后新开会话）。
2. 问一句「我现在有哪些求职相关的技能」，技能目录里应出现下面 8 个名字：

   `resume-job-analysis`、`candidate-profile`、`job-search-intel`、`job-evaluation`、`resume-writing`、`cover-letter`、`interview-prep`、`behavioral-profile`

3. 给一段 JD 说「评估这个岗位」，确认 DSH 实际加载 `job-evaluation` 技能（输出五维评分表与阈值判定），而不是自由发挥。
4. 本地也可以直接跑契约校验：

   ```bash
   node scripts/validate-skills.mjs
   ```

## 排错清单

| 现象 | 原因与处理 |
|---|---|
| 技能一个都没出现 | 检查是否把 `SKILL.md` 放深了一层（必须 `<根>/<技能名>/SKILL.md`） |
| 只缺少某一个技能 | 该文件的 frontmatter `name` 不是 kebab-case、`description` 为空，或写了 DSH 不认识的 `allowed-tools`；DSH 会静默跳过，用 `scripts/validate-skills.mjs` 定位 |
| 改了文件但不生效 | 正文编辑下次加载生效；frontmatter/新增文件由监视器捕获，必要时新开会话 |
| 在 Git 仓库里不生效 | `<项目根>` 取最近 `.git` 祖先目录，把 `.dsh/skills` 放到仓库根 |
| 方式 C 不生效 | 确认改的是 `cordis.patch.yml` 且 `<PLUGIN_DIR>` 已替换为真实路径；重启 DSH |
| 想同时用多份技能包 | `customSkillDirs` 是数组，多个插件目录并列即可；同名技能按 rank 与来源优先级合并 |

## 卸载

删除对应的目录联接（`<工作区>/.dsh/skills/resume-job-search` 或 `~/.dsh/skills/resume-job-search`），并在使用方式 C 时移除 `customSkillDirs` 条目。卸载不会影响你工作区里已生成的简历、求职信与台账文件。

## 与 Claude Code 并存

如果你原来用 Claude Code 的 `.claude/skills/` 工作流，两者互不冲突：Claude Code 读 `.claude/`，DSH 读 `.dsh/` 或 `customSkillDirs`。注意不要把两边指向同一份含个人隐私的资料文件，本插件默认用占位符模板，你的真实资料只应留在自己的工作区。
