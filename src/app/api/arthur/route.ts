import { NextResponse } from "next/server";

type ArthurRequestBody = {
  message?: string;
  selectedPageId?: string | null;
  readOnly?: boolean;
  editMode?: boolean;
  pageTitle?: string;
  pageBody?: string;
  pageTags?: string[];
  pagePdfs?: Array<{
    id: string;
    name: string;
    text: string;
    extractionMode?: "text" | "ocr" | "hybrid";
  }>;
  workspacePages?: Array<{
    id: string;
    title: string;
    body: string;
    tags: string[];
  }>;
};

const DEFAULT_MODEL = process.env.COHERE_MODEL?.trim() || "command-r7b-12-2024";
const COHERE_API_URL = "https://api.cohere.com/v2/chat";

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}...`;
}

function normalizeAnswer(text: string) {
  return text
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

function parseEditBlock(raw: string): { display: string; body?: string } {
  // 1. Exact marker
  const exactMatch = raw.match(/\[EDIT_BODY\]([\s\S]*?)\[\/EDIT_BODY\]/i);
  if (exactMatch) {
    const body = exactMatch[1].trim();
    const display = raw.replace(exactMatch[0], "").trim();
    if (/<[a-z][^>]*>/i.test(body) && body.length > 20) {
      return { display: display || "Done.", body };
    }
  }

  // 2. Markdown code block containing HTML
  const codeBlockMatch = raw.match(/```(?:html)?\s*\n?([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const body = codeBlockMatch[1].trim();
    if (/<[ph][^>]*>/i.test(body) && body.length > 20) {
      const display = raw.replace(codeBlockMatch[0], "").trim();
      return { display: display || "Done.", body };
    }
  }

  // 3. Prose sentence followed by HTML block
  const htmlFallbackMatch = raw.match(
    /^([^<\n]{5,200})\n{1,3}((?:<(?:p|h[2-6]|ul|ol|li|strong|em|br)[\s>])[^]{50,})/i,
  );
  if (htmlFallbackMatch) {
    return {
      display: htmlFallbackMatch[1].trim(),
      body: htmlFallbackMatch[2].trim(),
    };
  }

  // 4. Entire response is HTML
  if (/^\s*<(?:p|h[2-6]|ul|ol)[^>]*>/i.test(raw) && raw.length > 30) {
    return { display: "Done.", body: raw.trim() };
  }

  return { display: raw };
}

