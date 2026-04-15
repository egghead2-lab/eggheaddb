const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const OAuthClient = require('intuit-oauth');

const oauthClient = new OAuthClient({
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  environment: process.env.QB_ENVIRONMENT || 'sandbox',
  redirectUri: process.env.QB_REDIRECT_URI,
});

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

// ═══════════════════════════════════════════════════════════════════
// INVOICE CREATION
// ═══════════════════════════════════════════════════════════════════

// POST /api/quickbooks/create-invoice — push invoice to QB
router.post('/create-invoice', authenticate, async (req, res, next) => {
  try {
    const { customer_id, customer_name, line_items, memo, due_date, program_ids } = req.body;

    if (!customer_id || !line_items?.length) {
      return res.status(400).json({ success: false, error: 'Customer and line items required' });
    }

    // Build QB invoice object
    const invoice = {
      CustomerRef: { value: customer_id, name: customer_name },
      DueDate: due_date || undefined,
      PrivateNote: memo || undefined,
      Line: line_items.map(item => ({
        Amount: item.amount,
        DetailType: 'SalesItemLineDetail',
        Description: item.description,
        SalesItemLineDetail: {
          Qty: item.qty || 1,
          UnitPrice: item.rate,
          ...(item.item_ref ? { ItemRef: { value: item.item_ref } } : {}),
        },
      })),
    };

    const data = await qbRequest('POST', 'invoice', invoice);
    const created = data.Invoice;

    // Update program records with QB invoice info
    if (program_ids?.length && created) {
      for (const pid of program_ids) {
        await pool.query(
          `UPDATE program SET qb_invoice_id = ?, qb_invoice_number = ?, qb_invoice_status = ?, qb_invoice_balance = ?, invoice_date_sent = CURDATE()
           WHERE id = ?`,
          [created.Id, created.DocNumber, 'Sent', parseFloat(created.TotalAmt) || 0, pid]
        );
      }
    }

    res.json({
      success: true,
      invoice: {
        id: created.Id,
        number: created.DocNumber,
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

// POST /api/quickbooks/sync-status — refresh QB status for programs
router.post('/sync-status', authenticate, async (req, res, next) => {
  try {
    const { program_ids } = req.body;

    // Get programs with QB invoice IDs
    const [programs] = await pool.query(
      'SELECT id, qb_invoice_id FROM program WHERE qb_invoice_id IS NOT NULL' +
      (program_ids?.length ? ' AND id IN (?)' : ''),
      program_ids?.length ? [program_ids] : []
    );

    if (programs.length === 0) return res.json({ success: true, synced: 0 });

    let synced = 0;
    for (const prog of programs) {
      try {
        const data = await qbRequest('GET', `invoice/${prog.qb_invoice_id}`);
        const inv = data.Invoice;
        if (inv) {
          const balance = parseFloat(inv.Balance) || 0;
          const total = parseFloat(inv.TotalAmt) || 0;
          let status = 'Sent';
          if (balance === 0 && total > 0) status = 'Paid';
          else if (inv.DueDate && new Date(inv.DueDate) < new Date()) status = 'Overdue';

          await pool.query(
            'UPDATE program SET qb_invoice_status = ?, qb_invoice_balance = ? WHERE id = ?',
            [status, balance, prog.id]
          );
          synced++;
        }
      } catch (e) {
        // Individual invoice fetch failed, skip
      }
    }

    res.json({ success: true, synced });
  } catch (err) { next(err); }
});

module.exports = router;
