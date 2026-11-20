/* ===================== Configuración ===================== */
const CFG = {
  url: 'https://rgnunjngtsgqgvplawfr.supabase.co',
  key: 'sb_publishable_G6asVlNL8PHZamCS6r1_lQ_VeV-wsL3' // clave pública (publishable); la seguridad la da RLS
};
const ETAPAS_ACTIVAS = ['nuevo','contactado','prueba','cotizacion','apartado'];
const ETAPA_TXT = {nuevo:'Nuevo',contactado:'Contactado',prueba:'Prueba de manejo',cotizacion:'Cotización',apartado:'Apartado',vendido:'Vendido',perdido:'Perdido'};
const RUTA_TXT = {cierre:'Cierre',avance:'Avance',sin_presion:'Seguimiento sin presión',pausa:'Pausa',sin_leer:'Sin lectura'};
const RUTA_CLS = {cierre:'hot',avance:'warm',sin_presion:'cold',pausa:'',sin_leer:''};
const MOTIVOS = ['precio','financiamiento','compró otra marca','compró en otra agencia','ya no le interesa','no contesta','otro'];
const EVT_TXT = {
  landing_visita:'Visitó la landing', modelo_visto:'Vio un modelo', color:'Eligió color', cotizar_click:'Clic en cotizar',
  whatsapp_click:'Clic en WhatsApp', formulario:'Llenó el formulario', cuestionario:'Respondió el cuestionario',
  etapa:'Cambio de etapa', contacto:'Contacto registrado', nota:'Nota', tarea_hecha:'Tarea hecha',
  comentario:'Comentó', dm_enviado:'DM enviado', dm_recordatorio:'Recordatorio por DM', sigue_pendiente:'Seguir pendiente',
  sigue_confirmado:'Ya sigue la cuenta', link_entregado:'Liga entregada',
  ruta:'Cambio de ruta', guia:'Nueva guía', alerta_sla15:'Alerta: 15 min sin primer contacto', alerta_sla60:'Alerta: 60 min sin primer contacto (gerente)',
  alerta_espera:'Alerta: cliente esperando respuesta', alerta_sin_toque:'Alerta: lead sin toque'
};

/* ===================== Estado ===================== */
const DEMO = new URLSearchParams(location.search).has('demo');
const S = { sb:null, user:null, admin:false, rol:null, vista:'', eventos:[], asesores:[], asesorSel:'', dias:30, leads:[], tareas:[], tieneLectura:null, metricas:null, metSrc:'', filtroRuta:'', espera:false, q:'' };
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtFecha = d => d ? new Date(d).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Mexico_City'}) : '—';
function hace(d){
  if(!d) return '—';
  const m = (Date.now() - new Date(d).getTime())/60000;
  if(m < 1) return 'ahora'; if(m < 60) return Math.round(m)+' min';
  const h = m/60; if(h < 24) return Math.round(h)+' h';
  return Math.round(h/24)+' d';
}
function toast(t){ const el=document.createElement('div'); el.className='toast'; el.textContent=t; document.body.appendChild(el); setTimeout(()=>el.remove(),2600); }
const esperando = l => l.ultimo_msg_cliente_at && (!l.ultimo_contacto_at || new Date(l.ultimo_msg_cliente_at) > new Date(l.ultimo_contacto_at)) && !['vendido','perdido'].includes(l.etapa);
function calorCls(c){ if(c==null) return ''; if(c>=65) return 'hot'; if(c>=30) return 'warm'; return 'cold'; }

