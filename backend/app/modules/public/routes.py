"""Unauthenticated website endpoints (B12/B16).

Everything here is keyed by an unguessable token — the madrasa's `public_key`
(contact form, blog feed) or an admission form's `public_token` — instead of
the X-Madrasa header, so the main website can integrate W3Forms-style without
exposing tenant slugs or requiring auth. Rate limiting is applied per route.
"""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import enforce_rate_limit
from app.core.storage import StorageNotConfigured, UploadRejected, assert_upload_allowed, build_object_key, presign_upload_url
from app.db.core_models import FileObject
from app.db.session import get_session
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, paginate_scalars
from app.modules.academics.models import Madrasa, Program
from app.modules.operations.models import AdmissionApplication, AdmissionForm, BlogPost, ContactEnquiry
from app.modules.operations.admissions import (
    admission_answer_date,
    admission_answer_text,
    normalize_admission_fields,
    validate_admission_answers,
)
from app.modules.operations.schemas import (
    AdmissionApplicationRead,
    BlogPostRead,
    ContactEnquiryCreate,
    FormFieldDefinition,
)

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
    program_name: str | None = None
    programs: list[dict[str, str]] = Field(default_factory=list)
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
    programs = (
        await session.execute(
            select(Program)
            .where(Program.madrasa_id == form.madrasa_id)
            .order_by(Program.name.asc())
        )
    ).scalars().all()
    return PublicAdmissionFormRead(
        title=form.title,
        description=form.description,
        program_name=program.name if program else "",
        programs=[{"id": str(item.id), "name": item.name} for item in programs],
        fields_definition=normalize_admission_fields(form.fields_definition or []),
        is_open=form.is_open,
    )


class PublicAdmissionSubmission(BaseModel):
    applicant_name: str = Field(default="", max_length=160)
    guardian_contact: str = Field(default="", max_length=60)
    date_of_birth: str | None = None
    program_id: UUID
    extra_data: dict = Field(default_factory=dict)
    website: str = ""  # honeypot


class PublicAdmissionUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=80)
    size_bytes: int = Field(ge=1)


class PublicAdmissionUploadRead(BaseModel):
    object_key: str
    upload_url: str


@router.post("/admission-forms/{public_token}/uploads", response_model=PublicAdmissionUploadRead)
async def upload_public_admission_file(
    public_token: str,
    payload: PublicAdmissionUploadRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> PublicAdmissionUploadRead:
    await _throttle(request, "admission-upload")
    form = (
        await session.execute(select(AdmissionForm).where(AdmissionForm.public_token == public_token))
    ).scalar_one_or_none()
    if form is None:
        raise HTTPException(status_code=404, detail="Unknown admission form")
    if not form.is_open:
        raise HTTPException(status_code=403, detail="This admission form is closed")
    try:
        assert_upload_allowed(
            payload.content_type,
            payload.size_bytes,
            filename=payload.filename,
            category="admission-applications",
        )
        object_key = build_object_key(form.madrasa_id, "admission-applications", payload.filename)
        upload_url = presign_upload_url(object_key, payload.content_type, size_bytes=payload.size_bytes)
    except UploadRejected as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except StorageNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    session.add(
        FileObject(
            madrasa_id=form.madrasa_id,
            object_key=object_key,
            content_type=payload.content_type,
            file_size=payload.size_bytes,
            owner_id=form.created_by_id,
        )
    )
    await session.commit()
    return PublicAdmissionUploadRead(object_key=object_key, upload_url=upload_url)


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

    program = await session.get(Program, payload.program_id)
    if program is None or program.madrasa_id != form.madrasa_id:
        raise HTTPException(status_code=422, detail="Select a valid program")

    fields_definition = normalize_admission_fields(form.fields_definition or [])
    independent = payload.extra_data.get("student_is_independent") is True
    validate_admission_answers(fields_definition, payload.extra_data, require_guardian=not independent)
    dob = admission_answer_date(payload.extra_data, "student_date_of_birth")
    if dob is None and payload.date_of_birth:
        dob = admission_answer_date({"student_date_of_birth": payload.date_of_birth}, "student_date_of_birth")

    application = AdmissionApplication(
        madrasa_id=form.madrasa_id,
        applicant_name=admission_answer_text(payload.extra_data, "student_name") or payload.applicant_name,
        guardian_contact=admission_answer_text(payload.extra_data, "guardian_phone_numbers") or payload.guardian_contact,
        program_id=program.id,
        date_of_birth=dob,
        form_id=form.id,
        extra_data=payload.extra_data or None,
        form_title_snapshot=form.title,
        fields_definition_snapshot=fields_definition,
        status_history=[{
            "status": "pending",
            "changed_at": datetime.now(UTC).isoformat(),
            "changed_by_id": None,
        }],
    )
    session.add(application)
    await session.commit()
    await session.refresh(application)
    return AdmissionApplicationRead.model_validate(application)
