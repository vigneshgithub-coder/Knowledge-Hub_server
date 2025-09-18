const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./src/routes/auth.routes');
const documentRoutes = require('./src/routes/document.routes');
const searchRoutes = require('./src/routes/search.routes');
const aiRoutes = require('./src/routes/ai.routes');

const app = express();

// CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',  // For local development
    'https://your-frontend-domain.com',  // Your production frontend URL
    /\.onrender\.com$/  // Allow all Render subdomains
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Health check endpoint
app.get('/health', (_req, res) => res.json({ 
  status: 'ok',
  timestamp: new Date().toISOString()
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Resource not found'
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.warn('MONGODB_URI not set. Set it in server/.env');
    } else {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ MongoDB connected');
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});