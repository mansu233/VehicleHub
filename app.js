'use strict';
const $=s=>document.querySelector(s),LS='mk_db_v6';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9),today=()=>new Date().toISOString().slice(0,10);
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const days=d=>Math.ceil((new Date(d)-new Date(today()))/864e5);
const ZONES=['Front','Rear','Left side','Right side','Bumpers','Doors','Interior'];
const TYPES={fuel:'Fuel',maintenance:'Maint.',purchase:'RTO/Buy',expense:'Expense'};
const DOCS=['RC','Insurance','PUC','Driving License','Other'];
const DEF={fuel:['Petrol','Diesel','CNG','EV charging'],maintenance:['Oil change','Water service','Air check','Tyres','Brakes','Battery','General service'],purchase:['RTO & registration','Insurance premium','Accessories','Loan fee'],expense:['Toll','Parking','Car wash','Fine']};
const NAV=[['home','⌂','Home'],['add','＋','Log'],['prof','🚘','Profile'],['fin','₹','Finance'],['logs','☰','History'],['set','⚙','Settings']];
const sel=(a,o)=>a.map(i=>`<option ${i===o?'selected':''}>${esc(i)}</option>`).join('');
let scr='home',type='fuel',editId=null,fb=null,emiEdit=null,F={q:'',t:'all',s:'new'};

let MD=null,TM={users:[],sent:{},remote:{},on:false};
const newV=(name,plate)=>({id:uid(),name,plate,model:'',odo0:0,partners:['You','Partner'],specs:[],docs:[],photos:{},damages:[],logs:[],fin:{pays:[]},settles:[],rem:[]});
function fix(d){d.v.forEach(v=>{['specs','docs','damages','logs','settles','rem'].forEach(k=>v[k]=Object.values(v[k]||{}));v.photos=v.photos||{};v.fin=v.fin||{};v.fin.pays=Object.values(v.fin.pays||{});v.partners=Object.values(v.partners||['You'])});d.cats=d.cats||DEF;return d}
function load(){try{const d=JSON.parse(localStorage.getItem(LS));if(d&&d.v){fix(d);if(!d.m7){d.m7=1;d.cats.maintenance=d.cats.maintenance||[];['Water service','Air check'].forEach(c=>d.cats.maintenance.includes(c)||d.cats.maintenance.push(c))}return d}}catch(e){}const v=newV('My Vehicle','');return{v:[v],act:v.id,cats:DEF,m7:1,pin:null,lastBackup:null,user:null}}
let db=load();
const lsave=()=>{try{localStorage.setItem(LS,JSON.stringify(db))}catch(e){alert('Storage is full. Export a JSON backup, then remove old photos.')}};
const save=()=>{lsave();push()};
const V=()=>db.v.find(x=>x.id===db.act)||db.v[0];
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hide');setTimeout(()=>e.classList.add('hide'),2200)}

/* ---------- calculations ---------- */
const odo=v=>Math.max(+v.odo0||0,0,...v.logs.map(l=>+l.odo||0));
function mileage(v){const f=v.logs.filter(l=>l.t==='fuel'&&+l.lit>0).sort((a,b)=>a.odo-b.odo),seg=[];
 for(let i=1;i<f.length;i++){const km=f[i].odo-f[i-1].odo;if(km>0)seg.push({km,l:+f[i].lit,e:km/f[i].lit,id:f[i].id})}
 const km=seg.reduce((a,s)=>a+s.km,0),L=seg.reduce((a,s)=>a+s.l,0);return{avg:L?km/L:0,seg,last:f[f.length-1]}}
const norm=(pd,amt)=>{const s=Object.values(pd).reduce((a,x)=>a+ +x,0);return s&&Math.abs(s-amt)>.01?Object.fromEntries(Object.entries(pd).map(([k,x])=>[k,x*amt/s])):pd};
function ents(v){const f=v.fin,P=v.partners,up=(+f.loan>0?+f.down||0:(+f.ex||0)+(+f.tax||0)),mk=(e,amt)=>({amt,scope:e.scope||'personal',pd:norm(e.pd||{[e.payer||P[0]]:amt},amt),sh:e.sh});
 return[...v.logs.map(l=>mk(l,+l.amt)),...(f.pays||[]).map(p=>mk(p,+p.amt)),...(up?[mk({scope:f.downScope,pd:f.downPd,payer:f.downBy,sh:f.downSh},up)]:[])]}
function ledger(v){const P=v.partners,net=Object.fromEntries(P.map(p=>[p,0]));
 ents(v).filter(e=>e.scope==='shared').forEach(e=>P.forEach(p=>net[p]+=(e.pd[p]||0)-e.amt*((e.sh||{})[p]??100/P.length)/100));
 v.settles.forEach(s=>P.forEach(p=>net[p]-=(s.net[p]||0)));return net}
function due(v){const o=odo(v);return v.specs.filter(s=>+s.km>0||+s.days>0).map(s=>{let kmL=null,dL=null,st='ok';
 if(+s.km>0){kmL=(+s.lastOdo||0)+ +s.km-o;st=kmL<=0?'bad':kmL<=500?'warn':'ok'}
 if(+s.days>0&&s.lastDate){dL=days(s.lastDate)+ +s.days;if(dL<=0)st='bad';else if(dL<=7&&st==='ok')st='warn'}
 return{...s,kmL,dL,st}})}
function alerts(v){const a=[];
 v.docs.forEach(d=>{const n=days(d.exp);if(n<=30)a.push({c:n<0?'bad':'warn',t:`${d.type} ${n<0?'expired '+(-n)+' days ago':'expires in '+n+' days'}`})});
 v.rem.filter(r=>!r.done).forEach(r=>{const n=days(r.date);if(n<=7)a.push({c:n<0?'bad':'warn',t:`${r.title} ${n<0?'is overdue':n===0?'is due today':'is due in '+n+' days'}`,rid:r.id})});
 due(v).filter(s=>s.st!=='ok').forEach(s=>a.push({c:s.st,t:`${s.k} service ${s.st==='bad'?'is due now':'is due soon'}`,sid:s.id}));
 if(v.logs.length&&(!db.lastBackup||Date.now()-db.lastBackup>7*864e5))a.push({c:'warn',t:'Your last backup is over 7 days old. Export JSON or back up to the cloud.'});
 if(TM.role==='admin'&&TM.status==='approved'){const n=TM.users.filter(u=>u.status==='pending').length;if(n)a.push({c:'warn',t:`${n} join request${n>1?'s are':' is'} waiting for your approval (Settings, Team)`})}
 return a}

/* ---------- images (images only, compressed) ---------- */
const okImg=f=>f&&/^image\/(jpe?g|png|webp)$/i.test(f.type)&&/\.(jpe?g|png|webp)$/i.test(f.name);
const pic=f=>new Promise((ok,no)=>{if(!okImg(f))return no(Error('Only JPG, PNG or WEBP images are allowed. Other files (APK, MP3, etc.) are blocked.'));
 const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,900/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.72))};i.onerror=()=>no(Error('This image could not be read.'));i.src=r.result};r.readAsDataURL(f)});

