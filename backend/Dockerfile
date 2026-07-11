FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# All requirements ship prebuilt manylinux wheels for this base image (verified
# against cp312/manylinux2014_x86_64) - no compiler toolchain needed at build
# or runtime, so skip apt-get entirely to save the layer.
COPY requirements.txt .
RUN --mount=type=cache,id=suffa-ms-backend-pip,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000

CMD ["./entrypoint.sh"]
