import api from './client';

// Gusto Codes
export const getGustoCodes = () => api.get('/payroll/gusto-codes').then(r => r.data);
export const createGustoCode = (data) => api.post('/payroll/gusto-codes', data).then(r => r.data);
export const updateGustoCode = (id, data) => api.put(`/payroll/gusto-codes/${id}`, data).then(r => r.data);

// Payroll Runs
export const getRunsRocketology = () => api.get('/payroll/runs/rocketology').then(r => r.data);
export const getRunRocketology = (id) => api.get(`/payroll/runs/rocketology/${id}`).then(r => r.data);
export const createRunRocketology = (data) => api.post('/payroll/runs/rocketology', data).then(r => r.data);
export const calculateRunRocketology = (id) => api.post(`/payroll/runs/rocketology/${id}/calculate`).then(r => r.data);
export const exportCsvRocketology = (id) => `${api.defaults.baseURL}/payroll/runs/rocketology/${id}/csv`;

// Session Pay
export const getSessionPay = (params) => api.get('/payroll/session-pay', { params }).then(r => r.data);
export const editSessionPay = (id, data) => api.patch(`/payroll/session-pay/${id}`, data).then(r => r.data);

// Misc Pay
export const getMiscPay = (params) => api.get('/payroll/misc-pay', { params }).then(r => r.data);
export const createMiscPay = (data) => api.post('/payroll/misc-pay', data).then(r => r.data);
export const reviewMiscPay = (id, data) => api.patch(`/payroll/misc-pay/${id}/review`, data).then(r => r.data);

// Onboarding Pay
export const getOnboardingPay = (params) => api.get('/payroll/onboarding-pay', { params }).then(r => r.data);
export const createOnboardingPay = (data) => api.post('/payroll/onboarding-pay', data).then(r => r.data);
export const reviewOnboardingPay = (id, data) => api.patch(`/payroll/onboarding-pay/${id}/review`, data).then(r => r.data);

// FM Time
export const getFmTime = (params) => api.get('/payroll/fm-time', { params }).then(r => r.data);
export const createFmTime = (data) => api.post('/payroll/fm-time', data).then(r => r.data);
export const approveFmTime = (id, data) => api.patch(`/payroll/fm-time/${id}/approve`, data).then(r => r.data);

// Mileage
export const getMileage = (params) => api.get('/payroll/mileage', { params }).then(r => r.data);
export const createMileage = (data) => api.post('/payroll/mileage', data).then(r => r.data);
export const processMileage = (id) => api.patch(`/payroll/mileage/${id}/process`).then(r => r.data);

// Missing Gusto Codes
export const getMissingGustoCodes = () => api.get('/payroll/missing-gusto-codes').then(r => r.data);

// CSV Preview
export const getCsvPreview = (id) => api.get(`/payroll/runs/rocketology/${id}/csv-preview`).then(r => r.data);

// Test Data
export const seedTestData = () => api.post('/payroll/seed-test-data').then(r => r.data);

// Nightly Job
export const runNightlyJob = () => api.post('/payroll/nightly-job/run').then(r => r.data);
export const getNightlyLogs = () => api.get('/payroll/nightly-job/logs').then(r => r.data);
