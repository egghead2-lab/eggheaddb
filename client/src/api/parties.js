import api from './client';
export const getParties = (params) => api.get('/parties', { params }).then(r => r.data);
export const getParty = (id) => api.get(`/parties/${id}`).then(r => r.data);
export const createParty = (data) => api.post('/parties', data).then(r => r.data);
export const updateParty = (id, data) => api.put(`/parties/${id}`, data).then(r => r.data);
