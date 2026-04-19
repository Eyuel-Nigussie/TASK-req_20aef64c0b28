'use strict';

const config = require('../config');
const repo = require('../repositories');
const audit = require('./audit');
const { bad, notFound, conflict, forbidden } = require('../utils/errors');
const { hashFingerprint } = require('../utils/encryption');
const { parseCsv } = require('../utils/csv');
const xlsx = require('xlsx');
const { amountsMatch, toCents, round2 } = require('../utils/money');
const { memoSimilarity } = require('../utils/similarity');

const DAY_MS = 24 * 60 * 60 * 1000;

function similarityThreshold() {
  const raw = Number(config.reconciliationSimilarityThreshold);
  if (!Number.isFinite(raw) || raw < 0) return 0.4;
  return raw > 1 ? 1 : raw;
}

function normalizeRow(row) {
  const amount = row.amount || row.Amount || row.AMOUNT;
  const date = row.date || row.Date || row.DATE || row.txn_date;
  const memo = row.memo || row.Memo || row.description || row.Description || '';
  const counterparty = row.counterparty || row.Counterparty || row.payer || row.Payer || '';
  const reference = row.reference || row.Reference || row.ref || '';
  return {
    amount: Number(amount),
    date: date ? new Date(date).toISOString() : null,
    memo,
    counterparty,
    reference,
    raw: row,
  };
}

