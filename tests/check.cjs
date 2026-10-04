const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),P=require('../web/planner.js');
const config={start:'2026-09-30',span:60,count:5,wait:9,valid:7,min:1,max:3,buffer:1,history:'',excluded:'',avoidWeekend:true,avoidHoliday:true};
const plan=P.plan(config);assert.equal(plan.days.length,5);assert.equal(P.iso(plan.days[0]),'2026-09-30');
for(const r of plan.rows){assert(r.count30<=3&&r.count60<=5);assert(!P.weekend(r.date));if(r.order)for(let o=r.order[0];o<=r.order[1];o++)for(let t=config.min;t<=config.max;t++){assert(o+t+9<=r.date);assert(o+t+15>=r.date)}}
assert.equal(P.allowed(60,[0,12,24,36,48],1),false);assert.equal(P.allowed(61,[0,12,24,36,48],1),true);assert.equal(P.allowed(60,[0,12,24,36,48],0),true);
assert.equal(P.allowed(30,[0,10,20],1),false);assert.equal(P.allowed(31,[0,10,20],1),true);
assert.throws(()=>P.plan({...config,min:0,max:8}),/配送/);assert.throws(()=>P.day('2026-02-30'),/无效/);
assert.throws(()=>P.plan({...config,start:'2026-10-01'}),/排不出/);
assert.throws(()=>P.plan({...config,history:'2026-09-30'}),/历史/);
const historical=P.plan({...config,history:'2026-09-01,2026-09-15'});assert(historical.rows.every(r=>r.count30<=3&&r.count60<=5));
const future=P.plan({...config,start:'2027-01-01'});assert.deepEqual(future.unknownYears,['2027']);
for(const date of ['2026-02-10','2026-04-01','2026-06-18','2026-12-20']){const r=P.plan({...config,start:date});assert.equal(r.days.length,5);assert(r.rows.every(r=>r.count30<=3&&r.count60<=5))}
const html=fs.readFileSync(require('node:path').join(__dirname, '../web/index.html'),'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log(JSON.stringify({result:'All checks passed',defaultBookings:plan.days.map(P.iso),orderWindows:plan.rows.map(r=>r.order?.map(P.iso)||null),historicalBookings:historical.days.map(P.iso)}));
