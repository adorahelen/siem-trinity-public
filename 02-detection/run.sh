#!/bin/bash
# siem-ai-detector 실행 래퍼
# lightgbm libgomp 의존성 해결을 위해 LD_LIBRARY_PATH 설정
set -a
source "$(dirname "$0")/.env"
set +a
exec python3 "$@"
