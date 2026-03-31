import api from './client';
export const getAreas = () => api.get('/areas').then(r => r.data);
export const getGeneralData = () => api.get('/general-data').then(r => r.data);
export const getProfessorList = () => api.get('/professors/list').then(r => r.data);
export const getLocationList = () => api.get('/locations/list').then(r => r.data);
