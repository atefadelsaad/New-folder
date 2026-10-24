
const GOV=['الإسكندرية','القاهرة','الجيزة','البحيرة','مطروح','الغربية','الدقهلية','الشرقية','المنوفية','كفر الشيخ','دمياط','بورسعيد'];
const R={admin:'IT Manager',head:'Technical Head',area:'Area Manager',store:'Warehouse Keeper',senior:'Senior Technical',junior:'Junior Technical'};
const CAN={addBranch:['admin','head'],stock:['admin','head','store'],view:['admin','head','senior','area','store'],review:['admin','head','senior'],reject:['admin','head','area','store'],edit:['admin','head','area','store'],delRecv:['admin','head'],request:['admin','head','senior','junior'],branchEdit:['admin','head','senior'],approve:['admin','head','area'],release:['admin','head','store'],pool:['admin','head']};
const ICO={
 stock:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
 maint:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.9-2.9 2-2.2z"/>',
 scrap:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6M14 11v6"/>',
 recvsup:'<path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 recvbr:'<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/>',
 issbr:'<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
 br:'<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
 items:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 cats:'<path d="M20.6 13.4L12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.6H20a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.6 1.4z"/><circle cx="17" cy="7" r="1.5"/>',
 sup:'<path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11h6v10"/><path d="M7 12h2M7 16h2M17 15h2"/>',
 rq:'<path d="M9 4h6v3H9z"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M8 11h8M8 15h5"/>',
 reqbr:'<path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/><path d="M9 3h6"/>',
 laptop:'<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
 printer:'<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
 network:'<rect x="3" y="14" width="6" height="6" rx="1"/><rect x="15" y="14" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><path d="M12 9v5M6 14v-3h12v3"/>',
 monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
 tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.9-2.9 2-2.2z"/>',
 box:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'
};
ICO.issmaint=ICO.maint;
function icon(k){return `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICO[k]||ICO.box}</svg></span>`}
function catIcon(c){const s=String(c||'').toLowerCase();if(/لابتوب|laptop|نوت|notebook|كمبيوتر|computer|حاسب|pc/.test(s))return icon('laptop');if(/طابع|printer/.test(s))return icon('printer');if(/شاش|monitor|screen/.test(s))return icon('monitor');if(/موبايل|هاتف|phone|mobile|تابلت|tablet/.test(s))return icon('phone');if(/شبك|راوتر|network|router|سويتش|switch|سلك/.test(s))return icon('network');if(/صيان|tool|معدات|أدوات/.test(s))return icon('tool');return icon('box')}
const ST={review:['بانتظار مراجعة السينيور',''],pending:['بانتظار مدير المنطقة',''],approved:['بانتظار مسؤول المخزن',''],released:['تم الصرف','ok'],rejected:['مرفوض','bad']};
const MRES=[['stock','تم إصلاحه'],['scrap','رفض الصيانة']];
const SM={stock:'مخزون',maint:'تحت الصيانة',scrap:'خردة'};
const SRC={in:{sup:'من مورد',maint:'من صيانة',br:'من فرع'},out:{sup:'إلى مورد الصيانة',br:'إلى فرع'}};
const STATE={token:localStorage.getItem('wh_token')||'',user:null};
let CATS=[];const SER={};const CATINFO={};
let items=[],branches=[],reqs=[],suppliers=[],DB={in:[],out:[]},MAINT={},SCRAP={},SCRAPLOG=[];
let supEdit=null,pendSup=null;
let role='junior',tab='stock',sel=null,q='',branchEditState=null;
const SEARCH={itemsSearch:'',scrapQ:'',supSearch:'',branchSearch:'',maintQ:'',rqQ:'',rqbSearch:''};
const normSearch=(a,b)=>{const n=String(a||'').toLowerCase();const x=String(b||'').toLowerCase();return n.includes(x);};
const matchSearch=(arr,fields,txt)=>{const w=String(txt||'').trim();if(!w)return arr;return arr.filter(i=>fields.some(f=>normSearch(i[f],w)));};
const _deb={};
function debouncedSearch(name,val,pageVar){clearTimeout(_deb[name]);_deb[name]=setTimeout(()=>{SEARCH[name]=String(val||'');if(pageVar)window[pageVar]=1;go();setTimeout(()=>{const el=document.getElementById('s_'+name);if(el){el.focus();el.selectionStart=el.selectionEnd=el.value.length;}});},200);}
function clearSearch(name,pageVar){clearTimeout(_deb[name]);SEARCH[name]='';if(pageVar)window[pageVar]=1;go();setTimeout(()=>{const el=document.getElementById('s_'+name);if(el){el.focus();el.value='';}});}
const $=s=>document.querySelector(s);
const e=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ok=a=>CAN[a].includes(role);
const it=id=>items.find(i=>i.id==id);
const br=id=>branches.find(b=>b.id==id);
const dist=id=>branches.reduce((a,b)=>a+(b.q[id]||0),0);
const isoToday=()=>new Date().toLocaleDateString('en-CA');
const ARD={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
function dispDate(s){
  if(!s)return '';
  const raw=String(s).replace(/[\u200e\u200f\u061c]/g,'');
  let m=raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  const latin=raw.replace(/[٠-٩]/g,c=>ARD[c]||c);
  m=latin.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:raw;
}
const dcell=s=>s?`<span class="dt">${e(dispDate(s))}</span>`:'';
function warrantyBadge(id){const x=it(id);if(!x||!x.w)return '<span class="chip">بدون ضمان</span>';return x.w>=isoToday()?`<span class="chip ok">ضمان حتى ${dcell(x.w)}</span>`:`<span class="chip bad">انتهى الضمان ${dcell(x.w)}</span>`}
const opts=(a,sel)=>a.map(x=>`<option${x==sel?' selected':''}>${e(x)}</option>`).join('');
let pendDel=null,editId=null,pend=null,ui=null,catEdit=null,pendCat=null,stockLoc=null,maintView=null,MA=null,scrapMode=null,SCR=null,scrapBal=false;

let BUSY=0;
async function api(path,method='GET',body){
  BUSY++;document.documentElement.classList.add('busy');
  try{
    const headers=Object.assign({'Content-Type':'application/json'},STATE.token?{'Authorization':'Bearer '+STATE.token}:{});
    const res=await fetch('/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    let data={};try{data=await res.json()}catch(_){}
    if(!res.ok){const err=new Error(data.error||('خطأ '+res.status));err.status=res.status;throw err}
    return data;
  }finally{
    if(!--BUSY)document.documentElement.classList.remove('busy');
  }
}
function toast(m){const t=$('#t');t.textContent=m;t.className='show';setTimeout(()=>t.className='',2600)}

function renderLogin(msg){
  $('#nav').innerHTML='';$('#roleBar').innerHTML='';
  $('#m').innerHTML=`<div class="box" style="max-width:360px;margin:40px auto"><h2>تسجيل الدخول</h2>
   <label style="margin-bottom:8px">اسم المستخدم<input id="lu" autocomplete="username" onkeydown="if(event.key==='Enter')login()"></label>
   <label>كلمة المرور<input type="password" id="lp" autocomplete="current-password" onkeydown="if(event.key==='Enter')login()"></label>
   <button class="btn" style="margin-top:12px" onclick="login()">دخول</button>${msg?`<p style="color:var(--bad);margin-bottom:0">${e(msg)}</p>`:''}</div>`;
}
async function login(){
  const u=($('#lu')||{}).value||'',p=($('#lp')||{}).value||'';
  try{
    const d=await api('/auth/login','POST',{username:u.trim(),password:p});
    STATE.token=d.token;STATE.user=d.user;localStorage.setItem('wh_token',d.token);
    tab='stock';sel=null;stockLoc=null;await boot();
  }catch(err){renderLogin(err.message)}
}
function logout(){STATE.token='';STATE.user=null;localStorage.removeItem('wh_token');renderLogin()}
let BUILD='';
async function checkBuild(){
  try{
    const r=await fetch('/version',{cache:'no-store'});
    const d=await r.json();
    if(BUILD&&d.build!==BUILD){location.reload();return}
    BUILD=d.build;
    const v=$('#ver');if(v)v.textContent='build '+String(d.build).slice(-6);
  }catch(err){}
}
setInterval(()=>{if(STATE.token)checkBuild()},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&STATE.token)checkBuild()});
async function boot(){
  if(!STATE.token)return renderLogin();
  checkBuild();
  try{const d=await api('/bootstrap');hydrate(d);go()}
  catch(err){STATE.token='';STATE.user=null;localStorage.removeItem('wh_token');renderLogin(err.status===401?'انتهت الجلسة، سجّل الدخول من جديد':err.message)}
}
function hydrate(d){
  STATE.user=d.user;role=d.user.role;
  const wasEmpty=!items.length;
  items=d.items;branches=d.branches;reqs=d.requests;suppliers=d.suppliers;DB={in:d.vouchers.in,out:d.vouchers.out};
  MAINT={};SCRAP={};(d.maintenance||[]).forEach(r=>MAINT[r.i]=r.q);(d.scrap||[]).forEach(r=>SCRAP[r.i]=r.q);SCRAPLOG=d.scrapLog||[];
  CATS=d.categories.map(c=>c.name);
  Object.keys(SER).forEach(k=>delete SER[k]);Object.keys(CATINFO).forEach(k=>delete CATINFO[k]);
  d.categories.forEach(c=>{SER[c.name]=c.has_serial;CATINFO[c.name]={sup:c.supplier||'',by:c.by||'',d:c.d||''}});
  if(wasEmpty)Object.keys(DS).forEach(key=>{DR[key]=nd(key);E[key]=null});
  $('#roleBar').innerHTML=`<span>${e(d.user.name)} · ${e(R[role]||role)}</span><button class="btn ghost" onclick="logout()">خروج</button>`;
}
async function refresh(){const d=await api('/bootstrap');hydrate(d)}

