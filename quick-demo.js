// HidroCondo quick demo: entirely in-memory, independent of Supabase Auth/Storage.
// Every browser/device receives its own fictional sandbox. Reloading discards it.
import {diffDays,toMillis,localDate} from './math.js';

const dayUTC = (date,offset)=>{
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
};
const uuid=()=>globalThis.crypto?.randomUUID?.() || `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const err=message=>{throw Error(message)};
const safeValue=v=>{
  if(typeof v!=='number' || !Number.isFinite(v) || v<0 || v>999999999.999 || Math.round(v*1000)/1000!==v)
    err('Informe uma leitura válida com até 3 casas decimais.');
  return v;
};
const checkDate=(s,allowToday=true)=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))err('Informe uma data válida.');
  const d=new Date(`${s}T12:00:00Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)err('Data inexistente.');
  if(s>localDate() || (!allowToday&&s===localDate()))err('A data da leitura não pode ser futura ou de hoje para histórico antigo.');
  return s;
};
function checkSequence(existing,newRows,allowToday=true){
  const oldDates=new Set(existing.map(r=>r.measured_on));
  const all=[...existing,...newRows].sort((a,b)=>a.measured_on.localeCompare(b.measured_on));
  const dates=new Set();
  for(const r of newRows){checkDate(r.measured_on,allowToday);safeValue(r.value_m3);if(oldDates.has(r.measured_on))err(`Já existe medição em ${r.measured_on}.`);}
  for(let i=0;i<all.length;i++){
    if(dates.has(all[i].measured_on))err(`Data duplicada: ${all[i].measured_on}.`);
    dates.add(all[i].measured_on);
    if(i && toMillis(all[i].value_m3)<toMillis(all[i-1].value_m3))err('Leitura menor que a anterior ou maior que a posterior. Confira a sequência de leituras.');
  }
}
export function createQuickDemo(now=localDate()){
  let reading=3200;
  const readings=[];
  for(let i=0;i<12;i++){
    if(i)reading += [81,76,79,83,77,82,88,78,84,80,83][i-1];
    readings.push({id:`seed-${i}`,measured_on:dayUTC(now,(-12+i)*7),value_m3:reading,author:'Medição de exemplo'});
  }
  return {name:'Condomínio Demonstração',weekly_limit_m3:80,readings,requests:[],expires_at:null};
}
export function quickSnapshot(state){
  return {name:state.name,weekly_limit_m3:state.weekly_limit_m3,readings:state.readings.map(r=>({...r})),
    requests:state.requests.map(r=>({...r,entries:r.entries.map(e=>({...e}))})),expires_at:null};
}
export function quickDemoAction(state,operation,args={},role='zelador'){
  switch(operation){
   case 'hc_demo_snapshot': return quickSnapshot(state);
   case 'hc_demo_add_reading': {
      if(!['zelador','sindico'].includes(role))err('Perfil sem permissão.');
      const row={measured_on:checkDate(args.p_date),value_m3:safeValue(args.p_value),author:role==='zelador'?'Zelador(a) de teste':'Síndico(a) de teste'};
      checkSequence(state.readings,[row]);
      state.readings.push({...row,id:uuid()});return null;
   }
   case 'hc_demo_submit_history': {
      if(role!=='zelador')err('Somente zelador(a) envia solicitação.');
      const rows=normalizeHistory(args.p_entries);
      checkSequence(state.readings,rows,false);
      state.requests.push({id:uuid(),status:'pending',entries:rows.map(r=>({...r})),review_note:null});return null;
   }
   case 'hc_demo_manager_history': {
      if(role!=='sindico')err('Somente síndico(a) pode confirmar histórico direto.');
      const rows=normalizeHistory(args.p_entries);checkSequence(state.readings,rows,false);
      state.readings.push(...rows.map(r=>({...r,id:uuid(),author:'Histórico fictício / Síndico(a)'})));return null;
   }
   case 'hc_demo_review_history': {
      if(role!=='sindico')err('Somente síndico(a) pode aprovar.');
      const req=state.requests.find(r=>r.id===args.p_request);
      if(!req||req.status!=='pending')err('Solicitação não encontrada ou já revisada.');
      if(args.p_approve){
        checkSequence(state.readings,req.entries,false);
        state.readings.push(...req.entries.map(r=>({...r,id:uuid(),author:'Histórico fictício / Zelador(a)'})));
        req.status='approved';req.review_note=null;
      }else{
        if(String(args.p_reason||'').trim().length<5)err('Informe pelo menos 5 caracteres para justificar a rejeição.');
        req.status='rejected';req.review_note=String(args.p_reason).trim().slice(0,250);
      }
      return null;
   }
   case 'hc_demo_set_limit': {
      if(role!=='sindico')err('Somente síndico(a) altera a referência.');
      const n=args.p_weekly_limit;
      if(n===null){state.weekly_limit_m3=null;return null;}
      if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>999999)err('Informe um limite válido.');
      state.weekly_limit_m3=n;return null;
   }
   default: err(`Operação de demonstração indisponível: ${operation}`);
  }
}
function normalizeHistory(entries){
  if(!Array.isArray(entries)||!entries.length||entries.length>30)err('O histórico deve ter de 1 a 30 linhas.');
  return entries.map(e=>({measured_on:checkDate(e.measured_on,false),value_m3:safeValue(e.value_m3)}));
}
export const QUICK_DEMO_PARAM='demo-rapida';
export const quickDemoLink=base=>`${base}?${QUICK_DEMO_PARAM}=1`;
