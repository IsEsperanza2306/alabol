/* Vistas por rol: Administrador (control del motor) y Negocio (resumen para decidir).
   El rol lo decide la base (mv_mi_rol / RLS); aquí solo se elige qué mostrar. */

const META_15MIN = 80;   // % de leads atendidos en 15 min
const ALERTA_TXT = { alerta_sla15:'Sin primer contacto a 15 min', alerta_sla60:'Sin primer contacto a 60 min (gerente)', alerta_espera:'Cliente esperando respuesta', alerta_sin_toque:'Lead sin toque' };

function enPeriodo(arr, campo='created_at'){ const d = Date.now() - S.dias*86400000; return arr.filter(x => x[campo] && new Date(x[campo]).getTime() > d); }
function segResp(l){ return l.primera_respuesta_seg ?? (l.primer_contacto_at ? (new Date(l.primer_contacto_at)-new Date(l.created_at))/1000 : null); }
function mediana(xs){ if(!xs.length) return null; const s=[...xs].sort((a,b)=>a-b), m=s.length>>1; return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
const pct = (a,b) => b ? Math.round(1000*a/b)/10 : null;
const fmtMin = s => s==null ? '—' : (s<3600 ? Math.round(s/60)+' min' : s<86400 ? (s/3600).toFixed(1)+' h' : (s/86400).toFixed(1)+' d');
const abierto = l => !['vendido','perdido'].includes(l.etapa);
const llegoAPrueba = l => l.prueba || ['prueba','cotizacion','apartado','vendido'].includes(l.etapa);
const sinToque = (l, horas) => abierto(l) && l.primer_contacto_at && (Date.now() - new Date(l.ultimo_contacto_at || l.primer_contacto_at)) > horas*3600000;

function resumen(leads){
  const resp = leads.map(segResp).filter(v => v!=null && v>=0);
  const n = leads.length;
  return {
    n, contactados: leads.filter(l=>l.primer_contacto_at).length,
    sinContactar: leads.filter(l=>!l.primer_contacto_at && abierto(l)).length,
    pct15: pct(resp.filter(v=>v<=900).length, n),
    medianaSeg: mediana(resp),
    esperando: leads.filter(esperando).length,
    calientes: leads.filter(l=>l.calor>=65 && abierto(l)).length,
    pruebas: leads.filter(llegoAPrueba).length,
    vendidos: leads.filter(l=>l.etapa==='vendido').length,
    perdidos: leads.filter(l=>l.etapa==='perdido').length,
    valor: leads.filter(l=>l.etapa==='vendido').reduce((s,l)=>s+(+l.valor||0),0)
  };
}
function porAsesor(leads){
  const ids = [...new Set([...S.asesores.map(a=>a.id), ...leads.map(l=>l.asesor_id)])];
  return ids.map(id => {
    const L = leads.filter(l=>l.asesor_id===id);
    const r = resumen(L);
    r.id = id; r.nombre = nombreAsesor(id) || 'Sin asesor'; r.agencia = S.asesores.find(a=>a.id===id)?.agencia || '';
    r.vencidas = S.tareas.filter(t=>t.asesor_id===id && t.vence_at && new Date(t.vence_at)<new Date()).length;
    r.semaforo = !r.n ? '' : (r.sinContactar>0 || (r.pct15!=null && r.pct15<50) || r.esperando>1) ? 'bad' : (r.pct15!=null && r.pct15<META_15MIN) || r.vencidas>0 ? 'warm' : 'ok';
    return r;
  }).filter(r => r.n || S.rol==='admin');
}
function contar(arr, f){ return arr.reduce((o,x)=>{ const k=f(x); if(k) o[k]=(o[k]||0)+1; return o; },{}); }
function semanas(leads, n=8){
  const out = []; const ahora = Date.now();
  for(let i=n-1;i>=0;i--){
    const fin = ahora - i*7*86400000, ini = fin - 7*86400000;
    const L = leads.filter(l=>{ const t=new Date(l.created_at).getTime(); return t>ini && t<=fin; });
    out.push({ et: new Date(ini).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}), leads:L.length, vend: L.filter(l=>l.etapa==='vendido').length });
  }
  return out;
}
function embudo(eventos, leads){
  const ses = tipos => { const xs = eventos.filter(e=>tipos.includes(e.tipo)); const s = new Set(xs.map(e=>e.sesion).filter(Boolean)); return s.size || xs.length; };
  return [
    ['Visitas a la landing', ses(['landing_visita'])],
    ['Vieron un modelo', ses(['modelo_visto','color'])],
    ['Clic en WhatsApp o cotizar', ses(['whatsapp_click','cotizar_click'])],
    ['Leads registrados', leads.length],
    ['Contactados', leads.filter(l=>l.primer_contacto_at).length],
    ['Llegaron a prueba de manejo', leads.filter(llegoAPrueba).length],
    ['Vendidos', leads.filter(l=>l.etapa==='vendido').length]
  ];
}

