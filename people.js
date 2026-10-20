/** Local UI helpers. PostgreSQL RPC authorization is the security boundary. */
export function canInviteRole(isManager, isOwner, role){
  return Boolean(isManager) && (role==='zelador'||(role==='sindica'&&Boolean(isOwner)));
}
export function canRemoveMember(isManager, isOwner, person){
  return Boolean(isManager)&&Boolean(person)&&!person.owner&&(Boolean(isOwner)||person.role==='zelador');
}
export function inviteStatus(invite,now=Date.now()){
  if(invite.revoked)return 'revoked';
  if(invite.used)return 'used';
  return new Date(invite.expires_at).getTime()>now?'pending':'expired';
}
export function memberRoleLabel(role){
  return role==='sindica'?'Síndico(a)':role==='zelador'?'Zelador(a)':'Outro';
}
export function acceptedRoleIsScoped(accountProfile, membershipRole){
  return ['sindico','zelador'].includes(accountProfile)&&['sindica','zelador'].includes(membershipRole);
}
