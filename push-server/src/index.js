/* Envia os lembretes da agenda por push.
   O app (no aparelho) calcula a hora de cada lembrete e grava em push_jobs; cada aparelho
   com avisos ativos se inscreve em push_subs. A cada 5 min o gatilho agendado chama /tick,
   que envia os lembretes vencidos para todos os aparelhos e marca como enviados.
   Só o gatilho do Neon consegue chamar /tick (parseTriggerDelivery confere o cabeçalho
   que o proxy do Neon remove de pedidos de fora). */
import * as webpush from "web-push";
import pg from "pg";
import { attachDatabasePool } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
attachDatabasePool(pool);
webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

// Com o gatilho a cada 5 min, manda o que vence até 2 min à frente: o aviso chega no máximo
// ~3 min depois ou 2 min antes da hora. Lembretes perdidos há mais de 6 h são descartados.
const AHEAD = "2 minutes", STALE = "6 hours";

async function tick() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: jobs } = await client.query(
      `SELECT id, title, body, tag FROM push_jobs
        WHERE active AND sent_at IS NULL AND fire_at <= now() + $1::interval
        ORDER BY fire_at LIMIT 100 FOR UPDATE SKIP LOCKED`, [AHEAD]);
    if (!jobs.length) { await client.query("COMMIT"); return { sent: 0 }; }
    await client.query(
      `UPDATE push_jobs SET sent_at = now() WHERE id = ANY($1)`, [jobs.map((j) => j.id)]);
    await client.query("COMMIT");

    const { rows: subs } = await pool.query("SELECT endpoint, sub FROM push_subs WHERE active");
    const { rows: staleRows } = await pool.query(
      `SELECT id FROM push_jobs WHERE id = ANY($1) AND fire_at < now() - $2::interval`, [jobs.map((j) => j.id), STALE]);
    const stale = new Set(staleRows.map((r) => r.id));
    let sent = 0;
    const dead = new Set();
    for (const j of jobs) {
      if (stale.has(j.id)) continue;
      const payload = JSON.stringify({ title: j.title, body: j.body, tag: j.tag || j.id });
      await Promise.all(subs.map(async (s) => {
        if (dead.has(s.endpoint)) return;
        try { await webpush.sendNotification(s.sub, payload, { TTL: 6 * 3600, urgency: "high" }); sent++; }
        catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) dead.add(s.endpoint); // inscrição expirada
          else console.error("[push]", err.statusCode, err.body || err.message);
        }
      }));
    }
    if (dead.size) await pool.query("UPDATE push_subs SET active = false, updated_at = now() WHERE endpoint = ANY($1)", [[...dead]]);
    return { jobs: jobs.length, sent, expired: dead.size };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/tick" && request.method === "POST") {
      const parsed = await parseTriggerDelivery(request);
      if (!parsed.ok) return new Response(parsed.error, { status: parsed.error === "invalid_body" ? 400 : 401 });
      return Response.json(await tick());
    }
    return new Response("stepbystep lembretes", { status: 200 });
  },
};
