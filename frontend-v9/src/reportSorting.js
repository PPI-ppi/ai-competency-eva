export const reportSortOptions=[['newest','最新在前'],['oldest','最早在前'],['score-desc','分数从高到低'],['score-asc','分数从低到高']];
const time=row=>row.date?new Date(row.date).getTime():NaN;
const score=row=>row.score==null||row.score===''?NaN:Number(row.score);
const compare=(a,b,direction)=>{
  if(!Number.isFinite(a))return Number.isFinite(b)?1:0;
  if(!Number.isFinite(b))return -1;
  return (a-b)*direction;
};
export function sortHistoryReports(reports,query='',order='newest') {
  const keyword=query.trim().toLowerCase();
  return reports.filter(row=>!keyword||[row.title,row.description,row.scope,row.type].join(' ').toLowerCase().includes(keyword)).sort((a,b)=>{
    if(order==='score-desc'||order==='score-asc')return compare(score(a),score(b),order==='score-asc'?1:-1)||compare(time(a),time(b),-1);
    return compare(time(a),time(b),order==='oldest'?1:-1);
  });
}
