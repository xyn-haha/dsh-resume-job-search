# 安装与接入 DSH

本仓库提供**两种接入形态**，按需选一种：

| 形态 | 说明 | 适合 |
|---|---|---|
| **A. dsh 插件包** | 包内有运行时入口 `lib/index.js`，实现技能提供方，安装后由 profile 的 bundle 机制加载 | 想一条命令装好、不想碰配置文件 |
| **B/C/D. 纯技能目录** | 只用包内 `skills/` 目录，交给 DSH 自带的文件系统提供方发现 | 不想装插件、想手工控制技能来自哪个目录 |

两种形态的技能内容完全相同（同一份 `skills/`），只是「谁来把它们喂给注册表」不同。

---

## 形态 A：装成 dsh 插件（推荐）

```bash
# 从 npm 安装（发布后）
dsh plugin --profile web add dsh-resume-job-search

# 从本地目录安装（开发 / 未发布时；相对路径会按你的当前目录解析）
dsh plugin --profile web add file:D:/path/to/dsh-resume-job-search

# 从打包好的 tarball 安装
dsh plugin --profile web add file:D:/path/to/dsh-resume-job-search-0.2.0.tgz
```

命令背后发生的事：`dsh plugin` 把包转发给 profile 目录里的 pnpm 安装，然后**按已安装状态**核对层列表——只要依赖解析出的包声明了 `dsh.bundle.patch`，它就会被追加进 `dsh.profile.bundles`（本次实测输出里能看到 `dsh-resume-job-search` 出现在 bundles 数组里）。随后 profile 合成插件树时会加载本包的 `cordis.patch.yml`：

```yaml
- insert:
    - id: resume-job-search
      name: dsh-resume-job-search
```

入口模块 `lib/index.js` 在 `apply(ctx)` 里调用 `ctx.skills.registerProvider(...)` 注册提供方，扫描包内 `skills/` 目录。**用户不需要建联接、不需要改 `cordis.patch.yml`、不需要重启后手工操作**（重启或新开会话即生效）。

验证安装（实测有效）：

```bash
dsh --profile web --dump-config | findstr /C:"resume-job-search"   # Windows
dsh --profile web --dump-config | grep resume-job-search            # macOS / Linux
```

应看到 `- id: resume-job-search` / `name: dsh-resume-job-search` 条目。卸载：`dsh plugin --profile web remove dsh-resume-job-search`。

> 侧载（未发布）时 package.json 的 `repository/homepage` 仍是占位地址，pnpm 不校验这些字段；功能不受影响。

### 改了插件源码之后必须刷新安装

用 `file:` 本地路径安装时，pnpm 是把包**硬链接复制**进 profile 的 `node_modules`，不是实时指向你的工作目录。所以**改完 `lib/index.js` 或 `skills/` 之后，运行中的副本还是旧的**，需要刷新一次：

```bash
# 方式一：重新 add 一次
dsh plugin --profile web add file:D:/项目/简历编写与求职分析插件

# 方式二：在 profile 目录里跑 pnpm
cd ~/.dsh/profiles/web && pnpm install
```

自检：`grep -c DEFAULT_INVOCATION ~/.dsh/profiles/web/node_modules/dsh-resume-job-search/lib/index.js`（或直接在编辑器里看该文件是否为你最新的版本）。发布到 npm 之后不存在这个问题——`dsh plugin update` 会拉新版本。

### 与工作区技能的共存关系

如果你同时用形态 B/C 把技能接进了某个工作区，那么同名技能会出现在两处：

| 来源 | rank | 谁胜出 |
|---|---|---|
| 工作区 `.dsh/skills` / `.agents/skills` | 100 / 200 | ✅ 项目级优先 |
| 本插件提供方 | 300 | 项目级存在时被覆盖 |
| 用户级 `~/.dsh/skills` | 400 | 插件优先 |

这是注册表的按 rank 去重行为（有集成测试覆盖），**不是重复加载**，也不会有内容串味。如果你只想用插件这一套，把工作区的 `.dsh/skills` 联接删掉即可，避免以后自己搞不清技能来自哪。

