import api from './client';
export const getStudents = (params) => api.get('/students', { params }).then(r => r.data);
export const searchStudents = (q) => api.get('/students/search', { params: { q } }).then(r => r.data);
export const getStudent = (id) => api.get(`/students/${id}`).then(r => r.data);
export const createStudent = (data) => api.post('/students', data).then(r => r.data);
export const updateStudent = (id, data) => api.put(`/students/${id}`, data).then(r => r.data);
export const addToRoster = (programId, data) => api.post(`/programs/${programId}/roster/add`, data).then(r => r.data);
export const removeFromRoster = (programId, rosterId) => api.delete(`/programs/${programId}/roster/${rosterId}`).then(r => r.data);
export const updateRosterEntry = (programId, rosterId, data) => api.put(`/programs/${programId}/roster/${rosterId}`, data).then(r => r.data);
