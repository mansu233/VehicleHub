'use strict';
const $=s=>document.querySelector(s),LS='mk_db_v6';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,9),today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const days=d=>Math.ceil((new Date(d)-new Date(today()))/864e5);
const ZONES=['Front','Rear','Left side','Right side','Bumpers','Doors','Interior'];
const TYPES={fuel:'Fuel',maintenance:'Maint.',purchase:'RTO/Buy',expense:'Expense'};
const DOCS=['RC','Insurance','PUC','Driving License','Other'];
const DEF={fuel:['Petrol','Diesel','CNG','EV charging'],maintenance:['Oil change','Water service','Air check','Tyres','Brakes','Battery','General service'],purchase:['RTO & registration','Insurance premium','Accessories','Loan fee'],expense:['Toll','Parking','Car wash','Fine']};
const NAV=[['home','⌂','Home'],['add','＋','Log'],['prof','🚘','Profile'],['fin','₹','Finance'],['logs','☰','History'],['set','⚙','Settings']];
const sel=(a,o)=>a.map(i=>`<option ${i===o?'selected':''}>${esc(i)}</option>`).join('');
let scr='home',type='fuel',editId=null,fb=null,emiEdit=null,F={q:'',t:'all',s:'new'};

let MD=null,TM={vperms:{},seen:{},hubs:{},sel:{},open:{},perms:{},reqs:[],users:[],sent:{},remote:{},on:false};
const newV=(name,plate)=>({id:uid(),name,plate,model:'',odo0:0,partners:['You','Partner'],specs:[],docs:[],photos:{},damages:[],logs:[],fin:{pays:[]},settles:[],rem:[]});
function fix(d){d.v.forEach(v=>{['specs','docs','damages','logs','settles','rem'].forEach(k=>v[k]=Object.values(v[k]||{}));v.photos=v.photos||{};v.fin=v.fin||{};v.fin.pays=Object.values(v.fin.pays||{});v.partners=Object.values(v.partners||['You'])});d.cats=d.cats||DEF;return d}
function load(){try{const d=JSON.parse(localStorage.getItem(LS));if(d&&d.v){fix(d);if(!d.m7){d.m7=1;d.cats.maintenance=d.cats.maintenance||[];['Water service','Air check'].forEach(c=>d.cats.maintenance.includes(c)||d.cats.maintenance.push(c))}return d}}catch(e){}const v=newV('My Vehicle','');return{v:[v],act:v.id,cats:DEF,m7:1,pin:null,lastBackup:null,user:null}}
let db=load();
const lsave=()=>{try{localStorage.setItem(LS,JSON.stringify(db))}catch(e){try{localStorage.setItem(LS,JSON.stringify(db,(k,v)=>k==='photos'||k==='img'?undefined:v))}catch(e2){alert('Storage is full. Export a JSON backup, then remove old photos.')}}};
const save=()=>{lsave();push()};
const V=()=>db.v.find(x=>x.id===db.act)||db.v[0];
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hide');setTimeout(()=>e.classList.add('hide'),2200)}

/* ---------- calculations ---------- */
const odo=v=>Math.max(+v.odo0||0,0,...v.logs.map(l=>+l.odo||0));
function mileage(v){const f=v.logs.filter(l=>l.t==='fuel'&&+l.lit>0).sort((a,b)=>a.odo-b.odo),n=f.length,tank=+v.tank||0;
 const win=(s,e)=>{const km=f[e].odo-f[s].odo,L=f.slice(s+1,e+1).reduce((a,l)=>a+ +l.lit,0);return L>0&&km>0?{km,L,e:km/L}:null};
 const fi=f.map((l,i)=>l.fl?i:-1).filter(i=>i>=0);let all=null,exact=false;
 if(fi.length>=2){all=win(fi[0],fi[fi.length-1]);exact=!!all}
 if(!all&&n>=2)all=win(0,n-1);
 const r5=n>=2?win(Math.max(0,n-6),n-1):null,pts=[];for(let i=1;i<n;i++){const p=win(Math.max(0,i-5),i);if(p)pts.push(p.e)}
 const acc=!all?'':exact?'Exact (full tank to full tank)':tank?(p=>'Estimate, about ±'+p+'%'+(p>25?' (improves with more fills)':''))(Math.min(99,Math.round(tank/all.L*100))):'Estimate. Add your tank size in Profile to see accuracy';
 const last=f[n-1],prev=f[n-2],prevKm=prev?last.odo-prev.odo:0,lastExact=last&&prev&&last.fl&&prev.fl&&prevKm>0?prevKm/last.lit:0;
 return{avg:all?all.e:0,exact,acc,r5:r5?r5.e:0,pts,last,prevKm,lastExact,n}}
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
 if(TM.role==='admin'&&TM.status==='approved'){const q=TM.reqs.filter(r=>r.status==='pending').length;if(q)a.push({c:'warn',t:`${q} change request${q>1?'s are':' is'} waiting for your approval (Settings, Administrator panel)`})}
 return a}

/* ---------- images (images only, compressed) ---------- */
const okImg=f=>f&&/^image\/(jpe?g|png|webp)$/i.test(f.type)&&/\.(jpe?g|png|webp)$/i.test(f.name);
const thumbPic=f=>new Promise((ok,no)=>{if(!okImg(f))return no(Error('Only JPG, PNG or WEBP images are allowed.'));const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const s=Math.min(i.width,i.height),c=document.createElement('canvas');c.width=c.height=160;c.getContext('2d').drawImage(i,(i.width-s)/2,(i.height-s)/2,s,s,0,0,160,160);ok(c.toDataURL('image/jpeg',.75))};i.onerror=()=>no(Error('This image could not be read.'));i.src=r.result};r.readAsDataURL(f)});
const pic=f=>new Promise((ok,no)=>{if(!okImg(f))return no(Error('Only JPG, PNG or WEBP images are allowed. Other files (APK, MP3, etc.) are blocked.'));
 const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,800/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);ok(c.toDataURL('image/jpeg',.68))};i.onerror=()=>no(Error('This image could not be read.'));i.src=r.result};r.readAsDataURL(f)});

/* ---------- screens ---------- */
function barChart(v){const m={},ks=[],MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],add=(d,x)=>{const k=(d||'').slice(0,7);m[k]=(m[k]||0)+ +x};
 v.logs.forEach(l=>add(l.date,l.amt));(v.fin.pays||[]).forEach(p=>add(p.date,p.amt));
 const d=new Date();for(let i=5;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);ks.push(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'))}
 const mx=Math.max(...ks.map(k=>m[k]||0));if(!mx)return'<p class=sb>No spending in the last 6 months yet. Add entries in Log, or EMI payments in Finance.</p>';
 return`<svg viewBox="0 0 300 100" width="100%" role="img" aria-label="Monthly spend">${ks.map((k,i)=>{const t=m[k]||0,h=t/mx*60;return`<rect x="${i*50+10}" y="${70-h}" width="30" height="${h}" rx="4" fill="#f5a623"/><text x="${i*50+25}" y="86" font-size="9" fill="#8b97aa" text-anchor="middle">${MN[+k.slice(5)-1]}</text><text x="${i*50+25}" y="${66-h}" font-size="8" fill="#e8edf5" text-anchor="middle">${t?(t>=1000?Math.round(t/100)/10+'k':Math.round(t)):''}</text>`}).join('')}</svg>`}
