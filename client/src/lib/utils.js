export function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
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
