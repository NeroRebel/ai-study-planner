"""Validated identity only; no user IDs or JWT algorithms are accepted from request data."""
from dataclasses import dataclass, field
from functools import lru_cache
from uuid import UUID
import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import Settings

bearer = HTTPBearer(auto_error=False)

@dataclass(frozen=True)
class Principal:
    user_id: UUID
    email: str = ''
    token: str = field(default='', repr=False)


def unauthorized():
    return HTTPException(401, 'Sign in with a valid, confirmed account.', headers={'WWW-Authenticate':'Bearer'})


@lru_cache(maxsize=8)
def jwks_client(origin: str):
    return jwt.PyJWKClient(origin + '/auth/v1/.well-known/jwks.json', lifespan=300, timeout=5)


def validate_token(token: str, settings: Settings) -> Principal:
    try:
        if len(token)>16384: raise unauthorized()
        header = jwt.get_unverified_header(token)  # Used only to select a fixed verification path.
        algorithm = header.get('alg')
        if algorithm not in {'ES256','RS256','HS256'}: raise unauthorized()
        if not settings.supabase_url or not settings.supabase_publishable_key:
            raise HTTPException(503, 'Authentication is not configured.')
        if algorithm in {'ES256','RS256'}:
            key = jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=['ES256','RS256'],
                audience='authenticated', issuer=settings.supabase_url+'/auth/v1',
                options={'require':['exp','iat','sub','aud','iss']})
            if claims.get('role') != 'authenticated': raise unauthorized()
        elif algorithm != 'HS256':
            raise unauthorized()
        # Supabase verifies legacy HS256 signatures; online validation also rejects
        # deleted identities for asymmetric JWTs still within their expiry.
        response = httpx.get(settings.supabase_url+'/auth/v1/user', timeout=8,
            headers={'apikey':settings.supabase_publishable_key.get_secret_value(), 'Authorization':'Bearer '+token})
        if response.status_code in {401,403,404}: raise unauthorized()
        if response.status_code != 200: raise HTTPException(503,'Authentication provider is unavailable.')
        user = response.json()
        if not user.get('email_confirmed_at') or user.get('is_anonymous'): raise unauthorized()
        user_id = UUID(user['id'])
        if algorithm != 'HS256' and str(user_id) != claims['sub']: raise unauthorized()
        return Principal(user_id, user.get('email',''), token)
    except HTTPException:
        raise
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503,'Authentication provider is unavailable.') from None
    except (jwt.InvalidTokenError, jwt.PyJWKClientError, ValueError, KeyError, TypeError):
        raise unauthorized() from None
    except httpx.HTTPError:
        raise HTTPException(503,'Authentication provider is unavailable.') from None


def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    if credentials is None or credentials.scheme.lower() != 'bearer': raise unauthorized()
    return validate_token(credentials.credentials, request.app.state.settings)