/* ---------- Decisiones sugeridas (reglas simples y explicables) ---------- */
function decisiones(leads, eventos, equipo){
  const d = []; const r = resumen(leads);
  const sinC = leads.filter(l=>!l.primer_contacto_at && abierto(l)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  if(sinC.length) d.push(['bad', `${sinC.length} lead${sinC.length>1?'s':''} sin primer contacto. El más antiguo lleva ${hace(sinC[0].created_at)}.`, 'Llamar hoy. Cada hora sin contacto baja la probabilidad de venta.']);
  if(r.esperando) d.push(['bad', r.esperando>1 ? `${r.esperando} clientes escribieron y esperan respuesta.` : '1 cliente escribió y espera respuesta.', 'Responder antes de cualquier otra tarea.']);
  if(r.pct15!=null && r.pct15 < META_15MIN){
    const peor = equipo.filter(a=>a.n>=2 && a.pct15!=null).sort((a,b)=>a.pct15-b.pct15)[0];
    d.push(['warm', `Solo ${r.pct15}% se atendió en 15 min (meta ${META_15MIN}%).${peor?` Más bajo: ${peor.nombre} (${peor.pct15}%).`:''}`, 'Revisar que los avisos de lead nuevo lleguen al WhatsApp del asesor y quién cubre fuera de horario.']);
  }
  const cal = leads.filter(l=>l.calor>=65 && sinToque(l,24));
  if(cal.length) d.push(['warm', `${cal.length} lead${cal.length>1?'s':''} caliente${cal.length>1?'s':''} sin toque en 24 h.`, 'Son los más cercanos a comprar: priorizar cita o prueba de manejo.']);
  const venc = equipo.reduce((s,a)=>s+a.vencidas,0);
  if(venc) d.push(['warm', `${venc} tarea${venc>1?'s':''} de seguimiento vencida${venc>1?'s':''}.`, 'Reprogramar o cerrar; una tarea vencida es un cliente que se enfría.']);
  const visitas = embudo(eventos, leads)[0][1];
  if(visitas >= 30){
    const c = pct(leads.length, visitas);
    if(c < 3) d.push(['warm', `La landing convierte ${c}% de visitas en lead.`, 'Probar otra oferta o un llamado a la acción más claro (prueba de manejo, precio desde).']);
    else d.push(['ok', `La landing convierte ${c}% de visitas en lead.`, 'Buen nivel: conviene invertir más en el anuncio que más leads trae.']);
  }
  if(r.n >= 5){
    const p = pct(r.pruebas, r.n);
    if(p < 20) d.push(['warm', `Solo ${p}% de los leads llega a prueba de manejo.`, 'Ofrecer la prueba desde el primer mensaje; es el paso que más acerca al cierre.']);
  }
  const sp = leads.filter(l=>l.ruta==='sin_presion').length;
  if(sp && r.n && sp/r.n > .4) d.push(['', `${sp} leads (${pct(sp,r.n)}%) están en seguimiento sin presión.`, 'Revisar calidad de la fuente: muchos prospectos todavía no están listos para comprar.']);
  const origen = Object.entries(contar(leads, l=>l.red)).sort((a,b)=>b[1]-a[1])[0];
  if(origen && r.n >= 5) d.push(['ok', `La fuente principal es ${origen[0]} (${pct(origen[1], r.n)}% de los leads).`, 'Comparar contra su costo para decidir dónde poner el presupuesto.']);
  if(!d.length) d.push(['ok', 'Sin focos rojos en el periodo.', 'Mantener el ritmo de seguimiento.']);
  return d;
}

/* ---------- Componentes ---------- */
function tablaEquipo(equipo, completo){
  if(!equipo.length) return '<div class="empty">Sin asesores con leads en el periodo.</div>';
  const cols = completo
    ? ['Asesor','Leads','Sin contactar','Atendidos 15 min','Mediana 1.ª resp.','Esperando','Tareas vencidas','Calientes','Pruebas','Vendidos','Conversión']
    : ['Asesor','Leads','Atendidos a tiempo','Pruebas','Vendidos'];
  return `<div class="tablewrap"><table class="tbl"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${
    equipo.map(a => `<tr>
      <td><span class="dot ${a.semaforo}"></span>${esc(a.nombre)}${a.agencia?`<div class="who" style="display:block;font-size:11px">${esc(a.agencia)}</div>`:''}</td>
      <td>${a.n}</td>
      ${completo ? `<td class="${a.sinContactar?'neg':''}">${a.sinContactar}</td>` : ''}
      <td class="${a.pct15!=null && a.pct15<META_15MIN?'neg':''}">${a.pct15!=null?a.pct15+'%':'—'}</td>
      ${completo ? `<td>${fmtMin(a.medianaSeg)}</td><td class="${a.esperando?'neg':''}">${a.esperando}</td><td class="${a.vencidas?'neg':''}">${a.vencidas}</td><td>${S.tieneLectura===false?'—':a.calientes}</td>` : ''}
      <td>${a.pruebas}</td><td>${a.vendidos}</td>
      ${completo ? `<td>${a.n?pct(a.vendidos,a.n)+'%':'—'}</td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}
function barrasEmbudo(pasos){
  const max = Math.max(1, ...pasos.map(p=>p[1]));
  return pasos.map(([t,n],i) => {
    const prev = i ? pasos[i-1][1] : null;
    return `<div class="bar funnel"><span>${t}</span><div class="track"><div class="fill" style="width:${(100*n/max).toFixed(1)}%"></div></div><b style="text-align:right">${n}</b><small>${prev? (pct(n,prev)??0)+'%':''}</small></div>`;
  }).join('');
}
function columnasSemana(sem){
  const max = Math.max(1, ...sem.map(s=>s.leads));
  return `<div class="cols">${sem.map(s=>`<div class="colw" title="${s.leads} leads, ${s.vend} vendidos"><div class="colbar"><div class="c1" style="height:${(100*s.leads/max).toFixed(0)}%"></div><div class="c2" style="height:${(100*s.vend/max).toFixed(0)}%"></div></div><small>${s.et}</small></div>`).join('')}</div>
    <div class="legend"><span><i class="c1"></i>Leads</span><span><i class="c2"></i>Vendidos</span></div>`;
}
function listaAtencion(leads, max=6){
  const items = [];
  leads.filter(esperando).forEach(l => items.push([0, l, `Escribió hace ${hace(l.ultimo_msg_cliente_at)} y espera respuesta`]));
  leads.filter(l=>!l.primer_contacto_at && abierto(l)).forEach(l => items.push([1, l, `Sin primer contacto desde hace ${hace(l.created_at)}`]));
  leads.filter(l=>l.calor>=65 && sinToque(l,24) && !esperando(l)).forEach(l => items.push([2, l, `Caliente (${l.calor}) sin toque desde hace ${hace(l.ultimo_contacto_at)}`]));
  const vistos = new Set(); const xs = items.sort((a,b)=>a[0]-b[0]).filter(([,l])=>!vistos.has(l.id) && vistos.add(l.id));
  if(!xs.length) return '<div class="empty">Nada urgente. Todos los clientes están atendidos.</div>';
  return xs.slice(0,max).map(([p,l,t]) => `<div class="row-lead" data-id="${l.id}"><span><span class="dot ${p<2?'bad':'warm'}"></span><b>${esc(l.nombre||'Sin nombre')}</b> · ${esc(l.modelo||'')}<br><span class="who" style="display:inline">${t}</span></span><span class="who" style="display:inline">${esc(nombreAsesor(l.asesor_id))}</span></div>`).join('')
    + (xs.length>max ? `<div class="msg">y ${xs.length-max} más en la cartera.</div>` : '');
}

/* ---------- Vista Administrador ---------- */
function renderAdmin(){
  const L = enPeriodo(S.leads), E = enPeriodo(S.eventos||[]);
  const r = resumen(L), equipo = porAsesor(L);
  const alertas = contar(E.filter(e=>e.tipo.startsWith('alerta_')), e=>ALERTA_TXT[e.tipo]||e.tipo);
  const tracking = contar(E.filter(e=>!e.tipo.startsWith('alerta_') && !['ruta','guia'].includes(e.tipo)), e=>EVT_TXT[e.tipo]||e.tipo);
  const modelos = contar(L, l=>l.modelo), origen = contar(L, l=>l.red || 'sin origen');
  $('#viewAdmin').innerHTML = `
    <h2 class="sec">Decisiones sugeridas <small>· últimos ${S.dias} días</small></h2>
    <div class="panel"><div class="dec">${decisiones(L,E,equipo).map(([c,t,a])=>`<div class="decrow"><span class="dot ${c}"></span><div><b>${esc(t)}</b><div class="who" style="display:block">${esc(a)}</div></div></div>`).join('')}</div></div>

    <h2 class="sec">Indicadores del motor</h2>
    <div class="kpis">
      ${kpi(r.n,'Leads del periodo')}
      ${kpi(r.pct15!=null?r.pct15+'%':null,`Atendidos en 15 min (meta ${META_15MIN}%)`, r.pct15>=META_15MIN?'good':(r.pct15!=null?'alert':''), r.pct15)}
      ${kpi(fmtMin(r.medianaSeg),'Mediana 1.ª respuesta')}
      ${kpi(r.sinContactar,'Sin contactar', r.sinContactar?'alert':'')}
      ${kpi(r.esperando,'Esperando respuesta', r.esperando?'alert':'')}
      ${kpi(r.n?pct(r.pruebas,r.n)+'%':null,'Lead → prueba de manejo','',r.n?pct(r.pruebas,r.n):undefined)}
      ${kpi(r.n?pct(r.vendidos,r.n)+'%':null,'Lead → venta', r.vendidos?'good':'', r.n?pct(r.vendidos,r.n):undefined)}
      ${kpi(r.valor?r.valor.toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}):null,'Valor vendido')}
    </div>

    <div class="bars">
      <div class="panel"><h3>Embudo completo · de la visita a la venta</h3>${barrasEmbudo(embudo(E,L))}<div class="msg">El % compara cada paso con el anterior.</div></div>
      <div class="panel"><h3>Tendencia semanal</h3>${columnasSemana(semanas(S.leads))}</div>
    </div>

    <h2 class="sec">Desempeño por asesor</h2>
    <div class="panel">${tablaEquipo(equipo, true)}</div>

    <div class="bars">
      <div class="panel"><h3>Origen de los leads</h3><div id="aOrigen"></div></div>
      <div class="panel"><h3>Modelos más pedidos</h3><div id="aModelos"></div></div>
      <div class="panel"><h3>Alertas del motor (cumplimiento)</h3><div id="aAlertas"></div></div>
      <div class="panel"><h3>Tracking del cliente (eventos)</h3><div id="aTracking"></div></div>
    </div>`;
  bars($('#aOrigen'), origen); bars($('#aModelos'), modelos);
  bars($('#aAlertas'), alertas); if(!Object.keys(alertas).length) $('#aAlertas').innerHTML = '<div class="empty">Sin alertas en el periodo (o la revisión automática aún no está activa).</div>';
  bars($('#aTracking'), tracking);
}

/* ---------- Vista Negocio ---------- */
function renderNegocio(){
  const L = enPeriodo(S.leads), r = resumen(L), equipo = porAsesor(L);
  const perd = Object.entries(contar(L.filter(l=>l.etapa==='perdido'), l=>l.motivo_perdida||'sin motivo')).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const titular = r.n
    ? `En los últimos ${S.dias} días entraron <b>${r.n}</b> prospectos. Se atendió a tiempo al <b>${r.pct15 ?? 0}%</b>, <b>${r.pruebas}</b> llegaron a prueba de manejo y se cerraron <b>${r.vendidos}</b> venta${r.vendidos===1?'':'s'}.`
    : `Sin prospectos nuevos en los últimos ${S.dias} días.`;
  $('#viewNegocio').innerHTML = `
    <div class="headline">${titular}</div>
    <div class="kpis big">
      ${kpi(r.n,'Prospectos')}
      ${kpi(r.pct15!=null?r.pct15+'%':null,'Atendidos a tiempo (15 min)', r.pct15>=META_15MIN?'good':(r.pct15!=null?'alert':''), r.pct15)}
      ${kpi(r.pruebas,'Pruebas de manejo')}
      ${kpi(r.vendidos,'Ventas', r.vendidos?'good':'')}
    </div>
    <div class="bars">
      <div class="panel"><h3>Requiere atención hoy</h3>${listaAtencion(S.leads)}</div>
      <div class="panel"><h3>Tendencia semanal</h3>${columnasSemana(semanas(S.leads))}</div>
    </div>
    <h2 class="sec">Tu equipo</h2>
    <div class="panel">${tablaEquipo(equipo, false)}<div class="msg"><span class="dot ok"></span>al día · <span class="dot warm"></span>revisar · <span class="dot bad"></span>clientes sin atender</div></div>
    <div class="bars">
      <div class="panel"><h3>Por qué se pierden ventas</h3>${perd.length ? perd.map(([m,n])=>`<div class="bar"><span>${esc(m)}</span><div class="track"><div class="fill" style="width:${(100*n/perd[0][1]).toFixed(0)}%"></div></div><b style="text-align:right">${n}</b></div>`).join('') : '<div class="empty">Sin ventas perdidas registradas.</div>'}</div>
      <div class="panel"><h3>Cartera activa</h3>${ETAPAS_ACTIVAS.map(e=>`<div class="bar"><span>${ETAPA_TXT[e]}</span><div class="track"><div class="fill" style="width:${(100*S.leads.filter(l=>l.etapa===e).length/Math.max(1,S.leads.filter(abierto).length)).toFixed(0)}%"></div></div><b style="text-align:right">${S.leads.filter(l=>l.etapa===e).length}</b></div>`).join('')}</div>
    </div>`;
}

/* ---------- Pestañas por rol ---------- */
function tabsPorRol(){
  if(S.rol==='admin') return [['admin','Control del motor'],['negocio','Vista del negocio'],['cartera','Cartera activa']];
  if(S.rol==='negocio') return [['negocio','Resumen'],['cartera','Cartera activa']];
  return [];
}
function renderVista(){
  const tabs = tabsPorRol();
  if(!tabs.find(t=>t[0]===S.vista)) S.vista = tabs[0]?.[0] || 'cartera';
  $('#tabs').innerHTML = tabs.map(([k,t])=>`<button class="tab ${S.vista===k?'on':''}" data-vista="${k}">${t}</button>`).join('');
  $('#tabs').classList.toggle('hidden', !tabs.length);
  ['admin','negocio','cartera'].forEach(v => $('#view'+v[0].toUpperCase()+v.slice(1)).classList.toggle('hidden', S.vista!==v));
  if(S.vista==='admin') renderAdmin();
  else if(S.vista==='negocio') renderNegocio();
  else { renderMetricas(); renderCartera(); }
}
document.addEventListener('click', e => { const t = e.target.closest('[data-vista]'); if(t){ S.vista = t.dataset.vista; try{ localStorage.setItem('mv_vista', S.vista); }catch(_){} renderVista(); } });

/* ---------- Eventos de demostración para el embudo ---------- */
function demoEventos(){
  const ev = []; const H = h => new Date(Date.now()-h*3600000).toISOString();
  for(let i=0;i<240;i++){
    const h = Math.random()*24*S.dias, s = 'demo'+i, a = i%2 ? 'a1':'a2';
    ev.push({tipo:'landing_visita', sesion:s, asesor_id:a, created_at:H(h)});
    if(i%3===0) ev.push({tipo:'modelo_visto', sesion:s, asesor_id:a, created_at:H(h-.01)});
    if(i%9===0) ev.push({tipo:'whatsapp_click', sesion:s, asesor_id:a, created_at:H(h-.02)});
  }
  ev.push({tipo:'alerta_sla15',asesor_id:'a1',created_at:H(0.15)},{tipo:'alerta_sla15',asesor_id:'a2',created_at:H(40)},{tipo:'alerta_espera',asesor_id:'a1',created_at:H(1.5)},{tipo:'alerta_sin_toque',asesor_id:'a2',created_at:H(30)});
  return ev;
}
