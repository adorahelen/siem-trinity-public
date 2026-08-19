#!/bin/bash
# Phase 7: ModSecurity WAF 적용 스크립트
set -e

# 스크립트 위치 기반 자동 감지 (01-collection/scripts/ 의 부모 = 01-collection)
PROJ="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

echo "[1/4] modsecurity_includes.conf (CRS 활성화) 적용..."
sudo cp "$PROJ/config/modsecurity_includes.conf" /etc/nginx/modsecurity_includes.conf

echo "[2/4] kangminlog nginx 설정 적용..."
# 본인 사이트의 nginx 서버블록을 배치한다 (공개판에는 개인 사이트 설정 미포함)
sudo cp "$PROJ/config/nginx-site.conf.example" /etc/nginx/sites-available/mysite
# symlink는 이미 존재하므로 재생성 불필요

echo "[3/4] nginx 설정 검증..."
sudo nginx -t

echo "[4/4] nginx 재시작..."
sudo systemctl reload nginx

echo "✅ ModSecurity WAF 적용 완료 (DetectionOnly 모드)"
echo "   로그 위치: /var/log/nginx/modsec_audit.log"
echo "   탐지 테스트: curl 'https://<your-domain>/?id=1 OR 1=1'"
