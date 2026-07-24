FROM python:3.13.5-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --system --uid 10001 capsicum
COPY pyproject.toml worker.py ./
USER capsicum
CMD ["python", "worker.py", "health"]
