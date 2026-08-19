# On-device AI — 기기에서 직접 실행하는 AI

> 작성일: 2026-03-19
> 이 프로젝트가 이미 On-device AI 방식으로 구현됨

---

## On-device AI란?

클라우드 서버가 아닌 **사용자의 기기(PC, 스마트폰, 맥북 등)에서 직접 AI 실행**.

```
클라우드 AI:          On-device AI (이 프로젝트):
  질문 → 인터넷         질문 → 맥북 Ollama
      → OpenAI 서버           → llama3.1:8b 로컬 실행
      → 답변 반환             → 답변 반환
  (외부 전송, 유료)     (인터넷 불필요, 무료, 보안)
```

---

## On-device AI가 주목받는 이유

| 이유 | 설명 |
|------|------|
| **프라이버시** | 민감 데이터가 외부로 나가지 않음 |
| **비용** | API 비용 없음 |
| **지연시간** | 네트워크 왕복 없음 → 빠름 |
| **오프라인** | 인터넷 없어도 동작 |
| **규정 준수** | GDPR, 보안 정책상 외부 전송 금지 환경 |

**이 프로젝트에서:** 보안 로그를 외부 API(OpenAI 등)에 절대 보내면 안 됨 → On-device가 필수.

---

## Apple Silicon과 On-device AI

MacBook M3가 On-device AI에 유리한 이유:

```
통합 메모리 아키텍처 (Unified Memory):
  CPU, GPU, Neural Engine이 같은 메모리 공유
  → VRAM 별도 없어도 16GB 전체를 GPU로 사용 가능
  → 14B 모델도 쾌적하게 실행

Metal GPU 가속:
  Ollama가 Metal API 직접 활용
  → Docker 사용 시 Metal 접근 불가 → 네이티브 설치 이유

Neural Engine (ANE):
  Apple 자체 AI 가속 칩 (16 TOPS)
  → 향후 Ollama가 ANE 지원 시 추가 성능 향상 가능
```

---

## On-device AI 생태계

| 제품/플랫폼 | 방식 | 모델 |
|-----------|------|------|
| **Apple Intelligence** | iPhone/Mac 온디바이스 | 자체 3B급 모델 |
| **Google Gemini Nano** | Android 온디바이스 | Gemini Nano (1.8B) |
| **Ollama** | Mac/Linux/Windows 로컬 | 오픈소스 모든 모델 |
| **LM Studio** | 로컬 GUI 앱 | GGUF 형식 모든 모델 |
| **Samsung Galaxy AI** | 갤럭시 온디바이스 | Llama 기반 |

---

## 이 프로젝트 = On-device AI 모범 사례

```
✅ Ollama 네이티브 (Metal 가속)
✅ 보안 로그 외부 전송 없음
✅ 인터넷 없이 동작 (Loki는 Tailscale 내부망)
✅ 비용 $0 (모델 다운로드 후 무제한 사용)
✅ MacBook M3 최적화
```
