require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const path = require('path'); // Required for serving the index.html on Vercel
const CityData = require('./models/CityData');

const app = express();

// --- 1. CORE MIDDLEWARE ---
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error("MongoDB Connection Error:", err));

// --- 3. OAUTH 2.0 CONFIGURATION ---
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Dynamic Callback URL Logic (Works for Localhost, Render, and Vercel)
let baseUrl = "http://localhost:3000";
if (process.env.VERCEL_URL) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
} else if (process.env.RENDER_EXTERNAL_URL) {
    baseUrl = process.env.RENDER_EXTERNAL_URL;
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${baseUrl}/auth/google/callback`
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

// --- 5. ROOT ROUTE (Fixes "Cannot GET /" on Vercel) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 6. PROXY ROUTE: WEATHER ---
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather';
app.get('/api/weather-proxy', async (req, res) => {
    const { city } = req.query;
    if (!city) return res.status(400).json({ error: 'City name required.' });
    
    // Server-side API Key usage
    const url = `${WEATHER_API_URL}?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`;
    try {
        const weatherRes = await fetch(url);
        if (!weatherRes.ok) return res.status(weatherRes.status).json({ error: 'Failed to fetch Weather data' });
        const weatherData = await weatherRes.json();
        res.json(weatherData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- 7. PROXY ROUTE: AIR QUALITY ---
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
app.get('/api/openaq-proxy', async (req, res) => {
    const { lat, lon } = req.query; 
    const url = `${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5`;
    try {
        const aqRes = await fetch(url);
        if (!aqRes.ok) return res.status(aqRes.status).json({ error: 'Failed to fetch AQI data' });
        const aqData = await aqRes.json();
        res.json(aqData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- 8. PROXY ROUTE: DEMOGRAPHICS ---
const GEODB_API_URL = 'https://wft-geo-db.p.rapidapi.com/v1/geo/cities';
app.get('/api/geodb-proxy', async (req, res) => {
    const { city, countryCode } = req.query;
    const url = `${GEODB_API_URL}?namePrefix=${city}&countryIds=${countryCode}&limit=1`;
    try {
        const geoDbRes = await fetch(url, {
            method: 'GET',
            headers: { 'X-RapidAPI-Key': process.env.GEODB_API_KEY, 'X-RapidAPI-Host': 'wft-geo-db.p.rapidapi.com' }
        });
        if (!geoDbRes.ok) return res.status(geoDbRes.status).json({ error: 'Failed to fetch GeoDB data' });
        const geoDbData = await geoDbRes.json();
        res.json(geoDbData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- 9. HISTORICAL DATA ENDPOINT (SECURED) ---
app.get('/api/history', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    const { city } = req.query;
    if (!city) return res.status(400).json({ error: 'City name required' });

    try {
        const history = await CityData.find({ 
            cityName: new RegExp(`^${city}$`, 'i'),
            user: req.user.displayName 
        })
        .sort({ timestamp: 1 })
        .select('timestamp weather.temp airQuality.aqi'); 
        
        res.json(history);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database query failed' });
    }
});

// --- 10. AUTH ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => res.redirect('/'));
app.get('/current-user', (req, res) => res.json(req.user || null));

// LOGOUT ROUTE
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) console.error("Error destroying session:", err);
            res.clearCookie('connect.sid');
            res.redirect('/');
        });
    });
});

// SAVE DATA ROUTE
app.post('/api/save-city-data', checkApiKey, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const newData = new CityData({ ...req.body, user: req.user.displayName });
    await newData.save(); 
    res.json({ message: 'Data successfully stored in MongoDB!', id: newData._id });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));