async function ingestFile(tenantId, { filename, content, encoding, source = 'CSV' }, actor = null) {
  if (!tenantId) throw bad('tenantId is required', 'VALIDATION');
  if (!filename || !content) throw bad('filename and content are required', 'VALIDATION');
  let bytes;
  if (Buffer.isBuffer(content)) {
    bytes = content;
  } else if (encoding === 'base64') {
    bytes = Buffer.from(String(content), 'base64');
  } else {
    bytes = Buffer.from(String(content), 'utf8');
  }
  const fingerprint = hashFingerprint(bytes);
  const existing = await repo.reconciliationFiles.findOne({ tenantId, fingerprint });
  if (existing) throw conflict('file already imported', 'DUPLICATE_FILE', { fileId: existing.id });

  const MAX_ROWS = 50_000;
  let rawRows;
  if (filename.toLowerCase().endsWith('.xlsx')) {
    const wb = xlsx.read(bytes, { type: 'buffer', sheetRows: MAX_ROWS + 1 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    if (rawRows.length > MAX_ROWS) throw bad(`file exceeds ${MAX_ROWS} row limit`, 'FILE_TOO_LARGE');
  } else {
    const parsed = parseCsv(bytes.toString('utf8'));
    rawRows = parsed.rows;
  }
  const transactions = rawRows.map(normalizeRow).filter((r) => Number.isFinite(r.amount));

  const fileRec = await repo.reconciliationFiles.insert({
    tenantId,
    filename,
    fingerprint,
    source,
    rowCount: transactions.length,
    importedBy: actor && actor.id,
  });

  const txIds = [];
  for (const t of transactions) {
    const tx = await repo.transactions.insert({
      tenantId,
      fileId: fileRec.id,
      amount: round2(t.amount),
      amountCents: toCents(t.amount),
      date: t.date,
      memo: t.memo,
      counterparty: t.counterparty,
      reference: t.reference,
      raw: t.raw,
      matched: false,
      matchedInvoiceId: null,
      caseStatus: null,
    });
    txIds.push(tx.id);
  }

  const { cases, summary } = await autoMatch(tenantId, fileRec.id, actor);

  await audit.record({
    actorId: actor && actor.id,
    tenantId,
    action: 'reconciliation.import',
    resource: 'reconciliationFile',
    resourceId: fileRec.id,
    details: { filename, rows: transactions.length, fingerprint },
  });
  return { file: fileRec, transactions: txIds, cases, summary };
}

function timeWithinWindow(txDate, invDate) {
  if (!txDate || !invDate) return true;
  const diff = Math.abs(new Date(txDate).getTime() - new Date(invDate).getTime());
  return diff <= config.reconciliationTimeWindowDays * DAY_MS;
}

async function autoMatch(tenantId, fileId, actor = null) {
  const { items: txns } = await repo.transactions.find({ tenantId, fileId, matched: false });
  const { items: invoices } = await repo.invoices.find(
    { tenantId, status: { $in: ['OPEN', 'PAID'] } }
  );
  const cases = [];
  let matched = 0;

  // Detect duplicate transactions (same amount + date) — process them separately
  const duplicateIds = new Set();
  const seenAmounts = new Map();
  for (const t of txns) {
    const key = `${t.amountCents}:${t.date && t.date.slice(0, 10)}`;
    if (seenAmounts.has(key)) {
      duplicateIds.add(t.id);
    } else {
      seenAmounts.set(key, t.id);
    }
  }

  const threshold = similarityThreshold();

  for (const t of txns) {
    // Skip duplicates — they get their own SUSPECTED_DUPLICATE case below
    if (duplicateIds.has(t.id)) continue;

    const candidates = invoices.filter((inv) => {
      if (!amountsMatch(inv.total, t.amount, config.reconciliationAmountTolerance)) return false;
      if (!timeWithinWindow(t.date, inv.createdAt)) return false;
      return true;
    });
    let best = null;
    let bestScore = -1;
    for (const inv of candidates) {
      const counterpartySim = memoSimilarity(t.counterparty, inv.patientName || inv.patientId || '');
      const memoSim = memoSimilarity(t.memo, inv.packageName || t.reference || '');
      const score = counterpartySim * 0.4 + memoSim * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = inv;
      }
    }

    if (best && bestScore >= threshold) {
      const already = await repo.reconciliationCases.findOne({ invoiceId: best.id, status: 'MATCHED' });
      const status = already ? 'SUSPECTED_DUPLICATE' : 'MATCHED';
      const disposition = status === 'MATCHED' ? 'auto' : null;
      const kase = await repo.reconciliationCases.insert({
        tenantId,
        fileId,
        transactionId: t.id,
        invoiceId: best.id,
        status,
        score: Number(bestScore.toFixed(4)),
        disposition,
        reviewedBy: null,
        reviewedAt: null,
        note: null,
      });
      cases.push(kase);
      if (status === 'MATCHED') {
        await repo.transactions.updateById(t.id, {
          matched: true,
          matchedInvoiceId: best.id,
          caseStatus: 'MATCHED',
        });
        matched += 1;
      } else {
        await repo.transactions.updateById(t.id, { caseStatus: 'SUSPECTED_DUPLICATE' });
      }
    } else if (candidates.length > 0 && best) {
      // Amount+time matched but similarity below threshold — needs human review
      const kase = await repo.reconciliationCases.insert({
        tenantId,
        fileId,
        transactionId: t.id,
        invoiceId: best.id,
        status: 'VARIANCE',
        score: Number(bestScore.toFixed(4)),
        disposition: null,
        reviewedBy: null,
        reviewedAt: null,
        note: 'amount and date match but similarity score below threshold',
      });
      cases.push(kase);
      await repo.transactions.updateById(t.id, { caseStatus: 'VARIANCE' });
    } else {
      const kase = await repo.reconciliationCases.insert({
        tenantId,
        fileId,
        transactionId: t.id,
        invoiceId: null,
        status: 'UNMATCHED',
        score: 0,
        disposition: null,
        reviewedBy: null,
        reviewedAt: null,
        note: null,
      });
      cases.push(kase);
      await repo.transactions.updateById(t.id, { caseStatus: 'UNMATCHED' });
    }
  }

  // Create one SUSPECTED_DUPLICATE case per duplicate transaction
  for (const t of txns) {
    if (!duplicateIds.has(t.id)) continue;
    const dupOfId = seenAmounts.get(`${t.amountCents}:${t.date && t.date.slice(0, 10)}`);
    const kase = await repo.reconciliationCases.insert({
      tenantId,
      fileId,
      transactionId: t.id,
      invoiceId: null,
      status: 'SUSPECTED_DUPLICATE',
      score: 0,
      disposition: null,
      dupOf: dupOfId,
      reviewedBy: null,
      reviewedAt: null,
      note: 'same amount/date as another transaction in this file',
    });
    cases.push(kase);
    await repo.transactions.updateById(t.id, { caseStatus: 'SUSPECTED_DUPLICATE' });
  }

  const summary = {
    total: txns.length,
    matched,
    unmatched: cases.filter((c) => c.status === 'UNMATCHED').length,
    duplicates: cases.filter((c) => c.status === 'SUSPECTED_DUPLICATE').length,
    variance: cases.filter((c) => c.status === 'VARIANCE').length,
  };
  return { cases, summary };
}

async function dispose(tenantId, caseId, { disposition, note, invoiceIds, mergeWithCaseId }, reviewer) {
  const valid = ['CONFIRM_MATCH', 'SPLIT', 'MERGE', 'WRITE_OFF'];
  if (!valid.includes(disposition)) throw bad(`disposition must be one of ${valid.join(',')}`, 'VALIDATION');
  if (!reviewer || !reviewer.id) throw forbidden('reviewer required', 'REVIEWER_REQUIRED');

  if (disposition === 'SPLIT') {
    if (!Array.isArray(invoiceIds) || invoiceIds.length < 2) {
      throw bad('SPLIT requires invoiceIds array with at least 2 invoice IDs', 'VALIDATION');
    }
  }
  if (disposition === 'MERGE') {
    if (!mergeWithCaseId) throw bad('MERGE requires mergeWithCaseId', 'VALIDATION');
  }

  const kase = await repo.reconciliationCases.findById(caseId);
  if (!kase || kase.tenantId !== tenantId) throw notFound('case not found', 'CASE_NOT_FOUND');
  if (kase.disposition && kase.disposition !== 'auto') throw conflict('already disposed', 'ALREADY_DISPOSED');

  const now = new Date().toISOString();

  if (disposition === 'SPLIT') {
    const children = [];
    for (const invId of invoiceIds) {
      const child = await repo.reconciliationCases.insert({
        tenantId,
        fileId: kase.fileId,
        transactionId: kase.transactionId,
        invoiceId: invId,
        status: 'MATCHED',
        score: kase.score,
        disposition: 'CONFIRM_MATCH',
        reviewedBy: reviewer.id,
        reviewedAt: now,
        note: note || null,
        parentCaseId: caseId,
      });
      children.push(child.id);
    }
    const updated = await repo.reconciliationCases.updateById(caseId, {
      disposition: 'SPLIT',
      note: note || null,
      reviewedBy: reviewer.id,
      reviewedAt: now,
      status: 'MATCHED',
      splitChildIds: children,
    });
    await audit.record({
      actorId: reviewer.id,
      tenantId,
      action: 'reconciliation.dispose',
      resource: 'reconciliationCase',
      resourceId: caseId,
      details: { disposition: 'SPLIT', childCount: children.length, note: note || null },
    });
    return updated;
  }

  if (disposition === 'MERGE') {
    const other = await repo.reconciliationCases.findById(mergeWithCaseId);
    if (!other || other.tenantId !== tenantId) throw notFound('merge target case not found', 'CASE_NOT_FOUND');
    const updated = await repo.reconciliationCases.updateById(caseId, {
      disposition: 'MERGE',
      note: note || null,
      reviewedBy: reviewer.id,
      reviewedAt: now,
      status: 'MATCHED',
      mergedWithCaseId: mergeWithCaseId,
    });
    await repo.reconciliationCases.updateById(mergeWithCaseId, {
      disposition: 'MERGE',
      note: note || null,
      reviewedBy: reviewer.id,
      reviewedAt: now,
      status: 'MATCHED',
      mergedWithCaseId: caseId,
    });
    await audit.record({
      actorId: reviewer.id,
      tenantId,
      action: 'reconciliation.dispose',
      resource: 'reconciliationCase',
      resourceId: caseId,
      details: { disposition: 'MERGE', mergeWithCaseId, note: note || null },
    });
    return updated;
  }

  const updated = await repo.reconciliationCases.updateById(caseId, {
    disposition,
    note: note || null,
    reviewedBy: reviewer.id,
    reviewedAt: now,
    status:
      disposition === 'CONFIRM_MATCH'
        ? 'MATCHED'
        : disposition === 'WRITE_OFF'
        ? 'WRITTEN_OFF'
        : kase.status,
  });
  if (disposition === 'CONFIRM_MATCH' && kase.invoiceId && kase.transactionId) {
    await repo.transactions.updateById(kase.transactionId, {
      matched: true,
      matchedInvoiceId: kase.invoiceId,
      caseStatus: 'MATCHED',
    });
  }
  await audit.record({
    actorId: reviewer.id,
    tenantId,
    action: 'reconciliation.dispose',
    resource: 'reconciliationCase',
    resourceId: caseId,
    details: { disposition, note: note || null },
  });
  return updated;
}

async function listCases(tenantId, opts = {}) {
  const query = { tenantId };
  if (opts.status) query.status = opts.status;
  if (opts.fileId) query.fileId = opts.fileId;
  return repo.reconciliationCases.find(query, { sort: { createdAt: -1 }, ...opts });
}

async function listFiles(tenantId) {
  return repo.reconciliationFiles.find({ tenantId }, { sort: { createdAt: -1 } });
}

module.exports = {
  ingestFile,
  autoMatch,
  dispose,
  listCases,
  listFiles,
  normalizeRow,
  timeWithinWindow,
};
