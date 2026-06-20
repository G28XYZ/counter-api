import { COUNTER_ID, emptyResponse, jsonResponse, sql } from "../../lib/db.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return emptyResponse();
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const rows = await sql`
      SELECT value
      FROM app_counter
      WHERE id = ${COUNTER_ID}
    `;

    return jsonResponse(200, {
      value: rows[0]?.value ?? 0,
    });
  } catch {
    return jsonResponse(500, {
      error: "Failed to get counter",
    });
  }
};
