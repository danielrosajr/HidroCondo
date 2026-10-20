// Sem dependências: cálculos financeiros/hídricos testáveis de forma isolada.
export function parseWholeMeter(raw) {
  const text = String(raw ?? '').trim().replace(/\s/g, '');
  // A parte inteira do medidor pode ser '4.064' (milhar), nunca '4,064' decimal.
  if (!/^\d{1,3}(?:\.\d{3})+$|^\d+$/.test(text)) throw Error('Informe a parte inteira: 4064 ou 4.064.');
  const n = Number(text.replaceAll('.', ''));
  if (!Number.isSafeInteger(n) || n > 999999999) throw Error('Leitura fora do intervalo permitido.');
  return n;
}
export function parseDecimalMeter(raw) {
  const text = String(raw ?? '000').trim();
  if (!/^\d{1,3}$/.test(text)) throw Error('Informe de 000 a 999 nos decimais.');
  return Number(text.padEnd(3, '0'));
}
export function readValue(whole, decimal) {
  // Retornar em milésimos inteiros evita arredondamentos de ponto flutuante.
  return parseWholeMeter(whole) * 1000 + parseDecimalMeter(decimal);
}
export function toMillis(m3) {
  return Math.round(Number(m3) * 1000);
}
export function toM3String(millis) {
  return (millis / 1000).toFixed(3);
}
export function formatM3(millis, decimals = 3) {
  return (millis / 1000).toLocaleString('pt-BR', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}
export function diffDays(start, end) {
  const a = Date.parse(`${start}T12:00:00Z`), b = Date.parse(`${end}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}
export function buildIntervals(readings) {
  const ordered = [...readings].sort((a,b) => a.measured_on.localeCompare(b.measured_on));
  return ordered.map((r,i) => {
    const previous = i ? ordered[i-1] : null;
    const days = previous ? diffDays(previous.measured_on, r.measured_on) : 0;
    const consumed = previous ? toMillis(r.value_m3) - toMillis(previous.value_m3) : null;
    return { ...r, previous, days, consumed,
      daily: consumed !== null && days > 0 ? consumed / days : null };
  });
}
export function analyzeLatest(intervals) {
  const valid = intervals.filter(i => i.consumed !== null && i.days > 0 && i.consumed >= 0);
  if (!valid.length) return {last:null, baseline:null, change:null, alert:false};
  const last = valid.at(-1);
  const preceding = valid.slice(-5,-1);
  const baseline = preceding.length ? preceding.reduce((sum,i)=>sum+i.daily,0)/preceding.length : null;
  const change = baseline && baseline > 0 ? ((last.daily / baseline)-1)*100 : null;
  return {last, baseline, change, alert:preceding.length >= 3 && change > 40};
}
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