function lineChart(p){if(p.length<2)return'<p class=sb>Add more fuel entries to see the trend.</p>';const s=p.slice(-10),mx=Math.max(...s),mn=Math.min(...s),r=mx-mn||1;
 const q=s.map((e,i)=>[10+i*(280/(s.length-1)),70-(e-mn)/r*55]);return`<svg viewBox="0 0 300 90" width="100%" role="img" aria-label="Mileage trend"><polyline points="${q.map(x=>x.join(',')).join(' ')}" fill="none" stroke="#2dd4bf" stroke-width="2.5"/>${q.map((x,i)=>`<circle cx="${x[0]}" cy="${x[1]}" r="3" fill="#2dd4bf"/><text x="${x[0]}" y="${x[1]-7}" font-size="8" fill="#e8edf5" text-anchor="middle">${s[i].toFixed(1)}</text>`).join('')}</svg>`}
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
home(v){if(v.ph)return`<div class=card><div class=hd>No vehicle shared with you yet</div><p class=sb>Ask the admin to give you access to a vehicle. They can do it in Settings, Administrator panel, Vehicle access.</p></div>`;const L=v.logs,sum=t=>L.filter(l=>t.includes(l.t)).reduce((a,l)=>a+ +l.amt,0),tot=sum(Object.keys(TYPES)),m=mileage(v),al=alerts(v),o=odo(v),mo=L.filter(l=>l.date.slice(0,7)===today().slice(0,7)).reduce((a,l)=>a+ +l.amt,0);
 const lo=L.length?Math.min(...L.map(l=>+l.odo)):0,kms=o-Math.min(lo||o,+v.odo0||lo||o),cpk=kms>0?tot/kms:0,sv=due(v),lf=m.last,R=(k,x)=>`<div class=row><span class=sb>${k}</span><b>${x}</b></div>`;
 return`<div class="card hero"><div class=hr>${v.thumb&&/^data:image\//.test(v.thumb)?`<img class=hth src="${v.thumb}" alt="">`:'<div class="hth hph">🚘</div>'}<div><div class=sb>Odometer</div><div class=big>${o.toLocaleString('en-IN')} <small class=sb>km</small></div>${v.model?`<div class=sb>${esc(v.model)}</div>`:''}</div></div></div>
 ${al.length?`<div class="al ${al[0].c}"><b>${al.length} alert${al.length>1?'s':''}</b><div>${esc(al[0].t)}</div></div>`:'<div class="al ok">All papers and services are up to date.</div>'}
 <div class=grid><div class=st><small>Running cost</small><b>${money(tot)}</b></div><div class=st><small>This month</small><b>${money(mo)}</b></div><div class=st><small>Fuel</small><b>${money(sum(['fuel']))}</b></div><div class=st><small>Maintenance</small><b>${money(sum(['maintenance']))}</b></div><div class=st><small>Cost per km</small><b>${cpk?'₹'+cpk.toFixed(2):'–'}</b></div><div class=st><small>Last fuel price</small><b>${lf?'₹'+(lf.amt/lf.lit).toFixed(2)+'/L':'–'}</b></div></div>
 <div class=card><div class=hd>Mileage</div>${m.avg?`<div class=mrow><div><div class=big>${m.avg.toFixed(1)}<small class=sb> km/L</small></div><div class=sb>Overall average</div></div>${m.r5?`<div class=r5><b>${m.r5.toFixed(1)}</b><span class=sb>last 5 fills</span></div>`:''}</div><div class=sb>${esc(m.acc)}</div><div class=sb style="margin:12px 0 4px">Trend, 5-fill average</div>${lineChart(m.pts)}`:'<p class=sb>Add at least two fuel entries with km and liters to see your mileage.</p>'}</div>
 <div class=card><div class=hd>Last fuel fill-up</div>${lf?R('Date',lf.date)+R('Odometer',(+lf.odo).toLocaleString('en-IN')+' km')+R('Liters',lf.lit+' L')+R('Amount',money(lf.amt))+R('Price per litre','₹'+(lf.amt/lf.lit).toFixed(2))+(m.prevKm>0?R('Distance since previous fill-up',m.prevKm.toLocaleString('en-IN')+' km'):'')+(m.lastExact?R('Mileage of this fill',m.lastExact.toFixed(1)+' km/L'):`<p class=sb style="margin:10px 0 0">A single fill needs two full-tank fills in a row for an exact mileage. Tick "Filled to full" when you fill the tank completely.</p>`):'<p class=sb>Add a fuel entry in Log with km, liters and amount.</p>'}</div>
 ${lastCard(v)}
 <div class=card><div class=hd>Service reminders</div>${sv.length?sv.map(s=>`<div class=row><div>${esc(s.k)}<div class=sb>${s.kmL!==null?(s.kmL<=0?'Overdue by '+(-s.kmL)+' km':s.kmL+' km left'):''}${s.kmL!==null&&s.dL!==null?' · ':''}${s.dL!==null?(s.dL<=0?'Overdue by '+(-s.dL)+' days':s.dL+' days left'):s.days&&!s.lastDate?'Tap Mark done to start the day count':''}</div></div><span><span class="pill ${s.st}">${s.st==='bad'?'Due now':s.st==='warn'?'Soon':'OK'}</span> <button class=lk data-a=svc data-id=${s.id}>Mark done</button></span></div>`).join(''):'<p class=sb>Add a spec with a km or day interval in Profile to get service reminders.</p>'}</div>
 <div class=card><div class=hd>Monthly spend</div>${barChart(v)}</div>`},
add(v){const e=editId&&v.logs.find(l=>l.id===editId)||{},t=e.t||type;
 return`<div class=card><div class=hd>${e.id?'Edit entry':'Quick log'}${e.id?'<button class=lk data-a=cancel>Cancel</button>':''}</div>
 <div class=tabs>${Object.entries(TYPES).map(([k,n])=>`<button data-a=tab data-id=${k} class="${k===t?'on':''}">${n}</button>`).join('')}</div>
 <form data-f=log><input type=hidden name=t value=${t}>
 <div class=r2><label>Date<input type=date name=date value="${e.date||today()}" required></label><label>Odometer (km)<input type=number name=odo value="${e.odo??odo(v)}" required></label></div>
 <div class=r2><label>Category<select name=cat>${sel(db.cats[t]||[],e.cat)}</select></label><label>Amount (₹)<input type=number step=.01 min=0 name=amt value="${e.amt??''}" required></label></div><p class=sb id=lh style="margin:-2px 0 8px"></p>
 ${t==='fuel'?`<label>Liters (required)<input type=number step=.01 min=0.01 name=lit value="${e.lit||''}" required></label><label class=ck style="padding:0 0 12px"><input type=checkbox name=fl ${e.fl?'checked':''}> Filled to full (tick only when you filled the tank completely)</label>`:''}
 ${payUI(v.partners,e,'personal')}
 <label>Note<input name=note value="${esc(e.note||'')}" placeholder="Optional"></label><button class=btn>Save entry</button></form></div>`},
prof(v){const P=v.partners.join(', ');
 return`<div class=card><div class=hd>Vehicle details</div><form data-f=veh><div class=r2><label>Name<input name=name value="${esc(v.name)}" required></label><label>Plate<input name=plate value="${esc(v.plate)}"></label></div>
 <div class=r2><label>Model / variant<input name=model value="${esc(v.model)}"></label><label>Starting odometer<input type=number name=odo0 value="${v.odo0||0}"></label></div>
 <label>Vehicle photo (shown as thumbnail)<input type=file name=thumb accept="image/jpeg,image/png,image/webp"></label>${v.thumb?'<button type=button class=lk data-a=thumbdel>Remove current photo</button>':''}
 <label>Fuel tank size (liters)<input type=number step=.1 name=tank value="${v.tank||''}" placeholder="Shows mileage accuracy"></label>
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
 <p class=sb style="margin:16px 0 10px">${Object.keys(v.photos).length?'Tap a photo to open, zoom, replace, move or delete it.':'No photos yet.'}</p><div class=ph>${ZONES.filter(z=>v.photos[z]).map(z=>`<button type=button class=gt data-a=gopen data-id="${esc(z)}"><img src="${v.photos[z]}" alt="${esc(z)}"><span>${esc(z)}</span></button>`).join('')}</div></div>
 <div class=card><div class=hd>Damage log</div><form data-f=dmg><div class=r2><label>Body zone<select name=zone>${sel(ZONES)}</select></label><label>Date<input type=date name=date value="${today()}"></label></div><label>What happened<input name=note required></label><button class=btn>Add damage</button></form>
 ${v.damages.map(d=>`<div class=row><div>${esc(d.zone)}<div class=sb>${d.date} · ${esc(d.note)}</div></div><span><button class="lk" data-a=dtog data-id=${d.id}>${d.status==='Fixed'?'Fixed':'Pending'}</button><button class="lk d" data-a=dmgdel data-id=${d.id}>Delete</button></span></div>`).join('')}</div>`},
