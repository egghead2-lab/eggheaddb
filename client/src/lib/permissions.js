// Tool permission config
// Each tool has a path and allowed roles.
// 'universal' means all authenticated users can see it.
// Roles listed in ADMIN_ROLES always see everything.

export const ADMIN_ROLES = ['Admin', 'CEO'];

// Each entry: { path, roles }
// roles = 'universal' | array of role names
export const TOOL_PERMISSIONS = {
  // Dashboard — everyone
  '/': 'universal',

  // Operations — most roles
  '/programs': 'universal',
  '/programs/new': 'universal',
  '/parties': 'universal',
  '/parties/new': 'universal',
  '/professors': 'universal',
  '/professors/new': ['Admin', 'CEO', 'Scheduling Coordinator', 'Human Resources', 'Field Manager'],
  '/locations': 'universal',
  '/locations/new': ['Admin', 'CEO', 'Client Manager', 'Sales'],

  // People
  '/students': 'universal',
  '/students/new': 'universal',
  '/parents': 'universal',
  '/parents/new': 'universal',

  // Sales
  '/contractors': ['Admin', 'CEO', 'Sales', 'Client Manager'],
  '/bulk-input': ['Admin', 'CEO', 'Sales', 'Scheduling Coordinator'],

  // Curriculum
  '/lessons': 'universal',
  '/lessons/new': ['Admin', 'CEO', 'Curriculum'],
  '/modules': ['Admin', 'CEO', 'Curriculum'],

  // Admin
  '/users': ['Admin', 'CEO'],
  '/users/new': ['Admin', 'CEO'],
  '/holidays': ['Admin', 'CEO', 'Scheduling Coordinator'],
  '/holidays/new': ['Admin', 'CEO', 'Scheduling Coordinator'],
};

/**
 * Check if a user role has access to a given path.
 * Admin roles always return true.
 * Matches the most specific path prefix.
 */
export function hasAccess(role, path) {
  if (!role) return false;
  if (ADMIN_ROLES.includes(role)) return true;

  // Try exact match first, then prefix matches (longest first)
  const paths = Object.keys(TOOL_PERMISSIONS).sort((a, b) => b.length - a.length);

  for (const p of paths) {
    // Match exact or path starts with this prefix (for dynamic routes like /programs/:id)
    if (path === p || (p !== '/' && path.startsWith(p + '/'))) {
      const perm = TOOL_PERMISSIONS[p];
      if (perm === 'universal') return true;
      return Array.isArray(perm) && perm.includes(role);
    }
  }

  // If no permission defined, allow (detail pages inherit from list page)
  // e.g. /programs/123 inherits from /programs
  const base = '/' + path.split('/').filter(Boolean)[0];
  if (base && TOOL_PERMISSIONS[base]) {
    const perm = TOOL_PERMISSIONS[base];
    if (perm === 'universal') return true;
    return Array.isArray(perm) && perm.includes(role);
  }

  return true; // Default allow if no rule defined
}

/**
 * Filter nav groups based on user role.
 * Returns groups with only accessible items.
 */
export function filterNavGroups(groups, role) {
  if (!role) return [];
  if (ADMIN_ROLES.includes(role)) return groups;

  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => hasAccess(role, item.to)),
    }))
    .filter(group => group.items.length > 0);
}
