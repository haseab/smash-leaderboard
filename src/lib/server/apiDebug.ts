import { NextResponse } from "next/server";

type ApiDebugMeta = Record<string, unknown>;

const textEncoder = new TextEncoder();

export const isApiDebugEnabled = () =>
  process.env.NODE_ENV !== "production" || process.env.DEBUG_EGRESS === "1";

const getJsonByteLength = (body: unknown) => {
  try {
    return textEncoder.encode(JSON.stringify(body)).length;
  } catch {
    return null;
  }
};

const getRequestSummary = (request: Request) => {
  const url = new URL(request.url);
  const referer = request.headers.get("referer");
  let refererPath: string | null = null;

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      refererPath = `${refererUrl.pathname}${refererUrl.search}`;
    } catch {
      refererPath = referer;
    }
  }

  return {
    method: request.method,
    path: url.pathname,
    search: url.search,
    refererPath,
  };
};

export function logApiResponse(
  route: string,
  request: Request,
  startedAt: number,
  body: unknown,
  status: number,
  meta: ApiDebugMeta = {}
) {
  if (!isApiDebugEnabled()) {
    return;
  }

  const bodyBytes = getJsonByteLength(body);
  const elapsedMs = Math.round(performance.now() - startedAt);

  console.log(
    "[api-egress]",
    JSON.stringify({
      route,
      status,
      elapsedMs,
      bodyBytes,
      bodyKb: bodyBytes === null ? null : Number((bodyBytes / 1024).toFixed(1)),
      ...getRequestSummary(request),
      ...meta,
    })
  );
}

export function jsonWithApiDebug<T>(
  route: string,
  request: Request,
  startedAt: number,
  body: T,
  init?: ResponseInit,
  meta?: ApiDebugMeta
) {
  const status = init?.status ?? 200;
  logApiResponse(route, request, startedAt, body, status, meta);
  return NextResponse.json(body, init);
}
