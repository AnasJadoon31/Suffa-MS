"""Unauthenticated website endpoints (B12/B16).

Everything here is keyed by an unguessable token — the madrasa's `public_key`
(contact form, blog feed) or an admission form's `public_token` — instead of
the X-Madrasa header, so the main website can integrate W3Forms-style without
exposing tenant slugs or requiring auth. Rate limiting is applied per route.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_session
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.modules.academics.models import Madrasa, Program
from app.modules.operations.models import AdmissionApplication, AdmissionForm, BlogPost, ContactEnquiry
from app.modules.operations.schemas import AdmissionApplicationRead, BlogPostRead, ContactEnquiryCreate

router = APIRouter()

PUBLIC_RATE_LIMIT = 30          # requests
PUBLIC_RATE_WINDOW_SECONDS = 60


async def _madrasa_by_key(session: AsyncSession, public_key: str) -> Madrasa:
    madrasa = (
        await session.execute(select(Madrasa).where(Madrasa.public_key == public_key))
    ).scalar_one_or_none()
    if madrasa is None:
        raise HTTPException(status_code=404, detail="Unknown public key")
    return madrasa


async def _throttle(request: Request, bucket: str) -> None:
    client = request.client.host if request.client else "unknown"
    await enforce_rate_limit(
        f"public:{bucket}:{client}", limit=PUBLIC_RATE_LIMIT, window_seconds=PUBLIC_RATE_WINDOW_SECONDS
    )


class PublicContactRequest(ContactEnquiryCreate):
    # Honeypot: real users never fill this hidden field; bots do.
    website: str = ""


@router.post("/contact/{public_key}")
async def submit_contact_enquiry(
    public_key: str,
    payload: PublicContactRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    await _throttle(request, "contact")
    madrasa = await _madrasa_by_key(session, public_key)
    if payload.website:
        # Honeypot tripped — pretend success, store nothing.
        return {"status": "ok"}
    enquiry = ContactEnquiry(
        madrasa_id=madrasa.id, name=payload.name, contact=payload.contact, message=payload.message
    )
    session.add(enquiry)
    await session.commit()
    return {"status": "ok"}


@router.get("/blog/{public_key}", response_model=list[BlogPostRead])
async def public_blog_feed(
    public_key: str,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> list[BlogPostRead]:
    await _throttle(request, "blog")
    madrasa = await _madrasa_by_key(session, public_key)
    rows = await paginate_scalars(
        session,
        select(BlogPost)
            .where(BlogPost.madrasa_id == madrasa.id, BlogPost.published.is_(True))
            .order_by(BlogPost.created_at.desc()),
        limit=limit, offset=offset, response=response,
    )
    return [BlogPostRead.model_validate(row) for row in rows]


class PublicAdmissionFormRead(BaseModel):
    title: str
    description: str
    program_name: str
    fields_definition: list
    is_open: bool


@router.get("/admission-forms/{public_token}", response_model=PublicAdmissionFormRead)
async def get_public_admission_form(
    public_token: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PublicAdmissionFormRead:
    await _throttle(request, "admission-form")
    form = (
        await session.execute(select(AdmissionForm).where(AdmissionForm.public_token == public_token))
    ).scalar_one_or_none()
    if form is None:
        raise HTTPException(status_code=404, detail="Unknown admission form")
    program = await session.get(Program, form.program_id)
    return PublicAdmissionFormRead(
        title=form.title,
        description=form.description,
        program_name=program.name if program else "",
        fields_definition=form.fields_definition or [],
        is_open=form.is_open,
    )


class PublicAdmissionSubmission(BaseModel):
    applicant_name: str = Field(min_length=2, max_length=160)
    guardian_contact: str = Field(min_length=3, max_length=60)
    date_of_birth: str | None = None
    extra_data: dict = {}
    website: str = ""  # honeypot


@router.post("/admission-forms/{public_token}", response_model=AdmissionApplicationRead)
async def submit_public_admission(
    public_token: str,
    payload: PublicAdmissionSubmission,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AdmissionApplicationRead:
    await _throttle(request, "admission-submit")
    form = (
        await session.execute(select(AdmissionForm).where(AdmissionForm.public_token == public_token))
    ).scalar_one_or_none()
    if form is None:
        raise HTTPException(status_code=404, detail="Unknown admission form")
    if not form.is_open:
        raise HTTPException(status_code=403, detail="This admission form is closed")
    if payload.website:
        raise HTTPException(status_code=400, detail="Invalid submission")

    from datetime import date as date_type

    dob = None
    if payload.date_of_birth:
        try:
            dob = date_type.fromisoformat(payload.date_of_birth)
        except ValueError:
            raise HTTPException(status_code=400, detail="date_of_birth must be YYYY-MM-DD")

    application = AdmissionApplication(
        madrasa_id=form.madrasa_id,
        applicant_name=payload.applicant_name,
        guardian_contact=payload.guardian_contact,
        program_id=form.program_id,
        date_of_birth=dob,
        form_id=form.id,
        extra_data=payload.extra_data or None,
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)
    return AdmissionApplicationRead.model_validate(application)
