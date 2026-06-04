import Anthropic from "@anthropic-ai/sdk";
import { readdir, readFile } from "fs/promises";
import path from "path";

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  file: string;
  line?: number;
  description: string;
  recommendation: string;
}

export interface SecurityReport {
  scanned_files: number;
  findings: SecurityFinding[];
  summary: string;
  score: number; // 0–100, higher = more secure
  scanned_at: string;
}

// File extensions and paths to scan
const INCLUDE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".sql", ".env.example"]);
const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (INCLUDE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

// Cap total content sent to Claude to stay well within context limits
const MAX_CHARS_PER_FILE = 8_000;
const MAX_TOTAL_CHARS = 120_000;

export async function runSecurityScan(rootDir: string): Promise<SecurityReport> {
  const files = await collectFiles(rootDir);

  const fileSnippets: string[] = [];
  let totalChars = 0;
  let scannedCount = 0;

  for (const file of files) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    try {
      const raw = await readFile(file, "utf8");
      const content = raw.slice(0, MAX_CHARS_PER_FILE);
      const relative = path.relative(rootDir, file);
      const snippet = `### FILE: ${relative}\n\`\`\`\n${content}\n\`\`\``;
      if (totalChars + snippet.length > MAX_TOTAL_CHARS) break;
      fileSnippets.push(snippet);
      totalChars += snippet.length;
      scannedCount++;
    } catch {
      // skip unreadable files
    }
  }

  const codePayload = fileSnippets.join("\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: `You are a senior application security engineer specializing in web applications,
databases, and API security. You will be given source code from a Next.js + Supabase trading
platform. Analyze it thoroughly for security vulnerabilities.

Focus on:
- SQL injection / RLS bypass risks in Supabase queries
- Authentication and authorization gaps (missing auth checks, broken access control)
- Secrets or credentials exposed in code
- XSS, SSRF, path traversal, command injection vectors
- Insecure direct object references
- Missing input validation at API boundaries
- CSRF risks
- Stripe webhook signature verification
- Row-Level Security (RLS) gaps in SQL migrations
- Sensitive data exposure in API responses

Return ONLY valid JSON matching this exact shape — no markdown fences, no prose:
{
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "<short category name>",
      "file": "<relative file path>",
      "line": <line number or null>,
      "description": "<what the vulnerability is>",
      "recommendation": "<specific fix>"
    }
  ],
  "summary": "<2-3 sentence overall assessment>",
  "score": <integer 0-100>
}`,
    messages: [
      {
        role: "user",
        content: `Scan the following ${scannedCount} source files for security issues:\n\n${codePayload}`,
      },
    ],
  });

  // Extract text block (thinking blocks are separate)
  const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude security scan");
  }

  let parsed: { findings: SecurityFinding[]; summary: string; score: number };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Claude returned invalid JSON during security scan");
  }

  return {
    scanned_files: scannedCount,
    findings: parsed.findings ?? [],
    summary: parsed.summary ?? "",
    score: parsed.score ?? 0,
    scanned_at: new Date().toISOString(),
  };
}
