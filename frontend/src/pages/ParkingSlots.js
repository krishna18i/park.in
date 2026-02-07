import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Calendar, Clock, MapPin, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ParkingSlots = () => {
  const { locationId } = useParams();
  const [location, setLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const { token } = useAuth();
  const { slotUpdates } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [locationId]);

  useEffect(() => {
    // Update slots on WebSocket messages
    if (slotUpdates.length > 0) {
      const latestUpdate = slotUpdates[slotUpdates.length - 1];
      setSlots((prevSlots) =>
        prevSlots.map((slot) =>
          slot.id === latestUpdate.id ? { ...slot, status: latestUpdate.status } : slot
        )
      );
    }
  }, [slotUpdates]);

  const fetchData = async () => {
    try {
      const [locationRes, slotsRes] = await Promise.all([
        axios.get(`${API}/locations/${locationId}`),
        axios.get(`${API}/slots/${locationId}`)
      ]);
      setLocation(locationRes.data);
      setSlots(slotsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load parking data');
    } finally {
      setLoading(false);
    }
  };

  const handleSlotClick = (slot) => {
    if (slot.status === 'vacant') {
      setSelectedSlot(slot);
    }
  };

  const handleBooking = async () => {
    if (!selectedSlot || !startTime || !endTime) {
      toast.error('Please select a slot and time');
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      toast.error('End time must be after start time');
      return;
    }

    setBooking(true);

    try {
      const response = await axios.post(
        `${API}/bookings`,
        {
          slot_id: selectedSlot.id,
          location_id: locationId,
          start_time: start.toISOString(),
          end_time: end.toISOString()
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success('Slot reserved! Proceed to payment.');
      navigate(`/booking/${response.data.id}`);
    } catch (error) {
      console.error('Booking failed:', error);
      toast.error(error.response?.data?.detail || 'Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const getSlotClassName = (slot) => {
    const baseClass = 'aspect-[2/3] rounded-md border-2 flex flex-col items-center justify-center font-bold text-sm transition-all shadow-sm';
    
    if (selectedSlot?.id === slot.id) {
      return `${baseClass} bg-blue-600 border-blue-600 text-white shadow-lg scale-110 ring-4 ring-blue-200 cursor-pointer`;
    }
    
    switch (slot.status) {
      case 'vacant':
        return `${baseClass} bg-white border-green-500 text-green-700 hover:bg-green-50 hover:scale-105 cursor-pointer`;
      case 'occupied':
        return `${baseClass} bg-red-50 border-red-200 text-red-300 cursor-not-allowed opacity-80`;
      case 'reserved':
        return `${baseClass} bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed striped-bg`;
      default:
        return baseClass;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'vacant':
        return 'text-green-600';
      case 'occupied':
        return 'text-red-600';
      case 'reserved':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="text-xl font-semibold">Loading parking data...</div>
        </div>
      </div>
    );
  }

  // Create grid layout
  const grid = [];
  if (location) {
    for (let row = 0; row < location.rows; row++) {
      const rowSlots = slots.filter((s) => s.row === row);
      grid.push(rowSlots.sort((a, b) => a.col - b.col));
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Location Header */}
        {location && (
          <div className="mb-8" data-testid="location-header">
            <div className="flex items-start gap-6">
              <img
                src={location.image}
                alt={location.name}
                className="w-48 h-32 object-cover rounded-xl shadow-md"
              />
              <div className="flex-1">
                <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {location.name}
                </h1>
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>{location.address}</span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-white border-2 border-green-500 rounded" />
                    <span className="font-medium">{location.available_slots} Vacant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-50 border-2 border-red-200 rounded" />
                    <span className="font-medium">Occupied</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-100 border-2 border-gray-300 rounded striped-bg" />
                    <span className="font-medium">Reserved</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Parking Grid */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-lg" data-testid="parking-grid">
              <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Select Your Parking Slot
              </h2>
              
              <div className="space-y-4">
                {grid.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex gap-4 justify-center">
                    {row.map((slot) => (
                      <div
                        key={slot.id}
                        className={getSlotClassName(slot)}
                        onClick={() => handleSlotClick(slot)}
                        data-testid={`parking-slot-${slot.slot_number}`}
                      >
                        <Car className="w-5 h-5 mb-1" />
                        <span>{slot.slot_number}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Booking Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-lg sticky top-24" data-testid="booking-form">
              <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Book Your Slot
              </h2>

              {selectedSlot ? (
                <div className="space-y-6">
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Car className="w-5 h-5 text-primary" />
                      <span className="font-bold text-lg">Slot {selectedSlot.slot_number}</span>
                    </div>
                    <p className={`text-sm font-medium ${getStatusColor(selectedSlot.status)}`}>
                      Status: {selectedSlot.status.toUpperCase()}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Calendar className="w-4 h-4 inline mr-2" />
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      data-testid="start-time-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      <Clock className="w-4 h-4 inline mr-2" />
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      min={startTime || new Date().toISOString().slice(0, 16)}
                      className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      data-testid="end-time-input"
                    />
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Pricing</p>
                    <p className="text-2xl font-bold text-foreground">₹50 <span className="text-base font-normal">/hour</span></p>
                  </div>

                  <button
                    onClick={handleBooking}
                    disabled={booking || !startTime || !endTime}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                    data-testid="book-now-button"
                  >
                    {booking ? 'Booking...' : 'Book Now'}
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Car className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a vacant slot to begin booking</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParkingSlots;