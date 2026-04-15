const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');

let OAuthClient, oauthClient;
try {
  OAuthClient = require('intuit-oauth');
  if (process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET) {
    oauthClient = new OAuthClient({
      clientId: process.env.QB_CLIENT_ID,
      clientSecret: process.env.QB_CLIENT_SECRET,
      environment: process.env.QB_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QB_REDIRECT_URI,
    });
    console.log('[QB] QuickBooks OAuth initialized');
  } else {
    console.warn('[QB] QB_CLIENT_ID or QB_CLIENT_SECRET not set — QuickBooks disabled');
  }
} catch (e) {
  console.warn('[QB] intuit-oauth not installed — QuickBooks disabled');
}

// Helper: get stored tokens
async function getTokens() {
  const [[row]] = await pool.query('SELECT * FROM qb_token WHERE id = 1');
  return row;
}

// Helper: save tokens
async function saveTokens(tokenData, realmId) {
  const accessToken = tokenData.access_token || tokenData.token?.access_token;
  const refreshToken = tokenData.refresh_token || tokenData.token?.refresh_token;
  const expiresIn = tokenData.expires_in || tokenData.token?.expires_in || 3600;
  const refreshExpiresIn = tokenData.x_refresh_token_expires_in || tokenData.token?.x_refresh_token_expires_in || 8726400;

  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const refreshExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000);

  await pool.query(
    `INSERT INTO qb_token (id, access_token, refresh_token, realm_id, token_type, expires_at, refresh_expires_at)
     VALUES (1, ?, ?, ?, 'bearer', ?, ?)
     ON DUPLICATE KEY UPDATE access_token = ?, refresh_token = ?, realm_id = ?, expires_at = ?, refresh_expires_at = ?`,
    [accessToken, refreshToken, realmId, expiresAt, refreshExpiresAt,
     accessToken, refreshToken, realmId, expiresAt, refreshExpiresAt]
  );
}

// Helper: get a valid access token (refresh if expired)
async function getValidToken() {
  const tokens = await getTokens();
  if (!tokens || !tokens.access_token) throw new Error('QuickBooks not connected');

  // Check if expired (with 5 min buffer)
  if (new Date(tokens.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    // Refresh
    oauthClient.setToken({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'bearer',
      expires_in: 0,
      x_refresh_token_expires_in: 0,
    });
    const authResponse = await oauthClient.refresh();
    await saveTokens(authResponse.json || authResponse.token || authResponse, tokens.realm_id);
    const updated = await getTokens();
    return { accessToken: updated.access_token, realmId: updated.realm_id };
  }

  return { accessToken: tokens.access_token, realmId: tokens.realm_id };
}

// Helper: make QB API call
async function qbRequest(method, endpoint, body) {
  const { accessToken, realmId } = await getValidToken();
  const baseUrl = process.env.QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

  const url = `${baseUrl}/v3/company/${realmId}/${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`QB API ${res.status}: ${errBody}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════
// OAUTH FLOW
// ═══════════════════════════════════════════════════════════════════

// GET /api/quickbooks/auth — redirect to QB OAuth
router.get('/auth', authenticate, (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'egghead-qb',
  });
  res.json({ success: true, authUrl: authUri });
});

// GET /api/quickbooks/callback and /prod-callback — OAuth callback
router.get('/callback', async (req, res) => handleCallback(req, res));
router.get('/prod-callback', async (req, res) => handleCallback(req, res));
async function handleCallback(req, res) {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    const tokenData = authResponse.json || authResponse.token || authResponse;
    const realmId = req.query.realmId;

    await saveTokens(tokenData, realmId);

    // Redirect back to the app
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/invoicing/queue?qb=connected`);
  } catch (err) {
    console.error('QB OAuth error:', err);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/invoicing/queue?qb=error`);
  }
}

// GET /api/quickbooks/status — check connection status
router.get('/status', authenticate, async (req, res) => {
  try {
    const tokens = await getTokens();
    if (!tokens || !tokens.access_token) {
      return res.json({ success: true, connected: false });
    }
    const expired = new Date(tokens.refresh_expires_at) < new Date();
    res.json({
      success: true,
      connected: !expired,
      realmId: tokens.realm_id,
      expiresAt: tokens.expires_at,
      environment: process.env.QB_ENVIRONMENT || 'sandbox',
    });
  } catch (err) { res.json({ success: true, connected: false }); }
});

// POST /api/quickbooks/disconnect
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM qb_token WHERE id = 1');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════

