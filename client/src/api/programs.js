import api from './client';
export const getPrograms = (params) => api.get('/programs', { params }).then(r => r.data);
export const getProgram = (id) => api.get(`/programs/${id}`).then(r => r.data);
export const createProgram = (data) => api.post('/programs', data).then(r => r.data);
export const updateProgram = (id, data) => api.put(`/programs/${id}`, data).then(r => r.data);
export const getSessions = (id) => api.get(`/programs/${id}/sessions`).then(r => r.data);
export const updateSessions = (id, sessions) => api.put(`/programs/${id}/sessions`, { sessions }).then(r => r.data);
export const getRoster = (id) => api.get(`/programs/${id}/roster`).then(r => r.data);
