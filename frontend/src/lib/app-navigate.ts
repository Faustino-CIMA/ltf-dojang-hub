type ClientNavigation = {
  replace: (href: string) => void;
  refresh: () => void;
};

let clientNavigation: ClientNavigation | null = null;

/** The app shell registers the Next.js router so a closed desk can move without a full page load. */
export function registerClientNavigation(navigation: ClientNavigation) {
  clientNavigation = navigation;
  return () => {
    if (clientNavigation === navigation) {
      clientNavigation = null;
    }
  };
}

export function chooseClientReplace(
  href: string,
  navigation: ClientNavigation | null,
  assign: (href: string) => void,
) {
  if (navigation) {
    navigation.replace(href);
    return;
  }
  assign(href);
}

export function chooseClientRefresh(navigation: ClientNavigation | null, reload: () => void) {
  if (navigation) {
    navigation.refresh();
    return;
  }
  reload();
}

export function replaceWithClientRouter(href: string) {
  if (typeof window === "undefined") {
    return;
  }
  chooseClientReplace(href, clientNavigation, (next) => window.location.assign(next));
}

export function refreshWithClientRouter() {
  if (typeof window === "undefined") {
    return;
  }
  chooseClientRefresh(clientNavigation, () => window.location.reload());
}
