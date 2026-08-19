import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Loader2, Sparkles, AlertTriangle, RefreshCw, Copy } from "lucide-react";
import Card from "@/components/Card";
import { llmHealth, llmChat, type ChatMessage } from "@/lib/api";

const SYSTEM_PROMPT =
  "당신은 SIEM-Trinity 의 보안 분석 어시스턴트입니다. 한국어로 간결하고 정확하게, MITRE ATT&CK ID 가 적절할 때 함께 언급해 답하세요.";

const SUGGESTIONS = [
  "최근 24시간 SSH 무차별 대입 공격에 대해 어떻게 대응해야 할까?",
  "T1071.001 (Web Protocols C2) 의 탐지 방법을 설명해줘.",
  "fail2ban 차단 IP 가 갑자기 늘었을 때 점검 순서를 알려줘.",
  "Wazuh High 알림이 다수 발생 중인 상황에서 우선순위는?",
];

export default function Llm() {
  const health = useQuery({
    queryKey: ["llm-health"],
    queryFn: llmHealth,
    refetchInterval: 10_000,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useMutation({
    mutationFn: (newMsgs: ChatMessage[]) =>
      llmChat([{ role: "system", content: SYSTEM_PROMPT }, ...newMsgs]),
    onSuccess: (r) => {
      setMessages((prev) => [...prev, { role: "assistant", content: r.content }]);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, chat.isPending]);

  function send() {
    const text = input.trim();
    if (!text || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    chat.mutate(next);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ── 헬스 게이트 ─────────────────────────────────────────
  if (health.isLoading) {
    return <div className="text-sm text-text-secondary">상태 확인 중…</div>;
  }
  if (!health.data?.ollama_up) {
    return (
      <Card title="Ollama 응답 없음">
        <p className="text-sm text-crit">
          intelligence-ollama 컨테이너가 응답하지 않습니다. 03-intelligence 가 기동되어
          있는지 확인하세요.
        </p>
        {health.data?.error && (
          <pre className="mt-2 overflow-auto rounded-md border border-subtle bg-elevated p-2 text-[11px] text-text-secondary">
            {health.data.error}
          </pre>
        )}
        <button
          onClick={() => health.refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-elevated"
        >
          <RefreshCw size={12} /> 다시 확인
        </button>
      </Card>
    );
  }
  if (!health.data.ready) {
    return (
      <ModelMissing
        models={health.data.models ?? []}
        required={health.data.required ?? ""}
        pullCmd={health.data.pull_cmd ?? ""}
        onRefresh={() => health.refetch()}
      />
    );
  }

  // ── 채팅 UI ────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">LLM 채팅</h1>
          <p className="text-sm text-text-secondary">
            모델: <span className="font-mono text-info">{health.data.required}</span> · MITRE
            ATT&CK 보안 분석 어시스턴트
          </p>
        </div>
        <button
          onClick={() => setMessages([])}
          className="shrink-0 self-start whitespace-nowrap rounded-md border border-subtle px-3 py-1.5 text-xs text-text-secondary hover:bg-elevated"
        >
          새 대화
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-card border border-subtle bg-surface p-4"
      >
        {messages.length === 0 ? (
          <Suggestions onPick={(s) => setInput(s)} />
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {chat.isPending && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 size={14} className="animate-spin" />
                생각 중…
              </div>
            )}
            {chat.isError && (
              <div className="rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-xs text-crit">
                {String(chat.error)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-card border border-subtle bg-surface p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="질문을 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
            rows={2}
            className="flex-1 resize-none rounded-md border border-subtle bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-brand focus:outline-none"
          />
          <button
            onClick={send}
            disabled={!input.trim() || chat.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-base hover:opacity-90 disabled:opacity-50"
          >
            {chat.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-card border px-4 py-3 text-sm ${
          isUser
            ? "border-brand/30 bg-brand/10 text-text-primary"
            : "border-subtle bg-elevated text-text-primary"
        }`}
      >
        {!isUser && (
          <div className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary">
            <Sparkles size={10} /> Assistant
          </div>
        )}
        <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
        {!isUser && (
          <button
            onClick={() => navigator.clipboard.writeText(msg.content)}
            className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-secondary hover:text-text-primary"
          >
            <Copy size={10} /> 복사
          </button>
        )}
      </div>
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Sparkles size={32} className="text-brand" />
      <p className="text-center text-sm text-text-secondary">
        보안 분석 어시스턴트입니다. 아래 예시를 클릭하거나 직접 질문하세요.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s)}
            className="rounded-md border border-subtle bg-elevated px-3 py-2 text-left text-xs text-text-primary hover:border-brand hover:bg-base"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ModelMissing({
  models,
  required,
  pullCmd,
  onRefresh,
}: {
  models: string[];
  required: string;
  pullCmd: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 text-warn" size={20} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-text-primary">
              모델이 설치되어 있지 않습니다
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Ollama 는 동작 중이지만{" "}
              <span className="font-mono text-info">{required}</span> 모델이 pull 되어 있지
              않아 채팅을 시작할 수 없습니다.
            </p>
          </div>
        </div>
      </Card>

      <Card title="현재 설치된 모델">
        {models.length === 0 ? (
          <p className="text-sm text-text-secondary">없음.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => (
              <span
                key={m}
                className="rounded border border-subtle bg-elevated px-2 py-0.5 font-mono text-[11px] text-text-secondary"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="설치 방법" subtitle="232 서버에서 한 줄 실행">
        <pre className="overflow-auto rounded-md border border-subtle bg-base p-3 font-mono text-xs text-text-primary">
          {pullCmd}
        </pre>
        <p className="mt-2 text-xs text-text-secondary">
          용량 약 5GB. pull 완료되면 이 페이지가 자동으로 채팅 모드로 전환됩니다 (10초마다
          자동 감지).
        </p>
        <button
          onClick={onRefresh}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-elevated"
        >
          <RefreshCw size={12} /> 지금 확인
        </button>
      </Card>
    </div>
  );
}
