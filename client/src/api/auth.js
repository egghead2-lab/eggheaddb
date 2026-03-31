import api from './client';
export const login = (data) => api.post('/auth/login', data).then(r => r.data);
export const logout = () => api.post('/auth/logout').then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);
