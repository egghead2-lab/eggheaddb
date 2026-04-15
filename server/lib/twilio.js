const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

/**
 * Send an SMS via Twilio
 * @param {string} to - Phone number in E.164 format (+1XXXXXXXXXX)
 * @param {string} body - Message text
 * @returns {Promise<{sid: string, status: string}>}
 */
async function sendSms(to, body) {
  const message = await client.messages.create({
    to,
    from: FROM_NUMBER,
    body,
  });
  return { sid: message.sid, status: message.status };
}

/**
 * Fetch recent inbound messages to our Twilio number
 * @param {number} limit - Max messages to retrieve
 * @returns {Promise<Array>}
 */
async function getInboundMessages(limit = 100) {
  const messages = await client.messages.list({
    to: FROM_NUMBER,
    limit,
  });
  return messages.map(m => ({
    sid: m.sid,
    from: m.from,
    body: m.body,
    dateSent: m.dateSent,
    status: m.status,
  }));
}

/**
 * Normalize a phone number to E.164 format
 * Handles: (818) 450-3515, 818-450-3515, 8184503515, +18184503515, etc.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

/**
 * Check if a response text indicates confirmation
 */
function isConfirmResponse(text) {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  const confirmPatterns = ['yes', 'yes!', 'yes.', 'yep', 'yeah', 'yea', 'confirmed', 'confirm', 'y', 'yes to all', 'yes to both'];
  return confirmPatterns.some(p => normalized === p || normalized.startsWith(p));
}

module.exports = { sendSms, getInboundMessages, normalizePhone, isConfirmResponse };
