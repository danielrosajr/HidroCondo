import {readValue,toMillis,diffDays} from './math.js';

export function parseHistoricalDate(value){
  const raw=String(value||'').trim();
  let yyyy,mm,dd;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) [yyyy,mm,dd]=raw.split('-').map(Number);
  else if(/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) [dd,mm,yyyy]=raw.split('/').map(Number);
  else throw Error(`Data inválida: ${raw}. Use DD/MM/AAAA ou AAAA-MM-DD.`);
  const iso=`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  const test=new Date(`${iso}T12:00:00Z`);
  if(!Number.isFinite(test.getTime())||test.getUTCFullYear()!==yyyy||test.getUTCMonth()+1!==mm||test.getUTCDate()!==dd)throw Error(`Data inexistente: ${raw}.`);
  return iso;
}
export function parseHistoricalValue(text){
  const value=String(text||'').trim().replace(/\s/g,'');
  if(!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,3})?$|^\d+(?:,\d{1,3})?$/.test(value))
    throw Error(`Leitura inválida: ${value}. Use 4064,959 ou 4.064,959.`);
  const [whole,dec='000']=value.split(',');
  return readValue(whole,dec.padEnd(3,'0'));
}
export function parseHistoricalText(input){
  const rows=[];const seen=new Set();
  for(const [index,line] of String(input||'').split(/\r?\n/).entries()){
    if(!line.trim())continue;
    const parts=line.split(';');
    if(parts.length!==2)throw Error(`Linha ${index+1}: use DATA;LEITURA (ex.: 10/10/2025;3981,000).`);
    const measured_on=parseHistoricalDate(parts[0]);
    const milli=parseHistoricalValue(parts[1]);
    if(seen.has(measured_on))throw Error(`Linha ${index+1}: data ${measured_on} repetida.`);
    seen.add(measured_on);
    rows.push({measured_on,milli});
    if(rows.length>250)throw Error('Máximo de 250 leituras por envio. Divida o histórico em lotes.');
  }
  return rows.sort((a,b)=>a.measured_on.localeCompare(b.measured_on));
}
export function previewHistorical(rows,existing,today){
  if(!rows.length)throw Error('Digite pelo menos uma leitura histórica.');
  const dates=new Set(existing.map(x=>x.measured_on));
  const together=[...existing.map(x=>({measured_on:x.measured_on,milli:toMillis(x.value_m3),old:true})),...rows.map(x=>({...x,old:false}))]
    .sort((a,b)=>a.measured_on.localeCompare(b.measured_on));
  for(const r of rows){
    if(r.measured_on>=today)throw Error(`A data ${r.measured_on} precisa ser anterior a hoje para importar sem foto.`);
    if(dates.has(r.measured_on))throw Error(`Já existe leitura em ${r.measured_on}. Use Corrigir medição.`);
  }
  for(let n=1;n<together.length;n++){
    if(together[n].milli<together[n-1].milli)
      throw Error(`Leitura decrescente entre ${together[n-1].measured_on} e ${together[n].measured_on}. Verifique os valores ou cadastre outro hidrômetro se houve troca/reset.`);
  }
  const total=rows.length>1?rows.at(-1).milli-rows[0].milli:null;
  const days=rows.length>1?diffDays(rows[0].measured_on,rows.at(-1).measured_on):0;
  return {count:rows.length,first:rows[0].measured_on,last:rows.at(-1).measured_on,total,days,
    combinedCount:together.length};
}