/* ===================== Datos (Supabase o demo) ===================== */
const API = {
  async init(){
    if(DEMO){ S.user={email:'demo@motor'}; S.admin=true; return true; }
    if(!window.supabase){ throw new Error('No cargó la librería de Supabase. Revisa tu conexión.'); }
    S.sb = window.supabase.createClient(CFG.url, CFG.key, {auth:{persistSession:true, detectSessionInUrl:true, storage: window.sessionStorage}}) /* una sesión por pestaña: se puede abrir admin y asesor a la vez */;
    const { data:{ session } } = await S.sb.auth.getSession();
    S.user = session?.user || null;
    S.sb.auth.onAuthStateChange((ev, ses) => {
      if(ev==='SIGNED_IN' && !S.user){ S.user=ses.user; boot(); }
      if(ev==='SIGNED_OUT'){ S.user=null; S.leads=[]; S.tareas=[]; $('#board').innerHTML=''; showLogin(); }
    });
    return !!S.user;
  },
  async perfil(){
    if(DEMO){ S.asesores = DEMO_DATA.asesores; S.rol = ['negocio','asesor'].includes(new URLSearchParams(location.search).get('rol')) ? new URLSearchParams(location.search).get('rol') : 'admin'; S.admin = S.rol==='admin'; if(S.rol==='asesor') S.asesores = S.asesores.slice(0,1); return; }
    // Liga la cuenta con su asesor por correo, solo si el correo ya fue confirmado
    if(S.user.email_confirmed_at){ try{ await S.sb.rpc('mv_vincular_cuenta'); }catch(_){} }
    const [a, ad] = await Promise.all([
      S.sb.from('mv_asesores').select('id,nombre,marca,agencia,user_id,activo').order('nombre'),
      S.sb.from('mv_admins').select('user_id').eq('user_id', S.user.id)
    ]);
    if(a.error) throw a.error;
    S.asesores = a.data || [];
    S.admin = !!(ad.data && ad.data.length);
    // Rol decidido por la base (mv_mi_rol). Si la función aún no existe, se deduce de lo que RLS deja ver.
    const r = await S.sb.rpc('mv_mi_rol');
    if(!r.error && r.data) S.rol = r.data;
    else S.rol = S.admin ? 'admin' : (S.asesores.some(x=>x.user_id===S.user.id) ? 'asesor' : (S.asesores.length ? 'negocio' : null));
    S.admin = S.rol==='admin';
  },
  async eventosPeriodo(){
    if(DEMO) return demoEventos();
    const desde = new Date(Date.now() - S.dias*86400000).toISOString();
    let q = S.sb.from('mv_eventos').select('tipo,sesion,asesor_id,lead_id,created_at').gte('created_at', desde).order('created_at',{ascending:false}).limit(20000);
    if(S.asesorSel) q = q.eq('asesor_id', S.asesorSel);
    const { data, error } = await q; if(error) return []; return data||[];
  },
  async leads(){
    if(DEMO) return DEMO_DATA.leads.filter(l => !S.asesorSel || l.asesor_id===S.asesorSel);
    let q = S.sb.from('mv_leads').select('*').order('created_at',{ascending:false}).limit(1000);
    if(S.asesorSel) q = q.eq('asesor_id', S.asesorSel);
    const { data, error } = await q; if(error) throw error; return data||[];
  },
  async tareasAbiertas(){
    if(DEMO) return DEMO_DATA.tareas.filter(t => !t.hecha_at && (!S.asesorSel || t.asesor_id===S.asesorSel));
    let q = S.sb.from('mv_tareas').select('*').is('hecha_at',null).is('cancelada_at',null).order('vence_at').limit(1000);
    if(S.asesorSel) q = q.eq('asesor_id', S.asesorSel);
    const { data, error } = await q; if(error) throw error; return data||[];
  },
  async metricas(){
    if(DEMO) return null;
    const p_asesor = S.asesorSel || (S.admin ? null : (S.asesores[0]?.id || null));
    const { data, error } = await S.sb.rpc('mv_metricas', { p_asesor, p_dias: S.dias });
    if(error) return null; // función aún no existe o sin permiso: se calcula en el navegador
    return data;
  },
  async detalle(lead){
    if(DEMO) return { eventos: DEMO_DATA.eventos.filter(e=>e.lead_id===lead.id), mensajes: DEMO_DATA.mensajes.filter(m=>m.lead_id===lead.id), tareas: DEMO_DATA.tareas.filter(t=>t.lead_id===lead.id) };
    const [e,m,t] = await Promise.all([
      S.sb.from('mv_eventos').select('id,tipo,datos,created_at').eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(300),
      S.sb.from('mv_mensajes').select('id,direccion,origen,tipo,cuerpo,enviado_at').eq('lead_id',lead.id).order('enviado_at',{ascending:false}).limit(300),
      S.sb.from('mv_tareas').select('*').eq('lead_id',lead.id).order('vence_at',{ascending:false})
    ]);
    return { eventos:e.data||[], mensajes:m.data||[], tareas:t.data||[] };
  },
  async registrarContacto(lead, nota){
    if(DEMO){ lead.ultimo_contacto_at=new Date().toISOString(); lead.primer_contacto_at ||= lead.ultimo_contacto_at; if(lead.etapa==='nuevo') lead.etapa='contactado'; return; }
    const { error } = await S.sb.rpc('mv_registrar_contacto', { p_lead: lead.id, p_nota: nota || null }); if(error) throw error;
  },
  async nota(lead, texto){
    if(DEMO){ DEMO_DATA.eventos.push({id:Math.random(),lead_id:lead.id,tipo:'nota',datos:{texto},created_at:new Date().toISOString()}); return; }
    const { error } = await S.sb.from('mv_eventos').insert({ asesor_id: lead.asesor_id, lead_id: lead.id, tipo:'nota', datos:{ texto } }); if(error) throw error;
  },
  async etapa(lead, etapa, motivo){
    const patch = { etapa, motivo_perdida: etapa==='perdido' ? motivo : null };
    if(DEMO){ Object.assign(lead, patch); return; }
    const { error } = await S.sb.from('mv_leads').update(patch).eq('id', lead.id); if(error) throw error;
  },
  async tareaHecha(t){
    if(DEMO){ t.hecha_at=new Date().toISOString(); return; }
    const { error } = await S.sb.from('mv_tareas').update({ hecha_at: new Date().toISOString() }).eq('id', t.id); if(error) throw error;
  }
};

/* Métricas calculadas en el navegador (mientras no exista mv_metricas en la base) */
function metricasLocal(){
  const desde = Date.now() - S.dias*86400000;
  const l = S.leads.filter(x => new Date(x.created_at).getTime() > desde);
  const abiertos = x => !['vendido','perdido'].includes(x.etapa);
  const resp = l.map(x => x.primera_respuesta_seg ?? (x.primer_contacto_at ? (new Date(x.primer_contacto_at)-new Date(x.created_at))/1000 : null)).filter(v => v!=null && v>=0).sort((a,b)=>a-b);
  const med = resp.length ? (resp.length%2 ? resp[(resp.length-1)/2] : (resp[resp.length/2-1]+resp[resp.length/2])/2) : null;
  const cnt = (arr, f) => arr.reduce((o,x)=>{ const k=f(x); o[k]=(o[k]||0)+1; return o; },{});
  return {
    dias:S.dias, leads:l.length,
    por_etapa: cnt(l, x=>x.etapa),
    por_ruta: cnt(l, x=>x.ruta || 'sin_leer'),
    contactados: l.filter(x=>x.primer_contacto_at).length,
    sin_contactar: l.filter(x=>!x.primer_contacto_at && abiertos(x)).length,
    pct_contacto_15min: l.length ? Math.round(1000*resp.filter(v=>v<=900).length/l.length)/10 : null,
    mediana_primera_respuesta_min: med!=null ? Math.round(med/6)/10 : null,
    esperando_respuesta: l.filter(esperando).length,
    calientes: l.filter(x=>x.calor>=65 && abiertos(x)).length,
    sin_presion: l.filter(x=>x.ruta==='sin_presion').length,
    pruebas: l.filter(x=>x.etapa==='prueba' || x.prueba).length,
    vendidos: l.filter(x=>x.etapa==='vendido').length,
    tareas_vencidas: S.tareas.filter(t=>t.vence_at && new Date(t.vence_at) < new Date()).length,
    motivos_perdida: cnt(l.filter(x=>x.etapa==='perdido'), x=>x.motivo_perdida || 'sin motivo')
  };
}

