let routes = {};
let container = null;
let currentPage = null;
let currentPath = '';
let onRouteChange = null;
let routeGuard = null;

export function initRouter(routeConfig, containerElement, routeChangeCallback, accessGuard = null) {
  routes = routeConfig;
  container = containerElement;
  onRouteChange = routeChangeCallback;
  routeGuard = accessGuard;
  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // initial route
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentPath() {
  return currentPath;
}

async function handleRoute() {
  const hash = window.location.hash.slice(1) || '/';
  if (routeGuard && !(await routeGuard(hash))) return;
  currentPath = hash;
  
  // Find matching route:
  // 1. Try exact match: routes[hash]
  // 2. Try pattern match: split both hash and route pattern by '/',
  //    compare segments, collect :param values
  // Example: pattern '/learn/:letter' matches hash '/learn/A' → params = { letter: 'A' }
  
  let matchedPage = null;
  let params = {};
  
  // Exact match first
  if (routes[hash]) {
    matchedPage = routes[hash];
  } else {
    // Pattern matching
    for (const [pattern, page] of Object.entries(routes)) {
      const patternParts = pattern.split('/').filter(Boolean);
      const hashParts = hash.split('/').filter(Boolean);
      
      if (patternParts.length !== hashParts.length) continue;
      
      let match = true;
      const tempParams = {};
      
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          tempParams[patternParts[i].slice(1)] = decodeURIComponent(hashParts[i]);
        } else if (patternParts[i] !== hashParts[i]) {
          match = false;
          break;
        }
      }
      
      if (match) {
        matchedPage = page;
        params = tempParams;
        break;
      }
    }
  }
  
  if (!matchedPage) {
    matchedPage = routes['/'] || Object.values(routes)[0];
    params = {};
  }
  
  // Unmount current page
  if (currentPage && currentPage.unmount) {
    try { currentPage.unmount(); } catch(e) { console.error('Unmount error:', e); }
  }
  
  // Clear container
  container.innerHTML = '';
  
  // Mount new page
  currentPage = matchedPage;
  try {
    const result = currentPage.mount(container, params);
    if (result instanceof Promise) {
      result.catch(e => console.error('Mount error:', e));
    }
  } catch(e) {
    console.error('Mount error:', e);
    container.innerHTML = '<div class="FSL-container FSL-text-center FSL-mt-3"><h2>Something went wrong</h2><p>Please try navigating to another page.</p></div>';
  }
  
  // Notify route change
  if (onRouteChange) onRouteChange(currentPath);
}