function buildWorkspaceContext(body: ArthurRequestBody) {
  const pages = (body.workspacePages ?? [])
    .filter((page) => page.id !== body.selectedPageId)
    .slice(0, 8);
  const activePageText = stripHtml(body.pageBody ?? "");
  const activePdfs = body.pagePdfs ?? [];

  const activePageBlock = body.pageTitle
    ? [
        "## Active page",
        `Title: ${body.pageTitle}`,
        `Tags: ${(body.pageTags ?? []).join(", ") || "none"}`,
        `Existing content: ${truncateText(activePageText || "(empty)", 2400)}`,
        activePdfs.length
          ? `Attached PDFs: ${activePdfs.map((p) => p.name).join(", ")}`
          : "Attached PDFs: none",
        ...activePdfs.flatMap((pdf, i) => [
          `\n### PDF ${i + 1}: ${pdf.name}`,
          truncateText(pdf.text, 6000),
        ]),
      ].join("\n")
    : "No page is currently open.";

  const workspaceBlock = pages.length
    ? pages
        .map((page, i) => {
          const bodyText = truncateText(stripHtml(page.body || ""), 400);
          return `### Workspace page ${i + 1}: ${page.title}\n${bodyText || "(empty)"}`;
        })
        .join("\n\n")
    : "No other workspace pages.";

  return `${activePageBlock}\n\n## Other workspace pages\n${workspaceBlock}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.COHERE_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing COHERE_API_KEY. Add it to your .env.local file to enable Arthur." },
      { status: 500 },
    );
  }

  let body: ArthurRequestBody;
  try {
    body = (await request.json()) as ArthurRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const context = buildWorkspaceContext(body);
  const currentBodyHtml = body.pageBody?.trim() || "";

  // ── System message ──────────────────────────────────────────────────────────
  //
  // editMode: true  → called from the /ai slash command inside the page editor.
  //                   The model MUST write page HTML. No chat response.
  //
  // editMode: false → called from the Arthur sidebar chat.
  //                   The model answers in plain text only. Never edits the page.

  let systemMessage: string;

  if (body.readOnly) {
    systemMessage = `You are Arthur, an AI assistant inside a financial research workspace called Nova.
The current page is READ-ONLY. Answer questions about its content only.
If asked to edit or write, tell the user to save a copy to their personal workspace first.
Be direct and concise. No disclaimers.`;

  } else if (body.editMode) {
    // Inline /ai slash command — always writes to page
    systemMessage = `You are Arthur, an AI writing assistant inside a financial research workspace called Nova.
The user is asking you to write or update the page. You MUST respond by outputting the complete updated page content as HTML.

Use this exact format:
[EDIT_BODY]
<p>Your full page HTML goes here — include ALL existing content plus the new content.</p>
[/EDIT_BODY]
Done — brief one-sentence description of what you wrote.

Example:
[EDIT_BODY]
<h2>Q3 Earnings Summary</h2>
<p>Revenue of $4.2bn, up 12% year-on-year. Operating margins expanded 80bps on cost discipline.</p>
[/EDIT_BODY]
Added a Q3 earnings summary.

Rules:
- [EDIT_BODY] must contain the COMPLETE updated page — everything already on the page PLUS what you are adding.
- Only use these HTML tags: p, h2, h3, ul, ol, li, strong, em, br.
- Do NOT use html, head, body, div, span, or script tags.
- The brief description goes AFTER [/EDIT_BODY].
- Do not add any other text outside of this format.`;

  } else {
    // Sidebar chat — Q&A only, never edits
    systemMessage = `You are Arthur, an AI assistant inside a financial research workspace called Nova.
Answer the user's question about the page, the attached PDFs, or their workspace research.
Respond in plain text only. Do NOT write HTML. Do NOT attempt to edit the page.
Be direct and concise. No filler. No disclaimers.`;
  }

  // ── User turn ───────────────────────────────────────────────────────────────
  const userTurn = body.editMode
    ? [
        "## Page context",
        context,
        "",
        currentBodyHtml
          ? `## Current page HTML (include ALL of this in [EDIT_BODY], then add the new content)\n${truncateText(currentBodyHtml, 3000)}`
          : "## Current page HTML\n(page is empty — start fresh)",
        "",
        `## What the user wants\n${message}`,
      ].join("\n")
    : [
        "## Workspace context",
        context,
        "",
        currentBodyHtml
          ? `## Current page content (for reference)\n${truncateText(stripHtml(currentBodyHtml), 2000)}`
          : "## Current page content\n(empty)",
        "",
        `## Question\n${message}`,
      ].join("\n");

  try {
    const response = await fetch(COHERE_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: body.editMode ? 0.25 : 0.4,
        max_tokens: 3500,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userTurn },
        ],
      }),
    });

    const data = (await response.json()) as {
      message?: { content?: Array<{ type?: string; text?: string }> };
      text?: string;
      message_text?: string;
    };

    if (!response.ok) {
      const apiError =
        data?.message?.content?.[0]?.text ||
        data?.message_text ||
        data?.text ||
        "Cohere request failed.";
      return NextResponse.json({ error: apiError }, { status: response.status });
    }

    const rawAnswer =
      data?.message?.content
        ?.filter((item) => item.type === "text" || typeof item.text === "string")
        .map((item) => item.text?.trim() || "")
        .filter(Boolean)
        .join("\n\n") ||
      data?.text?.trim() ||
      data?.message_text?.trim();

    if (!rawAnswer) {
      return NextResponse.json(
        { error: "Cohere returned an empty response." },
        { status: 502 },
      );
    }

    if (body.editMode) {
      const { display, body: newBody } = parseEditBlock(rawAnswer);
      if (!newBody) {
        // Model failed to produce HTML — return as error so client can show it
        return NextResponse.json(
          { error: `Arthur couldn't write to the page. Try rephrasing your request.` },
          { status: 422 },
        );
      }
      return NextResponse.json({ answer: display || "Done.", pageEdit: { body: newBody } });
    }

    // Sidebar: plain text only
    const answer = normalizeAnswer(rawAnswer);
    return NextResponse.json({ answer });

  } catch {
    return NextResponse.json(
      { error: "Arthur could not reach Cohere. Check your API key, model name, and network access." },
      { status: 502 },
    );
  }
}
