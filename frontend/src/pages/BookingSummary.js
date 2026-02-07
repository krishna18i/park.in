import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { MapPin, Calendar, Clock, CreditCard, Banknote, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BookingSummary = () => {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');
  const [processing, setProcessing] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBooking();
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const response = await axios.get(`${API}/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const bookingData = response.data.find((b) => b.id === bookingId);
      if (!bookingData) {
        toast.error('Booking not found');
        navigate('/dashboard');
        return;
      }
      setBooking(bookingData);
    } catch (error) {
      console.error('Failed to fetch booking:', error);
      toast.error('Failed to load booking');
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpayPayment = async () => {
    setProcessing(true);

    try {
      // Create Razorpay order
      const orderResponse = await axios.post(
        `${API}/payments/create-order`,
        {
          amount: booking.total_amount,
          booking_id: booking.id
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const options = {
        key: orderResponse.data.key_id,
        amount: orderResponse.data.amount,
        currency: 'INR',
        order_id: orderResponse.data.order_id,
        name: 'Park.in',
        description: `Parking at ${booking.location_name}`,
        handler: async (response) => {
          try {
            await axios.post(
              `${API}/payments/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                booking_id: booking.id
              },
              {
                headers: { Authorization: `Bearer ${token}` }
              }
            );
            toast.success('Payment successful! Booking confirmed.');
            navigate('/dashboard');
          } catch (error) {
            toast.error('Payment verification failed');
          }
        },
        theme: {
          color: '#E65100'
        }
      };

      if (window.Razorpay) {
        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } else {
        // Fallback for mock payment
        await axios.post(
          `${API}/payments/verify`,
          {
            razorpay_order_id: orderResponse.data.order_id,
            razorpay_payment_id: 'mock_payment_id',
            razorpay_signature: 'mock_signature',
            booking_id: booking.id
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        toast.success('Payment successful! Booking confirmed.');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Payment failed:', error);
      toast.error('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCashPayment = async () => {
    setProcessing(true);

    try {
      await axios.post(
        `${API}/payments/cash`,
        {
          booking_id: booking.id,
          amount: booking.total_amount,
          method: 'cash'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      toast.success('Booking confirmed! Pay cash at the location.');
      navigate('/dashboard');
    } catch (error) {
      console.error('Cash payment failed:', error);
      toast.error('Failed to confirm booking');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = () => {
    if (paymentMethod === 'cash') {
      handleCashPayment();
    } else {
      handleRazorpayPayment();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="text-xl font-semibold">Loading booking...</div>
        </div>
      </div>
    );
  }

  if (!booking) return null;

  const duration = (new Date(booking.end_time) - new Date(booking.start_time)) / (1000 * 60 * 60);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-8 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Booking <span className="text-primary">Summary</span>
        </h1>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Booking Details */}
          <div className="bg-white rounded-xl p-8 shadow-lg border-t-4 border-primary" data-testid="booking-details">
            <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Booking Details
            </h2>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Location</p>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <p className="font-semibold text-lg">{booking.location_name}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Parking Slot</p>
                <p className="font-semibold text-lg text-secondary">{booking.slot_number}</p>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Start Time</p>
                </div>
                <p className="font-semibold">
                  {format(new Date(booking.start_time), 'PPP p')}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">End Time</p>
                </div>
                <p className="font-semibold">
                  {format(new Date(booking.end_time), 'PPP p')}
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Duration</p>
                <p className="font-semibold text-lg">{duration.toFixed(1)} hours</p>
              </div>

              <div className="bg-primary/10 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                <p className="text-3xl font-bold text-primary">₹{booking.total_amount.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-xl p-8 shadow-lg" data-testid="payment-section">
            <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Payment Method
            </h2>

            <div className="space-y-4 mb-6">
              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  paymentMethod === 'razorpay'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setPaymentMethod('razorpay')}
                data-testid="payment-method-online"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'razorpay'}
                    onChange={() => setPaymentMethod('razorpay')}
                    className="w-4 h-4 text-primary"
                  />
                  <CreditCard className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-semibold">Online Payment</p>
                    <p className="text-sm text-muted-foreground">UPI, Cards, Net Banking</p>
                  </div>
                </div>
                {paymentMethod === 'razorpay' && (
                  <div className="mt-3 pt-3 border-t flex gap-2 items-center">
                    <Smartphone className="w-4 h-4" />
                    <span className="text-xs">PhonePe, Google Pay, Paytm & more</span>
                  </div>
                )}
              </div>

              <div
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-secondary bg-secondary/5'
                    : 'border-border hover:border-secondary/50'
                }`}
                onClick={() => setPaymentMethod('cash')}
                data-testid="payment-method-cash"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="payment"
                    checked={paymentMethod === 'cash'}
                    onChange={() => setPaymentMethod('cash')}
                    className="w-4 h-4 text-secondary"
                  />
                  <Banknote className="w-5 h-5 text-secondary" />
                  <div className="flex-1">
                    <p className="font-semibold">Pay at Location</p>
                    <p className="text-sm text-muted-foreground">Cash payment on arrival</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={processing}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 rounded-full font-bold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              data-testid="confirm-payment-button"
            >
              {processing
                ? 'Processing...'
                : paymentMethod === 'cash'
                ? 'Confirm Booking'
                : `Pay ₹${booking.total_amount.toFixed(2)}`}
            </button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Your booking will be confirmed after payment
            </p>
          </div>
        </div>
      </div>

      {/* Load Razorpay script */}
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    </div>
  );
};

export default BookingSummary;