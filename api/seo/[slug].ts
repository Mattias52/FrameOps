import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';
import { enPages } from '../seo-data/en';
import { svPages } from '../seo-data/sv';
import type { SeoPage } from '../seo-data/types';

function getHtml(): string {
  const htmlPath = join(process.cwd(), 'dist', 'index.html');
  return readFileSync(htmlPath, 'utf-8');
}

function isManualen(host: string): boolean {
  return host.includes('manualen.nu');
}

function getBaseUrl(host: string): string {
  return isManualen(host) ? 'https://www.manualen.nu' : 'https://www.frameops.ai';
}

function getUrlPrefix(host: string): string {
  return isManualen(host) ? '/skapa-manual' : '/sop-generator';
}

function getAppName(host: string): string {
  return isManualen(host) ? 'Manualen.nu' : 'FrameOps';
}

function findPage(slug: string, host: string): SeoPage | undefined {
  const pages = isManualen(host) ? svPages : enPages;
  return pages.find((p) => p.slug === slug);
}

function buildFaqSchema(page: SeoPage): string {
  const faqEntities = page.faq.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: f.answer,
    },
  }));
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntities,
  });
}

function buildHowItWorksHtml(steps: string[]): string {
  const items = steps.map((s) => `<li>${s}</li>`).join('\n        ');
  return `<ol>\n        ${items}\n      </ol>`;
}

function buildFaqHtml(faq: SeoPage['faq']): string {
  return faq.map((f) => `<h3>${f.question}</h3>\n      <p>${f.answer}</p>`).join('\n      ');
}

function injectSeo(html: string, page: SeoPage, host: string): string {
  const baseUrl = getBaseUrl(host);
  const prefix = getUrlPrefix(host);
  const pageUrl = `${baseUrl}${prefix}/${page.slug}`;
  const appName = getAppName(host);
  const lang = isManualen(host) ? 'sv' : 'en';
  const howItWorksHeading = isManualen(host) ? 'Så fungerar det' : 'How It Works';
  const faqHeading = 'FAQ';

  // Build alternate hreflang URL
  const enBaseUrl = 'https://www.frameops.ai';
  const svBaseUrl = 'https://www.manualen.nu';

  // Meta tags to inject in <head>
  const metaTags = `
    <title>${page.title}</title>
    <meta name="description" content="${page.description}">
    <meta name="keywords" content="${page.keywords}">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:title" content="${page.title}">
    <meta property="og:description" content="${page.description}">
    <meta property="og:image" content="${baseUrl}/og-image.png">
    <meta property="og:site_name" content="${appName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${pageUrl}">
    <meta name="twitter:title" content="${page.title}">
    <meta name="twitter:description" content="${page.description}">
    <meta name="twitter:image" content="${baseUrl}/og-image.png">`;

  // Hidden SEO content for crawlers
  const seoContent = `
    <main style="position:absolute;left:-9999px;" aria-hidden="false">
      <h1>${page.h1}</h1>
      <p>${page.intro}</p>
      <h2>${howItWorksHeading}</h2>
      ${buildHowItWorksHtml(page.howItWorks)}
      <h2>${faqHeading}</h2>
      ${buildFaqHtml(page.faq)}
    </main>`;

  // FAQ JSON-LD schema
  const faqSchema = `<script type="application/ld+json">${buildFaqSchema(page)}</script>`;

  let result = html;

  // Set lang attribute
  result = result.replace('<html lang="en">', `<html lang="${lang}">`);

  // Replace existing <title>
  result = result.replace(/<title>.*?<\/title>/, '');

  // Replace existing meta description
  result = result.replace(/<meta name="description" content="[^"]*">/, '');

  // Replace existing meta keywords
  result = result.replace(/<meta name="keywords" content="[^"]*">/, '');

  // Replace existing canonical
  result = result.replace(/<link rel="canonical" href="[^"]*">/, '');

  // Replace existing OG tags
  result = result.replace(/<meta property="og:type" content="[^"]*">/, '');
  result = result.replace(/<meta property="og:url" content="[^"]*">/, '');
  result = result.replace(/<meta property="og:title" content="[^"]*">/, '');
  result = result.replace(/<meta property="og:description" content="[^"]*">/, '');
  result = result.replace(/<meta property="og:image" content="[^"]*">[\s\S]*?<meta property="og:site_name" content="[^"]*">/, '');

  // Replace existing Twitter tags
  result = result.replace(/<meta name="twitter:card" content="[^"]*">/, '');
  result = result.replace(/<meta name="twitter:url" content="[^"]*">/, '');
  result = result.replace(/<meta name="twitter:title" content="[^"]*">/, '');
  result = result.replace(/<meta name="twitter:description" content="[^"]*">/, '');
  result = result.replace(/<meta name="twitter:image" content="[^"]*">/, '');

  // Inject new meta tags after <head>
  result = result.replace('</head>', `${metaTags}\n    ${faqSchema}\n</head>`);

  // Inject hidden content before <div id="root">
  result = result.replace('<div id="root">', `${seoContent}\n    <div id="root">`);

  return result;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { slug } = req.query;
  const host = (req.headers.host || req.headers['x-forwarded-host'] || '') as string;

  if (!slug || typeof slug !== 'string') {
    res.status(400).send('Bad request');
    return;
  }

  const page = findPage(slug, host);
  if (!page) {
    res.status(404).send('Not found');
    return;
  }

  try {
    const html = getHtml();
    const result = injectSeo(html, page, host);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(result);
  } catch (err) {
    console.error('SEO page error:', err);
    res.status(500).send('Internal server error');
  }
}
