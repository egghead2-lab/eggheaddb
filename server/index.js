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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/professors', professorsRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/parties', partiesRoutes);
app.use('/api', referenceRoutes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Professor Egghead server running on port ${PORT}`);
});

module.exports = app;
