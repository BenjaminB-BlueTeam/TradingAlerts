/* ================================================
   netlify/functions/lib/cronLog.cjs
   Helper pour journaliser l'exécution des Scheduled Functions
   dans la table `cron_runs`.

   Utilisation type :
     const { startCronRun, endCronRun } = require('./lib/cronLog.cjs');

     const runId = await startCronRun('generate-alerts');
     try {
       // ... logique du cron ...
       await endCronRun(runId, { status: 'success', count_created: 12 });
     } catch (e) {
       await endCronRun(runId, { status: 'error', error_message: e.message });
     }

   Le helper est défensif : il ne propage jamais d'erreur. Si la BDD est down
   ou la table absente, on log côté console mais on ne casse pas le cron.
   ================================================ */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

async function startCronRun(cronName, metadata = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[cronLog] Supabase non configuré, skip startCronRun');
    return null;
  }
  try {
    const body = { cron_name: cronName, status: 'running' };
    if (metadata) body.metadata = metadata;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/cron_runs`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[cronLog] startCronRun HTTP ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    const rows = await res.json();
    return rows?.[0]?.id ?? null;
  } catch (e) {
    console.error(`[cronLog] startCronRun threw: ${e.message}`);
    return null;
  }
}

async function endCronRun(runId, { status = 'success', count_created, count_updated, count_processed, error_message, metadata } = {}) {
  if (runId == null) return false;
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const payload = { ended_at: new Date().toISOString(), status };
    if (count_created != null) payload.count_created = count_created;
    if (count_updated != null) payload.count_updated = count_updated;
    if (count_processed != null) payload.count_processed = count_processed;
    if (error_message) payload.error_message = String(error_message).slice(0, 2000);
    if (metadata !== undefined) payload.metadata = metadata;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/cron_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[cronLog] endCronRun HTTP ${res.status}: ${txt.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[cronLog] endCronRun threw: ${e.message}`);
    return false;
  }
}

module.exports = { startCronRun, endCronRun };
