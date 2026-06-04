export function truncate(text: string, maxLen: number, suffix = '\n...(truncated)'): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - suffix.length) + suffix;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/tvly-[A-Za-z0-9]+/gi, 'tvly-[REDACTED]')
    .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[REDACTED]');
}
