import {buildIntervals,analyzeLatest,formatM3} from './math.js';

/** Métricas somente com intervalos observados (nunca estimar leitura não realizada). */
export function getWaterInsights(readings, cutoff){
  const data=buildIntervals(readings).filter(i=>i.consumed!==null && i.days>0 && i.consumed>=0 && (!cutoff||i.measured_on<=cutoff));
  const last=data.at(-1)||null;
  const monthKey=cutoff?.slice(0,7) || last?.measured_on?.slice(0,7) || '';
  const inMonth=data.filter(i=>i.measured_on.startsWith(monthKey));
  const recent=data.slice(-4);
  const sum=rows=>rows.reduce((a,i)=>a+i.consumed,0);
  const days=rows=>rows.reduce((a,i)=>a+i.days,0);
  const totals={recentConsumption:sum(recent),recentDays:days(recent),monthConsumption:sum(inMonth),monthDays:days(inMonth),monthPeriods:inMonth.length};
  const avgDaily=totals.recentDays?totals.recentConsumption/totals.recentDays:null;
  const ana=analyzeLatest(data);
  let trend='Ainda não há períodos anteriores suficientes para comparar o consumo.';
  if(ana.change!==null){
    const pct=Math.abs(ana.change).toLocaleString('pt-BR',{maximumFractionDigits:1});
    trend=Math.abs(ana.change)<5?'A média diária está próxima da média dos períodos anteriores.':
      ana.change>0?`A média diária está ${pct}% acima da referência histórica disponível.`:`A média diária está ${pct}% abaixo da referência histórica disponível.`;
  }
  const monthlyText=inMonth.length?
    `Nos ${inMonth.length} período(s) de medição encerrados neste mês, o consumo acumulado foi de ${formatM3(totals.monthConsumption)} m³. Esse total não representa necessariamente o mês inteiro.`:
    'Não há intervalos de medição encerrados neste mês para calcular o consumo.';
  const lastText=last?
    `A última medição registrou ${formatM3(last.consumed)} m³ em ${last.days} dia(s), média de ${formatM3(Math.round(last.daily))} m³ por dia.`:
    'Ainda não existem duas leituras válidas para calcular o consumo.';
  const recentText=recent.length?
    `Nos últimos ${recent.length} períodos completos, foram ${formatM3(totals.recentConsumption)} m³ em ${totals.recentDays} dia(s), com média diária de ${formatM3(Math.round(avgDaily))} m³.`:
    'Cadastre duas ou mais leituras para visualizar a análise.';
  const warning=ana.alert?'Atenção: o aumento é incomum em relação ao histórico. Confira as leituras e investigue possíveis causas. Isso não confirma um vazamento.':
    'Os dados disponíveis, isoladamente, não comprovam vazamento.';
  return {last,totals,avgDaily,change:ana.change,alert:ana.alert,lastText,recentText,monthlyText,trend,warning,
    short:last?`${lastText} ${trend}`:lastText,
    full:[lastText,recentText,monthlyText,trend,warning]};
}
