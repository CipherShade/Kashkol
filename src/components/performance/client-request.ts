export async function requestPerformanceJson<T>(
  path: string,
  method?: "GET" | "POST" | "PATCH",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return (await response.json()) as T;
}
