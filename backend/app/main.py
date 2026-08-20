"""Park.in API -- FastAPI application entrypoint."""
import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, EXPIRY_SWEEP_SECONDS, SEED_ON_STARTUP
from .database import Base, SessionLocal, engine
from .realtime import manager
from .routers import admin, auth, bookings, locations, payments
from .seed import seed
from .services import expire_stale_bookings, slot_event

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s"
)
logger = logging.getLogger("parkin")


async def _expiry_sweeper() -> None:
    """Release slots whose unpaid reservations have run out of time.

    A booking that is created but never paid for would otherwise hold its slot
    forever. Everything freed here is broadcast so open grids repaint live.
    """
    while True:
        await asyncio.sleep(EXPIRY_SWEEP_SECONDS)
        try:
            db = SessionLocal()
            try:
                freed = expire_stale_bookings(db)
                for slot in freed:
                    await manager.broadcast("slot.updated", slot_event(slot))
                if freed:
                    logger.info("expired %d unpaid reservation(s)", len(freed))
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:  # a sweep failure must not kill the loop
            logger.exception("expiry sweep failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)

    if SEED_ON_STARTUP:
        db = SessionLocal()
        try:
            if seed(db):
                logger.info("demo data created")
        finally:
            db.close()

    sweeper = asyncio.create_task(_expiry_sweeper())
    logger.info("Park.in API ready -- docs at http://localhost:8000/docs")
    try:
        yield
    finally:
        sweeper.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sweeper


app = FastAPI(
    title="Park.in API",
    description="Smart parking for Jaipur's heritage sites.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(locations.router)
api.include_router(bookings.router)
api.include_router(payments.router)
api.include_router(admin.router)


@api.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "live_clients": manager.count}


app.include_router(api)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Live slot feed.

    A plain WebSocket, so the browser connects with `new WebSocket(url)` and no
    client library. The server pushes; anything a client sends is ignored, but
    it is read so ping/pong and close frames are processed.
    """
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("websocket closed unexpectedly", exc_info=True)
    finally:
        await manager.disconnect(websocket)
