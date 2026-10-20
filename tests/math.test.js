import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWholeMeter, parseDecimalMeter, readValue, diffDays, buildIntervals, analyzeLatest, formatM3} from '../math.js';
test('milhar brasileiro e inteiro sem pontos são equivalentes', () => {
  assert.equal(parseWholeMeter('4.064'), 4064);
  assert.equal(parseWholeMeter('4064'), 4064);
  assert.throws(()=>parseWholeMeter('4,064'));
});
test('visor separado: parte inteira e três casas decimais', () => {
  assert.equal(parseDecimalMeter('959'), 959);
  assert.equal(parseDecimalMeter('9'), 900);
  assert.equal(readValue('4.064','959'), 4064959);
  assert.equal(readValue('3.981','000'), 3981000);
  assert.equal(formatM3(4064959), '4.064,959');
});
test('período 10 a 17/10: 83 ou 83,959 conforme precisão', ()=>{
  const intervals = buildIntervals([
    {measured_on:'2026-10-17', value_m3:'4064.959'},
    {measured_on:'2026-10-10', value_m3:'3981.000'}
  ]);
  assert.equal(intervals.at(-1).consumed, 83959);
  assert.equal(intervals.at(-1).days, 7);
  assert.equal(diffDays('2026-10-10','2026-10-17'),7);
});
test('não emite alerta com só uma semana de dados', ()=>{
  assert.equal(analyzeLatest(buildIntervals([
    {measured_on:'2026-10-10', value_m3:100},
    {measured_on:'2026-10-17', value_m3:180}
  ])).alert, false);
});


