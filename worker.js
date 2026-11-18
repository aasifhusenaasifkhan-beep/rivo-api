// Secrets/vars: ADMIN_KEY (secret), SITE (https://yoursite.pages.dev). D1 binding: DB
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*'}});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
// Site password gate (admin panel se add/delete). Koi password nahi = gate band.
const hm=async(k,s)=>{const kk=await crypto.subtle.importKey('raw',new TextEncoder().encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',kk,new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')};
let GC={t:0,v:[]};const FL=new Map;
const GL=async(env,f)=>{if(!f&&Date.now()-GC.t<30000)return GC.v;let v=[];try{v=JSON.parse((await env.DB.prepare("select v from settings where k='gate'").first())?.v||'[]')}catch{}GC={t:Date.now(),v};return v};
const VL=async env=>{try{return JSON.parse((await env.DB.prepare("select v from settings where k='vtargets'").first())?.v||'[]')}catch{return[]}};
const GW=async(env,L)=>{await env.DB.prepare("insert or replace into settings(k,v) values('gate',?)").bind(JSON.stringify(L)).run();GC={t:0,v:[]}};
const mk=async(env,pw)=>{const e=Date.now()+30*864e5,h=await sha(pw);return e+'.'+h+'.'+await hm(env.ADMIN_KEY,e+'.'+h)};
const GO=async(r,env)=>{const L=await GL(env);if(!L.length)return 1;const t=(r.headers.get('authorization')||'').slice(7).split('.');if(t.length!=3||+t[0]<Date.now())return 0;if(await hm(env.ADMIN_KEY,t[0]+'.'+t[1])!==t[2])return 0;for(const p of L)if(await sha(p)===t[1])return 1;return 0};
const sp=s=>String(s||'').replace(/\s+/g,' ').trim(),ss=s=>{const n=parseInt(String(s||'').replace(/\D/g,''));return String(n>0?n:1).padStart(2,'0')},okU=s=>/^https?:\/\/\S{3,}/.test(String(s||'').trim())?String(s).trim():'';
const H={async fetch(r,env){
if(r.method==='OPTIONS')return J({});
const u=new URL(r.url),p=u.pathname,db=env.DB,q=u.searchParams;
const b=r.method==='POST'?await r.json().catch(()=>({})):{};
const R=(s,...v)=>db.prepare(s).bind(...v);
try{
if(/^\/api\/dl/.test(p)&&!await GO(r,env))return J({error:'Password dalo',locked:1},401);
if(p==='/api/posts'){
 const pg=Math.max(1,+q.get('page')||1),w=[],a=[];
 if(q.get('cat')){w.push('category=? collate nocase');a.push(q.get('cat'))}
 for(const gn of(q.get('genre')||'').split(',').filter(Boolean)){w.push("(' '||genres||' ') like ?");a.push('% '+gn.toLowerCase()+' %')}
 if(q.get('q')){w.push('name like ?');a.push('%'+q.get('q')+'%')}
 const az=q.get('az');
 if(az){if(az==='0-9')w.push("substr(name,1,1) between '0' and '9'");else{w.push('upper(substr(name,1,1))=?');a.push(az.toUpperCase())}}
 const W=w.length?'where '+w.join(' and '):'';
 const{results}=await R(`select id,name,image,category from posts ${W} order by updated desc,id desc limit 6 offset ?`,...a,(pg-1)*6).all();
 const t=await R(`select count(*) c from posts ${W}`,...a).first();
 return J({posts:results,pages:Math.ceil(t.c/6)})}
if(p==='/api/meta'){
 const{results}=await R('select category,genres from posts').all(),c=new Map,g=new Set;
 const cg={};results.forEach(x=>{const k=(x.category||'').trim();if(k&&!c.has(k.toLowerCase()))c.set(k.toLowerCase(),k);const n=c.get(k.toLowerCase());(x.genres||'').split(' ').filter(Boolean).forEach(y=>{g.add(y);if(n)(cg[n]??=new Set).add(y)})});
 const s=await R("select v from settings where k='popup'").first();
 let L={};try{L=JSON.parse((await R("select v from settings where k='links'").first())?.v||'{}')}catch{}
 let GM={};try{GM=JSON.parse((await R("select v from settings where k='gatemsg'").first())?.v||'{}')}catch{}
 return J({cats:[...c.values()],genres:[...g].sort(),popup:s?.v||'',gm:GM,links:L,cg:Object.fromEntries(Object.entries(cg).map(([k,v])=>[k,[...v].sort()]))})}
if(p.startsWith('/api/post/')){
 const id=p.split('/')[3],po=await R('select * from posts where id=?',id).first();
 const{results}=await R('select id,season,ep,quality,(length(coalesce(play_link,0))>1) hp from episodes where post_id=? order by season,cast(ep as int)',id).all();
 return J({post:po,eps:results})}
if(p==='/api/gate'){
 const ip=r.headers.get('cf-connecting-ip')||'x',f=FL.get(ip)||{n:0,t:Date.now()},x=String(b.pass||'').trim();
 if(Date.now()-f.t>6e5){f.n=0;f.t=Date.now()}
 if(f.n>=8)return J({error:'Bahut zyada galat try. 10 min baad try karo.'},429);
 if(!x||!(await GL(env)).includes(x)){f.n++;FL.set(ip,f);if(FL.size>500)FL.delete(FL.keys().next().value);return J({error:'Galat password'},401)}
 return J({token:await mk(env,x)})}
if(p==='/api/dl'){
 if((await VL(env)).length)return J({verify:1});
 const e=await R('select dl_link,play_link from episodes where id=?',b.ep).first(),l=e&&(b.k=='play'?e.play_link:e.dl_link);
 if(!l)return J({error:'Nahi mila'},404);
 return J({link:l})}
if(p==='/api/dl/start'){
 const V=await VL(env);if(!V.length)return J({error:'Verification band hai'},400);
 const e=await R('select id from episodes where id=?',b.ep).first();if(!e)return J({error:'Nahi mila'},404);
 const f=crypto.randomUUID();await R('insert into flows(f,ep,ts) values(?,?,?)',f,b.k=='play'?-e.id:e.id,Date.now()).run();
 return J({f,url:V[Math.floor(Math.random()*V.length)]})}
if(p==='/api/dl/verify'){
 const f=await R('select * from flows where f=? and used=0',b.f).first();
 if(!f||Date.now()-f.ts<15000||Date.now()-f.ts>36e5)return J({error:'Verification poora nahi hua. Dubara try karo.'},403);
 await R('update flows set used=1 where f=?',b.f).run();
 const e=await R('select dl_link,play_link from episodes where id=?',Math.abs(f.ep)).first(),l=e&&(f.ep<0?e.play_link:e.dl_link);
 if(!l)return J({error:'Nahi mila'},404);
 return J({link:l})}
if(p==='/api/ids')return J((await R('select id,name from posts order by id desc').all()).results);
if(p.startsWith('/api/admin/')){
 if(r.headers.get('x-admin')!==env.ADMIN_KEY)return J({error:'Unauthorized'},401);
 const a=p.split('/')[3],g=s=>{s=String(s||'').toLowerCase();return(/[#,]/.test(s)?s.split(/[#,]/):s.split(/\s+/)).map(x=>x.trim().replace(/\s+/g,'-')).filter(Boolean).join(' ')};
 if(a==='addPost')await R('insert into posts(name,image,category,genres,year,synopsis) values(?,?,?,?,?,?)',b.name,b.image,b.category,g(b.genres),b.year,b.synopsis).run();
 else if(a==='bulkPosts'){const it=(Array.isArray(b.items)?b.items:[]).slice(0,50).map(x=>({name:sp(x.name),category:sp(x.category),genres:g(x.genres),year:sp(x.year),synopsis:String(x.synopsis||'').trim(),image:okU(x.image)})).filter(x=>x.name&&x.category);
  const lw=it.map(x=>x.name.toLowerCase()),ex=new Set(lw.length?(await R(`select lower(name) n from posts where lower(name) in (${lw.map(()=>'?').join(',')})`,...lw).all()).results.map(x=>x.n):[]),seen=new Set,ins=[],sk=[];
  for(const x of it){const k=x.name.toLowerCase();if(ex.has(k)||seen.has(k)){sk.push(x.name);continue}seen.add(k);ins.push(R('insert into posts(name,image,category,genres,year,synopsis,updated) values(?,?,?,?,?,?,0)',x.name,x.image,x.category,x.genres,x.year,x.synopsis))}
  if(ins.length)await db.batch(ins);return J({added:ins.length,skipped:sk})}
 else if(a==='bulkEpisodes'){const it=(Array.isArray(b.items)?b.items:[]).slice(0,50).map(x=>({name:sp(x.name).toLowerCase(),season:ss(x.season),ep:sp(x.ep),quality:(sp(x.quality)||'HD').toUpperCase(),dl:okU(x.dl_link),pl:okU(x.play_link)})).filter(x=>x.name&&x.ep&&x.dl);
  const names=[...new Set(it.map(x=>x.name))],map={},nf=[];
  if(names.length)(await R(`select id,lower(name) n from posts where lower(name) in (${names.map(()=>'?').join(',')})`,...names).all()).results.forEach(r=>map[r.n]=r.id);
  for(const n of names)if(!map[n]){const r=(await R('select id from posts where lower(name) like ? limit 2','%'+n+'%').all()).results;if(r.length==1)map[n]=r[0].id;else nf.push(n)}
  const ids=[...new Set(Object.values(map))],have=new Set(ids.length?(await R(`select post_id,season,ep,quality from episodes where post_id in (${ids.map(()=>'?').join(',')})`,...ids).all()).results.map(r=>[r.post_id,r.season,r.ep,r.quality].join('|')):[]),ins=[];let dup=0;
  for(const x of it){const id=map[x.name];if(!id)continue;const k=[id,x.season,x.ep,x.quality].join('|');if(have.has(k)){dup++;continue}have.add(k);ins.push(R('insert into episodes(post_id,season,ep,dl_link,play_link,quality) values(?,?,?,?,?,?)',id,x.season,x.ep,x.dl,x.pl,x.quality))}
  if(ins.length)await db.batch(ins);return J({added:ins.length,dup,nf})}
 else if(a==='addEpisode'){const k=String(b.post||'').trim(),po=/^\d+$/.test(k)?await R('select id from posts where id=?',k).first():await R('select id from posts where name like ? order by id desc',`%${k}%`).first();
  if(!po)return J({error:'Post nahi mila'},404);
  await R('insert into episodes(post_id,season,ep,dl_link,play_link,quality) values(?,?,?,?,?,?)',po.id,ss(b.season),b.ep,b.dl_link,b.play_link,(b.quality||'HD').toUpperCase()).run();await R('update posts set updated=? where id=?',Date.now(),po.id).run()}
 else if(a==='delPost'){await R('delete from episodes where post_id=?',b.id).run();await R('delete from posts where id=?',b.id).run()}
 else if(a==='delEpisode')await R('delete from episodes where id=?',b.id).run();
 else if(a==='addPass'){const x=String(b.pass||'').trim();if(x.length<3)return J({error:'Password kam se kam 3 character ka rakho'},400);const L=await GL(env,1);if(!L.includes(x)){if(L.length>=50)return J({error:'Max 50 password'},400);L.push(x);await GW(env,L)}}
 else if(a==='setGateMsg')await R("insert or replace into settings(k,v) values('gatemsg',?)",JSON.stringify({m:String(b.msg||'').trim().slice(0,300),g:String(b.group||'').trim()})).run();
 else if(a==='addVerify'){const x=String(b.url||'').trim();if(!/^https?:\/\/\S{3,}$/.test(x))return J({error:'Sahi link dalo (https://...)'},400);const L=await VL(env);if(!L.includes(x)){if(L.length>=5)return J({error:'Max 5 link'},400);L.push(x);await R("insert or replace into settings(k,v) values('vtargets',?)",JSON.stringify(L)).run()}}
 else if(a==='delVerify')await R("insert or replace into settings(k,v) values('vtargets',?)",JSON.stringify((await VL(env)).filter(x=>x!==b.url))).run();
 else if(a==='verifies')return J((await VL(env)).map(u=>({u})));
 else if(a==='delPass')await GW(env,(await GL(env,1)).filter(x=>x!==b.pass));
 else if(a==='passes')return J((await GL(env,1)).map(p=>({p})));
 else if(a==='setImage')await R('update posts set image=? where id=?',b.image,b.id).run();
 else if(a==='setPopup')await R("insert or replace into settings(k,v) values('popup',?)",b.script).run();
 else if(a==='delPopup')await R("delete from settings where k='popup'").run();
 else if(a==='setLinks')await R("insert or replace into settings(k,v) values('links',?)",JSON.stringify({c:String(b.channel||'').trim(),g:String(b.group||'').trim()})).run();
 else if(a==='list'){const t={posts:'select id,name,category,image from posts order by id desc',episodes:'select id,post_id,season,ep,quality from episodes where post_id=? order by season,cast(ep as int)',popup:"select v as script from settings where k='popup'",links:"select v as script from settings where k='links'",gatemsg:"select v as script from settings where k='gatemsg'"}[b.t]||'select 1';return J((await(t.includes('?')?R(t,b.post_id):R(t)).all()).results)}
 return J({ok:1})}
}catch(e){return J({error:String(e.message||e)},500)}
return J({error:'not found'},404)}}

// 60 sec memory cache for public GET pages (D1 reads bachane ke liye)
const MC=new Map();
export default{async fetch(r,env){const u=new URL(r.url);
 if(r.method==='GET'&&/^\/api\/(meta|posts|post\/)/.test(u.pathname)){const h=MC.get(r.url);if(h&&Date.now()-h.t<60000)return new Response(h.b,{headers:h.h});
  const res=await H.fetch(r,env);if(!res.ok)return res;const b=await res.text(),hh=Object.fromEntries(res.headers);MC.set(r.url,{t:Date.now(),b,h:hh});if(MC.size>200)MC.delete(MC.keys().next().value);return new Response(b,{headers:hh})}
 return H.fetch(r,env)}};
