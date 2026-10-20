import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoricalDate,parseHistoricalValue,parseHistoricalText,previewHistorical} from '../historical.js';

test('parse Brazilian dates and reject nonexistent days',()=>{
 assert.equal(parseHistoricalDate('10/10/2025'),'2025-10-10');
 assert.throws(()=>parseHistoricalDate('31/02/2025'),/inexistente/);
});
test('convert whole and decimal cubic meters to integer milli units',()=>{
 assert.equal(parseHistoricalValue('4.064,959'),4064959);
 assert.equal(parseHistoricalValue('3981'),3981000);
 assert.throws(()=>parseHistoricalValue('4064.959'),/inválida/);
});
test('accept unsorted historical rows, sort and deduplicate',()=>{
 const rows=parseHistoricalText('17/10/2025;4.064,959\n10/10/2025;3981');
 assert.equal(rows[0].measured_on,'2025-10-10');
 assert.equal(rows[1].milli,4064959);
 assert.throws(()=>parseHistoricalText('10/10/2025;1\n10/10/2025;2'),/repetida/);
});
test('reject decreases against existing later readings',()=>{
 const existing=[{measured_on:'2025-10-17',value_m3:'4064.959'}];
 const rows=parseHistoricalText('10/10/2025;4.090,000');
 assert.throws(()=>previewHistorical(rows,existing,'2026-10-19'),/decrescente/);
});
test('reject earlier than existing preceding readings',()=>{
 const existing=[{measured_on:'2025-10-01',value_m3:'4100.000'}];
 assert.throws(()=>previewHistorical(parseHistoricalText('10/10/2025;3981'),existing,'2026-10-19'),/decrescente/);
});
test('reject future or today and duplicate existing dates',()=>{
 const rows=parseHistoricalText('19/10/2026;10');
 assert.throws(()=>previewHistorical(rows,[],'2026-10-19'),/anterior a hoje/);
 assert.throws(()=>previewHistorical(parseHistoricalText('17/10/2025;1'),[{measured_on:'2025-10-17',value_m3:'1.000'}],'2026-10-19'),/Já existe/);
});
test('calculate difference across imported history',()=>{
 const result=previewHistorical(parseHistoricalText('10/10/2025;3981\n17/10/2025;4.064,959'),[],'2026-10-19');
 assert.equal(result.total,83959);
 assert.equal(result.days,7);
});