/* ===================== Render ===================== */
function renderBanners(){
  const b = [];
  if(DEMO) b.push('<div class="banner demo">Modo demostración con datos ficticios. Nada de lo que hagas aquí se guarda.</div>');
  if(S.tieneLectura === false) b.push('<div class="banner">La lectura del cliente (calor, ruta y guía) todavía no está activa en la base. El panel ya está listo para mostrarla en cuanto se aplique la migración; mientras tanto ves etapas, tiempos y la línea de tiempo.</div>');
  $('#banners').innerHTML = b.join('');
}
function kpi(v, l, cls=''){ return `<div class="kpi ${cls}"><div class="v">${v ?? '—'}</div><div class="l">${l}</div></div>`; }
function bars(el, obj, labels={}){
  const ent = Object.entries(obj||{}).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
  if(!ent.length){ el.innerHTML = '<div class="empty">Sin datos en el periodo.</div>'; return; }
  const max = Math.max(...ent.map(e=>e[1]));
  el.innerHTML = ent.map(([k,n]) => `<div class="bar"><span>${esc(labels[k]||k)}</span><div class="track"><div class="fill" style="width:${(100*n/max).toFixed(0)}%"></div></div><b style="text-align:right">${n}</b></div>`).join('');
}
function renderMetricas(){
  const m = S.metricas || {};
  $('#metSrc').textContent = `· últimos ${S.dias} días · ${S.metSrc}`;
  const pct = m.pct_contacto_15min;
  $('#kpis').innerHTML = [
    kpi(m.leads, 'Leads del periodo'),
    kpi(m.sin_contactar, 'Sin contactar', m.sin_contactar>0?'alert':''),
    kpi(pct!=null ? pct+'%' : null, 'Contactados en 15 min', pct>=80?'good':(pct!=null&&pct<50?'alert':'')),
    kpi(m.mediana_primera_respuesta_min!=null ? m.mediana_primera_respuesta_min+' min' : null, 'Mediana 1.ª respuesta'),
    kpi(m.esperando_respuesta, 'Esperando respuesta', m.esperando_respuesta>0?'alert':''),
    kpi(S.tieneLectura===false ? null : m.calientes, 'Calientes (calor ≥ 65)'),
    kpi(S.tieneLectura===false ? null : m.sin_presion, 'Seguimiento sin presión'),
    kpi(m.pruebas, 'Pruebas de manejo'),
    kpi(m.vendidos, 'Vendidos', m.vendidos>0?'good':''),
    kpi(m.tareas_vencidas, 'Tareas vencidas', m.tareas_vencidas>0?'alert':'')
  ].join('');
  bars($('#barRuta'), m.por_ruta, RUTA_TXT);
  bars($('#barEtapa'), m.por_etapa, ETAPA_TXT);
  bars($('#barPerdida'), m.motivos_perdida);
}
function nombreAsesor(id){ return S.asesores.find(a=>a.id===id)?.nombre || ''; }
function cardHTML(l){
  const ruta = l.ruta || (S.tieneLectura ? 'sin_leer' : null);
  const tareasL = S.tareas.filter(t=>t.lead_id===l.id);
  const vencidas = tareasL.filter(t=>t.vence_at && new Date(t.vence_at)<new Date()).length;
  const guia1 = (l.guia||'').split('\n').find(x=>x.trim()) || '';
  return `<div class="card" data-id="${l.id}">
    <div class="t"><div><div class="n">${esc(l.nombre||'Sin nombre')}</div><div class="s">${esc(l.folio||'')} · ${esc([l.modelo,l.version].filter(Boolean).join(' ')||'—')}</div></div>
      ${l.calor!=null ? `<span class="calor tag ${calorCls(l.calor)}" title="Calor">${l.calor}</span>` : ''}</div>
    ${guia1 ? `<div class="g">${esc(guia1)}</div>` : ''}
    <div class="m">
      ${ruta ? `<span class="tag ${RUTA_CLS[ruta]||''}">${RUTA_TXT[ruta]||ruta}</span>` : ''}
      ${esperando(l) ? `<span class="tag bad">Espera respuesta · ${hace(l.ultimo_msg_cliente_at)}</span>` : ''}
      ${!l.primer_contacto_at ? `<span class="tag bad">Sin contactar · ${hace(l.created_at)}</span>` : `<span class="tag">Último toque ${hace(l.ultimo_contacto_at||l.primer_contacto_at)}</span>`}
      ${vencidas ? `<span class="tag warm">${vencidas} tarea${vencidas>1?'s':''} vencida${vencidas>1?'s':''}</span>` : ''}
      ${S.admin && !S.asesorSel ? `<span class="tag acc">${esc(nombreAsesor(l.asesor_id))}</span>` : ''}
    </div></div>`;
}
function filtrados(){
  const q = S.q.trim().toLowerCase();
  return S.leads.filter(l =>
    (!S.filtroRuta || (l.ruta||'sin_leer')===S.filtroRuta) &&
    (!S.espera || esperando(l)) &&
    (!q || [l.nombre,l.folio,l.modelo,l.version,l.whatsapp].some(v => String(v||'').toLowerCase().includes(q))));
}
function ordenCartera(a,b){
  // primero los que esperan respuesta, luego sin contactar, luego por calor
  const ea = esperando(a)?1:0, eb = esperando(b)?1:0; if(ea!==eb) return eb-ea;
  const sa = a.primer_contacto_at?0:1, sb = b.primer_contacto_at?0:1; if(sa!==sb) return sb-sa;
  return (b.calor??-1)-(a.calor??-1) || new Date(b.created_at)-new Date(a.created_at);
}
function renderCartera(){
  const rutas = ['cierre','avance','sin_presion','pausa'];
  $('#rutaChips').innerHTML = S.tieneLectura===false ? '' :
    ['', ...rutas].map(r => `<button class="chipf ${S.filtroRuta===r?'on':''}" data-ruta="${r}">${r?RUTA_TXT[r]:'Todas las rutas'}</button>`).join(' ');
  $('#chipEspera').classList.toggle('on', S.espera);
  const L = filtrados();
  const act = L.filter(l => ETAPAS_ACTIVAS.includes(l.etapa));
  $('#carteraCount').textContent = `· ${act.length} en curso`;
  $('#board').innerHTML = ETAPAS_ACTIVAS.map(et => {
    const xs = act.filter(l=>l.etapa===et).sort(ordenCartera);
    return `<div class="col"><h4><span>${ETAPA_TXT[et]}</span><span>${xs.length}</span></h4>${xs.map(cardHTML).join('') || '<div class="empty">—</div>'}</div>`;
  }).join('');
  const lista = (xs, extra) => xs.length ? xs.slice(0,30).map(l => `<div class="row-lead" data-id="${l.id}"><span>${esc(l.nombre||'Sin nombre')} <span class="tag">${esc(l.modelo||'')}</span></span><span class="who">${extra(l)}</span></div>`).join('') : '<div class="empty">Ninguno.</div>';
  const vend = L.filter(l=>l.etapa==='vendido'), perd = L.filter(l=>l.etapa==='perdido');
  $('#nVend').textContent = `(${vend.length})`; $('#nPerd').textContent = `(${perd.length})`;
  $('#listVend').innerHTML = lista(vend, l=>fmtFecha(l.etapa_cambio_at||l.updated_at));
  $('#listPerd').innerHTML = lista(perd, l=>esc(l.motivo_perdida||'sin motivo'));
}

