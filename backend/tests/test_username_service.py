"""
ISS3-009: Username auto-generation unit tests

Tests for the username normalization and generation service.
"""

import pytest
from uuid import uuid4

from app.modules.auth.username_service import (
    normalize_name_to_username,
    generate_unique_username,
    is_username_available,
    preview_username,
)


class TestNormalizeNameToUsername:
    """Tests for normalize_name_to_username function."""

    def test_simple_name(self):
        assert normalize_name_to_username("Muhammad Ali") == "muhammad.ali"

    def test_single_name(self):
        assert normalize_name_to_username("Ahmed") == "ahmed"

    def test_multiple_names(self):
        assert normalize_name_to_username("Fatima Zahra Khan") == "fatima.zahra.khan"

    def test_uppercase(self):
        assert normalize_name_to_username("AHMED KHAN") == "ahmed.khan"

    def test_mixed_case(self):
        assert normalize_name_to_username("mUhAmMaD aLi") == "muhammad.ali"

    def test_extra_spaces(self):
        assert normalize_name_to_username("  Ahmed   Khan  ") == "ahmed.khan"

    def test_hyphenated_name(self):
        assert normalize_name_to_username("Muhammad-Ali") == "muhammad.ali"

    def test_apostrophe(self):
        assert normalize_name_to_username("O'Brien") == "o.brien"

    def test_non_latin_fallback(self):
        # Non-Latin characters should fall back to 'user'
        assert normalize_name_to_username("عائشہ بیگم") == "user"

    def test_empty_string(self):
        assert normalize_name_to_username("") == "user"

    def test_only_spaces(self):
        assert normalize_name_to_username("   ") == "user"

    def test_numbers_in_name(self):
        assert normalize_name_to_username("Muhammad 2nd") == "muhammad.2nd"

    def test_multiple_consecutive_spaces(self):
        assert normalize_name_to_username("Ahmed    Khan") == "ahmed.khan"

    def test_leading_trailing_dots(self):
        # Should strip leading/trailing dots
        assert normalize_name_to_username(".Ahmed.") == "ahmed"

    def test_special_characters(self):
        assert normalize_name_to_username("Ahmed@Khan#123") == "ahmed.khan.123"


class TestPreviewUsername:
    """Tests for preview_username function."""

    def test_preview_matches_normalize(self):
        name = "Muhammad Ali"
        assert preview_username(name) == normalize_name_to_username(name)

    def test_preview_does_not_check_uniqueness(self):
        # Preview should return the same value regardless of existing users
        name = "Muhammad Ali"
        assert preview_username(name) == "muhammad.ali"


class TestGenerateUniqueUsername:
    """Tests for generate_unique_username function."""

    @pytest.mark.asyncio
    async def test_unique_username_no_collision(self, db_session):
        """Test that a unique username is generated when no collision exists."""
        username = await generate_unique_username(db_session, "Muhammad Ali")
        assert username == "muhammad.ali"

    @pytest.mark.asyncio
    async def test_unique_username_with_collision(self, db_session):
        """Test that a suffix is added when there's a collision."""
        # Create first user
        from app.modules.auth.models import User, UserRole
        user1 = User(
            madrasa_id=uuid4(),
            username="muhammad.ali",
            password_hash="test_hash",
            role=UserRole.student,
        )
        db_session.add(user1)
        await db_session.commit()

        # Generate username for another user with same name
        username = await generate_unique_username(db_session, "Muhammad Ali")
        assert username == "muhammad.ali2"

    @pytest.mark.asyncio
    async def test_unique_username_with_multiple_collisions(self, db_session):
        """Test that incrementing suffix works for multiple collisions."""
        from app.modules.auth.models import User, UserRole
        
        # Create multiple users with similar usernames
        for i in range(1, 4):
            user = User(
                madrasa_id=uuid4(),
                username=f"ahmed.khan{i}" if i > 1 else "ahmed.khan",
                password_hash="test_hash",
                role=UserRole.student,
            )
            db_session.add(user)
        await db_session.commit()

        # Generate username should skip existing ones
        username = await generate_unique_username(db_session, "Ahmed Khan")
        assert username == "ahmed.khan4"

    @pytest.mark.asyncio
    async def test_tenant_scoped_uniqueness(self, db_session):
        """Test that uniqueness can be scoped to a tenant."""
        from app.modules.auth.models import User, UserRole
        
        madrasa_id = uuid4()
        
        # Create user in specific tenant
        user = User(
            madrasa_id=madrasa_id,
            username="fatima.zahra",
            password_hash="test_hash",
            role=UserRole.student,
        )
        db_session.add(user)
        await db_session.commit()

        # Same username should be available in different tenant
        other_madrasa_id = uuid4()
        username = await generate_unique_username(
            db_session, "Fatima Zahra", madrasa_id=other_madrasa_id
        )
        assert username == "fatima.zahra"

        # Same username should NOT be available in same tenant
        username = await generate_unique_username(
            db_session, "Fatima Zahra", madrasa_id=madrasa_id
        )
        assert username == "fatima.zahra2"


class TestIsUsernameAvailable:
    """Tests for is_username_available function."""

    @pytest.mark.asyncio
    async def test_available_username(self, db_session):
        """Test that an unused username is available."""
        available = await is_username_available(db_session, "available.user")
        assert available is True

    @pytest.mark.asyncio
    async def test_taken_username(self, db_session):
        """Test that a used username is not available."""
        from app.modules.auth.models import User, UserRole
        
        user = User(
            madrasa_id=uuid4(),
            username="taken.user",
            password_hash="test_hash",
            role=UserRole.student,
        )
        db_session.add(user)
        await db_session.commit()

        available = await is_username_available(db_session, "taken.user")
        assert available is False

    @pytest.mark.asyncio
    async def test_tenant_scoped_availability(self, db_session):
        """Test that availability can be scoped to a tenant."""
        from app.modules.auth.models import User, UserRole
        
        madrasa_id = uuid4()
        
        user = User(
            madrasa_id=madrasa_id,
            username="scoped.user",
            password_hash="test_hash",
            role=UserRole.student,
        )
        db_session.add(user)
        await db_session.commit()

        # Should be taken in same tenant
        available = await is_username_available(
            db_session, "scoped.user", madrasa_id=madrasa_id
        )
        assert available is False

        # Should be available in different tenant
        other_madrasa_id = uuid4()
        available = await is_username_available(
            db_session, "scoped.user", madrasa_id=other_madrasa_id
        )
        assert available is True