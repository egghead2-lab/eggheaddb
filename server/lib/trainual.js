/**
 * Trainual API client. Uses HTTP basic auth: email&account_id : password.
 * Returns null from getTrainualAuth() when env vars missing — callers must handle.
 */
const TRAINUAL_BASE = 'https://api.trainual.com/v1';

let _authHeader = null;
function getTrainualAuth() {
  if (_authHeader) return _authHeader;
  const { TRAINUAL_EMAIL, TRAINUAL_ACCOUNT_ID, TRAINUAL_PASSWORD } = process.env;
  if (!TRAINUAL_EMAIL || !TRAINUAL_ACCOUNT_ID || !TRAINUAL_PASSWORD) return null;
  const creds = `${TRAINUAL_EMAIL}&${TRAINUAL_ACCOUNT_ID}:${TRAINUAL_PASSWORD}`;
  _authHeader = 'Basic ' + Buffer.from(creds).toString('base64');
  return _authHeader;
}

function isConfigured() {
  return !!getTrainualAuth();
}

async function trainualRequest(method, path, body) {
  const auth = getTrainualAuth();
  if (!auth) throw new Error('Trainual not configured — missing TRAINUAL_EMAIL/TRAINUAL_ACCOUNT_ID/TRAINUAL_PASSWORD');
  const url = `${TRAINUAL_BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Authorization': auth,
      'Accept': 'application/json',
    },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`Trainual ${method} ${path} failed: ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const trainualGet = (path) => trainualRequest('GET', path);
const trainualPost = (path, body) => trainualRequest('POST', path, body);
const trainualPut = (path, body) => trainualRequest('PUT', path, body);
const trainualDelete = (path) => trainualRequest('DELETE', path);

module.exports = { getTrainualAuth, isConfigured, trainualGet, trainualPost, trainualPut, trainualDelete };
