(function(root){
'use strict';
const P=typeof module!=='undefined'?require('./planner.js'):root.Planner;
const categories=['牙膏','牙刷','沐浴露','洗发水','护发素','洗衣液','柔顺剂','洗洁精','洗手液','纸品','清洁剂','其他'];
function known(r){return !!r.purchaseDate&&typeof r.amount==='number'&&Number.isFinite(r.amount)}
function purchase(row,form,today){
  P.day(form.date);if(form.date>today)throw Error('实际购买日期不能是未来日期。');
  const amount=Number(form.amount);
  if(form.amount===''||!Number.isFinite(amount)||amount<0||amount>1000000||Math.abs(amount*100-Math.round(amount*100))>0.000001)throw Error('请填写实际花费，免费订单可填0，最多两位小数。');
  if(!form.items.length)throw Error('请填写本次购买商品。');
  const items=form.items.map((x,i)=>{
    const name=x.name.trim();
    if(!name||name.length>200)throw Error('请填写商品名称，或移除空白商品行。');
    // Retain legacy metadata in backups; the editor now only asks for a name.
    const item={category:'其他',quantity:1,unit:'件',...row.items[i],...x,name};
    item.quantity=Number(item.quantity);
    if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100000)throw Error('商品数量请填正整数。');
    if(!categories.includes(item.category))throw Error('商品记录格式不正确。');
    return item;
  });
  return {...row,purchaseDate:form.date,amount,items};
}
const productKey=name=>name.trim().toLocaleLowerCase();
function summary(rows){
  let cents=0,completed=0,completeCents=0,priced=0;
  const groups=new Map();
  for(const r of rows){
    if(known(r))cents+=Math.round(r.amount*100);
    if(r.actualService){completed++;if(known(r)){priced++;completeCents+=Math.round(r.amount*100)}}
    if(!r.purchaseDate)continue;
    const seen=new Set();
    for(const item of r.items){
      const name=item.name.trim(),key=productKey(name);
      if(!key||seen.has(key))continue;
      seen.add(key);
      const group=groups.get(key)||{name,purchases:0,lastDate:r.purchaseDate};
      group.purchases++;
      if(group.lastDate<r.purchaseDate)group.lastDate=r.purchaseDate;
      groups.set(key,group);
    }
  }
  return {spent:cents/100,completed,priced,average:priced?Math.round(completeCents/priced)/100:null,missingCost:completed-priced,groups:[...groups.values()].sort((a,b)=>b.lastDate.localeCompare(a.lastDate))};
}
function duplicates(row,rows,onDate){
  if(!onDate)return [];
  const end=P.day(onDate),wanted=new Set(row.items.map(x=>productKey(x.name)).filter(Boolean)),found=new Map();
  for(const r of rows){
    if(r.id===row.id||!r.purchaseDate)continue;
    const diff=end-P.day(r.purchaseDate);if(diff<0||diff>30)continue;
    for(const item of r.items){
      const key=productKey(item.name);if(!wanted.has(key))continue;
      const prior=found.get(key);
      if(!prior||prior.date<r.purchaseDate)found.set(key,{date:r.purchaseDate,name:item.name.trim()});
    }
  }
  return [...found.values()];
}
function bookingWarnings(rows,buffer){let warnings=[];const sorted=rows.filter(x=>x.bookingDate).slice().sort((a,b)=>a.bookingDate.localeCompare(b.bookingDate));for(let i=0;i<sorted.length;i++){const d=P.day(sorted[i].bookingDate),past=sorted.slice(0,i).map(x=>P.day(x.bookingDate));if(!P.allowed(d,past,buffer))warnings.push({id:sorted[i].id,date:sorted[i].bookingDate})}return warnings}
function validateState(s){
function fail(){throw Error('备份格式不正确，原有记录未改动。')}
function text(x,max=200){if(typeof x!=='string'||x.length>max)fail()}
function date(x,optional=false){if(optional&&x==='')return;try{P.day(x)}catch{fail()}}
function config(c){if(!c||typeof c!=='object'||Array.isArray(c))fail();for(const k of ['span','count','min','max','wait','valid','price','buffer'])if(k in c&&(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<0||c[k]>100000))fail();for(const k of ['history','excluded'])if(k in c){text(c[k],10000);try{P.dates(c[k])}catch{fail()}}for(const k of ['avoidWeekend','avoidHoliday'])if(k in c&&typeof c[k]!=='boolean')fail();if('start'in c)date(c.start)}
if(!s||![2,3].includes(s.version)||!Array.isArray(s.plans)||s.plans.length>200)fail();
if(s.version===2){config(s.config);text(s.activeId)}else{
  if(!['1','2'].includes(s.activeAccount)||!s.accounts||typeof s.accounts!=='object'||Array.isArray(s.accounts)||Object.keys(s.accounts).sort().join(',')!=='1,2')fail();
  for(const id of ['1','2']){const a=s.accounts[id];if(!a||typeof a!=='object')fail();config(a.config);text(a.activeId)}
}
let ids=new Set();for(const p of s.plans){if(!p||!Array.isArray(p.rows)||p.rows.length>5)fail();config(p.config);if(s.version===3&&!['1','2'].includes(p.accountId))fail();text(p.id);if(ids.has(p.id))fail();ids.add(p.id);date(p.start);const rowIds=new Set();for(const r of p.rows){if(!r)fail();text(r.id);if(rowIds.has(r.id))fail();rowIds.add(r.id);date(r.suggested);for(const k of ['purchaseDate','actualService','bookingDate'])date(r[k],true);if(r.order!==null){if(!Array.isArray(r.order)||r.order.length!==2)fail();r.order.forEach(x=>date(x));if(r.order[0]>r.order[1])fail()}if(r.orderDate!==undefined)date(r.orderDate,true);if(r.amount!==null&&(typeof r.amount!=='number'||!Number.isFinite(r.amount)||r.amount<0||r.amount>1000000||Math.abs(r.amount*100-Math.round(r.amount*100))>0.000001))fail();if(!Array.isArray(r.items)||r.items.length>100)fail();for(const item of r.items){text(item.name);text(item.category);text(item.unit,20);if(!categories.includes(item.category)||typeof item.quantity!=='number'||!Number.isFinite(item.quantity)||item.quantity<=0||item.quantity>100000)fail()}}}
if(s.version===2){if(s.plans.length&&!ids.has(s.activeId))fail()}else{
  for(const id of ['1','2']){const plans=s.plans.filter(p=>p.accountId===id),selected=s.accounts[id].activeId;if(plans.length?!plans.some(p=>p.id===selected):selected!=='')fail()}
}
return s;
}
function upgradeState(s){
  validateState(s);
  if(s.version===3)return s;
  return {version:3,activeAccount:'1',accounts:{'1':{config:{...s.config},activeId:s.plans.length?s.activeId:''},'2':{config:{},activeId:''}},plans:s.plans.map(p=>({...p,accountId:'1'}))};
}
const api={categories,summary,duplicates,bookingWarnings,validateState,upgradeState,purchase};if(typeof module!=='undefined')module.exports=api;root.Ledger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
