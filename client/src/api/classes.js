import api from './client';
export const getClass = (id) => api.get(`/classes/${id}`).then(r => r.data);
export const createClass = (data) => api.post('/classes', data).then(r => r.data);
export const updateClass = (id, data) => api.put(`/classes/${id}`, data).then(r => r.data);
export const reorderLessons = (id, lessonIds) => api.put(`/classes/${id}/reorder`, { lesson_ids: lessonIds }).then(r => r.data);
