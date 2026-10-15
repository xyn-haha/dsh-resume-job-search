# Resume Writing & Job-Search Analysis — a DSH plugin

> A **job-search skill pack** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`): let the agent run your resume tailoring, application tracking, and interview prep through a fixed, disciplined workflow instead of ad-hoc chat.
>
> 中文: [README.md](README.md)

[![validate](https://github.com/xyn-haha/dsh-resume-job-search/actions/workflows/validate.yml/badge.svg)](https://github.com/xyn-haha/dsh-resume-job-search/actions/workflows/validate.yml)
![skills](https://img.shields.io/badge/skills-8-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## Why

Job hunting rarely fails at "writing a resume". It fails at:

- **Re-explaining yourself every time** — the agent does not know your real experience, so it invents or writes hollow bullets.
- **Gut-feel fit decisions** — no idea whether to apply, or where the gaps are.
- **No application ledger** — 30 applications later, nobody remembers which resume went where.
- **Losing the ATS race** — page-break chaos in the exported PDF, missing keywords.

This plugin turns that into 8 skills and a fixed pipeline: **fact base → job intel → fit scoring → resume / cover letter → interview prep → application ledger**.

## Skills

| Skill | Purpose | Triggers |
|---|---|---|
| `resume-job-analysis` | Orchestrator, end-to-end pipeline | "apply to this job", "job search analysis" |
| `candidate-profile` | Single source of truth for your facts | "update my profile" |
| `job-search-intel` | Channel search, dedup, batch ranking, ledger, upskill plan | "find new jobs", "rank these" |
| `job-evaluation` | Five-dimension weighted scoring with red flags | "evaluate this JD" |
| `resume-writing` | Resume tailoring, length budget, export & ATS checks | "tailor my resume" |
| `cover-letter` | Structure, tone, banned phrases | "write a cover letter" |
| `interview-prep` | Round map, STAR skeletons, questions to ask, mock interview | "prepare me for the interview" |
| `behavioral-profile` | Behaviour profile → writing tone and role fit | "does this role fit me" |

## Three core disciplines

1. **No fabrication** — every claim in a resume or cover letter must trace back to a fact in `candidate-profile` with a provable artifact. Unsupported requirements stay visible as gaps; keyword stuffing is forbidden.
2. **Evaluate before writing** — a JD always gets a fit score and verdict first, and materials are generated **only after you confirm**.
3. **Always verify output** — exported PDFs are inspected page by page (page breaks, orphaned headings, overflow); where `pdftotext` exists, the ATS text layer is checked too.

## Install

**Option A — bind to one workspace (fastest)**

DSH scans only the first level of a skills root, so link **each skill directory** (the loop below does it):

```powershell
git clone https://github.com/xyn-haha/dsh-resume-job-search.git D:\dsh-plugins\dsh-resume-job-search
$plugin = 'D:\dsh-plugins\dsh-resume-job-search'; $root = 'D:\your-workspace\.dsh\skills'
New-Item -ItemType Directory -Force -Path $root | Out-Null
Get-ChildItem -Directory "$plugin\skills" | ForEach-Object {
  New-Item -ItemType Junction -Path (Join-Path $root $_.Name) -Target $_.FullName | Out-Null
}
```

**Option B — user-level skills dir (all workspaces)**

```bash
git clone https://github.com/xyn-haha/dsh-resume-job-search.git ~/dsh-plugins/dsh-resume-job-search
mkdir -p ~/.dsh/skills
for d in ~/dsh-plugins/dsh-resume-job-search/skills/*/; do ln -sfn "$d" ~/.dsh/skills/"$(basename "$d")"; done
```

**Option C — install as a `dsh` plugin bundle (`customSkillDirs`, no per-skill links)**

Replace `<PLUGIN_DIR>` in the bundled `cordis.patch.yml` with your clone path and reference it from `$DSH_HOME/profiles/<profile>/cordis.patch.yml`.

> Full steps, verification and troubleshooting: [INSTALL.md](INSTALL.md) (Chinese). English walkthrough: [docs/INSTALL.en.md](docs/INSTALL.en.md).

## Quick start

1. Open `skills/candidate-profile/SKILL.md` and fill in your real facts (or start from `templates/`).
2. Tell DSH: **"evaluate this job: <paste the JD or link>"**.
3. Read the score and red flags, then confirm whether to apply.
4. Then: **"tailor my resume for this company and write a cover letter"**.
5. **"prepare me for the interview"** for the round map, STAR skeletons and questions to ask.
6. **"update the ledger"** after each application.

## Privacy

- This repository contains **no personal data**; names, schools, projects and awards in the skills are `<placeholder>`-style.
- Your real data lives in your own workspace (`config/`, `cv/`, `cover_letters/`), excluded by the bundled `.gitignore`.
- CI scans skills and docs for e-mail, phone and national-ID patterns to stop private data from leaking back into the public repo.

## Contributing

New portal queries, writing rules, interview question banks and translations are welcome. Before opening a PR:

```bash
node scripts/validate-skills.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
