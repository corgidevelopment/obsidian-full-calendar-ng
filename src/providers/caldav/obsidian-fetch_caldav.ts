// obsidian-fetch_caldav.ts
import { requestUrl, RequestUrlParam } from 'obsidian';

export async function obsidianFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : ((input as any).url ?? String(input));
  const method = init?.method ?? 'GET';

  const headers: Record<string, string> = {};
  if (init?.headers) new Headers(init.headers as any).forEach((v, k) => (headers[k] = v));

  const req: RequestUrlParam = {
    url,
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body:
      typeof init?.body === 'string'
        ? (init!.body as string)
        : init?.body != null
          ? await new Response(init!.body as any).text()
          : undefined,
    throw: false // never throw; let callers inspect status/body
  };

  const r = await requestUrl(req);

  const text = typeof r.text === 'string' ? r.text : '';
  const resp = new Response(text, { status: r.status, headers: r.headers as any });
  (resp as any).arrayBuffer = async () =>
    r.arrayBuffer ? r.arrayBuffer : new TextEncoder().encode(text).buffer;

  return resp;
}
