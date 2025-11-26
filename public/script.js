// --- CONFIGURATION ---
// APP_API_KEY is the only external key defined here, for application auth
// Ensure this matches the APP_API_KEY in your .env file
const APP_API_KEY = 'MyStrongSecretKey_SoC_2025_Group18'; 
// -----------------------

let aggregatedData = {};

// --- AUTHENTICATION CHECK ---
fetch('/current-user')
    .then(res => res.json())
    .then(user => {
        if (user) {
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('user-section').classList.remove('hidden');
            document.getElementById('username').innerText = user.displayName;
        }
    });

// --- DATA FETCHING & AGGREGATION LOGIC (MINI PROJECT CORE) ---
async function fetchCityData() {
    const city = document.getElementById('cityInput').value;
    if (!city) return alert("Please enter a city");

    try {
        // 1. Fetch Weather (VIA BACKEND PROXY - Key is hidden in .env)
        // **CRITICAL CHANGE**: Calling the local proxy, NOT the external API
        const weatherRes = await fetch(`/api/weather-proxy?city=${city}`);
        
        if (!weatherRes.ok) throw new Error("Weather city not found or data is unavailable.");
        const weatherData = await weatherRes.json();
        
        const { lat, lon } = weatherData.coord;
        const countryCode = weatherData.sys.country; 

        // 2. Fetch Air Quality (Open-Meteo via Backend Proxy)
        const aqRes = await fetch(`/api/openaq-proxy?lat=${lat}&lon=${lon}`);
        let aqData = {};
        if (aqRes.ok) {
            aqData = await aqRes.json();
        } else {
            console.warn("Air Quality data unavailable from proxy.");
        }
        
        // 3. Fetch Demographics (GeoDB via Backend Proxy)
        const geoDbRes = await fetch(`/api/geodb-proxy?city=${city}&countryCode=${countryCode}`);
        let geoDbData = {};
        if (geoDbRes.ok) {
            geoDbData = await geoDbRes.json();
        } else {
            console.warn("Demographics data unavailable from GeoDB proxy.");
        }
        
        // 4. AGGREGATION: Combine all data into the required single JSON object
        const cityDetail = geoDbData.data?.[0] || {};

        aggregatedData = {
            cityName: weatherData.name,
            country: weatherData.sys.country,
            weather: {
                temp: weatherData.main.temp,
                humidity: weatherData.main.humidity,
                condition: weatherData.weather[0].description
            },
            airQuality: {
                aqi: aqData.current?.us_aqi || 0, 
                pollutant: 'PM2.5: ' + (aqData.current?.pm2_5 || 'N/A')
            },
            demographics: {
                population: cityDetail.population?.toLocaleString() || 'N/A', 
                elevation: cityDetail.elevationMeters ? `${cityDetail.elevationMeters}m` : 'N/A'
            }
        };

        // Display on Frontend
        document.getElementById('results').classList.remove('hidden');
        document.getElementById('jsonDisplay').innerText = JSON.stringify(aggregatedData, null, 2);

    } catch (error) {
        console.error("Error fetching data:", error);
        alert(`Failed to fetch city data: ${error.message || 'Check console for details.'}`);
    }
}

// --- AJAX TRANSMISSION ---
async function sendToBackend() {
    // Check if the user is authenticated first
    const userRes = await fetch('/current-user');
    const user = await userRes.json();

    if (!user) {
        document.getElementById('statusMsg').innerText = "Please log in first using Google OAuth.";
        return;
    }
    
    // AJAX request to our own backend, using the custom API Key header
    const response = await fetch('/api/save-city-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': APP_API_KEY 
        },
        body: JSON.stringify(aggregatedData)
    });

    const result = await response.json();
    document.getElementById('statusMsg').innerText = result.message || result.error;
}