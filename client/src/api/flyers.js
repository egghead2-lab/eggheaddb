import api from './client';

export const getFlyerFieldsCatalog = () => api.get('/flyers/fields-catalog').then(r => r.data);

export const listFlyerTemplates = (params = {}) =>
  api.get('/flyers/templates', { params }).then(r => r.data);

export const getFlyerTemplate = (id) =>
  api.get(`/flyers/templates/${id}`).then(r => r.data);

export const createFlyerTemplate = (formData) =>
  api.post('/flyers/templates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

export const updateFlyerTemplate = (id, body) =>
  api.put(`/flyers/templates/${id}`, body).then(r => r.data);

export const archiveFlyerTemplate = (id) =>
  api.post(`/flyers/templates/${id}/archive`).then(r => r.data);

export const replaceFlyerTemplateFields = (id, fields) =>
  api.put(`/flyers/templates/${id}/fields`, { fields }).then(r => r.data);

// Direct URL for the template PDF (fed into <Document file={...}> in react-pdf).
// Includes the auth token as a query param because react-pdf fetches the URL
// itself and can't reach our axios interceptor / Bearer header.
export const flyerTemplatePdfUrl = (id) => {
  const base = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
  const token = localStorage.getItem('token');
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${base}/flyers/templates/${id}/pdf${qs}`;
};

export const listProgramsNeedingFlyers = (params = {}) =>
  api.get('/flyers/programs-needing-flyers', { params }).then(r => r.data);

export const getProgramFlyerData = (programId) =>
  api.get(`/flyers/program/${programId}/data`).then(r => r.data);

export const renderFlyer = ({ template_id, program_id, data, mode = 'preview' }) =>
  api.post('/flyers/render', { template_id, program_id, data, mode },
    mode === 'download' ? { responseType: 'blob' } : undefined
  ).then(r => r.data);

// Flyer-status mutations
export const markFlyerMade = (programId, templateId) =>
  api.post(`/flyers/programs/${programId}/mark-made`, { template_id: templateId }).then(r => r.data);
export const unmakeFlyerProgram = (programId) =>
  api.post(`/flyers/programs/${programId}/unmake`).then(r => r.data);
export const markFlyerSent = (programId) =>
  api.post(`/flyers/programs/${programId}/mark-sent`).then(r => r.data);
export const unsendFlyerProgram = (programId) =>
  api.post(`/flyers/programs/${programId}/unsend`).then(r => r.data);
export const sendFlyerEmail = (programId, payload) =>
  api.post(`/flyers/programs/${programId}/send-flyer`, payload).then(r => r.data);

// Convenience: trigger a browser file download from a Blob
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
