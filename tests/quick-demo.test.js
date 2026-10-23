import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuickDemo,quickSnapshot,quickDemoAction,quickDemoLink} from '../quick-demo.js';
const fixed='2026-10-21';
const set=()=>createQuickDemo(fixed);

test('provides twelve consecutive weekly fictional readings',()=>{
 const s=set();assert.equal(s.readings.length,12);
 assert.equal(s.readings[0].measured_on,'2026-07-29');
 assert.equal(s.readings.at(-1).measured_on,'2026-10-14');
 assert.equal(s.weekly_limit_m3,80);
});
test('snapshot returns a copy and hides no client-specific info',()=>{
 const s=set(),snap=quickSnapshot(s);snap.readings[0].value_m3=999;
 assert.notEqual(s.readings[0].value_m3,999);
 assert.equal(snap.expires_at,null);
});
test('worker records current reading and manager sees it on same sandbox',()=>{
 const s=set();quickDemoAction(s,'hc_demo_add_reading',{p_date:fixed,p_value:4185},'zelador');
 const m=quickDemoAction(s,'hc_demo_snapshot',{},'sindico');
 assert.equal(m.readings.at(-1).value_m3,4185);
 assert.match(m.readings.at(-1).author,/Zelador/);
});
test('worker cannot change consumption limit',()=>{
 const s=set();assert.throws(()=>quickDemoAction(s,'hc_demo_set_limit',{p_weekly_limit:85},'zelador'),/Somente síndico/);
 quickDemoAction(s,'hc_demo_set_limit',{p_weekly_limit:85},'sindico');
 assert.equal(s.weekly_limit_m3,85);
});
test('worker creates pending historical request and manager approves atomically',()=>{
 const s=set();const entries=[{measured_on:'2026-07-15',value_m3:3010},{measured_on:'2026-07-22',value_m3:3100}];
 quickDemoAction(s,'hc_demo_submit_history',{p_entries:entries},'zelador');
 assert.equal(s.readings.length,12);
 assert.equal(s.requests[0].status,'pending');
 assert.throws(()=>quickDemoAction(s,'hc_demo_review_history',{p_request:s.requests[0].id,p_approve:true},'zelador'),/Somente síndico/);
 quickDemoAction(s,'hc_demo_review_history',{p_request:s.requests[0].id,p_approve:true},'sindico');
 assert.equal(s.requests[0].status,'approved');assert.equal(s.readings.length,14);
});
test('invalid historical batch is rejected without modifying state',()=>{
 const s=set();const data=[{measured_on:'2026-07-15',value_m3:4000}];
 assert.throws(()=>quickDemoAction(s,'hc_demo_submit_history',{p_entries:data},'zelador'),/Leitura menor|Leitura/);
 assert.equal(s.requests.length,0);assert.equal(s.readings.length,12);
});
test('duplicate reading on same day and lower current values are rejected',()=>{
 const s=set(),last=s.readings.at(-1);
 assert.throws(()=>quickDemoAction(s,'hc_demo_add_reading',{p_date:last.measured_on,p_value:last.value_m3+2},'zelador'),/Já existe|duplicada/i);
 assert.throws(()=>quickDemoAction(s,'hc_demo_add_reading',{p_date:fixed,p_value:500},'zelador'),/Leitura menor/);
 assert.equal(s.readings.length,12);
});
test('manager can reject request with reason; no official change',()=>{
 const s=set();quickDemoAction(s,'hc_demo_submit_history',{p_entries:[{measured_on:'2026-07-15',value_m3:3000}]},'zelador');
 assert.throws(()=>quickDemoAction(s,'hc_demo_review_history',{p_request:s.requests[0].id,p_approve:false,p_reason:'no'},'sindico'),/5 caracteres/);
 quickDemoAction(s,'hc_demo_review_history',{p_request:s.requests[0].id,p_approve:false,p_reason:'Valor errado'},'sindico');
 assert.equal(s.requests[0].status,'rejected');assert.equal(s.readings.length,12);
});
test('quick demo link has no credential, no auth token',()=>{
 assert.equal(quickDemoLink('https://demo.test/HidroCondo/'),'https://demo.test/HidroCondo/?demo-rapida=1');
});
test('two sandboxes are isolated',()=>{
 const a=set(),b=set();quickDemoAction(a,'hc_demo_set_limit',{p_weekly_limit:150},'sindico');
 assert.equal(b.weekly_limit_m3,80);assert.equal(a.weekly_limit_m3,150);
});

test('application quick-demo bootstraps before requiring a Supabase config and avoids Auth calls on quick path', async()=>{
 const fs=await import('node:fs/promises');
 const app=await fs.readFile(new URL('../app.js',import.meta.url),'utf8');
 const demo=await fs.readFile(new URL('../demo.js',import.meta.url),'utf8');
 assert.match(app,/const quickDemo=new URLSearchParams\(location\.search\)\.has\('demo-rapida'\)/);
 assert.match(app,/state\.db=quickDemo\?null:/);
 assert.match(app,/if\(quickDemo\)\{demoController\.welcome\(\);return;\}/);
 assert.match(demo,/if\(ctx\.quick\)\{\s*ctx\.quickState=createQuickDemo\(\)/);
 assert.match(demo,/if\(ctx\.quick\)return quickDemoAction/);
});
