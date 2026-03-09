import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { classifyRow, INSERT_SQL, RawRow } from "./classify";

type Params = Record<string, never>;

// NOTE: The Workflow architecture works correctly for incremental runs where the
// number of unprocessed items stays small (well under the Workers subrequest budget).
// For the initial 600-row bulk load, use scripts/run-pipeline.js instead, which
// drives the /pipeline/run-batch HTTP endpoint — each HTTP call is a fresh Worker
// invocation with its own independent subrequest budget.

export class FeedbackPipeline extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const rows = await step.do("fetch-unprocessed", async () => {
      const result = await this.env.DB.prepare(
        `SELECT r.id, r.content, r.source
         FROM feedback_raw r
         LEFT JOIN feedback_processed p ON r.id = p.id
         WHERE p.id IS NULL
         ORDER BY r.id`
      ).all<RawRow>();
      return result.results;
    });

    if (rows.length === 0) return { message: "No unprocessed rows." };

    const processed = await step.do(
      "process-all",
      { timeout: "30 minutes" },
      async () => {
        const results: Array<ReturnType<typeof classifyRow> extends Promise<infer T> ? T & { id: number } : never> = [];
        for (const row of rows) {
          const classified = await classifyRow(this.env.AI, row);
          results.push({ id: row.id, ...classified } as any);
        }
        const stmts = results.map((r: any) =>
          this.env.DB.prepare(INSERT_SQL).bind(
            r.id, r.product, r.theme, r.sentiment, r.sentiment_score, r.urgency, r.urgency_label
          )
        );
        await this.env.DB.batch(stmts);
        return results.length;
      }
    );

    return { processed };
  }
}
