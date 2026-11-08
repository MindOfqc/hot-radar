/** 只放行 http(s) 链接,拦截 javascript:/data: 等危险协议;
 *  上游 60s 把 query 里的 & 转义成 &amp;,先还原,否则贴吧等链接参数畸形。 */
export function safeUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
