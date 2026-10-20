import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWeeklyLimit,evaluateWeeklyLimit,weeklyLimitMessage} from '../limits.js';
const sample=(days,milli)=>({measured_on:'2026-10-17',previous:{measured_on:'2026-10-10'},days,consumed:milli});
test('weekly limit accepts Brazilian decimal or empty disable',()=>{
 assert.equal(parseWeeklyLimit('80'),80);
 assert.equal(parseWeeklyLimit('80,500'),80.5);
 assert.equal(parseWeeklyLimit(''),null);
 assert.throws(()=>parseWeeklyLimit('-2'),/Informe/);
 assert.throws(()=>parseWeeklyLimit('99999999'),/Informe/);
 assert.throws(()=>parseWeeklyLimit('0'),/entre/);
});
test('83 cubic meters in exactly seven days is above 80 per 7 days',()=>{
 const r=evaluateWeeklyLimit(sample(7,83000),80);
 assert.equal(r.status,'above');assert.equal(r.allowedM3,80);assert.equal(r.weeklyEquivalentM3,83);
 assert.match(weeklyLimitMessage(r),/Acima/);
});
test('83 cubic meters in sixteen days is within 80 per week',()=>{
 const r=evaluateWeeklyLimit(sample(16,83000),80);
 assert.equal(r.status,'within');assert.ok(r.allowedM3>180);assert.ok(r.weeklyEquivalentM3<40);
});
test('exactly 80 m³ in 7 days is within, not above',()=>assert.equal(evaluateWeeklyLimit(sample(7,80000),80).status,'within'));
test('references are not verdicts without enough data',()=>{
 assert.equal(evaluateWeeklyLimit(null,80).status,'insufficient');
 assert.equal(evaluateWeeklyLimit(sample(0,0),80).status,'insufficient');
 assert.equal(evaluateWeeklyLimit(sample(7,84000),null).status,'unset');
});
test('user copy states limitation and labels demo figures fictional',()=>{
 const s=weeklyLimitMessage(evaluateWeeklyLimit(sample(7,83000),80),{fictional:true});
 assert.match(s,/FICTÍCIOS/i);assert.match(s,/não confirma vazamentos/i);
});
