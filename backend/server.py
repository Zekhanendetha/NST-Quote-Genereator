import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from lib.auth import ADMIN_ROLE, EDITOR_ROLE, EntraUser, require_any_role, require_authenticated_user
from routers.quotes import router as quotes_router
from routers.company_profile import router as company_profile_router

# MongoDB connection
from lib.db import client, db, ensure_indexes


# Startup runs before the yield, shutdown after it. Add your own setup/teardown here.
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "NASAKTION Quote Generator API ready"}


@api_router.get("/me")
async def current_user(user: EntraUser = Depends(require_any_role(ADMIN_ROLE, EDITOR_ROLE))):
    return {"object_id": user.object_id, "display_name": user.display_name, "roles": sorted(user.roles)}


api_router.include_router(quotes_router)
api_router.include_router(company_profile_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if origin.strip()],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Keep the /api router mounted last so every route is served through the proxy prefix.
app.include_router(api_router)
