from pydantic import BaseModel, Field


class CompanyProfile(BaseModel):
    id: str = "workspace-company-profile"
    company_name: str = Field(default="", max_length=200)
    company_address: str = Field(default="", max_length=1000)
    company_email: str = Field(default="", max_length=200)
    company_phone: str = Field(default="", max_length=100)
    company_logo: str = Field(default="", max_length=1_500_000)