import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl, pages, sitemap } from './seo';

describe('publication metadata', () => {
  it('uses the actual public site by default', () => {
    expect(normalizeSiteUrl()).toBe('https://www.nbackstudio.com/');
  });

  it('preserves a hosting subdirectory and encodes XML-sensitive URL characters', () => {
    const site = normalizeSiteUrl(' https://memory.example/tools/n&back ');
    expect(site).toBe('https://memory.example/tools/n&back/');
    const xml = sitemap(site);
    expect(xml).toContain('<loc>https://memory.example/tools/n&amp;back/</loc>');
    expect(xml).toContain('<loc>https://memory.example/tools/n&amp;back/how-to-play/</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(pages.length);
  });

  it.each([
    '',
    'http://memory.example',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://memory.example/?preview=1',
    'https://memory.example/#game',
    'https://user:password@memory.example/',
    'not a URL',
  ])('rejects an unsuitable public URL: %s', (url) => {
    expect(() => normalizeSiteUrl(url)).toThrow();
  });
});
