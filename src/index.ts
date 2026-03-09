export { FeedbackPipeline } from "./pipeline";
import { classifyRow, INSERT_SQL, RawRow } from "./classify";
import { handleApi } from "./api";

const BATCH_SIZE = 20;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    // Workflow trigger / status
    if (request.method === "POST" && url.pathname === "/pipeline/start") {
      const instance = await env.FEEDBACK_PIPELINE.create({});
      return Response.json({ id: instance.id, status: "started" });
    }
    if (request.method === "GET" && url.pathname === "/pipeline/status") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing id", { status: 400 });
      const instance = await env.FEEDBACK_PIPELINE.get(id);
      return Response.json(await instance.status());
    }

    // Bulk processing endpoint: each POST call is a fresh Worker invocation with its own
    // subrequest budget. The Worker self-selects the next BATCH_SIZE unprocessed rows so
    // the script doesn't need to pre-fetch IDs. Safe for sequential (non-concurrent) use.
    if (request.method === "POST" && url.pathname === "/pipeline/run-batch") {
      const rows = await env.DB.prepare(
        `SELECT r.id, r.content, r.source
         FROM feedback_raw r
         LEFT JOIN feedback_processed p ON r.id = p.id
         WHERE p.id IS NULL
         ORDER BY r.id
         LIMIT ?`
      ).bind(BATCH_SIZE).all<RawRow>();

      if (!rows.results.length) return Response.json({ processed: 0, done: true });

      const results: Array<{ id: number; [k: string]: unknown }> = [];
      for (const row of rows.results) {
        const classified = await classifyRow(env.AI, row);
        results.push({ id: row.id, ...classified });
      }

      const stmts = results.map((r) =>
        env.DB.prepare(INSERT_SQL).bind(
          r.id, r.product, r.theme, r.sentiment, r.sentiment_score, r.urgency, r.urgency_label
        )
      );
      await env.DB.batch(stmts);

      return Response.json({ processed: results.length, done: false });
    }

    return new Response("Thoughtboard API");
  },
};
