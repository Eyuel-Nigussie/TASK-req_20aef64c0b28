'use strict';

/**
 * Seeds one demo tenant + one account per role on first boot (no-op if data already exists).
 * Passwords are printed to stdout so operators can log in immediately.
 * Change all passwords via Settings after first login.
 */

const tenants = require('./services/tenants');
const users = require('./services/users');
const repo = require('./repositories');
const { ROLES } = require('./services/roles');

const DEMO_TENANT = { name: 'Demo Clinic', code: 'DEMO' };

const SEED_ACCOUNTS = [
  { role: ROLES.SYSTEM_ADMIN,       username: 'admin',     password: 'Admin!ClinicOps1',    displayName: 'System Admin',      tenantScoped: false },
  { role: ROLES.CLINIC_MANAGER,     username: 'manager',   password: 'Manager!ClinicOps1',  displayName: 'Clinic Manager',    tenantScoped: true  },
  { role: ROLES.FRONT_DESK,         username: 'frontdesk', password: 'FrontDesk!Clinic1',   displayName: 'Front Desk',        tenantScoped: true  },
  { role: ROLES.FINANCE_SPECIALIST, username: 'finance',   password: 'Finance!ClinicOps1',  displayName: 'Finance Specialist',tenantScoped: true  },
  { role: ROLES.READ_ONLY_AUDITOR,  username: 'auditor',   password: 'Auditor!ClinicOps1',  displayName: 'Auditor',           tenantScoped: true  },
];

async function seed() {
  // Skip if any users already exist
  const existing = await repo.users.find({}, { limit: 1 });
  if (existing.items.length > 0) return;

  // eslint-disable-next-line no-console
  console.log('[ClinicOps] No users found — seeding demo accounts...');

  const tenant = await tenants.createTenant(DEMO_TENANT);

  // eslint-disable-next-line no-console
  console.log('\n  ┌─────────────────────────────────────────────────────────┐');
  // eslint-disable-next-line no-console
  console.log('  │            CLINICOPS DEMO ACCOUNTS                      │');
  // eslint-disable-next-line no-console
  console.log('  ├──────────────┬──────────────────────┬───────────────────┤');
  // eslint-disable-next-line no-console
  console.log('  │ Username     │ Password             │ Role              │');
  // eslint-disable-next-line no-console
  console.log('  ├──────────────┼──────────────────────┼───────────────────┤');

  for (const acct of SEED_ACCOUNTS) {
    await users.createUser({
      tenantId: acct.tenantScoped ? tenant.id : null,
      username: acct.username,
      password: acct.password,
      role: acct.role,
      displayName: acct.displayName,
    });
    // eslint-disable-next-line no-console
    console.log(`  │ ${acct.username.padEnd(12)} │ ${acct.password.padEnd(20)} │ ${acct.role.padEnd(17)} │`);
  }

  // eslint-disable-next-line no-console
  console.log('  └──────────────┴──────────────────────┴───────────────────┘');
  // eslint-disable-next-line no-console
  console.log('  Change all passwords after first login (Settings page).\n');
}

module.exports = { seed };
