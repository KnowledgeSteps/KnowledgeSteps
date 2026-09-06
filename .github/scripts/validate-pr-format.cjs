const REQUIRED_SECTIONS = [
  "改动目的",
  "主要改动",
  "影响范围",
  "验证方法与结果",
  "接口与数据库变更",
  "部署与配置",
  "页面截图或演示",
  "已知问题与后续工作",
];

const ALLOWED_TYPES = ["Feat", "Fix", "Docs", "Refactor", "Test", "Chore", "CI"];
const TITLE_PATTERN = new RegExp(`^(${ALLOWED_TYPES.join("|")}): (.+)/(.+)$`);

function validateTitle(title) {
  const errors = [];
  const normalizedTitle = title.trim();
  const match = normalizedTitle.match(TITLE_PATTERN);

  if (title !== normalizedTitle || !match) {
    errors.push(
      "PR 标题必须使用“类型: English description/中文说明”，例如“Fix: fix login callback/修复登录回调”。",
    );
    return errors;
  }

  const [, , englishDescription, chineseDescription] = match;
  if (!/[A-Za-z]/.test(englishDescription)) {
    errors.push("斜杠前必须填写英文说明。");
  }
  if (!/[\u3400-\u9fff]/.test(chineseDescription)) {
    errors.push("斜杠后必须填写中文说明。");
  }

  return errors;
}

function contentWithoutComments(lines) {
  return lines
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function validateBody(body) {
  const errors = [];

  if (body.includes("\\n")) {
    errors.push("PR 正文包含字面量 \\n，请使用 Markdown 的真实换行。");
  }

  const lines = body.split(/\r?\n/);
  const actualSections = lines
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());

  if (JSON.stringify(actualSections) !== JSON.stringify(REQUIRED_SECTIONS)) {
    errors.push(
      `PR 正文必须按顺序保留以下二级标题，不能缺少、改名或增加其他二级标题：${REQUIRED_SECTIONS.join("、")}。`,
    );
    return errors;
  }

  for (let index = 0; index < REQUIRED_SECTIONS.length; index += 1) {
    const heading = `## ${REQUIRED_SECTIONS[index]}`;
    const start = lines.indexOf(heading) + 1;
    const nextHeading = REQUIRED_SECTIONS[index + 1];
    const end = nextHeading ? lines.indexOf(`## ${nextHeading}`) : lines.length;
    const content = contentWithoutComments(lines.slice(start, end));

    if (!content || content === "-" || content === "1.") {
      errors.push(`“${REQUIRED_SECTIONS[index]}”不能为空；不涉及的项目请填写“无”。`);
    }
  }

  const impactStart = lines.indexOf("## 影响范围") + 1;
  const impactEnd = lines.indexOf("## 验证方法与结果");
  const impactContent = lines.slice(impactStart, impactEnd).join("\n");
  if (!/- \[[xX]\]/.test(impactContent)) {
    errors.push("“影响范围”至少需要勾选一项。");
  }

  if (!/[\u3400-\u9fff]/.test(contentWithoutComments(lines))) {
    errors.push("PR 正文必须使用中文填写。");
  }

  return errors;
}

function validatePullRequest(title, body) {
  return [...validateTitle(title), ...validateBody(body)];
}

if (require.main === module) {
  const title = process.env.PR_TITLE ?? "";
  const body = process.env.PR_BODY ?? "";
  const errors = validatePullRequest(title, body);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`::error::${error}`);
    }
    console.error("\nPR 格式检查失败，请按照 CONTRIBUTING.md 和 PR 模板修改后重试。");
    process.exit(1);
  }

  console.log("PR 标题和正文格式检查通过。");
}

module.exports = { ALLOWED_TYPES, REQUIRED_SECTIONS, validatePullRequest };
