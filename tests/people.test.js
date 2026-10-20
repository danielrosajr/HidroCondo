import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canInviteRole,canRemoveMember,inviteStatus,memberRoleLabel,acceptedRoleIsScoped} from '../people.js';

test('owner can invite managers and workers',()=>{
 assert.equal(canInviteRole(true,true,'sindica'),true);
 assert.equal(canInviteRole(true,true,'zelador'),true);
});
test('delegated manager cannot elevate another manager',()=>{
 assert.equal(canInviteRole(true,false,'sindica'),false);
 assert.equal(canInviteRole(true,false,'zelador'),true);
 assert.equal(canInviteRole(false,false,'zelador'),false);
});
test('invalid support role cannot be invited',()=>{
 assert.equal(canInviteRole(true,true,'suporte'),false);
});
test('owner membership cannot be removed',()=>{
 assert.equal(canRemoveMember(true,true,{role:'sindica',owner:true}),false);
});
test('delegated managers can only remove workers',()=>{
 assert.equal(canRemoveMember(true,false,{role:'sindica',owner:false}),false);
 assert.equal(canRemoveMember(true,false,{role:'zelador',owner:false}),true);
});
test('owner can remove another manager but not themselves',()=>{
 assert.equal(canRemoveMember(true,true,{role:'sindica',owner:false}),true);
 assert.equal(canRemoveMember(true,true,{role:'sindica',owner:true}),false);
});
test('invitation state prioritizes revocation and usage',()=>{
 const expiry='2030-01-01T00:00:00Z', now=Date.parse('2026-10-20T00:00:00Z');
 assert.equal(inviteStatus({expires_at:expiry},now),'pending');
 assert.equal(inviteStatus({expires_at:'2020-01-01T00:00:00Z'},now),'expired');
 assert.equal(inviteStatus({expires_at:expiry,used:true},now),'used');
 assert.equal(inviteStatus({expires_at:expiry,revoked:true},now),'revoked');
});
test('a worker global profile can hold manager membership in another condo',()=>{
 assert.equal(acceptedRoleIsScoped('zelador','sindica'),true);
 assert.equal(acceptedRoleIsScoped('sindico','zelador'),true);
 assert.equal(acceptedRoleIsScoped('suporte','sindica'),false);
});
test('human friendly role labels',()=>{
 assert.equal(memberRoleLabel('sindica'),'Síndico(a)');
 assert.equal(memberRoleLabel('zelador'),'Zelador(a)');
});
