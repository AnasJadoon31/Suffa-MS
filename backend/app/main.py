from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
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
from app.modules.reporting.routes import router as reporting_router


import time
import logging

def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title="Madrasa Management System API", version="0.1.0")
    
    @app.middleware("http")
    async def log_requests(request, call_next):
        logger = logging.getLogger("app.request")
        start_time = time.time()
        
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            logger.info(f"{request.method} {request.url.path} - {response.status_code} - {process_time:.4f}s")
            return response
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(f"{request.method} {request.url.path} - 500 - {process_time:.4f}s - {type(e).__name__}: {str(e)}")
            raise
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(academics_router, prefix="/api/v1/academics", tags=["academics"])
    app.include_router(people_router, prefix="/api/v1/people", tags=["people"])
    app.include_router(attendance_router, prefix="/api/v1/attendance", tags=["attendance"])
    app.include_router(assessments_router, prefix="/api/v1/assessments", tags=["assessments"])
    app.include_router(finance_router, prefix="/api/v1/finance", tags=["finance"])
    app.include_router(files_router, prefix="/api/v1/files", tags=["files"])
    app.include_router(messaging_router, prefix="/api/v1/messaging", tags=["messaging"])
    app.include_router(operations_router, prefix="/api/v1/operations", tags=["operations"])
    app.include_router(reporting_router, prefix="/api/v1/reporting", tags=["reporting"])

    @app.get("/healthz", tags=["system"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "service": "mms-api"}

    return app


app = create_app()
