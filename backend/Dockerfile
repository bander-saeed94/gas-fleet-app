FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml /app/
RUN pip install --upgrade pip && pip install \
    "fastapi>=0.110" "uvicorn[standard]>=0.29" "pydantic>=2.5" \
    "sqlalchemy>=2.0" numpy networkx scipy \
    "qiskit>=2.0,<3.0" "qiskit-aer>=0.15" "rustworkx>=0.14"

COPY app /app/app
COPY tests /app/tests

# qaoa-repo is mounted read-only at /opt/qaoa-repo by docker-compose. We
# expose it via PYTHONPATH instead of `pip install -e` because editable
# installs need to write egg-info into the source tree, which fails on a
# read-only mount.
ENV PYTHONPATH=/app:/opt/qaoa-repo

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
