const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();

// ✅ FIX 1: Enable trust proxy for Vercel/Render
app.set('trust proxy', 1);

// ✅ FIX 2: Better CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ FIX 3: Updated rate limiting with trust proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip in development
  skip: (req) => process.env.NODE_ENV === 'development'
});
app.use('/api/', limiter);

// ✅ Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Video Downloader API is running successfully!',
    status: 'ok',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth (POST /register, POST /login, GET /me)',
      download: '/api/download (POST /info, POST /video, POST /qr, POST /batch)',
      videos: '/api/videos (GET /history, POST /save, DELETE /:id)'
    }
  });
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/download', require('./routes/download'));
app.use('/api/videos', require('./routes/videos'));

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ✅ FIX 4: Fixed MongoDB connection (removed deprecated options, added database name)
const MONGODB_URI = process.env.MONGODB_URI || process.env.BASE_URL;

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err.message));

// ✅ FIX 5: Enable server for both local and production
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;