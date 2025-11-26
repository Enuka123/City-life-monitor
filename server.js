require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const CityData = require('./models/CityData');

const app = express();

// --- 1. CORE MIDDLEWARE ---
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

// --- 3. OAUTH 2.0 CONFIGURATION ---
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
  },
  (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- 4. API KEY MIDDLEWARE ---
const checkApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.APP_API_KEY) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }
};

// --- 5. PROXY ROUTE FOR OPEN-METEO (Replaces OpenAQ) ---
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

app.get('/api/openaq-proxy', async (req, res) => {
    const { lat, lon } = req.query; 

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and Longitude are required.' });
    }

    // Requesting US AQI and PM2.5 from Open-Meteo
    const url = `${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5`;

    try {
        const aqRes = await fetch(url);
        
        if (!aqRes.ok) {
            console.error(`Air Quality request failed: ${aqRes.status}`);
            return res.status(aqRes.status).json({ error: 'Failed to fetch AQI data' });
        }
        
        const aqData = await aqRes.json();
        res.json(aqData);
    } catch (error) {
        console.error('Proxy fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- 6. AUTH ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/current-user', (req, res) => {
  res.json(req.user || null);
});

// --- 7. DATA SAVING ROUTE ---
app.post('/api/save-city-data', checkApiKey, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: Please login' });

  try {
    const newData = new CityData({ ...req.body, user: req.user.displayName });
    await newData.save(); 
    res.json({ message: 'Data successfully stored in MongoDB!', id: newData._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start Server
app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));