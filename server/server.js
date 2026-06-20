import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import postgres from "postgres";

const PORT = Number(process.env.PORT || 3000);
const COUNTER_ID = "main";
const root = dirname(resolve(process.argv[1] || "."));
const databaseUrl = process.env.DATABASE_URL;
const needsSsl =
  Boolean(databaseUrl) &&
  (databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("pooler.supabase.com") ||
    databaseUrl.includes("sslmode=require"));

const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      ssl: needsSsl ? "require" : undefined,
    })
  : null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    ...corsHeaders,
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
};

const ensureDatabase = async () => {
  if (!sql) {
    throw new Error("DATABASE_URL is missing");
  }

  await sql`
    CREATE TABLE IF NOT EXISTS app_counter (
      id text PRIMARY KEY,
      value integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    INSERT INTO app_counter (id, value)
    VALUES (${COUNTER_ID}, 0)
    ON CONFLICT (id) DO NOTHING
  `;
};

const getCounter = async () => {
  await ensureDatabase();

  const rows = await sql`
    SELECT value
    FROM app_counter
    WHERE id = ${COUNTER_ID}
  `;

  return rows[0]?.value ?? 0;
};

const updateCounter = async (operation) => {
  await ensureDatabase();

  if (operation === "plus") {
    const rows = await sql`
      UPDATE app_counter
      SET value = value + 1, updated_at = now()
      WHERE id = ${COUNTER_ID}
      RETURNING value
    `;
    return rows[0].value;
  }

  if (operation === "minus") {
    const rows = await sql`
      UPDATE app_counter
      SET value = value - 1, updated_at = now()
      WHERE id = ${COUNTER_ID}
      RETURNING value
    `;
    return rows[0].value;
  }

  const rows = await sql`
    UPDATE app_counter
    SET value = 0, updated_at = now()
    WHERE id = ${COUNTER_ID}
    RETURNING value
  `;
  return rows[0].value;
};

const handleApi = async (req, res, pathname) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  try {
    if (pathname === "/api/counter") {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }

      sendJson(res, 200, { value: await getCounter() });
      return;
    }

    const operations = {
      "/api/counter/plus": "plus",
      "/api/counter/minus": "minus",
      "/api/counter/reset": "reset",
    };
    const operation = operations[pathname];

    if (!operation) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    sendJson(res, 200, { value: await updateCounter(operation) });
  } catch (error) {
    console.error("[counter-api]", error);
    sendJson(res, 500, { error: "Failed to handle counter request" });
  }
};

const serveStatic = async (req, res, pathname) => {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    try {
      const fallback = await readFile(join(root, "index.html"));
      res.writeHead(200, {
        "Content-Type": contentTypes[".html"],
      });
      res.end(req.method === "HEAD" ? undefined : fallback);
    } catch {
      res.writeHead(404);
      res.end();
    }
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url.pathname);
    return;
  }

  await serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Counter app listening on port ${PORT}`);
});
