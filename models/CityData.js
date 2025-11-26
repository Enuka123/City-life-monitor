const mongoose = require('mongoose');

const CityDataSchema = new mongoose.Schema({
  cityName: String,
  country: String,
  timestamp: { type: Date, default: Date.now },
  weather: {
    temp: Number,
    humidity: Number,
    condition: String
  },
  airQuality: {
    aqi: Number,
    pollutant: String
  },
  demographics: {
    // Changed from Number to String so they can accept "N/A"
    population: String, 
    elevation: String
  },
  user: String // Stores which user saved this data (OAuth)
});

module.exports = mongoose.model('CityData', CityDataSchema);