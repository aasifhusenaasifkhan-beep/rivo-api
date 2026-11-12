// Secrets/vars: ADMIN_KEY (secret), SITE (https://yoursite.pages.dev). D1 binding: DB
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'*'}});
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export default{async fetch(r,env){
if(r.method==='OPTIONS')return J({});
const u=new URL(r.url),p=u.pathname,db=env.DB,q=u.searchParams;
const b=r.method==='POST'?await r.json().catch(()=>({})):{};
const R=(s,...v)=>db.prepare(s).bind(...v);
const prem=async()=>{const t=(r.headers.get('authorization')||'').slice(7);return t&&await R('select email from users where session=?',t).first()};
try{
if(p==='/api/posts'){
 const pg=Math.max(1,+q.get('page')||1),w=[],a=[];
 if(q.get('cat')){w.push('category=? collate nocase');a.push(q.get('cat'))}
 if(q.get('genre')){w.push("(' '||genres||' ') like ?");a.push('% '+q.get('genre').toLowerCase()+' %')}
 if(q.get('q')){w.push('name like ?');a.push('%'+q.get('q')+'%')}
 const az=q.get('az');
 if(az){if(az==='0-9')w.push("substr(name,1,1) between '0' and '9'");else{w.push('upper(substr(name,1,1))=?');a.push(az.toUpperCase())}}
 const W=w.length?'where '+w.join(' and '):'';
 const{results}=await R(`select id,name,image,category from posts ${W} order by id desc limit 6 offset ?`,...a,(pg-1)*6).all();
 const t=await R(`select count(*) c from posts ${W}`,...a).first();
 return J({posts:results,pages:Math.ceil(t.c/6)})}
if(p==='/api/meta'){
 const{results}=await R('select category,genres from posts').all(),c=new Map,g=new Set;
 results.forEach(x=>{const k=(x.category||'').trim();if(k&&!c.has(k.toLowerCase()))c.set(k.toLowerCase(),k);(x.genres||'').split(' ').filter(Boolean).forEach(y=>g.add(y))});
 const s=await R("select v from settings where k='popup'").first();
 const sh=(await R('select id,home from shorteners').all()).results.map(x=>({id:x.id,n:new URL(x.home).hostname}));
 return J({cats:[...c.values()],genres:[...g].sort(),popup:s?.v||'',shorts:sh})}
if(p.startsWith('/api/post/')){
 const id=p.split('/')[3],po=await R('select * from posts where id=?',id).first();
 const{results}=await R('select id,season,ep,quality,play_link from episodes where post_id=? order by season,cast(ep as int)',id).all();
 return J({post:po,eps:results})}
if(p==='/api/login'){
 const x=await R('select email from users where email=? and pass=?',String(b.email).toLowerCase(),await sha(b.pass)).first();
 if(!x)return J({error:'Galat email/password'},401);
 const t=crypto.randomUUID();await R('update users set session=? where email=?',t,x.email).run(); // purana session auto-logout
 return J({token:t})}
if(p==='/api/dl'){
 const e=await R('select dl_link from episodes where id=?',b.ep).first();
 if(!e)return J({error:'Nahi mila'},404);
 return await prem()?J({link:e.dl_link}):J({shorts:1})}
if(p==='/api/dl/start'){
 const s=await R('select * from shorteners where id=?',b.sid).first();
 if(!s)return J({error:'Shortener nahi mila'},404);
 const f=crypto.randomUUID();await R('insert into flows(f,ep,ts) values(?,?,?)',f,b.ep,Date.now()).run();
 const x=await(await fetch(`${s.home.replace(/\/$/,'')}/api?api=${s.api}&url=${encodeURIComponent(env.SITE+'/?f='+f)}`)).json();
 if(!x.shortenedUrl)return J({error:'Shortener error'},502);
 return J({url:x.shortenedUrl})}
if(p==='/api/dl/verify'){
 const f=await R('select * from flows where f=? and used=0',b.f).first();
 if(!f||Date.now()-f.ts<15000)return J({error:'Aapne bypass kiya hai, dubara kijiye solve.'},403);
 await R('update flows set used=1 where f=?',b.f).run();
 return J({link:(await R('select dl_link from episodes where id=?',f.ep).first()).dl_link})}
if(p==='/api/ids')return J((await R('select id,name from posts order by id desc').all()).results);
if(p.startsWith('/api/admin/')){
 if(r.headers.get('x-admin')!==env.ADMIN_KEY)return J({error:'Unauthorized'},401);
 const a=p.split('/')[3],g=s=>String(s||'').toLowerCase().replace(/#/g,' ').split(/[\s,]+/).filter(Boolean).join(' ');
 if(a==='addPost')await R('insert into posts(name,image,category,genres,year,synopsis) values(?,?,?,?,?,?)',b.name,b.image,b.category,g(b.genres),b.year,b.synopsis).run();
 else if(a==='addEpisode'){const k=String(b.post||'').trim(),po=/^\d+$/.test(k)?await R('select id from posts where id=?',k).first():await R('select id from posts where name like ? order by id desc',`%${k}%`).first();
  if(!po)return J({error:'Post nahi mila'},404);
  await R('insert into episodes(post_id,season,ep,dl_link,play_link,quality) values(?,?,?,?,?,?)',po.id,b.season,b.ep,b.dl_link,b.play_link,(b.quality||'HD').toUpperCase()).run()}
 else if(a==='delPost'){await R('delete from episodes where post_id=?',b.id).run();await R('delete from posts where id=?',b.id).run()}
 else if(a==='delEpisode')await R('delete from episodes where id=?',b.id).run();
 else if(a==='addShortener'){if((await R('select count(*) c from shorteners').first()).c>=3)return J({error:'Max 3 shortener'},400);await R('insert into shorteners(home,api) values(?,?)',b.home,b.api).run()}
 else if(a==='delShortener')await R('delete from shorteners where id=?',b.id).run();
 else if(a==='addUser')await R('insert or replace into users(email,pass) values(?,?)',String(b.email).toLowerCase(),await sha(b.pass)).run();
 else if(a==='delUser')await R('delete from users where email=?',String(b.email).toLowerCase()).run();
 else if(a==='setImage')await R('update posts set image=? where id=?',b.image,b.id).run();
 else if(a==='setPopup')await R("insert or replace into settings(k,v) values('popup',?)",b.script).run();
 else if(a==='delPopup')await R("delete from settings where k='popup'").run();
 else if(a==='list'){const t={posts:'select id,name,category from posts',episodes:'select id,post_id,season,ep,quality from episodes',shorteners:'select id,home from shorteners',users:'select email from users'}[b.t]||'select 1';return J((await R(t).all()).results)}
 return J({ok:1})}
}catch(e){return J({error:String(e.message||e)},500)}
return J({error:'not found'},404)}}
