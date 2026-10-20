import {parseWholeMeter, parseDecimalMeter, readValue, toMillis, toM3String, formatM3, buildIntervals, analyzeLatest, localDate, fmtDate, diffDays, parseOcrCandidates} from './math.js';

const $ = id => document.getElementById(id);
const STORE = 'hidrocondo-fotos';
const state = {db:null,user:null,member:null,condo:null,role:null,meters:[],readings:[],audits:[],tab:'dashboard',meterId:null,authMode:'login',busy:false};
const number = n => Number(n).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:1});
const escapeHtml = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const apiError = e => String(e?.message || e || 'Erro desconhecido').replace(/duplicate key value violates unique constraint.*/i,'Já existe uma leitura para esta data e hidrômetro.');
let toastTimeout;
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),5800);}
function screens(which){for(const id of ['loading','setup','auth','onboard','app']) $('screen-'+id).hidden=(id!==which);$('account-top').hidden=which!=='app';}
function setBusy(button,busy,text){button.disabled=busy;if(busy){button.dataset.orig=button.textContent;button.textContent=text||'Aguarde...';}else if(button.dataset.orig){button.textContent=button.dataset.orig;delete button.dataset.orig;}}
function guard(fn){return async e=>{try{await fn(e);}catch(err){console.error(err);toast(apiError(err),true);}};}
function makeUUID(){return crypto.randomUUID();}
function currentMeterId(){return state.meterId || state.meters[0]?.id;}
function meterReadings(id=currentMeterId()){return state.readings.filter(x=>x.meter_id===id).sort((a,b)=>a.measured_on.localeCompare(b.measured_on));}
function getIntervals(id=currentMeterId()){return buildIntervals(meterReadings(id));}
function userDisplayName(){return state.user?.user_metadata?.full_name?.trim() || state.user?.email?.split('@')[0] || 'Responsável';}

async function bootstrap(){
  if(!state.db)return screens('setup');
  screens('loading');
  const {data:{user},error}=await state.db.auth.getUser();
  if(error && !/session missing/i.test(error.message))console.warn('Sessão:',error.message);
  state.user=user;
  if(!user){state.member=null;return screens('auth');}
  const {data:member,error:e}=await state.db.from('memberships')
    .select('condominium_id,role,condominiums(id,name)')
    .eq('user_id',user.id).maybeSingle();
  if(e)throw e;
  state.member=member;
  if(!member){state.role=null;return screens('onboard');}
  state.role=member.role;state.condo=member.condominiums;
  $('top-condo').textContent=state.condo.name;
  $('role-label').textContent=state.role==='sindica'?'PAINEL DA SÍNDICA':'ÁREA DO ZELADOR';
  $('settings-condo').textContent=state.condo.name;
  $('settings-role').textContent=`Seu acesso: ${state.role==='sindica'?'Síndica (administradora)':'Zelador (registra leituras)'}`;
  $('admin-settings').hidden=state.role!=='sindica';
  $('reading-date').value=localDate();
  await loadData();
  screens('app');
  setTab(state.role==='zelador'?'new':'dashboard');
  if(state.role==='sindica')await loadInvite();
}