/* ===================== Detalle del lead ===================== */
function pmanHTML(l){
  const s = l.senales || {};
  const item = (letra, nombre, valor) => `<div class="${valor?'':'falta'}"><b>${letra} · ${nombre}</b>${valor ? esc(valor) : 'Falta calificar'}</div>`;
  const autoridad = s.decide_otro ? 'Decide con otra persona' : (s.autoridad || null);
  return `<div class="pman">
    ${item('P','Presupuesto', l.pago || (s.financiamiento?'Pregunta por financiamiento':null))}
    ${item('A','Autoridad', autoridad)}
    ${item('N','Necesidad', [l.modelo,l.version,l.color].filter(Boolean).join(' · ') || null)}
    ${item('M','Momento', l.cuando || (s.pospone?'Pospone':null))}
  </div>`;
}
function timelineItems(det){
  const it = [];
  det.mensajes.forEach(m => {
    const bot = m.origen==='bot';
    it.push({ at:m.enviado_at, cls: m.direccion==='entrante'?'in':(bot?'sys':'out'),
      t: m.direccion==='entrante' ? 'Cliente escribió' : (bot ? 'Mensaje automático' : 'Asesor respondió'), body: m.cuerpo || `[${m.tipo||'mensaje'}]` });
  });
  det.eventos.forEach(e => {
    const d = e.datos || {}; let body = '';
    if(e.tipo==='etapa') body = [d.de||d.anterior, d.a||d.nueva||d.etapa].filter(Boolean).map(x=>ETAPA_TXT[x]||x).join(' → ');
    else if(e.tipo==='ruta') body = [d.de, d.a||d.ruta].filter(Boolean).map(x=>RUTA_TXT[x]||x).join(' → ') + (d.calor!=null?` · calor ${d.calor}`:'');
    else if(e.tipo==='guia') body = d.guia || d.texto || '';
    else if(e.tipo==='nota' || e.tipo==='contacto') body = d.texto || d.nota || '';
    else if(e.tipo==='color' || e.tipo==='modelo_visto') body = d.color || d.modelo || '';
    else if(e.tipo.startsWith('alerta')) body = d.texto ? d.texto.replace(/​/g,'') : '';
    it.push({ at:e.created_at, cls: e.tipo.startsWith('alerta') ? 'alert' : (['ruta','guia','etapa'].includes(e.tipo)?'sys':''), t: EVT_TXT[e.tipo]||e.tipo, body });
  });
  det.tareas.filter(t=>t.hecha_at).forEach(t => it.push({ at:t.hecha_at, cls:'out', t:'Tarea hecha', body:t.titulo||t.tipo }));
  return it.filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at));
}
async function abrirLead(id){
  const l = S.leads.find(x=>x.id===id); if(!l) return;
  const root = $('#drawerRoot');
  root.innerHTML = `<div class="scrim"></div><aside class="drawer" role="dialog" aria-label="Detalle del lead"><div class="bd"><div class="empty">Cargando…</div></div></aside>`;
  root.querySelector('.scrim').onclick = cerrarLead;
  let det; try { det = await API.detalle(l); } catch(e){ det = {eventos:[],mensajes:[],tareas:[]}; toast('No se pudo cargar el historial'); }
  const abiertas = det.tareas.filter(t=>!t.hecha_at && !t.cancelada_at).sort((a,b)=>new Date(a.vence_at)-new Date(b.vence_at));
  const tl = timelineItems(det);
  const wa = (l.whatsapp||'').replace(/\D/g,'');
  const ruta = l.ruta || (S.tieneLectura ? 'sin_leer' : null);
  root.querySelector('.drawer').innerHTML = `
    <div class="hd">
      <div><div class="n" style="font-weight:700;font-size:16px">${esc(l.nombre||'Sin nombre')}</div>
      <div class="who" style="display:block">${esc(l.folio||'')} · ${ETAPA_TXT[l.etapa]||l.etapa}${S.admin?` · ${esc(nombreAsesor(l.asesor_id))}`:''}</div>
      <div class="m" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        ${l.calor!=null?`<span class="tag ${calorCls(l.calor)}">Calor ${l.calor}</span>`:''}
        ${ruta?`<span class="tag ${RUTA_CLS[ruta]||''}">${RUTA_TXT[ruta]}</span>`:''}
        ${esperando(l)?`<span class="tag bad">Espera respuesta · ${hace(l.ultimo_msg_cliente_at)}</span>`:''}
        ${l.opt_out?'<span class="tag bad">Pidió no ser contactado</span>':''}
      </div></div>
      <button class="btn sm x" id="dClose" aria-label="Cerrar">✕</button>
    </div>
    <div class="bd">
      <h3 style="margin-top:0">Guía · siguiente mejor acción</h3>
      ${l.guia ? `<div class="guia">${esc(l.guia)}</div><div class="when who" style="display:block;margin-top:4px;font-size:11px">Actualizada ${fmtFecha(l.guia_at)}</div>`
               : `<div class="empty">${S.tieneLectura===false ? 'La guía aparecerá cuando se active la lectura del cliente.' : 'Aún sin guía: el sistema la genera cuando el cliente escribe.'}</div>`}
      ${l.reactivar_at ? `<div class="msg">Seguimiento sin presión: se reactiva el ${fmtFecha(l.reactivar_at)}.</div>` : ''}

      <h3>PMAN</h3>${pmanHTML(l)}

      ${S.rol==='negocio' ? '' : `<h3>Acciones</h3>
      <div class="actions">
        ${wa ? `<a class="btn sm primary" href="https://wa.me/${wa}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''}
        <button class="btn sm" id="aContacto">Registrar contacto</button>
        <button class="btn sm" id="aNota">Agregar nota</button>
        <select class="i" id="aEtapa" style="width:auto;padding:6px 10px">
          ${Object.keys(ETAPA_TXT).map(e=>`<option value="${e}" ${e===l.etapa?'selected':''}>${ETAPA_TXT[e]}</option>`).join('')}
        </select>
      </div>
      <div id="aForm"></div>`}

      <h3>Tareas abiertas</h3>
      ${abiertas.length ? abiertas.map(t => `<div class="task"><span class="grow">${esc(t.titulo||t.tipo)}<br><span class="who" style="display:inline">${new Date(t.vence_at)<new Date()?'<b style="color:var(--bad)">Vencida</b> · ':''}vence ${fmtFecha(t.vence_at)}</span></span><button class="btn sm" data-tarea="${t.id}">Hecha</button></div>`).join('') : '<div class="empty">Sin tareas abiertas.</div>'}

      <h3>Datos</h3>
      <div class="grid2">
        <div><div class="k">WhatsApp</div>${esc(l.whatsapp||'—')}</div>
        <div><div class="k">Origen</div>${esc(l.red||'—')}${l.usuario_red?` · ${esc(l.usuario_red)}`:''}</div>
        <div><div class="k">Entró</div>${fmtFecha(l.created_at)}</div>
        <div><div class="k">Primer contacto</div>${l.primer_contacto_at ? `${fmtFecha(l.primer_contacto_at)} <span class="who" style="display:inline">(${tiempoResp(l)})</span>` : '<b style="color:var(--bad)">Pendiente</b>'}</div>
        <div><div class="k">Último toque del asesor</div>${fmtFecha(l.ultimo_contacto_at)}</div>
        <div><div class="k">Último mensaje del cliente</div>${fmtFecha(l.ultimo_msg_cliente_at)}</div>
        <div><div class="k">Pidió prueba</div>${l.prueba?'Sí':'No'}${l.fecha_prueba?` · ${fmtFecha(l.fecha_prueba)}`:''}</div>
        <div><div class="k">Valor</div>${l.valor?Number(l.valor).toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}):'—'}</div>
      </div>

      <h3>Línea de tiempo · tratamiento del cliente</h3>
      ${tl.length ? `<ul class="tl">${tl.map(x=>`<li class="${x.cls}"><div><b>${esc(x.t)}</b> <span class="when">${fmtFecha(x.at)}</span></div>${x.body?`<div class="body">${esc(x.body)}</div>`:''}</li>`).join('')}</ul>` : '<div class="empty">Sin actividad registrada.</div>'}
    </div>`;
  $('#dClose').onclick = cerrarLead;
  if(S.rol==='negocio'){ return; }
  $('#aContacto').onclick = () => formTexto('Nota del contacto (opcional)', async txt => { await API.registrarContacto(l, txt); });
  $('#aNota').onclick = () => formTexto('Nota', async txt => { if(!txt) throw new Error('Escribe la nota'); await API.nota(l, txt); });
  $('#aEtapa').onchange = e => {
    const v = e.target.value;
    if(v==='perdido'){
      $('#aForm').innerHTML = `<label class="f">Motivo de pérdida</label><select class="i" id="fMot">${MOTIVOS.map(m=>`<option>${m}</option>`).join('')}</select>
        <div class="msg">¿Seguro? Un lead que no contesta normalmente va a seguimiento sin presión, no a perdido.</div>
        <div class="actions" style="margin-top:8px"><button class="btn sm primary" id="fOk">Marcar perdido</button><button class="btn sm" id="fNo">Cancelar</button></div>`;
      $('#fNo').onclick = () => { $('#aForm').innerHTML=''; e.target.value=l.etapa; };
      $('#fOk').onclick = () => accion(async () => API.etapa(l, 'perdido', $('#fMot').value), 'Etapa actualizada');
    } else accion(async () => API.etapa(l, v), 'Etapa actualizada');
  };
  root.querySelectorAll('[data-tarea]').forEach(b => b.onclick = () => accion(async () => API.tareaHecha(det.tareas.find(t=>t.id===b.dataset.tarea)), 'Tarea marcada'));
  async function accion(fn, ok){ try{ await fn(); toast(ok); await cargar(); abrirLead(l.id); } catch(err){ toast('Error: '+(err.message||err)); } }
  function formTexto(lbl, fn){
    $('#aForm').innerHTML = `<label class="f">${lbl}</label><textarea class="i" id="fTxt" rows="3"></textarea>
      <div class="actions" style="margin-top:8px"><button class="btn sm primary" id="fOk">Guardar</button><button class="btn sm" id="fNo">Cancelar</button></div>`;
    $('#fTxt').focus();
    $('#fNo').onclick = () => $('#aForm').innerHTML='';
    $('#fOk').onclick = () => accion(() => fn($('#fTxt').value.trim()), 'Guardado');
  }
}
function tiempoResp(l){
  const s = l.primera_respuesta_seg ?? (new Date(l.primer_contacto_at)-new Date(l.created_at))/1000;
  if(s < 3600) return Math.round(s/60)+' min'; if(s < 86400) return (s/3600).toFixed(1)+' h'; return (s/86400).toFixed(1)+' d';
}
function cerrarLead(){ $('#drawerRoot').innerHTML=''; }

/* ===================== Flujo ===================== */
async function cargar(){
  const [leads, tareas, met, ev] = await Promise.all([API.leads(), API.tareasAbiertas(), API.metricas(), S.rol==='admin' ? API.eventosPeriodo() : Promise.resolve([])]);
  S.leads = leads; S.tareas = tareas; S.eventos = ev;
  if(leads.length) S.tieneLectura = 'calor' in leads[0] || 'ruta' in leads[0];
  else if(S.tieneLectura===null) S.tieneLectura = !!met;
  S.metricas = met || metricasLocal();
  S.metSrc = met ? 'calculadas en la base' : 'calculadas en el panel';
  renderBanners(); renderVista();
}
function showLogin(){ $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
async function boot(){
  try{
    await API.perfil();
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    if(!S.rol){
      $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
      $('#banners').innerHTML = '<div class="banner">Tu usuario todavía no tiene acceso. Pide al administrador que te dé de alta.</div>';
      return;
    }
    $('#who').textContent = (S.asesores.find(x=>x.user_id===S.user.id)?.nombre || (S.user.email||'').replace(/@pin\.motor-ventas\.example$/,'')) + ' · ' + ({admin:'administrador',negocio:'negocio',asesor:'asesor'}[S.rol]);
    try{ S.vista = localStorage.getItem('mv_vista') || ''; }catch(_){}
    const sel = $('#selAsesor');
    if(S.admin || S.asesores.length > 1){
      sel.innerHTML = `<option value="">Todos los asesores</option>` + S.asesores.map(a=>`<option value="${a.id}">${esc(a.nombre)}${a.agencia?` · ${esc(a.agencia)}`:''}</option>`).join('');
    } else { sel.classList.add('hidden'); S.asesorSel = S.asesores[0]?.id || ''; }
    await cargar();
  }catch(err){ console.error(err); toast('Error al cargar: '+(err.message||err)); }
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const email = $('#email').value.trim(), pwd = $('#pwd').value, magic = $('#pwdWrap').classList.contains('hidden');
  const msg = $('#loginMsg'); msg.className='msg'; msg.textContent='Un momento…';
  try{
    if(magic){
      const { error } = await S.sb.auth.signInWithOtp({ email, options:{ shouldCreateUser:false, emailRedirectTo: location.origin + location.pathname } });
      if(error) throw error; msg.textContent = 'Listo. Revisa tu correo y abre el enlace.';
    } else {
      const { data, error } = await S.sb.auth.signInWithPassword({ email, password: pwd });
      if(error) throw error; S.user = data.user; msg.textContent=''; boot();
    }
  }catch(err){ msg.className='msg err'; msg.textContent = /Invalid login/i.test(err.message) ? 'Correo o contraseña incorrectos.' : err.message; }
};
/* Acceso temporal por usuario + PIN: lo valida la función mv-pin-login en el servidor */
$('#pinForm').onsubmit = async e => {
  e.preventDefault();
  const msg = $('#loginMsg'); msg.className='msg'; msg.textContent='Un momento…';
  $('#pinBtn').disabled = true;
  try{
    const r = await fetch(CFG.url + '/functions/v1/mv-pin-login', { method:'POST', headers:{ 'Content-Type':'application/json', apikey: CFG.key },
      body: JSON.stringify({ usuario: $('#pinUsuario').value.trim().toLowerCase(), pin: $('#pinCodigo').value.trim() }) });
    const d = await r.json().catch(()=>({}));
    if(!r.ok || !d.access_token) throw new Error(d.error || 'No se pudo entrar.');
    $('#pinCodigo').value = '';
    const { data, error } = await S.sb.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token });
    if(error) throw error;
    msg.textContent='';
    if(!S.user){ S.user = data.user; boot(); }
  }catch(err){ msg.className='msg err'; msg.textContent = err.message; }
  finally{ $('#pinBtn').disabled = false; }
};
$('#toggleCorreo').onclick = () => {
  const w = $('#correoWrap'); w.classList.toggle('hidden');
  $('#pinForm').classList.toggle('hidden', !w.classList.contains('hidden'));
  $('#toggleCorreo').textContent = w.classList.contains('hidden') ? 'Entrar con correo' : 'Entrar con usuario y PIN';
};
$('#toggleMagic').onclick = () => {
  const w = $('#pwdWrap'); w.classList.toggle('hidden');
  const magic = w.classList.contains('hidden');
  $('#pwd').required = !magic;
  $('#loginBtn').textContent = magic ? 'Enviarme el enlace' : 'Entrar';
  $('#toggleMagic').textContent = magic ? 'Prefiero usar contraseña' : 'Prefiero recibir un enlace por correo';
};
$('#btnLogout').onclick = async () => { if(DEMO){ location.search=''; return; } await S.sb.auth.signOut(); };
$('#btnRefresh').onclick = () => cargar().then(()=>toast('Actualizado'));
$('#selAsesor').onchange = e => { S.asesorSel = e.target.value; cargar(); };
$('#selDias').onchange = e => { S.dias = +e.target.value; cargar(); };
$('#q').oninput = e => { S.q = e.target.value; renderCartera(); };
$('#chipEspera').onclick = () => { S.espera = !S.espera; renderCartera(); };
$('#rutaChips').onclick = e => { const b = e.target.closest('[data-ruta]'); if(!b) return; S.filtroRuta = b.dataset.ruta; renderCartera(); };
document.addEventListener('click', e => { const c = e.target.closest('.card,.row-lead'); if(c) abrirLead(c.dataset.id); });
document.addEventListener('keydown', e => { if(e.key==='Escape') cerrarLead(); });
/* Cierre de sesión por inactividad (datos personales en pantalla) */
const INACTIVIDAD_MIN = 30;
let ultimaActividad = Date.now();
['click','keydown','touchstart','scroll'].forEach(ev => addEventListener(ev, () => { ultimaActividad = Date.now(); }, {passive:true}));
setInterval(async () => {
  if(!DEMO && S.user && Date.now() - ultimaActividad > INACTIVIDAD_MIN*60000){
    await S.sb.auth.signOut(); cerrarLead(); $('#loginMsg').className='msg'; $('#loginMsg').textContent='Cerramos tu sesión por inactividad.';
  }
}, 60000);
setInterval(() => { if(S.user && !document.hidden && !$('#drawerRoot').innerHTML) cargar().catch(()=>{}); }, 120000);

/* ===================== Datos de demostración ===================== */
const DEMO_DATA = (() => {
  const H = h => new Date(Date.now() - h*3600000).toISOString();
  const A1='a1', A2='a2';
  const asesores = [{id:A1,nombre:'Asesora Norte',agencia:'Agencia A'},{id:A2,nombre:'Asesora Centro',agencia:'Agencia B'}];
  const L = (o) => Object.assign({ senales:{}, prueba:false, whatsapp:'5215500000000', red:'landing', created_at:H(48) }, o);
  const leads = [
    L({id:'l1',folio:'DM-0101',asesor_id:A1,nombre:'Carla M.',modelo:'Hatchback eléctrico',etapa:'nuevo',calor:70,ruta:'cierre',created_at:H(0.4),ultimo_msg_cliente_at:H(0.3),cuando:'esta semana',pago:'crédito',prueba:true,
       guia:'▶ Llámale ahora y agenda la prueba de manejo para esta semana.\n• Lectura: quiere probar el auto y pagar a crédito.\n• Falta calificar: Autoridad.',guia_at:H(0.3),senales:{visita:true,financiamiento:true}}),
    L({id:'l2',folio:'DM-0102',asesor_id:A1,nombre:'Jorge R.',modelo:'SUV compacta',etapa:'contactado',calor:52,ruta:'avance',created_at:H(30),primer_contacto_at:H(29.8),ultimo_contacto_at:H(20),ultimo_msg_cliente_at:H(2),primera_respuesta_seg:720,cuando:'este mes',
       guia:'▶ Responde su pregunta de precio y ofrece dos versiones.\n• Lectura: pregunta precio y enganche.\n• Falta calificar: Presupuesto, Autoridad.',guia_at:H(2),senales:{precio:true}}),
    L({id:'l3',folio:'DM-0103',asesor_id:A2,nombre:'Lucía T.',modelo:'Sedán',etapa:'prueba',calor:81,ruta:'cierre',created_at:H(90),primer_contacto_at:H(89.9),ultimo_contacto_at:H(5),ultimo_msg_cliente_at:H(6),primera_respuesta_seg:300,pago:'contado',cuando:'ya',fecha_prueba:H(-20),
       guia:'▶ Confirma la cita de prueba de mañana y lleva la cotización impresa.\n• Lectura: paga de contado y quiere cerrar ya.',guia_at:H(6),senales:{compra:true}}),
    L({id:'l4',folio:'DM-0104',asesor_id:A2,nombre:'Mario P.',modelo:'Pickup',etapa:'contactado',calor:22,ruta:'sin_presion',created_at:H(400),primer_contacto_at:H(398),ultimo_contacto_at:H(250),ultimo_msg_cliente_at:H(380),primera_respuesta_seg:7200,reactivar_at:H(-150),
       guia:'▶ Sin presión: mándale un contenido de valor el día de reactivación.\n• Lectura: dijo que lo va a pensar; pospone.\n• Falta calificar: Presupuesto, Momento.',guia_at:H(250),senales:{pospone:true,lo_pienso:true}}),
    L({id:'l5',folio:'DM-0105',asesor_id:A1,nombre:'Ana G.',modelo:'Hatchback eléctrico',etapa:'cotizacion',calor:64,ruta:'avance',created_at:H(120),primer_contacto_at:H(119.7),ultimo_contacto_at:H(30),ultimo_msg_cliente_at:H(31),primera_respuesta_seg:1080,pago:'crédito',senales:{decide_otro:true,financiamiento:true},
       guia:'▶ Pregúntale cuándo puede venir con su pareja a ver la cotización.\n• Lectura: decide con otra persona.',guia_at:H(31)}),
    L({id:'l6',folio:'DM-0106',asesor_id:A2,nombre:'Pedro V.',modelo:'SUV mediana',etapa:'apartado',calor:88,ruta:'cierre',created_at:H(200),primer_contacto_at:H(199.9),ultimo_contacto_at:H(10),ultimo_msg_cliente_at:H(12),primera_respuesta_seg:240,pago:'contado',cuando:'ya',valor:689000,
       guia:'▶ Agenda la entrega y confirma documentos.',guia_at:H(12)}),
    L({id:'l7',folio:'DM-0107',asesor_id:A1,nombre:'Sofía L.',modelo:'Sedán',etapa:'vendido',calor:90,ruta:'cierre',created_at:H(500),primer_contacto_at:H(499.8),ultimo_contacto_at:H(100),etapa_cambio_at:H(100),primera_respuesta_seg:600,valor:452000}),
    L({id:'l8',folio:'DM-0108',asesor_id:A2,nombre:'Raúl D.',modelo:'Pickup',etapa:'perdido',motivo_perdida:'compró otra marca',calor:10,ruta:'pausa',created_at:H(600),primer_contacto_at:H(590),ultimo_contacto_at:H(300),primera_respuesta_seg:36000}),
    L({id:'l9',folio:'DM-0109',asesor_id:A2,nombre:'Elena F.',modelo:'SUV compacta',etapa:'nuevo',calor:35,ruta:'avance',created_at:H(1.5),
       guia:'▶ Primer contacto: preséntate y pregunta qué uso le dará al auto.\n• Falta calificar: Presupuesto, Autoridad, Momento.',guia_at:H(1.5)})
  ];
  const tareas = [
    {id:'t1',lead_id:'l1',asesor_id:A1,tipo:'primer_contacto',titulo:'Primer contacto con Carla',vence_at:H(0.15)},
    {id:'t2',lead_id:'l2',asesor_id:A1,tipo:'seguimiento',titulo:'Enviar precio y versiones',vence_at:H(-3)},
    {id:'t3',lead_id:'l9',asesor_id:A2,tipo:'primer_contacto',titulo:'Primer contacto con Elena',vence_at:H(1.25)},
    {id:'t4',lead_id:'l4',asesor_id:A2,tipo:'toque_valor',titulo:'Toque de valor (sin presión)',vence_at:H(-150)},
    {id:'t5',lead_id:'l5',asesor_id:A1,tipo:'seguimiento',titulo:'Seguimiento de cotización',vence_at:H(6)}
  ];
  const eventos = [
    {id:1,lead_id:'l1',tipo:'landing_visita',datos:{},created_at:H(0.6)},
    {id:2,lead_id:'l1',tipo:'color',datos:{color:'Azul'},created_at:H(0.55)},
    {id:3,lead_id:'l1',tipo:'formulario',datos:{},created_at:H(0.4)},
    {id:4,lead_id:'l1',tipo:'ruta',datos:{de:null,a:'cierre',calor:70},created_at:H(0.3)},
    {id:5,lead_id:'l1',tipo:'alerta_sla15',datos:{texto:'Carla lleva 15 min sin primer contacto.'},created_at:H(0.15)},
    {id:6,lead_id:'l2',tipo:'etapa',datos:{de:'nuevo',a:'contactado'},created_at:H(29.8)},
    {id:7,lead_id:'l2',tipo:'ruta',datos:{de:'cierre',a:'avance',calor:52},created_at:H(2)},
    {id:8,lead_id:'l4',tipo:'ruta',datos:{de:'avance',a:'sin_presion',calor:22},created_at:H(250)}
  ];
  const mensajes = [
    {id:'m1',lead_id:'l1',direccion:'saliente',origen:'bot',cuerpo:'¡Gracias, Carla! Tu asesora te escribe en unos minutos.',enviado_at:H(0.39)},
    {id:'m2',lead_id:'l1',direccion:'entrante',origen:'letsbot',cuerpo:'Hola, ¿puedo hacer la prueba de manejo esta semana? Lo quiero a crédito.',enviado_at:H(0.3)},
    {id:'m3',lead_id:'l2',direccion:'saliente',origen:'letsbot',cuerpo:'Hola Jorge, soy tu asesora. ¿Qué versión te interesa?',enviado_at:H(29.8)},
    {id:'m4',lead_id:'l2',direccion:'entrante',origen:'letsbot',cuerpo:'¿Cuánto queda con enganche del 20%?',enviado_at:H(2)},
    {id:'m5',lead_id:'l4',direccion:'entrante',origen:'letsbot',cuerpo:'Gracias, lo voy a pensar y te aviso el próximo mes.',enviado_at:H(380)}
  ];
  return { asesores, leads, tareas, eventos, mensajes };
})();

(async () => {
  try{
    const logged = await API.init();
    if(logged) boot(); else showLogin();
  }catch(err){ showLogin(); $('#loginMsg').className='msg err'; $('#loginMsg').textContent = err.message; }
})();
