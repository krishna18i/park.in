import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any

class ParkInAPITester:
    def __init__(self, base_url="https://parkin-jaipur.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.user_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_user_email = f"testuser_{datetime.now().strftime('%H%M%S')}@test.com"
        self.test_user_password = "testpass123"
        self.test_user_name = "Test User"
        
        self.admin_email = "admin@parkin.com"
        self.admin_password = "admin123"
        
        self.demo_user_email = "user@parkin.com"
        self.demo_user_password = "user123"

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            'name': name,
            'success': success,
            'details': details,
            'response_data': response_data
        })

    def make_request(self, method: str, endpoint: str, data: Dict = None, token: str = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return False, {}, 0
            
            try:
                response_data = response.json()
            except:
                response_data = {'text': response.text}
            
            return response.status_code < 400, response_data, response.status_code
            
        except Exception as e:
            return False, {'error': str(e)}, 0

    def test_seed_data(self):
        """Test seeding initial data"""
        success, data, status = self.make_request('POST', 'seed')
        self.log_test("Seed Database", success, 
                     f"Status: {status}" if success else f"Failed with status {status}: {data}")
        return success

    def test_user_signup(self):
        """Test user signup"""
        signup_data = {
            'email': self.test_user_email,
            'name': self.test_user_name,
            'password': self.test_user_password
        }
        
        success, data, status = self.make_request('POST', 'auth/signup', signup_data)
        
        if success and 'token' in data:
            self.user_token = data['token']
            self.log_test("User Signup", True, f"User created with token")
        else:
            self.log_test("User Signup", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_user_login(self):
        """Test user login with demo credentials"""
        login_data = {
            'email': self.demo_user_email,
            'password': self.demo_user_password
        }
        
        success, data, status = self.make_request('POST', 'auth/login', login_data)
        
        if success and 'token' in data:
            self.user_token = data['token']
            self.log_test("User Login", True, f"Login successful")
        else:
            self.log_test("User Login", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_admin_login(self):
        """Test admin login"""
        login_data = {
            'email': self.admin_email,
            'password': self.admin_password
        }
        
        success, data, status = self.make_request('POST', 'auth/login', login_data)
        
        if success and 'token' in data and data.get('user', {}).get('role') == 'admin':
            self.admin_token = data['token']
            self.log_test("Admin Login", True, f"Admin login successful")
        else:
            self.log_test("Admin Login", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_user_profile(self):
        """Test getting user profile"""
        if not self.user_token:
            self.log_test("Get User Profile", False, "No user token available")
            return False
        
        success, data, status = self.make_request('GET', 'auth/me', token=self.user_token)
        
        if success and 'email' in data:
            self.log_test("Get User Profile", True, f"Profile retrieved for {data['email']}")
        else:
            self.log_test("Get User Profile", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_locations(self):
        """Test getting all locations"""
        success, data, status = self.make_request('GET', 'locations')
        
        if success and isinstance(data, list) and len(data) > 0:
            self.log_test("Get Locations", True, f"Retrieved {len(data)} locations")
            # Store first location for later tests
            self.test_location_id = data[0]['id']
            return True
        else:
            self.log_test("Get Locations", False, f"Status: {status}, Data: {data}")
            return False

    def test_get_location_by_id(self):
        """Test getting specific location"""
        if not hasattr(self, 'test_location_id'):
            self.log_test("Get Location by ID", False, "No location ID available")
            return False
        
        success, data, status = self.make_request('GET', f'locations/{self.test_location_id}')
        
        if success and 'name' in data:
            self.log_test("Get Location by ID", True, f"Retrieved location: {data['name']}")
        else:
            self.log_test("Get Location by ID", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_parking_slots(self):
        """Test getting parking slots for a location"""
        if not hasattr(self, 'test_location_id'):
            self.log_test("Get Parking Slots", False, "No location ID available")
            return False
        
        success, data, status = self.make_request('GET', f'slots/{self.test_location_id}')
        
        if success and isinstance(data, list) and len(data) > 0:
            self.log_test("Get Parking Slots", True, f"Retrieved {len(data)} slots")
            # Store a vacant slot for booking test
            vacant_slots = [slot for slot in data if slot['status'] == 'vacant']
            if vacant_slots:
                self.test_slot_id = vacant_slots[0]['id']
            return True
        else:
            self.log_test("Get Parking Slots", False, f"Status: {status}, Data: {data}")
            return False

    def test_create_booking(self):
        """Test creating a booking"""
        if not self.user_token:
            self.log_test("Create Booking", False, "No user token available")
            return False
        
        if not hasattr(self, 'test_slot_id') or not hasattr(self, 'test_location_id'):
            self.log_test("Create Booking", False, "No slot or location ID available")
            return False
        
        # Create booking for 2 hours from now
        start_time = datetime.now() + timedelta(hours=1)
        end_time = start_time + timedelta(hours=2)
        
        booking_data = {
            'slot_id': self.test_slot_id,
            'location_id': self.test_location_id,
            'start_time': start_time.isoformat(),
            'end_time': end_time.isoformat()
        }
        
        success, data, status = self.make_request('POST', 'bookings', booking_data, self.user_token)
        
        if success and 'id' in data:
            self.test_booking_id = data['id']
            self.log_test("Create Booking", True, f"Booking created: {data['id']}")
        else:
            self.log_test("Create Booking", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_user_bookings(self):
        """Test getting user bookings"""
        if not self.user_token:
            self.log_test("Get User Bookings", False, "No user token available")
            return False
        
        success, data, status = self.make_request('GET', 'bookings', token=self.user_token)
        
        if success and isinstance(data, list):
            self.log_test("Get User Bookings", True, f"Retrieved {len(data)} bookings")
        else:
            self.log_test("Get User Bookings", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_cash_payment(self):
        """Test cash payment"""
        if not self.user_token or not hasattr(self, 'test_booking_id'):
            self.log_test("Cash Payment", False, "No user token or booking ID available")
            return False
        
        payment_data = {
            'booking_id': self.test_booking_id,
            'amount': 100.0,
            'method': 'cash'
        }
        
        success, data, status = self.make_request('POST', 'payments/cash', payment_data, self.user_token)
        
        if success and data.get('status') == 'success':
            self.log_test("Cash Payment", True, "Payment processed successfully")
        else:
            self.log_test("Cash Payment", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_razorpay_order_creation(self):
        """Test Razorpay order creation (mock)"""
        if not self.user_token or not hasattr(self, 'test_booking_id'):
            self.log_test("Razorpay Order Creation", False, "No user token or booking ID available")
            return False
        
        order_data = {
            'amount': 100.0,
            'booking_id': self.test_booking_id
        }
        
        success, data, status = self.make_request('POST', 'payments/create-order', order_data, self.user_token)
        
        if success and 'order_id' in data:
            self.test_order_id = data['order_id']
            self.log_test("Razorpay Order Creation", True, f"Order created: {data['order_id']}")
        else:
            self.log_test("Razorpay Order Creation", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_payment_verification(self):
        """Test payment verification (mock)"""
        if not self.user_token or not hasattr(self, 'test_order_id') or not hasattr(self, 'test_booking_id'):
            self.log_test("Payment Verification", False, "Missing required data for verification")
            return False
        
        verify_data = {
            'razorpay_order_id': self.test_order_id,
            'razorpay_payment_id': 'mock_payment_id',
            'razorpay_signature': 'mock_signature',
            'booking_id': self.test_booking_id
        }
        
        success, data, status = self.make_request('POST', 'payments/verify', verify_data, self.user_token)
        
        if success and data.get('status') == 'success':
            self.log_test("Payment Verification", True, "Payment verified successfully")
        else:
            self.log_test("Payment Verification", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_admin_stats(self):
        """Test admin stats endpoint"""
        if not self.admin_token:
            self.log_test("Admin Stats", False, "No admin token available")
            return False
        
        success, data, status = self.make_request('GET', 'admin/stats', token=self.admin_token)
        
        if success and 'total_locations' in data:
            self.log_test("Admin Stats", True, f"Stats: {data['total_locations']} locations, {data['total_bookings']} bookings")
        else:
            self.log_test("Admin Stats", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_get_all_bookings_admin(self):
        """Test admin getting all bookings"""
        if not self.admin_token:
            self.log_test("Get All Bookings (Admin)", False, "No admin token available")
            return False
        
        success, data, status = self.make_request('GET', 'bookings/all', token=self.admin_token)
        
        if success and isinstance(data, list):
            self.log_test("Get All Bookings (Admin)", True, f"Retrieved {len(data)} bookings")
        else:
            self.log_test("Get All Bookings (Admin)", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_create_location_admin(self):
        """Test admin creating a new location"""
        if not self.admin_token:
            self.log_test("Create Location (Admin)", False, "No admin token available")
            return False
        
        location_data = {
            'name': 'Test Location',
            'address': 'Test Address, Jaipur',
            'image': 'https://images.unsplash.com/photo-1701087366618-112f1b333a9f?crop=entropy&cs=srgb&fm=jpg&q=85',
            'description': 'Test location for automated testing',
            'total_slots': 20,
            'rows': 4,
            'cols': 5
        }
        
        success, data, status = self.make_request('POST', 'locations', location_data, self.admin_token)
        
        if success and 'id' in data:
            self.test_created_location_id = data['id']
            self.log_test("Create Location (Admin)", True, f"Location created: {data['id']}")
        else:
            self.log_test("Create Location (Admin)", False, f"Status: {status}, Data: {data}")
        
        return success

    def test_delete_location_admin(self):
        """Test admin deleting a location"""
        if not self.admin_token or not hasattr(self, 'test_created_location_id'):
            self.log_test("Delete Location (Admin)", False, "No admin token or location ID available")
            return False
        
        success, data, status = self.make_request('DELETE', f'locations/{self.test_created_location_id}', token=self.admin_token)
        
        if success:
            self.log_test("Delete Location (Admin)", True, "Location deleted successfully")
        else:
            self.log_test("Delete Location (Admin)", False, f"Status: {status}, Data: {data}")
        
        return success

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Park.in Backend API Tests")
        print("=" * 50)
        
        # Test sequence
        test_sequence = [
            ("Seed Data", self.test_seed_data),
            ("User Signup", self.test_user_signup),
            ("User Login", self.test_user_login),
            ("Admin Login", self.test_admin_login),
            ("Get User Profile", self.test_get_user_profile),
            ("Get Locations", self.test_get_locations),
            ("Get Location by ID", self.test_get_location_by_id),
            ("Get Parking Slots", self.test_get_parking_slots),
            ("Create Booking", self.test_create_booking),
            ("Get User Bookings", self.test_get_user_bookings),
            ("Cash Payment", self.test_cash_payment),
            ("Razorpay Order Creation", self.test_razorpay_order_creation),
            ("Payment Verification", self.test_payment_verification),
            ("Admin Stats", self.test_admin_stats),
            ("Get All Bookings (Admin)", self.test_get_all_bookings_admin),
            ("Create Location (Admin)", self.test_create_location_admin),
            ("Delete Location (Admin)", self.test_delete_location_admin),
        ]
        
        for test_name, test_func in test_sequence:
            try:
                test_func()
            except Exception as e:
                self.log_test(test_name, False, f"Exception: {str(e)}")
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All backend tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    tester = ParkInAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())