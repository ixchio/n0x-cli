/**
 * Auto-detect a running LLM backend.
 * Probes llama-server (8080) and Ollama (11434) in parallel and returns
 * the first responding URL plus detected backend type.
 */

export type BackendType = 'llama-server' | 'ollama' | 'unknown';

export interface DetectedBackend {
  url: string;
  type: BackendType;
  model?: string;
}

const PROBE_TIMEOUT_MS = 3_000;

async function probe(baseUrl: string): Promise<DetectedBackend | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: controller.signal,
      headers: { Authorization: 'Bearer none' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const firstModel = data.data?.[0]?.id;

    // Ollama uses port 11434; llama-server uses 8080
    const type: BackendType = baseUrl.includes('11434') ? 'ollama' : 'llama-server';
    return { url: baseUrl, type, model: firstModel };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Probe common local ports and return the first live backend.
 * Order: configured URL → llama-server (8080) → Ollama (11434)
 */
export async function autoDetectBackend(
  configuredUrl?: string,
): Promise<DetectedBackend | null> {
  const candidates = [
    configuredUrl,
    'http://localhost:8080/v1',
    'http://127.0.0.1:8080/v1',
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
  ].filter(Boolean) as string[];

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const unique = candidates.filter((u) => (seen.has(u) ? false : seen.add(u) || true));

  for (const url of unique) {
    const result = await probe(url);
    if (result) return result;
  }
  return null;
}
