/** Indicative weekly consumption reference. Measurements are cumulative meter readings (m³). */
export function parseWeeklyLimit(input){
  if(input === null || input === undefined || String(input).trim()==='')return null;
  const s=String(input).trim().replace(',', '.');
  if(!/^\d{1,7}(?:\.\d{1,3})?$/.test(s))throw Error('Informe o limite em m³ (ex.: 80 ou 80,500).');
  const n=Number(s);
  if(!Number.isFinite(n)||n<=0||n>1_000_000)throw Error('Use um limite entre 0,001 e 1.000.000 m³ por 7 dias.');
  return n;
}
export function evaluateWeeklyLimit(interval,weeklyLimit){
  if(weeklyLimit===null||weeklyLimit===undefined||weeklyLimit==='')return {status:'unset'};
  const limit=Number(weeklyLimit);
  if(!Number.isFinite(limit)||limit<=0)return {status:'unset'};
  if(!interval||!Number.isFinite(interval.consumed)||!Number.isFinite(interval.days)||interval.days<=0)
    return {status:'insufficient',weeklyLimit:limit};
  const actual=interval.consumed/1000;
  const comparable=actual*7/interval.days;
  const allowed=limit*interval.days/7;
  const exceeding=comparable>limit+0.00000001;
  return {status:exceeding?'above':'within',weeklyLimit:limit,consumptionM3:actual,
    days:interval.days,weeklyEquivalentM3:comparable,allowedM3:allowed,
    excessPercent:limit>0?(comparable-limit)/limit*100:0,
    startDate:interval.previous?.measured_on??null,endDate:interval.measured_on};
}
export const formatMetric=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:3,minimumFractionDigits:0});
export function weeklyLimitMessage(result,{fictional=false}={}){
  const pre=fictional?'DADOS FICTÍCIOS — ':'';
  if(result.status==='unset')return `${pre}Configure uma referência de consumo semanal para acompanhar os períodos.`;
  if(result.status==='insufficient')return `${pre}Aguardando duas leituras com datas distintas para avaliar a referência de ${formatMetric(result.weeklyLimit)} m³ por 7 dias.`;
  const verdict=result.status==='above'?'Acima da referência':'Dentro da referência';
  return `${pre}${verdict}: ${formatMetric(result.consumptionM3)} m³ em ${result.days} dia(s). Equivalente a ${formatMetric(result.weeklyEquivalentM3)} m³ por 7 dias, comparado ao limite configurado de ${formatMetric(result.weeklyLimit)} m³ por 7 dias (máximo proporcional de ${formatMetric(result.allowedM3)} m³ neste período). A comparação é indicativa, não confirma vazamentos nem substitui a regra do condomínio.`;
}
