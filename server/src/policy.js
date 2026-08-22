const transitions = {
  OPEN: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["VOLUNTEER_ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  VOLUNTEER_ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: [],
  CANCELLED: [],
};
export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}
export function canManageRequest(user, request) {
  return (
    user.role === "ADMIN" ||
    request.requester_id === user.id ||
    request.accepted_by === user.id ||
    request.assigned_volunteer_id === user.id
  );
}
export function canManageResources(role) {
  return role === "ORGANIZATION" || role === "ADMIN";
}
export function publicRequest(request) {
  const safe = { ...request };
  delete safe.protected_location;
  delete safe.protected_contact;
  return safe;
}