async function loadData(){
  if(!state.condo)return;
  const cid=state.condo.id;
  const [m,r,a]=await Promise.all([
    state.db.from('meters').select('*').eq('condominium_id',cid).order('created_at'),
    state.db.from('readings').select('*').eq('condominium_id',cid).order('measured_on',{ascending:false}).limit(1500),
    state.db.from('readings_audit').select('*').eq('condominium_id',cid).order('changed_at',{ascending:false}).limit(1500)
  ]);
  for(const x of [m,r,a])if(x.error)throw x.error;
  state.meters=m.data||[];state.readings=r.data||[];state.audits=a.data||[];
  if(!state.meters.some(meter=>meter.id===state.meterId))state.meterId=state.meters[0]?.id||null;
  renderMeters();renderDashboard();renderHistory();updatePrevious();updateLive();
  $('sync-label').textContent=`Atualizado ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · automaticamente a cada 30 s`;
}
function renderMeters(){
  for(const id of ['dash-meter','history-meter','new-meter']){
    const select=$(id),saved=id==='new-meter'?select.value:state.meterId;
    select.replaceChildren(...state.meters.map(m=>{const el=document.createElement('option');el.value=m.id;el.textContent=m.name;return el;}));
    select.value=state.meters.some(m=>m.id===saved)?saved:(state.meterId||'');
  }
}
function setTab(tab){
  state.tab=tab;
  const titles={dashboard:'Visão geral',new:'Nova leitura',history:'Histórico',settings:'Configurações'};
  $('page-title').textContent=titles[tab];
  for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===tab);
  for(const id of Object.keys(titles))$('tab-'+id).hidden=id!==tab;
  if(tab==='dashboard')renderDashboard();
  if(tab==='history')renderHistory();
  if(tab==='new'){updatePrevious();updateLive();}
}
function statTile(label,value,foot=''){return `<div class="summary-tile"><div class="metric-title">${escapeHtml(label)}</div><div class="metric">${value}</div><div class="hint">${escapeHtml(foot)}</div></div>`;}
async function signedPhoto(path){
  if(!path)return null;
  const {data,error}=await state.db.storage.from(STORE).createSignedUrl(path,900);
  if(error)throw error;
  return data.signedUrl;
}
function renderDashboard(){
  const intervals=getIntervals();const ana=analyzeLatest(intervals);const latest=intervals.at(-1);
  const a=ana.last;
  $('summary-grid').innerHTML=[
    statTile('Última leitura',latest?`${formatM3(toMillis(latest.value_m3))} <small>m³</small>`:'—',latest?fmtDate(latest.measured_on):'Sem leituras'),
    statTile('Consumo no período',a?`${formatM3(a.consumed)} <small>m³</small>`:'—',a?`${a.days} dia(s)`:'Cadastre duas leituras'),
    statTile('Média diária',a?`${formatM3(Math.round(a.daily))} <small>m³/dia</small>`:'—',a?'Do último intervalo':'Aguardando histórico'),
    statTile('Variação da média',ana.change!==null?`${ana.change>0?'+':''}${number(ana.change)}%`:'—',ana.change!==null?'Comparado aos períodos anteriores':'Dados insuficientes')
  ].join('');
  const alert=$('dashboard-alert');
  alert.hidden=!ana.alert;
  if(ana.alert){alert.className='panel notice-warn';alert.innerHTML=`<strong>⚠️ Consumo acima da média</strong><p>A média diária do último intervalo ficou ${number(ana.change)}% acima da média dos quatro intervalos anteriores. Isso não confirma vazamento: verifique os dados e as condições do condomínio.</p>`;}
  const valid=intervals.filter(i=>i.consumed!==null&&i.consumed>=0).slice(-9);
  if(!valid.length){$('chart').innerHTML='<div class="empty">O gráfico aparecerá após a segunda medição do hidrômetro.</div>';}
  else{
    const max=Math.max(...valid.map(x=>x.consumed),1);
    $('chart').innerHTML=valid.map(row=>`<div class="bar-col" title="${formatM3(row.consumed)} m³ em ${row.days} dias">
      <span class="value">${number(row.consumed/1000)}</span><div class="bar-track"><div class="bar" style="height:${Math.max(2,(row.consumed/max)*100).toFixed(1)}%"></div></div><span class="date">${fmtDate(row.measured_on).slice(0,5)}</span></div>`).join('');
  }
  if(!latest){$('latest-detail').innerHTML='<p class="empty">Nenhuma leitura cadastrada. Vá em Nova leitura para começar.</p>';return;}
  const name=state.meters.find(m=>m.id===latest.meter_id)?.name||'Hidrômetro';
  $('latest-detail').innerHTML=`<div class="latest-detail"><div id="dash-photo-box"><div class="notice">Carregando foto...</div></div><div class="latest-content">
    <div class="eyebrow">${escapeHtml(name)}</div><h3>${formatM3(toMillis(latest.value_m3))} m³</h3><p>Registrado em <strong>${fmtDate(latest.measured_on)}</strong> por ${escapeHtml(latest.registered_by_name)}.</p>
    <p>${latest.previous?`Consumo desde ${fmtDate(latest.previous.measured_on)}: <strong>${formatM3(latest.consumed)} m³</strong>`:'Leitura inicial. A diferença será calculada no próximo registro.'}</p>
    <div class="button-row"><button class="btn btn-primary" id="share-latest" type="button">↗ Compartilhar relatório</button><button class="btn btn-secondary" id="download-latest" type="button">↓ Baixar imagem</button></div></div></div>`;
  $('share-latest').addEventListener('click',guard(async()=>shareReport(latest,false)));
  $('download-latest').addEventListener('click',guard(async()=>shareReport(latest,true)));
  const rid=latest.id;
  signedPhoto(latest.photo_path).then(url=>{
    if(!document.querySelector('#dash-photo-box') || getIntervals().at(-1)?.id!==rid)return;
    $('dash-photo-box').innerHTML=url?`<img class="latest-photo" alt="Foto do hidrômetro" src="${escapeHtml(url)}">`:'<div class="notice">Leitura inicial sem foto</div>';
  }).catch(()=>{if($('dash-photo-box'))$('dash-photo-box').textContent='Não foi possível carregar a foto.';});
}
function renderHistory(){
  const id=$('history-meter').value||currentMeterId();
  const intervals=getIntervals(id).reverse();
  if(!intervals.length){$('history-list').innerHTML='<p class="empty">Nenhuma leitura registrada nesse hidrômetro.</p>';return;}
  const correctedIds=new Set(state.audits.map(a=>a.reading_id));
  $('history-list').innerHTML=intervals.map(row=>`<article class="history-row"><div>
    <strong>${fmtDate(row.measured_on)} — ${formatM3(toMillis(row.value_m3))} m³</strong>
    ${correctedIds.has(row.id)?'<span class="pill">Corrigida</span>':''}
    <div class="history-meta">${row.previous?`Consumo: ${formatM3(row.consumed)} m³ em ${row.days} dias`:'Leitura de referência (sem consumo calculado)'}</div>
    <div class="history-meta">Registrado por ${escapeHtml(row.registered_by_name)} ${row.photo_path?'· com foto':'· sem foto'}</div>
  </div><div class="history-actions">
    ${row.photo_path?`<button class="btn btn-ghost btn-small" data-action="photo" data-id="${row.id}">Foto</button>`:''}
    <button class="btn btn-secondary btn-small" data-action="share" data-id="${row.id}">Compartilhar</button>
    ${state.role==='sindica'?`<button class="btn btn-ghost btn-small" data-action="edit" data-id="${row.id}">Corrigir</button>`:''}
  </div></article>`).join('');
}
function updatePrevious(){
  const id=$('new-meter').value;const date=$('reading-date').value;
  if(!id||!date)return;
  const prev=meterReadings(id).filter(r=>r.measured_on<date).at(-1);
  const next=meterReadings(id).find(r=>r.measured_on>date);
  $('previous-reading').textContent=prev?
    `Última leitura anterior: ${formatM3(toMillis(prev.value_m3))} m³ em ${fmtDate(prev.measured_on)}.`:
    'Primeira leitura deste hidrômetro: será o ponto de partida, sem consumo calculado.';
  if(next)$('previous-reading').textContent+=` Atenção: existe outra leitura posterior em ${fmtDate(next.measured_on)}.`;
}
function updateLive(){
  const output=$('live-consumption'),id=$('new-meter').value,date=$('reading-date').value;
  try{
    const milli=readValue($('whole-reading').value,$('decimal-reading').value);
    const past=meterReadings(id).filter(r=>r.measured_on<date).at(-1);
    const future=meterReadings(id).find(r=>r.measured_on>date);
    if(past&&milli<toMillis(past.value_m3))throw Error('Leitura menor do que a anterior. Confira os números.');
    if(future&&milli>toMillis(future.value_m3))throw Error('Leitura maior do que a medição posterior já cadastrada.');
    if(!past){output.textContent=`Leitura confirmada: ${formatM3(milli)} m³. Primeiro registro: não há consumo anterior para calcular.`;return;}
    const difference=milli-toMillis(past.value_m3);const days=diffDays(past.measured_on,date);
    output.textContent=`Resultado: ${formatM3(difference)} m³ consumidos em ${days} dia(s). Média: ${formatM3(Math.round(difference/days))} m³/dia.`;
  }catch(e){output.textContent=e.message.includes('parte inteira')?'Preencha a parte inteira para visualizar o cálculo.':e.message;}
}
function fileToBitmap(file){return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Foto inválida ou não suportada.'));};image.src=url;});}
async function compressImage(file){
  if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem válida.');
  if(file.size>20*1024*1024)throw Error('Foto muito grande (máximo 20 MB antes da compressão).');
  const img=await fileToBitmap(file);
  const max=1600,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(img.naturalWidth*ratio));cv.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
  return new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('Não foi possível processar a foto.')),'image/webp',.84));
}
async function loadOcrScript(){
  if(window.Tesseract)return;
  await new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload=resolve;
    script.onerror=()=>reject(Error('Não foi possível carregar o reconhecimento OCR. Verifique sua internet.'));
    document.head.appendChild(script);
  });
}
async function assistOcr(){
  const btn=$('ocr-button'),file=$('reading-photo').files?.[0];
  if(!file)throw Error('Tire uma foto antes de tentar reconhecer os números.');
  setBusy(btn,true,'Analisando foto...');
  const status=$('ocr-status');status.textContent='Carregando OCR (pode levar algum tempo no primeiro uso)...';
  let worker;
  try{
    await loadOcrScript();
    worker=await window.Tesseract.createWorker('eng');
    await worker.setParameters({tessedit_char_whitelist:'0123456789.,'});
    status.textContent='Procurando a leitura acumulada na imagem...';
    const {data}=await worker.recognize(file);
    const possible=parseOcrCandidates(data.text);
    const previous=meterReadings($('new-meter').value)
      .filter(r=>r.measured_on<$('reading-date').value).at(-1);
    const min=previous?toMillis(previous.value_m3):0;
    const selected=possible.filter(x=>x>=min).sort((a,b)=>previous?(a-min)-(b-min):b-a)[0];
    if(selected===undefined){
      status.textContent='O OCR não conseguiu identificar a leitura com segurança. Digite os números manualmente.';
      return;
    }
    $('whole-reading').value=String(Math.floor(selected/1000));
    $('decimal-reading').value=String(selected%1000).padStart(3,'0');
    updateLive();
    status.textContent=`Sugestão OCR: ${formatM3(selected)} m³. ATENÇÃO: confirme visualmente o número!`;
    toast('Números sugeridos. Confira com o visor antes de salvar.');
  } finally {if(worker)await worker.terminate();setBusy(btn,false);}
}

