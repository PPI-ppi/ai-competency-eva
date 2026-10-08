import assert from 'node:assert/strict';
import {parseQuestionOptions,optionDisplayText} from '../src/questionOptions.js';

const labeled=['A. NLP 是 AI 的分支，包含文本处理','B. NLP = CV < AI','C. AI 包含 NLP 和 CV','D. NLP 仅指机器人'];
for(const value of [labeled,labeled.join('\n'),labeled.join(' '),labeled.join('\r\n'),JSON.stringify(labeled),[labeled.join(' ')],JSON.stringify(labeled.join('\n'))]) {
  assert.deepEqual(parseQuestionOptions(value),labeled);
}
assert.equal(optionDisplayText(labeled[1],1),'NLP = CV < AI');
assert.equal(parseQuestionOptions(labeled.join(' '))[1],labeled[1],'submission retains the individual option label');
assert.deepEqual(parseQuestionOptions('明确目标，规定格式\n检查事实,保护隐私'),['明确目标，规定格式','检查事实,保护隐私']);
assert.deepEqual(parseQuestionOptions(['Use A. notation within text','second option']),['Use A. notation within text','second option']);
assert.deepEqual(parseQuestionOptions(['多行选项\n包含说明','另一个选项']),['多行选项\n包含说明','另一个选项']);
assert.deepEqual(parseQuestionOptions('A. 使用 D. 方法\nC. 内容'),['A. 使用 D. 方法','C. 内容'],'non-sequential internal letters must not split options');
for(const value of [null,undefined,{},42,'','{}','null'])assert.deepEqual(parseQuestionOptions(value),[]);
assert.deepEqual(parseQuestionOptions('正确\n错误'),['正确','错误']);
assert.deepEqual(parseQuestionOptions(['A、第一项','B、第二项']),['A、第一项','B、第二项']);
console.log('PASS: array, JSON, multiline and inline labeled options; punctuation and submission values preserved');