/* ---------- screens ---------- */
function barChart(v){const m={};v.logs.forEach(l=>{const k=l.date.slice(0,7);m[k]=(m[k]||0)+ +l.amt});const ks=[];const d=new Date();for(let i=5;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);ks.push(x.toISOString().slice(0,7))}
 const mx=Math.max(1,...ks.map(k=>m[k]||0));return`<svg viewBox="0 0 300 100" width="100%" role="img" aria-label="Monthly spend">${ks.map((k,i)=>{const h=(m[k]||0)/mx*60;return`<rect x="${i*50+10}" y="${70-h}" width="30" height="${h}" rx="4" fill="#f5a623"/><text x="${i*50+25}" y="86" font-size="9" fill="#8b97aa" text-anchor="middle">${k.slice(5)}</text><text x="${i*50+25}" y="${66-h}" font-size="8" fill="#e8edf5" text-anchor="middle">${m[k]?Math.round(m[k]/1000*10)/10+'k':''}</text>`}).join('')}</svg>`}
function lineChart(seg){if(seg.length<2)return'<p class=sb>Log two full-tank fill-ups to see your mileage trend.</p>';const s=seg.slice(-8),mx=Math.max(...s.map(x=>x.e)),mn=Math.min(...s.map(x=>x.e)),r=mx-mn||1;
 const p=s.map((x,i)=>[10+i*(280/(s.length-1)),70-(x.e-mn)/r*55]);return`<svg viewBox="0 0 300 90" width="100%" role="img" aria-label="Mileage trend"><polyline points="${p.map(a=>a.join(',')).join(' ')}" fill="none" stroke="#2dd4bf" stroke-width="2.5"/>${p.map((a,i)=>`<circle cx="${a[0]}" cy="${a[1]}" r="3" fill="#2dd4bf"/><text x="${a[0]}" y="${a[1]-7}" font-size="8" fill="#e8edf5" text-anchor="middle">${s[i].e.toFixed(1)}</text>`).join('')}</svg>`}
function parsePay(o,P,amt){if(P.length<2)return{scope:'personal',pd:{[P[0]]:amt},sh:null};const scope=o.scope||'personal';let pd={};
 if(o.payer==='__both'){if(scope==='personal')throw Error('A personal entry needs one payer. Choose Shared, or pick one payer.');
  let v=P.map((p,i)=>o['pd_'+i]===''||o['pd_'+i]===undefined?null:+o['pd_'+i]);const bl=v.filter(x=>x===null).length,sum=v.reduce((a,x)=>a+(x||0),0);
  if(bl===1&&sum<=amt)v=v.map(x=>x===null?+(amt-sum).toFixed(2):x);
  if(Math.abs(v.reduce((a,x)=>a+(x||0),0)-amt)>.5)throw Error('The paid amounts must add up to '+money(amt)+'.');
  P.forEach((p,i)=>{if(v[i]>0)pd[p]=v[i]})}else pd={[o.payer||P[0]]:amt};
 let sh=null;if(scope==='shared'&&o.splitm==='cu'){const s=P.map((p,i)=>+o['sh_'+i]||0);if(Math.abs(s.reduce((a,x)=>a+x,0)-100)>.5)throw Error('The shares must add up to 100%.');sh=Object.fromEntries(P.map((p,i)=>[p,s[i]]))}
 return{scope,pd,sh}}
function payUI(P,e,d){if(P.length<2)return'';e=e||{};const pd=e.pd||(e.payer?{[e.payer]:+e.amt}:{}),sh=e.sh||{},sc=e.scope||d,both=Object.keys(pd).filter(k=>pd[k]>0).length>1,py=both?'__both':(Object.keys(pd)[0]||P[0]);
 return`<div data-pay><div class=r2><label>Paid as<select name=scope><option value=shared ${sc==='shared'?'selected':''}>Shared</option><option value=personal ${sc!=='shared'?'selected':''}>Personal</option></select></label><label>Paid by<select name=payer>${P.map(p=>`<option ${p===py?'selected':''}>${esc(p)}</option>`).join('')}<option value=__both ${both?'selected':''}>Both / multiple</option></select></label></div>
 <div class="pdw hide"><div class=sb style="margin-bottom:6px">Amount each partner paid (leave one blank to auto-fill the rest)</div><div class=r2>${P.map((p,i)=>`<label>${esc(p)} paid (₹)<input type=number step=.01 min=0 name=pd_${i} value="${pd[p]||''}"></label>`).join('')}</div></div>
 <div class="spw hide"><label>Split<select name=splitm><option value=eq>Equal${P.length===2?' (50/50)':''}</option><option value=cu ${e.sh?'selected':''}>Custom %</option></select></label></div>
 <div class="shw hide r2">${P.map((p,i)=>`<label>${esc(p)} share (%)<input type=number step=.01 min=0 max=100 name=sh_${i} value="${sh[p]??Math.round(10000/P.length)/100}"></label>`).join('')}</div></div>`}
function payTxt(e,P){if(P.length<2)return'';const pd=Object.entries(e.pd||{[e.payer||P[0]]:+e.amt}).filter(x=>x[1]>0),w=pd.length>1?pd.map(x=>esc(x[0])+' '+money(x[1])).join(' + '):esc(pd[0]?pd[0][0]:P[0]);return' · '+(e.scope==='shared'?'Shared, paid by ':'Personal, ')+w+(e.sh&&e.scope==='shared'?' · split '+P.map(p=>Math.round(e.sh[p]||0)).join('/'):'')}
function syncPay(f){if(!f.elements||!f.elements.scope||!f.querySelector('.pdw'))return;const s=f.elements.scope.value,p=f.elements.payer.value;f.querySelector('.pdw').classList.toggle('hide',p!=='__both');f.querySelector('.spw').classList.toggle('hide',s!=='shared');f.querySelector('.shw').classList.toggle('hide',!(s==='shared'&&f.elements.splitm.value==='cu'))}
const ago=d=>{const n=-days(d);return n<=0?'today':n+(n>1?' days ago':' day ago')};
function lastDone(v,ex){const m={};v.logs.filter(l=>l.id!==ex).forEach(l=>{const k=l.t+'|'+l.cat;if(!m[k]||l.date>m[k].date||(l.date===m[k].date&&l.odo>m[k].odo))m[k]=l});return Object.values(m).sort((a,b)=>b.date.localeCompare(a.date))}
function updHint(){const f=document.querySelector('form[data-f=log]'),h=$('#lh');if(!f||!h)return;const v=V(),l=lastDone(v,editId).find(x=>x.t===f.elements.t.value&&x.cat===f.elements.cat.value);h.textContent=l?`Last time: ${l.date} (${ago(l.date)}) at ${(+l.odo).toLocaleString('en-IN')} km`:'Not logged before'}
const lastCard=v=>{const L=lastDone(v),o=odo(v),row=l=>`<div class=row><div>${esc(l.cat)} <span class=sb>${TYPES[l.t]}</span><div class=sb>${ago(l.date)}${o-l.odo>0?' · '+(o-l.odo).toLocaleString('en-IN')+' km ago':''}</div></div><b>${l.date}</b></div>`;
 return`<div class=card><div class=hd>Last done</div>${L.length?L.slice(0,6).map(row).join('')+(L.length>6?`<details><summary class=sb>Show ${L.length-6} more</summary>${L.slice(6).map(row).join('')}</details>`:''):'<p class=sb>Your last water service, oil change, air check, fuel fill and more will show here once you log them.</p>'}</div>`};
