import api from './client';
export const getProfessors = (params) => api.get('/professors', { params }).then(r => r.data);
export const getProfessor = (id) => api.get(`/professors/${id}`).then(r => r.data);
export const createProfessor = (data) => api.post('/professors', data).then(r => r.data);
export const updateProfessor = (id, data) => api.put(`/professors/${id}`, data).then(r => r.data);
export const getProfessorList = () => api.get('/professors/list').then(r => r.data);
export const createLivescan = (professorId, data) => api.post(`/professors/${professorId}/livescans`, data).then(r => r.data);
export const updateLivescan = (professorId, id, data) => api.put(`/professors/${professorId}/livescans/${id}`, data).then(r => r.data);
export const deleteLivescan = (professorId, id) => api.delete(`/professors/${professorId}/livescans/${id}`).then(r => r.data);
