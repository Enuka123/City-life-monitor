// Ensure this matches the key in your .env file
const WEATHER_API_KEY = '2d679f5fe88a7473fdae4ca8d2de2611'; 
// Ensure this matches the APP_API_KEY in your .env file
const APP_API_KEY = 'MyStrongSecretKey_SoC_2025_Group18';

let aggregatedData = {};

// Check if user is logged in
fetch('/current-user')
    .then(res => res.json())
    .then(user => {
        if (user) {
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('user-section').classList.remove('hidden');
            document.getElementById('username').innerText = user.displayName;
        }
    });

async function fetchCityData() {
    const city = document.getElementById('cityInput').value;
    if (!city) return alert("Please enter a city");

    try {
        // 1. Fetch Weather
        const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`);
        
        if (!weatherRes.ok) throw new Error("Weather city not found");
        const weatherData = await weatherRes.json();

        // 2. Fetch Air Quality (VIA YOUR LOCAL PROXY)
        const { lat, lon } = weatherData.coord;
        
        // Calling our local server, which now talks to Open-Meteo
        const aqRes = await fetch(`/api/openaq-proxy?lat=${lat}&lon=${lon}`);
        
        let aqData = {};
        if (aqRes.ok) {
            aqData = await aqRes.json();
        } else {
            console.warn("Air Quality data unavailable");
        }
        
        // 3. Aggregate Data
        aggregatedData = {
            cityName: weatherData.name,
            country: weatherData.sys.country,
            weather: {
                temp: weatherData.main.temp,
                humidity: weatherData.main.humidity,
                condition: weatherData.weather[0].description
            },
            airQuality: {
                // Open-Meteo Format: current.us_aqi
                aqi: aqData.current?.us_aqi || 0, 
                pollutant: 'PM2.5: ' + (aqData.current?.pm2_5 || 'N/A')
            },
            demographics: {
                population: 'N/A', 
                elevation: 'N/A'
            }
        };

        // Display on Frontend
        document.getElementById('results').classList.remove('hidden');
        document.getElementById('jsonDisplay').innerText = JSON.stringify(aggregatedData, null, 2);

    } catch (error) {
        console.error("Error fetching data:", error);
        alert("Failed to fetch city data. Check console.");
    }
}

async function sendToBackend() {
    // Ajax request to our own backend
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