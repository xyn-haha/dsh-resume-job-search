# 第三方代码与内容来源声明

本仓库在 MIT 许可下发布（`LICENSE` 为标准 MIT 文本）。除自有内容外，包含以下衍生内容，按上游许可要求在此声明——**上游版权与许可原文保留在本文件中**。

## 1. ai-job-search（求职工作区）

- 来源：`ai-job-search`（本地仓库 `D:\项目\ai-job-search`，为 Claude Code 风格的求职工作区）
- 作者与版权：Copyright (c) 2026 Mads Lorentzen
- 许可：MIT License（原文见下）
- **被使用的部分**：
  - `skills/job-evaluation/`（岗位匹配度评估的五维评分框架、阈值判定、电话沟通建议）
  - `skills/resume-writing/`、`skills/cover-letter/`（写作风格规则、禁用表达清单、LaTeX moderncv / cover.cls 版式与编译校验规则）
  - `skills/interview-prep/`、`skills/behavioral-profile/`（面试准备方法、行为画像维度）
  - `skills/job-search-intel/`（岗位检索策略、去重台账 schema、技能差距分析）
  - `skills/resume-job-analysis/`（由上游主技能与 `/apply` 命令的工作流改写而来）
- **本仓库的改动（衍生作品说明）**：改写为 DSH 技能契约（`SKILL.md` + YAML frontmatter，去除斜杠命令与 `allowed-tools`）；移除全部真实个人数据并改为占位符；求职渠道由丹麦/LinkedIn 换为中国大陆主流招聘平台；新增中文优先的 Markdown→PDF/Word 产出路线、ATS 文本层校验、隐私扫描脚本、技能契约校验脚本与 BOM 检测；新增本插件的运行时入口与工程文件（`lib/`、`package.json`、`cordis.patch.yml`、CI）。
- 上游许可原文：

```
MIT License

Copyright (c) 2026 Mads Lorentzen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. DeepSeek Harness（宿主平台）

本插件运行在 DeepSeek Harness（`dsh`）之上，按 `@deepseek-ai/dsh-skill` 的公开提供方契约实现技能注册。宿主包本身不在本仓库内分发，其许可（MIT）与版权归 DeepSeek 所有。
