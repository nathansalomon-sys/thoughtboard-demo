// Reads mock_data_raw.json and writes migrations/0002_seed.sql
const fs = require("fs");
const path = require("path");

const data = require("../mock_data_raw.json");

function sql(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val)) return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

const lines = data.map((r) => {
  return (
    `INSERT INTO feedback_raw ` +
    `(id, timestamp, source, user_handle, content, priority, status, issue_title, issue_labels, channel_name, subreddit, upvotes, likes, retweets) VALUES ` +
    `(${sql(r.id)}, ${sql(r.timestamp)}, ${sql(r.source)}, ${sql(r.user_handle)}, ${sql(r.content)}, ` +
    `${sql(r.priority)}, ${sql(r.status)}, ${sql(r.issue_title)}, ${sql(r.issue_labels)}, ` +
    `${sql(r.channel_name)}, ${sql(r.subreddit)}, ${sql(r.upvotes)}, ${sql(r.likes)}, ${sql(r.retweets)});`
  );
});

const out = path.join(__dirname, "../migrations/0002_seed.sql");
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`✓ Generated ${lines.length} INSERT statements → migrations/0002_seed.sql`);