fin(v){const f=v.fin,pays=f.pays||[],L=v.logs,tot=t=>L.filter(l=>l.t===t).reduce((a,l)=>a+ +l.amt,0),emiPaid=(+f.paid||0)*(+f.emi||0)+pays.reduce((x,p)=>x+ +p.amt,0),acq=(+f.ex||0)+(+f.tax||0),up=+f.loan>0?(+f.down||0):acq,all=up+emiPaid+L.reduce((a,l)=>a+ +l.amt,0),net=ledger(v),left=Math.max(0,(+f.ten||0)-(+f.paid||0)-pays.length),ee=emiEdit&&pays.find(p=>p.id===emiEdit);
 return`<div class=card><div class=hd>Spend summary</div>${[[+f.loan>0?'Down payment (paid upfront)':'Purchase & registration',up],['EMI paid so far',emiPaid],['Fuel',tot('fuel')],['Maintenance',tot('maintenance')],['RTO / buy logs',tot('purchase')],['Expenses',tot('expense')]].map(r=>`<div class=row><span>${r[0]}</span><b>${money(r[1])}</b></div>`).join('')}<div class=row><b>Lifetime total</b><b style="color:var(--ac)">${money(all)}</b></div><p class=sb>Vehicle price ${money(acq)}. The loan part is counted through EMIs as you pay them.</p></div>
 <div class=card><div class=hd>Loan overview</div><div class=row><span>${esc(f.bank||'Loan')} · ${money(f.loan)}</span><b>${money(f.emi)}/mo</b></div><div class=row><span>${(+f.paid||0)+pays.length} paid · ${left} left</span><b>${money(left*(+f.emi||0))} to pay</b></div></div>
 <div class=card><div class=hd>EMI payments${ee?'<button class=lk data-a=emicancel>Cancel</button>':''}</div><form data-f=emi><div class=r2><label>Date<input type=date name=date value="${ee?ee.date:today()}" required></label><label>Amount (₹)<input type=number step=.01 min=0 name=amt value="${ee?ee.amt:(f.emi||'')}" required></label></div>${payUI(v.partners,ee,'shared')}<label>Note<input name=note value="${esc(ee?ee.note:'')}" placeholder="Optional"></label><button class=btn>${ee?'Update EMI':'Add EMI payment'}</button></form>
 ${pays.slice().sort((x,y)=>y.date.localeCompare(x.date)).map(p=>`<div class=row><div>${money(p.amt)}<div class=sb>${p.date}${payTxt(p,v.partners)}${p.note?' · '+esc(p.note):''}</div></div><span><button class=lk data-a=emiedit data-id=${p.id}>Edit</button><button class="lk d" data-a=emidel data-id=${p.id}>Delete</button></span></div>`).join('')}</div>
 <div class=card><div class=hd>Partner ledger <button class=lk data-a=settle>Settle up</button></div>${v.partners.length<2?'<p class=sb>Add a second partner in Profile to split shared costs.</p>':Object.entries(net).map(([p,n])=>`<div class=row><span>${esc(p)}</span><b style="color:${n>0.5?'var(--ok)':n<-0.5?'var(--bd)':'var(--sb)'}">${n>0.5?'is owed '+money(n):n<-0.5?'owes '+money(-n):'settled'}</b></div>`).join('')}
 ${v.settles.map(s=>`<div class=row><span class=sb>Settled on ${s.date}</span><button class="lk d" data-a=undo data-id=${s.id}>Undo</button></div>`).join('')}</div>${PP(v)}
 <div class=card><div class=hd>Purchase & loan</div><form data-f=fin><div class=r2><label>Ex-showroom (₹)<input type=number name=ex value="${f.ex||''}"></label><label>Taxes & registration (₹)<input type=number name=tax value="${f.tax||''}"></label>
 <label>Down payment (₹)<input type=number name=down value="${f.down||''}"></label><label>Loan amount (₹)<input type=number name=loan value="${f.loan||''}"></label><label>Bank<input name=bank value="${esc(f.bank||'')}"></label><label>Monthly EMI (₹)<input type=number name=emi value="${f.emi||''}"></label>
 <label>Tenure (months)<input type=number name=ten value="${f.ten||''}"></label><label>EMIs paid before this app<input type=number name=paid value="${f.paid||0}"></label>${v.partners.length>1?`<div style="grid-column:1/3"><div class=sb style="margin-bottom:6px">Down / upfront payment (${money(up)})</div>${payUI(v.partners,{scope:f.downScope,pd:f.downPd||{[f.downBy||v.partners[0]]:up},sh:f.downSh},'shared')}</div>`:''}</div><button class=btn>Save finance</button></form></div>`},
logs(v){return`<div class=card><div class=hd>History <span><button class=lk data-a=csv>CSV</button><button class=lk data-a=pdf>PDF</button></span></div><input id=q placeholder="Search note, category or date" value="${esc(F.q)}">
 <div class=r2 style="margin-top:8px"><select id=ft><option value=all>All types</option>${Object.entries(TYPES).map(([k,n])=>`<option value=${k} ${F.t===k?'selected':''}>${n}</option>`).join('')}</select><select id=fs><option value=new ${F.s==='new'?'selected':''}>Newest</option><option value=old ${F.s==='old'?'selected':''}>Oldest</option><option value=hi ${F.s==='hi'?'selected':''}>Highest amount</option></select></div></div><div id=lst></div>`}
};
function filt(v){let r=v.logs.filter(l=>(F.t==='all'||l.t===F.t)&&(!F.q||[l.note,l.cat,l.date,l.t].join(' ').toLowerCase().includes(F.q.toLowerCase())));
 return r.sort((a,b)=>F.s==='hi'?b.amt-a.amt:F.s==='old'?a.date.localeCompare(b.date):b.date.localeCompare(a.date))}
function list(){const v=V(),r=filt(v);$('#lst').innerHTML=`<div class="al ok">${r.length} entries · Total <b>${money(r.reduce((a,l)=>a+ +l.amt,0))}</b></div>`+r.map(l=>`<div class=card><div class=hd><span>${esc(l.cat)} · ${money(l.amt)}</span><span><button class=lk data-a=ledit data-id=${l.id}>Edit</button><button class="lk d" data-a=ldel data-id=${l.id}>Delete</button></span></div><div class=sb>${l.date} · ${TYPES[l.t]} · ${(+l.odo).toLocaleString('en-IN')} km${l.lit?' · '+l.lit+' L @ ₹'+(l.amt/l.lit).toFixed(1):''} · ${payTxt(l,v.partners)}</div>${l.note?`<details><summary class=sb>Note</summary>${esc(l.note)}</details>`:''}</div>`).join('')}
function setS(){const u=db.user,p=db.pin;
 return`<div class=card><div class=hd>Account</div>${u?`<p>Signed in as <b>${esc(u)}</b></p><button class="btn g" data-a=signout>Sign out</button>`:`<p class=sb>You are using the app as a guest. Your data stays on this device. Sign in to use cloud backup.</p><form data-f=auth><label>Email<input type=email name=e required></label><label>Password (min 6)<input type=password name=p minlength=6 required></label><div class=r2><button class=btn name=m value=in>Sign in</button><button class="btn g" name=m value=up>Register</button></div><button type=button class=lk data-a=pwreset>Forgot password?</button></form>`}</div>
 ${teamCard()}<div class=card><div class=hd>Categories</div><p class=sb>Add, rename or delete your fuel, maintenance, RTO/buy and expense categories.</p><button class=btn data-a=cats>Manage categories</button></div>
 <div class=card><div class=hd>App lock</div><form data-f=pin><label>${p?'New 6-character PIN':'Set a 6-character PIN (letters and digits)'}<input name=p maxlength=6 pattern="[A-Za-z0-9]{6}" required autocomplete=off></label>
 <label class=ck style="padding:0 0 8px"><input type=checkbox name=ask ${!p||p.ask!==false?'checked':''}> Ask for PIN every time the app opens</label><button class=btn>${p?'Change PIN':'Turn on PIN lock'}</button></form>${p?'<button class="btn g" data-a=pinoff>Turn off PIN lock</button>':''}</div>
 <div class=card><div class=hd>Backup</div><p class=sb>Last backup: ${db.lastBackup?new Date(db.lastBackup).toLocaleString():'never'}</p><button class=btn data-a=jx>Export JSON file</button>
 <label style="margin-top:8px">Import JSON file<input type=file id=jin accept=".json,application/json"></label></div>`}

