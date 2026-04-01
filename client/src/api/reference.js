import api from './client';
export const getAreas = () => api.get('/areas').then(r => r.data);
export const getGeneralData = () => api.get('/general-data').then(r => r.data);
export const getProfessorList = () => api.get('/professors/list').then(r => r.data);
export const getLocationList = () => api.get('/locations/list').then(r => r.data);
export const getRoles = () => api.get('/roles').then(r => r.data);
export const getLessons = () => api.get('/lessons').then(r => r.data);
export const createRole = (data) => api.post('/roles', data).then(r => r.data);
export const updateRole = (id, data) => api.put(`/roles/${id}`, data).then(r => r.data);