### 撤掉工作区联接后如何确认「插件真的在供货」

工作区联接删掉后，工作区技能目录变成空目录（正常），此时加载任一技能，DSH 返回的技能基址应指向安装位置：

```
Base directory for this skill: <用户目录>\.dsh\profiles\<profile>\node_modules\dsh-resume-job-search\skills\<技能名>
```

而不是 `<工作区>\.dsh\skills\<技能名>`。看到前者就说明技能由插件提供方供货；这也是「插件对所有工作区生效」的直接证据（技能随 profile 走，与当前工作区无关）。

---

## 形态 B/C/D：只用技能目录

DSH 自带的技能文件系统提供方按下面的**扫描优先级**发现技能（rank 越小越优先）：

| Rank | 来源 | 路径 |
|---|---|---|
| 100 | `project-dsh` | `<项目根>/.dsh/skills` |
| 200 | `project-agents` | `<项目根>/.agents/skills` |
| 300 | `custom` | 配置项 `customSkillDirs` |
| 400 | `user-dsh` | `<DSH_HOME>/skills`（默认 `~/.dsh/skills`） |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | `bundledSkillDir` / `$DSH_BUNDLED_SKILL_DIR` |

**发现规则**：只识别**一层**目录，即 `<根>/<技能名>/SKILL.md`，或平铺的 `<根>/<技能名>.md`；不支持嵌套的 `**/SKILL.md`。frontmatter 必须含 kebab-case 的 `name` 与非空 `description`（可选 `whenToUse`、`metadata`），否则该技能会被**静默跳过**。

### 方式 B：接入某个工作区

在工作区技能目录下**为每个技能建一个联接**（不能把整个 `skills/` 目录链成一层，那样 `SKILL.md` 就深了两层，不会被发现）：

```powershell
# Windows：目录联接，无需管理员权限
$plugin = 'D:\dsh-plugins\dsh-resume-job-search'
$root   = 'D:\你的工作区\.dsh\skills'
New-Item -ItemType Directory -Force -Path $root | Out-Null
Get-ChildItem -Directory "$plugin\skills" | ForEach-Object {
  New-Item -ItemType Junction -Path (Join-Path $root $_.Name) -Target $_.FullName | Out-Null
}
Get-ChildItem $root | Select-Object Name, LinkType, Target   # 自检：应看到 8 个 Junction
```

```bash
# macOS / Linux：符号链接
plugin=~/dsh-plugins/dsh-resume-job-search
root=~/your-workspace/.dsh/skills
mkdir -p "$root"
for d in "$plugin"/skills/*/; do ln -sfn "$d" "$root/$(basename "$d")"; done
ls -l "$root"   # 自检：应看到 8 个链接
```

`<项目根>` 定义为包含 `.git` 的最近祖先目录，否则回退到启动 DSH 时的工作目录。因此**在一个 Git 仓库里**启动 DSH 时，`.dsh/skills` 要放在该 Git 仓库根目录，而不是子目录。

### 方式 C：用户级技能目录（对所有工作区生效）

```powershell
$plugin = 'D:\dsh-plugins\dsh-resume-job-search'
$root   = "$env:USERPROFILE\.dsh\skills"
New-Item -ItemType Directory -Force -Path $root | Out-Null
Get-ChildItem -Directory "$plugin\skills" | ForEach-Object {
  New-Item -ItemType Junction -Path (Join-Path $root $_.Name) -Target $_.FullName | Out-Null
}
```

这样任何工作区启动的 DSH 都能调用这 8 个技能。

### 方式 D：`customSkillDirs` 精确挂载

以 rank 300 注册**技能根目录**，因此可以直接指向 `<plugin>/skills`（无需逐技能建联接），适合把技能目录与工作区解耦。把下面这段加进 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 的顶层数组：

```yaml
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
  config:
    customSkillDirs:
      - 'D:\dsh-plugins\dsh-resume-job-search\skills'
```

保存后 `patchReload: live` 会热加载；若技能未出现，重启 DSH 一次。

> `cordis.yml` 是启动生成的空入口列表，会被覆盖，**不要改它**；只改 `cordis.patch.yml`。

