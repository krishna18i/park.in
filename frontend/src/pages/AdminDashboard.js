import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  MapPin,
  Plus,
  Trash2,
  Edit,
  DollarSign,
  Calendar,
  Car,
  Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [locations, setLocations] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({
    name: '',
    address: '',
    image: '',
    description: '',
    total_slots: 48,
    rows: 6,
    cols: 8
  });
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [locationsRes, bookingsRes, statsRes] = await Promise.all([
        axios.get(`${API}/locations`),
        axios.get(`${API}/bookings/all`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setLocations(locationsRes.data);
      setBookings(bookingsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post(`${API}/locations`, newLocation, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Location added successfully!');
      setShowAddLocation(false);
      setNewLocation({
        name: '',
        address: '',
        image: '',
        description: '',
        total_slots: 48,
        rows: 6,
        cols: 8
      });
      fetchData();
    } catch (error) {
      console.error('Failed to add location:', error);
      toast.error('Failed to add location');
    }
  };

  const handleDeleteLocation = async (locationId) => {
    if (!window.confirm('Are you sure you want to delete this location?')) {
      return;
    }

    try {
      await axios.delete(`${API}/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Location deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Failed to delete location:', error);
      toast.error('Failed to delete location');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="text-xl font-semibold">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8" data-testid="admin-dashboard-header">
          <h1
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Admin <span className="text-secondary">Dashboard</span>
          </h1>
          <p className="text-muted-foreground">Manage locations, slots, and bookings</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8 overflow-x-auto" data-testid="admin-tabs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 rounded-full font-semibold transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-white text-foreground hover:bg-muted'
            }`}
            data-testid="tab-overview"
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`px-6 py-3 rounded-full font-semibold transition-all whitespace-nowrap ${
              activeTab === 'locations'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-white text-foreground hover:bg-muted'
            }`}
            data-testid="tab-locations"
          >
            Locations
          </button>
          <button
            onClick={() => setActiveTab('bookings')}
            className={`px-6 py-3 rounded-full font-semibold transition-all whitespace-nowrap ${
              activeTab === 'bookings'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-white text-foreground hover:bg-muted'
            }`}
            data-testid="tab-bookings"
          >
            Bookings
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div data-testid="overview-section">
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-lg border-t-4 border-primary">
                <div className="flex items-center justify-between mb-4">
                  <MapPin className="w-8 h-8 text-primary" />
                  <span className="text-3xl font-bold">{stats.total_locations}</span>
                </div>
                <p className="text-muted-foreground font-medium">Total Locations</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border-t-4 border-secondary">
                <div className="flex items-center justify-between mb-4">
                  <Calendar className="w-8 h-8 text-secondary" />
                  <span className="text-3xl font-bold">{stats.total_bookings}</span>
                </div>
                <p className="text-muted-foreground font-medium">Total Bookings</p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border-t-4 border-accent">
                <div className="flex items-center justify-between mb-4">
                  <DollarSign className="w-8 h-8 text-accent-foreground" />
                  <span className="text-3xl font-bold">₹{stats.total_revenue.toFixed(0)}</span>
                </div>
                <p className="text-muted-foreground font-medium">Total Revenue</p>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Recent Bookings
              </h2>
              <div className="space-y-3">
                {bookings.slice(0, 5).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-4 bg-muted/30 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold">{booking.location_name}</p>
                      <p className="text-sm text-muted-foreground">Slot {booking.slot_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">₹{booking.total_amount.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">{booking.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Locations Tab */}
        {activeTab === 'locations' && (
          <div data-testid="locations-section">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Manage Locations
              </h2>
              <button
                onClick={() => setShowAddLocation(!showAddLocation)}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-full font-bold shadow-md transition-all"
                data-testid="add-location-button"
              >
                <Plus className="w-5 h-5" />
                Add Location
              </button>
            </div>

            {showAddLocation && (
              <div className="bg-white rounded-xl p-6 shadow-lg mb-6" data-testid="add-location-form">
                <h3 className="text-xl font-bold mb-4">Add New Location</h3>
                <form onSubmit={handleAddLocation} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Location Name</label>
                      <input
                        type="text"
                        value={newLocation.name}
                        onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                        className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        required
                        data-testid="location-name-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Address</label>
                      <input
                        type="text"
                        value={newLocation.address}
                        onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                        className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        required
                        data-testid="location-address-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Image URL</label>
                    <input
                      type="url"
                      value={newLocation.image}
                      onChange={(e) => setNewLocation({ ...newLocation, image: e.target.value })}
                      className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      required
                      data-testid="location-image-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Description</label>
                    <textarea
                      value={newLocation.description}
                      onChange={(e) => setNewLocation({ ...newLocation, description: e.target.value })}
                      className="rounded-lg border-2 border-input bg-white px-4 py-3 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      rows="3"
                      data-testid="location-description-input"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Total Slots</label>
                      <input
                        type="number"
                        value={newLocation.total_slots}
                        onChange={(e) => setNewLocation({ ...newLocation, total_slots: parseInt(e.target.value) })}
                        className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        required
                        min="1"
                        data-testid="location-slots-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Rows</label>
                      <input
                        type="number"
                        value={newLocation.rows}
                        onChange={(e) => setNewLocation({ ...newLocation, rows: parseInt(e.target.value) })}
                        className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        required
                        min="1"
                        data-testid="location-rows-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Columns</label>
                      <input
                        type="number"
                        value={newLocation.cols}
                        onChange={(e) => setNewLocation({ ...newLocation, cols: parseInt(e.target.value) })}
                        className="h-12 rounded-lg border-2 border-input bg-white px-4 w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                        required
                        min="1"
                        data-testid="location-cols-input"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="submit"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg transition-all"
                      data-testid="submit-location-button"
                    >
                      Add Location
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddLocation(false)}
                      className="border-2 border-border hover:bg-muted h-12 px-8 rounded-full font-bold transition-all"
                      data-testid="cancel-location-button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {locations.map((location, index) => (
                <div
                  key={location.id}
                  className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all border border-border/50"
                  data-testid={`location-card-${index}`}
                >
                  <img
                    src={location.image}
                    alt={location.name}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      {location.name}
                    </h3>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
                      <MapPin className="w-4 h-4" />
                      <span>{location.address}</span>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Available Slots</p>
                        <p className="font-bold text-lg">
                          {location.available_slots}/{location.total_slots}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Grid</p>
                        <p className="font-bold text-lg">
                          {location.rows}×{location.cols}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteLocation(location.id)}
                      className="w-full flex items-center justify-center gap-2 bg-destructive text-destructive-foreground hover:opacity-90 h-10 px-4 rounded-full font-semibold transition-all"
                      data-testid={`delete-location-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div data-testid="bookings-section">
            <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
              All Bookings
            </h2>
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-4 font-semibold">Location</th>
                      <th className="text-left p-4 font-semibold">Slot</th>
                      <th className="text-left p-4 font-semibold">Date</th>
                      <th className="text-left p-4 font-semibold">Amount</th>
                      <th className="text-left p-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking, index) => (
                      <tr key={booking.id} className="border-b hover:bg-muted/20" data-testid={`booking-row-${index}`}>
                        <td className="p-4">{booking.location_name}</td>
                        <td className="p-4 font-semibold">{booking.slot_number}</td>
                        <td className="p-4 text-sm">
                          {format(new Date(booking.start_time), 'PPP')}
                        </td>
                        <td className="p-4 font-bold text-primary">₹{booking.total_amount.toFixed(2)}</td>
                        <td className="p-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              booking.status === 'confirmed'
                                ? 'bg-green-100 text-green-700'
                                : booking.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
