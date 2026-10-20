import test from 'node:test';
import assert from 'node:assert/strict';
import {tourSteps} from '../tour.js';
test('guided tour is defined for real and demo profiles',()=>{
 for(const mode of ['manager','worker','support','support-onboard','demo-admin','demo-manager','demo-worker']){
  const steps=tourSteps(mode);assert.ok(steps.length>0,mode);
  for(const step of steps){assert.ok(step.selector);assert.ok(step.title);assert.ok(step.body);}
 }
});
test('tour for worker does not require manager settings',()=>{
 assert.ok(tourSteps('worker').some(s=>s.selector==='#save-reading'));
 assert.ok(!tourSteps('worker').some(s=>s.selector==='#meter-limit-form'));
});
test('manager tour introduces threshold setting',()=>{
 assert.ok(tourSteps('manager').some(s=>s.selector==='#meter-limit-form'));
});
