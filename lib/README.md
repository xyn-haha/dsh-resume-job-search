# 运行时入口（dsh 插件形态）

本目录的 `index.js` 是插件入口：在 `apply(ctx)` 中把包内 `skills/` 注册为 DSH 的技能提供方。

## 为什么不用 `customSkillDirs` 配置

配置方式只能作用在改过那台机器的 `cordis.patch.yml` 上；作为**插件包**分发时，用户 `dsh plugin add` 之后不该再手工改配置。插件自己实现提供方后：

- 技能目录随包走，安装即生效；
- 跨平台（Windows 联接、Unix 符号链接都不需要）；
- 自带文件监视，改技能文件即刻生效。

## 契约

与 `@deepseek-ai/dsh-skill` 的公开契约一致：

| 位置 | 要求 |
|---|---|
| 注册时机 | `apply()` 中**同步**调用 `ctx.skills.registerProvider(create)` |
| `create(control)` | 返回 `{ name, list, get }`；`control` 提供 `signal` 与 `invalidate()` |
| `list(options)` | 返回候选数组或 `{ candidates, complete }`；候选需带 `name` / `description` / `source` / `rank` / `provider` / `locator`（`whenToUse`、`metadata`、`path` 可选） |
| `get(candidate, options)` | 返回带 `content` 的完整定义；资源基址用 `resourceBase = { kind: 'directory', path }` |
| 优先级 | 本插件候选 `rank = 300`：低于项目级（100/200）与运行时（250），高于用户级（400/500）与内置（600） |
| 名称 | `name` 必须为 kebab-case，且候选的 `provider` 字段必须等于提供方自身名称 |

## 可选配置

```yaml
- insert:
    - id: resume-job-search
      name: dsh-resume-job-search
      config:
        skillsDir: /absolute/path/to/skills   # 覆盖默认的包内 skills/
        quiet: true                           # 关闭启动时的 info 日志
```

## 自测

```bash
node ../test/provider.test.mjs      # mock ctx，按注册表校验规则检查
node ../test/integration.test.mjs   # 真实 SkillRegistry（需本机安装 DSH）
```

## 已知限制

- 技能目录的**资源文件**（`references/`、`scripts/` 等子树）改动不会触发失效，与 DSH 自带文件系统提供方的取舍一致；`SKILL.md` 的增删改会触发。
- 插件不做 frontmatter 的严格 YAML 解析（只支持本插件用到的键），因此技能里写复杂 YAML（多行块、锚点）不会被识别；这类情况请改用形态 B/C/D 的文件系统提供方，它使用完整 YAML 解析。
