import test from 'node:test';
import assert from 'node:assert/strict';
import {getWaterInsights} from '../analysis.js';
const readings=[
 {id:'a',measured_on:'2026-10-10',value_m3:'3981.000'},
 {id:'b',measured_on:'2026-10-17',value_m3:'4064.959'},
];
test('medição com decimais do visor',()=>{
 const r=getWaterInsights(readings,'2026-10-17');
 assert.equal(r.last.consumed,83959);
 assert.equal(r.totals.monthConsumption,83959);
 assert.match(r.monthlyText,/não representa necessariamente o mês inteiro/);
});
test('análise sem intervalo não inventa consumo',()=>{
 const r=getWaterInsights(readings.slice(0,1),'2026-10-10');
 assert.equal(r.last,null);assert.equal(r.totals.recentConsumption,0);
});
test('não inclui períodos futuros ao gerar relatórios antigos',()=>{
 const extra=[...readings,{id:'c',measured_on:'2026-10-24',value_m3:'4140.000'}];
 const r=getWaterInsights(extra,'2026-10-17');
 assert.equal(r.last.measured_on,'2026-10-17');
 assert.equal(r.totals.recentConsumption,83959);
});
