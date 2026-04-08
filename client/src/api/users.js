import api from './client';
export const getUsers = (params) => api.get('/users', { params }).then(r => r.data);
export const getUser = (id) => api.get(`/users/${id}`).then(r => r.data);
export const createUser = (data) => api.post('/users', data).then(r => r.data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data).then(r => r.data);
export const deleteUser = (id) => api.delete(`/users/${id}`).then(r => r.data);