async function saveReading(e){
  e.preventDefault();const btn=$('save-reading');setBusy(btn,true,'Salvando...');
  let uploaded=null;
  try{
    const meterId=$('new-meter').value,date=$('reading-date').value;
    if(!meterId||!date)throw Error('Preencha hidrômetro e data.');
    if(date>localDate())throw Error('Não é permitido cadastrar uma leitura no futuro.');
    const value=readValue($('whole-reading').value,$('decimal-reading').value);
    const rows=meterReadings(meterId);
    if(rows.some(r=>r.measured_on===date))throw Error('Já existe uma leitura nessa data. Solicite correção à síndica.');
    const previous=rows.filter(r=>r.measured_on<date).at(-1);
    const next=rows.find(r=>r.measured_on>date);
    if(previous && value<toMillis(previous.value_m3))throw Error('Leitura menor que a anterior: confira o visor.');
    if(next && value>toMillis(next.value_m3))throw Error('Leitura maior que a posterior: confira o visor.');
    const photo=$('reading-photo').files?.[0];
    if(!photo && !(state.role==='sindica' && rows.length===0))throw Error('Anexe a foto do hidrômetro.');
    if(photo){
      const blob=await compressImage(photo);
      uploaded=`${state.condo.id}/${state.user.id}/${makeUUID()}.webp`;
      const upload=await state.db.storage.from(STORE).upload(uploaded,blob,{contentType:'image/webp',upsert:false});
      if(upload.error)throw upload.error;
    }
    const insert=await state.db.from('readings').insert({condominium_id:state.condo.id,meter_id:meterId,
      measured_on:date,value_m3:toM3String(value),photo_path:uploaded,created_by:state.user.id,
      registered_by_name:userDisplayName()}).select().single();
    if(insert.error)throw insert.error;
    $('reading-form').reset();$('reading-date').value=localDate();$('photo-preview').hidden=true;$('ocr-button').disabled=true;$('ocr-status').textContent='';uploaded=null;
    toast('Leitura salva! A síndica já pode vê-la no painel.');
    state.meterId=meterId;await loadData();setTab('dashboard');
  }catch(err){
    if(uploaded)await state.db.storage.from(STORE).remove([uploaded]).catch(()=>{});
    throw err;
  }finally{setBusy(btn,false);}
}
async function loadInvite(){
  const {data,error}=await state.db.from('condominium_invites').select('invite_code').eq('condominium_id',state.condo.id).single();
  if(error)throw error;$('invite-code').textContent=data.invite_code;
}
async function getPrivateBlob(path){
  if(!path)return null;
  const {data,error}=await state.db.storage.from(STORE).download(path);
  if(error)throw error;return data;
}
function drawRounded(ctx,x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function paintText(ctx,text,x,y,font,color){ctx.font=font;ctx.fillStyle=color;ctx.fillText(text,x,y);}
async function makeReport(row){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1440;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#e9f4f5';ctx.fillRect(0,0,1080,1440);
  drawRounded(ctx,40,38,1000,1360,28,'#fff');
  drawRounded(ctx,40,38,1000,142,28,'#087f8c');
  paintText(ctx,'HIDROCONDO',85,115,'bold 46px system-ui','#fff');
  paintText(ctx,'Relatório de leitura do hidrômetro',85,158,'26px system-ui','#d8f6f4');
  const meter=state.meters.find(m=>m.id===row.meter_id)?.name||'Hidrômetro';
  const intervals=getIntervals(row.meter_id);const interval=intervals.find(i=>i.id===row.id)||row;
  paintText(ctx,state.condo.name.slice(0,42),85,246,'bold 36px system-ui','#1a3940');
  paintText(ctx,`${meter}  •  ${fmtDate(row.measured_on)}`,85,294,'27px system-ui','#607783');
  drawRounded(ctx,76,329,925,218,19,'#e8f7f6');
  paintText(ctx,'LEITURA REGISTRADA',102,379,'bold 24px system-ui','#087f8c');
  paintText(ctx,`${formatM3(toMillis(row.value_m3))} m³`,102,461,'bold 68px system-ui','#133b44');
  paintText(ctx,interval.previous?`Anterior: ${formatM3(toMillis(interval.previous.value_m3))} m³ (${fmtDate(interval.previous.measured_on)})`:'Primeira leitura do hidrômetro (referência)',102,510,'24px system-ui','#607783');
  paintText(ctx,'CONSUMO NO PERÍODO',86,623,'bold 25px system-ui','#667d85');
  paintText(ctx,interval.consumed!==null?`${formatM3(interval.consumed)} m³`:'Aguardando próxima leitura',86,709,'bold 67px system-ui','#087f8c');
  if(interval.previous){paintText(ctx,`${interval.days} dia(s)  •  Média de ${formatM3(Math.round(interval.daily))} m³/dia`,86,754,'24px system-ui','#607783');}
  paintText(ctx,'FOTO DE COMPROVAÇÃO',86,830,'bold 25px system-ui','#667d85');
  const px=86,py=855,pw=908,ph=408;drawRounded(ctx,px,py,pw,ph,16,'#edf4f5');
  if(row.photo_path){
    const blob=await getPrivateBlob(row.photo_path);
    const img=await fileToBitmap(blob);const scale=Math.min(pw/img.naturalWidth,ph/img.naturalHeight);
    const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    ctx.drawImage(img,px+(pw-w)/2,py+(ph-h)/2,w,h);
  }else paintText(ctx,'Leitura inicial cadastrada sem foto',129,1065,'28px system-ui','#667d85');
  paintText(ctx,`Registrado por: ${row.registered_by_name.slice(0,48)}`,86,1323,'23px system-ui','#607783');
  paintText(ctx,'Gerado pelo HidroCondo • confira a leitura original',86,1361,'20px system-ui','#83949b');
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Falha ao gerar a imagem do relatório.')),'image/png'));
}
function reportMessage(row){
  const i=getIntervals(row.meter_id).find(x=>x.id===row.id)||row;
  const meter=state.meters.find(m=>m.id===row.meter_id)?.name||'Hidrômetro';
  const body=[`💧 *HidroCondo — ${state.condo.name}*`,`📅 Data: ${fmtDate(row.measured_on)}`,`🚰 ${meter}`,`Leitura atual: ${formatM3(toMillis(row.value_m3))} m³`];
  if(i.previous)body.push(`Leitura anterior (${fmtDate(i.previous.measured_on)}): ${formatM3(toMillis(i.previous.value_m3))} m³`,`Consumo em ${i.days} dia(s): ${formatM3(i.consumed)} m³`,`Média: ${formatM3(Math.round(i.daily))} m³/dia`);
  else body.push('Leitura inicial (referência).');
  body.push(`Registrado por: ${row.registered_by_name}`);
  return body.join('\n');
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function shareReport(row,downloadOnly){
  toast('Preparando imagem do relatório...');
  const blob=await makeReport(row);const filename=`hidrocondo-${row.measured_on}.png`;
  if(downloadOnly){downloadBlob(blob,filename);toast('Relatório salvo como imagem.');return;}
  const file=new File([blob],filename,{type:'image/png'});const message=reportMessage(row);
  if(navigator.share && navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file],title:'Medição HidroCondo',text:message});return;}
    catch(err){if(err.name==='AbortError')return;console.warn('Compartilhamento nativo não suportado:',err);}
  }
  // Não é possível anexar arquivos diretamente via link do WhatsApp Web.
  downloadBlob(blob,filename);
  try{await navigator.clipboard.writeText(message);}catch{}
  toast('Imagem baixada e texto preparado. Anexe a imagem no WhatsApp.');
  const url='https://wa.me/?text='+encodeURIComponent(message);
  window.open(url,'_blank','noopener,noreferrer');
}
async function viewPhoto(row){
  // Abre a janela imediatamente para não disparar bloqueio de popup no celular.
  const win=window.open('about:blank','_blank');
  const url=await signedPhoto(row.photo_path);
  if(url){if(win)win.location.href=url;else window.location.href=url;}
}
function openEdit(row){
  $('edit-id').value=row.id;$('edit-date').value=row.measured_on;
  const milli=toMillis(row.value_m3);$('edit-whole').value=String(Math.floor(milli/1000));
  $('edit-decimal').value=String(milli%1000).padStart(3,'0');$('edit-reason').value='';$('edit-dialog').showModal();
}
async function saveCorrection(e){
  e.preventDefault();if(state.role!=='sindica')throw Error('Somente a síndica pode corrigir.');
  const id=$('edit-id').value,row=state.readings.find(r=>r.id===id);
  if(!row)throw Error('Leitura não encontrada.');
  const value=readValue($('edit-whole').value,$('edit-decimal').value),date=$('edit-date').value;
  const other=meterReadings(row.meter_id).filter(r=>r.id!==id);
  const previous=other.filter(r=>r.measured_on<date).at(-1),next=other.find(r=>r.measured_on>date);
  if(previous && value<toMillis(previous.value_m3))throw Error('A correção ficaria menor que a leitura anterior.');
  if(next && value>toMillis(next.value_m3))throw Error('A correção ficaria maior que a leitura seguinte.');
  if(date>localDate())throw Error('Data futura não permitida.');
  const reason=$('edit-reason').value.trim();if(reason.length<5)throw Error('Informe o motivo da correção.');
  const result=await state.db.from('readings').update({measured_on:date,value_m3:toM3String(value),correction_note:reason}).eq('id',id);
  if(result.error)throw result.error;
  $('edit-dialog').close();toast('Leitura corrigida. A alteração foi registrada para auditoria.');await loadData();
}
function exportCSV(){
  const id=$('history-meter').value||currentMeterId();const meter=state.meters.find(m=>m.id===id)?.name||'Hidrômetro';
  const rows=getIntervals(id);
  const csv=[['Condomínio','Hidrômetro','Data','Leitura m³','Consumo m³','Dias','Registrado por','Tem foto','Correção'].join(';'),
    ...rows.map(r=>[state.condo.name,meter,fmtDate(r.measured_on),toM3String(toMillis(r.value_m3)),r.consumed===null?'':toM3String(r.consumed),r.days||'',r.registered_by_name,r.photo_path?'Sim':'Não',r.correction_note||''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';'))].join('\r\n');
  downloadBlob(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}),`hidrocondo-${localDate()}.csv`);
}
async function init(){
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
  const cfg=window.HIDRO_CONFIG;
  if(!cfg?.supabaseUrl?.startsWith('https://')||!cfg?.supabaseKey||cfg.supabaseUrl.includes('SEU-PROJETO')||cfg.supabaseKey.includes('SUA_CHAVE')||!window.supabase){screens('setup');return;}
  state.db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true}});
  state.db.auth.onAuthStateChange((_event,_session)=>{setTimeout(()=>bootstrap().catch(err=>{toast(apiError(err),true);screens('auth');}),0);});
  await bootstrap();
}
function bindEvents(){
  $('auth-mode-login').addEventListener('click',()=>changeAuthMode('login'));
  $('auth-mode-signup').addEventListener('click',()=>changeAuthMode('signup'));
  $('auth-form').addEventListener('submit',guard(async e=>{
    e.preventDefault();const btn=$('auth-submit');setBusy(btn,true,'Verificando...');
    try{
      const email=$('auth-email').value.trim(),password=$('auth-password').value;
      if(state.authMode==='login'){
        const {error}=await state.db.auth.signInWithPassword({email,password});if(error)throw error;
        await bootstrap();
      }else{
        const fullName=$('auth-name').value.trim();if(fullName.length<2)throw Error('Informe seu nome.');
        const {data,error}=await state.db.auth.signUp({email,password,options:{data:{full_name:fullName}}});if(error)throw error;
        if(!data.session)toast('Conta criada! Confira o e-mail e confirme o cadastro antes de entrar.');
        else await bootstrap();
      }
    }finally{setBusy(btn,false);}
  }));
  $('logout').addEventListener('click',guard(async()=>{const {error}=await state.db.auth.signOut();if(error)throw error;state.member=null;state.condo=null;state.meters=[];state.readings=[];screens('auth');}));
  $('create-condo-form').addEventListener('submit',guard(async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button');setBusy(btn,true);
    try{const {error}=await state.db.from('condominiums').insert({name:$('new-condo-name').value.trim(),owner_id:state.user.id});if(error)throw error;await bootstrap();toast('Condomínio criado. Compartilhe o código de convite com o zelador.');}finally{setBusy(btn,false);}
  }));
  $('join-condo-form').addEventListener('submit',guard(async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector('button');setBusy(btn,true);
    try{const {error}=await state.db.rpc('join_condominium',{p_code:$('join-code').value.trim()});if(error)throw error;await bootstrap();toast('Bem-vindo! Você já pode registrar as medições.');}finally{setBusy(btn,false);}
  }));
  for(const btn of document.querySelectorAll('[data-tab]'))btn.addEventListener('click',()=>setTab(btn.dataset.tab));
  $('refresh').addEventListener('click',guard(async()=>{await loadData();toast('Painel atualizado.');}));
  for(const id of ['dash-meter','history-meter'])$(id).addEventListener('change',e=>{state.meterId=e.target.value;renderMeters();renderDashboard();renderHistory();});
  $('new-meter').addEventListener('change',()=>{updatePrevious();updateLive();});
  for(const id of ['reading-date','whole-reading','decimal-reading'])$(id).addEventListener('input',()=>{updatePrevious();updateLive();});
  $('reading-photo').addEventListener('change',e=>{
    const file=e.target.files[0];$('ocr-button').disabled=!file;$('ocr-status').textContent='';if(!file){$('photo-preview').hidden=true;return;}
    const img=$('preview-image');if(img.dataset.objecturl)URL.revokeObjectURL(img.dataset.objecturl);
    img.dataset.objecturl=URL.createObjectURL(file);img.src=img.dataset.objecturl;$('photo-preview').hidden=false;
  });
  $('reading-form').addEventListener('submit',guard(saveReading));
  $('ocr-button').addEventListener('click',guard(assistOcr));
  $('history-list').addEventListener('click',guard(async e=>{
    const button=e.target.closest('button[data-action]');if(!button)return;
    const row=state.readings.find(r=>r.id===button.dataset.id);if(!row)return;
    if(button.dataset.action==='photo')await viewPhoto(row);
    if(button.dataset.action==='share')await shareReport(row,false);
    if(button.dataset.action==='edit')openEdit(row);
  }));
  $('export-csv').addEventListener('click',guard(async()=>exportCSV()));
  $('meter-form').addEventListener('submit',guard(async e=>{
    e.preventDefault();if(state.role!=='sindica')throw Error('Sem permissão.');
    const {error}=await state.db.from('meters').insert({condominium_id:state.condo.id,name:$('meter-name').value.trim()});
    if(error)throw error;$('meter-name').value='';await loadData();toast('Hidrômetro adicionado.');
  }));
  $('copy-code').addEventListener('click',guard(async()=>{await navigator.clipboard.writeText($('invite-code').textContent);toast('Código copiado. Envie diretamente ao zelador.');}));
  $('cancel-edit').addEventListener('click',()=>$('edit-dialog').close());
  $('edit-form').addEventListener('submit',guard(saveCorrection));
}
function changeAuthMode(mode){state.authMode=mode;const signup=mode==='signup';
  $('auth-mode-login').classList.toggle('selected',!signup);$('auth-mode-signup').classList.toggle('selected',signup);
  $('auth-title').textContent=signup?'Criar meu acesso':'Bem-vindo de volta';
  $('auth-name').hidden=!signup;$('auth-name-label').hidden=!signup;$('auth-name').required=signup;
  $('auth-submit').textContent=signup?'Criar conta':'Entrar';
  $('auth-helper').textContent=signup?'Você poderá criar um condomínio ou entrar pelo convite da síndica.':'Acesso exclusivo para pessoas autorizadas do condomínio.';
}
bindEvents();init().catch(err=>{console.error(err);toast(`Erro ao iniciar: ${apiError(err)}`,true);screens('setup');});
// Atualização automática do painel sem usar chaves privilegiadas e sem refresh da página.
setInterval(()=>{if(!document.hidden&&state.user&&state.member&&!state.busy)loadData().catch(console.warn);},30000);
window.addEventListener('focus',()=>{if(state.user&&state.member)loadData().catch(console.warn);});
