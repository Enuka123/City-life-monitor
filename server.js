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

// --- 5. PROXY ROUTE FOR OPENWEATHERMAP (Weather - Key is hidden) ---
const WEATHER_API_URL = 'https://api.openweathermap.org/data/2.5/weather';

app.get('/api/weather-proxy', async (req, res) => {
    const { city } = req.query;

    if (!city) {
        return res.status(400).json({ error: 'City name is required.' });
    }

    // Uses the new, secure key from .env
    const url = `${WEATHER_API_URL}?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`;

    try {
        const weatherRes = await fetch(url);
        
        if (!weatherRes.ok) {
            return res.status(weatherRes.status).json({ error: 'Failed to fetch Weather data' });
        }
        
        const weatherData = await weatherRes.json();
        res.json(weatherData);
    } catch (error) {
        console.error('Weather Proxy fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// --- 6. PROXY ROUTE FOR OPEN-METEO (Air Quality) ---
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

app.get('/api/openaq-proxy', async (req, res) => {
    const { lat, lon } = req.query; 

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and Longitude are required.' });
    }

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
        console.error('AQ Proxy fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- 7. PROXY ROUTE FOR GEODB CITIES (Demographics) ---
const GEODB_API_URL = 'https://wft-geo-db.p.rapidapi.com/v1/geo/cities';

app.get('/api/geodb-proxy', async (req, res) => {
    const { city, countryCode } = req.query;

    if (!city || !countryCode) {
        return res.status(400).json({ error: 'City and Country Code are required.' });
    }

    const url = `${GEODB_API_URL}?namePrefix=${city}&countryIds=${countryCode}&limit=1`;

    try {
        const geoDbRes = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.GEODB_API_KEY, 
                'X-RapidAPI-Host': 'wft-geo-db.p.rapidapi.com'
            }
        });

        if (!geoDbRes.ok) {
            console.error(`GeoDB request failed: ${geoDbRes.status}`);
            return res.status(geoDbRes.status).json({ error: 'Failed to fetch GeoDB data' });
        }

        const geoDbData = await geoDbRes.json();
        res.json(geoDbData);
    } catch (error) {
        console.error('GeoDB Proxy fetch error:', error);
        res.status(500).json({ error: 'Internal server error while fetching GeoDB data.' });
    }
});


// --- 8. AUTH & DATA ROUTES ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/current-user', (req, res) => {
  res.json(req.user || null);
});

// Data Ingestion Endpoint
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