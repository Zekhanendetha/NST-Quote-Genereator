from fastapi import APIRouter, Depends

from lib.auth import ADMIN_ROLE, EDITOR_ROLE, require_any_role
from lib.db import db
from models.company_profile import CompanyProfile


router = APIRouter(prefix="/company-profile", tags=["company-profile"])


@router.get("", response_model=CompanyProfile, dependencies=[Depends(require_any_role(ADMIN_ROLE, EDITOR_ROLE))])
async def get_company_profile():
    document = await db.company_profiles.find_one({"id": "workspace-company-profile"})
    return CompanyProfile(**document) if document else CompanyProfile()


@router.put("", response_model=CompanyProfile, dependencies=[Depends(require_any_role(ADMIN_ROLE))])
async def update_company_profile(payload: CompanyProfile):
    profile = payload.model_copy(update={"id": "workspace-company-profile"})
    await db.company_profiles.replace_one(
        {"id": profile.id},
        profile.model_dump(),
        upsert=True,
    )
    return profile
