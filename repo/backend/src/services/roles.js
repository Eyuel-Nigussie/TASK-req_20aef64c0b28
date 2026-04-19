'use strict';

const ROLES = Object.freeze({
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  CLINIC_MANAGER: 'CLINIC_MANAGER',
  FRONT_DESK: 'FRONT_DESK',
  FINANCE_SPECIALIST: 'FINANCE_SPECIALIST',
  READ_ONLY_AUDITOR: 'READ_ONLY_AUDITOR',
});

const ALL_ROLES = Object.values(ROLES);

const PERMISSIONS = Object.freeze({
  SYSTEM_ADMIN: ['*'],
  CLINIC_MANAGER: [
    'tenant:read',
    'tenant:update',
    'user:create',
    'user:read',
    'user:update',
    'user:deactivate',
    'user:blacklist',
    'user:flag_risky',
    'identity:review',
    'examItem:manage',
    'examItem:read',
    'package:manage',
    'package:read',
    'pricing:manage',
    'order:read',
    'order:create',
    'order:update',
    'order:bulk',
    'invoice:read',
    'invoice:create',
    'invoice:refund',
    'reconciliation:manage',
    'reconciliation:read',
    'report:read',
    'audit:read',
    'search:use',
    'favorite:manage',
  ],
  FRONT_DESK: [
    'package:read',
    'examItem:read',
    'order:create',
    'order:read',
    'invoice:create',
    'invoice:read',
    'search:use',
    'favorite:manage',
    'recommendation:read',
    'identity:submit',
  ],
  FINANCE_SPECIALIST: [
    'invoice:read',
    'invoice:create',
    'invoice:refund',
    'order:read',
    'order:update',
    'reconciliation:manage',
    'reconciliation:read',
    'report:read',
    'examItem:read',
    'package:read',
  ],
  READ_ONLY_AUDITOR: [
    'audit:read',
    'order:read',
    'invoice:read',
    'reconciliation:read',
    'report:read',
    'package:read',
    'examItem:read',
    'user:read',
  ],
});

function permissionsFor(role) {
  return PERMISSIONS[role] || [];
}

function hasPermission(role, permission) {
  const perms = permissionsFor(role);
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

const NAV_BY_ROLE = Object.freeze({
  SYSTEM_ADMIN: [
    'dashboard',
    'tenants',
    'users',
    'identity',
    'audit',
    'reports',
    'reconciliation',
    'packages',
    'examItems',
    'orders',
    'billing',
    'settings',
  ],
  CLINIC_MANAGER: [
    'dashboard',
    'users',
    'identity',
    'audit',
    'reports',
    'reconciliation',
    'packages',
    'examItems',
    'orders',
    'billing',
  ],
  FRONT_DESK: ['dashboard', 'search', 'favorites', 'orders', 'billing'],
  FINANCE_SPECIALIST: ['dashboard', 'reconciliation', 'orders', 'billing', 'reports'],
  READ_ONLY_AUDITOR: ['dashboard', 'audit', 'orders', 'billing', 'reports'],
});

function navFor(role) {
  return NAV_BY_ROLE[role] || [];
}

module.exports = { ROLES, ALL_ROLES, PERMISSIONS, permissionsFor, hasPermission, navFor, NAV_BY_ROLE };
