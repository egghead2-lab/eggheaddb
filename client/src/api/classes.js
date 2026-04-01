import api from './client';
export const getClass = (id) => api.get(`/classes/${id}`).then(r => r.data);
export const updateClass = (id, data) => api.put(`/classes/${id}`, data).then(r => r.data);
