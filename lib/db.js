import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("SUPABASE_DATABASE_URL is missing");
}

export const sql = postgres(databaseUrl, {
  prepare: false,
});
export const COUNTER_ID = "main";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(data),
  };
}

export function emptyResponse(statusCode = 200) {
  return {
    statusCode,
    headers: corsHeaders,
    body: "",
  };
}
