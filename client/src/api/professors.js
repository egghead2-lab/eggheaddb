import api from './client';
export const getProfessors = (params) => api.get('/professors', { params }).then(r => r.data);
export const getProfessor = (id) => api.get(`/professors/${id}`).then(r => r.data);
export const createProfessor = (data) => api.post('/professors', data).then(r => r.data);
export const updateProfessor = (id, data) => api.put(`/professors/${id}`, data).then(r => r.data);
export const getProfessorList = () => api.get('/professors/list').then(r => r.data);
