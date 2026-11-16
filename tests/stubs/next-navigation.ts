// Test stub: next-intl's locale-aware navigation imports Next's client router,
// and the UI suite renders static markup under Node where Next's own entry
// points do not resolve. `Link` comes from the sibling `next-link` stub; these
// are the router hooks and redirect helpers the navigation factory touches.
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return "/";
}

export function redirect(url: string): never {
  throw new Error(`redirect(${url}) is not available in static rendering`);
}

export function permanentRedirect(url: string): never {
  throw new Error(`permanentRedirect(${url}) is not available in static rendering`);
}
