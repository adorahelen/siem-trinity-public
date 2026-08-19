# Multimodal AI

> 작성일: 2026-03-19
> 텍스트 외에 이미지, 음성, 영상도 처리하는 AI

---

## Multimodal이란?

**여러 종류의 데이터(모달리티)를 동시에 처리**하는 AI.

```
텍스트만:    "이 로그를 분석해줘" → 텍스트 답변
Multimodal:  이미지 + 텍스트 → 이미지 내용 이해 + 텍스트 분석
             음성 → 텍스트 변환 → 분석
             영상 → 장면 이해 + 설명
```

---

## 모달리티 종류

| 모달리티 | 설명 | 대표 모델 |
|---------|------|---------|
| **Text** | 텍스트 (현재 이 프로젝트) | llama3.1, qwen2.5 |
| **Image** | 이미지 이해, 생성 | GPT-4o, Claude 3.5, LLaVA |
| **Audio** | 음성 인식, 음성 생성 | Whisper, GPT-4o Audio |
| **Video** | 영상 이해 | Gemini 1.5 Pro |
| **Code** | 코드 생성, 이해 | GitHub Copilot, CodeLlama |

---

## 현재 대표 Multimodal 모델

| 모델 | 지원 모달리티 | 로컬 가능 |
|------|------------|---------|
| GPT-4o | 텍스트 + 이미지 + 음성 | ❌ (API) |
| Claude 3.5 Sonnet | 텍스트 + 이미지 | ❌ (API) |
| Gemini 1.5 Pro | 텍스트 + 이미지 + 영상 + 음성 | ❌ (API) |
| **LLaVA** | 텍스트 + 이미지 | ✅ (Ollama) |
| **Qwen2-VL** | 텍스트 + 이미지 + 영상 | ✅ (Ollama) |

---

## 이 프로젝트와의 연관성

현재는 텍스트(로그) 전용이지만, 확장 가능성:

```
적용 시나리오:
  Grafana 대시보드 스크린샷 → LLaVA → "이 그래프에서 이상 패턴 분석해줘"
  네트워크 토폴로지 다이어그램 → 이미지 분석 → "어느 경로가 공격받았어?"
  음성으로 질문 → Whisper 변환 → RAG 검색 → 음성으로 답변
```

---

## 로컬에서 이미지 이해 (LLaVA)

```bash
# Ollama로 설치
ollama pull llava:7b

# 사용 예
ollama run llava:7b "이 이미지에서 이상한 점을 분석해줘" --image screenshot.png
```

MacBook M3 16GB에서 7B 버전 실행 가능.
