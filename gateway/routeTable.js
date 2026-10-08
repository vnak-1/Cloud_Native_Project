module.exports = [
  { method: 'POST',   path: '/register/userregister', roles: 'public',          service: 'registration' },
  { method: 'POST',   path: '/auth/login',            roles: 'public',          service: 'login' },
  { method: 'POST',   path: '/register/admin',        roles: ['admin'],         service: 'registration' },

  { method: 'POST',   path: '/equipment',             roles: ['admin'],         service: 'equipment' },
  { method: 'GET',    path: '/equipment',             roles: ['admin', 'user'], service: 'equipment' },
  { method: 'GET',    path: '/equipment/:id',         roles: ['admin', 'user'], service: 'equipment' },
  { method: 'PUT',    path: '/equipment/:id',         roles: ['admin'],         service: 'equipment' },
  { method: 'DELETE', path: '/equipment/:id',         roles: ['admin'],         service: 'equipment' },

  { method: 'POST',   path: '/loans',                 roles: ['user'],          service: 'loan' },
  { method: 'GET',    path: '/loans/me',              roles: ['user'],          service: 'loan' },
  { method: 'GET',    path: '/loans',                 roles: ['admin'],         service: 'loan' },
  { method: 'GET',    path: '/loans/overdue',         roles: ['admin'],         service: 'loan' },
  { method: 'PATCH',  path: '/loans/:id/approve',     roles: ['admin'],         service: 'loan' },
  { method: 'PATCH',  path: '/loans/:id/reject',      roles: ['admin'],         service: 'loan' },
  { method: 'PATCH',  path: '/loans/:id/cancel',      roles: ['user'],          service: 'loan' },
  { method: 'PATCH',  path: '/loans/:id/return',      roles: ['admin'],         service: 'loan' },
];
