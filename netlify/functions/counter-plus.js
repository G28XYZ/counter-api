import { COUNTER_ID, emptyResponse, jsonResponse, sql } from "../../lib/db.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return emptyResponse();
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const rows = await sql`
      UPDATE app_counter
      SET value = value + 1, updated_at = now()
      WHERE id = ${COUNTER_ID}
      RETURNING value
    `;

    return jsonResponse(200, {
      value: rows[0].value,
    });
  } catch {
    return jsonResponse(500, {
      error: "Failed to increment counter",
    });
  }
};
