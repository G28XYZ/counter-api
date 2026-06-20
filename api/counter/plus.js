import { sql, COUNTER_ID, cors } from "../../lib/db.js";

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rows = await sql`
      UPDATE app_counter
      SET value = value + 1, updated_at = now()
      WHERE id = ${COUNTER_ID}
      RETURNING value
    `;

    return res.status(200).json({
      value: rows[0].value,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to increment counter",
    });
  }
}