/* ---------- render ---------- */
function render(keep){const v=V();const tn=x=>x.thumb&&/^data:image\//.test(x.thumb)?`<img src="${x.thumb}" alt="">`:'<span class=tph>🚘</span>';
 $('#vsel').innerHTML=db.v.map(x=>`<button class="vc ${x.id===v.id?'on':''}" data-a=vsw data-id=${x.id}>${tn(x)}<span><b>${esc(x.name)}</b><small>${esc(x.plate||'No plate')}</small></span></button>`).join('');
 {const c=$('#vsel'),o=c.querySelector&&c.querySelector('.on');if(o)c.scrollLeft=o.offsetLeft-c.clientWidth/2+o.offsetWidth/2}
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
function flat(){const m={};db.v.forEach(v=>{if(v.ph)return;const{photos,specs,docs,damages,logs,settles,rem,...x}=v;Object.entries(photos||{}).forEach(([z,d])=>{const zi=ZONES.indexOf(z);if(zi>=0&&d)m['i_'+v.id+'_g'+zi]={_k:'img',vid:v.id,t:'g',z,d}});docs.forEach(i=>{if(i.img)m['i_'+v.id+'_d'+i.id]={_k:'img',vid:v.id,t:'d',ref:i.id,d:i.img}});m['v_'+v.id]={_k:'veh',vid:v.id,...x};
 [['l','log',logs],['s','spec',specs],['d','doc',docs],['g','dmg',damages],['t','settle',settles],['r','rem',rem]].forEach(([p,k,arr])=>arr.forEach(i=>{const{img,...y}=i;m[p+'_'+i.id]={_k:k,vid:v.id,...y}}))});
 m.cfg={_k:'cfg',cats:db.cats};return JSON.parse(JSON.stringify(m))}
function applyRemote(){const R=Object.values(TM.remote),old=Object.fromEntries(db.v.map(v=>[v.id,v])),img={};db.v.forEach(v=>v.docs.forEach(d=>{img[d.id]=d.img}));
 const vs=R.filter(r=>r._k==='veh').map(r=>{const{_k,vid,...x}=r,o=old[x.id]||{},ph={};Object.entries(o.photos||{}).forEach(([z,d])=>{if(!TM.seen['i_'+x.id+'_g'+ZONES.indexOf(z)])ph[z]=d});return{...newV(x.name,x.plate),...x,photos:ph}});
 const MAP={log:'logs',spec:'specs',doc:'docs',dmg:'damages',settle:'settles',rem:'rem'};
 R.forEach(r=>{const a=MAP[r._k],v=a&&vs.find(x=>x.id===r.vid);if(!v)return;const{_k,vid,...x}=r;if(a==='docs'&&img[x.id]&&!TM.seen['i_'+r.vid+'_d'+x.id])x.img=img[x.id];v[a].push(x)});
 R.filter(r=>r._k==='img').forEach(r=>{const v=vs.find(x=>x.id===r.vid);if(!v)return;if(r.t==='g')v.photos[r.z]=r.d;else{const d=v.docs.find(x=>x.id===r.ref);if(d)d.img=r.d}});
 const c=R.find(r=>r._k==='cfg');if(c)db.cats=c.cats;
 if(vs.length)db.v=vs;else if(TM.role!=='admin'&&TM.vehicles!==undefined){const p=newV('No vehicle shared yet','');p.ph=true;db.v=[p]}
 if(!db.v.find(v=>v.id===db.act))db.act=db.v[0].id;fix(db);lsave()}
const PERMS=[['addEntries','Add fuel, maintenance and expense entries, reminders and damage records',true,'adding entries, reminders and damage records'],['editEntries','Edit entries, reminders and damage records',false,'editing entries'],['deleteEntries','Delete entries, reminders and damage records',false,'deleting entries'],['specsDocs','Add, edit or delete specs and documents',false,'specs and documents'],['vehicleDetails','Edit vehicle details, partners and finance (EMI)',false,'vehicle details and finance'],['settleUp','Settle up the partner ledger',false,'settle up'],['categories','Change categories',false,'categories'],['vehicles','Add or delete vehicles',false,'adding or deleting vehicles']];
const pm=(k,d)=>TM.perms[k]===undefined?d:!!TM.perms[k];
const pv=(vid,k,d)=>{const o=TM.vperms[vid];return o&&o[k]!==undefined?!!o[k]:pm(k,d)};
function can(x){const op=x[0],d=op==='set'?x[2]:TM.remote[x[1]]||{},kd=d._k,vid=d.vid,p=(k,df)=>pv(vid,k,df),st=op==='del'?'del':x[1] in TM.sent?'upd':'new',E=['log','rem','dmg'].includes(kd),SD=['spec','doc'].includes(kd),IM=kd==='img'?(d.t==='g'?p('vehicleDetails',false):p('specsDocs',false)):false;
 if(p('vehicles',false)&&st==='del')return true;
 if(st==='new')return kd!=='veh'&&(('v_'+vid) in TM.sent)&&(E?p('addEntries',true):SD?p('specsDocs',false):kd==='settle'?p('settleUp',false):IM);
 if(st==='upd')return E?p('editEntries',false):SD?p('specsDocs',false):kd==='veh'?p('vehicleDetails',false):kd==='cfg'?pm('categories',false):IM;
 return E?p('deleteEntries',false):SD?p('specsDocs',false):kd==='settle'?p('settleUp',false):IM}
const permText=vid=>{const f=PERMS.filter(p=>pv(vid,p[0],p[2])).map(p=>p[3]),n=PERMS.filter(p=>!pv(vid,p[0],p[2])).map(p=>p[3]);return'Without approval: '+(f.join(', ')||'nothing')+'. Needs admin approval: '+(n.join(', ')||'nothing')+'.'};
let pt=null;
const KN={veh:'vehicle',log:'entry',spec:'spec',doc:'document',dmg:'damage record',settle:'settlement',rem:'reminder',cfg:'categories',img:'picture'};
function descr(x){const d=x[0]==='set'?x[2]:TM.remote[x[1]]||{},nm=d.name||d.z||(d.cat?d.cat+' '+d.amt:'')||d.k||d.type||d.title||d.note||'';return(x[0]==='del'?'Delete ':x[1] in TM.sent?'Edit ':'Add ')+(KN[d._k]||'item')+(nm?' ('+nm+')':'')}
async function sendReq(req){const ops=req.map(x=>x[0]==='set'?{op:'set',key:x[1],json:JSON.stringify(x[2])}:{op:'del',key:x[1]}),js=JSON.stringify(ops);if(js.length>900000)throw Error('This change is too large to send for approval. Ask the admin to make it.');
 await FS().collection('requests').add({by:TM.uid,byEmail:db.user,label:req.slice(0,3).map(descr).join('; ')+(req.length>3?' +'+(req.length-3)+' more':''),ops:js,status:'pending',at:Date.now()})}
function push(){clearTimeout(pt);if(!TM.on)return;pt=setTimeout(async()=>{if(!TM.on)return;
 if(TM.role==='viewer'){alert('You have read-only access, so this change was not saved.');applyRemote();render(true);return}
 const m=flat(),w=[];for(const k in m)if(cj(m[k])!==TM.sent[k])w.push(['set',k,m[k]]);for(const k in TM.sent)if(!(k in m))w.push(['del',k]);if(!w.length)return;
 const mem=TM.role!=='admin',okd=can,direct=mem?w.filter(okd):w,req=mem?w.filter(x=>!okd(x)):[];
 try{const fs=FS(),c=fs.collection('hub');
  for(let i=0;i<direct.length;i+=400){const b=fs.batch();direct.slice(i,i+400).forEach(x=>x[0]==='set'?b.set(c.doc(x[1]),x[2]):b.delete(c.doc(x[1])));await b.commit()}
  direct.forEach(x=>{if(x[1].startsWith('i_'))TM.seen[x[1]]=1;if(x[0]==='set'){TM.sent[x[1]]=cj(x[2]);TM.remote[x[1]]=JSON.parse(JSON.stringify(x[2]))}else{delete TM.sent[x[1]];delete TM.remote[x[1]]}});
  if(req.length){await sendReq(req);applyRemote();render(true);toast('Sent to the admin for approval')}
  db.lastBackup=Date.now();lsave()}
 catch(e){if(/permission/i.test((e.code||'')+(e.message||''))){alert('You do not have permission for this change.');applyRemote();render(true)}else toast(e.message&&!e.code?e.message:'Could not sync. Will retry when online.')}},800)}
async function teamEnsure(u){await F_();const r=FS().collection('users').doc(u.uid),s=await r.get();if(!s.exists)await r.set({email:u.email,name:(u.email||'').split('@')[0],status:'pending',role:'member'})}
function hubStop(){Object.values(TM.hubs||{}).forEach(u=>u());TM.hubs={};TM.on=false;TM.gated=false;TM.remote={};TM.sent={}}
function teamStop(){['un','uu','rq'].forEach(k=>{if(TM[k]){TM[k]();TM[k]=null}});hubStop();TM.seen={};TM.users=[];TM.vehicles=undefined;TM.role=TM.status=null;TM.declined=false}
function absorb(snap){snap.docChanges().forEach(c=>{const id=c.doc.id;if(c.type==='removed'){delete TM.remote[id];delete TM.sent[id]}else{const d=c.doc.data();TM.remote[id]=d;TM.sent[id]=cj(d);if(id.startsWith('i_'))TM.seen[id]=1}})}
function gate(empty){if(TM.gated)return true;TM.gated=true;
 if(empty){TM.on=true;db.team=TM.uid;lsave();if(TM.role==='admin')push();return true}
 if(db.team!==TM.uid&&hasLocal()&&!confirm("The team already has data. This device's own data will be replaced. Export a JSON backup first if you want to keep it. Replace now?")){hubStop();TM.declined=true;render(true);return false}
 TM.on=true;db.team=TM.uid;return true}
function dropVid(vid){Object.keys(TM.remote).forEach(k=>{if(TM.remote[k].vid===vid){delete TM.remote[k];delete TM.sent[k]}})}
function hubStart(){const full=TM.role==='admin'||TM.vehicles===undefined,want=full?['*']:[...TM.vehicles,'cfg'],H=TM.hubs,c=FS().collection('hub');let drop=false;
 Object.keys(H).forEach(k=>{if(!want.includes(k)){H[k]();delete H[k];drop=true;if(k==='*'){TM.remote={};TM.sent={}}else dropVid(k)}});
 const handle=(snap,empty)=>{const first=!TM.gated;if(!gate(empty))return;if(first){if(!empty){applyRemote();render(true)}}else if(!snap.metadata.hasPendingWrites){applyRemote();typing()?TM.pend=true:render(true)}},err=()=>toast('Sync error');
 want.forEach(k=>{if(H[k])return;
  if(k==='*')H[k]=c.onSnapshot(s=>{absorb(s);handle(s,s.empty)},err);
  else if(k==='cfg')H[k]=c.doc('cfg').onSnapshot(s=>{if(s.exists){TM.remote.cfg=s.data();TM.sent.cfg=cj(s.data())}else{delete TM.remote.cfg;delete TM.sent.cfg}handle(s,false)},err);
  else H[k]=c.where('vid','==',k).onSnapshot(s=>{absorb(s);handle(s,false)},err)});
 if(drop&&TM.gated){applyRemote();render(true)}}
async function ensureLists(){const ids=Object.keys(TM.sent).filter(k=>k.startsWith('v_')).map(k=>k.slice(2)),fs=FS(),b=fs.batch();let n=0;TM.users.filter(m=>m.status==='approved'&&m.role!=='admin'&&m.vehicles===undefined).forEach(m=>{b.update(fs.collection('users').doc(m.id),{vehicles:ids});n++});if(n)await b.commit()}
async function setVis(u,vid,on){await ensureLists();const f=firebase.firestore.FieldValue;await FS().collection('users').doc(u).update({vehicles:on?f.arrayUnion(vid):f.arrayRemove(vid)})}
const evp=(m,vid,k,df)=>{const o=m.vperms&&m.vperms[vid];return o&&o[k]!==undefined?o[k]:(m.perms&&m.perms[k]!==undefined?m.perms[k]:df)};
function vaccess(){const mem=TM.users.filter(m=>m.status==='approved'&&m.role!=='admin');
 return`<div class=hd style="font-size:15px;margin-top:16px">Vehicles: who sees it and what needs approval</div><p class=sb>Open a vehicle. Tick the people who can see it. Under each member you can set what they may do on that vehicle without your approval. A new vehicle is visible only to you until you tick people.</p>${mem.length?db.v.filter(v=>!v.ph).map(v=>`<details data-pm="va_${v.id}" ${TM.open['va_'+v.id]?'open':''}><summary class=sb>${esc(v.name)} ${esc(v.plate||'')}</summary>${mem.map(m=>{const sees=m.vehicles===undefined||m.vehicles.includes(v.id),cu=m.vperms&&m.vperms[v.id];return`<label class=ck2><input type=checkbox data-vis="${m.id}|${v.id}" ${sees?'checked':''}><span>${esc(m.email)}</span></label>${sees&&m.role==='member'?`<details data-pm="vp_${m.id}_${v.id}" ${TM.open['vp_'+m.id+'_'+v.id]?'open':''} style="margin:0 0 8px 30px"><summary class=sb>Permissions on this vehicle${cu?' (custom)':' (default)'}</summary><div class=sb style="margin:6px 0">Ticked = allowed without your approval.</div>${PERMS.map(p=>`<label class=ck2><input type=checkbox data-vperm="${m.id}|${v.id}|${p[0]}" ${evp(m,v.id,p[0],p[2])?'checked':''}><span>${p[1]}</span></label>`).join('')}<button class=lk data-a=vpall data-id="${m.id}|${v.id}">Allow all here</button><button class=lk data-a=vpdef data-id="${m.id}|${v.id}">Use default</button></details>`:''}`}).join('')}</details>`).join(''):'<p class=sb>No approved members yet.</p>'}`}
function teamWatch(u){teamStop();TM.uid=u.uid;TM.un=FS().collection('users').doc(u.uid).onSnapshot(s=>{const d=s.data()||{};TM.role=d.role;TM.perms=d.perms||{};TM.vperms=d.vperms||{};TM.vehicles=d.vehicles;TM.status=s.exists?d.status:'removed';
 if(d.status==='approved'){hubStart();const rr=d.role==='admin'||d.role==='member'?d.role:null;if(TM.rq&&TM.rqr!==rr){TM.rq();TM.rq=null;TM.reqs=[]}
  if(rr&&!TM.rq){TM.rqr=rr;const rc=FS().collection('requests');TM.rq=(rr==='admin'?rc:rc.where('by','==',TM.uid)).onSnapshot(q=>{TM.reqs=q.docs.map(x=>({id:x.id,...x.data()})).sort((x,y)=>(y.at||0)-(x.at||0));if(!typing())render(true)},()=>{})}
  if(d.role==='admin'&&!TM.uu)TM.uu=FS().collection('users').onSnapshot(q=>{TM.users=q.docs.map(x=>({id:x.id,...x.data()})).sort((x,y)=>(x.status==='pending'?0:1)-(y.status==='pending'?0:1));if(!typing())render(true)},()=>{});
  if(d.role!=='admin'&&TM.uu){TM.uu();TM.uu=null;TM.users=[]}}else{hubStop();if(TM.rq){TM.rq();TM.rq=null;TM.reqs=[]}}
 if(!typing())render(true)},()=>toast('Team connection failed'))}
async function teamBoot(){const u=await fuser();if(!u)return;await teamEnsure(u);teamWatch(u)}
async function autoTeam(){const c=window.FIREBASE_CONFIG;if(!db.user||!c||/YOUR/.test(c.apiKey))return;try{await teamBoot()}catch(e){}}
const catsHtml=()=>Object.keys(TYPES).map(t=>`<div class=sb style="margin-top:8px"><b>${TYPES[t]}</b></div>${(db.cats[t]||[]).map((c,i)=>`<div class=row><span>${esc(c)}</span><span><button class=lk data-a=cedit data-t=${t} data-id=${i}>Edit</button><button class="lk d" data-a=cdel data-t=${t} data-id=${i}>Delete</button></span></div>`).join('')}<form data-f=cat class=r2><input type=hidden name=t value=${t}><input name=n placeholder="New category" required><button class="btn g" style="margin:0">Add</button></form>`).join('');
const rqVeh=r=>{try{for(const p of JSON.parse(r.ops)){const d=p.op==='set'?JSON.parse(p.json):TM.remote[p.key]||{};if(d.vid){const v=db.v.find(x=>x.id===d.vid);return v?v.name+(v.plate?' '+v.plate:''):'Vehicle'}}}catch(e){}return'General (all vehicles)'};
const rqGroups=rq=>{const g={};rq.forEach(r=>(g[rqVeh(r)]=g[rqVeh(r)]||[]).push(r));return Object.entries(g).map(([n,l])=>`<div class=sb style="margin:10px 0 2px"><b>${esc(n)}</b></div>`+l.map(r=>`<label class=ck2><input type=checkbox data-rq="${r.id}" ${TM.sel[r.id]?'checked':''}><span>${esc(opsLabel(r))}<small class=sb>${esc(r.byEmail)} · ${new Date(r.at).toLocaleString()}</small></span></label>`).join('')).join('')};
const opsLabel=r=>{try{const o=JSON.parse(r.ops).map(p=>p.op==='set'?['set',p.key,JSON.parse(p.json)]:['del',p.key]);return o.slice(0,4).map(descr).join('; ')+(o.length>4?' +'+(o.length-4)+' more':'')}catch(e){return'Unreadable request'}};
async function rqDo(r,ok){const fs=FS();if(!ok){await fs.collection('requests').doc(r.id).update({status:'rejected',decidedAt:Date.now(),decidedBy:db.user});return}
 const ops=JSON.parse(r.ops),c=fs.collection('hub');if(!ops.every(o=>/^([vlsdgtri]_[A-Za-z0-9_]+|cfg)$/.test(o.key)))throw Error('This request has unexpected data and was not applied.');
 for(let i=0;i<ops.length;i+=400){const b=fs.batch();ops.slice(i,i+400).forEach(o=>o.op==='set'?b.set(c.doc(o.key),JSON.parse(o.json)):b.delete(c.doc(o.key)));if(i+400>=ops.length)b.update(fs.collection('requests').doc(r.id),{status:'approved',decidedAt:Date.now(),decidedBy:db.user});await b.commit()}}
function adminHtml(){if(Date.now()-(TM.adminOk||0)>3e5)return`<p class=sb>For privacy, confirm your password to open this section. It locks again after 5 minutes or when you leave the app.</p><form data-f=adminpw><label>Password<input type=password name=p required autocomplete=current-password></label><button class=btn>Unlock</button></form>`;
 const rq=TM.reqs.filter(r=>r.status==='pending'),dn=TM.reqs.filter(r=>r.status!=='pending').slice(0,5),ns=rq.filter(r=>TM.sel[r.id]).length;
 return`<div class=hd style="font-size:15px">Approval requests (${rq.length})</div>${rq.length?`<button class=lk data-a=rqsel>${ns===rq.length?'Clear selection':'Select all'}</button>`+rqGroups(rq)+`<div class=r2><button class=btn data-a=rqapp>Approve selected (${ns})</button><button class="btn g" data-a=rqrej>Reject selected</button></div>`:'<p class=sb>No requests waiting.</p>'}${dn.length?`<div class=sb style="margin-top:8px">Recent decisions</div>${dn.map(r=>`<div class=row><span class=sb>${esc(r.label)}</span><span class="pill ${r.status==='approved'?'':'bad'}">${esc(r.status)}</span></div>`).join('')}`:''}
 <div class=hd style="font-size:15px;margin-top:16px">People · ${TM.users.filter(m=>m.status==='pending').length} waiting</div>${TM.users.map(m=>`<div class=row style="flex-wrap:wrap"><div>${esc(m.email)}<div class=sb>${esc(m.role)} · ${esc(m.status)}</div></div>${m.id===TM.uid?'<span class=sb>You</span>':`<span style="width:100%">${m.status==='approved'?tb(m.id,'status','blocked','Block','d'):tb(m.id,'status','approved','Approve')}${m.role!=='member'?tb(m.id,'role','member','Member'):''}${m.role!=='viewer'?tb(m.id,'role','viewer','Viewer'):''}${m.role!=='admin'?tb(m.id,'role','admin','Admin'):''}<button class="lk d" data-a=tmdel data-id="${m.id}">Remove</button></span>${m.role==='member'&&m.status==='approved'?`<details data-pm="${m.id}" ${TM.open[m.id]?'open':''} style="width:100%"><summary class=sb>Default permissions for every vehicle (${esc(m.email.split('@')[0])})</summary><div class=sb style="margin:6px 0">Ticked = allowed without your approval. Unticked = needs your approval.</div>${PERMS.map(p=>`<label class=ck2><input type=checkbox data-perm="${m.id}|${p[0]}" ${(m.perms&&m.perms[p[0]]!==undefined?m.perms[p[0]]:p[2])?'checked':''}><span>${p[1]}</span></label>`).join('')}<button class=lk data-a=pmset data-id="${m.id}|all">Allow all</button><button class=lk data-a=pmset data-id="${m.id}|def">Reset to default</button></details>`:''}`}</div>`).join('')}${vaccess()}<button class="btn g" data-a=alock>Lock now</button>`}
function showModal(){if(!MD)return;$('#mt').textContent=MD.t;$('#mb').innerHTML=MD.fn();$('#modal').classList.remove('hide')}
const openModal=(t,fn)=>{MD={t,fn};showModal()},closeModal=()=>{MD=null;$('#modal').classList.add('hide')};
document.addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&TM.adminOk){TM.adminOk=0;if(MD&&MD.t==='Administrator')closeModal()}});
const tb=(u,f,v,l,c)=>`<button class="lk ${c||''}" data-a=tm data-id="${u}|${f}|${v}">${l}</button>`;
function teamCard(){if(!db.user)return`<div class=card><div class=hd>Team</div><p class=sb>Sign in or register in the Account card above to join your team. After the admin approves you, your data syncs between everyone.</p></div>`;
 const st=TM.status,msg=TM.declined?'Sync is off on this device. Sign out and sign in again to retry.':!st?'Connecting...':st==='approved'?'Approved as <b>'+esc(TM.role)+'</b>.':st==='blocked'?'Your access is blocked. Contact the admin.':st==='removed'?'Your access was removed. Sign out and register again to ask for access.':'Waiting for the admin to approve you.';
 return`<div class=card><div class=hd>Team ${TM.on?'<span class=pill>Synced</span>':''}</div><p>${msg}</p>${TM.role==='viewer'&&st==='approved'?'<p class=sb>Read-only: you can view shared data but not change it.</p>':''}<p class=sb>Photos and document images sync when you are online.</p>${TM.role==='member'&&st==='approved'?`<p class=sb>${esc('On '+(V().name||'this vehicle')+': '+permText(db.act))}</p>${TM.reqs.slice(0,5).map(r=>`<div class=row><span class=sb>${esc(r.label)}</span><span class="pill ${r.status==='approved'?'':r.status==='rejected'?'bad':'warn'}">${esc(r.status)}</span></div>`).join('')}`:''}
 ${TM.role==='admin'&&st==='approved'?`<p class=sb>${TM.users.length} people · ${TM.users.filter(m=>m.status==='pending').length} waiting · ${TM.reqs.filter(r=>r.status==='pending').length} changes to approve</p><button class=btn data-a=admin>Administrator panel</button>`:''}</div>`}
