require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const referenceRoutes = require('./routes/reference');
const professorsRoutes = require('./routes/professors');
const locationsRoutes = require('./routes/locations');
const programsRoutes = require('./routes/programs');
const partiesRoutes = require('./routes/parties');
const partyAssignRoutes = require('./routes/party-assign');
const incidentRoutes = require('./routes/incidents');
const notificationRoutes = require('./routes/notifications');
const clientMgmtRoutes = require('./routes/client-management');
const invoicingRoutes = require('./routes/invoicing');
const usersRoutes = require('./routes/users');
const holidaysRoutes = require('./routes/holidays');
const studentsRoutes = require('./routes/students');
const parentsRoutes = require('./routes/parents');
const contractorsRoutes = require('./routes/contractors');
const bulkInputRoutes = require('./routes/bulk-input');
const toolsRoutes = require('./routes/tools');
const scheduleRoutes = require('./routes/schedule');
const payrollRoutes = require('./routes/payroll');
const reportsRoutes = require('./routes/reports');
const onboardingRoutes = require('./routes/onboarding');
const assignmentBoardRoutes = require('./routes/assignment-board');
const lessonsRoutes = require('./routes/lessons');
const classesRoutes = require('./routes/classes');
const subManagementRoutes = require('./routes/sub-management');
const evaluationsRoutes = require('./routes/evaluations');
const hiringRequestsRoutes = require('./routes/hiring-requests');
const materialsRoutes = require('./routes/materials');
const plannerRoutes = require('./routes/planner');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3002',
    ];
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auto-trim all string values in request bodies
app.use((req, res, next) => {
  function trimStrings(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(trimStrings);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = typeof v === 'string' ? v.trim() : (typeof v === 'object' ? trimStrings(v) : v);
    }
    return out;
  }
  if (req.body && typeof req.body === 'object') req.body = trimStrings(req.body);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Routes — reference routes first so /api/professors/list and /api/locations/list
// don't get caught by /:id params in entity routers
app.use('/api/auth', authRoutes);
app.use('/api/lessons', lessonsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api', referenceRoutes);
app.use('/api/professors', professorsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/parties', partiesRoutes);
app.use('/api/party-assign', partyAssignRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/client-management', clientMgmtRoutes);
app.use('/api/invoicing', invoicingRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/parents', parentsRoutes);
app.use('/api/contractors', contractorsRoutes);
app.use('/api/bulk-input', bulkInputRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/assignment-board', assignmentBoardRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/sub-management', subManagementRoutes);
app.use('/api/evaluations', evaluationsRoutes);
app.use('/api/hiring-requests', hiringRequestsRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/planner', plannerRoutes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Professor Egghead server running on port ${PORT}`);

  // Nightly payroll job — runs at midnight
  const cron = require('node-cron');
  const { runNightlyPayJob } = require('./services/payrollNightlyJob');
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running nightly payroll job…');
    try {
      const result = await runNightlyPayJob();
      console.log('[Cron] Nightly job complete:', result);
    } catch (err) {
      console.error('[Cron] Nightly job error:', err.message);
    }
  });
  console.log('[Cron] Nightly payroll job scheduled for midnight');
});

module.exports = app;
