"""JWT + bcrypt auth yardımcıları."""
import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY          = os.environ.get("JWT_SECRET", "change-me-in-production-please")
ALGORITHM           = "HS256"
TOKEN_EXPIRE_DAYS   = 7
ADMIN_INVITE_CODE   = os.environ.get("ADMIN_INVITE_CODE", "")

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: int, role: str) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": expire},
                      SECRET_KEY, algorithm=ALGORITHM)

def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")

def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(status_code=401, detail="Giriş gerekli")
    return _decode(token)

def get_optional_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return None
    try:
        return _decode(token)
    except Exception:
        return None

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin yetkisi gerekli")
    return user
