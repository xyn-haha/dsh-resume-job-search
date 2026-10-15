# 求职工作区样板

把本目录的结构复制到你自己的求职工作区（例如 `D:\项目\my-job-search`），再让 DSH 在**那个工作区**里工作。技能本身放在插件目录，工作区只放你的隐私数据与产出文件，二者分离便于备份与分享技能。

```
我的求职工作区/
├─ config/
│  └─ candidate-profile.md      从 skills/candidate-profile/SKILL.md 复制模板后填写真实资料
├─ cv/                          简历底稿与各公司定制版
├─ cover_letters/               求职信
├─ job_scraper/
│  └─ seen_jobs.json            岗位去重台账（{"seen": {}} 初始化）
├─ job_search_tracker.csv       投递台账（列名见 skills/job-search-intel/job_search_tracker.csv）
└─ gap-plans/                   技能差距与学习计划报告
```

## 使用顺序

1. 复制结构，把 `config/candidate-profile.md` 填成你自己的真实资料。
2. 在 DSH 里说「读取我的资料并更新候选人资料库」，让它同步到 `candidate-profile` 技能认知里。
3. 拿到 JD 后说「评估这个岗位：<JD>」，走评估门控。
4. 确认投递后说「给这家公司改简历并写求职信」，产出写入 `cv/` 与 `cover_letters/`。
5. 每投一份，更新 `job_search_tracker.csv` 的 `Status` 与 `NextAction`。

## 命名约定（避免历史版本被覆盖）

- 简历：`cv/resume_<公司英文或拼音>.md`（LaTeX 路线为 `cv/main_<公司>.tex`）
- 求职信：`cover_letters/cover_<公司>_<岗位>.md`（LaTeX 路线为 `.tex`）
- 差距报告：`gap-plans/report-YYYY-MM-DD.md`

## 隐私提醒

- 对外投递的简历按平台要求隐去精确住址与手机号中间位。
- 本工作区目录含有个人资料，不要提交到公开仓库；如需版本管理，把 `config/` 加入 `.gitignore`。
