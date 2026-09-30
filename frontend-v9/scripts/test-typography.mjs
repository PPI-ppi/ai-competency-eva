import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const checker = path.join(root, 'scripts/check-typography.mjs');
const run = () => spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
assert.equal(run().status, 0, 'Clean source should pass');
const fixtures = [
  ['css', '.bad { font-size: 23px; }'],
  ['css', '.bad { font: bold 20px Arial; }'],
  ['css', '.bad { line-height: 3; letter-spacing: 4px; }'],
  ['jsx', 'export const Bad = () => <div style={{ fontSize: 23 }} />;'],
  ['jsx', 'export const Bad = () => <svg><text fontSize={23}>字</text></svg>;'],
  ['js', 'export const bad = { ["fontFamily"]: "Arial" };'],
  ['js', 'element.style.fontSize = "23px";'],
  ['js', 'element.style.setProperty("font-size", "23px");'],
  ['svg', '<svg><text font-size="23">字</text></svg>'],
];
for (const [extension, contents] of fixtures) {
  const file = path.join(root, 'src', `typography-violation-fixture.${extension}`);
  assert.ok(!fs.existsSync(file), 'Fixture must not overwrite user files');
  try {
    fs.writeFileSync(file, contents);
    const result = run();
    assert.notEqual(result.status, 0, `Must reject ${contents}`);
    assert.match(result.stderr + result.stdout, /typography-violation-fixture/);
  } finally {
    fs.unlinkSync(file);
  }
}
assert.equal(run().status, 0, 'Source should pass after fixtures are removed');
console.log(`通过：正常源码及 ${fixtures.length} 个违规定义拦截测试。`);
