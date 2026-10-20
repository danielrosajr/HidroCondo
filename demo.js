import {parseHistoricalText, previewHistorical} from './historical.js';
import {readValue, toMillis, formatM3, buildIntervals, localDate, fmtDate} from './math.js';
import {getWaterInsights} from './analysis.js';

// All demonstration database access occurs via server-side authorized RPCs.
// Demo photos are local previews only; they are NEVER uploaded to Supabase Storage.
export const demoLink = (base, token) => `${base}?demo=${encodeURIComponent(token)}`;
export const demoStatus = (expiry,revoked,clock=Date.now()) => revoked?'Encerrada':new Date(expiry).getTime()<=clock?'Expirada':'Ativa';
export function demoWarning(){return 'AMBIENTE DE DEMONSTRAÇÃO — dados fictícios e descartáveis. Não use informações reais. Medições de teste podem ser apagadas, e fotos não são armazenadas. Se sair, trocar de aparelho ou limpar o navegador, pode perder o acesso e as configurações.';}
export function prepareDemoHistory(text,readings,today){
 const rows=parseHistoricalText(text);
 if(rows.length>30)throw Error('O limite da demonstração é 30 leituras por envio.');
 const summary=previewHistorical(rows,readings,today);
 return {summary,entries:rows.map(r=>({measured_on:r.measured_on,value_m3:Number((r.milli/1000).toFixed(3))}))};
}
export function demoSummary(readings){
 const rows=[...readings].sort((a,b)=>a.measured_on.localeCompare(b.measured_on));
 const intervals=buildIntervals(rows.map(r=>({id:r.id,measured_on:r.measured_on,value_m3:r.value_m3,meter_id:'demo'})));
 const last=intervals.at(-1),prev=intervals.at(-2);
 return {rows,intervals,last,prev,consumption:last?.consumed??null};
}
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dateTime=iso=>new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});

