# English install guide

This plugin is **skills-only**: plain Markdown skills, no runtime code. DSH discovers local skills through the `@deepseek-ai/dsh-skill-filesystem` provider.

## Discovery roots (rank order)

| Rank | Source | Path |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `customSkillDirs` config |
| 400 | `user-dsh` | `<DSH_HOME>/skills` (default `~/.dsh/skills`) |
| 500 | `user-agents` | `<agentsHome>/skills` |

Only **one level** is scanned: `<root>/<skill-name>/SKILL.md` or a flat `<root>/<skill-name>.md`. Nested `**/SKILL.md` is intentionally ignored. A skill whose frontmatter lacks a kebab-case `name` or a non-empty `description` is **silently skipped**; `allowed-tools` is not a DSH field.

`<projectRoot>` is the nearest ancestor containing `.git`, otherwise the working directory DSH was started in.

## Option A — bind to one workspace

DSH scans only the first level of a skills root, so link **each skill directory** (not the whole `skills/` folder):

```bash
plugin=~/dsh-plugins/dsh-resume-job-search
root=~/your-workspace/.dsh/skills
mkdir -p "$root"
for d in "$plugin"/skills/*/; do ln -sfn "$d" "$root/$(basename "$d")"; done
```

Windows (PowerShell, no admin rights needed):

```powershell
$plugin = 'D:\dsh-plugins\dsh-resume-job-search'
$root   = 'D:\your-workspace\.dsh\skills'
New-Item -ItemType Directory -Force -Path $root | Out-Null
Get-ChildItem -Directory "$plugin\skills" | ForEach-Object {
  New-Item -ItemType Junction -Path (Join-Path $root $_.Name) -Target $_.FullName | Out-Null
}
```

## Option B — user-level skills directory

```bash
plugin=~/dsh-plugins/dsh-resume-job-search
mkdir -p ~/.dsh/skills
for d in "$plugin"/skills/*/; do ln -sfn "$d" ~/.dsh/skills/"$(basename "$d")"; done
```

Available to every workspace on this machine.

## Option C — bind as a dsh plugin bundle

The repository ships a `cordis.patch.yml` that registers the plugin's `skills/` directory into the provider's `customSkillDirs` (rank 300).

1. Replace `<PLUGIN_DIR>` in that file with your clone path:

   ```yaml
   - id: skill-filesystem
     name: '@deepseek-ai/dsh-skill-filesystem'
     config:
       customSkillDirs:
         - '/Users/you/dsh-plugins/dsh-resume-job-search/skills'
   ```

2. Either copy that entry into your own `$DSH_HOME/profiles/<profile>/cordis.patch.yml` (top-level array; `customSkillDirs` accepts several paths), or install this repo as a dsh plugin (`dsh plugin --profile <profile> add <package-or-local-path>`).

Never edit `cordis.yml` (the generated entry list); edit `cordis.patch.yml`.

## Verify

1. Open a new DSH session (refresh the Web GUI first if you use it).
2. Ask "which job-search skills do I have?" and expect these 8 names:

   `resume-job-analysis`, `candidate-profile`, `job-search-intel`, `job-evaluation`, `resume-writing`, `cover-letter`, `interview-prep`, `behavioral-profile`

3. Paste a job description and say "evaluate this job" — the answer should follow `job-evaluation`'s five-dimension table rather than improvising.
4. Contract check locally:

   ```bash
   node scripts/validate-skills.mjs
   ```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| No skills appear | ① The whole `skills/` folder was linked as one level (`<root>/<name>/skills/<skill>/SKILL.md`), which is two levels too deep — link each skill directory instead, or use Option C; ② `SKILL.md` itself is nested too deep; it must be `<root>/<skill-name>/SKILL.md` |
| One skill missing | Invalid `name` (not kebab-case), empty `description`, or an unsupported `allowed-tools` field; DSH skips it silently — run `scripts/validate-skills.mjs` |
| A skill disappeared after editing | The file was saved with a UTF-8 BOM (PowerShell `Set-Content -Encoding UTF8`, some Windows editors), so it no longer starts with `---`. Save as "UTF-8 without BOM"; both bundled scripts detect this |
| Edits do not show up | Body edits load on next use; new/renamed frontmatter is watched, otherwise open a new session |
| Nothing inside a Git repo | `<projectRoot>` resolves to the nearest `.git` ancestor — put `.dsh/skills` at the repo root |
| Option C ineffective | Make sure you edited `cordis.patch.yml` and replaced `<PLUGIN_DIR>`; restart DSH if the patch does not hot-reload |

## Uninstall

Remove the junction/symlink (or the `customSkillDirs` entry) and open a new session. Your generated resumes, cover letters and ledgers in the workspace are untouched.
