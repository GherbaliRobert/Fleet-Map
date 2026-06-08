// Verifică autentificarea WebSocket (sesiune pe handshake) + că neautentificații nu primesc date.
const WebSocket = require('ws');
const BASE = 'http://localhost:3000';
function cookieFrom(res){ const sc=res.headers.getSetCookie?res.headers.getSetCookie():[res.headers.get('set-cookie')].filter(Boolean); for(const c of sc){const m=/connect\.sid=[^;]+/.exec(c); if(m) return m[0];} return null; }
let pass=0,fail=0; const check=(n,c)=>{c?(pass++,console.log('  ✅ '+n)):(fail++,console.log('  ❌ '+n));};

(async()=>{
  // 1) Fără auth → nu trebuie să primească 'init'
  await new Promise(resolve=>{
    const ws=new WebSocket('ws://localhost:3000');
    let gotInit=false;
    ws.on('message',m=>{ try{ if(JSON.parse(m).type==='init') gotInit=true; }catch(e){} });
    ws.on('close',()=>{ check('WS fără auth: închis, fără init (date)', !gotInit); resolve(); });
    ws.on('error',()=>{});
    setTimeout(()=>{ try{ws.close();}catch(e){} }, 1500);
  });
  // 2) Cu auth admin → trebuie să primească 'init'
  const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin123'})});
  const cookie=cookieFrom(r);
  await new Promise(resolve=>{
    const ws=new WebSocket('ws://localhost:3000',{headers:{Cookie:cookie}});
    let gotInit=false;
    ws.on('message',m=>{ try{ if(JSON.parse(m).type==='init'){ gotInit=true; check('WS cu auth: primește init', true); ws.close(); } }catch(e){} });
    ws.on('close',()=>{ if(!gotInit) check('WS cu auth: primește init', false); resolve(); });
    ws.on('error',()=>{});
    setTimeout(()=>{ try{ws.close();}catch(e){} }, 1500);
  });
  console.log('\n=== WS: '+pass+' passed, '+fail+' failed ==='); process.exit(fail>0?1:0);
})();