export function makeDemoController({db,screens,toast,homeUrl,goHome,startSignup}){
 const ctx={space:null,token:null,role:null,data:null,timer:null,photo:null,photoUrl:null,busy:false,links:null};
 const rpc=async(fn,args={})=>{const {data,error}=await db.rpc(fn,args);if(error)throw error;return data;};
 const warn=(err)=>{console.error(err);toast(err?.message||String(err),true);};
 const working=async(fn)=>{if(ctx.busy)return;ctx.busy=true;try{await fn();}catch(err){warn(err);}finally{ctx.busy=false;}};
 function clearPhoto(){if(ctx.photoUrl)URL.revokeObjectURL(ctx.photoUrl);ctx.photo=null;ctx.photoUrl=null;const img=$('demo-photo-preview');img.hidden=true;img.removeAttribute('src');$('demo-camera').value='';$('demo-gallery').value='';}
 function stop(){if(ctx.timer){clearInterval(ctx.timer);ctx.timer=null;}clearPhoto();ctx.space=null;ctx.role=null;ctx.data=null;}
 function welcome(){stop();ctx.token=new URLSearchParams(location.search).get('demo');$('demo-accept').checked=false;$('demo-enter').disabled=true;screens('demo-welcome');}
 async function enter(){
  if(!$('demo-accept').checked)throw Error('Confirme que entendeu as condições do ambiente de testes.');
  const {data:existing,error:err}=await db.auth.getUser();
  if(err && !/session missing/i.test(err.message))console.warn(err.message);
  if(!existing?.user){
   const {error}=await db.auth.signInAnonymously();
   if(error)throw Error(`Não foi possível entrar sem cadastro. Ative Anonymous Sign-Ins no Supabase. ${error.message}`);
  }
  let claim;
  try{claim=await rpc('hc_demo_redeem',{p_token:ctx.token});}
  catch(e){if(/vencid|encerrad|expirad/i.test(e.message)){ended();return;}throw e;}
  ctx.space=claim.space_id;ctx.role=claim.role;
  $('demo-space-name').textContent=claim.name;
  $('demo-role').textContent=claim.role==='sindico'?'Síndico(a) de demonstração':'Zelador(a) de demonstração';
  $('demo-expiry').textContent=dateTime(claim.expires_at);
  $('demo-reading-date').value=localDate();
  $('demo-worker-new').hidden=ctx.role!=='zelador';
  $('demo-manager-stats').hidden=ctx.role!=='sindico';
  $('demo-requests-panel').hidden=ctx.role!=='sindico';
  $('demo-history-action').textContent=ctx.role==='zelador'?'Enviar para aprovação (teste)':'Adicionar histórico fictício';
  $('demo-history-instructions').textContent=ctx.role==='zelador'?'O pedido aparecerá para o(a) síndico(a) de demonstração aprovar.':'As leituras serão acrescentadas diretamente ao histórico de teste.';
  screens('demo');
  demoTab(ctx.role==='sindico'?'overview':'new');
  await refresh();
  ctx.timer=setInterval(()=>{if(ctx.data?.expires_at&&new Date(ctx.data.expires_at).getTime()<=Date.now())ended();else refresh().catch(e=>{if(/terminou|revogad|vencid/i.test(e.message))ended();else console.warn(e);});},30000);
 }
 async function refresh(){
  if(!ctx.space)return;
  const data=await rpc('hc_demo_snapshot',{p_space:ctx.space});
  ctx.data=data;render();
 }
 function ended(){if(ctx.timer)clearInterval(ctx.timer);ctx.timer=null;screens('demo-ended');}
 function demoTab(tab){
  for(const el of document.querySelectorAll('[data-demo-tab]'))el.classList.toggle('active',el.dataset.demoTab===tab);
  for(const id of ['overview','new','history','past'])$('demo-tab-'+id).hidden=id!==tab;
  if(ctx.role==='zelador'&&tab==='overview')$('demo-manager-stats').hidden=true;
 }
 function render(){
  const d=ctx.data;if(!d)return;
  const {rows,intervals,last}=demoSummary(d.readings);
  const end=last?formatM3(toMillis(last.value_m3)):'—';
  $('demo-count').textContent=String(rows.length);
  $('demo-latest').textContent=end==='—'?'—':`${end} m³`;
  $('demo-consumption').textContent=last?.consumed!==null&&last?.consumed!==undefined?`${formatM3(last.consumed)} m³`:'—';
  const insight=getWaterInsights(rows.map(r=>({...r,meter_id:'demo'})),last?.measured_on);
  $('demo-insight').textContent=insight.short;
  const valid=intervals.filter(i=>i.consumed!==null&&i.consumed>=0).slice(-9);
  const max=Math.max(1,...valid.map(i=>i.consumed));
  $('demo-chart').innerHTML=valid.map(i=>`<div class="bar-col"><span class="value">${(i.consumed/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})}</span><div class="bar-track"><div class="bar" style="height:${Math.max(2,Math.round(i.consumed/max*100))}%"></div></div><span class="date">${fmtDate(i.measured_on).slice(0,5)}</span></div>`).join('');
  $('demo-readings').innerHTML=rows.slice().reverse().map((r,i,arr)=>`<div class="demo-entry"><strong>${fmtDate(r.measured_on)} — ${formatM3(toMillis(r.value_m3))} m³</strong><small>${escape(r.author)} · sem foto armazenada</small></div>`).join('');
  $('demo-requests').innerHTML=d.requests.length?d.requests.map(r=>`<article class="demo-request"><strong>${r.entries.length} leitura(s)</strong><span class="pill">${r.status==='pending'?'Aguardando aprovação':r.status==='approved'?'Aprovado':'Rejeitado'}</span><details><summary>Ver datas e valores</summary><ul>${r.entries.map(e=>`<li>${fmtDate(e.measured_on)} — ${escape(e.value_m3)} m³</li>`).join('')}</ul></details>${r.status==='pending'&&ctx.role==='sindico'?`<div class="demo-actions"><button type="button" class="btn btn-primary" data-demo-review="approve" data-id="${r.id}">Aprovar</button><button type="button" class="btn btn-secondary" data-demo-review="reject" data-id="${r.id}">Rejeitar</button></div>`:''}${r.review_note?`<p>${escape(r.review_note)}</p>`:''}</article>`).join(''):'<p class="help">Nenhuma solicitação de histórico de testes.</p>';
  $('demo-reading-reference').textContent=last?`Última leitura: ${end} m³ em ${fmtDate(last.measured_on)}. Digite um valor igual ou maior, em uma nova data.`:'Sem leitura anterior.';
  $('demo-worker-pending').hidden=ctx.role!=='zelador';
  $('demo-worker-pending').textContent=`Pedidos de histórico enviados: ${d.requests.length}.`; 
 }
 async function saveReading(e){e.preventDefault();
  const day=$('demo-reading-date').value;
  const val=readValue($('demo-whole').value,$('demo-decimals').value);
  await rpc('hc_demo_add_reading',{p_space:ctx.space,p_date:day,p_value:Number((val/1000).toFixed(3))});
  clearPhoto();$('demo-whole').value='';$('demo-decimals').value='000';await refresh();
  toast('Medição fictícia registrada. Nenhuma foto foi salva.');
  demoTab(ctx.role==='sindico'?'overview':'history');
 }
 async function saveHistory(e){e.preventDefault();
  const parsed=prepareDemoHistory($('demo-history-input').value,ctx.data.readings,localDate());
  if(ctx.role==='zelador')await rpc('hc_demo_submit_history',{p_space:ctx.space,p_entries:parsed.entries});
  else await rpc('hc_demo_manager_history',{p_space:ctx.space,p_entries:parsed.entries});
  $('demo-history-input').value='';await refresh();toast(ctx.role==='zelador'?'Histórico de testes enviado para aprovação.':'Histórico fictício adicionado.');demoTab('history');
 }
 function selectPhoto(file){
  if(!file)return;
  if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem válida.');
  if(file.size>30*1024*1024)throw Error('Escolha uma foto menor que 30 MB.');
  clearPhoto();ctx.photo=file;ctx.photoUrl=URL.createObjectURL(file);
  $('demo-photo-preview').src=ctx.photoUrl;$('demo-photo-preview').hidden=false;
  $('demo-photo-message').textContent='Prévia apenas: a foto não será enviada nem armazenada.';
 }
 function exportDemoCSV(){const rows=ctx.data?.readings||[];const lines=['Data;Leitura m³;Origem',...rows.map(r=>`${r.measured_on};${Number(r.value_m3).toFixed(3).replace('.',',')};${String(r.author).replaceAll(';',',')}`)];
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='hidrocondo-DEMONSTRACAO.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);
 }
 function shareDemo(){const s=demoSummary(ctx.data?.readings||[]);const t=`HIDROCONDO — DEMONSTRAÇÃO (DADOS FICTÍCIOS)\n${ctx.data.name}\nÚltima leitura: ${s.last?formatM3(toMillis(s.last.value_m3))+' m³':'sem dados'}\nConsumo no último período: ${s.last?.consumed!==null&&s.last?.consumed!==undefined?formatM3(s.last.consumed)+' m³':'indisponível'}\nEstes números são apenas de teste e não representam consumo real.`;if(navigator.share)navigator.share({text:t,title:'HidroCondo — DEMONSTRAÇÃO'}).catch(()=>navigator.clipboard?.writeText(t));else navigator.clipboard.writeText(t).then(()=>toast('Relatório demonstrativo copiado.')).catch(()=>toast(t));}
 async function leave(toSignup=false){stop();history.replaceState({},'',homeUrl());const {data:{user}}=await db.auth.getUser();if(user?.is_anonymous){await db.auth.signOut();}await goHome();if(toSignup)startSignup();}
 async function showAdmin(){screens('demo-admin');$('demo-admin-new-links').hidden=true;await loadAdmin();}
 async function loadAdmin(){const rows=await rpc('hc_demo_list');
  $('demo-admin-list').innerHTML=rows.length?rows.map(r=>`<article class="demo-entry demo-admin-entry"><div><strong>${escape(r.name)}</strong><small>Criado: ${dateTime(r.created_at)} · Termina: ${dateTime(r.expires_at)} · ${demoStatus(r.expires_at,r.revoked)}</small></div>${demoStatus(r.expires_at,r.revoked)==='Ativa'?`<button type="button" class="btn btn-secondary btn-small" data-demo-end="${r.id}">Encerrar agora</button>`:''}</article>`).join(''):'<p class="help">Nenhuma demonstração criada. Crie um ambiente fictício para começar.</p>';
 }
 async function createAdmin(e){e.preventDefault();const name=$('demo-admin-name').value.trim();const hours=Number($('demo-admin-hours').value);const max=Number($('demo-admin-uses').value);
  const data=await rpc('hc_demo_create',{p_name:name,p_hours:hours,p_max_uses:max});
  const base=homeUrl();ctx.links={manager:demoLink(base,data.manager_token),worker:demoLink(base,data.worker_token)};
  $('demo-manager-link').value=ctx.links.manager;$('demo-worker-link').value=ctx.links.worker;
  $('demo-admin-expiry').textContent=dateTime(data.expires_at);
  $('demo-admin-new-links').hidden=false;
  $('demo-admin-name').value='';await loadAdmin();toast('Demonstração criada. Copie os dois links agora.');
 }
 function init(){
  $('demo-accept').addEventListener('change',()=>{$('demo-enter').disabled=!$('demo-accept').checked;});
  $('demo-enter').addEventListener('click',()=>working(enter));
  $('demo-expired-signup').addEventListener('click',()=>working(()=>leave(true)));
  $('demo-expired-home').addEventListener('click',()=>working(leave));
  $('demo-leave').addEventListener('click',()=>working(leave));
  $('demo-signup').addEventListener('click',()=>working(()=>leave(true)));
  $('demo-admin-back').addEventListener('click',()=>working(goHome));
  $('demo-admin-form').addEventListener('submit',e=>working(()=>createAdmin(e)));
  $('demo-admin-refresh').addEventListener('click',()=>working(loadAdmin));
  $('demo-admin-list').addEventListener('click',e=>{const b=e.target.closest('button[data-demo-end]');if(b&&confirm('Encerrar agora? Os visitantes perderão o acesso e os dados são descartáveis.'))working(async()=>{await rpc('hc_demo_revoke',{p_space:b.dataset.demoEnd});await loadAdmin();toast('Demonstração encerrada.');});});
  for(const id of ['demo-copy-manager','demo-copy-worker'])$(id).addEventListener('click',()=>working(async()=>{await navigator.clipboard.writeText(id==='demo-copy-manager'?ctx.links.manager:ctx.links.worker);toast('Link copiado.');}));
  for(const b of document.querySelectorAll('[data-demo-tab]'))b.addEventListener('click',()=>demoTab(b.dataset.demoTab));
  $('demo-reload').addEventListener('click',()=>working(refresh));
  $('demo-reading-form').addEventListener('submit',e=>working(()=>saveReading(e)));
  $('demo-history-form').addEventListener('submit',e=>working(()=>saveHistory(e)));
  for(const id of ['demo-camera','demo-gallery'])$(id).addEventListener('change',e=>{try{selectPhoto(e.target.files?.[0]);}catch(err){warn(err);}});
  $('demo-requests').addEventListener('click',e=>{const b=e.target.closest('button[data-demo-review]');if(!b)return;working(async()=>{const approve=b.dataset.demoReview==='approve';const note=approve?'':prompt('Motivo da rejeição (somente dados de demonstração):')||'';if(!approve&&!note.trim())return;await rpc('hc_demo_review_history',{p_space:ctx.space,p_request:b.dataset.id,p_approve:approve,p_reason:note});await refresh();toast('Solicitação analisada na demonstração.');});});
  $('demo-export-csv').addEventListener('click',exportDemoCSV);
  $('demo-share').addEventListener('click',shareDemo);
  $('demo-print').addEventListener('click',()=>window.print());
 }
 return {init,welcome,showAdmin,stop};
}
