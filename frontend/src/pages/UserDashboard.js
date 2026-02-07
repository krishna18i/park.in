import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { Calendar, MapPin, CreditCard, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UserDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API}/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBookings(response.data);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle className="w-3 h-3" />
            Confirmed
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8" data-testid="dashboard-header">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
            My <span className="text-primary">Bookings</span>
          </h1>
          <p className="text-muted-foreground">View and manage your parking reservations</p>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl h-48 animate-pulse" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-lg" data-testid="no-bookings">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">No Bookings Yet</h2>
            <p className="text-muted-foreground mb-6">Start by booking a parking slot at your favorite location</p>
            <button
              onClick={() => navigate('/')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
              data-testid="browse-locations-button"
            >
              Browse Locations
            </button>
          </div>
        ) : (
          <div className="grid gap-6" data-testid="bookings-list">
            {bookings.map((booking, index) => (
              <div
                key={booking.id}
                className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all border border-border/50"
                data-testid={`booking-card-${index}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        {booking.location_name}
                      </h3>
                      {getStatusBadge(booking.status)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <MapPin className="w-4 h-4" />
                      <span>Slot {booking.slot_number}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-primary">₹{booking.total_amount.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">Start Time</p>
                    </div>
                    <p className="font-semibold">{format(new Date(booking.start_time), 'PPP')}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(booking.start_time), 'p')}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <p className="text-sm font-medium text-muted-foreground">End Time</p>
                    </div>
                    <p className="font-semibold">{format(new Date(booking.end_time), 'PPP')}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(booking.end_time), 'p')}</p>
                  </div>
                </div>

                <div className="mt-4 text-xs text-muted-foreground">
                  Booked on {format(new Date(booking.created_at), 'PPP')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDashboard;