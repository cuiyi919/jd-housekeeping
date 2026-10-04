/* Calendar-day arithmetic uses UTC to avoid daylight-saving shifts. */
(function(root){
const DAY=86400000;
function day(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('日期请使用 YYYY-MM-DD 格式');const n=Date.parse(s+'T00:00:00Z')/DAY;if(!Number.isInteger(n)||iso(n)!==s)throw Error('日期无效：'+s);return n;}
function iso(n){return new Date(n*DAY).toISOString().slice(0,10)}
function weekend(n){return [0,6].includes(new Date(n*DAY).getUTCDay())}
const holidays=new Set();
for(const [a,b] of [['2026-01-01','2026-01-03'],['2026-02-15','2026-02-23'],['2026-04-04','2026-04-06'],['2026-05-01','2026-05-05'],['2026-06-19','2026-06-21'],['2026-09-25','2026-09-27'],['2026-10-01','2026-10-07']])for(let d=day(a);d<=day(b);d++)holidays.add(d);
function dates(s){return s.trim()?s.trim().split(/[\s,，;；]+/).map(day):[]}
function allowed(d,past,buffer){return past.filter(x=>d-x>=0&&d-x<30+buffer).length<3&&past.filter(x=>d-x>=0&&d-x<60+buffer).length<5}
function orderWindow(r,c){return [r-(c.wait+c.valid-1)-c.min,r-c.wait-c.max]}
function delivery(o,c){return {arrival:[o+c.min,o+c.max],activation:[o+c.min+c.wait,o+c.max+c.wait],expiry:[o+c.min+c.wait+c.valid-1,o+c.max+c.wait+c.valid-1],common:[o+c.max+c.wait,o+c.min+c.wait+c.valid-1]}}
function plan(c){
for(const [k,lo,hi] of [['count',1,5],['span',1,120],['wait',0,60],['valid',1,30],['min',0,30],['max',0,30],['buffer',0,1]])if(!Number.isInteger(c[k])||c[k]<lo||c[k]>hi)throw Error('请检查数字范围：'+k);
if(c.max<c.min)throw Error('最慢配送天数不能小于最快配送天数');
if(c.max-c.min>c.valid-1)throw Error('配送时间波动超过券的有效期，无法保证预约当天券有效。请缩小配送范围。');
const start=day(c.start),end=start+c.span-1,history=dates(c.history||''),excluded=new Set(dates(c.excluded||''));
if(history.some(d=>d>=start))throw Error('历史预约日期必须早于首单可预约日期；不要重复填写本次首单。');
const candidates=[];for(let d=start;d<=end;d++)if((!c.avoidWeekend||!weekend(d))&&(!c.avoidHoliday||!holidays.has(d))&&!excluded.has(d))candidates.push(d);
let best=null,bestCost=Infinity;
function dfs(chosen,cost){const i=chosen.length;if(i===c.count){best=chosen.slice();bestCost=cost;return;}const target=start+(c.count===1?0:i*(c.span-1)/(c.count-1));const options=candidates.filter(d=>(i===0?d<start+c.valid:d>chosen[i-1])&&end-d>=c.count-i-1).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b);
for(const d of options){const next=cost+(d-target)**2;if(next>=bestCost)continue;if(!allowed(d,history.concat(chosen),c.buffer))continue;chosen.push(d);dfs(chosen,next);chosen.pop();}}
dfs([],0);if(!best)throw Error('这些条件下排不出完整计划。可增加规划天数、减少次数、放开周末，或检查历史预约记录。不会自动安排超限日期。');
return {start,end,days:best,rows:best.map((d,i)=>({date:d,order:i?orderWindow(d,c):null,count30:history.concat(best.slice(0,i+1)).filter(x=>d-x>=0&&d-x<30+c.buffer).length,count60:history.concat(best.slice(0,i+1)).filter(x=>d-x>=0&&d-x<60+c.buffer).length})),unknownYears:[...new Set(Array.from({length:c.span},(_,i)=>iso(start+i).slice(0,4)).filter(y=>y!=='2026'))]};
}
const api={day,iso,weekend,dates,allowed,orderWindow,delivery,plan};if(typeof module!=='undefined')module.exports=api;root.Planner=api;
})(typeof globalThis!=='undefined'?globalThis:this);
