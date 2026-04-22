import api from './client';

export const syncTrainual = () => api.post('/trainual/sync').then(r => r.data);
export const syncTrainualCandidates = () => api.post('/trainual/sync-candidates').then(r => r.data);
export const getProfessorIssues = () => api.get('/trainual/professor-issues').then(r => r.data);
export const inviteCandidate = (candidateId) => api.post(`/trainual/invite-candidate/${candidateId}`).then(r => r.data);
export const promoteCandidate = (candidateId) => api.post(`/trainual/promote-candidate/${candidateId}`).then(r => r.data);
export const archiveTrainualUser = (trainualUserId) => api.put(`/trainual/users/${trainualUserId}/archive`).then(r => r.data);
export const setTrainualEmail = (professorId, trainual_email) => api.patch(`/trainual/professor/${professorId}/trainual-email`, { trainual_email }).then(r => r.data);
