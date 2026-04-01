export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export const TRAINING_FIELDS = [
  { key: 'science_trained_id', label: 'Science', short: 'S' },
  { key: 'engineering_trained_id', label: 'Engineering', short: 'E' },
  { key: 'show_party_trained_id', label: 'Show Party', short: 'SP' },
  { key: 'slime_party_trained_id', label: 'Slime Party', short: 'SL' },
  { key: 'demo_trained_id', label: 'Demo', short: 'D' },
  { key: 'studysmart_trained_id', label: 'StudySmart', short: 'SS' },
  { key: 'camp_trained_id', label: 'Camp', short: 'C' },
];

export const STATUS_COLORS = {
  'Confirmed': 'bg-green-100 text-green-800',
  'Unconfirmed': 'bg-amber-100 text-amber-800',
  'Cancelled': 'bg-red-100 text-red-800',
  'Cancelled - Active': 'bg-red-100 text-red-800',
  'Cancelled - Other': 'bg-red-100 text-red-800',
  'Completed': 'bg-blue-100 text-blue-800',
  'Active': 'bg-green-100 text-green-800',
  'Inactive': 'bg-gray-100 text-gray-600',
  'Terminated': 'bg-red-100 text-red-800',
  'In Training': 'bg-purple-100 text-purple-800',
  'Training': 'bg-purple-100 text-purple-800',
  'Pending': 'bg-amber-100 text-amber-800',
  'Substitute': 'bg-sky-100 text-sky-800',
  'Inactive - Items Pending': 'bg-amber-100 text-amber-800',
  // Roles
  'Admin': 'bg-red-100 text-red-800',
  'Scheduling Coordinator': 'bg-blue-100 text-blue-800',
  'Field Manager': 'bg-emerald-100 text-emerald-800',
  'Client Manager': 'bg-violet-100 text-violet-800',
  'Sales': 'bg-amber-100 text-amber-800',
  'Hiring': 'bg-teal-100 text-teal-800',
  'Warehouse': 'bg-orange-100 text-orange-800',
};
