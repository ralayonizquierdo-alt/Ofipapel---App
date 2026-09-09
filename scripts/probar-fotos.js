// Qué pasa cuando un cliente manda una FOTO.
//
//   node scripts/probar-fotos.js
//
// Existe por un fallo real: la rama de adjuntos llamaba a Netlify Blobs con una
// variable `event` que en esa función NO EXISTÍA. Reventaba con un
// ReferenceError justo DESPUÉS de contestar al cliente y ANTES de registrar la
// foto y avisar al equipo — o sea, el cliente veía una respuesta correcta y en
// el panel no aparecía nada. Desde fuera parecía que funcionaba.
//
// Por eso esta prueba ejecuta la rama ENTERA por el webhook de verdad, con Meta
// y el almacén simulados, en vez de comprobar las piezas por separado. El
// connectLambda simulado revienta si recibe undefined: es exactamente el fallo
// que se escapó.
const Module=require('module'); const orig=Module.prototype.require;
const crypto=require('crypto'); const SECRETO='s'; process.env.WHATSAPP_APP_SECRET=SECRETO;
let log=[];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const almacen=new Map();
process.env.WHATSAPP_TOKEN='token';
Module.prototype.require=function(p){
  if(p==='@netlify/blobs') return {connectLambda:(e)=>{ if(!e) throw new Error('connectLambda recibió undefined'); },
    getStore:()=>({set:async(k,v,o)=>{almacen.set(k,{data:v,metadata:o?.metadata}); log.push({t:'foto guardada',m:k});},
                   getWithMetadata:async(k)=>almacen.get(k)||null})};
  if(p==='./whatsapp-send') return {sendWhatsappMessage:async(t,m)=>{log.push({t:'respuesta',m});return{ok:true};},sendWhatsappTemplate:async()=>({ok:true}),uploadWhatsappMedia:async()=>({}),sendWhatsappMedia:async()=>({})};
  const m=orig.apply(this,arguments);
  if(p==='./whatsapp-agent-core') return {...m,
    notifyOwner:async(a)=>{log.push({t:'email al dueño',m:a.customerMessage});},
    notifyOwnerByWhatsapp:async(f,x)=>{log.push({t:'wapp al dueño',m:x});},
    getHistory:async()=>[], appendToHistory:async(f,u,a)=>{log.push({t:'guardado en el panel',m:u});},
    appendCustomerMessage:async()=>{}, isBotPaused:async()=>false,
    pauseBot:async(f,h)=>{log.push({t:'bot en pausa',m:h+' h'});}, askClaude:async()=>'x'};
  if(p==='./conversation-store') return {...m, isConfigured:()=>true, claimMessage:async()=>true, getFichaCliente:async()=>({presentado:true}), getPausaGlobal:async()=>null, marcarPresentado:async()=>{}};
  return m;
};
const wh=require(require('path').join(__dirname,'..','netlify/functions/whatsapp-webhook.js'));
Module.prototype.require=orig;
global.fetch=async(url)=>{
  if(String(url).includes('graph.facebook.com/v20.0/')) return {ok:true,json:async()=>({url:'https://lookaside.meta/x',mime_type:'image/jpeg',file_size:PNG.length})};
  if(String(url).includes('lookaside')) return {ok:true,arrayBuffer:async()=>PNG.buffer.slice(PNG.byteOffset,PNG.byteOffset+PNG.length)};
  return {ok:true,json:async()=>({}),text:async()=>'{}'};
};

const ev=(msg)=>{ const body=JSON.stringify({entry:[{changes:[{value:{messages:[{from:'34600777222',id:'wamid.'+Math.random(),...msg}],contacts:[{profile:{name:'Cliente'}}]}}]}]});
  return {httpMethod:'POST',headers:{'x-hub-signature-256':'sha256='+crypto.createHmac('sha256',SECRETO).update(Buffer.from(body,'utf8')).digest('hex')},body}; };

let fallos=0;
(async()=>{
  for(const [etiqueta,msg] of [
    ['Foto con pregunta', {type:'image', image:{id:'1', caption:'¿Tenéis este cartucho?'}}],
    ['Foto sin texto',    {type:'image', image:{id:'2'}}],
    ['Audio',             {type:'audio', audio:{id:'3'}}],
  ]){
    log=[];
    await wh.handler(ev(msg));
    console.log('=== '+etiqueta);
    log.forEach(l=>console.log(`   [${l.t}] ${l.m}`));

    // Lo que NO puede faltar nunca: que quede registrado y que avise. Que la
    // foto se guarde es deseable, pero puede fallar (Meta lento) sin que eso
    // deje al cliente sin atención.
    const tiene=(t)=>log.some(l=>l.t===t);
    for(const obligatorio of ['respuesta','guardado en el panel','bot en pausa','email al dueño']){
      if(!tiene(obligatorio)){ fallos++; console.log(`   ✗ FALTA: ${obligatorio}`); }
    }
    if(msg.type==='image' && !tiene('foto guardada')){ fallos++; console.log('   ✗ FALTA: la foto no se guardó'); }
    console.log();
  }
  console.log(fallos===0 ? '✔ Sin fallos' : `✗ ${fallos} fallos`);
  process.exit(fallos===0?0:1);
})();
