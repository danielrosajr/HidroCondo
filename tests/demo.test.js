import test from 'node:test';
import assert from 'node:assert/strict';
import {demoLink,demoStatus,demoWarning,prepareDemoHistory,demoSummary} from '../demo.js';

test('link for invite is role-neutral and token-specific',()=>{
 const text=demoLink('https://example.org/HidroCondo/','ab'.repeat(32));
 assert.equal(text,'https://example.org/HidroCondo/?demo='+'ab'.repeat(32));
});
test('expired, active and revoked demonstrations are differentiated',()=>{
 const now=Date.parse('2026-10-20T12:00:00Z');
 assert.equal(demoStatus('2026-10-21T12:00:00Z',false,now),'Ativa');
 assert.equal(demoStatus('2026-10-19T12:00:00Z',false,now),'Expirada');
 assert.equal(demoStatus('2026-10-21T12:00:00Z',true,now),'Encerrada');
});
test('warning emphasizes fictional/disposable data and that photos are not stored',()=>{
 assert.match(demoWarning(),/FICTÍCIOS/i);
 assert.match(demoWarning(),/descartáveis/i);
 assert.match(demoWarning(),/fotos não são armazenadas/i);
});
test('historical entries convert to canonical decimal for RPC',()=>{
 const result=prepareDemoHistory('10/10/2025;3981,000\n17/10/2025;4064,959',[],'2026-10-20');
 assert.equal(result.entries.length,2);
 assert.deepEqual(result.entries[1],{measured_on:'2025-10-17',value_m3:4064.959});
});
test('historical demo input rejects backwards meter readings',()=>{
 assert.throws(()=>prepareDemoHistory('10/10/2025;4064,959\n17/10/2025;3981,000',[],'2026-10-20'),/decrescente/i);
});
test('historical demo input rejects import conflicting with existing readings',()=>{
 assert.throws(()=>prepareDemoHistory('10/10/2025;3981,000',[{measured_on:'2025-10-10',value_m3:3981}],'2026-10-20'),/Já existe leitura/i);
});
test('historical demo input respects bounded batch size',()=>{
 const data=Array.from({length:31},(_,n)=>`${String(n+1).padStart(2,'0')}/01/2025;${4000+n},000`).join('\n');
 assert.throws(()=>prepareDemoHistory(data,[],'2026-10-20'),/30 leituras/i);
});
test('last interval consumption is correct',()=>{
 const result=demoSummary([{id:'1',measured_on:'2026-10-10',value_m3:3981},{id:'2',measured_on:'2026-10-17',value_m3:4064.959}]);
 assert.equal(result.consumption,83959);
});
