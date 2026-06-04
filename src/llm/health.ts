import type { N0xConfig } from '../config/schema.js';
import { log } from '../lib/logger.js';

export interface HealthResult {
  ok: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
}

export async function checkLlmHealth(config: N0xConfig): Promise<HealthResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${config.base_url}/models`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - start,
      };
    }

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = data.data?.map((m) => m.id) ?? [];
    return { ok: true, latencyMs: Date.now() - start, models };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    log.debug('LLM health check failed', { error: msg });
    return { ok: false, error: msg, latencyMs: Date.now() - start };
  }
}
