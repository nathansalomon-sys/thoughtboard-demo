// Dashboard API routes
// All GET endpoints accept: ?product=, ?since=, ?until=, &source= (repeatable)
// Additional filters per endpoint: ?theme=, ?sentiment= (quotes), ?limit=, ?offset= (quotes)
// since accepts: ISO date "YYYY-MM-DD" or relative period "7d", "30d", "90d", "1y", "all"

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---- Filter utilities ----

const VALID_PRODUCTS = new Set(["workers-ai", "d1", "workflows"]);
const VALID_SOURCES  = new Set(["support_ticket", "github", "discord", "reddit", "twitter"]);
const VALID_SENTS    = new Set(["positive", "negative", "neutral"]);

/** Parse a "since" value into an ISO date string (YYYY-MM-DD), or null for "all time". */
function parseSince(since: string | null | undefined): string | null {
  if (!since || since === "all") return null;
  const m = since.match(/^(\d+)([dwmy])$/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const d = new Date();
    if      (unit === "d") d.setDate(d.getDate() - n);
    else if (unit === "w") d.setDate(d.getDate() - n * 7);
    else if (unit === "m") d.setMonth(d.getMonth() - n);
    else if (unit === "y") d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
  }
  return since.length >= 10 ? since.slice(0, 10) : null;
}

type WhereResult = { sql: string; binds: unknown[] };

type FilterOpts = {
  product?:   string | null;
  sinceDate?: string | null; // already-resolved YYYY-MM-DD
  until?:     string | null;
  sources?:   string[];
  sentiment?: string | null;
  theme?:     string | null;
};

function buildWhere(opts: FilterOpts): WhereResult {
  const clauses: string[] = [];
  const binds:   unknown[] = [];

  if (opts.product && VALID_PRODUCTS.has(opts.product)) {
    clauses.push("p.product = ?");
    binds.push(opts.product);
  }
  if (opts.sinceDate) {
    clauses.push("r.timestamp >= ?");
    binds.push(opts.sinceDate);
  }
  if (opts.until) {
    const u = opts.until.length === 10 ? opts.until + "T23:59:59Z" : opts.until;
    clauses.push("r.timestamp <= ?");
    binds.push(u);
  }
  if (opts.sources && opts.sources.length > 0) {
    clauses.push(`r.source IN (${opts.sources.map(() => "?").join(",")})`);
    binds.push(...opts.sources);
  }
  if (opts.sentiment && VALID_SENTS.has(opts.sentiment)) {
    clauses.push("p.sentiment = ?");
    binds.push(opts.sentiment);
  }
  if (opts.theme) {
    clauses.push("p.theme = ?");
    binds.push(opts.theme);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    binds,
  };
}

function parseQueryFilters(url: URL): FilterOpts & { sinceRaw: string | null } {
  const sinceRaw = url.searchParams.get("since");
  return {
    product:   url.searchParams.get("product"),
    sinceDate: parseSince(sinceRaw),
    sinceRaw,
    until:     url.searchParams.get("until"),
    sources:   url.searchParams.getAll("source").filter(s => VALID_SOURCES.has(s)),
    sentiment: url.searchParams.get("sentiment"),
    theme:     url.searchParams.get("theme"),
  };
}

// Base JOIN used by all queries
const BASE = `FROM feedback_raw r JOIN feedback_processed p ON r.id = p.id`;

// ---- Endpoint implementations ----

