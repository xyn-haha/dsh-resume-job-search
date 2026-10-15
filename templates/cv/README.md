# cv/ 简历目录约定

- `resume_base.md`：未针对任何岗位的底稿，只在更新真实经历时修改。
- `resume_<公司>.md`：针对某岗位的定制版，从底稿派生，不覆盖底稿。
- LaTeX 路线保留 `main_<公司>.tex`，模板来源见 `skills/resume-writing/SKILL.md`。

硬性要求（详见技能文件）：

1. 中文简历 1–2 页、英文简历 2 页内；导出 PDF 后必须逐页目视检查。
2. 禁止编造技能、经历、证书、名次；每条内容可追溯到 `config/candidate-profile.md`。
3. JD 关键词真实对齐，不支持的要求保留差距可见，禁止堆砌。
4. 导出后检查 ATS 文本层（`pdftotext -layout` 可用时）：联系方式必须是字面文本，无 `(cid:NNN)` 乱码，阅读顺序与视觉顺序一致。
