import test from 'node:test';
import assert from 'node:assert/strict';
import {mayCreateCondo,maySubmitHistory,mayApproveHistory} from '../permissions.js';

test('only manager and explicitly granted platform support can create condominiums', () => {
  assert.equal(mayCreateCondo('sindico', false), true);
  assert.equal(mayCreateCondo('sindico', true), true);
  assert.equal(mayCreateCondo('suporte', false), false);
  assert.equal(mayCreateCondo('suporte', true), true);
  assert.equal(mayCreateCondo('zelador', true), false);
  assert.equal(mayCreateCondo(null, true), false);
});
test('workers can submit historical requests but cannot approve', () => {
  assert.equal(maySubmitHistory('zelador'), true);
  assert.equal(mayApproveHistory('zelador'), false);
  assert.equal(maySubmitHistory('suporte'), false);
});
test('condominium manager can approve submissions', () => {
  assert.equal(mayApproveHistory('sindica'), true);
  assert.equal(maySubmitHistory('sindica'), false);
  assert.equal(mayApproveHistory('suporte'), false);
});
