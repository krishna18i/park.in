import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { MapPin, Car, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Home = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await axios.get(`${API}/locations`);
      setLocations(response.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const handleLocationClick = (locationId) => {
    if (!user) {
      toast.error('Please login to book parking');
      navigate('/login');
      return;
    }
    navigate(`/parking/${locationId}`);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <Navbar />
      
      {/* Hero Section */}
      <div className="relative overflow-hidden" data-testid="hero-section">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1701087366618-112f1b333a9f?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="Jaipur Heritage"
            className="w-full h-full object-cover opacity-20"
          />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1
              className="text-5xl md:text-7xl tracking-tight leading-none font-bold text-foreground"
              style={{ fontFamily: 'Outfit, sans-serif' }}
              data-testid="hero-title"
            >
              Find Your Perfect
              <br />
              <span className="text-primary">Parking Spot</span>
            </h1>
            <p className="text-lg leading-relaxed text-muted-foreground max-w-2xl mx-auto" data-testid="hero-subtitle">
              Book parking slots at Jaipur's most popular tourist destinations.
              Real-time availability, instant booking, hassle-free experience.
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              {user ? (
                <button
                  onClick={() => window.scrollTo({ top: 600, behavior: 'smooth' })}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 flex items-center gap-2"
                  data-testid="hero-browse-button"
                >
                  <span>Browse Locations</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/signup')}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
                    data-testid="hero-signup-button"
                  >
                    Get Started
                  </button>
                  <button
                    onClick={() => navigate('/login')}
                    className="border-2 border-primary text-primary hover:bg-primary/10 h-12 px-8 rounded-full font-bold transition-all"
                    data-testid="hero-login-button"
                  >
                    Login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Locations Section */}
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-24" data-testid="locations-section">
        <div className="text-center mb-12">
          <h2
            className="text-4xl md:text-5xl tracking-tight font-bold mb-4"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Popular <span className="text-secondary">Locations</span>
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Explore parking options at Jaipur's iconic tourist destinations
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl h-80 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 auto-rows-[300px]">
            {locations.map((location, index) => (
              <div
                key={location.id}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-md hover:shadow-2xl transition-all duration-300 border border-border/50 cursor-pointer"
                onClick={() => handleLocationClick(location.id)}
                data-testid={`location-card-${index}`}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animation: 'fadeIn 0.5s ease-out forwards'
                }}
              >
                <div className="absolute inset-0">
                  <img
                    src={location.image}
                    alt={location.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    {location.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm mb-3 opacity-90">
                    <MapPin className="w-4 h-4" />
                    <span>{location.address}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                      <Car className="w-4 h-4" />
                      <span className="font-semibold">
                        {location.available_slots}/{location.total_slots} Available
                      </span>
                    </div>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Features Section */}
      <div className="bg-white/50 backdrop-blur-sm py-16" data-testid="features-section">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Car className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Real-Time Availability
              </h3>
              <p className="text-muted-foreground">
                Check live parking slot availability and book instantly
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8 text-secondary" />
              </div>
              <h3 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Prime Locations
              </h3>
              <p className="text-muted-foreground">
                Parking at all major tourist attractions in Jaipur
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto">
                <ArrowRight className="w-8 h-8 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Easy Booking
              </h3>
              <p className="text-muted-foreground">
                Simple 3-step process to secure your parking spot
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;