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

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.warn('MONGODB_URI not set. Set it in server/.env');
    } else {
      await mongoose.connect(mongoUri);
      console.log('✅ MongoDB connected');
    }

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
