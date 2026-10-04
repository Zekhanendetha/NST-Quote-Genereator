"""Microsoft Entra access-token validation and application-role dependencies."""

import asyncio
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError, PyJWTError


ADMIN_ROLE = "Quote.Admin"
EDITOR_ROLE = "Quote.Editor"
REQUIRED_SCOPE = "access_as_user"

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class EntraUser:
    object_id: str
    display_name: str
    roles: frozenset[str]


def _required_setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Authentication is not configured: {name} is missing",
        )
    return value


@lru_cache(maxsize=8)
def _jwks_client(tenant_id: str) -> PyJWKClient:
    return PyJWKClient(
        f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys",
        cache_keys=True,
        lifespan=300,
        timeout=5,
    )


def _decode_access_token(token: str, tenant_id: str, api_client_id: str) -> dict:
    signing_key = _jwks_client(tenant_id).get_signing_key_from_jwt(token).key
    issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=api_client_id,
        issuer=issuer,
        leeway=60,
        options={"require": ["exp", "iat", "iss", "aud", "tid", "scp", "oid"]},
    )


async def require_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> EntraUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A Microsoft Entra access token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tenant_id = _required_setting("ENTRA_TENANT_ID")
    api_client_id = _required_setting("ENTRA_API_CLIENT_ID")
    spa_client_id = _required_setting("ENTRA_SPA_CLIENT_ID")

    try:
        claims = await asyncio.to_thread(
            _decode_access_token,
            credentials.credentials,
            tenant_id,
            api_client_id,
        )
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft Entra signing keys are temporarily unavailable",
        ) from exc
    except (PyJWTError, PyJWKClientError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The Microsoft Entra access token is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if str(claims.get("tid", "")).lower() != tenant_id.lower():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="The token belongs to a different tenant")
    if claims.get("azp") != spa_client_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="The token was issued to an unapproved client")

    scopes = set(str(claims.get("scp", "")).split())
    if REQUIRED_SCOPE not in scopes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The access token is missing the required API scope")

    raw_roles = claims.get("roles", [])
    roles = frozenset(raw_roles if isinstance(raw_roles, list) else [])
    return EntraUser(
        object_id=str(claims["oid"]),
        display_name=str(claims.get("name", "")),
        roles=roles,
    )


def require_any_role(*allowed_roles: str) -> Callable:
    allowed = frozenset(allowed_roles)

    async def check_role(user: EntraUser = Depends(require_authenticated_user)) -> EntraUser:
        if not user.roles.intersection(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account does not have permission to perform this action",
            )
        return user

    return check_role