const PP=v=>{const P=v.partners;if(P.length<2)return'';const E=ents(v);return`<div class=card><div class=hd>Payments by partner</div>${P.map(p=>{const t=E.reduce((a,e)=>a+(e.pd[p]||0),0),sE=E.filter(e=>e.scope==='shared'),s=sE.reduce((a,e)=>a+(e.pd[p]||0),0),fs=sE.reduce((a,e)=>a+e.amt*((e.sh||{})[p]??100/P.length)/100,0),n=E.filter(e=>e.pd[p]>0).length;return`<div class=row><div>${esc(p)}<div class=sb>Shared paid ${money(s)} · Personal ${money(t-s)} · Fair share ${money(fs)} · ${n} entries</div></div><b>${money(t)}</b></div>`}).join('')}</div>`};
const S={
home(v){const L=v.logs,sum=t=>L.filter(l=>t.includes(l.t)).reduce((a,l)=>a+ +l.amt,0),tot=sum(Object.keys(TYPES)),m=mileage(v),al=alerts(v),o=odo(v),mo=L.filter(l=>l.date.slice(0,7)===today().slice(0,7)).reduce((a,l)=>a+ +l.amt,0);
 const lo=L.length?Math.min(...L.map(l=>+l.odo)):0,kms=o-Math.min(lo||o,+v.odo0||lo||o),cpk=kms>0?tot/kms:0,sv=due(v),lf=m.last,ls=lf&&m.seg.find(s=>s.id===lf.id);
 return`<div class="card"><span class=plate>${esc(v.plate||'NO PLATE')}</span> <b>${esc(v.name)}</b><div class=sb>${esc(v.model)}</div><div class=big>${o.toLocaleString('en-IN')} <small class=sb>km</small></div></div>
 <div class="al ${al.length?al[0].c:'ok'}">${al.length?`<b>${al.length} alert${al.length>1?'s':''}:</b> ${esc(al[0].t)}`:'All papers and services are up to date.'}</div>
 <div class=grid><div class=st><small>Running cost (logs)</small><b>${money(tot)}</b></div><div class=st><small>Fuel</small><b>${money(sum(['fuel']))}</b></div><div class=st><small>Maintenance</small><b>${money(sum(['maintenance']))}</b></div><div class=st><small>Mileage</small><b>${m.avg?m.avg.toFixed(1)+' km/L':'–'}</b></div>
 <div class=st><small>This month</small><b>${money(mo)}</b></div><div class=st><small>Cost per km</small><b>${cpk?'₹'+cpk.toFixed(2):'–'}</b></div></div>
 <div class=card style="margin-top:12px"><div class=hd>Last fuel fill-up</div>${lf?`<div class=grid><div class=st><small>Mileage</small><b>${ls?ls.e.toFixed(1)+' km/L':'–'}</b></div><div class=st><small>Price per litre</small><b>₹${(lf.amt/lf.lit).toFixed(2)}</b></div><div class=st><small>Liters</small><b>${lf.lit} L</b></div><div class=st><small>Amount</small><b>${money(lf.amt)}</b></div></div><p class=sb>${lf.date} · at ${(+lf.odo).toLocaleString('en-IN')} km${ls?' · '+ls.km+' km since previous fill-up':' · log one more fill-up to see mileage'}</p>`:'<p class=sb>Add a fuel entry in Log with km, liters and amount.</p>'}</div>
 ${lastCard(v)}
 <div class=card><div class=hd>Service reminders</div>${sv.length?sv.map(s=>`<div class=row><div>${esc(s.k)}<div class=sb>${s.kmL!==null?(s.kmL<=0?'Overdue by '+(-s.kmL)+' km':s.kmL+' km left'):''}${s.kmL!==null&&s.dL!==null?' · ':''}${s.dL!==null?(s.dL<=0?'Overdue by '+(-s.dL)+' days':s.dL+' days left'):s.days&&!s.lastDate?'Tap Mark done to start the day count':''}</div></div><span><span class="pill ${s.st}">${s.st==='bad'?'Due now':s.st==='warn'?'Soon':'OK'}</span> <button class=lk data-a=svc data-id=${s.id}>Mark done</button></span></div>`).join(''):'<p class=sb>Add a spec with a km or day interval in Profile to get service reminders.</p>'}</div>
 <div class=card><div class=hd>Monthly spend</div>${barChart(v)}</div><div class=card><div class=hd>Mileage trend (per fill-up)</div>${lineChart(m.seg)}</div>`},
add(v){const e=editId&&v.logs.find(l=>l.id===editId)||{},t=e.t||type;
 return`<div class=card><div class=hd>${e.id?'Edit entry':'Quick log'}${e.id?'<button class=lk data-a=cancel>Cancel</button>':''}</div>
 <div class=tabs>${Object.entries(TYPES).map(([k,n])=>`<button data-a=tab data-id=${k} class="${k===t?'on':''}">${n}</button>`).join('')}</div>
 <form data-f=log><input type=hidden name=t value=${t}>
 <div class=r2><label>Date<input type=date name=date value="${e.date||today()}" required></label><label>Odometer (km)<input type=number name=odo value="${e.odo??odo(v)}" required></label></div>
 <div class=r2><label>Category<select name=cat>${sel(db.cats[t]||[],e.cat)}</select></label><label>Amount (₹)<input type=number step=.01 min=0 name=amt value="${e.amt??''}" required></label></div><p class=sb id=lh style="margin:-2px 0 8px"></p>
 ${t==='fuel'?`<label>Liters (required)<input type=number step=.01 min=0.01 name=lit value="${e.lit||''}" required></label><p class=sb>Fill the tank each time. Mileage = km since your last fill-up ÷ liters.</p>`:''}
 ${payUI(v.partners,e,'personal')}
 <label>Note<input name=note value="${esc(e.note||'')}" placeholder="Optional"></label><button class=btn>Save entry</button></form></div>`},
prof(v){const P=v.partners.join(', ');
 return`<div class=card><div class=hd>Vehicle details</div><form data-f=veh><div class=r2><label>Name<input name=name value="${esc(v.name)}" required></label><label>Plate<input name=plate value="${esc(v.plate)}"></label></div>
 <div class=r2><label>Model / variant<input name=model value="${esc(v.model)}"></label><label>Starting odometer<input type=number name=odo0 value="${v.odo0||0}"></label></div>
 <label>Owners / partners (comma separated, max 4)<input name=partners value="${esc(P)}"></label><button class=btn>Save details</button></form></div>
 <div class=card><div class=hd>Reminders</div><form data-f=rem class=r2><label>Title<input name=title placeholder="e.g. Water service" required></label><label>Date<input type=date name=date required></label><button class="btn" style="grid-column:1/3">Add reminder</button></form>
 ${v.rem.map(r=>`<div class=row><div style="${r.done?'text-decoration:line-through;opacity:.6':''}">${esc(r.title)}<div class=sb>${r.date}</div></div><span>${r.done?'':`<button class=lk data-a=rdone data-id=${r.id}>Mark done</button>`}<button class="lk d" data-a=rdel data-id=${r.id}>Delete</button></span></div>`).join('')}</div>
 <div class=card><div class=hd>Document vault</div><form data-f=doc><div class=r2><label>Type<select name=type>${sel(DOCS)}</select></label><label>Expiry<input type=date name=exp required></label></div>
 <label>Number<input name=num></label><label>Photo (optional, images only)<input type=file name=img accept="image/jpeg,image/png,image/webp"></label><button class=btn>Save document</button></form>
 ${v.docs.map(d=>{const n=days(d.exp),c=n<0?'bad':n<=30?'warn':'';return`<div class=row><div>${esc(d.type)} <span class="pill ${c}">${n<0?'Expired':n<=30?n+' days left':'Valid'}</span><div class=sb>${esc(d.num||'')} · ${d.exp}</div></div><span>${d.img?`<button class=lk data-a=view data-id=${d.id}>View</button>`:''}<button class="lk d" data-a=ddel data-id=${d.id}>Delete</button></span></div>`}).join('')}</div>
 <div class=card><div class=hd>Technical specs <button class=lk data-a=share>Share</button></div><form data-f=spec><div class=r2><label>Group<input name=g placeholder="Engine" required></label><label>Item<input name=k placeholder="Engine oil" required></label></div>
 <label>Value<input name=v placeholder="5W-30, 3.5 L" required></label><div class=r2><label>Service every (km)<input type=number name=km></label><label>Service every (days)<input type=number name=days></label></div><button class=btn>Add spec</button></form>
 ${v.specs.map(s=>`<div class=row><div><b>${esc(s.g)}</b> · ${esc(s.k)}<div class=sb>${esc(s.v)}${+s.km?' · every '+s.km+' km':''}${+s.days?' · every '+s.days+' days':''}</div></div><span><button class=lk data-a=sedit data-id=${s.id}>Edit</button><button class="lk d" data-a=sdel data-id=${s.id}>Delete</button></span></div>`).join('')}</div>
 <div class=card><div class=hd>Gallery</div><form data-f=photo class=r2><label>Zone<select name=zone>${sel(ZONES)}</select></label><label>Photo<input type=file name=img accept="image/jpeg,image/png,image/webp" required></label><button class=btn style="grid-column:1/3">Add photo</button></form>
 <div class=ph>${Object.entries(v.photos).map(([z,d])=>`<div><img src="${d}" alt="${esc(z)}"><div class=row><span class=sb>${esc(z)}</span><button class="lk d" data-a=pdel data-id="${esc(z)}">Remove</button></div></div>`).join('')}</div></div>
 <div class=card><div class=hd>Damage log</div><form data-f=dmg><div class=r2><label>Body zone<select name=zone>${sel(ZONES)}</select></label><label>Date<input type=date name=date value="${today()}"></label></div><label>What happened<input name=note required></label><button class=btn>Add damage</button></form>
 ${v.damages.map(d=>`<div class=row><div>${esc(d.zone)}<div class=sb>${d.date} · ${esc(d.note)}</div></div><span><button class="lk" data-a=dtog data-id=${d.id}>${d.status==='Fixed'?'Fixed':'Pending'}</button><button class="lk d" data-a=dmgdel data-id=${d.id}>Delete</button></span></div>`).join('')}</div>`},
fin(v){const f=v.fin,pays=f.pays||[],L=v.logs,tot=t=>L.filter(l=>l.t===t).reduce((a,l)=>a+ +l.amt,0),emiPaid=(+f.paid||0)*(+f.emi||0)+pays.reduce((x,p)=>x+ +p.amt,0),acq=(+f.ex||0)+(+f.tax||0),up=+f.loan>0?(+f.down||0):acq,all=up+emiPaid+L.reduce((a,l)=>a+ +l.amt,0),net=ledger(v),left=Math.max(0,(+f.ten||0)-(+f.paid||0)-pays.length),ee=emiEdit&&pays.find(p=>p.id===emiEdit);
 return`<div class=card><div class=hd>Purchase & loan</div><form data-f=fin><div class=r2><label>Ex-showroom (₹)<input type=number name=ex value="${f.ex||''}"></label><label>Taxes & registration (₹)<input type=number name=tax value="${f.tax||''}"></label>
 <label>Down payment (₹)<input type=number name=down value="${f.down||''}"></label><label>Loan amount (₹)<input type=number name=loan value="${f.loan||''}"></label><label>Bank<input name=bank value="${esc(f.bank||'')}"></label><label>Monthly EMI (₹)<input type=number name=emi value="${f.emi||''}"></label>
 <label>Tenure (months)<input type=number name=ten value="${f.ten||''}"></label><label>EMIs paid before this app<input type=number name=paid value="${f.paid||0}"></label>${v.partners.length>1?`<div style="grid-column:1/3"><div class=sb style="margin-bottom:6px">Down / upfront payment (${money(up)})</div>${payUI(v.partners,{scope:f.downScope,pd:f.downPd||{[f.downBy||v.partners[0]]:up},sh:f.downSh},'shared')}</div>`:''}</div><button class=btn>Save finance</button></form></div>
 <div class=card><div class=hd>Spend summary</div>${[[+f.loan>0?'Down payment (paid upfront)':'Purchase & registration',up],['EMI paid so far',emiPaid],['Fuel',tot('fuel')],['Maintenance',tot('maintenance')],['RTO / buy logs',tot('purchase')],['Expenses',tot('expense')]].map(r=>`<div class=row><span>${r[0]}</span><b>${money(r[1])}</b></div>`).join('')}<div class=row><b>Lifetime total</b><b style="color:var(--ac)">${money(all)}</b></div><p class=sb>Vehicle price ${money(acq)}. The loan part is counted through EMIs as you pay them.</p></div>
 <div class=card><div class=hd>Loan overview</div><div class=row><span>${esc(f.bank||'Loan')} · ${money(f.loan)}</span><b>${money(f.emi)}/mo</b></div><div class=row><span>${(+f.paid||0)+pays.length} paid · ${left} left</span><b>${money(left*(+f.emi||0))} to pay</b></div></div>
 <div class=card><div class=hd>EMI payments${ee?'<button class=lk data-a=emicancel>Cancel</button>':''}</div><form data-f=emi><div class=r2><label>Date<input type=date name=date value="${ee?ee.date:today()}" required></label><label>Amount (₹)<input type=number step=.01 min=0 name=amt value="${ee?ee.amt:(f.emi||'')}" required></label></div>${payUI(v.partners,ee,'shared')}<label>Note<input name=note value="${esc(ee?ee.note:'')}" placeholder="Optional"></label><button class=btn>${ee?'Update EMI':'Add EMI payment'}</button></form>
 ${pays.slice().sort((x,y)=>y.date.localeCompare(x.date)).map(p=>`<div class=row><div>${money(p.amt)}<div class=sb>${p.date}${payTxt(p,v.partners)}${p.note?' · '+esc(p.note):''}</div></div><span><button class=lk data-a=emiedit data-id=${p.id}>Edit</button><button class="lk d" data-a=emidel data-id=${p.id}>Delete</button></span></div>`).join('')}</div>
 <div class=card><div class=hd>Partner ledger <button class=lk data-a=settle>Settle up</button></div>${v.partners.length<2?'<p class=sb>Add a second partner in Profile to split shared costs.</p>':Object.entries(net).map(([p,n])=>`<div class=row><span>${esc(p)}</span><b style="color:${n>0.5?'var(--ok)':n<-0.5?'var(--bd)':'var(--sb)'}">${n>0.5?'is owed '+money(n):n<-0.5?'owes '+money(-n):'settled'}</b></div>`).join('')}
 ${v.settles.map(s=>`<div class=row><span class=sb>Settled on ${s.date}</span><button class="lk d" data-a=undo data-id=${s.id}>Undo</button></div>`).join('')}</div>${PP(v)}`},
logs(v){return`<div class=card><div class=hd>History <span><button class=lk data-a=csv>CSV</button><button class=lk data-a=pdf>PDF</button></span></div><input id=q placeholder="Search note, category or date" value="${esc(F.q)}">
 <div class=r2 style="margin-top:8px"><select id=ft><option value=all>All types</option>${Object.entries(TYPES).map(([k,n])=>`<option value=${k} ${F.t===k?'selected':''}>${n}</option>`).join('')}</select><select id=fs><option value=new ${F.s==='new'?'selected':''}>Newest</option><option value=old ${F.s==='old'?'selected':''}>Oldest</option><option value=hi ${F.s==='hi'?'selected':''}>Highest amount</option></select></div></div><div id=lst></div>`}
};
function filt(v){let r=v.logs.filter(l=>(F.t==='all'||l.t===F.t)&&(!F.q||[l.note,l.cat,l.date,l.t].join(' ').toLowerCase().includes(F.q.toLowerCase())));
 return r.sort((a,b)=>F.s==='hi'?b.amt-a.amt:F.s==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))}