document.addEventListener('change',e=>{const t=e.target,d=t.dataset||{};
 if(d.rq){t.checked?TM.sel[d.rq]=1:delete TM.sel[d.rq];showModal()}
 if(d.vis){const[u,vi]=d.vis.split('|');setVis(u,vi,t.checked).catch(x=>alert(x.message))}
 if(d.vperm){const[u,vi,k]=d.vperm.split('|');FS().collection('users').doc(u).update({['vperms.'+vi+'.'+k]:t.checked}).catch(x=>alert(x.message))}
 if(d.perm){const[u,k]=d.perm.split('|');FS().collection('users').doc(u).update({['perms.'+k]:t.checked}).catch(x=>alert(x.message))}});
document.addEventListener('toggle',e=>{const t=e.target;if(t.dataset&&t.dataset.pm)TM.open[t.dataset.pm]=t.open},true);
document.addEventListener('focusout',()=>setTimeout(()=>{if(TM.pend&&!typing()){TM.pend=false;render(true)}},400));

/* ---------- actions ---------- */
const dl=(name,txt,mime)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:mime}));a.download=name;a.click()};
const A={
 nav:id=>{scr=id;if(id!=='add')editId=null;render()},tab:id=>{type=id;render()},cancel:()=>{editId=null;scr='logs';render()},close:()=>$('#panel').classList.add('hide'),
 svc:id=>{const s=V().specs.find(x=>x.id===id);s.lastOdo=odo(V());s.lastDate=today();save();render();if(!$('#panel').classList.contains('hide'))panel()},
 rdone:id=>{V().rem.find(x=>x.id===id).done=true;save();render();if(!$('#panel').classList.contains('hide'))panel()},
 rdel:id=>{if(!confirm('Delete this reminder?'))return;V().rem=V().rem.filter(x=>x.id!==id);save();render()},
 ddel:id=>confirm('Delete this document?')&&(V().docs=V().docs.filter(x=>x.id!==id),save(),render()),
 view:id=>{const d=V().docs.find(x=>x.id===id);if(d&&d.img)lbOpen([{k:'d',key:d.id,src:d.img,label:d.type}],0)},
 sdel:id=>confirm('Delete this spec?')&&(V().specs=V().specs.filter(x=>x.id!==id),save(),render()),
 sedit:id=>{const s=V().specs.find(x=>x.id===id),n=prompt('Value for '+s.k,s.v);if(n){s.v=n;save();render()}},
 share:()=>{const v=V(),g={};v.specs.forEach(s=>(g[s.g]=g[s.g]||[]).push(`${s.k}: ${s.v}`));const t=`${v.name} ${v.plate}\n${v.model}\n\n`+Object.entries(g).map(([k,a])=>k+'\n'+a.join('\n')).join('\n\n');
  navigator.share?navigator.share({title:v.name,text:t}).catch(()=>{}):navigator.clipboard.writeText(t).then(()=>toast('Copied to clipboard'))},
 pdel:id=>{delete V().photos[id];save();render()},dtog:id=>{const d=V().damages.find(x=>x.id===id);d.status=d.status==='Fixed'?'Pending':'Fixed';save();render()},
 dmgdel:id=>{if(!confirm('Delete this damage record?'))return;V().damages=V().damages.filter(x=>x.id!==id);save();render()},
 emiedit:id=>{emiEdit=id;render();$('[data-f=emi]').scrollIntoView()},emicancel:()=>{emiEdit=null;render()},emidel:id=>confirm('Delete this EMI payment?')&&(V().fin.pays=V().fin.pays.filter(p=>p.id!==id),save(),render()),
 settle:()=>{const v=V(),n=ledger(v);if(Object.values(n).every(x=>Math.abs(x)<.5))return toast('Already settled');if(confirm('Record a settlement and reset the balance to ₹0?')){v.settles.push({id:uid(),date:today(),net:n});save();render()}},
 undo:id=>{V().settles=V().settles.filter(x=>x.id!==id);save();render()},
 ledit:id=>{editId=id;scr='add';render()},ldel:id=>confirm('Delete this entry?')&&(V().logs=V().logs.filter(x=>x.id!==id),save(),render()),
 csv:()=>{const v=V(),q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';dl(v.name+'-logs.csv',['Date,Type,Category,Amount,Odometer,Liters,Paid as,Paid by,Note',...filt(v).map(l=>[l.date,l.t,l.cat,l.amt,l.odo,l.lit,l.scope,l.payer,l.note].map(q).join(','))].join('\n'),'text/csv')},
 pdf:()=>{const v=V(),r=filt(v),w=open('','_blank');if(!w)return alert('Allow pop-ups to save a PDF.');w.document.write(`<title>${esc(v.name)} history</title><style>body{font:12px sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left}</style><h2>${esc(v.name)} ${esc(v.plate)}</h2><table><tr><th>Date<th>Type<th>Category<th>Amount<th>Odo<th>Note</tr>${r.map(l=>`<tr><td>${l.date}<td>${TYPES[l.t]}<td>${esc(l.cat)}<td>${l.amt}<td>${l.odo}<td>${esc(l.note)}</tr>`).join('')}</table><p><b>Total: ${money(r.reduce((a,l)=>a+ +l.amt,0))}</b></p>`);w.document.close();w.print()},
 cedit:(id,b)=>{const t=b.dataset.t,n=prompt('Rename category',db.cats[t][id]);if(n&&n.trim()){db.cats[t][id]=n.trim();save();render()}},
 cdel:(id,b)=>{const t=b.dataset.t;confirm('Delete "'+db.cats[t][id]+'"?')&&(db.cats[t].splice(id,1),save(),render())},
 pinoff:()=>{db.pin=null;localStorage.removeItem('mk_ok');save();render()},signout:()=>confirm('Sign out?')&&cloud.out(),pwreset:guard(async()=>{const e=prompt('Enter your account email');if(!e)return;const f=await F_();await f.auth().sendPasswordResetEmail(e);alert('If this email has an account, a reset link was sent.')}),gopen:id=>{const l=gal();lbOpen(l,Math.max(0,l.findIndex(x=>x.key===id)))},lbx:()=>lbClose(),lbprev:()=>lbGo(-1),lbnext:()=>lbGo(1),
 lbrep:()=>$('#lbf').click(),
 lbrot:()=>{const it=LB.list[LB.i],im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.height;c.height=im.width;const x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(Math.PI/2);x.drawImage(im,-im.width/2,-im.height/2);V().photos[it.key]=c.toDataURL('image/jpeg',.8);save();render();lbReload(it.key)};im.src=it.src},
 lbmc:()=>$('#lbzr').classList.add('hide'),
 lbmove:()=>{const it=LB.list[LB.i];$('#lbz').innerHTML=ZONES.map(z=>`<option ${z===it.key?'selected':''}>${z}</option>`).join('');$('#lbzr').classList.remove('hide')},
 lbmv:()=>{const v=V(),it=LB.list[LB.i],z2=$('#lbz').value;if(z2===it.key)return $('#lbzr').classList.add('hide');if(v.photos[z2]&&!confirm('There is already a photo in "'+z2+'". Replace it?'))return;v.photos[z2]=v.photos[it.key];delete v.photos[it.key];save();render();lbReload(z2)},
 lbdel:()=>{const it=LB.list[LB.i];if(!confirm('Delete the "'+it.key+'" photo? This cannot be undone.'))return;delete V().photos[it.key];save();render();const l=gal();if(!l.length)lbClose();else{LB.list=l;LB.i=Math.min(LB.i,l.length-1);lbShow()}},
 lbsave:()=>{const it=LB.list[LB.i],x=document.createElement('a');x.href=it.src;x.download=(V().name||'photo')+'-'+it.label+'.jpg';x.click()},
 vsw:id=>{db.act=id;lsave();render()},thumbdel:()=>{delete V().thumb;save();render()},
 cats:()=>openModal('Categories',catsHtml),mclose:closeModal,alock:()=>{TM.adminOk=0;showModal()},
 admin:()=>{if(TM.role==='admin'&&TM.status==='approved')openModal('Administrator',adminHtml)},
 rqsel:()=>{const rq=TM.reqs.filter(r=>r.status==='pending'),all=rq.length&&rq.every(r=>TM.sel[r.id]);TM.sel={};if(!all)rq.forEach(r=>TM.sel[r.id]=1);showModal()},
 rqapp:guard(async()=>{const ids=TM.reqs.filter(r=>r.status==='pending'&&TM.sel[r.id]);if(!ids.length)return alert('Tick at least one request first.');if(!confirm('Approve '+ids.length+' selected change request(s)?'))return;for(const r of ids)await rqDo(r,true);TM.sel={};applyRemote();render(true);toast('Approved')}),
 rqrej:guard(async()=>{const ids=TM.reqs.filter(r=>r.status==='pending'&&TM.sel[r.id]);if(!ids.length)return alert('Tick at least one request first.');if(!confirm('Reject '+ids.length+' selected change request(s)?'))return;for(const r of ids)await rqDo(r,false);TM.sel={};toast('Rejected')}),
 vpall:guard(async id=>{const[u,vi]=id.split('|'),o={};PERMS.forEach(p=>o[p[0]]=true);await FS().collection('users').doc(u).update({['vperms.'+vi]:o});toast('Saved')}),
 vpdef:guard(async id=>{const[u,vi]=id.split('|');await FS().collection('users').doc(u).update({['vperms.'+vi]:firebase.firestore.FieldValue.delete()});toast('Saved')}),
 pmset:guard(async id=>{const[u,t]=id.split('|'),o={};PERMS.forEach(p=>o[p[0]]=t==='all'?true:p[2]);await FS().collection('users').doc(u).update({perms:o});toast('Saved')}),
 tm:guard(async id=>{const[u,f,v]=id.split('|'),m=TM.users.find(x=>x.id===u);if(!confirm('Set '+f+' to "'+v+'" for '+(m?m.email:'this person')+'?'))return;await FS().collection('users').doc(u).update(f==='status'&&v==='approved'&&m&&m.vehicles===undefined&&m.role!=='admin'?{[f]:v,vehicles:[]}:{[f]:v});toast('Updated')}),
 tmdel:guard(async id=>{if(confirm('Remove this member? They can ask for access again.'))await FS().collection('users').doc(id).delete()}),
 jx:()=>{const d=JSON.parse(JSON.stringify(db));delete d.pin;dl('vehiclehub-backup-'+today()+'.json',JSON.stringify(d),'application/json');db.lastBackup=Date.now();save();render()}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b)A[b.dataset.a]?.(b.dataset.id,b)});
