import api from './client';

export const login = (data) =>
  api.post('/auth/login', data).then(r => {
    if (r.data.token) localStorage.setItem('token', r.data.token);
    return r.data;
  });

export const logout = () =>
  api.post('/auth/logout').then(r => {
    localStorage.removeItem('token');
    return r.data;
  });

export const getMe = () => api.get('/auth/me').then(r => r.data);