function list(){const v=V(),r=filt(v);$('#lst').innerHTML=`<div class="al ok">${r.length} entries · Total <b>${money(r.reduce((a,l)=>a+ +l.amt,0))}</b></div>`+r.map(l=>`<div class=card><div class=hd><span>${esc(l.cat)} · ${money(l.amt)}</span><span><button class=lk data-a=ledit data-id=${l.id}>Edit</button><button class="lk d" data-a=ldel data-id=${l.id}>Delete</button></span></div><div class=sb>${l.date} · ${TYPES[l.t]} · ${(+l.odo).toLocaleString('en-IN')} km${l.lit?' · '+l.lit+' L @ ₹'+(l.amt/l.lit).toFixed(1):''} · ${payTxt(l,v.partners)}</div>${l.note?`<details><summary class=sb>Note</summary>${esc(l.note)}</details>`:''}</div>`).join('')}
function setS(){const u=db.user,p=db.pin;
 return`<div class=card><div class=hd>Categories</div><p class=sb>Add, rename or delete your fuel, maintenance, RTO/buy and expense categories.</p><button class=btn data-a=cats>Manage categories</button></div>
 <div class=card><div class=hd>App lock</div><form data-f=pin><label>${p?'New 6-character PIN':'Set a 6-character PIN (letters and digits)'}<input name=p maxlength=6 pattern="[A-Za-z0-9]{6}" required autocomplete=off></label>
 <label class=ck style="padding:0 0 8px"><input type=checkbox name=ask ${!p||p.ask!==false?'checked':''}> Ask for PIN every time the app opens</label><button class=btn>${p?'Change PIN':'Turn on PIN lock'}</button></form>${p?'<button class="btn g" data-a=pinoff>Turn off PIN lock</button>':''}</div>
 <div class=card><div class=hd>Account</div>${u?`<p>Signed in as <b>${esc(u)}</b></p><button class="btn g" data-a=signout>Sign out</button>`:`<p class=sb>You are using the app as a guest. Your data stays on this device. Sign in to use cloud backup.</p><form data-f=auth><label>Email<input type=email name=e required></label><label>Password (min 6)<input type=password name=p minlength=6 required></label><div class=r2><button class=btn name=m value=in>Sign in</button><button class="btn g" name=m value=up>Register</button></div><button type=button class=lk data-a=pwreset>Forgot password?</button></form>`}</div>
 ${teamCard()}<div class=card><div class=hd>Backup</div><p class=sb>Last backup: ${db.lastBackup?new Date(db.lastBackup).toLocaleString():'never'}</p><button class=btn data-a=jx>Export JSON file</button>
 <label style="margin-top:8px">Import JSON file<input type=file id=jin accept=".json,application/json"></label></div>`}

