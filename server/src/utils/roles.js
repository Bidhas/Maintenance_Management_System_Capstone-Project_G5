// The ER design has three separate account entities. This map is the only place their
// table / primary-key names are used dynamically (fixed strings, never user input).
const ROLES = {
  requester: { table: 'requester', idCol: 'user_id' },
  technician: { table: 'technician', idCol: 'tech_id' },
  admin: { table: 'admin', idCol: 'admin_id' },
};

const isRole = (r) => Object.prototype.hasOwnProperty.call(ROLES, r);

module.exports = { ROLES, isRole };
