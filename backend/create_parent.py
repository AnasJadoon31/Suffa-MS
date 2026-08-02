import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.db.models import User, StudentProfile, Guardian, StudentGuardian
import uuid
import datetime

async def main():
    engine = create_async_engine('postgresql+asyncpg://mms:mms_password@localhost:5432/mms')
    session_maker = async_sessionmaker(engine)
    async with session_maker() as session:
        # Get student1
        student_user = (await session.execute(select(User).where(User.username == 'student1'))).scalar_one_or_none()
        if not student_user:
            print("student1 not found")
            return
            
        student_profile = (await session.execute(select(StudentProfile).where(StudentProfile.user_id == student_user.id))).scalar_one_or_none()
        
        # Check if parent user exists
        parent_user = (await session.execute(select(User).where(User.username == 'parent1'))).scalar_one_or_none()
        
        if not parent_user:
            parent_user = User(
                madrasa_id=student_user.madrasa_id,
                username='parent1',
                password_hash='x', # The seed uses 'x' for simple login if no hashing? Wait, passlib? seed.py just sets 'x' if using some dummy password logic, let's see. In seed_full.py, password_hash='x'. Wait, if it's 'x', how do we login? Ah, the frontend bypasses passwords if env is local? Or password is just 'password' and hash is 'x'? No, `seed_full.py` uses `x` for password_hash? Let's check `seed_full.py`.
            )
            
        print("Will investigate password next.")

asyncio.run(main())
