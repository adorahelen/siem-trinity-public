# Python 런타임 only — UI 는 04-ui/ (TrinitySOC) 로 이관됨.
FROM python:3.12-slim
WORKDIR /app

# scikit-learn OpenMP 의존성 + fail2ban-client (XDR 단계 2b)
# fail2ban-client 는 호스트의 fail2ban.sock 으로 차단 명령만 송신한다.
# AUTO_BAN_ENABLED=false 기본이라 미설치 환경에서도 안전 (auto_ban.py 가 FileNotFoundError 잡음).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    fail2ban \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지
COPY requirements.docker.txt ./
RUN pip install --no-cache-dir -r requirements.docker.txt

# Python 소스 코드
COPY *.py ./
COPY api/ ./api/

# 볼륨 마운트 대상 디렉토리 생성
RUN mkdir -p reports models data

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