/* ---------- render ---------- */
function render(keep){const v=V();$('#vsel').innerHTML=db.v.map(x=>`<option value=${x.id} ${x.id===v.id?'selected':''}>${esc(x.name)} ${esc(x.plate)}</option>`).join('');
 const al=alerts(v),b=$('#bgc');b.textContent=al.length;b.classList.toggle('hide',!al.length);
 $('#nav').innerHTML=NAV.map(n=>`<button data-a=nav data-id=${n[0]} class="${scr===n[0]?'on':''}"><b>${n[1]}</b>${n[2]}</button>`).join('');
 $('#main').innerHTML=scr==='set'?setS():S[scr](v);if(scr==='logs')list();document.querySelectorAll('form[data-f]').forEach(syncPay);updHint();if(MD&&(!keep||!typing()))showModal();if(!keep)scrollTo(0,0)}
function panel(){const v=V(),al=alerts(v);$('#plist').innerHTML=al.length?al.map(a=>`<div class="al ${a.c}">${esc(a.t)} ${a.rid?`<button class=lk data-a=rdone data-id=${a.rid}>Mark done</button>`:a.sid?`<button class=lk data-a=svc data-id=${a.sid}>Mark done</button>`:''}</div>`).join(''):'<p class=sb>Nothing needs attention right now.</p>';$('#panel').classList.remove('hide')}

/* ---------- Firebase ---------- */
const FB=()=>fb||(fb=new Promise((ok,no)=>{const c=window.FIREBASE_CONFIG;if(!c||!c.apiKey||/YOUR/.test(c.apiKey))return no(Error('Add your Firebase settings to firebase-config.js first.'));
 let n=0;['app','auth','firestore'].forEach(x=>{const s=document.createElement('script');s.src=`https://www.gstatic.com/firebasejs/10.14.1/firebase-${x}-compat.js`;s.onload=()=>{if(++n===3){firebase.initializeApp(c);ok(firebase)}};s.onerror=()=>no(Error('Could not load Firebase. Check your internet connection.'));document.head.appendChild(s)})}));
const F_=async()=>{try{return await FB()}catch(e){fb=null;throw e}};
const fuser=async()=>{const f=await F_();return await new Promise(r=>{const u=f.auth().onAuthStateChanged(x=>{u();r(x)})})};
const guard=fn=>async(...a)=>{try{await fn(...a)}catch(e){alert(e.message||e)}};
const cloud={
 auth:guard(async(e,p,m)=>{const f=await F_(),a=f.auth();await(m==='up'?a.createUserWithEmailAndPassword(e,p):a.signInWithEmailAndPassword(e,p));db.user=e;save();toast('Signed in');render();await teamBoot()}),
 out:guard(async()=>{const f=await F_();await f.auth().signOut();teamStop();db.user=null;save();render()})};