/** GET /api/products — list of products with total feedback counts */
async function getProducts(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT product, COUNT(*) as count FROM feedback_processed GROUP BY product ORDER BY product`
  ).all<{ product: string; count: number }>();
  return json({ products: result.results });
}

/**
 * GET /api/stats — summary row for Row 0
 * Returns: { total, change_pct, active_themes }
 */
async function getStats(url: URL, env: Env): Promise<Response> {
  const opts = parseQueryFilters(url);
  const { sql: wh, binds } = buildWhere(opts);

  const [curr, themes] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total ${BASE} ${wh}`)
      .bind(...binds).first<{ total: number }>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT p.theme) as active_themes ${BASE} ${wh}`)
      .bind(...binds).first<{ active_themes: number }>(),
  ]);

  // % change vs previous equivalent period (only when a bounded time range is used)
  let change_pct: number | null = null;
  if (opts.sinceDate) {
    const periodEnd   = opts.until ? new Date(opts.until + "T23:59:59Z") : new Date();
    const periodStart = new Date(opts.sinceDate + "T00:00:00Z");
    const spanMs      = periodEnd.getTime() - periodStart.getTime();

    const prevEnd   = new Date(periodStart.getTime() - 1000);
    const prevStart = new Date(prevEnd.getTime() - spanMs);

    const { sql: prevWh, binds: prevBinds } = buildWhere({
      ...opts,
      sinceDate: prevStart.toISOString().slice(0, 10),
      until:     prevEnd.toISOString().slice(0, 19) + "Z",
    });

    const prev = await env.DB.prepare(`SELECT COUNT(*) as total ${BASE} ${prevWh}`)
      .bind(...prevBinds).first<{ total: number }>();

    const curTotal  = curr?.total  ?? 0;
    const prevTotal = prev?.total ?? 0;
    if (prevTotal > 0) {
      change_pct = Math.round(((curTotal - prevTotal) / prevTotal) * 100);
    }
  }

  return json({
    total:         curr?.total          ?? 0,
    change_pct,
    active_themes: themes?.active_themes ?? 0,
  });
}

/**
 * GET /api/sentiment — Row 1 data
 * Returns: { overall, count, trend: [{ date, score, count }] }
 */
async function getSentiment(url: URL, env: Env): Promise<Response> {
  const opts = parseQueryFilters(url);
  const { sql: wh, binds } = buildWhere(opts);

  const [overall, trend] = await Promise.all([
    env.DB.prepare(
      `SELECT AVG(p.sentiment_score) as score, COUNT(*) as count ${BASE} ${wh}`
    ).bind(...binds).first<{ score: number; count: number }>(),
    env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', r.timestamp) as date,
              AVG(p.sentiment_score) as score,
              COUNT(*) as count
       ${BASE} ${wh}
       GROUP BY date ORDER BY date`
    ).bind(...binds).all<{ date: string; score: number; count: number }>(),
  ]);

  return json({
    overall: overall?.score != null ? round3(overall.score) : null,
    count:   overall?.count ?? 0,
    trend:   trend.results.map(r => ({ date: r.date, score: round3(r.score), count: r.count })),
  });
}

/**
 * GET /api/volume — Row 2 left panel
 * Returns: { volume: [{ date, count }] }
 */
async function getVolume(url: URL, env: Env): Promise<Response> {
  const opts = parseQueryFilters(url);
  const { sql: wh, binds } = buildWhere(opts);

  const result = await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', r.timestamp) as date, COUNT(*) as count
     ${BASE} ${wh}
     GROUP BY date ORDER BY date`
  ).bind(...binds).all<{ date: string; count: number }>();

  return json({ volume: result.results });
}

/**
 * GET /api/themes — Row 2 right panel
 * Returns: { themes: [{ theme, count, avg_score, dominant_sentiment }] }
 */
async function getThemes(url: URL, env: Env): Promise<Response> {
  const opts = parseQueryFilters(url);
  // theme/sentiment are not relevant as input filters here (they shape the theme list itself)
  const { sql: wh, binds } = buildWhere({ ...opts, sentiment: null, theme: null });

  const result = await env.DB.prepare(
    `SELECT p.theme,
            COUNT(*) as count,
            AVG(p.sentiment_score) as avg_score,
            SUM(CASE WHEN p.sentiment = 'positive' THEN 1 ELSE 0 END) as pos,
            SUM(CASE WHEN p.sentiment = 'negative' THEN 1 ELSE 0 END) as neg,
            SUM(CASE WHEN p.sentiment = 'neutral'  THEN 1 ELSE 0 END) as neu
     ${BASE} ${wh}
     GROUP BY p.theme
     ORDER BY count DESC`
  ).bind(...binds).all<{
    theme: string; count: number; avg_score: number;
    pos: number; neg: number; neu: number;
  }>();

  const themes = result.results.map(row => ({
    theme: row.theme,
    count: row.count,
    avg_score: round3(row.avg_score),
    dominant_sentiment:
      row.pos >= row.neg && row.pos >= row.neu ? "positive" :
      row.neg >= row.pos && row.neg >= row.neu ? "negative" : "neutral",
  }));

  return json({ themes });
}

/**
 * GET /api/quotes — Row 3 quote-board
 * Returns: { quotes: [...], total }
 * Filters: product, since, until, source[], theme, sentiment
 * Paging:  ?limit= (max 200, default 50), ?offset= (default 0)
 * Sort:    urgency DESC, timestamp DESC
 */
async function getQuotes(url: URL, env: Env): Promise<Response> {
  const opts = parseQueryFilters(url);
  const { sql: wh, binds } = buildWhere(opts);

  const limit  = Math.min(Math.max(parseInt(url.searchParams.get("limit")  ?? "50",  10), 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  const [rows, countRow] = await Promise.all([
    env.DB.prepare(
      `SELECT r.id, r.timestamp, r.source, r.user_handle, r.content,
              p.product, p.theme, p.sentiment, p.sentiment_score, p.urgency, p.urgency_label
       ${BASE} ${wh}
       ORDER BY p.urgency DESC, r.timestamp DESC
       LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all<{
      id: number; timestamp: string; source: string; user_handle: string; content: string;
      product: string; theme: string; sentiment: string; sentiment_score: number;
      urgency: number; urgency_label: string;
    }>(),
    env.DB.prepare(`SELECT COUNT(*) as total ${BASE} ${wh}`)
      .bind(...binds).first<{ total: number }>(),
  ]);

  return json({ quotes: rows.results, total: countRow?.total ?? 0 });
}

