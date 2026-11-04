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
    appendCustomerMessage:async(f,u)=>{log.push({t:'guardado sin contestar',m:u});}, isBotPaused:async()=>PAUSADO,
    pauseBot:async(f,h)=>{log.push({t:'bot en pausa',m:h+' h'});}, askClaude:async()=>'x'};
  if(p==='./conversation-store') return {...m, isConfigured:()=>true, claimMessage:async()=>true, getFichaCliente:async()=>({presentado:PRESENTADO}), getPausaGlobal:async()=>null, marcarPresentado:async()=>{},
    appendCustomerMessage:async(f,u)=>{log.push({t:'guardado sin contestar',m:u});}};
  return m;
};
const wh=require(require('path').join(__dirname,'..','netlify/functions/whatsapp-webhook.js'));
Module.prototype.require=orig;
global.fetch=async(url,opts)=>{
  try{ const b=JSON.parse(opts?.body||'{}');
       if(b.type==='interactive') log.push({t:'botones',m:b.interactive?.body?.text}); }catch{}
  // El tipo depende del adjunto que se pida: los ids 3, 7 y 8 son notas de voz,
  // y tienen que viajar como audio para que el panel las pinte con reproductor.
  if(String(url).includes('graph.facebook.com/v20.0/')){
    const id=String(url).split('/v20.0/')[1].split(/[?#]/)[0];
    const mime = ['3','7','8'].includes(id) ? 'audio/ogg; codecs=opus' : 'image/jpeg';
    return {ok:true,json:async()=>({url:'https://lookaside.meta/x',mime_type:mime,file_size:PNG.length})};
  }
  if(String(url).includes('lookaside')) return {ok:true,arrayBuffer:async()=>PNG.buffer.slice(PNG.byteOffset,PNG.byteOffset+PNG.length)};
  // El transcriptor de las notas de voz (whatsapp-voz.js).
  if(String(url).includes('api.openai.com/v1/audio/transcriptions')){
    log.push({t:'transcrito',m:TRANSCRIPCION});
    return {ok:true,json:async()=>({text:TRANSCRIPCION})};
  }
  return {ok:true,json:async()=>({}),text:async()=>'{}'};
};

const ev=(msg)=>{ const body=JSON.stringify({entry:[{changes:[{value:{messages:[{from:'34600777222',id:'wamid.'+Math.random(),...msg}],contacts:[{profile:{name:'Cliente'}}]}}]}]});
  return {httpMethod:'POST',headers:{'x-hub-signature-256':'sha256='+crypto.createHmac('sha256',SECRETO).update(Buffer.from(body,'utf8')).digest('hex')},body}; };

let fallos=0;
global.PRESENTADO=true;
global.PAUSADO=false;
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
    // Se PREGUNTA si quiere una persona; no se pausa ni se avisa por cuenta
    // propia. Eso pasa solo si el cliente pulsa "Sí" (ver handleEscalateReply).
    for(const obligatorio of ['botones','guardado en el panel']){
      if(!tiene(obligatorio)){ fallos++; console.log(`   ✗ FALTA: ${obligatorio}`); }
    }
    // Desde el 2/11/2026 el AUDIO también se guarda: "cuando un cliente envía
    // una nota de voz yo no puedo escucharla, solo llega un aviso".
    if((msg.type==='image'||msg.type==='audio') && !tiene('foto guardada')){ fallos++; console.log(`   ✗ FALTA: el adjunto (${msg.type}) no se guardó, no se verá en el panel`); }
    if(msg.type==='audio'){
      const guardado=(log.find(l=>l.t==='guardado en el panel')||{}).m||'';
      if(!/\[ADJUNTO:3\|audio\]/.test(guardado)){ fallos++; console.log('   ✗ la marca no dice que es audio: el panel lo pintaría como imagen'); }
      else console.log('    ✔ queda marcado como audio para el panel');
    }
    for(const prohibido of ['bot en pausa','email al dueño']){
      if(tiene(prohibido)){ fallos++; console.log(`   ✗ NO debería: ${prohibido} (se pregunta antes)`); }
    }
    console.log();
  }
  // Cliente NUEVO cuya primera interacción es una foto: tiene que enterarse de
  // que habla con un bot. Antes esta rama iba antes de la presentación y no se
  // presentaba nunca.
  global.PRESENTADO=false;
  log=[];
  await wh.handler(ev({type:'image', image:{id:'99'}}));
  const botones=(log.find(l=>l.t==='botones')||{}).m||'';
  console.log('=== Cliente nuevo (primera vez, manda foto)');
  console.log('   ', botones.slice(0,150));
  if(!/asistente virtual/i.test(botones)){ fallos++; console.log('   ✗ NO se presenta como bot'); }
  else console.log('    ✔ se presenta como bot');
  console.log();

  // CÓMO SE PINTA EN EL PANEL.
  //
  // Guardar el audio no sirve de nada si el panel lo mete en un <img>: saldría
  // un icono roto. Y lo que ya está guardado de antes NO lleva la clase en la
  // marca, así que tiene que seguir pintándose como imagen.
  {
    const conv = require(require('path').join(__dirname,'..','netlify/functions/conversations.js'));
    const pintar = conv.cuerpoDeBurbuja;
    const audio = pintar('34600777222', '[ADJUNTO:3|audio][El cliente envió un audio]');
    const foto  = pintar('34600777222', '[ADJUNTO:1][El cliente envió una foto]');
    console.log('=== Cómo lo pinta el panel');
    if(!/<audio[^>]+controls/.test(audio)){ fallos++; console.log('   ✗ el audio no sale con reproductor'); }
    else console.log('    ✔ el audio sale con reproductor');
    if(/<img/.test(audio)){ fallos++; console.log('   ✗ el audio sale como imagen: icono roto'); }
    if(!/<img/.test(foto)){ fallos++; console.log('   ✗ una foto guardada ANTES ya no se ve'); }
    else console.log('    ✔ las fotos de antes se siguen viendo igual');
    if(/<audio/.test(foto)){ fallos++; console.log('   ✗ una foto sale como audio'); }

    // LO QUE MANDAMOS NOSOTROS TAMBIÉN SE VE (4/11/2026).
    //
    // El propietario fue a revisar un presupuesto que había mandado el día
    // antes —«📎 Lo Squalo Tenerife SL.pdf — Te adjunto el presupuesto»— y
    // detrás no había nada. No es que se hubiera perdido: el panel subía el
    // fichero a Meta, se lo enviaba al cliente y en el historial dejaba solo
    // ese renglón. Nunca se guardaba.
    //
    // Ahora se guarda con la misma marca que los del cliente, así que el panel
    // lo pinta igual sin tocar nada más. El nombre y el texto siguen a la
    // vista, que es lo que identifica el documento de un vistazo.
    const { marcaDeAdjunto } = require(require('path').join(__dirname,'..','netlify/functions/whatsapp-media.js'));
    const enviado = pintar('34600777222', `${marcaDeAdjunto('9911', 'application/pdf')}📎 Lo Squalo Tenerife SL.pdf — Te adjunto el presupuesto`);
    if(!/vista=media[^"]*id=9911/.test(enviado)){ fallos++; console.log('   ✗ el PDF que mandamos no se puede abrir desde el panel'); }
    else console.log('    ✔ el PDF que mandamos se abre desde el panel');
    if(!/Lo Squalo Tenerife SL\.pdf/.test(enviado)){ fallos++; console.log('   ✗ se perdió el nombre del fichero'); }
    if(!/Te adjunto el presupuesto/.test(enviado)){ fallos++; console.log('   ✗ se perdió el texto que lo acompañaba'); }

    // Y los renglones de ANTES del arreglo no se rompen: siguen saliendo como
    // texto, sin marca y sin fichero. No hay forma de recuperarlos.
    const viejo = pintar('34600777222', '📎 Lo Squalo Tenerife SL.pdf — Te adjunto el presupuesto');
    if(/<img|<a /.test(viejo)){ fallos++; console.log('   ✗ un envío antiguo intenta abrir un fichero que no existe'); }
    else console.log('    ✔ los envíos antiguos siguen saliendo como texto');
    console.log();
  }

  // LA NOTA DE VOZ, ESCUCHADA.
  //
  // "El robot tampoco" (propietario, 2/11/2026): que la oiga una persona
  // arregla la mitad. Claude no oye —la API no admite audio—, así que se
  // transcribe aparte y a partir de ahí ES un mensaje escrito: entra por el
  // mismo camino, con sus respuestas fijas, su catálogo y sus redes.
  //
  // Lo que se comprueba aquí es justo eso: que NO se queda en "no puedo leer
  // un audio", y que lo oído queda escrito en el panel debajo del audio.
  {
    global.TRANSCRIPCION = '¿a qué hora abrís los sábados?';
    process.env.OPENAI_API_KEY = 'clave-de-prueba';
    log=[];
    await wh.handler(ev({type:'audio', audio:{id:'7'}}));
    console.log('=== Nota de voz (con transcriptor)');
    log.forEach(l=>console.log(`   [${l.t}] ${String(l.m).slice(0,120)}`));
    const texto=(t)=>(log.find(l=>l.t===t)||{}).m||'';
    if(!log.some(l=>l.t==='transcrito')){ fallos++; console.log('   ✗ no se transcribió'); }
    if(!/🎙️ el bot oye/.test(texto('guardado sin contestar'))){ fallos++; console.log('   ✗ lo oído no queda en el panel'); }
    else console.log('    ✔ lo oído queda en el panel, debajo del audio');
    const dicho = log.filter(l=>l.t==='respuesta'||l.t==='botones').map(l=>String(l.m)).join(' | ');
    if(/no puedo leer un audio/i.test(dicho)){ fallos++; console.log('   ✗ sigue diciendo que no puede leer el audio'); }
    else console.log('    ✔ ya no se excusa: contesta a lo que dijo');
    // Y lo que se contesta sale del CAMINO DE SIEMPRE, no de un contestador
    // aparte: el horario es una respuesta fija, así que si aparece es que la
    // transcripción entró por la puerta principal.
    if(!/s[áa]bado/i.test(dicho)){ fallos++; console.log('   ✗ no contestó el horario: no pasó por las respuestas fijas'); }
    else console.log('    ✔ entra por el camino de siempre (contestó la respuesta fija del horario)');
    console.log();

    // Y SIN CLAVE, COMO SIEMPRE. El transcriptor es opcional: si no está
    // configurado en el sitio del bot, el audio se guarda para escucharlo y se
    // le ofrece una persona, exactamente como antes.
    delete process.env.OPENAI_API_KEY;
    log=[];
    await wh.handler(ev({type:'audio', audio:{id:'8'}}));
    console.log('=== Nota de voz (sin transcriptor)');
    log.forEach(l=>console.log(`   [${l.t}] ${String(l.m).slice(0,120)}`));
    if(log.some(l=>l.t==='transcrito')){ fallos++; console.log('   ✗ transcribió sin clave'); }
    if(!log.some(l=>l.t==='foto guardada')){ fallos++; console.log('   ✗ ni siquiera se guardó para escucharlo'); }
    const dicho2 = log.filter(l=>l.t==='respuesta'||l.t==='botones').map(l=>String(l.m)).join(' | ');
    if(!/no puedo leer un audio/i.test(dicho2)){ fallos++; console.log('   ✗ debería seguir ofreciendo una persona'); }
    else console.log('    ✔ sin clave, el camino de siempre');
    console.log();
  }

  // UNA REACCIÓN NO ES UNA PREGUNTA.
  //
  // Un 👍 sobre un mensaje llega como type:'reaction' y caía en la rama de
  // fotos: el cliente recibía "No puedo leer un mensaje de tipo reaction por
  // aquí" y los botones de hablar con una persona. Visto en real el 30/9/2026,
  // fuera de horario y acabando en un escalado. Por dar las gracias.
  global.PRESENTADO=true;
  log=[];
  await wh.handler(ev({type:'reaction', reaction:{message_id:'wamid.X', emoji:'👍'}}));
  console.log('=== Una reacción (👍)');
  log.forEach(l=>console.log(`   [${l.t}] ${l.m}`));
  const tieneR=(t)=>log.some(l=>l.t===t);
  for(const prohibido of ['botones','respuesta']){
    if(tieneR(prohibido)){ fallos++; console.log(`   ✗ NO debería contestar a una reacción: ${prohibido}`); }
  }
  if(!tieneR('guardado sin contestar')){ fallos++; console.log('   ✗ FALTA: no queda constancia en el panel de que reaccionó'); }
  else if(!log.some(l=>String(l.m).includes('👍'))){ fallos++; console.log('   ✗ se guarda sin el emoji: no se sabe qué puso'); }
  else console.log('    ✔ se archiva con su emoji y no se contesta');
  console.log();

  // UN STICKER TAMPOCO ES UNA PREGUNTA, y es el mismo caso que la reacción
  // entrando por otra puerta: un sticker de pulgar arriba cierra una
  // conversación igual que el 👍 pegado a un mensaje. Se llevaba "no puedo leer
  // un sticker por aquí, ¿quieres que te ponga en contacto con una persona?" —
  // el mismo disparate que se arregló el 30/9/2026 con las reacciones.
  //
  // Sí se descarga y se archiva: en el panel un sticker dice algo.
  log=[];
  await wh.handler(ev({type:'sticker', sticker:{id:'4'}}));
  console.log('=== Un sticker');
  log.forEach(l=>console.log(`   [${l.t}] ${l.m}`));
  const tieneK=(t)=>log.some(l=>l.t===t);
  for(const prohibido of ['botones','respuesta']){
    if(tieneK(prohibido)){ fallos++; console.log(`   ✗ NO debería contestar a un sticker: ${prohibido}`); }
  }
  if(!tieneK('guardado sin contestar')){ fallos++; console.log('   ✗ FALTA: el sticker no llega al panel'); }
  else if(!tieneK('foto guardada')){ fallos++; console.log('   ✗ FALTA: el sticker no se descargó, no se verá'); }
  else console.log('    ✔ se archiva con su imagen y no se contesta');
  console.log();

  // UN AVISO DE WHATSAPP NO ES UNA PREGUNTA.
  //
  // Los `system` no los escribe el cliente: los manda Meta, y lo normal es que
  // sea un cambio de número. Al cliente le llegó "No puedo leer un mensaje de
  // tipo system por aquí. ¿Quieres que te ponga en contacto con una persona?"
  // — a un aviso automático. Visto en real el 17/10/2026.
  log=[];
  await wh.handler(ev({type:'system', system:{type:'user_changed_number', wa_id:'34611000111', body:'Cambió a 34611000111'}}));
  console.log('=== Un aviso de WhatsApp (cambio de número)');
  log.forEach(l=>console.log(`   [${l.t}] ${l.m}`));
  const tieneS=(t)=>log.some(l=>l.t===t);
  for(const prohibido of ['botones','respuesta']){
    if(tieneS(prohibido)){ fallos++; console.log(`   ✗ NO debería contestar a un aviso del sistema: ${prohibido}`); }
  }
  if(!tieneS('guardado sin contestar')){ fallos++; console.log('   ✗ FALTA: no queda constancia del aviso'); }
  else if(!log.some(l=>/cambiado de n/i.test(String(l.m)))){ fallos++; console.log('   ✗ no dice que cambió de número: es el dato que importa'); }
  else if(!log.some(l=>String(l.m).includes('34611000111'))){ fallos++; console.log('   ✗ no apunta el número nuevo'); }
  else console.log('    ✔ se anota el cambio de número y no se contesta');
  console.log();

  // CON EL BOT EN PAUSA NO HABLA, MANDE LO QUE MANDE.
  //
  // La comprobación de la pausa estaba DESPUÉS de esta rama, así que solo
  // valía para el texto: con una persona atendiendo la conversación, una foto
  // hacía que el bot se metiera por medio a preguntar si quería hablar con
  // alguien. Visto en real el 30/9/2026.
  global.PAUSADO=true;
  log=[];
  await wh.handler(ev({type:'image', image:{id:'9', caption:'la máquina es ésta'}}));
  console.log('=== Foto con el bot en pausa (contesta una persona)');
  log.forEach(l=>console.log(`   [${l.t}] ${l.m}`));
  const tieneP=(t)=>log.some(l=>l.t===t);
  for(const prohibido of ['botones','respuesta']){
    if(tieneP(prohibido)){ fallos++; console.log(`   ✗ el bot habla por encima de quien está atendiendo: ${prohibido}`); }
  }
  if(!tieneP('guardado sin contestar')){ fallos++; console.log('   ✗ FALTA: la foto no llega al panel'); }
  else console.log('    ✔ la foto llega al panel y el bot se calla');
  if(!tieneP('foto guardada')){ fallos++; console.log('   ✗ FALTA: el adjunto no se descargó, no se verá la foto'); }
  global.PAUSADO=false;
  console.log();

  console.log(fallos===0 ? '✔ Sin fallos' : `✗ ${fallos} fallos`);
  process.exit(fallos===0?0:1);
})();
