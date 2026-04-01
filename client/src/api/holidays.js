import api from './client';
export const getHolidays = (params) => api.get('/holidays', { params }).then(r => r.data);
export const getHoliday = (id) => api.get(`/holidays/${id}`).then(r => r.data);
export const createHoliday = (data) => api.post('/holidays', data).then(r => r.data);
export const bulkCreateHolidays = (holidays) => api.post('/holidays/bulk', { holidays }).then(r => r.data);
export const updateHoliday = (id, data) => api.put(`/holidays/${id}`, data).then(r => r.data);
export const deleteHoliday = (id) => api.delete(`/holidays/${id}`).then(r => r.data);
