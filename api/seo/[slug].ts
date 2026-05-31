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
  const items = steps.map((s, i) => `
          <li style="display:flex;gap:12px;align-items:flex-start;">
            <span style="flex-shrink:0;width:32px;height:32px;background:#4f46e5;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${i + 1}</span>
            <span style="padding-top:4px;">${s}</span>
          </li>`).join('');
  return `<ol style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;">${items}\n      </ol>`;
}

function buildFaqHtml(faq: SeoPage['faq']): string {
  return faq.map((f) => `
        <details style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;">
          <summary style="font-weight:600;font-size:16px;color:#1e293b;cursor:pointer;">${f.question}</summary>
          <p style="margin:12px 0 0;color:#475569;line-height:1.6;">${f.answer}</p>
        </details>`).join('\n');
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

  // Visible SEO content — rendered above React app for crawlers and users
  const homeLabel = isManualen(host) ? 'Hem' : 'Home';
  const ctaLabel = isManualen(host) ? 'Prova gratis' : 'Try It Free';
  const ctaUrl = baseUrl + '/';

  const seoContent = `
    <main id="seo-content" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:48px 24px 32px;">
      <nav style="font-size:14px;color:#64748b;margin-bottom:24px;">
        <a href="${ctaUrl}" style="color:#4f46e5;text-decoration:none;">${homeLabel}</a>
        <span style="margin:0 8px;">/</span>
        <span>${page.h1}</span>
      </nav>
      <h1 style="font-size:36px;font-weight:800;color:#0f172a;margin:0 0 16px;line-height:1.2;">${page.h1}</h1>
      <p style="font-size:18px;color:#475569;line-height:1.7;margin:0 0 32px;">${page.intro}</p>
      <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#4f46e5;color:#fff;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;margin-bottom:40px;">${ctaLabel} &rarr;</a>
      <h2 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 20px;">${howItWorksHeading}</h2>
      <div style="background:#f8fafc;border-radius:16px;padding:24px;margin-bottom:40px;">
        ${buildHowItWorksHtml(page.howItWorks)}
      </div>
      <h2 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 20px;">${faqHeading}</h2>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:40px;">
        ${buildFaqHtml(page.faq)}
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
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
