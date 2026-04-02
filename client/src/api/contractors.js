import api from './client';
export const getContractors = (params) => api.get('/contractors', { params }).then(r => r.data);
export const getContractor = (id) => api.get(`/contractors/${id}`).then(r => r.data);
export const createContractor = (data) => api.post('/contractors', data).then(r => r.data);
export const updateContractor = (id, data) => api.put(`/contractors/${id}`, data).then(r => r.data);
