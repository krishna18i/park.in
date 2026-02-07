import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.user.role !== 'admin') {
        toast.error('Access denied. Admin credentials required.');
        return;
      }
      toast.success('Admin login successful!');
      navigate('/admin/dashboard');
    } catch (error) {
      console.error('Admin login failed:', error);
      toast.error('Invalid admin credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'hsl(32, 50%, 97%)' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl p-8 shadow-lg border-t-4 border-secondary" data-testid="admin-login-form">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-secondary" />
            </div>
            <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Admin Login
            </h1>
            <p className="text-muted-foreground">Access the admin dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="admin-email">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-lg border-2 border-input bg-white px-4 pl-12 w-full focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all outline-none"
                  placeholder="Enter admin email"
                  required
                  data-testid="admin-email-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" htmlFor="admin-password">
                Admin Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-lg border-2 border-input bg-white px-4 pl-12 w-full focus:border-secondary focus:ring-2 focus:ring-secondary/20 transition-all outline-none"
                  placeholder="Enter admin password"
                  required
                  data-testid="admin-password-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 h-12 px-8 rounded-full font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="admin-submit-button"
            >
              {loading ? 'Logging in...' : 'Admin Login'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-primary hover:underline" data-testid="admin-user-login-link">
              ← Back to User Login
            </Link>
          </div>

          <div className="mt-6 p-4 bg-secondary/10 rounded-lg text-sm">
            <p className="font-semibold mb-1">Demo Admin:</p>
            <p>admin@parkin.com / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;