/* ---------- Team sync (Firestore) ---------- */
const cj=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(x=>[x,v[x]])):v);
const typing=()=>/INPUT|SELECT|TEXTAREA/.test(document.activeElement&&document.activeElement.tagName||'');
const FS=()=>firebase.firestore(),hasLocal=()=>db.v.some(v=>v.logs.length||v.specs.length||v.docs.length||v.damages.length||v.rem.length);
function flat(){const m={};db.v.forEach(v=>{const{photos,specs,docs,damages,logs,settles,rem,...x}=v;m['v_'+v.id]={_k:'veh',vid:v.id,...x};
 [['l','log',logs],['s','spec',specs],['d','doc',docs],['g','dmg',damages],['t','settle',settles],['r','rem',rem]].forEach(([p,k,arr])=>arr.forEach(i=>{const{img,...y}=i;m[p+'_'+i.id]={_k:k,vid:v.id,...y}}))});
 m.cfg={_k:'cfg',cats:db.cats};return JSON.parse(JSON.stringify(m))}
function applyRemote(){const R=Object.values(TM.remote),old=Object.fromEntries(db.v.map(v=>[v.id,v])),img={};db.v.forEach(v=>v.docs.forEach(d=>{img[d.id]=d.img}));
 const vs=R.filter(r=>r._k==='veh').map(r=>{const{_k,vid,...x}=r,o=old[x.id]||{};return{...newV(x.name,x.plate),...x,photos:o.photos||{}}});
 const MAP={log:'logs',spec:'specs',doc:'docs',dmg:'damages',settle:'settles',rem:'rem'};
 R.forEach(r=>{const a=MAP[r._k],v=a&&vs.find(x=>x.id===r.vid);if(!v)return;const{_k,vid,...x}=r;if(a==='docs'&&img[x.id])x.img=img[x.id];v[a].push(x)});
 const c=R.find(r=>r._k==='cfg');if(c)db.cats=c.cats;if(vs.length){db.v=vs;if(!vs.find(v=>v.id===db.act))db.act=vs[0].id}fix(db);lsave()}
let pt=null;
function push(){clearTimeout(pt);if(!TM.on)return;pt=setTimeout(async()=>{if(!TM.on)return;const m=flat(),w=[];
 for(const k in m)if(cj(m[k])!==TM.sent[k])w.push(['set',k,m[k]]);for(const k in TM.sent)if(!(k in m))w.push(['del',k]);if(!w.length)return;
 try{const fs=FS(),c=fs.collection('hub');for(let i=0;i<w.length;i+=400){const b=fs.batch();w.slice(i,i+400).forEach(x=>x[0]==='set'?b.set(c.doc(x[1]),x[2]):b.delete(c.doc(x[1])));await b.commit()}
  w.forEach(x=>x[0]==='set'?TM.sent[x[1]]=cj(x[2]):delete TM.sent[x[1]]);db.lastBackup=Date.now();lsave()}
 catch(e){if(/permission/i.test((e.code||'')+(e.message||''))){alert('You have read-only access, so this change was not saved to the team.');applyRemote();render(true)}else toast('Could not sync. Will retry when online.')}},800)}
async function teamEnsure(u){await F_();const r=FS().collection('users').doc(u.uid),s=await r.get();if(!s.exists)await r.set({email:u.email,name:(u.email||'').split('@')[0],status:'pending',role:'member'})}
function hubStop(){if(TM.hub){TM.hub();TM.hub=null}TM.on=false;TM.remote={};TM.sent={}}
function teamStop(){['un','uu','hub'].forEach(k=>{if(TM[k]){TM[k]();TM[k]=null}});TM.on=false;TM.remote={};TM.sent={};TM.users=[];TM.role=TM.status=null;TM.declined=false}
function hubStart(){if(TM.hub)return;let first=true;TM.hub=FS().collection('hub').onSnapshot(snap=>{
 snap.docChanges().forEach(c=>{if(c.type==='removed'){delete TM.remote[c.doc.id];delete TM.sent[c.doc.id]}else{const d=c.doc.data();TM.remote[c.doc.id]=d;TM.sent[c.doc.id]=cj(d)}});
 if(first){first=false;
  if(snap.empty){TM.on=true;db.team=TM.uid;lsave();push()}
  else{if(db.team!==TM.uid&&hasLocal()&&!confirm("The team already has data. This device's own data will be replaced. Export a JSON backup first if you want to keep it. Replace now?")){hubStop();TM.declined=true;render(true);return}
   TM.on=true;db.team=TM.uid;applyRemote();render(true)}
  return}
 if(!snap.metadata.hasPendingWrites){applyRemote();typing()?TM.pend=true:render(true)}},()=>toast('Sync error'))}
function teamWatch(u){teamStop();TM.uid=u.uid;TM.un=FS().collection('users').doc(u.uid).onSnapshot(s=>{const d=s.data()||{};TM.role=d.role;TM.status=s.exists?d.status:'removed';
 if(d.status==='approved'){hubStart();if(d.role==='admin'&&!TM.uu)TM.uu=FS().collection('users').onSnapshot(q=>{TM.users=q.docs.map(x=>({id:x.id,...x.data()})).sort((x,y)=>(x.status==='pending'?0:1)-(y.status==='pending'?0:1));if(!typing())render(true)},()=>{});
  if(d.role!=='admin'&&TM.uu){TM.uu();TM.uu=null;TM.users=[]}}else hubStop();
 if(!typing())render(true)},()=>toast('Team connection failed'))}
async function teamBoot(){const u=await fuser();if(!u)return;await teamEnsure(u);teamWatch(u)}
async function autoTeam(){const c=window.FIREBASE_CONFIG;if(!db.user||!c||/YOUR/.test(c.apiKey))return;try{await teamBoot()}catch(e){}}
const catsHtml=()=>Object.keys(TYPES).map(t=>`<div class=sb style="margin-top:8px"><b>${TYPES[t]}</b></div>${(db.cats[t]||[]).map((c,i)=>`<div class=row><span>${esc(c)}</span><span><button class=lk data-a=cedit data-t=${t} data-id=${i}>Edit</button><button class="lk d" data-a=cdel data-t=${t} data-id=${i}>Delete</button></span></div>`).join('')}<form data-f=cat class=r2><input type=hidden name=t value=${t}><input name=n placeholder="New category" required><button class="btn g" style="margin:0">Add</button></form>`).join('');
function adminHtml(){if(Date.now()-(TM.adminOk||0)>3e5)return`<p class=sb>For privacy, confirm your password to open this section. It locks again after 5 minutes or when you leave the app.</p><form data-f=adminpw><label>Password<input type=password name=p required autocomplete=current-password></label><button class=btn>Unlock</button></form>`;
 return`<p class=sb>${TM.users.length} people · ${TM.users.filter(m=>m.status==='pending').length} waiting</p>${TM.users.map(m=>`<div class=row style="flex-wrap:wrap"><div>${esc(m.email)}<div class=sb>${esc(m.role)} · ${esc(m.status)}</div></div>${m.id===TM.uid?'<span class=sb>You</span>':`<span style="width:100%">${m.status==='approved'?tb(m.id,'status','blocked','Block','d'):tb(m.id,'status','approved','Approve')}${m.role!=='member'?tb(m.id,'role','member','Member'):''}${m.role!=='viewer'?tb(m.id,'role','viewer','Viewer'):''}${m.role!=='admin'?tb(m.id,'role','admin','Admin'):''}<button class="lk d" data-a=tmdel data-id="${m.id}">Remove</button></span>`}</div>`).join('')}<button class="btn g" data-a=alock>Lock now</button>`}
