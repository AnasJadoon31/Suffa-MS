"""
ISS3-009: Username auto-generation service

Usernames are proposed automatically from the person's normalized name using a
deterministic tenant-unique suffix strategy for collisions. The proposal is
visible and editable before account creation; final uniqueness is enforced
atomically server-side.
"""

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User


def normalize_name_to_username(name: str) -> str:
    """Normalize a person's name to a username base.
    
    - Lowercase
    - Replace non-alphanumeric characters with dots
    - Strip leading/trailing dots
    - Collapse multiple dots
    - Fallback to 'user' if empty
    
    Examples:
        "Muhammad Ali" -> "muhammad.ali"
        "Ahmed Khan" -> "ahmed.khan"
        "Fatima Zahra" -> "fatima.zahra"
        "عائشہ بیگم" -> "user" (non-Latin fallback)
    """
    # Convert to lowercase
    normalized = name.lower().strip()
    
    # Replace non-alphanumeric characters (including spaces, punctuation) with dots
    normalized = re.sub(r"[^a-z0-9]+", ".", normalized)
    
    # Strip leading/trailing dots
    normalized = normalized.strip(".")
    
    # Collapse multiple consecutive dots
    normalized = re.sub(r"\.{2,}", ".", normalized)
    
    # Fallback if empty (e.g., name was all non-Latin characters)
    if not normalized:
        return "user"
    
    return normalized


async def generate_unique_username(session: AsyncSession, name: str, madrasa_id: UUID | None = None) -> str:
    """Generate a unique username from a person's name.
    
    If madrasa_id is provided, uniqueness is scoped to the tenant.
    Otherwise, uniqueness is global across the platform.
    
    Args:
        session: Database session
        name: Person's display name
        madrasa_id: Optional tenant ID for tenant-scoped uniqueness
        
    Returns:
        A unique username string
    """
    base = normalize_name_to_username(name)
    candidate = base
    suffix = 1
    
    while True:
        # Check uniqueness
        query = select(User.id).where(User.username == candidate)
        if madrasa_id is not None:
            query = query.where(User.madrasa_id == madrasa_id)
        
        existing = await session.execute(query)
        if existing.scalar_one_or_none() is None:
            return candidate
        
        # Try next suffix
        suffix += 1
        candidate = f"{base}{suffix}"


async def is_username_available(session: AsyncSession, username: str, madrasa_id: UUID | None = None) -> bool:
    """Check if a username is available.
    
    Args:
        session: Database session
        username: Username to check
        madrasa_id: Optional tenant ID for tenant-scoped uniqueness
        
    Returns:
        True if username is available, False otherwise
    """
    query = select(User.id).where(User.username == username)
    if madrasa_id is not None:
        query = query.where(User.madrasa_id == madrasa_id)
    
    existing = await session.execute(query)
    return existing.scalar_one_or_none() is None


def preview_username(name: str) -> str:
    """Preview what the username would be without checking uniqueness.
    
    Useful for showing the user a proposal before they commit to creating
    the account.
    
    Args:
        name: Person's display name
        
    Returns:
        Proposed username (may not be unique)
    """
    return normalize_name_to_username(name)