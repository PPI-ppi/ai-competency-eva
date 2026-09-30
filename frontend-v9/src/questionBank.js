export function questionPresentation(question) {
  const title=String(question.title||'').trim();
  const content=String(question.content||'').trim();
  const match=title.match(/^[【\[]\s*((?:(?:入门|进阶|挑战)\s*[·•-]\s*)?(?:0(?:\.\d+)?|1(?:\.0+)?))\s*[】\]]$/);
  return {heading:content||title||'未命名题目',
    subtitle:!match&&content&&title!==content?title:'',
    difficulty:match?match[1]:question.difficulty?`L${question.difficulty}`:''};
}
export function isQuestionCopied(question,mine,copies={}) {
  const sourceId=String(question.id);
  return Boolean(question.copied||question.inPrivateLibrary||mine.some(item=>
    String(item.id)===sourceId||String(item.sourceQuestionId||item.copiedFromId||'')===sourceId||
    (copies[sourceId]!=null&&String(item.id)===String(copies[sourceId]))));
}
export function readQuestionCopies(userId,storage) {
  if(userId==null)return {};
  try {const value=JSON.parse(storage.getItem(`ripple-question-copies:${userId}`)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
}
export function saveQuestionCopies(userId,copies,storage) {
  if(userId==null)return;
  try {storage.setItem(`ripple-question-copies:${userId}`,JSON.stringify(copies))}catch{/* Session state still reflects the confirmed copy. */}
}