$('#bell').onclick=panel;
$('#vadd').onclick=()=>{const n=prompt('Vehicle name');if(!n)return;const v=newV(n,(prompt('Plate number (optional)')||'').toUpperCase());if(TM.on&&TM.role==='admin')ensureLists().catch(()=>{});db.v.filter(x=>x.ph).forEach(x=>db.v.splice(db.v.indexOf(x),1));db.v.push(v);db.act=v.id;save();scr='prof';render()};
$('#vdel').onclick=()=>{if(db.v.length<2)return alert('Keep at least one vehicle.');const v=V();if(confirm(`Delete ${v.name} and all its data?`)){db.v=db.v.filter(x=>x!==v);db.act=db.v[0].id;save();render()}};
document.addEventListener('input',e=>{if(e.target.id==='q'){F.q=e.target.value;list()}});
document.addEventListener('change',e=>{if(e.target.id==='ft'){F.t=e.target.value;list()}if(e.target.id==='fs'){F.s=e.target.value;list()}
 if(e.target.id==='jin'){const f=e.target.files[0];if(!f)return;if(!/\.json$/i.test(f.name))return alert('Only .json backup files are accepted.');f.text().then(t=>{try{const d=JSON.parse(t);if(!d.v)throw 0;if(!confirm('Importing replaces the data on this device. Continue?'))return;const pin=db.pin,u=db.user;db=fix(d);db.pin=pin;db.user=u;if(!db.v.find(x=>x.id===db.act))db.act=db.v[0].id;save();render();toast('Imported')}catch(x){alert('This is not a valid VehicleHub backup file.')}})}});
