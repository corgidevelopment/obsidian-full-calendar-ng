export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "PROPFIND" | "MKCOL" | "LOCK" | "UNLOCK" | "COPY" | "MOVE" | "PROPPATCH";

export type RequestOptions = {
  host: string;
  path: string;
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string | Record<string, any>;
};

export type HttpRequestInterface = {
  request: (opts: RequestOptions) => Promise<string|null>;
};
