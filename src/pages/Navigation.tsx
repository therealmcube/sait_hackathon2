import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { useTheme } from '../contexts/ThemeContext';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Shield, AlertTriangle, Navigation as NavIcon, ShieldCheck, Info, X } from 'lucide-react';
import HeatmapLayer from '../components/HeatmapLayer';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

const incidentIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1008/1008927.png',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const safePlaceIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/190/190411.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Component to recenter map when location changes
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function Navigation() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const [searchParams] = useSearchParams();
  const destination = searchParams.get('dest');
  const prioritizeSafe = searchParams.get('safe') === 'true';
  const showCheckpoints = searchParams.get('checkpoints') === 'true';
  
  const { location } = useLocation();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [riskZones, setRiskZones] = useState<any[]>([]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [guardianMode, setGuardianMode] = useState(false);
  const [locationHistory, setLocationHistory] = useState<[number, number][]>([]);
  const [showLegend, setShowLegend] = useState(false);

  // Mock safe places
  const safePlaces = [
    { id: 1, name: 'Central Police Station', lat: location?.latitude ? location.latitude + 0.005 : 0, lng: location?.longitude ? location.longitude + 0.005 : 0 },
    { id: 2, name: 'City Hospital', lat: location?.latitude ? location.latitude - 0.004 : 0, lng: location?.longitude ? location.longitude + 0.002 : 0 },
  ];

  useEffect(() => {
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then((docSnap) => {
        if (docSnap.exists()) {
          setGuardianMode(docSnap.data().guardian_mode || false);
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (location) {
      setLocationHistory(prev => {
        // Only add if location changed significantly to avoid clutter
        const last = prev[prev.length - 1];
        if (!last || Math.abs(last[0] - location.latitude) > 0.0001 || Math.abs(last[1] - location.longitude) > 0.0001) {
          return [...prev, [location.latitude, location.longitude]];
        }
        return prev;
      });
    }
  }, [location]);

  useEffect(() => {
    // Listen to incidents
    const qIncidents = query(collection(db, 'incident_reports'));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIncidents(data);
    });

    // Listen to risk zones
    const qZones = query(collection(db, 'risk_zones'));
    const unsubZones = onSnapshot(qZones, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRiskZones(data);
    });

    return () => {
      unsubIncidents();
      unsubZones();
    };
  }, []);

  useEffect(() => {
    // Generate mock risk zones if database is empty to demonstrate heatmap
    if (riskZones.length === 0 && location) {
      const mockZones = Array.from({ length: 20 }).map((_, i) => ({
        id: `mock-${i}`,
        latitude: location.latitude + (Math.random() - 0.5) * 0.03,
        longitude: location.longitude + (Math.random() - 0.5) * 0.03,
        risk_score: Math.random() * 100
      }));
      setRiskZones(mockZones);
    }
  }, [location, riskZones.length]);

  useEffect(() => {
    // Simulate route calculation based on location and destination
    if (location && destination) {
      // Create a mock route
      const mockRoute: [number, number][] = [
        [location.latitude, location.longitude],
        [location.latitude + 0.002, location.longitude + 0.002],
        [location.latitude + 0.004, location.longitude + 0.001],
        [location.latitude + 0.006, location.longitude + 0.003],
      ];
      setRoute(mockRoute);
      
      // Calculate mock risk score
      const score = prioritizeSafe ? Math.floor(Math.random() * 30) : Math.floor(Math.random() * 100);
      setRiskScore(score);
    }
  }, [location, destination, prioritizeSafe]);

  if (!location) {
    return (
      <div className={`flex h-screen items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-black text-white'}`}>
        <div className="flex flex-col items-center gap-4">
          <NavIcon className="h-8 w-8 animate-spin text-purple-500" />
          <p>Acquiring GPS signal...</p>
        </div>
      </div>
    );
  }

  const getRiskColor = (score: number) => {
    if (score <= 30) return isDarkMode ? 'text-emerald-400 bg-emerald-900/40 ring-emerald-800' : 'text-emerald-500 bg-emerald-50 ring-emerald-200';
    if (score <= 60) return isDarkMode ? 'text-amber-400 bg-amber-900/40 ring-amber-800' : 'text-amber-500 bg-amber-50 ring-amber-200';
    return isDarkMode ? 'text-red-400 bg-red-900/40 ring-red-800' : 'text-red-500 bg-red-50 ring-red-200';
  };

  const getRiskLabel = (score: number) => {
    if (score <= 30) return 'Safe Route';
    if (score <= 60) return 'Moderate Risk';
    return 'High Risk';
  };

  // Prepare heatmap points: [lat, lng, intensity (0-1)]
  const heatmapPoints: [number, number, number][] = riskZones.map(zone => [
    zone.latitude,
    zone.longitude,
    (zone.risk_score || 50) / 100
  ]);

  return (
    <div className={`relative flex h-screen flex-col transition-colors duration-300 ${isDarkMode ? 'bg-black text-white' : 'bg-blue-50/10 text-slate-900'}`}>
      {/* Top Overlay */}
      <div className="absolute left-0 right-0 top-0 z-[1000] flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md ring-1 transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] active:scale-95 ${isDarkMode ? 'bg-black ring-purple-900/50' : 'bg-white ring-blue-100'}`}
          >
            <ArrowLeft className={`h-6 w-6 ${isDarkMode ? 'text-purple-100' : 'text-blue-900'}`} />
          </button>
          
          {destination && (
            <div className={`flex flex-1 items-center justify-between rounded-2xl px-4 py-3 shadow-md ring-1 transition-colors ${getRiskColor(riskScore)}`}>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                  {getRiskLabel(riskScore)}
                </span>
                <span className="font-semibold">To: {destination}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-2xl font-black leading-none">{riskScore}</span>
                <span className="text-[10px] font-bold uppercase opacity-80">Score</span>
              </div>
            </div>
          )}

          {guardianMode && !destination && (
            <div className={`flex flex-1 items-center justify-between rounded-2xl shadow-md ring-1 transition-colors ${isDarkMode ? 'bg-purple-900/40 text-purple-400 ring-purple-800' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6" />
                <span className="font-bold">Guardian Active</span>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Tracking</span>
            </div>
          )}
        </div>
      </div>

      {/* Legend Button */}
      <button
        onClick={() => setShowLegend(true)}
        className={`absolute right-4 top-20 z-[1000] flex h-12 w-12 items-center justify-center rounded-full shadow-md ring-1 transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] active:scale-95 ${isDarkMode ? 'bg-black ring-purple-900/50' : 'bg-white ring-blue-100'}`}
        aria-label="Show Map Legend"
      >
        <Info className={`h-6 w-6 ${isDarkMode ? 'text-purple-100' : 'text-blue-900'}`} />
      </button>

      {/* Legend Modal */}
      {showLegend && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl transition-colors ${isDarkMode ? 'bg-purple-950 border border-purple-900/50' : 'bg-white'}`}>
            <div className="mb-6 flex items-center justify-between">
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-blue-950'}`}>Map Legend</h3>
              <button 
                onClick={() => setShowLegend(false)} 
                className={`rounded-full p-2 transition-colors ${isDarkMode ? 'bg-purple-900 text-purple-200 hover:bg-purple-800' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={`flex flex-col gap-5 text-sm ${isDarkMode ? 'text-purple-100' : 'text-slate-700'}`}>
              <div className="flex items-center gap-4">
                <img src="https://cdn-icons-png.flaticon.com/512/684/684908.png" className="h-8 w-8 object-contain" alt="You" />
                <span><strong>Blue Pin:</strong> Your current location.</span>
              </div>
              <div className="flex items-center gap-4">
                <img src="https://cdn-icons-png.flaticon.com/512/190/190411.png" className="h-8 w-8 object-contain" alt="Safe Place" />
                <span><strong>Shield Pin:</strong> Verified safe checkpoints (Police, Hospitals).</span>
              </div>
              <div className="flex items-center gap-4">
                <img src="https://cdn-icons-png.flaticon.com/512/1008/1008927.png" className="h-8 w-8 object-contain" alt="Incident" />
                <span><strong>Warning Pin:</strong> Community-reported incidents.</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex h-4 w-8 shrink-0 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"></div>
                <span><strong>Heatmap:</strong> Risk zones (Red = High Risk, Green = Safe).</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-1.5 w-8 shrink-0 bg-emerald-500 rounded-full"></div>
                <span><strong>Solid Line:</strong> Your calculated route. Color indicates risk level.</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-1.5 w-8 shrink-0 border-b-4 border-dashed border-emerald-500"></div>
                <span><strong>Dashed Line:</strong> Your Guardian Mode tracking trail.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div className="flex-1">
        <MapContainer
          center={[location.latitude, location.longitude]}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url={isDarkMode 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            }
          />
          <MapUpdater center={[location.latitude, location.longitude]} />

          {/* Heatmap Layer */}
          {heatmapPoints.length > 0 && <HeatmapLayer points={heatmapPoints} />}

          {/* User Location */}
          <Marker position={[location.latitude, location.longitude]} icon={customIcon}>
            <Popup>You are here</Popup>
          </Marker>

          {/* Guardian Mode Trail */}
          {guardianMode && locationHistory.length > 1 && (
            <Polyline
              positions={locationHistory}
              color="#a855f7"
              weight={4}
              dashArray="10, 10"
              opacity={0.7}
            />
          )}

          {/* Route */}
          {route.length > 0 && (
            <Polyline
              positions={route}
              color={riskScore <= 30 ? '#a855f7' : riskScore <= 60 ? '#f59e0b' : '#ef4444'}
              weight={6}
              opacity={0.8}
            />
          )}

          {/* Incidents */}
          {incidents.map((incident) => (
            <Marker
              key={incident.id}
              position={[incident.latitude, incident.longitude]}
              icon={incidentIcon}
            >
              <Popup>
                <div className="font-sans">
                  <p className="font-bold capitalize text-red-600">{incident.type}</p>
                  <p className="text-sm text-slate-600">{incident.description || 'No description provided.'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(incident.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Safe Places Checkpoints */}
          {(showCheckpoints || destination) && safePlaces.map((place) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={safePlaceIcon}
            >
              <Popup>
                <div className="font-sans">
                  <p className="font-bold text-purple-600">{place.name}</p>
                  <p className="text-sm text-slate-600">Safe Checkpoint</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Bottom Actions */}
      <div className="absolute bottom-6 left-4 right-24 z-[1000] flex flex-col gap-3">
        <button
          onClick={() => {
            // Navigate to nearest safe place
            const nearest = safePlaces[0];
            navigate(`/navigate?dest=${encodeURIComponent(nearest.name)}&safe=true`, { replace: true });
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] active:scale-[0.98] ${isDarkMode ? 'bg-purple-700' : 'bg-emerald-600'}`}
        >
          <Shield className="h-5 w-5" />
          Nearest Safe Place
        </button>
        
        {destination && (
          <button
            onClick={() => navigate('/')}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(168,85,247,0.4)] active:scale-[0.98] ${isDarkMode ? 'bg-black border border-purple-900/50' : 'bg-blue-950'}`}
          >
            End Navigation
          </button>
        )}
      </div>
    </div>
  );
}