function showModal(){if(!MD)return;$('#mt').textContent=MD.t;$('#mb').innerHTML=MD.fn();$('#modal').classList.remove('hide')}
const openModal=(t,fn)=>{MD={t,fn};showModal()},closeModal=()=>{MD=null;$('#modal').classList.add('hide')};
document.addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&TM.adminOk){TM.adminOk=0;if(MD&&MD.t==='Administrator')closeModal()}});
const tb=(u,f,v,l,c)=>`<button class="lk ${c||''}" data-a=tm data-id="${u}|${f}|${v}">${l}</button>`;
function teamCard(){if(!db.user)return`<div class=card><div class=hd>Team</div><p class=sb>Sign in or register in the Account card above to join your team. After the admin approves you, your data syncs between everyone.</p></div>`;
 const st=TM.status,msg=TM.declined?'Sync is off on this device. Sign out and sign in again to retry.':!st?'Connecting...':st==='approved'?'Approved as <b>'+esc(TM.role)+'</b>.':st==='blocked'?'Your access is blocked. Contact the admin.':st==='removed'?'Your access was removed. Sign out and register again to ask for access.':'Waiting for the admin to approve you.';
 return`<div class=card><div class=hd>Team ${TM.on?'<span class=pill>Synced</span>':''}</div><p>${msg}</p>${TM.role==='viewer'&&st==='approved'?'<p class=sb>Read-only: you can view shared data but not change it.</p>':''}<p class=sb>Photos and document images stay on each device for now.</p>
 ${TM.role==='admin'&&st==='approved'?`<p class=sb>${TM.users.length} people · ${TM.users.filter(m=>m.status==='pending').length} waiting</p><button class=btn data-a=admin>Administrator panel</button>`:''}</div>`}
document.addEventListener('focusout',()=>setTimeout(()=>{if(TM.pend&&!typing()){TM.pend=false;render(true)}},400));

/* ---------- actions ---------- */
const dl=(name,txt,mime)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:mime}));a.download=name;a.click()};
const A={
 nav:id=>{scr=id;if(id!=='add')editId=null;render()},tab:id=>{type=id;render()},cancel:()=>{editId=null;scr='logs';render()},close:()=>$('#panel').classList.add('hide'),
 svc:id=>{const s=V().specs.find(x=>x.id===id);s.lastOdo=odo(V());s.lastDate=today();save();render();if(!$('#panel').classList.contains('hide'))panel()},
 rdone:id=>{V().rem.find(x=>x.id===id).done=true;save();render();if(!$('#panel').classList.contains('hide'))panel()},
 rdel:id=>{V().rem=V().rem.filter(x=>x.id!==id);save();render()},
 ddel:id=>confirm('Delete this document?')&&(V().docs=V().docs.filter(x=>x.id!==id),save(),render()),
 view:id=>{const d=V().docs.find(x=>x.id===id);open().document.write(`<img src="${d.img}" style="max-width:100%">`)},
 sdel:id=>confirm('Delete this spec?')&&(V().specs=V().specs.filter(x=>x.id!==id),save(),render()),
 sedit:id=>{const s=V().specs.find(x=>x.id===id),n=prompt('Value for '+s.k,s.v);if(n){s.v=n;save();render()}},
 share:()=>{const v=V(),g={};v.specs.forEach(s=>(g[s.g]=g[s.g]||[]).push(`${s.k}: ${s.v}`));const t=`${v.name} ${v.plate}\n${v.model}\n\n`+Object.entries(g).map(([k,a])=>k+'\n'+a.join('\n')).join('\n\n');
  navigator.share?navigator.share({title:v.name,text:t}).catch(()=>{}):navigator.clipboard.writeText(t).then(()=>toast('Copied to clipboard'))},
 pdel:id=>{delete V().photos[id];save();render()},dtog:id=>{const d=V().damages.find(x=>x.id===id);d.status=d.status==='Fixed'?'Pending':'Fixed';save();render()},
 dmgdel:id=>{V().damages=V().damages.filter(x=>x.id!==id);save();render()},
 emiedit:id=>{emiEdit=id;render();$('[data-f=emi]').scrollIntoView()},emicancel:()=>{emiEdit=null;render()},emidel:id=>confirm('Delete this EMI payment?')&&(V().fin.pays=V().fin.pays.filter(p=>p.id!==id),save(),render()),
 settle:()=>{const v=V(),n=ledger(v);if(Object.values(n).every(x=>Math.abs(x)<.5))return toast('Already settled');if(confirm('Record a settlement and reset the balance to ₹0?')){v.settles.push({id:uid(),date:today(),net:n});save();render()}},
 undo:id=>{V().settles=V().settles.filter(x=>x.id!==id);save();render()},
 ledit:id=>{editId=id;scr='add';render()},ldel:id=>confirm('Delete this entry?')&&(V().logs=V().logs.filter(x=>x.id!==id),save(),render()),
 csv:()=>{const v=V(),q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';dl(v.name+'-logs.csv',['Date,Type,Category,Amount,Odometer,Liters,Paid as,Paid by,Note',...filt(v).map(l=>[l.date,l.t,l.cat,l.amt,l.odo,l.lit,l.scope,l.payer,l.note].map(q).join(','))].join('\n'),'text/csv')},
 pdf:()=>{const v=V(),r=filt(v),w=open('','_blank');if(!w)return alert('Allow pop-ups to save a PDF.');w.document.write(`<title>${esc(v.name)} history</title><style>body{font:12px sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left}</style><h2>${esc(v.name)} ${esc(v.plate)}</h2><table><tr><th>Date<th>Type<th>Category<th>Amount<th>Odo<th>Note</tr>${r.map(l=>`<tr><td>${l.date}<td>${TYPES[l.t]}<td>${esc(l.cat)}<td>${l.amt}<td>${l.odo}<td>${esc(l.note)}</tr>`).join('')}</table><p><b>Total: ${money(r.reduce((a,l)=>a+ +l.amt,0))}</b></p>`);w.document.close();w.print()},
 cedit:(id,b)=>{const t=b.dataset.t,n=prompt('Rename category',db.cats[t][id]);if(n&&n.trim()){db.cats[t][id]=n.trim();save();render()}},
 cdel:(id,b)=>{const t=b.dataset.t;confirm('Delete "'+db.cats[t][id]+'"?')&&(db.cats[t].splice(id,1),save(),render())},
 pinoff:()=>{db.pin=null;localStorage.removeItem('mk_ok');save();render()},signout:()=>confirm('Sign out?')&&cloud.out(),pwreset:guard(async()=>{const e=prompt('Enter your account email');if(!e)return;const f=await F_();await f.auth().sendPasswordResetEmail(e);alert('If this email has an account, a reset link was sent.')}),cats:()=>openModal('Categories',catsHtml),mclose:closeModal,alock:()=>{TM.adminOk=0;showModal()},
 admin:()=>{if(TM.role==='admin'&&TM.status==='approved')openModal('Administrator',adminHtml)},
 tm:guard(async id=>{const[u,f,v]=id.split('|'),m=TM.users.find(x=>x.id===u);if(!confirm('Set '+f+' to "'+v+'" for '+(m?m.email:'this person')+'?'))return;await FS().collection('users').doc(u).update({[f]:v});toast('Updated')}),
 tmdel:guard(async id=>{if(confirm('Remove this member? They can ask for access again.'))await FS().collection('users').doc(id).delete()}),
 jx:()=>{const d=JSON.parse(JSON.stringify(db));delete d.pin;dl('vehiclehub-backup-'+today()+'.json',JSON.stringify(d),'application/json');db.lastBackup=Date.now();save();render()}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)A[b.dataset.a]?.(b.dataset.id,b)});
