export type Role =
  | 'SYSTEM_ADMIN'
  | 'CLINIC_MANAGER'
  | 'FRONT_DESK'
  | 'FINANCE_SPECIALIST'
  | 'READ_ONLY_AUDITOR';

export interface User {
  id: string;
  username: string;
  role: Role;
  tenantId: string | null;
  displayName: string;
  realNameVerified?: boolean;
}

export interface Session {
  token: string;
  user: User;
  nav: string[];
  permissions: string[];
}

export interface ExamItem {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  description?: string;
  unit?: string | null;
  referenceRange?: { min?: number; max?: number } | null;
  contraindications?: string[];
  collectionMethod?: string | null;
  applicability?: { minAge?: number | null; maxAge?: number | null; gender?: string };
  active: boolean;
}

export interface PackageVersion {
  id: string;
  packageId: string;
  version: number;
  composition: Array<{ examItemId: string; required: boolean }>;
  price: number;
  deposit: number;
  validityDays: number;
  effectiveFrom: string;
}

export interface Package {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  category: string;
  description?: string;
  currentVersion: number;
  active: boolean;
  keywords?: string[];
  applicability?: { minAge?: number | null; maxAge?: number | null; gender?: string };
  current?: PackageVersion;
  distanceMiles?: number | null;
}

export interface Order {
  id: string;
  tenantId: string;
  patientId: string;
  patient: { id?: string; name: string; age?: number; gender?: string };
  packageId: string;
  packageVersion: number;
  snapshot: {
    name: string;
    code: string;
    category: string;
    composition: Array<{ examItemId: string; required: boolean }>;
    price: number;
    deposit: number;
    validityDays: number;
  };
  status: string;
  tags: string[];
  dueDate?: string | null;
  category: string;
  invoiceId?: string | null;
  createdAt: string;
  purchasedAt?: string | null;
  fulfilledAt?: string | null;
}

export interface Invoice {
  id: string;
  tenantId: string;
  orderId: string;
  patientId: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  refundedAt?: string | null;
  lines: Array<{ description: string; quantity: number; unitPrice: number; subtotal: number }>;
}

export interface ReconciliationCase {
  id: string;
  tenantId: string;
  fileId: string;
  transactionId: string;
  invoiceId: string | null;
  status: string;
  score: number;
  disposition: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
}

export interface KpiSummary {
  orders: number;
  paid: number;
  gmv: number;
  aov: number;
  repeatPurchaseRate: number;
  avgFulfillmentHours: number;
  statusBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
}

export interface Recommendation {
  packageId: string;
  score: number;
  reasons: string[];
  package: Package;
}
