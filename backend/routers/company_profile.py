from fastapi import APIRouter

from lib.db import db
from models.company_profile import CompanyProfile


router = APIRouter(prefix="/company-profile", tags=["company-profile"])


@router.get("", response_model=CompanyProfile)
async def get_company_profile():
    document = await db.company_profiles.find_one({"id": "workspace-company-profile"})
    return CompanyProfile(**document) if document else CompanyProfile()


@router.put("", response_model=CompanyProfile)
async def update_company_profile(payload: CompanyProfile):
    profile = payload.model_copy(update={"id": "workspace-company-profile"})
    await db.company_profiles.replace_one(
        {"id": profile.id},
        profile.model_dump(),
        upsert=True,
    )
    return profile