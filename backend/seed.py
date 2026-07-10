import asyncio
import os
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text

# Load environment variables (simulate dotenv)
from dotenv import load_dotenv
load_dotenv()

from app.core.config import settings
from app.core.security import hash_password
from app.modules.academics.models import Madrasa
from app.modules.auth.models import User, UserRole, UserStatus

async def seed():
    engine = create_async_engine(settings.database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    
    async with SessionLocal() as session:
        # 1. Create a Madrasa
        madrasa_id = uuid4()
        madrasa = Madrasa(
            id=madrasa_id,
            slug="suffa",
            name="Suffa Madrasa",
            content_language="ur"
        )
        session.add(madrasa)
        
        # 2. Create an Admin User
        user = User(
            id=uuid4(),
            madrasa_id=madrasa_id,
            username="admin",
            password_hash=await hash_password("password123"),
            role="principal",
            status="active",
            preferred_language="en",
            portal_enabled=True
        )
        session.add(user)
        
        await session.commit()
        print(f"Successfully seeded database!")
        print(f"Madrasa: suffa")
        print(f"User: admin")
        print(f"Password: password123")
        print(f"Madrasa ID (for headers): {madrasa_id}")

if __name__ == "__main__":
    asyncio.run(seed())
