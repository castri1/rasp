export function timeoutSignal(milliseconds: number): AbortSignal | undefined {
  if (typeof AbortSignal === 'undefined') return undefined;
  const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (value: number) => AbortSignal }).timeout;
  return typeof timeout === 'function' ? timeout(milliseconds) : undefined;
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `rasp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`.slice(0, 80);
}

function supportsFlexGap(): boolean {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.rowGap = '1px';
  container.append(document.createElement('div'), document.createElement('div'));
  for (const child of Array.from(container.children) as HTMLElement[]) child.style.height = '1px';
  document.body.appendChild(container);
  const supported = container.scrollHeight === 3;
  container.remove();
  return supported;
}

export function applyBrowserCompatibility(): void {
  const supports = (property: string, value: string) => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(property, value);
  const force = window.location.search.includes('legacyLayout=1');
  const featureSupport = {
    grid: !force && supports('display', 'grid'),
    flexGap: !force && supportsFlexGap(),
    colorMix: !force && supports('color', 'color-mix(in srgb, #000 50%, #fff)'),
    dynamicViewport: !force && supports('height', '100dvh'),
  };
  const root = document.documentElement;
  if (!featureSupport.grid) root.classList.add('no-grid');
  if (!featureSupport.flexGap) root.classList.add('no-flex-gap');
  if (!featureSupport.colorMix) root.classList.add('no-color-mix');
  if (!featureSupport.dynamicViewport) root.classList.add('no-dvh');
  if (Object.values(featureSupport).some(value => !value)) root.classList.add('compat-layout');
}

export function reportPreviewDiagnostics(): void {
  if (!window.location.search.includes('diagnostic=1')) return;
  const supports = (property: string, value: string) => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(property, value);
  const payload = {
    userAgent: navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1 },
    screen: { width: window.screen.width, height: window.screen.height },
    features: {
      grid: supports('display', 'grid'),
      flexGap: supportsFlexGap(),
      colorMix: supports('color', 'color-mix(in srgb, #000 50%, #fff)'),
      dynamicViewport: supports('height', '100dvh'),
    },
  };
  fetch('/preview-diagnostic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}
