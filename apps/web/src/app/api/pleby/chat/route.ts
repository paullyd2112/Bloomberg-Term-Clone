import Anthropic from "@anthropic-ai/sdk";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import { createClient } from "@/lib/supabase/server";
import { PLEBY_TOOLS, executeTool } from "@/lib/pleby/tools";
import { PLEBY_SYSTEM_PROMPT } from "@/lib/pleby/system-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ITERATIONS = 6;

// Per-user daily cap — 30 messages/24 h, persisted to Supabase
const DAILY_LIMIT = 30;
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function isRateLimited(userId: string): Promise<boolean> {
  const supabase = createClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();

  // Get all conversation IDs for this user, then count user messages in the last 24h
  const { data: convos } = await supabase
    .from("pleby_conversations")
    .select("id")
    .eq("user_id", userId);

  if (!convos || convos.length === 0) return false;

  const convoIds = convos.map((c) => c.id);
  const { count } = await supabase
    .from("pleby_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .in("conversation_id", convoIds)
    .gte("created_at", windowStart);

  return (count ?? 0) >= DAILY_LIMIT;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const tier = await getUserTier();
  if (!canAccessFeature(tier, "pleby")) {
    return new Response("Elite tier required", { status: 403 });
  }

  if (await isRateLimited(user.id)) {
    return new Response(
      JSON.stringify({ error: "Daily message limit reached. Resets in 24 hours." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await req.json();
  const conversation_id = typeof body.conversation_id === "string" ? body.conversation_id : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 4000) : "";

  if (!conversation_id) return new Response("Missing conversation_id", { status: 400 });
  if (!message.trim()) return new Response("Empty message", { status: 400 });

  const supabase = createClient();

  // Verify conversation belongs to user and load history
  const { data: conv } = await supabase
    .from("pleby_conversations")
    .select("id, user_id")
    .eq("id", conversation_id)
    .single();

  if (!conv || conv.user_id !== user.id) {
    return new Response("Conversation not found", { status: 404 });
  }

  const { data: priorMessages } = await supabase
    .from("pleby_messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at");

  const messages: Anthropic.MessageParam[] = (priorMessages ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as Anthropic.MessageParam["content"],
  }));

  messages.push({ role: "user", content: message });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(sse(event, data)));

      try {
        // Manual tool-use loop with streaming on each iteration
        let assistantContent: Anthropic.ContentBlock[] = [];
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const apiStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: PLEBY_SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: PLEBY_TOOLS,
            messages,
          });

          apiStream.on("text", (delta) => send("text", { delta }));

          const finalMessage = await apiStream.finalMessage();
          assistantContent = finalMessage.content;

          // Surface tool calls to the client for UX (e.g. "Looking up NVDA...")
          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              send("tool_use", { name: block.name, input: block.input });
            }
          }

          messages.push({ role: "assistant", content: finalMessage.content });

          if (finalMessage.stop_reason !== "tool_use") break;

          // Execute all tool calls in parallel
          const toolUseBlocks = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (block) => {
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
              );
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: result,
              };
            }),
          );
          messages.push({ role: "user", content: toolResults });
        }

        // Persist user message + final assistant turn (with full content array)
        await supabase.from("pleby_messages").insert([
          { conversation_id, role: "user", content: message },
          { conversation_id, role: "assistant", content: assistantContent },
        ]);

        await supabase
          .from("pleby_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversation_id);

        send("done", {});
      } catch (err) {
        console.error("Pleby chat error:", err);
        send("error", {
          message: "Something went wrong — please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection:      "keep-alive",
    },
  });
}
