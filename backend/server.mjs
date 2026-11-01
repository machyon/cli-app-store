import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const PORT = Number(process.env.BACKEND_PORT ?? 8080);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set in .env");
}

// Parse the URL ourselves so the TLS settings come only from ca.pem and
// the sslmode query parameter cannot override them.
const url = new URL(databaseUrl);
url.searchParams.delete("sslmode");

const pool = new pg.Pool({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: {
    ca: fs.readFileSync(path.join(root, "certs", "ca.pem"), "utf8"),
    rejectUnauthorized: true,
  },
  max: 10,
});

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    return send(res, 405, { error: "Method not allowed" });
  }

  if (req.url === "/health") {
    try {
      const { rows } = await pool.query("SELECT NOW() AS now, version() AS version");
      return send(res, 200, { status: "ok", database: "connected", now: rows[0].now });
    } catch (err) {
      console.error("Health check failed:", err.message);
      return send(res, 503, { status: "error", database: "unreachable" });
    }
  }

  return send(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

const shutdown = async () => {
  server.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
