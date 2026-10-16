import type { Metadata } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';

import './globals.css';
import { brandCss } from '@/lib/color';
import { getBrand } from '@/lib/brand';
import { Providers } from './providers';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-display' });
const sans = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: { default: `${brand.appName} feedback`, template: `%s · ${brand.appName}` } };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const brand = await getBrand();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* The owner's colour, with readable text colours derived for both themes. */}
        <style dangerouslySetInnerHTML={{ __html: brandCss(brand.primaryColor) }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
