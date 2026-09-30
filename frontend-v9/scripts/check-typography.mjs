import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';
import { isTypographyProperty } from './typography-policy.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const standard = path.join(root, 'src', 'typography.css');
const failures = [];
const report = (file, line, message) => failures.push(`${path.relative(root, file)}:${line}: ${message}`);

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

for (const file of [...files(path.join(root, 'src')), ...files(path.join(root, 'public')), path.join(root, 'index.html')]) {
  const extension = path.extname(file);
  if (!['.css', '.js', '.jsx', '.ts', '.tsx', '.html', '.svg'].includes(extension)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (extension === '.css') {
    const ast = postcss.parse(text, { from: file });
    ast.walkAtRules(rule => {
      if (rule.name === 'font-face' || (rule.name === 'import' && /fonts\.(googleapis|gstatic)\.com/.test(rule.params))) {
        report(file, rule.source.start.line, '不得另外加载字体；使用平台统一字体。');
      }
    });
    ast.walkDecls(declaration => {
      if (file !== standard && isTypographyProperty(declaration.prop)) {
        report(file, declaration.source.start.line, `${declaration.prop} 只能在 src/typography.css 中定义。`);
      }
      if (file === standard && declaration.prop === 'font-family'
        && declaration.value !== '"Microsoft YaHei", sans-serif') {
        report(file, declaration.source.start.line, '字体统一使用微软雅黑。');
      }
      if (file === standard && declaration.prop === 'font'
        && declaration.value !== 'inherit' && !declaration.value.includes('"Microsoft YaHei", sans-serif')) {
        report(file, declaration.source.start.line, 'font 简写中的字体必须使用微软雅黑。');
      }
    });
    continue;
  }
  if (/\.[jt]sx?$/.test(extension)) {
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
      /x$/.test(extension) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isPropertyAssignment(node) || ts.isJsxAttribute(node)) {
        const name = node.name;
        const key = ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)
          ? name.expression.text : name.text ?? name.getText(ast);
        if (isTypographyProperty(key)) {
          report(file, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            `${key} 不得在组件内定义，请在 typography.css 中定义并引用样式类。`);
        }
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'font') {
        report(file, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, '禁止使用 font 标签。');
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const target = node.left;
        const key = ts.isPropertyAccessExpression(target) ? target.name.text
          : ts.isElementAccessExpression(target) && ts.isStringLiteral(target.argumentExpression)
            ? target.argumentExpression.text : '';
        if (isTypographyProperty(key)) report(file,
          ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, '禁止通过 JS 属性赋值修改字体。');
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ['setProperty', 'setAttribute'].includes(node.expression.name.text)
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
        && isTypographyProperty(node.arguments[0].text)) {
        report(file, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, '禁止通过 DOM 方法修改字体。');
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (/(?:^|[;{\s])(?:font(?:-[\w-]+)?|line-height|letter-spacing|word-spacing|text-transform|text-decoration)\s*:/.test(node.text)) {
          report(file, ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, '禁止在字符串中注入字体样式。');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  } else {
    if (/\b(?:font(?:-[\w-]+)?|line-height|letter-spacing|word-spacing|text-transform|text-decoration)\s*[:=]/i.test(text)) {
      report(file, 1, 'HTML / SVG 内不得定义字体样式。');
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('字体规范检查通过：微软雅黑；原版字号和字重集中管理，无组件内联字体设置。');
}