/**
 * POST /api/deep-dive — conversational query (Row bottom)
 * Body: { query: string, product?: string, since?: string }
 * Returns: { response: string, context: { total, avg_score } }
 */
async function deepDive(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ query?: string; product?: string; since?: string }>();
  const query = body?.query?.trim();
  if (!query) return json({ error: "query is required" }, 400);

  const opts: FilterOpts = {
    product:   body.product,
    sinceDate: parseSince(body.since),
  };
  const { sql: wh, binds } = buildWhere(opts);

  // Pull summary context from D1 to ground the AI response
  const [stats, topThemes, topQuotes] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) as total, AVG(p.sentiment_score) as avg_score ${BASE} ${wh}`
    ).bind(...binds).first<{ total: number; avg_score: number }>(),
    env.DB.prepare(
      `SELECT p.theme, COUNT(*) as count, AVG(p.sentiment_score) as avg_score
       ${BASE} ${wh}
       GROUP BY p.theme ORDER BY count DESC LIMIT 7`
    ).bind(...binds).all<{ theme: string; count: number; avg_score: number }>(),
    env.DB.prepare(
      `SELECT r.content, p.theme, p.sentiment, p.urgency_label
       ${BASE} ${wh}
       ORDER BY p.urgency DESC, r.timestamp DESC LIMIT 6`
    ).bind(...binds).all<{ content: string; theme: string; sentiment: string; urgency_label: string }>(),
  ]);

  const productLabel = opts.product ?? "all products";
  const total        = stats?.total    ?? 0;
  const avgScore     = stats?.avg_score != null ? stats.avg_score.toFixed(2) : "n/a";

  const themeSummary = topThemes.results
    .map(t => `  - ${t.theme}: ${t.count} items, avg sentiment ${t.avg_score.toFixed(2)}`)
    .join("\n") || "  (no data)";

  const quoteSummary = topQuotes.results
    .map((q, i) => `  ${i + 1}. [${q.urgency_label}/${q.sentiment}/${q.theme}] "${q.content.slice(0, 150)}"`)
    .join("\n") || "  (no data)";

  const systemPrompt =
    "You are a senior product intelligence analyst for Cloudflare. " +
    "Your job is to synthesize feedback data into actionable insights for a PM — not to restate the numbers. " +
    "Follow these rules strictly:\n" +
    "1. Do NOT repeat or paraphrase the raw counts, scores, or theme names from the data. The PM can already see those.\n" +
    "2. DO identify the underlying pattern or root cause behind the data (e.g. why a theme is negative, what kind of users are affected).\n" +
    "3. DO surface non-obvious connections between themes or sentiments.\n" +
    "4. DO end with 2–3 concrete, specific recommendations the PM could act on next sprint.\n" +
    "5. Use plain language. No bullet lists of data. Lead with insight, end with action.";

  const userPrompt =
    `FEEDBACK DATA SUMMARY\n` +
    `Product: ${productLabel}\n` +
    `Total feedback items: ${total}\n` +
    `Average sentiment score: ${avgScore} (scale: -1.0 very negative, 0 neutral, 1.0 very positive)\n\n` +
    `Top themes by volume:\n${themeSummary}\n\n` +
    `Sample high-urgency quotes:\n${quoteSummary}\n\n` +
    `PM QUESTION: ${query}`;

  const aiResult = await (env.AI as any).run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    max_tokens: 512,
  });

  const response = (aiResult as { response?: string }).response?.trim() ?? "(no response)";
  return json({ response, context: { total, avg_score: stats?.avg_score ?? null } });
}

// ---- Round to 3 decimal places ----
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---- Router ----

export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const { method, } = request;
    const path = url.pathname;

    if (method === "GET") {
      if (path === "/api/products")  return getProducts(env);
      if (path === "/api/stats")     return getStats(url, env);
      if (path === "/api/sentiment") return getSentiment(url, env);
      if (path === "/api/volume")    return getVolume(url, env);
      if (path === "/api/themes")    return getThemes(url, env);
      if (path === "/api/quotes")    return getQuotes(url, env);
    }
    if (method === "POST" && path === "/api/deep-dive") return deepDive(request, env);

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  } catch (err) {
    console.error("[api]", err);
    return json({ error: String(err) }, 500);
  }
}
