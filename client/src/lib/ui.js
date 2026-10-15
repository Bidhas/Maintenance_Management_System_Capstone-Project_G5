/** Small shared helpers for the workspace look (colour classes come from styles/cm.css). */
export const URGENCY_CLASS = { High: 'rd', Medium: 'am', Low: 'gr2' };
export const STATUS_CLASS = { Pending: 'am', Assigned: 'vi', 'In Progress': 'cy', Completed: 'gr2', Declined: 'rd' };
export const STATUSES = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Declined'];
export const ROLE_LABEL = { requester: (u) => u.account_type || 'Requester', technician: (u) => (u.tier === 'Volunteer' ? 'Volunteer Technician' : 'Main Technician'), admin: (u) => u.designation || 'Admin' };
export const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
