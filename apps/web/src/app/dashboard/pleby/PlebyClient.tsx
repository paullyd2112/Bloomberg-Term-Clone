"use client";

import { useEffect, useRef, useState } from "react";

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown };

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

function extractText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function extractToolCalls(content: Message["content"]): string[] {
  if (typeof content === "string") return [];
  return content
    .filter((b): b is { type: "tool_use"; name: string; input: unknown } => b.type === "tool_use")
    .map((b) => b.name);
}

const TOOL_LABELS: Record<string, string> = {
  get_asset_overview:       "Pulling latest price",
  get_recent_signals:       "Checking recent signals",
  get_signal_accuracy:      "Looking up historical accuracy",
  get_news:                 "Scanning news",
  get_options_flow:         "Reading options flow",
  get_upcoming_earnings:    "Looking up earnings",
};

export default function PlebyClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId]           = useState<string | null>(null);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState("");
  const [streaming, setStreaming]         = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<string[]>([]);
  const [error, setError]                 = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    void loadConversations();
  }, []);

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText, streamingTools]);

  async function loadConversations() {
    const res = await fetch("/api/pleby/conversations");
    if (res.ok) setConversations(await res.json());
  }

  async function loadConversation(id: string) {
    setActiveId(id);
    setMessages([]);
    setError("");
    const res = await fetch(`/api/pleby/conversations/${id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages);
    }
  }

  async function newConversation() {
    const res = await fetch("/api/pleby/conversations", { method: "POST" });
    if (!res.ok) return;
    const conv = await res.json();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/pleby/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    let convId = activeId;
    if (!convId) {
      const res = await fetch("/api/pleby/conversations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: text.slice(0, 60) }),
      });
      if (!res.ok) {
        setError("Failed to create conversation");
        return;
      }
      const conv = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      convId = conv.id;
    }

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);
    setStreamingText("");
    setStreamingTools([]);
    setError("");

    try {
      const res = await fetch("/api/pleby/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ conversation_id: convId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let textAccum = "";
      const toolAccum: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const lines = evt.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine  = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const eventType = eventLine.slice(7);
          const data      = JSON.parse(dataLine.slice(6));

          if (eventType === "text") {
            textAccum += data.delta;
            setStreamingText(textAccum);
          } else if (eventType === "tool_use") {
            toolAccum.push(data.name);
            setStreamingTools([...toolAccum]);
            // Reset text accum — new text after tool calls starts fresh
            textAccum = "";
            setStreamingText("");
          } else if (eventType === "error") {
            throw new Error(data.message);
          } else if (eventType === "done") {
            // Flush final state into messages
            setMessages((prev) => [
              ...prev,
              {
                role:    "assistant",
                content: textAccum
                  ? [{ type: "text", text: textAccum }]
                  : [{ type: "text", text: "(no response)" }],
              },
            ]);
            setStreamingText("");
            setStreamingTools([]);
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Pleby crashed");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — conversations */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-zinc-950 border-r border-zinc-800 flex-col">
        <button
          onClick={newConversation}
          className="m-3 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-3 py-2 rounded-md transition-colors"
        >
          + New chat
        </button>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded text-xs cursor-pointer ${
                activeId === c.id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
              }`}
              onClick={() => loadConversation(c.id)}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteConversation(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && !streaming && (
              <div className="text-center py-12 space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pleby-mascot.png" alt="Pleby" className="h-36 w-auto mx-auto" />
                <h2 className="text-white font-semibold text-lg">Ask Pleby</h2>
                <p className="text-zinc-500 text-sm max-w-md mx-auto">
                  Your AI trading analyst. Ask about any stock, crypto, or prediction market — Pleby pulls live signals, options flow, earnings, and news to give you a synthesized take.
                </p>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  {[
                    "What do you think about NVDA right now?",
                    "Show me unusual options flow on TSLA",
                    "Is BTC setting up for a move?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={m.id ?? i} role={m.role} content={m.content} />
            ))}

            {streaming && streamingTools.length > 0 && (
              <div className="space-y-1.5">
                {streamingTools.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    {TOOL_LABELS[t] ?? t}…
                  </div>
                ))}
              </div>
            )}

            {streaming && streamingText && (
              <MessageBubble role="assistant" content={streamingText} />
            )}

            {streaming && !streamingText && !streamingTools.length && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Thinking…
              </div>
            )}

            {error && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded p-3">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 bg-zinc-950 p-4">
          <div className="max-w-3xl mx-auto flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={streaming}
              placeholder="Ask Pleby about any asset…"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-60"
            />
            <button
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              className="bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: Message["content"] }) {
  const text = extractText(content);
  const toolCalls = extractToolCalls(content);

  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
          role === "user"
            ? "bg-zinc-800 text-white"
            : "bg-zinc-900 border border-zinc-800 text-zinc-100"
        }`}
      >
        {role === "assistant" && toolCalls.length > 0 && (
          <div className="mb-2 space-y-1 text-[11px] text-zinc-500 border-l-2 border-zinc-700 pl-2">
            {toolCalls.map((t, i) => (
              <div key={i}>✓ {TOOL_LABELS[t] ?? t}</div>
            ))}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">{text}</div>
      </div>
    </div>
  );
}