$('#bell').onclick=panel;
$('#vsel').onchange=e=>{db.act=e.target.value;save();render()};
$('#vadd').onclick=()=>{const n=prompt('Vehicle name');if(!n)return;const v=newV(n,(prompt('Plate number (optional)')||'').toUpperCase());db.v.push(v);db.act=v.id;save();scr='prof';render()};
$('#vdel').onclick=()=>{if(db.v.length<2)return alert('Keep at least one vehicle.');const v=V();if(confirm(`Delete ${v.name} and all its data?`)){db.v=db.v.filter(x=>x!==v);db.act=db.v[0].id;save();render()}};
document.addEventListener('input',e=>{if(e.target.id==='q'){F.q=e.target.value;list()}});
document.addEventListener('change',e=>{if(e.target.id==='ft'){F.t=e.target.value;list()}if(e.target.id==='fs'){F.s=e.target.value;list()}
 if(e.target.id==='jin'){const f=e.target.files[0];if(!f)return;if(!/\.json$/i.test(f.name))return alert('Only .json backup files are accepted.');f.text().then(t=>{try{const d=JSON.parse(t);if(!d.v)throw 0;if(!confirm('Importing replaces the data on this device. Continue?'))return;const pin=db.pin,u=db.user;db=fix(d);db.pin=pin;db.user=u;if(!db.v.find(x=>x.id===db.act))db.act=db.v[0].id;save();render();toast('Imported')}catch(x){alert('This is not a valid VehicleHub backup file.')}})}});
const hash=async p=>{const s='mk|'+p;if(!crypto.subtle)return btoa(s);return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')};
const FORM={
 log(o,v){const q=parsePay(o,v.partners,+o.amt),e={t:o.t,date:o.date,odo:+o.odo,cat:o.cat,amt:+o.amt,lit:+o.lit||0,full:o.t==='fuel',scope:q.scope,pd:q.pd,sh:q.sh,payer:Object.keys(q.pd)[0],note:o.note};
  if(editId){Object.assign(v.logs.find(l=>l.id===editId),e);editId=null}else v.logs.push({id:uid(),...e});save();toast('Saved');scr='logs';render()},
 veh(o,v){Object.assign(v,{name:o.name,plate:o.plate.toUpperCase(),model:o.model,odo0:+o.odo0||0});const p=o.partners.split(',').map(s=>s.trim()).filter(Boolean).slice(0,4);v.partners=p.length?p:['You'];save();toast('Saved');render()},
 rem(o,v){v.rem.push({id:uid(),title:o.title,date:o.date,done:false});save();render()},
 spec(o,v){v.specs.push({id:uid(),g:o.g,k:o.k,v:o.v,km:+o.km||0,days:+o.days||0});save();render()},
 dmg(o,v){v.damages.push({id:uid(),zone:o.zone,note:o.note,date:o.date,status:'Pending'});save();render()},
 fin(o,v){const up=+o.loan>0?+o.down||0:(+o.ex||0)+(+o.tax||0),q=up>0?parsePay(o,v.partners,up):{scope:'personal',pd:null,sh:null};v.fin={pays:v.fin.pays||[],downBy:q.pd?Object.keys(q.pd)[0]:'',downScope:q.scope,downPd:q.pd,downSh:q.sh,ex:+o.ex||0,tax:+o.tax||0,down:+o.down||0,loan:+o.loan||0,bank:o.bank,emi:+o.emi||0,ten:+o.ten||0,paid:+o.paid||0};save();toast('Saved');render()},
 emi(o,v){const f=v.fin,q=parsePay(o,v.partners,+o.amt),r={date:o.date,amt:+o.amt,note:o.note,scope:q.scope,pd:q.pd,sh:q.sh,payer:Object.keys(q.pd)[0]};f.pays=f.pays||[];if(emiEdit){Object.assign(f.pays.find(p=>p.id===emiEdit),r);emiEdit=null}else f.pays.push({id:uid(),...r});save();toast('Saved');render()},
 cat(o){db.cats[o.t].push(o.n.trim());save();render()},
 async adminpw(o){const f=await F_(),u=f.auth().currentUser;if(!u)throw Error('Please sign in again.');await u.reauthenticateWithCredential(f.auth.EmailAuthProvider.credential(u.email,o.p));TM.adminOk=Date.now();clearTimeout(TM.al);TM.al=setTimeout(()=>{TM.adminOk=0;if(MD&&MD.t==='Administrator')showModal()},3e5);showModal()},
 async doc(o,v,f){const d={id:uid(),type:o.type,num:o.num,exp:o.exp};if(f.get('img').size)d.img=await pic(f.get('img'));v.docs.push(d);save();render()},
 async photo(o,v,f){v.photos[o.zone]=await pic(f.get('img'));save();render()},
 async pin(o){if(!/^[A-Za-z0-9]{6}$/.test(o.p))return alert('The PIN must be exactly 6 letters or digits.');const h=await hash(o.p);db.pin={h,ask:!!o.ask};if(db.pin.ask)localStorage.removeItem('mk_ok');else localStorage.setItem('mk_ok',h);save();toast('PIN lock is on');render()},
 auth(o,v,f,ev){cloud.auth(o.e,o.p,ev.submitter?.value||'in')}};
document.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),k=e.target.dataset.f;try{await FORM[k](Object.fromEntries(f),V(),f,e)}catch(x){alert(x.message||x)}});

document.addEventListener('change',e=>{const t=e.target;if(t.form&&['scope','payer','splitm'].includes(t.name))syncPay(t.form);if(t.name==='cat'||t.name==='t')updHint()});
document.addEventListener('input',e=>{const t=e.target;if(t.name&&t.name.startsWith('sh_')&&t.form.querySelectorAll('[name^=sh_]').length===2){const o=t.form.querySelector('[name='+(t.name==='sh_0'?'sh_1':'sh_0')+']');o.value=Math.round((100-(+t.value||0))*100)/100}});
/* ---------- lock ---------- */
function start(){render();autoTeam()}
function lockCheck(){const p=db.pin;if(p&&!(p.ask===false&&localStorage.getItem('mk_ok')===p.h)){$('#lock').classList.remove('hide');$('#pin').focus()}else start()}
$('#unlock').onclick=async()=>{const h=await hash($('#pin').value);if(h===db.pin.h){if(db.pin.ask===false)localStorage.setItem('mk_ok',h);$('#lock').classList.add('hide');$('#pin').value='';start()}else $('#pinerr').textContent='Wrong PIN. Try again.'};
$('#pin').onkeydown=e=>e.key==='Enter'&&$('#unlock').click();
$('#forgot').onclick=guard(async()=>{if(!db.user)return alert('PIN reset needs an account. You are in guest mode, so the only way to remove the lock is to clear this app\'s site data (this erases local data).');
 const p=prompt('Enter the password for '+db.user+' to remove the PIN');if(!p)return;const f=await F_();await f.auth().signInWithEmailAndPassword(db.user,p);db.pin=null;localStorage.removeItem('mk_ok');save();$('#lock').classList.add('hide');start();toast('PIN removed. Set a new one in Settings.')});
lockCheck();