### 方式 E：直接复制

只想临时试用时，把 `skills/` 下的子目录复制到 `~/.dsh/skills/` 或工作区 `.dsh/skills/` 即可，代价是后续更新需要重新复制。

---

## 验证安装

1. 新开一个 DSH 会话（Web GUI 请刷新后新开会话）。
2. 问一句「我现在有哪些求职相关的技能」，技能目录里应出现下面 8 个名字：

   `resume-job-analysis`、`candidate-profile`、`job-search-intel`、`job-evaluation`、`resume-writing`、`cover-letter`、`interview-prep`、`behavioral-profile`

3. 给一段 JD 说「评估这个岗位」，确认 DSH 实际加载 `job-evaluation` 技能（输出五维评分表与阈值判定），而不是自由发挥。
4. 本地跑测试（三项，均不需要 DSH 安装即可运行前两项）：

   ```bash
   npm test                  # 技能契约校验 + 隐私扫描 + 插件提供方契约测试
   npm run test:integration  # 真机集成测试（本机未装 DSH 时自动跳过）
   ```

## 排错清单

| 现象 | 原因与处理 |
|---|---|
| 插件装了但技能没出现 | ① 未重启/新开会话（bundle 层在启动时合成）；② 用 `dsh --profile web --dump-config` 确认 `resume-job-search` 条目存在；③ 看启动日志里有没有 `[resume-job-search] 已从 ... 注册技能提供方` |
| 技能一个都没出现（形态 B/C/D） | 两个常见原因：① 把整个 `skills/` 目录链成一层（`<根>/<某名>/skills/<技能>/SKILL.md`），`SKILL.md` 深了两层，必须**逐技能建联接**或用方式 D；② `SKILL.md` 本身放深了一层，必须 `<根>/<技能名>/SKILL.md` |
| 只缺少某一个技能 | 该文件的 frontmatter `name` 不是 kebab-case、`description` 为空，或写了 DSH 不认识的 `allowed-tools`；DSH 会静默跳过，用 `node scripts/validate-skills.mjs` 定位 |
| 技能文件带 BOM 后消失 | **高频坑**：用 PowerShell 5.1 的 `Set-Content -Encoding UTF8`、或某些 Windows 编辑器保存，会写入 UTF-8 BOM，导致文件不再以 `---` 开头、frontmatter 解析失败。请另存为「UTF-8 无 BOM」；`scripts/validate-skills.mjs` 与 `scripts/privacy-scan.mjs` 都会直接报出该问题（插件自身能容忍 BOM，但不等于应带 BOM） |
| 改了技能正文不生效 | 插件形态有自己的文件监视：技能目录增删改会触发缓存失效；若仍未生效，新开会话即可 |
| 在 Git 仓库里不生效（形态 B） | `<项目根>` 取最近 `.git` 祖先目录，把 `.dsh/skills` 放到仓库根 |
| 方式 D 不生效 | 确认改的是 `cordis.patch.yml` 且路径为真实绝对路径；重启 DSH |
| 同时用多种形态 | 可以共存，但同名技能按 rank 竞争（插件提供方 rank 300，与 `customSkillDirs` 同档；项目级 100/200 更优先）。要么只用一种，要么接受项目级覆盖插件内容 |
| pnpm 未安装 | `dsh plugin` 是 pnpm 转发器；缺 pnpm 时会提示 `pnpm not found on PATH`，先安装 pnpm 或用形态 B/C/D |

## 卸载

- 形态 A：`dsh plugin --profile <profile> remove dsh-resume-job-search`。
- 形态 B/C：删除对应的目录联接。
- 形态 D：移除 `customSkillDirs` 条目。

卸载不会影响你工作区里已生成的简历、求职信与台账文件。

## 与 Claude Code 并存

如果你原来用 Claude Code 的 `.claude/skills/` 工作流，两者互不冲突：Claude Code 读 `.claude/`，DSH 读 `.dsh/`、`customSkillDirs` 或本插件的提供方。注意不要把两边指向同一份含个人隐私的资料文件，本插件默认用占位符模板，你的真实资料只应留在自己的工作区。