const hash=async p=>{const s='mk|'+p;if(!crypto.subtle)return btoa(s);return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')};
const FORM={
 log(o,v){const q=parsePay(o,v.partners,+o.amt),e={t:o.t,date:o.date,odo:+o.odo,cat:o.cat,amt:+o.amt,lit:+o.lit||0,fl:o.t==='fuel'&&!!o.fl,scope:q.scope,pd:q.pd,sh:q.sh,payer:Object.keys(q.pd)[0],note:o.note};
  if(editId){Object.assign(v.logs.find(l=>l.id===editId),e);editId=null}else v.logs.push({id:uid(),...e});save();toast('Saved');scr='logs';render()},
 async veh(o,v,f){if(f.get('thumb')&&f.get('thumb').size)v.thumb=await thumbPic(f.get('thumb'));Object.assign(v,{name:o.name,plate:o.plate.toUpperCase(),model:o.model,odo0:+o.odo0||0,tank:+o.tank||0});const p=o.partners.split(',').map(s=>s.trim()).filter(Boolean).slice(0,4);v.partners=p.length?p:['You'];save();toast('Saved');render()},
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
/* ---------- photo viewer ---------- */
let LB=null,Z={s:1,x:0,y:0};
const gal=()=>Object.entries(V().photos||{}).filter(([z,d])=>d).sort((p,q)=>ZONES.indexOf(p[0])-ZONES.indexOf(q[0])).map(([z,d])=>({k:'g',key:z,src:d,label:z}));
function lbAp(){const w=$('#lbs').clientWidth,h=$('#lbs').clientHeight,mx=(Z.s-1)*w/2,my=(Z.s-1)*h/2;Z.x=Math.max(-mx,Math.min(mx,Z.x));Z.y=Math.max(-my,Math.min(my,Z.y));$('#lbi').style.transform=`translate(${Z.x}px,${Z.y}px) scale(${Z.s})`}
function lbReset(){Z={s:1,x:0,y:0};lbAp()}
function lbShow(){const it=LB.list[LB.i];lbReset();$('#lbi').src=it.src;$('#lbt').textContent=it.label;$('#lbn').textContent=LB.list.length>1?(LB.i+1)+' / '+LB.list.length:'';
 document.querySelectorAll('.lbn').forEach(b=>b.classList.toggle('hide',LB.list.length<2));$('#lbzr').classList.add('hide');
 $('#lbb').innerHTML=it.k==='g'&&TM.role!=='viewer'?'<button data-a=lbrep>Replace</button><button data-a=lbrot>Rotate</button><button data-a=lbmove>Move zone</button><button data-a=lbsave>Save</button><button class=dg data-a=lbdel>Delete</button>':'<button data-a=lbsave>Save</button>'}
function lbOpen(l,i){if(!l.length)return;if(!LB)history.pushState({lb:1},'');LB={list:l,i};$('#lb').classList.remove('hide');lbShow()}
function lbClose(){if(!LB)return;LB=null;$('#lb').classList.add('hide');if(history.state&&history.state.lb)history.back()}
const lbGo=n=>{if(!LB||LB.list.length<2)return;LB.i=(LB.i+n+LB.list.length)%LB.list.length;lbShow()};
function lbReload(z){const l=gal();if(!l.length)return lbClose();LB.list=l;LB.i=Math.max(0,l.findIndex(x=>x.key===z));lbShow()}
window.addEventListener('popstate',()=>{if(LB){LB=null;$('#lb').classList.add('hide')}});
(()=>{const s=$('#lbs'),P=new Map();let d0=0,s0=1,last=0,sx=0,moved=false;
 s.onpointerdown=e=>{s.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=false;if(P.size===2){const[p,q]=[...P.values()];d0=Math.hypot(p.x-q.x,p.y-q.y);s0=Z.s}else{sx=e.clientX;const n=Date.now();if(n-last<300){Z.s>1?lbReset():(Z.s=2.5,lbAp());last=0}else last=n}};
 s.onpointermove=e=>{const p=P.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;moved=true;
  if(P.size===2){const[u,v]=[...P.values()];Z.s=Math.min(6,Math.max(1,s0*Math.hypot(u.x-v.x,u.y-v.y)/d0));if(Z.s===1){Z.x=Z.y=0}lbAp()}else if(Z.s>1){Z.x+=dx;Z.y+=dy;lbAp()}};
 s.onpointerup=s.onpointercancel=e=>{P.delete(e.pointerId);if(!P.size&&Z.s===1&&moved){const dx=e.clientX-sx;if(Math.abs(dx)>70)lbGo(dx<0?1:-1)}if(Z.s<1.03)lbReset()};
 s.addEventListener('wheel',e=>{e.preventDefault();Z.s=Math.min(6,Math.max(1,Z.s*(e.deltaY<0?1.15:.87)));if(Z.s===1){Z.x=Z.y=0}lbAp()},{passive:false});
 $('#lbf').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f||!LB)return;try{const d=await pic(f),it=LB.list[LB.i];V().photos[it.key]=d;save();render();lbReload(it.key)}catch(x){alert(x.message||x)}};
 document.addEventListener('keydown',e=>{if(!LB)return;if(e.key==='Escape')lbClose();if(e.key==='ArrowLeft')lbGo(-1);if(e.key==='ArrowRight')lbGo(1)})})();
/* ---------- lock ---------- */
function start(){render();autoTeam()}
function lockCheck(){const p=db.pin;if(p&&!(p.ask===false&&localStorage.getItem('mk_ok')===p.h)){$('#lock').classList.remove('hide');$('#pin').focus()}else start()}
$('#unlock').onclick=async()=>{const h=await hash($('#pin').value);if(h===db.pin.h){if(db.pin.ask===false)localStorage.setItem('mk_ok',h);$('#lock').classList.add('hide');$('#pin').value='';start()}else $('#pinerr').textContent='Wrong PIN. Try again.'};
$('#pin').onkeydown=e=>e.key==='Enter'&&$('#unlock').click();
$('#forgot').onclick=guard(async()=>{if(!db.user)return alert('PIN reset needs an account. You are in guest mode, so the only way to remove the lock is to clear this app\'s site data (this erases local data).');
 const p=prompt('Enter the password for '+db.user+' to remove the PIN');if(!p)return;const f=await F_();await f.auth().signInWithEmailAndPassword(db.user,p);db.pin=null;localStorage.removeItem('mk_ok');save();$('#lock').classList.add('hide');start();toast('PIN removed. Set a new one in Settings.')});
lockCheck();