function grid(p){return '<div class="grid">'+items.map(i=>`<label>${e(i.n)}<input type="number" min="0" id="${p}${i.id}" placeholder="0"></label>`).join('')+'</div>'}
function read(p){const o={};items.forEach(i=>{const el=$('#'+p+i.id);const v=el?+el.value:0;if(v>0)o[i.id]=v});return o}
function itemPick(p){return CATS.map(c=>{const g=items.filter(i=>i.c==c);return g.length?`<div style="margin-bottom:8px"><b>${e(c)}</b><div class="grid">`+g.map(i=>`<label class="ln"><input type="checkbox" id="${p}${i.id}"> ${e(i.n)}</label>`).join('')+'</div></div>':''}).join('')||'<p class="mut">لا توجد أصناف.</p>'}
function readPick(p){return items.filter(i=>{const el=$('#'+p+i.id);return el&&el.checked}).map(i=>i.id)}

function go(){
  const todo=reqs.filter(r=>(r.st=='review'&&ok('review'))||(r.st=='pending'&&ok('approve'))||(r.st=='approved'&&ok('release'))).length;
  const tabs=[['stock','الأصناف والمخزن'],['maint','تحت الصيانة'],['scrap','الخردة'],['recvsup','استلام من مورد'],['recvbr','استلام من فرع'],['issbr','صرف إلى فرع'],['br','الفروع'],['items','إدارة الأصناف'],['cats','الفئات'],['sup','الموردون'],['rq','الطلبات'+(todo?` (${todo})`:'')],['reqbr','متطلبات الفروع']].filter(t=>t[0]=='rq'||((t[0]=='items'||t[0]=='recvsup'||t[0]=='recvbr'||t[0]=='issbr'||t[0]=='sup'||t[0]=='cats')?ok('stock'):ok('view')));if(!tabs.some(t=>t[0]==tab))tab='rq';$('#nav').innerHTML=tabs.map(([k,v])=>`<button class="${tab==k?'on':''}" onclick="tab='${k}';sel=null;maintView=null;scrapMode=null;SCR=null;scrapBal=false;go()">${icon(k)}<span>${v}</span></button>`).join('');
  $('#m').innerHTML=tab=='stock'?vStock():tab=='maint'?(maintView==='out'?vDoc('issmaint'):vMaint()):tab=='scrap'?vScrap():tab=='recvsup'?vDoc('recvsup'):tab=='recvbr'?vDoc('recvbr'):tab=='issbr'?vDoc('issbr'):tab=='items'?vItems():tab=='cats'?vCats():tab=='sup'?vSuppliers():tab=='br'?(sel?vBranch():vBranches()):tab=='reqbr'?vBranchReqs():vReqs();
  if(tab=='stock')tbl();
}

function vItems(){
  const adm=role=='admin',cs=i=>opts(CATS.includes(i.c)?CATS:[...CATS,i.c],i.c);
  return `<div class="box"><h3>إضافة صنف جديد</h3><div class="row"><label>اسم الصنف<input id="nn"></label><label>الفئة<select id="nc">${opts(CATS)}</select></label><label>انتهاء الضمان (اختياري)<input type="date" id="nw"></label><button class="btn" onclick="newItem()">حفظ الصنف</button></div>
  <p class="mut" style="margin:10px 0 0">تُضاف الكميات من أذون الاستلام فقط، ولا يمكن إدخال رصيد يدويًا. يوضّح عمود الضمان إن كان الصنف تحت الضمان وتاريخ انتهائه.</p></div>
  <div class="box tw"><h3>الأصناف (${items.length})</h3><table><tr><th>الفئة</th><th>الصنف</th><th>رصيد المخزن</th><th>الضمان</th><th>أضافه</th><th></th></tr>`+items.map(i=>editId==i.id
   ?`<tr><td><select id="eic">${cs(i)}</select></td><td><input id="ein" value="${e(i.n)}"></td><td>${i.s}</td><td><input type="date" id="eiw" value="${e(i.w)}"></td><td class="mut">${e(i.by||'-')}</td><td><div class="acts"><button class="btn" onclick="saveItem(${i.id})">تأكيد</button><button class="btn ghost" onclick="editId=null;go()">إلغاء</button></div></td></tr>`
   :`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${i.s}</td><td>${warrantyBadge(i.id)}</td><td class="mut">${e(i.by||'-')}</td><td><div class="acts"><button class="btn ghost" onclick="editId=${i.id};pendDel=null;go()">تعديل</button>${adm?`<button class="btn bad" onclick="del(${i.id})">${pendDel==i.id?'تأكيد الحذف':'حذف'}</button>`:''}</div></td></tr>`).join('')+'</table></div>';
}
function vCats(){
  return `<div class="box"><h3>إضافة فئة</h3><div class="row">
   <label style="min-width:220px">اسم الفئة<input id="cn"></label>
   <label style="min-width:200px">المورد<select id="csu">${supplierOptions('')}</select></label>
   <label>السيريال<select id="cs"><option value="yes">يوجد سيريال</option><option value="no">بدون سيريال</option></select></label>
   <button class="btn" onclick="addCat()">إضافة فئة</button></div>
   <p class="mut" style="margin:10px 0 0">الفئة تحتفظ باسمها وبالمورد. أضف الأنواع داخلها لتظهر عند اختيار الفئة في أذون الاستلام والصرف.</p></div>`+
  (CATS.length?CATS.map((c,k)=>{
    const its=items.filter(i=>i.c==c),ed=catEdit==k,info=CATINFO[c]||{};
    return `<div class="box"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
     ${ed?`<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="cen" value="${e(c)}"><select id="cse" style="min-width:180px">${supplierOptions(info.sup||'')}</select><button class="btn" onclick="saveCat(${k})">تأكيد</button><button class="btn ghost" onclick="catEdit=null;go()">إلغاء</button></span>`
        :`<div><h3 style="margin:0">${catIcon(c)} ${e(c)} <button class="chip ${SER[c]?'ok':''}" style="border:0;cursor:pointer;font-family:inherit" onclick="togSer(${k})">${SER[c]?'بسيريال':'بدون سيريال'}</button></h3><div class="mut" style="margin-top:4px">المورد: ${e(info.sup||'-')} · تاريخ الإنشاء: ${info.d?dcell(info.d):'-'} · أنشأها: ${e(info.by||'-')}</div></div>`}
     ${ed?'':`<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="mut">${its.length} نوع · ${its.reduce((a,i)=>a+i.s,0)} بالمخزن</span><button class="btn ghost" onclick="catEdit=${k};pendCat=null;go()">تعديل الاسم</button><button class="btn bad" onclick="delCat(${k})">${pendCat==k?'تأكيد الحذف':'حذف الفئة'}</button></span>`}</div>
     ${its.length?`<div class="tw" style="margin-top:8px"><table><tr><th>النوع</th><th>رصيد المخزن</th><th>في الفروع</th><th></th></tr>`+its.map(i=>`<tr><td>${editId==i.id?`<input id="ein" value="${e(i.n)}">`:e(i.n)}</td><td>${i.s}</td><td>${dist(i.id)}</td><td>${editId==i.id?`<div class="acts"><button class="btn" onclick="saveItem(${i.id})">تأكيد</button><button class="btn ghost" onclick="editId=null;go()">إلغاء</button></div>`:`<button class="btn ghost" onclick="editId=${i.id};go()">تعديل الاسم</button>`}</td></tr>`).join('')+'</table></div>':'<p class="mut" style="margin:8px 0 0">لا توجد أنواع في هذه الفئة بعد.</p>'}
     <div class="row" style="margin-top:10px"><label>اسم النوع<input id="cin${k}"></label><button class="btn" onclick="addItemTo(${k})">إضافة نوع للفئة</button></div></div>`;
  }).join(''):'<p class="mut">لا توجد فئات بعد.</p>');
}
async function addItemTo(k){
  const c=CATS[k],nm=(($('#cin'+k)||{}).value||'').trim();
  if(!nm)return toast('اكتب اسم الصنف');
  try{await api('/items','POST',{name:nm,category:c});await refresh();toast('تمت إضافة الصنف إلى '+c);go()}catch(err){toast(err.message)}
}
async function saveCat(k){
  const old=CATS[k],n=(($('#cen')||{}).value||'').trim();
  if(!n)return toast('اكتب اسم الفئة');
  const sup=(($('#cse')||{}).value||'').trim();
  try{await api('/categories/'+encodeURIComponent(old),'PUT',{name:n,has_serial:SER[old],supplier:sup});catEdit=null;await refresh();toast('تم حفظ الفئة');go()}catch(err){toast(err.message)}
}
async function delCat(k){
  const c=CATS[k];
  if(pendCat!=k){pendCat=k;toast('اضغط تأكيد الحذف للمتابعة');return go()}
  try{await api('/categories/'+encodeURIComponent(c),'DELETE');pendCat=null;await refresh();toast('تم حذف الفئة وأنواعها');go()}catch(err){pendCat=null;toast(err.message);go()}
}
async function addCat(){
  const n=$('#cn').value.trim();
  if(!n)return toast('اكتب اسم الفئة');
  if(CATS.includes(n))return toast('الفئة موجودة بالفعل');
  try{await api('/categories','POST',{name:n,has_serial:$('#cs').value=='yes',supplier:(($('#csu')||{}).value||'').trim()});await refresh();toast('تمت إضافة الفئة');go()}catch(err){toast(err.message)}
}
async function togSer(k){if(!ok('stock'))return;const name=CATS[k];
  try{await api('/categories/'+encodeURIComponent(name),'PUT',{has_serial:!SER[name]});await refresh();toast('تم تغيير خاصية السيريال للفئة');go()}catch(err){toast(err.message)}}
