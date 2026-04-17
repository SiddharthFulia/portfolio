import { useState, useRef, useCallback } from 'react';
import { nasaUrl, NASA_API_KEY } from './utils';

const PRESETS = [
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { label: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { label: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { label: 'Paris', lat: 48.8566, lon: 2.3522 },
  { label: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { label: 'São Paulo', lat: -23.5505, lon: -46.6333 },
  { label: 'Cairo', lat: 30.0444, lon: 31.2357 },
  { label: 'Grand Canyon', lat: 36.1069, lon: -112.1129 },
  { label: 'Amazon Rainforest', lat: -3.4653, lon: -62.2159 },
  { label: 'Sahara Desert', lat: 23.4162, lon: 25.6628 },
];

const EarthImagery = () => {
  const [lat, setLat] = useState('40.7128');
  const [lon, setLon] = useState('-74.006');
  const [date, setDate] = useState('2024-01-01');
  const [dim, setDim] = useState(0.15);
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const imgRef = useRef(null);

  const fetchImage = useCallback(() => {
    if (!lat || !lon) return;
    setLoading(true);
    setError(null);

    // Earth imagery endpoint returns an image directly (not JSON)
    const url = `https://api.nasa.gov/planetary/earth/imagery?lon=${lon}&lat=${lat}&date=${date}&dim=${dim}&api_key=${NASA_API_KEY}`;
    setImageUrl(url);
  }, [lat, lon, date, dim]);

  const handlePreset = (preset) => {
    setLat(String(preset.lat));
    setLon(String(preset.lon));
  };

  const handleImgLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleImgError = () => {
    setLoading(false);
    setError('No satellite imagery available for this location and date. Try adjusting the date or coordinates.');
    setImageUrl(null);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Latitude</label>
          <input
            type="number"
            step="0.001"
            value={lat}
            onChange={e => setLat(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="-90 to 90"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Longitude</label>
          <input
            type="number"
            step="0.001"
            value={lon}
            onChange={e => setLon(e.target.value)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="-180 to 180"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Zoom (dim: {dim}°)</label>
          <input
            type="range"
            min="0.02"
            max="0.5"
            step="0.01"
            value={dim}
            onChange={e => setDim(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-2"
          />
        </div>
      </div>

      {/* Preset locations */}
      <div>
        <span className="text-xs text-gray-500 mb-2 block">Quick Locations</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                lat === String(p.lat) && lon === String(p.lon)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fetch button */}
      <button
        onClick={fetchImage}
        disabled={loading}
        className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 text-sm"
      >
        {loading ? 'Loading Satellite Image...' : 'Fetch Satellite Image'}
      </button>

      {/* Error */}
      {error && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl text-yellow-400 text-sm">
          {error}
        </div>
      )}

      {/* Image display */}
      {imageUrl && (
        <div className="rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
          {loading && (
            <div className="h-96 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`Satellite imagery at ${lat}, ${lon}`}
            className={`w-full ${loading ? 'hidden' : 'block'}`}
            onLoad={handleImgLoad}
            onError={handleImgError}
          />
          {!loading && !error && (
            <div className="px-4 py-3 bg-gray-800/60 border-t border-gray-700/50 flex flex-wrap gap-4 text-xs text-gray-400">
              <span>Lat: <span className="text-white font-mono">{lat}°</span></span>
              <span>Lon: <span className="text-white font-mono">{lon}°</span></span>
              <span>Date: <span className="text-white font-mono">{date}</span></span>
              <span>Dim: <span className="text-white font-mono">{dim}°</span></span>
            </div>
          )}
        </div>
      )}

      {/* No image yet */}
      {!imageUrl && !error && (
        <div className="h-64 rounded-2xl border border-gray-800 bg-gray-900/50 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-12 h-12 text-gray-700 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
              <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
            <p className="text-gray-600 text-sm">Pick a location and click Fetch</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EarthImagery;
