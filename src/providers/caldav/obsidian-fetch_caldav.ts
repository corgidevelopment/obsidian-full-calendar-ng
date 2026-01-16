// obsidian-fetch_caldav.ts
import { requestUrl, RequestUrlParam } from 'obsidian';

export async function obsidianFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : ((input as unknown as { url?: string }).url ?? (input as unknown as string));
  const method = init?.method ?? 'GET';

  const headers: Record<string, string> = {};
  if (init?.headers) new Headers(init.headers).forEach((v, k) => (headers[k] = v));

  const req: RequestUrlParam = {
    url,
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body:
      typeof init?.body === 'string'
        ? init.body
        : init?.body != null
          ? await new Response(init.body as BodyInit).text()
          : undefined,
    throw: false // never throw; let callers inspect status/body
  };

  const r = await requestUrl(req);

  const text = typeof r.text === 'string' ? r.text : '';
  const resp = new Response(text, { status: r.status, headers: r.headers as HeadersInit });
  (resp as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
    r.arrayBuffer ? r.arrayBuffer : new TextEncoder().encode(text).buffer;

  return resp;
}
