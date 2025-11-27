// --- CONFIGURATION ---
const APP_API_KEY = 'MyStrongSecretKey_SoC_2025_Group18'; 
// -----------------------

let aggregatedData = {};
let myChart = null; // Store chart instance

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

// --- DATA FETCHING ---
async function fetchCityData() {
    const cityInput = document.getElementById('cityInput');
    const city = cityInput.value;
    if (!city) return alert("Please enter a city");

    // UI Reset
    document.getElementById('statusMsg').innerText = ''; 
    document.getElementById('results').classList.add('hidden');
    document.getElementById('chart-section').classList.add('hidden'); // Hide chart on new search

    try {
        // 1. Weather
        const weatherRes = await fetch(`/api/weather-proxy?city=${city}`);
        if (!weatherRes.ok) throw new Error("Weather city not found.");
        const weatherData = await weatherRes.json();
        
        const { lat, lon } = weatherData.coord;
        const countryCode = weatherData.sys.country; 

        // 2. Air Quality
        const aqRes = await fetch(`/api/openaq-proxy?lat=${lat}&lon=${lon}`);
        let aqData = {};
        if (aqRes.ok) aqData = await aqRes.json();
        
        // 3. Demographics
        const geoDbRes = await fetch(`/api/geodb-proxy?city=${city}&countryCode=${countryCode}`);
        let geoDbData = {};
        if (geoDbRes.ok) geoDbData = await geoDbRes.json();
        
        // 4. Aggregation
        const cityDetail = geoDbData.data?.[0] || {};

        aggregatedData = {
            cityName: weatherData.name, 
            country: weatherData.sys.country,
            weather: {
                temp: Math.round(weatherData.main.temp),
                humidity: weatherData.main.humidity,
                condition: weatherData.weather[0].description,
                main: weatherData.weather[0].main 
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

        // --- UI UPDATE ---
        document.getElementById('ui-city').innerText = aggregatedData.cityName;
        const countryEl = document.getElementById('ui-country');
        if(countryEl) countryEl.innerText = aggregatedData.country;
        
        document.getElementById('ui-temp').innerText = aggregatedData.weather.temp;
        document.getElementById('ui-condition').innerText = aggregatedData.weather.condition; 
        
        document.getElementById('ui-humidity').innerText = aggregatedData.weather.humidity;
        document.getElementById('ui-aqi').innerText = aggregatedData.airQuality.aqi;
        document.getElementById('ui-pollutant').innerText = aggregatedData.airQuality.pollutant;
        document.getElementById('ui-population').innerText = aggregatedData.demographics.population;
        document.getElementById('ui-elevation').innerText = aggregatedData.demographics.elevation;

        if(window.updateBackground) window.updateBackground(aggregatedData.weather.main);

        document.getElementById('results').classList.remove('hidden');
        document.getElementById('jsonDisplay').innerText = JSON.stringify(aggregatedData, null, 2);

    } catch (error) {
        console.error("Error fetching data:", error);
        alert(`Failed to fetch city data: ${error.message}`);
    }
}

// --- SAVE DATA ---
async function sendToBackend() {
    const userRes = await fetch('/current-user');
    const user = await userRes.json();

    if (!user) {
        const msg = document.getElementById('statusMsg');
        msg.innerText = "Please log in first.";
        msg.style.color = "#ff6b6b";
        return;
    }
    
    if (Object.keys(aggregatedData).length === 0) return;

    const response = await fetch('/api/save-city-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': APP_API_KEY 
        },
        body: JSON.stringify(aggregatedData)
    });

    const result = await response.json();
    const msg = document.getElementById('statusMsg');
    msg.innerText = result.message || result.error;
    msg.style.color = response.ok ? "#4ade80" : "#ff6b6b";
}

// --- HISTORICAL CHART LOGIC ---
async function fetchHistory() {
    const city = aggregatedData.cityName;
    if (!city) return alert("Please analyze a city first.");

    try {
        const response = await fetch(`/api/history?city=${city}`);
        const historyData = await response.json();

        if (historyData.length === 0) {
            alert("No historical data found for " + city + ". Try saving some data first!");
            return;
        }

        renderChart(historyData);
        document.getElementById('chart-section').classList.remove('hidden');
        
        // Scroll to chart smoothly inside the main content area
        document.querySelector('.main-content').scrollTop = document.querySelector('.main-content').scrollHeight;

    } catch (error) {
        console.error("History Error:", error);
        alert("Failed to load history.");
    }
}

function renderChart(data) {
    const ctx = document.getElementById('historyChart').getContext('2d');

    // Prepare labels (time) and data (temp)
    const labels = data.map(entry => {
        const date = new Date(entry.timestamp);
        return date.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' ' + date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
    });
    
    const temperatures = data.map(entry => entry.weather.temp);

    // Destroy previous chart instance if it exists
    if (myChart) myChart.destroy();

    // Create new Histogram (Bar Chart) - Dark Theme Styles
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Temperature (°C)',
                data: temperatures,
                backgroundColor: 'rgba(74, 144, 226, 0.6)', // Accent Blue
                borderColor: 'rgba(74, 144, 226, 1)',
                borderWidth: 1,
                barThickness: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#ffffff' } } // White legend
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0' },
                    title: { display: true, text: 'Temp (°C)', color: '#a0a0a0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0a0' }
                }
            }
        }
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const cityInput = document.getElementById('cityInput');
    if (cityInput) {
        cityInput.value = "Colombo";
        fetchCityData();
    }
});