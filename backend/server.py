from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import razorpay
import json
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Secret
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"

# Razorpay Client
razorpay_key_id = os.environ.get('RAZORPAY_KEY_ID', '')
razorpay_key_secret = os.environ.get('RAZORPAY_KEY_SECRET', '')
razorpay_client = razorpay.Client(auth=(razorpay_key_id, razorpay_key_secret)) if razorpay_key_id else None

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

# Enums
class SlotStatus(str, Enum):
    VACANT = "vacant"
    OCCUPIED = "occupied"
    RESERVED = "reserved"

class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

class PaymentMethod(str, Enum):
    CASH = "cash"
    PHONEPE = "phonepe"
    GOOGLEPAY = "googlepay"
    PAYTM = "paytm"
    RAZORPAY = "razorpay"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"

class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    password: str
    role: UserRole = UserRole.USER
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str

class Location(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    address: str
    image: str
    description: Optional[str] = ""
    total_slots: int
    rows: int
    cols: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LocationCreate(BaseModel):
    name: str
    address: str
    image: str
    description: Optional[str] = ""
    total_slots: int
    rows: int
    cols: int

class LocationResponse(BaseModel):
    id: str
    name: str
    address: str
    image: str
    description: str
    total_slots: int
    rows: int
    cols: int
    available_slots: int = 0

class ParkingSlot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    location_id: str
    slot_number: str
    status: SlotStatus = SlotStatus.VACANT
    row: int
    col: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ParkingSlotCreate(BaseModel):
    location_id: str
    slot_number: str
    row: int
    col: int

class ParkingSlotUpdate(BaseModel):
    status: SlotStatus

class ParkingSlotResponse(BaseModel):
    id: str
    location_id: str
    slot_number: str
    status: str
    row: int
    col: int

class Booking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    slot_id: str
    location_id: str
    location_name: str
    slot_number: str
    start_time: datetime
    end_time: datetime
    total_amount: float
    status: BookingStatus = BookingStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BookingCreate(BaseModel):
    slot_id: str
    location_id: str
    start_time: datetime
    end_time: datetime

class BookingResponse(BaseModel):
    id: str
    user_id: str
    slot_id: str
    location_id: str
    location_name: str
    slot_number: str
    start_time: datetime
    end_time: datetime
    total_amount: float
    status: str
    created_at: datetime

class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    booking_id: str
    amount: float
    method: PaymentMethod
    status: PaymentStatus = PaymentStatus.PENDING
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    booking_id: str
    amount: float
    method: PaymentMethod

class RazorpayOrderCreate(BaseModel):
    amount: float
    booking_id: str

class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    booking_id: str

# Helper functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({'id': payload['user_id']}, {'_id': 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Auth Routes
@api_router.post("/auth/signup")
async def signup(user_data: UserCreate):
    existing = await db.users.find_one({'email': user_data.email}, {'_id': 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        email=user_data.email,
        name=user_data.name,
        password=hash_password(user_data.password),
        role=UserRole.USER
    )
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.users.insert_one(doc)
    
    token = create_token(user.id, user.role.value)
    return {
        'token': token,
        'user': UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role.value
        )
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({'email': credentials.email}, {'_id': 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user['id'], user['role'])
    return {
        'token': token,
        'user': UserResponse(
            id=user['id'],
            email=user['email'],
            name=user['name'],
            role=user['role']
        )
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user['id'],
        email=user['email'],
        name=user['name'],
        role=user['role']
    )

# Location Routes
@api_router.get("/locations", response_model=List[LocationResponse])
async def get_locations():
    locations = await db.locations.find({}, {'_id': 0}).to_list(1000)
    result = []
    for loc in locations:
        vacant_count = await db.parking_slots.count_documents({
            'location_id': loc['id'],
            'status': SlotStatus.VACANT.value
        })
        result.append(LocationResponse(
            id=loc['id'],
            name=loc['name'],
            address=loc['address'],
            image=loc['image'],
            description=loc.get('description', ''),
            total_slots=loc['total_slots'],
            rows=loc['rows'],
            cols=loc['cols'],
            available_slots=vacant_count
        ))
    return result

@api_router.get("/locations/{location_id}", response_model=LocationResponse)
async def get_location(location_id: str):
    location = await db.locations.find_one({'id': location_id}, {'_id': 0})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    vacant_count = await db.parking_slots.count_documents({
        'location_id': location_id,
        'status': SlotStatus.VACANT.value
    })
    
    return LocationResponse(
        id=location['id'],
        name=location['name'],
        address=location['address'],
        image=location['image'],
        description=location.get('description', ''),
        total_slots=location['total_slots'],
        rows=location['rows'],
        cols=location['cols'],
        available_slots=vacant_count
    )

@api_router.post("/locations")
async def create_location(location_data: LocationCreate, user: dict = Depends(get_admin_user)):
    location = Location(**location_data.model_dump())
    doc = location.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.locations.insert_one(doc)
    
    # Create parking slots
    slots = []
    slot_num = 1
    for row in range(location.rows):
        for col in range(location.cols):
            if slot_num > location.total_slots:
                break
            slot = ParkingSlot(
                location_id=location.id,
                slot_number=f"{chr(65 + row)}{col + 1}",
                row=row,
                col=col
            )
            slot_doc = slot.model_dump()
            slot_doc['created_at'] = slot_doc['created_at'].isoformat()
            slots.append(slot_doc)
            slot_num += 1
    
    if slots:
        await db.parking_slots.insert_many(slots)
    
    return {'message': 'Location created successfully', 'id': location.id}

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, user: dict = Depends(get_admin_user)):
    await db.locations.delete_one({'id': location_id})
    await db.parking_slots.delete_many({'location_id': location_id})
    return {'message': 'Location deleted successfully'}

# Parking Slot Routes
@api_router.get("/slots/{location_id}", response_model=List[ParkingSlotResponse])
async def get_slots(location_id: str):
    slots = await db.parking_slots.find({'location_id': location_id}, {'_id': 0}).to_list(1000)
    return [ParkingSlotResponse(**slot) for slot in slots]

@api_router.put("/slots/{slot_id}")
async def update_slot(slot_id: str, update_data: ParkingSlotUpdate, user: dict = Depends(get_admin_user)):
    await db.parking_slots.update_one(
        {'id': slot_id},
        {'$set': {'status': update_data.status.value}}
    )
    
    slot = await db.parking_slots.find_one({'id': slot_id}, {'_id': 0})
    await manager.broadcast({
        'type': 'slot_update',
        'data': slot
    })
    
    return {'message': 'Slot updated successfully'}

# Booking Routes
@api_router.post("/bookings", response_model=BookingResponse)
async def create_booking(booking_data: BookingCreate, user: dict = Depends(get_current_user)):
    slot = await db.parking_slots.find_one({'id': booking_data.slot_id}, {'_id': 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    if slot['status'] != SlotStatus.VACANT.value:
        raise HTTPException(status_code=400, detail="Slot not available")
    
    location = await db.locations.find_one({'id': booking_data.location_id}, {'_id': 0})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Calculate duration in hours
    duration = (booking_data.end_time - booking_data.start_time).total_seconds() / 3600
    total_amount = duration * 50  # ₹50 per hour
    
    booking = Booking(
        user_id=user['id'],
        slot_id=booking_data.slot_id,
        location_id=booking_data.location_id,
        location_name=location['name'],
        slot_number=slot['slot_number'],
        start_time=booking_data.start_time,
        end_time=booking_data.end_time,
        total_amount=total_amount,
        status=BookingStatus.PENDING
    )
    
    doc = booking.model_dump()
    doc['start_time'] = doc['start_time'].isoformat()
    doc['end_time'] = doc['end_time'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.bookings.insert_one(doc)
    
    # Reserve the slot
    await db.parking_slots.update_one(
        {'id': booking_data.slot_id},
        {'$set': {'status': SlotStatus.RESERVED.value}}
    )
    
    await manager.broadcast({
        'type': 'slot_update',
        'data': {'id': booking_data.slot_id, 'status': SlotStatus.RESERVED.value}
    })
    
    return BookingResponse(**booking.model_dump())

@api_router.get("/bookings", response_model=List[BookingResponse])
async def get_user_bookings(user: dict = Depends(get_current_user)):
    bookings = await db.bookings.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    for booking in bookings:
        if isinstance(booking['start_time'], str):
            booking['start_time'] = datetime.fromisoformat(booking['start_time'])
        if isinstance(booking['end_time'], str):
            booking['end_time'] = datetime.fromisoformat(booking['end_time'])
        if isinstance(booking['created_at'], str):
            booking['created_at'] = datetime.fromisoformat(booking['created_at'])
    return [BookingResponse(**booking) for booking in bookings]

@api_router.get("/bookings/all", response_model=List[BookingResponse])
async def get_all_bookings(user: dict = Depends(get_admin_user)):
    bookings = await db.bookings.find({}, {'_id': 0}).sort('created_at', -1).to_list(1000)
    for booking in bookings:
        if isinstance(booking['start_time'], str):
            booking['start_time'] = datetime.fromisoformat(booking['start_time'])
        if isinstance(booking['end_time'], str):
            booking['end_time'] = datetime.fromisoformat(booking['end_time'])
        if isinstance(booking['created_at'], str):
            booking['created_at'] = datetime.fromisoformat(booking['created_at'])
    return [BookingResponse(**booking) for booking in bookings]

# Payment Routes
@api_router.post("/payments/create-order")
async def create_razorpay_order(order_data: RazorpayOrderCreate, user: dict = Depends(get_current_user)):
    if not razorpay_client:
        # Mock payment for development without Razorpay keys
        return {
            'order_id': f'mock_order_{uuid.uuid4()}',
            'amount': order_data.amount * 100,
            'currency': 'INR',
            'key_id': 'mock_key'
        }
    
    razorpay_order = razorpay_client.order.create({
        'amount': int(order_data.amount * 100),
        'currency': 'INR',
        'payment_capture': 1
    })
    
    payment = Payment(
        booking_id=order_data.booking_id,
        amount=order_data.amount,
        method=PaymentMethod.RAZORPAY,
        razorpay_order_id=razorpay_order['id']
    )
    
    doc = payment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.payments.insert_one(doc)
    
    return {
        'order_id': razorpay_order['id'],
        'amount': razorpay_order['amount'],
        'currency': razorpay_order['currency'],
        'key_id': razorpay_key_id
    }

@api_router.post("/payments/verify")
async def verify_payment(verify_data: PaymentVerify, user: dict = Depends(get_current_user)):
    if verify_data.razorpay_order_id.startswith('mock_order_'):
        # Mock payment verification
        await db.bookings.update_one(
            {'id': verify_data.booking_id},
            {'$set': {'status': BookingStatus.CONFIRMED.value}}
        )
        
        booking = await db.bookings.find_one({'id': verify_data.booking_id}, {'_id': 0})
        await db.parking_slots.update_one(
            {'id': booking['slot_id']},
            {'$set': {'status': SlotStatus.OCCUPIED.value}}
        )
        
        await manager.broadcast({
            'type': 'slot_update',
            'data': {'id': booking['slot_id'], 'status': SlotStatus.OCCUPIED.value}
        })
        
        return {'status': 'success', 'message': 'Payment verified successfully'}
    
    # Verify signature (actual Razorpay)
    try:
        razorpay_client.utility.verify_payment_signature({
            'razorpay_order_id': verify_data.razorpay_order_id,
            'razorpay_payment_id': verify_data.razorpay_payment_id,
            'razorpay_signature': verify_data.razorpay_signature
        })
        
        await db.payments.update_one(
            {'razorpay_order_id': verify_data.razorpay_order_id},
            {'$set': {
                'status': PaymentStatus.SUCCESS.value,
                'razorpay_payment_id': verify_data.razorpay_payment_id
            }}
        )
        
        await db.bookings.update_one(
            {'id': verify_data.booking_id},
            {'$set': {'status': BookingStatus.CONFIRMED.value}}
        )
        
        booking = await db.bookings.find_one({'id': verify_data.booking_id}, {'_id': 0})
        await db.parking_slots.update_one(
            {'id': booking['slot_id']},
            {'$set': {'status': SlotStatus.OCCUPIED.value}}
        )
        
        await manager.broadcast({
            'type': 'slot_update',
            'data': {'id': booking['slot_id'], 'status': SlotStatus.OCCUPIED.value}
        })
        
        return {'status': 'success', 'message': 'Payment verified successfully'}
    except:
        await db.payments.update_one(
            {'razorpay_order_id': verify_data.razorpay_order_id},
            {'$set': {'status': PaymentStatus.FAILED.value}}
        )
        raise HTTPException(status_code=400, detail="Payment verification failed")

@api_router.post("/payments/cash")
async def cash_payment(payment_data: PaymentCreate, user: dict = Depends(get_current_user)):
    payment = Payment(
        booking_id=payment_data.booking_id,
        amount=payment_data.amount,
        method=payment_data.method,
        status=PaymentStatus.SUCCESS
    )
    
    doc = payment.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.payments.insert_one(doc)
    
    await db.bookings.update_one(
        {'id': payment_data.booking_id},
        {'$set': {'status': BookingStatus.CONFIRMED.value}}
    )
    
    booking = await db.bookings.find_one({'id': payment_data.booking_id}, {'_id': 0})
    await db.parking_slots.update_one(
        {'id': booking['slot_id']},
        {'$set': {'status': SlotStatus.OCCUPIED.value}}
    )
    
    await manager.broadcast({
        'type': 'slot_update',
        'data': {'id': booking['slot_id'], 'status': SlotStatus.OCCUPIED.value}
    })
    
    return {'status': 'success', 'message': 'Payment recorded successfully'}

# Admin Routes
@api_router.get("/admin/stats")
async def get_admin_stats(user: dict = Depends(get_admin_user)):
    total_locations = await db.locations.count_documents({})
    total_bookings = await db.bookings.count_documents({})
    total_revenue = await db.payments.aggregate([
        {'$match': {'status': PaymentStatus.SUCCESS.value}},
        {'$group': {'_id': None, 'total': {'$sum': '$amount'}}}
    ]).to_list(1)
    
    revenue = total_revenue[0]['total'] if total_revenue else 0
    
    return {
        'total_locations': total_locations,
        'total_bookings': total_bookings,
        'total_revenue': revenue
    }

# Seed data endpoint
@api_router.post("/seed")
async def seed_data():
    # Check if already seeded
    existing = await db.locations.count_documents({})
    if existing > 0:
        return {'message': 'Database already seeded'}
    
    # Create admin user
    admin = User(
        email='admin@parkin.com',
        name='Admin',
        password=hash_password('admin123'),
        role=UserRole.ADMIN
    )
    admin_doc = admin.model_dump()
    admin_doc['created_at'] = admin_doc['created_at'].isoformat()
    await db.users.insert_one(admin_doc)
    
    # Create sample user
    sample_user = User(
        email='user@parkin.com',
        name='Test User',
        password=hash_password('user123'),
        role=UserRole.USER
    )
    user_doc = sample_user.model_dump()
    user_doc['created_at'] = user_doc['created_at'].isoformat()
    await db.users.insert_one(user_doc)
    
    # Jaipur locations
    locations_data = [
        {
            'name': 'Hawa Mahal',
            'address': 'Hawa Mahal Rd, Badi Choupad, Jaipur',
            'image': 'https://images.unsplash.com/photo-1701087366618-112f1b333a9f?crop=entropy&cs=srgb&fm=jpg&q=85',
            'description': 'Palace of Winds - Iconic pink sandstone monument',
            'total_slots': 48,
            'rows': 6,
            'cols': 8
        },
        {
            'name': 'City Palace',
            'address': 'Tulsi Marg, Gangori Bazaar, Jaipur',
            'image': 'https://images.unsplash.com/photo-1607160913575-9854cbecca02?crop=entropy&cs=srgb&fm=jpg&q=85',
            'description': 'Royal residence with museums and courtyards',
            'total_slots': 60,
            'rows': 8,
            'cols': 8
        },
        {
            'name': 'Jal Mahal',
            'address': 'Amer Rd, Jal Mahal, Jaipur',
            'image': 'https://images.unsplash.com/photo-1599661046289-e31897846e41?crop=entropy&cs=srgb&fm=jpg&q=85',
            'description': 'Water Palace in the middle of Man Sagar Lake',
            'total_slots': 40,
            'rows': 5,
            'cols': 8
        },
        {
            'name': 'Nahargarh Fort',
            'address': 'Krishna Nagar, Brahampuri, Jaipur',
            'image': 'https://images.unsplash.com/photo-1609137144813-7d9921338f24?crop=entropy&cs=srgb&fm=jpg&q=85',
            'description': 'Historic fort overlooking Jaipur city',
            'total_slots': 36,
            'rows': 6,
            'cols': 6
        }
    ]
    
    for loc_data in locations_data:
        location = Location(**loc_data)
        doc = location.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        await db.locations.insert_one(doc)
        
        # Create parking slots
        slots = []
        slot_num = 1
        for row in range(location.rows):
            for col in range(location.cols):
                if slot_num > location.total_slots:
                    break
                
                # Randomly set some slots as occupied
                import random
                status = SlotStatus.OCCUPIED if random.random() < 0.3 else SlotStatus.VACANT
                
                slot = ParkingSlot(
                    location_id=location.id,
                    slot_number=f"{chr(65 + row)}{col + 1}",
                    status=status,
                    row=row,
                    col=col
                )
                slot_doc = slot.model_dump()
                slot_doc['created_at'] = slot_doc['created_at'].isoformat()
                slots.append(slot_doc)
                slot_num += 1
        
        if slots:
            await db.parking_slots.insert_many(slots)
    
    return {'message': 'Database seeded successfully'}

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()