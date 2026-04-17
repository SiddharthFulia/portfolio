import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchNASA, nasaUrl, glassCard, ErrorWithRetry } from './utils';

const ROVERS = [
  { id: 'curiosity', label: 'Curiosity', status: 'Active', launched: '2011', landed: '2012', color: 'from-orange-500 to-red-500' },
  { id: 'perseverance', label: 'Perseverance', status: 'Active', launched: '2020', landed: '2021', color: 'from-cyan-500 to-blue-500' },
  { id: 'opportunity', label: 'Opportunity', status: 'Complete', launched: '2003', landed: '2004', color: 'from-yellow-500 to-orange-500' },
  { id: 'spirit', label: 'Spirit', status: 'Complete', launched: '2003', landed: '2004', color: 'from-green-500 to-emerald-500' },
];

const CAMERAS = [
  { id: '', label: 'All Cameras' },
  { id: 'FHAZ', label: 'Front Hazard' },
  { id: 'RHAZ', label: 'Rear Hazard' },
  { id: 'MAST', label: 'Mast Cam' },
  { id: 'CHEMCAM', label: 'ChemCam' },
  { id: 'MAHLI', label: 'Hand Lens' },
  { id: 'MARDI', label: 'Descent' },
  { id: 'NAVCAM', label: 'Navigation' },
  { id: 'PANCAM', label: 'Panoramic' },
  { id: 'MINITES', label: 'Mini-TES' },
];

/* ── Skeleton ── */
const Skeleton = () => (
  <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-gray-800 rounded-xl" />)}
    </div>
  </div>
);

/* ── Photo Modal ── */
const PhotoModal = ({ photo, onClose }) => {
  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-gray-800/80 text-white hover:bg-gray-700 flex items-center justify-center text-xl">&times;</button>
        <img src={photo.img_src} alt={`Mars - Sol ${photo.sol}`} className="w-full max-h-[80vh] object-contain rounded-xl" />
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-white font-medium">{photo.camera?.full_name}</span>
          <span className="text-gray-400">Sol {photo.sol}</span>
          <span className="text-gray-400">{photo.earth_date}</span>
          <span className="text-gray-500 text-xs">ID: {photo.id}</span>
        </div>
      </div>
    </div>
  );
};

