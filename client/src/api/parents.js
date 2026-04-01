import api from './client';

export const getParents = (params) => api.get('/parents', { params }).then(r => r.data);
export const getParent = (id) => api.get(`/parents/${id}`).then(r => r.data);
export const searchParents = (q) => api.get('/parents/search', { params: { q } }).then(r => r.data);
export const createParent = (data) => api.post('/parents', data).then(r => r.data);
export const updateParent = (id, data) => api.put(`/parents/${id}`, data).then(r => r.data);
export const deleteParent = (id) => api.delete(`/parents/${id}`).then(r => r.data);
export const linkStudent = (parentId, data) => api.post(`/parents/${parentId}/students`, data).then(r => r.data);
export const unlinkStudent = (parentId, studentId) => api.delete(`/parents/${parentId}/students/${studentId}`).then(r => r.data);
export const updateStudentLocation = (parentId, studentId, location_id) =>
  api.put(`/parents/${parentId}/students/${studentId}`, { location_id }).then(r => r.data);

// Link a co-parent (coParentId) to a student — reuses the same endpoint with a different parent
export const linkCoParent = (coParentId, studentId) =>
  api.post(`/parents/${coParentId}/students`, { student_id: studentId }).then(r => r.data);
