import type { Plugin } from 'vite';

export const defaultSiteUrl = 'https://www.nbackstudio.com/';

export const pages = [
  {
    path: '',
    title: 'Dual N-Back Online — Free Memory Training',
    description:
      'Play dual n-back online for free in a clean, distraction-free space. Practice position and audio matches with adjustable difficulty. No signup required.',
  },
  {
    path: 'how-to-play/',
    title: 'How to Play Dual N-Back — Examples, Controls & Scoring',
    description:
      'Learn how to play dual n-back with step-by-step instructions, 2-back examples, keyboard and touch controls, and a clear explanation of your score.',
  },
] as const;

export function normalizeSiteUrl(value = defaultSiteUrl): string {
  if (!value.trim()) throw new Error('SITE_URL cannot be blank.');
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost') ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  ) {
    throw new Error(
      'SITE_URL must be a public HTTPS URL without credentials, a query, or a fragment.',
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

export function xmlEscape(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character];
  });
}

export function sitemap(siteUrl: string): string {
  const locations = pages.map(
    (page) => `  <url><loc>${xmlEscape(new URL(page.path, siteUrl).href)}</loc></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.join('\n')}\n</urlset>\n`;
}

export function seoPlugin(siteUrl?: string): Plugin {
  const site = normalizeSiteUrl(siteUrl);
  return {
    name: 'static-page-seo',
    transformIndexHtml(html, context) {
      const isGuide = context.filename.replaceAll('\\', '/').endsWith('/how-to-play/index.html');
      const page = pages[isGuide ? 1 : 0];
      const canonical = new URL(page.path, site).href;
      return {
        html,
        tags: [
          { tag: 'title', children: page.title.replaceAll('&', '&amp;'), injectTo: 'head' },
          {
            tag: 'meta',
            attrs: { name: 'description', content: page.description },
            injectTo: 'head',
          },
          { tag: 'meta', attrs: { property: 'og:type', content: 'website' }, injectTo: 'head' },
          {
            tag: 'meta',
            attrs: { property: 'og:site_name', content: 'Dual N-Back' },
            injectTo: 'head',
          },
          { tag: 'meta', attrs: { property: 'og:title', content: page.title }, injectTo: 'head' },
          {
            tag: 'meta',
            attrs: { property: 'og:description', content: page.description },
            injectTo: 'head',
          },
          { tag: 'link', attrs: { rel: 'canonical', href: canonical }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: canonical }, injectTo: 'head' },
        ],
      };
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(site) });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', site).href}\n`,
      });
    },
  };
}