/* ── Main ── */
const MarsRover = () => {
  const [rover, setRover] = useState('curiosity');
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [camera, setCamera] = useState('');
  const [sol, setSol] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [roverManifest, setRoverManifest] = useState(null);
  const abortRef = useRef(null);

  const fetchPhotos = useCallback(async (roverId, cam, solNum) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    let url;
    if (solNum) {
      const params = { sol: solNum };
      if (cam) params.camera = cam;
      url = nasaUrl(`https://api.nasa.gov/mars-photos/api/v1/rovers/${roverId}/photos`, params);
    } else {
      url = nasaUrl(`https://api.nasa.gov/mars-photos/api/v1/rovers/${roverId}/latest_photos`);
    }

    const { data, error: err } = await fetchNASA(url, { signal: controller.signal });
    if (err) { setError(err); setLoading(false); return; }

    let list = data?.latest_photos || data?.photos || [];
    if (cam && !solNum) list = list.filter(p => p.camera?.name === cam);
    setPhotos(list);
    setLoading(false);
  }, []);

  // Fetch manifest
  useEffect(() => {
    const controller = new AbortController();
    fetchNASA(nasaUrl(`https://api.nasa.gov/mars-photos/api/v1/manifests/${rover}`), { signal: controller.signal })
      .then(({ data }) => {
        if (data?.photo_manifest) setRoverManifest(data.photo_manifest);
      });
    return () => controller.abort();
  }, [rover]);

  useEffect(() => {
    fetchPhotos(rover, camera, sol);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [rover, fetchPhotos]); // eslint-disable-line

  const handleCameraChange = (cam) => {
    setCamera(cam);
    fetchPhotos(rover, cam, sol);
  };

  const handleSolSubmit = (e) => {
    e.preventDefault();
    fetchPhotos(rover, camera, sol);
  };

  const roverInfo = ROVERS.find(r => r.id === rover);

  const availableCameras = useMemo(() => {
    const cams = new Set(photos.map(p => p.camera?.name));
    return CAMERAS.filter(c => c.id === '' || cams.has(c.id));
  }, [photos]);

  return (
    <div className="space-y-6">
      {/* Rover selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROVERS.map((r) => (
          <button
            key={r.id}
            onClick={() => { setRover(r.id); setCamera(''); setSol(''); }}
            className={`relative p-3 rounded-xl border text-left transition-all duration-300 overflow-hidden ${
              rover === r.id
                ? 'border-cyan-500/50 bg-gray-800 shadow-lg shadow-cyan-900/10 scale-[1.02]'
                : 'border-gray-800 bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900'
            }`}
          >
            {rover === r.id && (
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${r.color}`} />
            )}
            <div className="text-white font-bold text-sm">{r.label}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'Active' ? 'bg-green-400' : 'bg-gray-500'}`} />
              <span className="text-gray-500 text-xs">{r.status}</span>
            </div>
            <span className="text-gray-600 text-xs">Landed {r.landed}</span>
          </button>
        ))}
      </div>

      {/* Manifest stats */}
      {roverManifest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Photos', value: roverManifest.total_photos?.toLocaleString() || '—', color: 'text-cyan-400' },
            { label: 'Max Sol', value: roverManifest.max_sol?.toLocaleString() || '—', color: 'text-purple-400' },
            { label: 'Launch Date', value: roverManifest.launch_date || '—', color: 'text-orange-400' },
            { label: 'Status', value: roverManifest.status || '—', color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className={`${glassCard} p-3 text-center`}>
              <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Sol picker */}
        <form onSubmit={handleSolSubmit} className="flex items-end gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Sol (Martian day)</label>
            <input
              type="number"
              value={sol}
              onChange={(e) => setSol(e.target.value)}
              min="0"
              max={roverManifest?.max_sol || 99999}
              placeholder="Latest"
              className="w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <button type="submit" className="px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm transition-colors">
            Go
          </button>
          {sol && (
            <button
              type="button"
              onClick={() => { setSol(''); fetchPhotos(rover, camera, ''); }}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-sm transition-colors"
            >
              Latest
            </button>
          )}
        </form>

        {/* Camera filter */}
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {(sol ? CAMERAS : availableCameras).map(c => (
            <button
              key={c.id}
              onClick={() => handleCameraChange(c.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                camera === c.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700 border border-transparent'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorWithRetry error={error} onRetry={() => fetchPhotos(rover, camera, sol)} />

      {loading && <Skeleton />}

      {/* Photo grid */}
      {!loading && !error && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{photos.length} photos</span>
            {photos[0]?.earth_date && (
              <span className="text-xs text-gray-600">| Earth date: {photos[0].earth_date}</span>
            )}
            {photos[0]?.sol !== undefined && (
              <span className="text-xs text-gray-600">| Sol {photos[0].sol}</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.slice(0, 60).map((photo) => (
              <button
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="group relative rounded-xl overflow-hidden border border-gray-800 hover:border-orange-500/30 transition-all duration-300 aspect-square"
              >
                <img
                  src={photo.img_src}
                  alt={`Mars - ${photo.camera?.full_name || 'Unknown camera'}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 inset-x-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs font-medium">{photo.camera?.name || '?'}</p>
                  <p className="text-gray-400 text-[10px]">Sol {photo.sol}</p>
                </div>
              </button>
            ))}
          </div>

          {photos.length === 0 && (
            <p className="text-center text-gray-600 py-12">
              No photos found for {roverInfo?.label} {sol ? `on Sol ${sol}` : ''} {camera ? `with ${camera} camera` : ''}. Try different filters.
            </p>
          )}
        </>
      )}

      {/* Modal */}
      {selectedPhoto && <PhotoModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />}
    </div>
  );
};

export default MarsRover;