async function saveItem(id){
  const n=$('#ein').value.trim();
  if(!n)return toast('اسم الصنف لا يمكن أن يكون فارغًا');
  const el=$('#eic'),body={name:n};if(el)body.category=el.value;
  const w=$('#eiw');if(w)body.warranty_until=w.value||'';
  try{await api('/items/'+id,'PUT',body);editId=null;await refresh();toast('تم حفظ التعديل');go()}catch(err){toast(err.message)}
}
async function del(id){
  if(role!='admin')return;const i=it(id);
  if(pendDel!=id){pendDel=id;toast('اضغط تأكيد الحذف للمتابعة');return go()}
  try{await api('/items/'+id,'DELETE');pendDel=null;await refresh();toast('تم حذف الصنف');go()}catch(err){pendDel=null;toast(err.message);go()}
}
async function newItem(){
  const n=$('#nn').value.trim();if(!n)return toast('اكتب اسم الصنف');
  try{await api('/items','POST',{name:n,category:$('#nc').value,warranty_until:($('#nw')||{}).value||''});await refresh();toast('تمت إضافة الصنف');go()}catch(err){toast(err.message)}
}

const DS={recvsup:{dir:'in',kind:'sup',t:'استلام من مورد'},recvbr:{dir:'in',kind:'br',t:'استلام من فرع'},issbr:{dir:'out',kind:'br',t:'صرف إلى فرع'},issmaint:{dir:'out',kind:'sup',t:'صرف إلى مورد الصيانة'}};
let docKey='recvsup';
const KK=()=>docKey;
const hasSer=id=>{const x=it(id);return !!(x&&SER[x.c])};
const nl=(dir=DS[KK()].dir)=>{const p=dir=='out'?items.filter(i=>i.s>0):items;return {i:p.length?p[0].id:'',q:1,sns:[''],st:'stock',rs:'',nt:'',hw:false,wu:''}};
const nd=key=>{const S=DS[key];return {k:S.kind,sup:'',b:branches[0]?branches[0].id:null,p:'',sb:'',lines:[nl(S.dir)]}};
const DR={},E={};Object.keys(DS).forEach(key=>{DR[key]=nd(key);E[key]=null});
function partyName(r){const b=br(r.b);return r.k=='br'?(b?b.n:'فرع غير محدد'):(r.sup||'مورد غير محدد')}
function registeredSuppliers(){const used=[...DB.in,...DB.out].map(r=>String(r.sup||'').trim()).filter(Boolean);return [...new Set([...suppliers.map(s=>s.n),...used])]}
function supplierOptions(selected){const names=registeredSuppliers();if(selected&&!names.includes(selected))names.push(selected);const body=names.length?names.map(n=>`<option value="${e(n)}"${n==selected?' selected':''}>${e(n)}</option>`).join(''):'<option value="">لا يوجد موردون مسجلون بعد</option>';return '<option value="">اختر موردًا مسجلاً</option>'+body}
function supRows(){
  const rows=suppliers.map(s=>({...s})),have=new Set(rows.map(r=>r.n));
  [...DB.in,...DB.out].forEach(v=>{const n=String(v.sup||'').trim();if(n&&!have.has(n)){have.add(n);rows.push({n,used:true})}});
  return rows.sort((a,b)=>String(a.n).localeCompare(String(b.n),'ar'));
}
function vSuppliers(){
  const rows=supRows(),ed=supEdit;
  return `<div class="box"><h3>${ed?'تعديل مورد':'إضافة مورد جديد'}</h3><div class="grid">
   <label>اسم المورد<input id="supName" placeholder="اسم المورد أو جهة الصيانة" value="${ed?e(ed.n):''}"></label>
   <label>اسم الشركة<input id="supCompany" value="${ed?e(ed.company||''):''}"></label>
   <label>العنوان<input id="supAddress" value="${ed?e(ed.address||''):''}"></label>
   <label>هاتف الشركة<input id="supPhone" value="${ed?e(ed.phone||''):''}"></label>
   <label>التليفون الأرضي<input id="supLandline" value="${ed?e(ed.landline||''):''}"></label>
   <label class="ln"><input type="checkbox" id="supMaint"${ed&&ed.maint?' checked':''}> يقبل الصيانة</label>
  </div><div class="row"><button class="btn" onclick="saveSup()">${ed?'حفظ التعديل':'حفظ المورد'}</button>${ed?'<button class="btn ghost" onclick="supEdit=null;go()">إلغاء</button>':''}</div>
   <p class="mut" style="margin:10px 0 0">تُستخدم أسماء الموردين المسجلين في أذون الاستلام والصرف. تاريخ الإنشاء واسم المُنشئ يُسجَّلان تلقائيًا.</p></div>
  <div class="box tw"><h3>الموردون (${rows.length})</h3>${rows.length
   ?'<table><tr><th>اسم المورد</th><th>الشركة</th><th>العنوان</th><th>هاتف الشركة</th><th>الأرضي</th><th>يقبل الصيانة</th><th>أُنشئ بواسطة</th><th>تاريخ الإنشاء</th><th></th></tr>'+rows.map(r=>`<tr><td>${e(r.n)}${r.used?' <span class="chip">من الأذونات</span>':''}</td><td>${e(r.company||'-')}</td><td>${e(r.address||'-')}</td><td>${e(r.phone||'-')}</td><td>${e(r.landline||'-')}</td><td>${r.maint?'<span class="chip ok">نعم</span>':'لا'}</td><td>${e(r.by||'-')}</td><td>${r.d?dcell(r.d):'-'}</td><td>${r.id?`<div class="acts"><button class="btn ghost" onclick="editSup(${r.id})">تعديل</button>${role=='admin'?`<button class="btn bad" onclick="delSup(${r.id})">${pendSup==r.id?'تأكيد الحذف':'حذف'}</button>`:''}</div>`:''}</td></tr>`).join('')+'</table>'
   :'<p class="mut">لا يوجد موردون مسجلون بعد.</p>'}</div>`;
}
function editSup(id){supEdit=suppliers.find(s=>s.id==id)||null;pendSup=null;go()}
async function saveSup(){
  const name=(($('#supName')||{}).value||'').trim();
  if(!name)return toast('اكتب اسم المورد');
  const body={name,company:(($('#supCompany')||{}).value||'').trim(),address:(($('#supAddress')||{}).value||'').trim(),phone:(($('#supPhone')||{}).value||'').trim(),landline:(($('#supLandline')||{}).value||'').trim(),accepts_maintenance:!!(($('#supMaint')||{}).checked)};
  const editing=!!supEdit;
  if(!editing&&registeredSuppliers().includes(name))return toast('المورد مسجل بالفعل');
  try{
    if(editing)await api('/suppliers/'+supEdit.id,'PUT',body);else await api('/suppliers','POST',body);
    supEdit=null;await refresh();toast(editing?'تم حفظ المورد':'تمت إضافة المورد');go();
  }catch(err){toast(err.message)}
}
async function delSup(id){
  if(role!='admin')return;
  if(pendSup!=id){pendSup=id;toast('اضغط تأكيد الحذف للمتابعة');return go()}
  try{await api('/suppliers/'+id,'DELETE');pendSup=null;await refresh();toast('تم حذف المورد');go()}catch(err){pendSup=null;toast(err.message);go()}
}
function fixSn(l){const n=hasSer(l.i)?Math.min(l.q||0,200):0;while(l.sns.length<n)l.sns.push('');l.sns.length=n}
function longestSerial(){let m=0;for(const r of DB.in.concat(DB.out))for(const l of r.lines)for(const s of (l.sns||[]))m=Math.max(m,String(s||'').length);return m}
function snCols(values){
  const m=Math.max(longestSerial(),...values.map(s=>String(s||'').length));
  const w=Math.max(16,Math.min(m+2,30));
  return `repeat(auto-fill,${w}ch)`;
}
function snGrid(sns){return 'grid-template-columns:'+snCols(sns)}
function snGrow(el){const g=el.closest('.sngrid');if(g)g.style.gridTemplateColumns=snCols([...g.querySelectorAll('input')].map(i=>i.value))}
function snList(sns){
  const m=Math.max(0,...sns.map(s=>String(s||'').length));
  const w=Math.max(10,Math.min(m+2,30));
  return `<div class="snlist" style="min-width:${w}ch">${sns.map(s=>`<span class="snchip">${e(s)}</span>`).join('')}</div>`;
}
function vStock(){
  if(stockLoc!==null&&!br(stockLoc))stockLoc=null;
  const locs=[{id:null,n:'المخزن'}].concat(branches.map(b=>({id:b.id,n:b.n})));
  const btns=locs.map(l=>`<button class="btn ${stockLoc===l.id?'':'ghost'}" onclick="stockLoc=${l.id===null?'null':l.id};go()">${l.id===null?icon('stock'):icon('br')}${e(l.n)}</button>`).join('');
  return `<div class="row" style="margin-bottom:12px">${btns}</div>
    <input id="s_itemsSearch" class="search" placeholder="${stockLoc===null?'ابحث باسم الصنف أو الفئة':'ابحث في أصناف الفرع'}" value="${e(SEARCH.itemsSearch)}" oninput="debouncedSearch('itemsSearch',this.value,'P')"><button onclick="clearSearch('itemsSearch','P')" aria-label="مسح">×</button><div class="box tw" id="tb"></div>`;
}
function tbl(){
  const q=SEARCH.itemsSearch;const f=items.filter(i=>(i.n+i.c).includes(q));
  if(stockLoc===null){
    $('#tb').innerHTML=f.length?`<table><tr><th>الفئة</th><th>الصنف</th><th>رصيد المخزن</th><th>الحالة</th></tr>`+f.map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${i.s}</td><td><span class="chip ${i.s>0?'ok':'bad'}">${i.s>0?'متوفر':'غير متوفر'}</span></td></tr>`).join('')+'</table>':'<p class="mut">لا توجد أصناف مطابقة. جرّب كلمة أخرى.</p>';
    return;
  }
  const b=br(stockLoc),rows=f.filter(i=>b.q[i.id]!=null);
  $('#tb').innerHTML=rows.length?`<table><tr><th>الفئة</th><th>الصنف</th><th>العدد في الفرع</th></tr>`+rows.map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${b.q[i.id]||0}</td></tr>`).join('')+'</table>':'<p class="mut">لا توجد أصناف مطابقة في هذا الفرع.</p>';
}
function trackTable(map,empty){
  const rows=items.filter(i=>map[i.id]).map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${map[i.id]}</td></tr>`).join('');
  return rows?`<div class="box tw"><table><tr><th>الفئة</th><th>الصنف</th><th>العدد</th></tr>${rows}</table></div>`:`<p class="mut">${empty}</p>`;
}
function maintItems(){return items.filter(i=>MAINT[i.id]>0)}
function vMaint(){
  if(maintView==='release')return vMaintRelease();
  if(maintView==='ack')return vMaintAck();
  const rows=maintItems().map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${MAINT[i.id]}</td><td>${warrantyBadge(i.id)}</td></tr>`).join('');
  return `<h2>${icon('maint')} تحت الصيانة</h2>
   <div class="bl" style="margin-bottom:14px">
     <button class="bc" onclick="openIssMaint()"><b>${icon('maint')}صرف إلى مورد الصيانة</b><span>إنشاء إذن خروج الأصناف إلى الصيانة</span></button>
     <button class="bc" onclick="maintView='release';go()"><b>${icon('rq')}إذن الخروج للصيانة</b><span>كل الأصناف الخارجة للصيانة: السيريال، الجهة، من سجّلها، والتاريخ</span></button>
     <button class="bc" onclick="MA=null;maintView='ack';go()"><b>${icon('recvbr')}إقرار استلام من الصيانة</b><span>تسجيل الأصناف الراجعة: النتيجة، السيريال، الجهة، والضمان مع تفاصيل إذن الخروج</span></button>
   </div>
   ${rows?`<div class="box tw"><h3>الرصيد الحالي تحت الصيانة</h3><table><tr><th>الفئة</th><th>الصنف</th><th>العدد</th><th>الضمان</th></tr>${rows}</table></div>`:'<p class="mut">لا توجد أصناف تحت الصيانة حاليًا.</p>'}
   <p class="mut">تُضاف الأصناف من زر «صرف إلى مورد الصيانة»، ويُسجَّل استلامها من زر «إقرار استلام من الصيانة».</p>`;
}
function openIssMaint(){DR.issmaint=nd('issmaint');E.issmaint=null;maintView='out';go()}
function maintOutRows(){
  const remaining={...MAINT},rows=[];
  [...DB.out].reverse().forEach(r=>{
    if(r.k!='sup')return;
    r.lines.forEach(l=>{
      const rem=remaining[l.i]||0;
      if(rem<=0)return;
      const q=Math.min(l.q,rem);
      remaining[l.i]=rem-q;
      rows.push({r,l,q});
    });
  });
  return rows;
}
function mackLine(){
  const m=maintItems(),id=m.length?m[0].id:0;
  const ref=id?maintOutRows().find(x=>x.l.i==id):null;
  const L={i:id,q:1,sns:[],st:'stock',hw:false,wu:''};
  if(ref)L.sns=ref.l.sns.slice(0,1);
  fixSn(L);
  return L;
}
function setAckItem(j,v){
  const id=+v||0,L=MA.lines[j],ref=id?maintOutRows().find(x=>x.l.i==id):null;
  L.i=id;L.q=1;L.sns=ref?ref.l.sns.slice(0,1):[];
  fixSn(L);go();
}
function setAckQ(j,v){
  const L=MA.lines[j];
  L.q=Math.min(Math.max(1,Math.floor(+v||1)),Math.max(1,MAINT[L.i]||1));
  fixSn(L);go();
}
function vMaintAck(){
  const back=`<button class="btn ghost" onclick="maintView=null;go()">رجوع للصيانة</button>`;
  const history=ackCards();
  if(!ok('pool'))return back+`<h2 style="margin-top:14px">إقرار استلام من الصيانة</h2>
   <p class="mut" style="margin:-6px 0 12px">عرض فقط. تسجيل الإقرار متاح لمدير النظام والمدير الفني.</p>${history}`;
  const open=maintOutRows();
  if(!open.length)return back+`<h2 style="margin-top:14px">إقرار استلام من الصيانة</h2>
   <p class="mut">لا توجد أصناف تحت الصيانة حاليًا.</p>${history}`;
  if(!MA)MA={sup:open[0].r.sup||'',p:'',lines:[mackLine()]};
  const lines=MA.lines.map((l,j)=>{
    fixSn(l);
    const avail=items.filter(i=>(MAINT[i.id]||0)>0||i.id==l.i);
    const groups=CATS.map(c=>{const g=avail.filter(i=>i.c==c);return g.length?`<optgroup label="${e(c)}">`+g.map(i=>`<option value="${i.id}"${i.id==l.i?' selected':''}>${e(i.n)}</option>`).join('')+'</optgroup>':''}).join('');
    const ref=open.find(x=>x.l.i==l.i);
    const det=ref?`<div class="mut" style="margin:6px 0 0;line-height:1.8">إذن الخروج: ${e(ref.r.p)} · ${dcell(ref.r.d)} · الجهة: ${e(ref.r.sup||'-')}${ref.r.sb?' · من فرع '+e(ref.r.sb):''}${ref.l.rs?' · سبب الصيانة: '+e(ref.l.rs):''}${ref.l.nt?' · شرح: '+e(ref.l.nt):''} · سجّله: ${e(ref.r.by||'-')} · المتاح: ${ref.q}</div>`:'';
    return `<div class="box" style="background:var(--soft)"><div class="grid">
     <label>الصنف<select onchange="setAckItem(${j},this.value)">${groups||'<option value="">لا توجد أصناف تحت الصيانة</option>'}</select>${warrantyBadge(l.i)}</label>
     <label>النتيجة<select onchange="MA.lines[${j}].st=this.value"><option value="stock"${l.st!='scrap'?' selected':''}>تم إصلاحه</option><option value="scrap"${l.st=='scrap'?' selected':''}>رفض الصيانة</option></select></label>
     <label>العدد المستلم (المتاح: ${MAINT[l.i]||0})<input type="number" min="1" value="${l.q}" onchange="setAckQ(${j},this.value)"></label></div>
     ${det}
     ${hasSer(l.i)?'<div class="grid sngrid" style="'+snGrid(l.sns)+'">'+l.sns.map((s,n)=>`<label>سيريال ${n+1}<input value="${e(s)}" oninput="MA.lines[${j}].sns[${n}]=this.value;snGrow(this)"></label>`).join('')+'</div>':'<p class="mut" style="margin:0">هذه الفئة بدون سيريال</p>'}
     <div class="ln" style="margin-top:8px"><label class="ln"><input type="checkbox" ${l.hw?'checked':''} onchange="MA.lines[${j}].hw=this.checked;go()"> هل يوجد ضمان؟</label>${l.hw?`<label>انتهاء الضمان<input type="date" value="${e(l.wu||'')}" oninput="MA.lines[${j}].wu=this.value"></label>`:''}</div>
     ${MA.lines.length>1?`<button class="btn ghost" style="margin-top:8px" onclick="MA.lines.splice(${j},1);go()">حذف السطر</button>`:''}</div>`;
  }).join('');
  return back+`<div class="box" style="margin-top:14px"><h3>إقرار استلام من الصيانة</h3>
   <p class="mut" style="margin:-4px 0 10px">يعرض تفاصيل إذن الخروج لكل صنف، ويوزّع الراجع تلقائيًا حسب النتيجة: تم إصلاحه ← مخزون، رفض الصيانة ← خردة.</p>
   <div class="grid">
    <label>جهة الصيانة<select onchange="MA.sup=this.value">${supplierOptions(MA.sup)}</select></label>
    <label>رقم الإقرار<input value="${e(MA.p)}" oninput="MA.p=this.value"></label>
    <label>تاريخ الاستلام<span style="padding:7px 0">${dcell(isoToday())}</span></label>
    <label>المستلم<span style="padding:7px 0">${e((STATE.user||{}).name||'')}</span></label>
   </div>
   <h3 style="margin-top:12px">الأصناف الراجعة (${MA.lines.length})</h3>${lines}
   <div class="row"><button class="btn ghost" onclick="MA.lines.push(mackLine());go()">إضافة صنف</button><button class="btn" onclick="saveAck()">تسجيل الإقرار</button></div></div>
   <h2>سجل إقرارات الاستلام من الصيانة</h2>${history}`;
}
function ackCards(){
  const list=DB.in.filter(r=>r.k=='maint');
  if(!list.length)return '<p class="mut">لا توجد إقرارات استلام من الصيانة بعد.</p>';
  return list.map(r=>`<div class="box"><div><b>إقرار استلام رقم ${e(r.p)}</b> <span class="chip">من صيانة</span><div class="mut">الجهة: ${e(r.sup||'غير محددة')} · ${dcell(r.d)} · استلمه ${e(r.by||'-')}${r.ed?' · عدّله '+e(r.ed):''}</div></div>
   <div class="tw"><table><tr><th>الصنف</th><th>النتيجة</th><th>الضمان</th><th>السيريال</th><th>العدد</th></tr>${r.lines.map(l=>`<tr><td>${e((it(l.i)||{n:'-'}).n)}</td><td>${l.st=='scrap'?'<span class="chip bad">رفض الصيانة</span>':'<span class="chip ok">تم إصلاحه</span>'}</td><td>${l.hw?`حتى ${dcell(l.wu||'')}`:'بدون ضمان'}</td><td>${e(l.sns.length?l.sns.join('، '):'بدون سيريال')}</td><td>${l.q}</td></tr>`).join('')}</table></div></div>`).join('');
}
async function saveAck(){
  if(!MA||!MA.lines.length)return toast('أضف صنفًا واحدًا على الأقل');
  const p=(MA.p||'').trim();
  if(!p)return toast('اكتب رقم الإقرار');
  const seen={},used={},lines=[];
  for(const l of MA.lines){
    if(!l.i)return toast('اختر الصنف في كل سطر');
    if(!(l.q>0))return toast('اكتب العدد في كل سطر');
    used[l.i]=(used[l.i]||0)+Number(l.q);
    if(used[l.i]>(MAINT[l.i]||0))return toast('العدد أكبر من الرصيد تحت الصيانة');
    let sns=[];
    if(hasSer(l.i)){
      fixSn(l);sns=l.sns.map(s=>s.trim());
      for(const s of sns){const t=s.toLowerCase();if(!t)return toast('اكتب كل السيريالات لصنف '+it(l.i).n);if(seen[t])return toast('سيريال مكرر: '+s);seen[t]=1}
    }
    if(l.hw&&!l.wu)return toast('اكتب تاريخ انتهاء الضمان');
    lines.push({item_id:+l.i,qty:+l.q,serials:sns,state:l.st=='scrap'?'scrap':'stock',has_warranty:!!l.hw,warranty_until:l.hw?(l.wu||''):''});
  }
  try{
    await api('/vouchers','POST',{direction:'in',kind:'maint',number:p,supplier_name:(MA.sup||'').trim(),branch_id:null,lines});
    MA=null;await refresh();toast('تم تسجيل إقرار الاستلام من الصيانة');go();
  }catch(err){toast(err.message)}
}
function vMaintRelease(){
  const rows=maintOutRows();
  return `<button class="btn ghost" onclick="maintView=null;go()">رجوع للصيانة</button>
   <h2 style="margin-top:14px">إذن الخروج للصيانة</h2>
   <p class="mut" style="margin:-6px 0 12px">أذون الصرف إلى مورد الصيانة التي لا تزال أصنافها تحت الصيانة: الصنف والسيريال والجهة والفرع المصدر وسبب الصيانة والشرح ومن سجّلها والتاريخ.</p>
   ${rows.length?`<div class="box tw"><table><tr><th>التاريخ</th><th>رقم الإذن</th><th>الفئة</th><th>الصنف</th><th>السيريال</th><th>العدد</th><th>الضمان</th><th>جهة الصيانة</th><th>الفرع المصدر</th><th>سبب الصيانة</th><th>شرح</th><th>سجّله</th></tr>${rows.map(({r,l,q})=>`<tr><td>${dcell(r.d)}</td><td>${e(r.p)}</td><td>${e((it(l.i)||{c:'-'}).c)}</td><td>${e((it(l.i)||{n:'-'}).n)}</td><td>${e(l.sns.length?l.sns.slice(0,q).join('، '):'بدون سيريال')}</td><td>${q}</td><td>${warrantyBadge(l.i)}</td><td>${e(r.sup||'-')}</td><td>${e(r.sb||'-')}</td><td>${e(l.rs||'-')}</td><td>${e(l.nt||'-')}</td><td>${e(r.by||'-')}</td></tr>`).join('')}</table></div>`:'<p class="mut">لا توجد أصناف ما زالت تحت الصيانة.</p>'}`;
}
const SCRAP_ICONS={
  serial:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2M7 8v8M10.5 8v8M14 8v8M17 8v8"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z"/><path d="M3.5 8.7 12 13.5l8.5-4.8M12 13.5V21"/></svg>'
};
function vScrap(){
  const actions=ok('pool')?`<div class="sacts">
    <button class="sact" onclick="openScrap('serial')">
      <span class="sact-ico">${SCRAP_ICONS.serial}</span>
      <span class="sact-body"><b>تالف بسيريال</b><span>تسجيل سيريال كل قطعة وخصمها من رصيد المخزن</span></span>
      <span class="sact-arrow">‹</span>
    </button>
    <button class="sact" onclick="openScrap('plain')">
      <span class="sact-ico">${SCRAP_ICONS.box}</span>
      <span class="sact-body"><b>تالف بدون سيريال</b><span>خصم الكمية من المخزن دون إدخال سيريالات</span></span>
      <span class="sact-arrow">‹</span>
    </button>
   </div>`:'';
  return `<div class="hero">
    <div><div class="eyebrow">إدارة المخزون</div><h2>${icon('scrap')} الخردة</h2><p>تسجيل الأصناف التالفة وخصمها من رصيد المخزن داخل معاملة واحدة، مع حفظ السيريالات وسجل كامل للحركات.</p></div>
    <button class="btn soft" onclick="scrapBal=!scrapBal;go()">${scrapBal?'إخفاء رصيد الخردة':'عرض رصيد الخردة'}</button>
   </div>
   ${actions}${scrapMode?vScrapForm():''}${scrapBal?scrapPanel():''}
   <p class="mut">الخردة نهائية ولا تُصرف. تُخصم كل كمية من رصيد المخزن قبل تسجيلها.</p>`;
}
function logParts(at){
  if(!at)return {d:'',t:''};
  const x=new Date(at);
  if(isNaN(x.getTime()))return {d:'',t:''};
  return {d:x.toLocaleDateString('en-CA'),t:x.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
}
function scrapPanel(){
  const balances=items.filter(i=>SCRAP[i.id]).sort((a,b)=>String(a.c).localeCompare(String(b.c),'ar')||String(a.n).localeCompare(String(b.n),'ar'));
  const total=balances.reduce((a,i)=>a+(SCRAP[i.id]||0),0);
  const last=SCRAPLOG.length?logParts(SCRAPLOG[0].at):{d:'',t:''};
  const balRows=balances.map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td><b>${SCRAP[i.id]}</b></td></tr>`).join('');
  return `<section class="panel">
    <div class="panel-head"><div><h3>رصيد الخردة</h3><div class="mut">الرصيد الحالي وسجل الحركات التفصيلي</div></div><button class="btn ghost" onclick="scrapBal=false;go()">إخفاء</button></div>
    <div class="panel-body">
      <div class="kpis">
        <div class="kpi"><span>إجمالي القطع في الخردة</span><b>${total}</b></div>
        <div class="kpi"><span>عدد الأصناف</span><b>${balances.length}</b></div>
        <div class="kpi"><span>عدد الحركات</span><b>${SCRAPLOG.length}</b></div>
        <div class="kpi"><span>آخر حركة</span><b style="font-size:15px">${last.d?`${dcell(last.d)} ${e(last.t)}`:'—'}</b></div>
      </div>
      <h4 class="sub">الأرصدة الحالية حسب الصنف</h4>
      ${balances.length?`<div class="tw"><table class="pro"><thead><tr><th>الفئة</th><th>الصنف</th><th>العدد</th></tr></thead><tbody>${balRows}</tbody></table></div>`:'<div class="empty">لا توجد أصناف في الخردة حاليًا.</div>'}
      <h4 class="sub">سجل حركات الخردة</h4>
      ${scrapLogTable()}
    </div>
  </section>`;
}
function openScrap(mode){scrapMode=mode;SCR={mode,lines:[scrapLine()]};go()}
function scrapCandidates(){return items.filter(i=>i.s>0&&(scrapMode=='serial'?!!SER[i.c]:true))}
function scrapLine(){const p=scrapCandidates(),id=p.length?p[0].id:0;const L={i:id,q:1,sns:[]};fixSn(L);return L}
function setScrapItem(j,v){const L=SCR.lines[j];L.i=+v||0;L.q=1;L.sns=[];fixSn(L);go()}
function setScrapQ(j,v){const L=SCR.lines[j],max=Math.max(1,(it(L.i)||{}).s||1);L.q=Math.min(Math.max(1,Math.floor(+v||1)),max);fixSn(L);go()}
function vScrapForm(){
  const serial=scrapMode=='serial',cands=scrapCandidates();
  const title=serial?'تالف بسيريال':'تالف بدون سيريال';
  if(!cands.length)return `<div class="sheet"><div class="sheet-head"><h3>${title}</h3><button class="btn ghost" onclick="scrapMode=null;SCR=null;go()">إغلاق</button></div><div class="sheet-body"><p class="mut" style="margin:0">لا توجد أصناف ${serial?'بسيريال':'لها رصيد'} متاحة في المخزن.</p></div></div>`;
  const lines=SCR.lines.map((l,j)=>{
    fixSn(l);
    const groups=CATS.map(c=>{const g=cands.filter(i=>i.c==c);return g.length?`<optgroup label="${e(c)}">`+g.map(i=>`<option value="${i.id}"${i.id==l.i?' selected':''}>${e(i.n)}</option>`).join('')+'</optgroup>':''}).join('');
    const avail=(it(l.i)||{}).s||0,after=Math.max(0,avail-(+l.q||0));
    return `<div class="sline"><div class="grid">
      <label>الصنف<select onchange="setScrapItem(${j},this.value)">${groups||'<option value="">لا توجد أصناف متاحة</option>'}</select></label>
      <label>العدد<input type="number" min="1" max="${avail}" value="${l.q}" onchange="setScrapQ(${j},this.value)"></label>
    </div>
    <div class="calc"><span>المتاح في المخزن: <b>${avail}</b></span><span>المتبقي بعد الخصم: <b>${after}</b></span></div>
    ${serial?'<div class="grid sngrid" style="margin-top:10px;'+snGrid(l.sns)+'">'+l.sns.map((s,n)=>`<label>سيريال ${n+1}<input value="${e(s)}" oninput="SCR.lines[${j}].sns[${n}]=this.value;snGrow(this)"></label>`).join('')+'</div>':'<p class="mut" style="margin:8px 0 0">بدون سيريال — تُسجَّل الكمية فقط.</p>'}
    ${SCR.lines.length>1?`<button class="btn ghost" style="margin-top:10px" onclick="SCR.lines.splice(${j},1);go()">حذف السطر</button>`:''}</div>`;
  }).join('');
  const total=SCR.lines.reduce((a,l)=>a+(+l.q||0),0);
  return `<div class="sheet"><div class="sheet-head"><div><h3>${title}</h3><div class="mut">خصم مباشر من رصيد المخزن</div></div><button class="btn ghost" onclick="scrapMode=null;SCR=null;go()">إغلاق</button></div>
    <div class="sheet-body">
      <div class="meta">
        <div><b>المصدر</b>المخزن</div>
        <div><b>التاريخ</b>${dcell(isoToday())}</div>
        <div><b>سجّله</b>${e((STATE.user||{}).name||'')}</div>
        <div><b>إجمالي القطع</b>${total}</div>
      </div>
      ${lines}
      <div class="row" style="margin-top:14px"><button class="btn ghost" onclick="SCR.lines.push(scrapLine());go()">إضافة سطر</button><button class="btn" onclick="saveScrap()">تسجيل في الخردة</button></div>
    </div></div>`;
}
function scrapLogTable(){
  if(!SCRAPLOG.length)return '<div class="empty">لا توجد حركات خردة مسجلة بعد. ابدأ بإضافة صنف تالف من الأزرار أعلاه.</div>';
  const rows=SCRAPLOG.map((r,k)=>{
    const x=it(r.i)||{},when=logParts(r.at),serialised=r.sns.length>0;
    const sns=serialised?`<div class="snlist">${r.sns.map(s=>`<span class="snchip">${e(s)}</span>`).join('')}</div>`:'<span class="mut">—</span>';
    return `<tr>
      <td class="num">${SCRAPLOG.length-k}</td>
      <td>${when.d?dcell(when.d):'-'}${when.t?`<div class="mut" dir="ltr">${e(when.t)}</div>`:''}</td>
      <td>${e(x.c||'-')}</td>
      <td>${e(x.n||'-')}</td>
      <td><b>${r.q}</b></td>
      <td><span class="chip ${serialised?'ok':''}">${serialised?'بسيريال':'بدون سيريال'}</span></td>
      <td>${sns}</td>
      <td>${e(r.by||'-')}</td>
    </tr>`;
  }).join('');
  return `<div class="tw"><table class="pro"><thead><tr><th>#</th><th>التاريخ والوقت</th><th>الفئة</th><th>الصنف</th><th>العدد</th><th>نوع التسجيل</th><th>السيريالات</th><th>سجّله</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
async function saveScrap(){
  if(!SCR||!SCR.lines.length)return toast('أضف صنفًا واحدًا على الأقل');
  const mode=SCR.mode,seen={},lines=[];
  for(const l of SCR.lines){
    if(!l.i)return toast('اختر الصنف في كل سطر');
    if(!(l.q>0))return toast('اكتب العدد في كل سطر');
    const x=it(l.i)||{};
    if(!(x.s>0))return toast('لا يوجد رصيد في المخزن لهذا الصنف');
    if(l.q>x.s)return toast('الكمية أكبر من رصيد المخزن');
    let sns=[];
    if(mode=='serial'&&hasSer(l.i)){
      fixSn(l);sns=l.sns.map(s=>s.trim());
      for(const s of sns){const t=s.toLowerCase();if(!t)return toast('اكتب كل السيريالات لصنف '+x.n);if(seen[t])return toast('سيريال مكرر: '+s);seen[t]=1}
    }
    lines.push({item_id:+l.i,qty:+l.q,serials:sns});
  }
  try{await api('/scrap','POST',{mode,lines});scrapMode=null;SCR=null;await refresh();toast('تم تسجيل الأصناف في الخردة');go()}catch(err){toast(err.message)}
}
function vDoc(key){
  docKey=key;
  const S=DS[key],K=S.dir,D=DR[key],k=S.kind,inn=K=='in',ed=E[key];
  const sendMaint=!inn&&k=='sup',backNonSup=inn&&k!='sup';
  const srcNames=[...new Set(branches.map(b=>b.n))];if(D.sb&&!srcNames.includes(D.sb))srcNames.push(D.sb);
  const list=DB[K].filter(r=>r.k==k);
  const lines=D.lines.map((l,j)=>{
    fixSn(l);
    const avail=inn?items:items.filter(i=>i.s>0||i.id==l.i);
    const groups=CATS.map(c=>{const g=avail.filter(i=>i.c==c);return g.length?`<optgroup label="${e(c)}">`+g.map(i=>`<option value="${i.id}"${i.id==l.i?' selected':''}>${e(i.n)}</option>`).join('')+'</optgroup>':''}).join('');
    const noItem=inn?'لا توجد أصناف — أضفها من إدارة الأصناف':'لا توجد أصناف متاحة في المخزن';
    return `<div class="box" style="background:var(--soft)"><div class="grid">
   <label>الصنف<select onchange="DR[KK()].lines[${j}].i=+this.value;go()">${groups||`<option value="">${noItem}</option>`}</select>${inn?warrantyBadge(l.i):''}</label>
   <label>${inn?'العدد المستلم':'العدد المصروف'}<input type="number" min="1" value="${l.q}" onchange="setQ(${j},this.value)"></label>
   ${sendMaint?`<label>سبب الصيانة<input value="${e(l.rs||'')}" oninput="DR[KK()].lines[${j}].rs=this.value"></label>`:''}
   ${sendMaint?`<label>شرح<input value="${e(l.nt||'')}" oninput="DR[KK()].lines[${j}].nt=this.value"></label>`:''}</div>
   ${hasSer(l.i)?`<div class="snbox"><div class="snhead">أرقام السيريال (${l.sns.length})</div><div class="grid sngrid" style="${snGrid(l.sns)}">${l.sns.map((s,n)=>`<label>سيريال ${n+1}<input value="${e(s)}" oninput="DR[KK()].lines[${j}].sns[${n}]=this.value;snGrow(this)"></label>`).join('')}</div></div>`:'<p class="mut" style="margin:0">هذه الفئة بدون سيريال</p>'}
   ${backNonSup?`<div class="ln" style="margin-top:8px"><label class="ln"><input type="checkbox" ${l.hw?'checked':''} onchange="DR[KK()].lines[${j}].hw=this.checked;go()"> هل يوجد ضمان؟</label>${l.hw?`<label>انتهاء الضمان<input type="date" value="${e(l.wu||'')}" oninput="DR[KK()].lines[${j}].wu=this.value"></label>`:''}</div>`:''}
   ${D.lines.length>1?`<button class="btn ghost" style="margin-top:8px" onclick="DR[KK()].lines.splice(${j},1);go()">حذف السطر</button>`:''}</div>`}).join('');
  const hint=key=='recvsup'?'إذن استلام من مورد: يُضاف إلى المخزون.'
   :key=='recvbr'?'إذن استلام من فرع: يُنقص رصيد الفرع، ويُضاف إلى المخزون. الأصناف التالفة تُسجَّل من شاشة الخردة.'
   :key=='issbr'?'إذن صرف إلى فرع: يُنقص المخزون، ويُضاف إلى رصيد الفرع.'
   :'إذن صرف إلى مورد الصيانة: تنتقل الكمية من المخزن إلى «تحت الصيانة»، ويصبح هذا الإذن هو إذن الخروج للصيانة.';
  return `${key=='issmaint'?'<button class="btn ghost" onclick="maintView=null;go()">رجوع للصيانة</button>':''}
  <div class="box"${key=='issmaint'?' style="margin-top:14px"':''}><h3>${ed?'تعديل ':''}${S.t}</h3>
  <div class="grid">
    ${k=='br'?`<label>الفرع<select onchange="DR[KK()].b=+this.value">${branches.map(b=>`<option value="${b.id}"${b.id==D.b?' selected':''}>${e(b.n)}</option>`).join('')}</select></label>`:`<label>${sendMaint?'جهة الصيانة':'اسم المورد المسجل'}<select onchange="DR[KK()].sup=this.value">${supplierOptions(D.sup)}</select></label>`}
    ${sendMaint?`<label>الفرع المصدر<select onchange="DR[KK()].sb=this.value"><option value="">غير محدد</option>${srcNames.map(n=>`<option${n==D.sb?' selected':''}>${e(n)}</option>`).join('')}</select></label>`:''}
    <label>${inn?'رقم إذن الإدخال للتخزين':'رقم إذن الصرف'}<input value="${e(D.p)}" oninput="DR[KK()].p=this.value"></label>
    ${ed?'':`<label>التاريخ (تلقائي)<span style="padding:7px 0">${dcell(isoToday())}</span></label>`}
  </div>
  <p class="mut" style="margin:0 0 10px">${hint}</p>
  <h3 style="margin-top:12px">الأصناف في الإذن (${D.lines.length})</h3>${lines}
  <div class="row"><button class="btn ghost" onclick="DR[KK()].lines.push(nl());go()">إضافة صنف للإذن</button><button class="btn" onclick="saveDoc()">${ed?'حفظ التعديل':'تسجيل الإذن'}</button>${ed?'<button class="btn ghost" onclick="resetDoc();go()">إلغاء التعديل</button>':''}</div></div>
  <h2>${icon(key)} ${S.t} (${list.length})</h2>${cards(key)}`;
}
function cards(key){
  const S=DS[key],K=S.dir,list=DB[K].filter(r=>r.k==S.kind);
  if(!list.length)return '<p class="mut">لا توجد أذونات بعد.</p>';
  return list.map(r=>{const inn=K=='in',party=partyName(r);return `<div class="box"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>إذن رقم ${e(r.p)}</b> <span class="chip ok">${SRC[K][r.k]}</span><div class="mut">الجهة: ${e(party)}${r.sb?' · من فرع '+e(r.sb):''} · ${dcell(r.d)} · ${e(r.by)}${r.ed?' · عدّله '+e(r.ed):''}</div></div>
   <div class="acts" style="flex-wrap:wrap">${ok('stock')?`<button class="btn ghost" onclick="editDoc(${r.id})">تعديل</button>`:''}${ok('delRecv')?`<button class="btn bad" onclick="delDoc(${r.id})">${pend==K+r.id?'تأكيد الحذف':'حذف'}</button>`:''}</div></div>
   <div class="tw"><table><tr><th>الصنف</th><th>السيريال</th>${inn?'<th>الحالة</th>':'<th>سبب الصيانة</th><th>شرح</th>'}<th>العدد</th></tr>${r.lines.map(l=>`<tr><td>${e((it(l.i)||{n:'-'}).n)}</td><td>${l.sns.length?snList(l.sns):'<span class="mut">بدون سيريال</span>'}</td>${inn?`<td>${e(SM[l.st]||SM.stock)}${l.hw?` · ضمان حتى ${e(l.wu||'')}`:''}</td>`:`<td>${e(l.rs||'-')}</td><td>${e(l.nt||'-')}</td>`}<td>${l.q}</td></tr>`).join('')}</table></div></div>`}).join('');
}
function setQ(j,v){DR[KK()].lines[j].q=Math.max(0,Math.floor(+v||0));go()}
function resetDoc(){const key=KK();E[key]=null;DR[key]=nd(key)}
function editDoc(id){
  const key=KK(),K=DS[key].dir,r=DB[K].find(x=>x.id==id);E[key]=id;pend=null;
  DR[key]={k:DS[key].kind,sup:r.sup,b:r.b||(branches[0]?branches[0].id:null),p:r.p,sb:r.sb||'',lines:r.lines.map(l=>({i:l.i,q:l.q,sns:[...l.sns],st:l.st||'stock',rs:l.rs||'',nt:l.nt||'',hw:!!l.hw,wu:l.wu||''}))};
  go();window.scrollTo(0,0);
}
async function saveDoc(){
  const key=KK(),S=DS[key],K=S.dir,D=DR[key],k=S.kind,isb=k=='br',inn=K=='in',sendMaint=K=='out'&&k=='sup',backNonSup=inn&&k!='sup',sup=(D.sup||'').trim(),p=D.p.trim(),editing=E[key];
  if(isb&&!br(D.b))return toast('اختر فرعًا مسجلاً');
  if(k=='sup'&&!sup)return toast('اختر المورد');
  if(!p)return toast(K=='in'?'اكتب رقم إذن الإدخال':'اكتب رقم إذن الصرف');
  const seen={};const lines=[];
  for(const l of D.lines){
    if(!l.i)return toast('اختر الصنف في كل سطر');
    if(!(l.q>0))return toast('اكتب العدد في كل سطر');
    let sns=[];
    if(hasSer(l.i)){
      fixSn(l);sns=l.sns.map(s=>s.trim());
      for(const s of sns){const t=s.toLowerCase();if(!t)return toast('اكتب كل السيريالات لصنف '+it(l.i).n);if(seen[t])return toast('سيريال مكرر: '+s);seen[t]=1}
    }
    if(backNonSup&&l.hw&&!l.wu)return toast('اكتب تاريخ انتهاء الضمان');
    lines.push({
      item_id:+l.i,qty:+l.q,serials:sns,
      state:'stock',
      reason:sendMaint?(l.rs||''):'',
      note:sendMaint?(l.nt||''):'',
      has_warranty:backNonSup?!!l.hw:false,
      warranty_until:backNonSup&&l.hw?(l.wu||''):''
    });
  }
  const body={direction:K,kind:k,number:p,supplier_name:isb?'':sup,branch_id:isb?+D.b:null,source_branch:sendMaint?(D.sb||''):'',lines};
  try{
    if(editing)await api('/vouchers/'+editing,'PUT',body);else await api('/vouchers','POST',body);
    resetDoc();if(document.activeElement)document.activeElement.blur();go();
    await refresh();toast(editing?'تم حفظ تعديل الإذن':'تم تسجيل الإذن وتحديث الأرصدة');go();
  }catch(err){toast(err.message)}
}
async function delDoc(id){
  const key=KK(),K=DS[key].dir;
  if(!ok('delRecv'))return;
  if(pend!=K+id){pend=K+id;toast('اضغط تأكيد الحذف للمتابعة');return go()}
  try{await api('/vouchers/'+id,'DELETE');pend=null;if(E[key]==id)resetDoc();await refresh();toast('تم حذف الإذن وتعديل الأرصدة');go()}catch(err){pend=null;toast(err.message);go()}
}

function vBranches(){
  let h='';
  if(ok('addBranch'))h+=`<div class="box"><h3>إضافة فرع</h3><div class="row"><label>اسم الفرع<input id="bn"></label><label>رقم الفرع<input id="bnum"></label><label>المحافظة<select id="bg">${opts(GOV)}</select></label></div>
   <div class="row"><label>مسؤول الفرع<input id="bman"></label><label>هاتف<input id="bphone"></label></div>
   <div class="row"><label>العنوان<input id="baddr"></label><label>الموقع<input id="bloc"></label></div>
   <p class="mut" style="margin:12px 0 0">اختر الأصناف التي تُستخدم في هذا الفرع:</p><div class="box" style="max-height:340px;overflow:auto">${itemPick('b')}</div><button class="btn" onclick="addBranch()">حفظ الفرع</button></div>`;
  return h+`<h2>${icon('br')} الفروع (${branches.length})</h2><div class="bl">`+branches.map(b=>`<button class="bc" onclick="sel=${b.id};go()"><b>${icon('br')}${e(b.n)}</b><span>${b.number?e(b.number)+' · ':''}${e(b.g)} · ${Object.keys(b.q).length} صنف · ${Object.values(b.q).reduce((a,c)=>a+c,0)} قطعة</span>${b.by?`<span style="display:block">أضافه: ${e(b.by)}</span>`:''}</button>`).join('')+'</div>';
}
async function addBranch(){
  const n=$('#bn').value.trim();if(!n)return toast('اكتب اسم الفرع');
  const num=($('#bnum')||{}).value.trim();if(num){if(num.length<1||num.length>20)return toast('رقم الفرع 1-20 حرفًا');if(!/^[A-Za-z0-9_-]+$/.test(num))return toast('رقم الفرع أحرف/أرقام/-/_ فقط');const dup=branches.find(b=>String(b.number||'').trim().toLowerCase()==num.toLowerCase());if(dup)return toast('رقم الفرع موجود مسبقًا');}
  const ph=($('#bphone')||{}).value.trim();if(ph){if(!/^[0-9+\s-]*$/.test(ph))return toast('هاتف غير صالح');const digs=ph.replace(/[^0-9]/g,'');if(digs.length<7||digs.length>15)return toast('هاتف 7-15 رقمًا');}
  try{await api('/branches','POST',{name:n,number:num||null,gov:$('#bg').value,manager:($('#bman')||{}).value.trim()||null,phone:ph||null,address:($('#baddr')||{}).value.trim()||null,location:($('#bloc')||{}).value.trim()||null,item_ids:readPick('b')});await refresh();toast('تمت إضافة الفرع');go()}catch(err){toast(err.message)}
}
async function setBranchQty(bid,iid,v){
  try{await api('/branches/'+bid+'/qty','PUT',{item_id:+iid,qty:+v||0});await refresh();toast('تم حفظ العدد')}catch(err){toast(err.message)}
}
function vBranch(){
  const b=br(sel),ed=ok('branchEdit'),editAllowed=ok('addBranch');
  const assigned=items.filter(i=>b.q[i.id]!=null);
  const rows=assigned.map(i=>`<tr><td>${catIcon(i.c)} ${e(i.c)}</td><td>${e(i.n)}</td><td>${ed?`<input type="number" min="0" value="${b.q[i.id]||0}" style="width:80px" onchange="setBranchQty(${b.id},${i.id},this.value)">`:b.q[i.id]||0}</td>${ed?`<td><button class="btn ghost" onclick="rmBranchItem(${b.id},${i.id})">إزالة</button></td>`:''}</tr>`).join('');
  const free=items.filter(i=>b.q[i.id]==null);
  const add=ed&&free.length?`<div class="row" style="margin-top:12px"><label>إضافة صنف<select id="bai">${free.map(i=>`<option value="${i.id}">${e(i.n)} — ${e(i.c)}</option>`).join('')}</select></label><button class="btn" onclick="addBranchItem(${b.id})">إضافة للفرع</button></div>`:'';
  const editing=branchEditState&&branchEditState.id==b.id;
  return `<button class="btn ghost" onclick="sel=null;go()">رجوع للفروع</button><h2 style="margin-top:14px">${icon('br')} ${editing?e(branchEditState.name):e(b.n)} <span class="mut">${e(b.g)}</span> ${b.number&&!editing?`<span style="color:var(--pri)">(${e(b.number)})</span>`:''}</h2>${b.by&&!editing?`<div class="mut" style="margin:-6px 0 12px">تمت الإضافة بواسطة ${e(b.by)} · ${dcell(b.d)}</div>`:''}
  ${editing?`<div class="box tw" style="margin-bottom:10px"><h3>تعديل بيانات الفرع</h3>
  <div class="row"><label>اسم الفرع<input id="bed_n" value="${e(branchEditState.name)}"></label><label>رقم الفرع<input id="bed_num" value="${e(branchEditState.number||'')}"></label><label>المحافظة<select id="bed_g">${opts(GOV,branchEditState.gov)}</select></label></div>
  <div class="row"><label>مسؤول الفرع<input id="bed_man" value="${e(branchEditState.manager||'')}"></label><label>هاتف<input id="bed_phone" value="${e(branchEditState.phone||'')}"></label></div>
  <div class="row"><label>العنوان<input id="bed_addr" value="${e(branchEditState.address||'')}"></label><label>الموقع<input id="bed_loc" value="${e(branchEditState.location||'')}"></label></div>
  <div class="row"><button class="btn" onclick="saveBranchEdit()">حفظ</button><button class="btn ghost" onclick="branchEditState=null;go()">إلغاء</button></div></div>`:`<div class="box tw" style="margin-bottom:10px"><h3>بيانات الفرع</h3><table><tr><th>المسؤول</th><td>${b.manager?e(b.manager):'-'}</td></tr><tr><th>الهاتف</th><td>${b.phone?e(b.phone):'-'}</td></tr><tr><th>العنوان</th><td>${b.address?e(b.address):'-'}</td></tr><tr><th>الموقع</th><td>${b.location?(b.location.match(/^https?:\/\//)?`<a href="${e(b.location)}" target="_blank" rel="noopener noreferrer">فتح الخريطة</a>`:e(b.location)):'-'}</td></tr></table>${ok('addBranch')?`<button class="btn ghost" onclick="branchEditState={id:${b.id},name:'${e(b.n)}',number:'${e(b.number||'')}',gov:'${e(b.g)}',manager:'${e(b.manager||'')}',phone:'${e(b.phone||'')}',address:'${e(b.address||'')}',location:'${e(b.location||'')}',unsaved:true};go()">تعديل بيانات الفرع</button>`:''}</div>`}
  <div class="box tw"><h3>أصناف الفرع (${assigned.length})</h3>${assigned.length?`<table><tr><th>الفئة</th><th>الصنف</th><th>العدد</th>${ed?'<th></th>':''}</tr>${rows}</table>`:'<p class="mut">لا توجد أصناف مخصصة لهذا الفرع بعد.</p>'}${add}</div>`;
}
async function saveBranchEdit(){
  if(!branchEditState)return;
  const id=branchEditState.id;const n=($('#bed_n')||{}).value.trim();if(!n)return toast('اكتب اسم الفرع');const num=($('#bed_num')||{}).value.trim();if(num){if(num.length>20)return toast('رقم الفرع 1-20');if(!/^[A-Za-z0-9_-]+$/.test(num))return toast('رقم الفرع أحرف/أرقام فقط');const dup=branches.find(b=>b.id!=id&&String(b.number||'').trim().toLowerCase()==num.toLowerCase());if(dup)return toast('رقم الفرع موجود');}
  const ph=($('#bed_phone')||{}).value.trim();if(ph){if(!/^[0-9+\s-]*$/.test(ph))return toast('هاتف غير صالح');const digs=ph.replace(/[^0-9]/g,'');if(digs.length<7||digs.length>15)return toast('هاتف 7-15 رقمًا');}
  try{await api('/branches/'+id,'PUT',{name:n,number:num||null,gov:$('#bed_g').value,manager:($('#bed_man')||{}).value.trim()||null,phone:ph||null,address:($('#bed_addr')||{}).value.trim()||null,location:($('#bed_loc')||{}).value.trim()||null});branchEditState=null;await refresh();toast('تم حفظ التعديل');go()}catch(err){toast(err.message)}
}
async function addBranchItem(bid){
  const id=(($('#bai')||{}).value||0);if(!+id)return toast('اختر صنفًا');
  try{await api('/branches/'+bid+'/items','POST',{item_id:+id});await refresh();toast('تمت إضافة الصنف للفرع');go()}catch(err){toast(err.message)}
}
async function rmBranchItem(bid,iid){
  try{await api('/branches/'+bid+'/items/'+iid,'DELETE');await refresh();toast('تمت إزالة الصنف من الفرع');go()}catch(err){toast(err.message)}
}

function vBranchReqs(){
  const rows=reqs.map(r=>{
    const st=ST[r.st]||['',''],lb=st[0],cl=st[1];
    const items=r.l.length?r.l.map(x=>`${e((it(x.i)||{n:'-'}).n)} × ${x.q}`).join('، '):'—';
    const last=r.log.length?r.log[r.log.length-1]:null;
    const lastTxt=last?`${e(last.by)} — ${e(last.a)}`:'—';
    return `<tr><td>${e((br(r.b)||{n:'-'}).n)}</td><td>${e(r.by)}</td><td><span class="chip ${cl}">${lb}</span></td><td>${items}</td><td class="mut">${lastTxt}</td></tr>`;
  }).join('');
  return `<h2>${icon('reqbr')} متطلبات الفروع</h2>
   <p class="mut" style="margin:-6px 0 12px">عرض فقط لجميع طلبات الفروع: من قدّمها وما هو المطلوب.</p>
   ${reqs.length?`<div class="box tw"><table><tr><th>الفرع</th><th>مقدّم الطلب</th><th>الحالة</th><th>الأصناف المطلوبة</th><th>آخر إجراء</th></tr>${rows}</table></div>`:'<p class="mut">لا توجد طلبات بعد.</p>'}`;
}
function vReqs(){
  let h='';
  if(ok('request'))h+=`<div class="box"><h3>طلب جديد</h3><label style="max-width:260px">الفرع<select id="rb">${branches.map(b=>`<option value="${b.id}">${e(b.n)}</option>`).join('')}</select></label>
   <p class="mut" style="margin:12px 0 0">الكميات المطلوبة:</p>${grid('rq')}
   <label style="max-width:420px;margin-bottom:12px">ملاحظات (اختياري)<input id="rc"></label>
   <button class="btn" onclick="send()">${role=='junior'?'إرسال للسينيور للمراجعة':'إرسال لمدير المنطقة'}</button></div>`;
  h+=`<h2>${icon('rq')} الطلبات</h2>`;
  if(!reqs.length)return h+'<p class="mut">لا توجد طلبات بعد.</p>';
  return h+reqs.map(card).join('');
}
function card(r){
  const [lb,cl]=ST[r.st],open=['review','pending','approved'].includes(r.st);
  const u=ui&&ui.id==r.id?ui.m:null;
  const lines=u=='edit'?r.l.map(x=>`<label class="ln">${e(it(x.i).n)} <input type="number" min="0" value="${x.q}" id="e${r.id}_${x.i}"></label>`).join(''):r.l.map(x=>`${e(it(x.i).n)} × ${x.q}`).join('، ');
  const log=r.log.length?'<div class="lg">'+r.log.map(g=>`<div><b>${e(g.by)}</b> <span class="chip ${g.k}">${e(g.a)}</span>${g.t?`<div>${e(g.t)}</div>`:''}</div>`).join('')+'</div>':'';
  const st={review:['rev','تأكيد وإرسال لمدير المنطقة','review'],pending:['ok','موافقة وإرسال لمسؤول المخزن','approve'],approved:['out','تأكيد الصرف من المخزن','release']}[r.st];
  let p='';
  if(open&&!u){
    if(st&&ok(st[2]))p+=`<button class="btn" onclick="act(${r.id},'${st[0]}')">${st[1]}</button>`;
    if(ok('reject'))p+=`<button class="btn bad" onclick="ui={id:${r.id},m:'no'};go()">رفض الطلب</button>`;
    if(ok('edit'))p+=`<button class="btn ghost" onclick="ui={id:${r.id},m:'edit'};go()">تعديل الطلب</button>`;
  }
  if(open&&u=='no')p=`<input class="cm" style="margin:0" id="c${r.id}" placeholder="سبب الرفض (إجباري)"><button class="btn bad" onclick="act(${r.id},'no')">تأكيد الرفض</button><button class="btn ghost" onclick="ui=null;go()">إلغاء</button>`;
  if(open&&u=='edit')p=`<input class="cm" style="margin:0" id="c${r.id}" value="تم التعديل"><button class="btn" onclick="act(${r.id},'save')">حفظ التعديل</button><button class="btn ghost" onclick="ui=null;go()">إلغاء</button>`;
  return `<div class="box"><b>${e(br(r.b).n)}</b> <span class="chip ${cl}">${lb}</span><div class="mut">${e(r.by)}</div><div style="margin-top:6px">${lines}</div>${log}${p?`<div class="acts" style="margin-top:10px;flex-wrap:wrap">${p}</div>`:''}</div>`;
}
async function send(){
  const l=Object.entries(read('rq')).map(([i,n])=>({item_id:+i,qty:n}));
  if(!l.length)return toast('اختر صنفًا واحدًا على الأقل');
  try{await api('/requests','POST',{branch_id:+$('#rb').value,lines:l,note:$('#rc').value.trim()});await refresh();toast(role=='junior'?'تم إرسال الطلب لمراجعة السينيور':'تم إرسال الطلب لمدير المنطقة');go()}catch(err){toast(err.message)}
}
async function act(id,a){
  const body={action:a};
  if(a=='no'){body.note=(($('#c'+id)||{}).value||'').trim();if(!body.note)return toast('اكتب سبب الرفض في التعليق')}
  if(a=='save'){
    const r=reqs.find(x=>x.id==id);
    body.lines=r.l.map(x=>({item_id:x.i,qty:+($('#e'+id+'_'+x.i)||{}).value})).filter(x=>x.qty>0);
    body.note=(($('#c'+id)||{}).value||'تم التعديل').trim();
    if(!body.lines.length)return toast('اترك صنفًا واحدًا على الأقل أو ارفض الطلب');
  }
  try{
    await api('/requests/'+id+'/action','POST',body);ui=null;await refresh();
    toast(a=='out'?'تم الصرف':a=='no'?'تم رفض الطلب':a=='save'?'تم حفظ التعديل':a=='rev'?'تم التأكيد وإرسال الطلب لمدير المنطقة':'تمت الموافقة وإرسال الطلب لمسؤول المخزن');
    go();
  }catch(err){toast(err.message)}
}

boot();
