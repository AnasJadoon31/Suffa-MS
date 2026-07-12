from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.dependencies import require_feature
from app.core.logging import setup_logging
from app.modules.academics.routes import router as academics_router
from app.modules.assessments.routes import router as assessments_router
from app.modules.attendance.routes import router as attendance_router
from app.modules.auth.routes import router as auth_router
from app.modules.files.routes import router as files_router
from app.modules.finance.routes import router as finance_router
from app.modules.messaging.routes import router as messaging_router
from app.modules.operations.routes import router as operations_router
from app.modules.people.routes import router as people_router
from app.modules.platform.routes import router as platform_router
from app.modules.public.routes import router as public_router
from app.modules.reporting.routes import router as reporting_router


import time
import logging

def create_app() -> FastAPI:
    setup_logging()
    is_dev = settings.environment == "development"
    app = FastAPI(
        title="Madrasa Management System API",
        version="0.1.0",
        # Interactive docs stay off outside development (OWASP A05).
        docs_url="/docs" if is_dev else None,
        redoc_url="/redoc" if is_dev else None,
        openapi_url="/openapi.json" if is_dev else None,
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if not is_dev:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
            )
        return response

    @app.middleware("http")
    async def log_requests(request, call_next):
        logger = logging.getLogger("app.request")
        start_time = time.time()
        logger.info(f"STARTED {request.method} {request.url.path}")
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            logger.info(f"COMPLETED {request.method} {request.url.path} - {response.status_code} - {process_time:.4f}s")
            return response
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                f"{request.method} {request.url.path} - 500 - {process_time:.4f}s - {type(e).__name__}: {str(e)}",
                exc_info=True,
            )
            # Return (not re-raise) so the response still passes through
            # CORSMiddleware; a raise would surface in Starlette's outermost
            # ServerErrorMiddleware, whose response carries no CORS headers and
            # shows up in browsers as a bogus CORS failure.
            return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger = logging.getLogger("app.request")
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(platform_router, prefix="/api/v1/platform", tags=["platform"])
    # Unauthenticated website integrations, keyed by unguessable tokens.
    app.include_router(public_router, prefix="/api/v1/public", tags=["public"])
    app.include_router(academics_router, prefix="/api/v1/academics", tags=["academics"])
    app.include_router(people_router, prefix="/api/v1/people", tags=["people"])
    # Feature-gated modules: a madrasa_features row with enabled=false switches
    # the whole router off for that tenant (403). Absent row = enabled.
    app.include_router(
        attendance_router, prefix="/api/v1/attendance", tags=["attendance"],
        dependencies=[Depends(require_feature("attendance"))],
    )
    app.include_router(
        assessments_router, prefix="/api/v1/assessments", tags=["assessments"],
        dependencies=[Depends(require_feature("assessments"))],
    )
    app.include_router(
        finance_router, prefix="/api/v1/finance", tags=["finance"],
        dependencies=[Depends(require_feature("finance"))],
    )
    app.include_router(files_router, prefix="/api/v1/files", tags=["files"])
    app.include_router(
        messaging_router, prefix="/api/v1/messaging", tags=["messaging"],
        dependencies=[Depends(require_feature("messaging"))],
    )
    # operations bundles several features (timetable, holidays, forms, blog…);
    # those are gated per-route as their screens are reworked.
    app.include_router(operations_router, prefix="/api/v1/operations", tags=["operations"])
    app.include_router(reporting_router, prefix="/api/v1/reporting", tags=["reporting"])

    @app.get("/healthz", tags=["system"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": "mms-api"}

    return app


app = create_app()
