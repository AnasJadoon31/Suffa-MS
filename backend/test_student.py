import asyncio
from app.db.session import async_sessionmaker, engine
from app.modules.auth.models import User, UserRole
from sqlalchemy import select

async def main():
    async with async_sessionmaker(engine)() as session:
        user = (await session.execute(select(User).where(User.role == UserRole.student))).scalars().first()
        if user:
            print("Student Email:", user.email)
            print("Student Password Hash:", user.hashed_password)
            print("Student ID:", user.id)

asyncio.run(main())
