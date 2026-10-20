// Client-side UI affordances ONLY. Supabase RLS and RPCs are authoritative.
export function mayCreateCondo(profile, explicitlyGranted = false) {
  return profile === 'sindico' || (profile === 'suporte' && explicitlyGranted === true);
}
export function maySubmitHistory(role) {
  return role === 'zelador';
}
export function mayApproveHistory(role) {
  return role === 'sindica';
}
