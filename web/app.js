'use strict';
const P=Planner,L=Ledger,$=id=>document.getElementById(id),KEY='jd-housekeeping-ledger-v2';
const defaults={start:'2026-09-30',span:60,count:5,min:1,max:3,wait:9,valid:7,price:65,buffer:1,avoidWeekend:true,avoidHoliday:true,history:'',excluded:''};
const nums=['span','count','min','max','wait','valid','price'],bools=['avoidWeekend','avoidHoliday','buffer'];
let state={version:3,activeAccount:'1',accounts:{'1':{config:{...defaults},activeId:''},'2':{config:{...defaults},activeId:''}},plans:[]},storageBlocked=false,pendingImport=null,timer;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('sv-SE');
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
const money=n=>n===null?'—':'¥'+n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const short=s=>s.slice(5,7)+'月'+s.slice(8,10)+'日';
const range=a=>a?short(a[0])+(a[0]===a[1]?'':' — '+short(a[1])):'首单已有权益';
const blankItem=()=>({name:'',category:'其他',quantity:1,unit:'件'});
const allRows=()=>state.plans.flatMap(p=>p.rows);
const account=()=>state.accounts[state.activeAccount];
const accountName=()=>state.activeAccount==='1'?'账号一':'账号二';
const accountPlans=()=>state.plans.filter(p=>p.accountId===state.activeAccount);
const accountRows=()=>accountPlans().flatMap(p=>p.rows);
const active=()=>accountPlans().find(p=>p.id===account().activeId);
function prepareState(raw,checkPlans=false){
  const next=L.mergeDuplicatePlans(L.upgradeState(raw));
  for(const a of Object.values(next.accounts))a.config={...defaults,...a.config};
  for(const p of next.plans){p.config={...defaults,...p.config,start:p.start};if(checkPlans)P.plan({...p.config,history:''})}
  return next;
}
function toast(s){$('toast').textContent=s;clearTimeout(timer);timer=setTimeout(()=>$('toast').textContent='',5500)}
function storageWarning(s){$('storageWarning').hidden=false;$('storageWarning').textContent=s}
function save(){if(storageBlocked)return;try{L.validateState(state);if(!window.ReactNativeWebView){const previous=localStorage.getItem(KEY);if(previous&&L.hasDuplicatePlans(JSON.parse(previous)))localStorage.setItem(KEY+'-before-plan-merge',previous)}localStorage.setItem(KEY,JSON.stringify(state));$('saveState').textContent='已保存到此浏览器'}catch(e){storageWarning('暂时无法保存到浏览器，请导出备份，以免关闭后丢失记录。');$('saveState').textContent='未能保存'}}
function setForm(c){c={...defaults,...c};$('start').value=c.start;nums.forEach(k=>$(k).value=c[k]);bools.forEach(k=>$(k).checked=!!c[k]);$('history').value=c.history||'';$('excluded').value=c.excluded||''}
function readForm(){const c={start:$('start').value,history:$('history').value,excluded:$('excluded').value};nums.forEach(k=>c[k]=Number($(k).value));bools.forEach(k=>c[k]=$(k).checked);c.buffer=+c.buffer;return c}
function mergeHistory(a,b){const counts=new Map();a.forEach(d=>counts.set(d,(counts.get(d)||0)+1));const used=new Map();const out=a.slice();for(const d of b){used.set(d,(used.get(d)||0)+1);if(used.get(d)>(counts.get(d)||0))out.push(d)}return out}
function generate(c,initial=false){
const old=accountPlans().find(p=>p.start===c.start),same=!!old,oldRows=old?.rows||[];
if(old&&(old.id!==account().activeId||old.rows.some(L.hasRecord))){account().activeId=old.id;account().config={...old.config};setForm(old.config);save();renderAll();if(!initial)toast('同日期的计划已存在，已合并到原轮次，原记录未改动。');return}
if(same&&oldRows.slice(c.count).some(r=>r.purchaseDate||r.actualService||r.items.some(i=>i.name)||r.amount!==null))throw Error('减少次数会移除已填写的记录。请保留次数，或更改首单日期建立下一轮。');
const known=accountRows().filter(r=>r.bookingDate&&r.bookingDate<c.start).map(r=>r.bookingDate);
const manual=P.dates(c.history).map(P.iso);const history=mergeHistory(known,manual).join(',');
const result=P.plan({...c,history});
const rows=result.rows.map((x,i)=>{const r={id:uid(),suggested:P.iso(x.date),order:x.order?.map(P.iso)||null,orderDate:x.order?P.iso(x.order[1]):'',items:[blankItem()],amount:null,purchaseDate:'',actualService:'',bookingDate:''};if(oldRows[i]){const old=oldRows[i];return {...r,...old,suggested:old.actualService?old.suggested:r.suggested,order:old.purchaseDate?old.order:r.order,orderDate:old.orderDate||r.orderDate}}return r});
if(same){old.config={...c};old.rows=rows;account().activeId=old.id}else{const p={id:uid(),accountId:state.activeAccount,start:c.start,config:{...c},rows};state.plans.push(p);account().activeId=p.id}
account().config={...c};save();renderAll();if(!initial)toast(same?'计划已更新，已填写的记录已保留。':'新计划已生成，旧计划仍可切换查看。')}
function renderDashboard(){
  const s=L.summary(allRows());
  $('metrics').innerHTML=[
    ['实际总花费',money(s.spent),'两个账号已确认购买的订单'],
    ['已上门',s.completed+' <small>次</small>',s.completed*2+' 小时赠送家政（按每次2小时）'],
    ['家政均摊',money(s.average),s.missingCost?s.priced+'次费用完整 · '+s.missingCost+'次待补费用':'已上门订单花费 ÷ 对应次数'],
    ['已购商品',s.groups.length+' <small>种</small>','按已购买的商品名称汇总'],
  ].map(([label,value,foot])=>'<div class="glass metric"><span class="metric-label">'+label+'</span><strong class="metric-value">'+value+'</strong><span class="metric-foot">'+foot+'</span></div>').join('');
  $('products').innerHTML=s.groups.length?'<div class="product-groups">'+s.groups.map(g=>'<div class="stock"><strong>'+esc(g.name)+'</strong><span class="quiet">最近购买 '+esc(g.lastDate)+'</span></div>').join('')+'</div>':'<div class="empty-stock">还没有已购买的商品。在下方填写商品名称和花费，保存后会自动汇总。</div>';
}
function itemHTML(item,i,row){return '<div class="item-row"><label>商品名称<input data-item="'+i+'" data-key="name" value="'+esc(item.name)+'" maxlength="200" placeholder="如：高露洁牙膏" aria-label="第'+(row+1)+'次商品'+(i+1)+'名称"></label><button class="remove-item" data-action="remove-item" data-item="'+i+'" title="移除此商品" aria-label="移除第'+(row+1)+'次商品'+(i+1)+'">×</button></div>'}
function renderCards(){const plan=active();if(!plan)return;$('schedule').innerHTML=plan.rows.map((r,i)=>{const date=r.actualService||r.suggested,day='日一二三四五六'[new Date(date+'T00:00:00Z').getUTCDay()];return `<article class="glass booking${r.actualService?' completed':''}" data-row="${esc(r.id)}"><div class="booking-head"><div class="visit-date"><span class="tag">第 ${String(i+1).padStart(2,'0')} 次 · ${r.actualService?'实际上门日期':'建议上门日期'}</span><strong>${short(date)}</strong><span class="weekday">${date.slice(0,4)} · 周${day}</span>${r.actualService?`<span class="original">原建议 ${r.suggested}</span>`:''}</div><div class="visit-actions">${r.actualService?'<span class="status-pill">已上门</span>':`<button class="primary" data-action="confirm-suggested">已按此日期上门</button>`}<details class="visit-edit"><summary>${r.actualService?'修改实际日期':'选择其他上门日期'}</summary><label>实际上门日期<input data-field="serviceInput" type="date" value="${r.actualService||r.suggested}" max="${today()}"></label><label>提交预约日期<input data-field="bookingInput" type="date" value="${r.bookingDate||r.actualService||r.suggested}" max="${today()}"></label><button data-action="confirm-date" class="primary">保存实际日期</button>${r.actualService?'<button class="danger-link" data-action="undo-service">撤销上门确认</button>':''}</details></div></div>${r.actualService?`<details class="completed-record"><summary><span>${esc(r.items.filter(x=>x.name.trim()).map(x=>x.name.trim()).join('、')||'商品待补充')}</span><strong>${r.purchaseDate&&r.amount!==null?money(r.amount):'费用待补充'}</strong><span class="expand-label">查看 / 编辑</span></summary>`:''}<div class="purchase-area"><div class="order-highlight"><div><span>${r.order?'建议下单时间段 · 区间内任选一天':'首单已持有家政券'}</span><strong>${range(r.order)}</strong></div>${r.order?`<div class="order-choose"><label>试选下单日<input data-field="orderDate" type="date" value="${esc(r.orderDate)}" min="${r.order[0]}" max="${r.order[1]}"></label></div>`:''}</div><div class="purchase-title"><h3>本次购买商品</h3><button class="add-item" data-action="add-item">＋ 添加商品</button></div><div class="items">${r.items.map((x,j)=>itemHTML(x,j,i)).join('')}</div><div class="purchase-footer"><label>实际购买日期<input data-field="purchaseInput" type="date" max="${today()}" value="${r.purchaseDate||today()}"></label><label>本次花费（元）<input class="money-input" data-field="amount" type="number" min="0" max="1000000" step="0.01" placeholder="${plan.config.price}" value="${r.amount===null?'':r.amount}"></label><button class="primary" data-action="save-purchase">${r.purchaseDate?'更新购买记录':'保存购买记录'}</button>${r.purchaseDate?`<span class="recorded">已购买 · ${money(r.amount)}</span><button class="danger-link" data-action="undo-purchase">撤销购买确认</button>`:''}</div><div class="duplicate" data-duplicate hidden></div><details class="help"><summary>预计送达与可预约时间</summary><div class="hint" data-estimate></div></details></div>${r.actualService?'</details>':''}</article>`}).join('');updateHints()}
function updateHints(){const plan=active();if(!plan)return;document.querySelectorAll('[data-row]').forEach(card=>{const r=plan.rows.find(x=>x.id===card.dataset.row);const dups=L.duplicates(r,allRows(),r.purchaseDate||r.orderDate||today());const d=card.querySelector('[data-duplicate]');d.hidden=!dups.length;d.textContent=dups.map(x=>`${x.date} 已买过「${x.name}」`).join('；')+'。30天内重复，买前确认是否需要。';const out=card.querySelector('[data-estimate]');if(r.orderDate){const est=P.delivery(P.day(r.orderDate),plan.config),f=a=>range(a.map(P.iso));out.innerHTML=`试选下单 ${esc(r.orderDate)}<br>预计送达：${f(est.arrival)}<br>券启用日期范围：${f(est.activation)}<br>券截止日期范围：${f(est.expiry)}<br>配送在设定范围内，均可提交预约：<strong>${f(est.common)}</strong><br>配送天数为估算，实际以商品页面为准。`}else out.innerHTML=`首券有效期：${range([plan.start,P.iso(P.day(plan.start)+plan.config.valid-1)])}<br>首单启用日反推送达：${P.iso(P.day(plan.start)-plan.config.wait)}。以实际券页面为准。`});renderWarnings()}
function renderWarnings(){const p=active();if(!p)return;let notices=[];const end=P.day(p.start)+p.config.span-1;const years=new Set(Array.from({length:p.config.span},(_,i)=>P.iso(P.day(p.start)+i).slice(0,4)));if([...years].some(y=>y!=='2026'))notices.push('本计划包含尚未收录假期的年份，请在设置中补充放假日期。');if(p.rows.some(r=>!r.purchaseDate&&r.order&&r.order[1]<today()))notices.push('部分建议下单区间已过去，请根据实际券状态调整计划。');
const records=accountRows().filter(r=>!p.rows.includes(r)&&r.bookingDate).concat(p.rows.map(r=>({...r,bookingDate:r.bookingDate||r.suggested})));
const manual=P.dates(p.config.history||'').map(P.iso);const actualDates=records.map(r=>r.bookingDate);const merged=mergeHistory(actualDates,manual);merged.slice(actualDates.length).forEach((date,i)=>records.push({id:'manual'+i,bookingDate:date}));
if(p.rows.some(r=>r.mergedFromPlanId))notices.push('同日期轮次已合并；重复轮次中填写过的记录也已保留，请核对，原轮次记录未覆盖。');
if(L.bookingWarnings(records,p.config.buffer).length)notices.push('实际预约与建议计划合并后存在30/60天次数冲突，后续日期请调整后再预约。');
for(const r of p.rows){if(r.bookingDate&&(r.bookingDate<planCoupon(r,p)[0]||r.bookingDate>planCoupon(r,p)[1]))notices.push(`${short(r.actualService||r.suggested)}的提交预约日期不在估算的共同有效期内，请核对实际券有效期。`);if(r.actualService&&(P.weekend(P.day(r.actualService))||holiday(r.actualService)))notices.push(`${short(r.actualService)}实际上门处于周末或已收录假期，可能加价。`)}
$('planWarnings').innerHTML=[...new Set(notices)].map(s=>`<div class="alert">${esc(s)}</div>`).join('');$('planSubtitle').textContent=`${p.start} — ${P.iso(end)} · ${p.rows.length}次计划`}
function holiday(s){return [['2026-01-01','2026-01-03'],['2026-02-15','2026-02-23'],['2026-04-04','2026-04-06'],['2026-05-01','2026-05-05'],['2026-06-19','2026-06-21'],['2026-09-25','2026-09-27'],['2026-10-01','2026-10-07']].some(([a,b])=>s>=a&&s<=b)}
function planCoupon(r,p){if(r.purchaseDate||r.orderDate)return P.delivery(P.day(r.purchaseDate||r.orderDate),p.config).common.map(P.iso);return [p.start,P.iso(P.day(p.start)+p.config.valid-1)]}
function renderAll(){
  renderDashboard();
  document.querySelectorAll('[data-account]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.account===state.activeAccount)));
  $('settingsAccount').textContent=accountName()+'设置';
  $('plansHeading').textContent=accountName()+'的预约';
  const plans=accountPlans();
  $('planSelect').innerHTML=plans.map((p,i)=>`<option value="${esc(p.id)}"${p.id===account().activeId?' selected':''}>${p.start} · 第${i+1}轮</option>`).join('');
  $('planSelect').closest('label').hidden=!plans.length;
  if(active())renderCards();else{
    $('planWarnings').innerHTML='';$('planSubtitle').textContent='还没有预约计划';
    $('schedule').innerHTML=`<div class="glass empty-account">${accountName()}尚未添加记录，请在上方“预约计划”中设置日期并生成计划。</div>`;
  }
}
function switchAccount(id){
  if(!['1','2'].includes(id)||id===state.activeAccount)return;
  state.activeAccount=id;setForm(account().config);renderAll();
  $('settingsDetails').open=!active();save();
}
$('accountSwitch').addEventListener('click',e=>{const button=e.target.closest('[data-account]');if(button)switchAccount(button.dataset.account)});
function getRow(el){return active()?.rows.find(r=>r.id===el.closest('[data-row]')?.dataset.row)}
function validDate(date,label){P.day(date);if(date>today())throw Error(label+'不能是未来日期；当天完成后再确认。')}
function confirmService(r,service,booking){validDate(service,'实际上门日期');validDate(booking,'提交预约日期');if(booking>service)throw Error('提交预约日期不能晚于实际上门日期。');r.actualService=service;r.bookingDate=booking;save();renderAll();toast('已记录实际上门日期。')}
$('schedule').addEventListener('input',e=>{const el=e.target,r=getRow(el);if(!r)return;if(el.dataset.key==='name'){r.items[Number(el.dataset.item)].name=el.value;save();renderDashboard();updateHints()}else if(el.dataset.key==='quantity'&&el.checkValidity()&&el.value){r.items[Number(el.dataset.item)].quantity=Number(el.value);save();renderDashboard();updateHints()}else if(el.dataset.field==='amount'&&(el.value===''||el.checkValidity())){r.amount=el.value===''?null:Number(el.value);save();renderDashboard()}});
$('schedule').addEventListener('change',e=>{const el=e.target,r=getRow(el);if(!r)return;try{if(el.dataset.item!==undefined&&el.dataset.key){let value=el.value;const key=el.dataset.key;if(key==='quantity'){value=Number(value);if(!Number.isInteger(value)||value<=0||value>100000)throw Error('商品数量请填1～100000的整数。')}r.items[Number(el.dataset.item)][key]=value;save();renderDashboard();updateHints()}else if(el.dataset.field==='amount'){if(el.value==='')r.amount=null;else{const n=Number(el.value);if(!el.checkValidity()||!Number.isFinite(n)||n<0)throw Error('花费请填写非负金额，最多两位小数。');r.amount=n}save();renderDashboard()}else if(el.dataset.field==='orderDate'){if(!el.checkValidity()||!el.value)throw Error('请在建议下单区间内选择日期。');r.orderDate=el.value;save();updateHints()}else if(el.dataset.field==='serviceInput'){const booking=el.closest('[data-row]').querySelector('[data-field="bookingInput"]');if(!r.actualService)booking.value=el.value}}catch(err){toast(err.message)}});
$('schedule').addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button)return;const r=getRow(button),card=button.closest('[data-row]');if(!r)return;try{switch(button.dataset.action){case 'add-item':if(r.items.length>=100)throw Error('每单最多100种商品。');r.items.push(blankItem());save();renderCards();break;case 'remove-item':r.items.splice(Number(button.dataset.item),1);if(!r.items.length)r.items.push(blankItem());save();renderAll();break;case 'confirm-suggested':confirmService(r,r.suggested,r.suggested);break;case 'confirm-date':confirmService(r,card.querySelector('[data-field="serviceInput"]').value,card.querySelector('[data-field="bookingInput"]').value);break;case 'undo-service':r.actualService='';r.bookingDate='';save();renderAll();toast('已撤销，原建议日期已恢复。');break;case 'save-purchase':{const items=[...card.querySelectorAll('.item-row')].map(el=>Object.fromEntries([...el.querySelectorAll('[data-key]')].map(input=>[input.dataset.key,input.value])));const result=L.purchase(r,{date:card.querySelector('[data-field="purchaseInput"]').value,amount:card.querySelector('[data-field="amount"]').value,items},today());Object.assign(r,result);save();renderAll();toast('购买记录已保存，看板已更新。');break}case 'undo-purchase':r.purchaseDate='';save();renderAll();toast('已撤销购买确认，商品和金额保留为草稿。');break}}catch(err){toast(err.message)}});
$('form').addEventListener('submit',e=>{e.preventDefault();try{generate(readForm())}catch(err){toast(err.message)}});
$('planSelect').addEventListener('change',()=>{account().activeId=$('planSelect').value;account().config={...active().config};setForm(account().config);save();renderAll()});
function downloadBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='京东家政记录-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出，请保存好文件。')}
$('export').onclick=downloadBackup;$('import').onclick=()=>$('importFile').click();
$('importFile').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>5000000)throw Error('备份文件过大，请选择本工具导出的JSON文件。');const next=prepareState(JSON.parse(await f.text()),true);pendingImport=next;$('importDescription').textContent=`备份包含${next.plans.length}轮计划、${next.plans.flatMap(p=>p.rows).length}条家政记录。`;$('importDialog').showModal()}catch(err){toast('无法导入：'+err.message)}finally{e.target.value=''}});
$('cancelImport').onclick=()=>{pendingImport=null;$('importDialog').close()};$('confirmImport').onclick=()=>{if(!pendingImport)return;state=pendingImport;pendingImport=null;storageBlocked=false;$('storageWarning').hidden=true;$('importDialog').close();setForm(account().config);save();renderAll();$('settingsDetails').open=!active();toast('备份已导入。')};
try{const raw=localStorage.getItem(KEY);if(raw){const parsed=JSON.parse(raw);state=prepareState(parsed);if(L.hasDuplicatePlans(parsed))save()}}catch{storageBlocked=true;storageWarning('浏览器中的旧记录无法读取，已暂停自动保存以保护原数据。可导入有效备份恢复；当前修改请先导出备份。')}
setForm(account().config);if(!state.plans.length&&state.activeAccount==='1')generate(account().config,true);else renderAll();if(matchMedia('(max-width:850px)').matches)$('settingsDetails').open=!active();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_housekeeping_summary',title:'查看家政支出汇总',description:'读取当前浏览器记录的家政费用、完成次数和商品名称，不修改数据。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).length)throw Error('不接受参数');return L.summary(allRows())}})).catch(()=>{})}catch{}}
