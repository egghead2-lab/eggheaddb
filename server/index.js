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
const usersRoutes = require('./routes/users');
const holidaysRoutes = require('./routes/holidays');
const studentsRoutes = require('./routes/students');
const parentsRoutes = require('./routes/parents');
const contractorsRoutes = require('./routes/contractors');
const bulkInputRoutes = require('./routes/bulk-input');
const toolsRoutes = require('./routes/tools');
const scheduleRoutes = require('./routes/schedule');
const assignmentBoardRoutes = require('./routes/assignment-board');
const lessonsRoutes = require('./routes/lessons');
const classesRoutes = require('./routes/classes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/users', usersRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/parents', parentsRoutes);
app.use('/api/contractors', contractorsRoutes);
app.use('/api/bulk-input', bulkInputRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/assignment-board', assignmentBoardRoutes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Professor Egghead server running on port ${PORT}`);
});

module.exports = app;
