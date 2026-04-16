const { google } = require('googleapis');

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthedClient(refreshToken) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function extractBody(payload) {
  let text = '';
  let html = '';

  function walk(part) {
    if (part.mimeType === 'text/plain' && part.body?.data && !text) {
      text = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    if (part.mimeType === 'text/html' && part.body?.data && !html) {
      html = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    for (const p of part.parts || []) walk(p);
  }

  if (payload) walk(payload);
  return { text, html };
}

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Search Gmail for threads involving a specific email address.
 */
async function searchThreads(refreshToken, contactEmail, afterDate) {
  const client = getAuthedClient(refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const afterStr = afterDate
    ? `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`
    : null;

  let q = `(from:${contactEmail} OR to:${contactEmail})`;
  if (afterStr) q += ` after:${afterStr}`;

  const searchRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: 100,
  });

  const messageRefs = searchRes.data.messages || [];
  if (!messageRefs.length) return [];

  const threadIds = [...new Set(messageRefs.map(m => m.threadId).filter(Boolean))];

  const threads = [];
  for (const threadId of threadIds) {
    try {
      const msgs = await fetchThreadMessages(refreshToken, threadId);
      if (!msgs.length) continue;
      // Deduplicate
      const seen = new Set();
      const unique = msgs.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
      unique.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
      threads.push({
        threadId,
        subject: unique[0].subject,
        messages: unique,
        lastMessageAt: unique[unique.length - 1].internalDate,
      });
    } catch {
      // skip inaccessible threads
    }
  }

  threads.sort((a, b) => Number(b.lastMessageAt) - Number(a.lastMessageAt));
  return threads;
}

/**
 * Fetch all messages in a Gmail thread.
 */
async function fetchThreadMessages(refreshToken, threadId) {
  const client = getAuthedClient(refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  return (thread.data.messages || []).map(msg => {
    const headers = msg.payload?.headers || [];
    const get = (name) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const { text, html } = extractBody(msg.payload);

    return {
      id: msg.id || '',
      threadId: msg.threadId || '',
      from: get('From'),
      to: get('To'),
      subject: get('Subject'),
      date: get('Date'),
      text,
      html,
      internalDate: msg.internalDate || '0',
    };
  });
}

/**
 * Send an email via Gmail with optional attachments.
 * @param {{ refreshToken, to, subject, htmlBody, threadId?, attachments?: Array<{name, mimeType, data: Buffer}> }}
 */
async function sendEmail({ refreshToken, to, bcc, subject, htmlBody, threadId, attachments, signature }) {
  const client = getAuthedClient(refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: client });

  // Resolve relative image URLs in signature to absolute for email clients
  const baseUrl = process.env.SERVER_URL || 'https://eggheaddb-production.up.railway.app';
  const resolvedSig = signature
    ? signature.replace(/src="\/api\//g, `src="${baseUrl}/api/`)
    : signature;
  const fullHtml = resolvedSig
    ? `${htmlBody}<br><br>--<br>${resolvedSig}`
    : htmlBody;
  const plainText = htmlToPlainText(fullHtml);
  const altBoundary = `alt_${Date.now()}`;
  const mixedBoundary = `mixed_${Date.now() + 1}`;

  let encoded;

  if (!attachments?.length) {
    const message = [
      `To: ${to}`,
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      plainText,
      `--${altBoundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      fullHtml,
      `--${altBoundary}--`,
    ].join('\r\n');
    encoded = Buffer.from(message).toString('base64url');
  } else {
    const parts = [
      `To: ${to}`,
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      plainText,
      `--${altBoundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      fullHtml,
      `--${altBoundary}--`,
    ];
    for (const att of attachments) {
      parts.push(
        `--${mixedBoundary}`,
        `Content-Type: ${att.mimeType}; name="${att.name}"`,
        `Content-Disposition: attachment; filename="${att.name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        att.data.toString('base64'),
      );
    }
    parts.push(`--${mixedBoundary}--`);
    encoded = Buffer.from(parts.join('\r\n')).toString('base64url');
  }

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      ...(threadId ? { threadId } : {}),
    },
  });

  return res.data;
}

/**
 * Get the Gmail address associated with a refresh token.
 */
async function getGmailAddress(refreshToken) {
  const client = getAuthedClient(refreshToken);
  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress;
}

module.exports = { searchThreads, fetchThreadMessages, sendEmail, getGmailAddress, getOAuthClient };
