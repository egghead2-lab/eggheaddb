export function formatDate(date) {
  if (!date) return '—';
  // Parse as UTC to avoid timezone shift on date-only values (e.g. "2026-04-08T00:00:00.000Z")
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

export function formatTime(time) {
  if (!time) return '—';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// Format a time range given a start time (HH:MM:SS) and duration in minutes
// e.g. formatTimeRange('14:30:00', 60) → '2:30 – 3:30 PM'
export function formatTimeRange(startTime, lengthMinutes) {
  if (!startTime) return '—';
  const [h, m] = startTime.split(':').map(Number);
  const startMins = h * 60 + m;
  const endMins = startMins + (lengthMinutes || 0);
  const fmt = (mins) => {
    const hh = Math.floor(mins / 60) % 24;
    const mm = mins % 60;
    const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, '0')}`;
  };
  const endH = Math.floor(endMins / 60) % 24;
  const ampm = endH >= 12 ? 'PM' : 'AM';
  return `${fmt(startMins)} – ${fmt(endMins)} ${ampm}`;
}

export function formatPhone(phone) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone; // return as-is if non-standard
}

export function calcAge(birthday) {
  if (!birthday) return null;
  const dob = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export function formatCurrency(val) {
  if (val == null || val === '') return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export function getProgramDay(program) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < days.length; i++) {
    if (program[days[i]]) return names[i];
  }
  return '—';
}

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Sanitize API response data for React Hook Form:
// - null/undefined → '' (prevents invalid controlled input values)
// - Date objects → 'YYYY-MM-DD' string (MySQL returns DATE as JS Date)
// - ISO datetime strings → 'YYYY-MM-DD' (strip time portion)
// - Arrays/objects left as-is (sub-records not part of the form)
export function toFormData(data) {
  const result = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) {
      result[key] = '';
    } else if (val instanceof Date) {
      result[key] = val.toISOString().split('T')[0];
    } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      result[key] = val.split('T')[0];
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function authUrl(url) {
  const token = localStorage.getItem('token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${token}`;
}
