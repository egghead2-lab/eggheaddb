import api from './client';
export const getBulkSetup = () => api.get('/bulk-input/setup').then(r => r.data);
export const saveBulkPrograms = (programs) => api.post('/bulk-input/save', { programs }).then(r => r.data);
