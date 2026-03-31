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
