// Watches every request a browser context makes (pages and their workers), so a test can assert that a user's file
// never leaves the browser (GOAL P3). Tool E2E tests can use it too: start it before the first page load, drive the
// tool, then expect `problems()` to be empty.
import type { BrowserContext, Request } from "@playwright/test";

export interface EgressWatch {
  /** Every request seen so far, in order, including ones made by workers. */
  readonly requests: Request[];
  /** One line per request that could have carried user data off the device; empty when there were none. */
  problems(): string[];
}

/**
 * The rules are strict on purpose, because they don't depend on recognising the file in transit (it could be
 * compressed, encoded or split): only our own origin, only GET and HEAD with no body, no WebSockets, and no
 * `secrets` (such as the file's name) in any URL or header. `blob:` and `data:` URLs never reach the network.
 *
 * Playwright sees requests from workers loaded from a URL in every browser, but not from workers made from a `blob:`
 * or `data:` URL, nor (outside Chromium) from service workers. So a page that starts one of those is a problem too.
 * Workers that a worker starts aren't checked.
 */
export async function watchEgress(
  context: BrowserContext,
  { origin, secrets }: { origin: string; secrets: string[] },
): Promise<EgressWatch> {
  const requests: Request[] = [];
  const unwatched: string[] = [];
  const needles = secrets.flatMap((s) => [s, encodeURIComponent(s)]).map((s) => s.toLowerCase());

  context.on("request", (request) => requests.push(request));
  const watchPage = (page: { on(event: "websocket", listener: (ws: { url(): string }) => void): unknown }) =>
    page.on("websocket", (ws) => unwatched.push(`WebSocket ${ws.url()}`));
  context.pages().forEach(watchPage);
  context.on("page", watchPage);

  await context.exposeFunction("reportUnwatchedEgress", (what: string) => void unwatched.push(what));
  await context.addInitScript(() => {
    const report = (window as unknown as { reportUnwatchedEgress: (what: string) => void }).reportUnwatchedEgress;
    const scope = window as unknown as Record<string, (new (...args: unknown[]) => object) | undefined>;
    for (const name of ["Worker", "SharedWorker"]) {
      const Original = scope[name];
      if (!Original) continue;
      scope[name] = new Proxy(Original, {
        construct(target, args: [string | URL, ...unknown[]], newTarget) {
          const url = String(args[0]);
          if (/^(blob|data):/.test(url)) report(`${name} from a ${url.split(":")[0]}: URL`);
          return Reflect.construct(target, args, newTarget) as object;
        },
      });
    }
    const container = navigator.serviceWorker as ServiceWorkerContainer | undefined;
    if (container) {
      const register = container.register.bind(container);
      container.register = (url, options) => {
        report(`service worker ${String(url)}`);
        return register(url, options);
      };
    }
  });

  function problemsWith(request: Request): string[] {
    const url = request.url();
    if (url.startsWith("blob:") || url.startsWith("data:")) return [];
    const found: string[] = [];
    const what = `${request.method()} ${url}`;
    if (new URL(url).origin !== origin) found.push(`${what}: another origin`);
    if (!["GET", "HEAD"].includes(request.method())) found.push(`${what}: can carry a body`);
    if ((request.postDataBuffer()?.length ?? 0) > 0) found.push(`${what}: has a body`);
    if (["websocket", "eventsource", "ping"].includes(request.resourceType())) {
      found.push(`${what}: ${request.resourceType()}`);
    }
    const sent = [url, ...Object.values(request.headers())].join("\n").toLowerCase();
    for (const needle of needles) if (sent.includes(needle)) found.push(`${what}: contains "${needle}"`);
    return found;
  }

  return { requests, problems: () => [...requests.flatMap(problemsWith), ...unwatched] };
}
