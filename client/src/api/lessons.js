import api from './client';
export const getLessonsPage = (params) => api.get('/lessons', { params }).then(r => r.data);
export const getLesson = (id) => api.get(`/lessons/${id}`).then(r => r.data);
export const createLesson = (data) => api.post('/lessons', data).then(r => r.data);
export const updateLesson = (id, data) => api.put(`/lessons/${id}`, data).then(r => r.data);
export const deleteLesson = (id) => api.delete(`/lessons/${id}`).then(r => r.data);
export const addLessonClass = (id, data) => api.post(`/lessons/${id}/classes`, data).then(r => r.data);
export const removeLessonClass = (id, classId) => api.delete(`/lessons/${id}/classes/${classId}`).then(r => r.data);