// GET /api/quickbooks/customers — list QB customers for mapping
router.get('/customers', authenticate, async (req, res, next) => {
  try {
    const data = await qbRequest('GET', "query?query=SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000");
    const customers = (data.QueryResponse?.Customer || []).map(c => ({
      id: c.Id,
      name: c.DisplayName || c.CompanyName || `${c.GivenName} ${c.FamilyName}`,
      email: c.PrimaryEmailAddr?.Address,
    }));
    res.json({ success: true, data: customers });
  } catch (err) { next(err); }
});

// POST /api/quickbooks/customers — create a new QB customer
router.post('/customers', authenticate, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Customer name required' });

    const customer = {
      DisplayName: name,
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
    };

    const data = await qbRequest('POST', 'customer', customer);
    const created = data.Customer;
    res.json({
      success: true,
      data: { id: created.Id, name: created.DisplayName, email: created.PrimaryEmailAddr?.Address },
    });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════
// INVOICE CREATION
// ═══════════════════════════════════════════════════════════════════

// POST /api/quickbooks/create-invoice — push invoice to QB
router.post('/create-invoice', authenticate, async (req, res, next) => {
  try {
    const { customer_id, customer_name, line_items, memo, due_date, invoice_date,
            program_ids, charge_lab_fees, programs_data } = req.body;

    if (!customer_id || !line_items?.length) {
      return res.status(400).json({ success: false, error: 'Customer and line items required' });
    }

    // Look up QB items by name so we can set the right product/service
    let qbItemCache = {};
    try {
      const itemData = await qbRequest('GET', "query?query=SELECT * FROM Item WHERE Active = true AND Type = 'Service' MAXRESULTS 200");
      (itemData.QueryResponse?.Item || []).forEach(item => {
        qbItemCache[item.FullyQualifiedName] = item.Id;
        qbItemCache[item.Name] = item.Id;
      });
    } catch (e) {
      console.warn('[QB] Could not fetch items:', e.message);
    }

    // Build QB invoice object
    const invoice = {
      CustomerRef: { value: customer_id, name: customer_name },
      DueDate: due_date || undefined,
      PrivateNote: memo || undefined,
      Line: line_items.map(item => {
        const itemName = item.qb_item_name || '';
        const itemId = qbItemCache[itemName] || null;
        return {
          Amount: item.amount,
          DetailType: 'SalesItemLineDetail',
          Description: item.description,
          SalesItemLineDetail: {
            Qty: item.qty || 1,
            UnitPrice: item.rate,
            ...(itemId ? { ItemRef: { value: itemId, name: itemName } } : {}),
          },
        };
      }),
    };

    const data = await qbRequest('POST', 'invoice', invoice);
    const created = data.Invoice;
    const totalAmt = parseFloat(created.TotalAmt) || 0;
    const invDate = invoice_date || new Date().toISOString().split('T')[0];
    const qbInvNum = created.DocNumber || created.Id || `QB-${Date.now()}`;

    console.log('[QB] Invoice created:', JSON.stringify({ Id: created.Id, DocNumber: created.DocNumber, TotalAmt: created.TotalAmt }));

    // Create invoice_record for the tracker
    const [irResult] = await pool.query(
      `INSERT INTO invoice_record (invoice_number, invoice_type, invoice_date, due_date,
        memo, customer_name, total_amount, qb_invoice_number, qb_invoice_id, qb_status, qb_balance, qb_last_synced, created_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
      [qbInvNum, 'Non-Monthly', invDate, due_date || null,
       memo || null, customer_name, totalAmt, qbInvNum, created.Id, 'Unpaid', totalAmt, req.user.userId]
    );
    const invoiceRecordId = irResult.insertId;

    // Update program records with QB invoice info and add to invoice_record_program
    if (program_ids?.length && created) {
      for (let i = 0; i < program_ids.length; i++) {
        const pid = program_ids[i];
        const pData = programs_data?.[i];

        await pool.query(
          `UPDATE program SET qb_invoice_id = ?, qb_invoice_number = ?, qb_invoice_status = ?, qb_invoice_balance = ?, invoice_date_sent = ?
           WHERE id = ?`,
          [created.Id, qbInvNum, 'Sent', totalAmt, invDate, pid]
        );

        // Add to invoice_record_program
        await pool.query(
          `INSERT INTO invoice_record_program (invoice_record_id, program_id, line_amount, include_lab_fee, lab_fee_amount, status)
           VALUES (?,?,?,?,?,?)`,
          [invoiceRecordId, pid, pData?.line_amount || 0, charge_lab_fees ? 1 : 0,
           pData?.lab_fee_total || 0, 'completed']
        );
      }
    }

    res.json({
      success: true,
      invoice: {
        id: created.Id,
        number: qbInvNum,
        total: created.TotalAmt,
        balance: created.Balance,
        status: created.Balance > 0 ? 'Sent' : 'Paid',
      },
    });
  } catch (err) { next(err); }
});

// POST /api/quickbooks/send-invoice/:invoiceId — email invoice via QB
router.post('/send-invoice/:invoiceId', authenticate, async (req, res, next) => {
  try {
    const data = await qbRequest('POST', `invoice/${req.params.invoiceId}/send`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/quickbooks/sync-status — refresh QB status for all QB-linked invoices
router.post('/sync-status', authenticate, async (req, res, next) => {
  try {
    // Sync invoice_record entries that have QB IDs
    const [records] = await pool.query(
      'SELECT id, qb_invoice_id, total_amount, amount_paid, is_paid FROM invoice_record WHERE qb_invoice_id IS NOT NULL AND active = 1'
    );

    if (records.length === 0) return res.json({ success: true, synced: 0 });

    let synced = 0;
    for (const rec of records) {
      try {
        const data = await qbRequest('GET', `invoice/${rec.qb_invoice_id}`);
        const inv = data.Invoice;
        if (!inv) continue;

        const qbBalance = parseFloat(inv.Balance) || 0;
        const qbTotal = parseFloat(inv.TotalAmt) || 0;
        const qbPaid = qbTotal - qbBalance;
        let qbStatus = 'Unpaid';
        if (qbBalance === 0 && qbTotal > 0) qbStatus = 'Paid';
        else if (qbPaid > 0) qbStatus = 'Partial';
        else if (inv.DueDate && new Date(inv.DueDate) < new Date()) qbStatus = 'Overdue';

        // Update invoice_record with QB status (but NOT our is_paid/amount_paid — that's manual)
        await pool.query(
          'UPDATE invoice_record SET qb_status = ?, qb_balance = ?, qb_last_synced = NOW() WHERE id = ?',
          [qbStatus, qbBalance, rec.id]
        );

        // Also update program-level QB fields
        await pool.query(
          'UPDATE program SET qb_invoice_status = ?, qb_invoice_balance = ? WHERE qb_invoice_id = ?',
          [qbStatus, qbBalance, rec.qb_invoice_id]
        );

        synced++;
      } catch (e) {
        // QB returned error — likely deleted/voided/not found
        console.log(`[QB Sync] Error fetching invoice ${rec.qb_invoice_id}:`, e.message?.substring(0, 200));
        // Any error fetching means the invoice is gone or inaccessible
        await pool.query(
          'UPDATE invoice_record SET qb_status = ?, qb_last_synced = NOW() WHERE id = ?',
          ['Deleted', rec.id]
        );
        await pool.query(
          "UPDATE program SET qb_invoice_status = 'Deleted' WHERE qb_invoice_id = ?",
          [rec.qb_invoice_id]
        );
        synced++;
      }
    }

    res.json({ success: true, synced });
  } catch (err) { next(err); }
});

// POST /api/quickbooks/void-invoice — unlink QB invoice and re-queue programs
router.post('/void-invoice', authenticate, async (req, res, next) => {
  try {
    const { invoice_record_id } = req.body;
    if (!invoice_record_id) return res.status(400).json({ success: false, error: 'invoice_record_id required' });

    // Get the record and its programs
    const [[record]] = await pool.query('SELECT * FROM invoice_record WHERE id = ?', [invoice_record_id]);
    if (!record) return res.status(404).json({ success: false, error: 'Invoice record not found' });

    const [programs] = await pool.query(
      'SELECT program_id FROM invoice_record_program WHERE invoice_record_id = ?', [invoice_record_id]
    );

    // Clear QB fields and invoice_date_sent on all linked programs so they re-appear in queue
    for (const p of programs) {
      await pool.query(
        `UPDATE program SET invoice_date_sent = NULL, qb_invoice_id = NULL, qb_invoice_number = NULL,
         qb_invoice_status = NULL, qb_invoice_balance = NULL WHERE id = ?`,
        [p.program_id]
      );
    }

    // Deactivate the invoice record
    await pool.query('UPDATE invoice_record SET active = 0, qb_status = ?, ts_updated = NOW() WHERE id = ?',
      ['Voided', invoice_record_id]);

    res.json({ success: true, programs_unlinked: programs.length });
  } catch (err) { next(err); }
});

module.exports = router;
