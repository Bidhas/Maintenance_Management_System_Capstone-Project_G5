/** Where each role lands after signing in (and where a wrong-role visitor gets bounced to). */
export function dashboardPath(user) {
  if (!user) return '/login';
  if (user.role === 'requester') return '/requests/new';
  if (user.role === 'technician') return '/tech/work-orders';
  return '/admin/overview';
}
