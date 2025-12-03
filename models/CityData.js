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
    population: String, 
    elevation: String
  },
  user: String // Stores the user ID who saved this
});

module.exports = mongoose.model('CityData', CityDataSchema);