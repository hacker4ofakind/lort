import { BrandProvider } from '@/components/board/brand';
import { getBrand } from '@/lib/brand';

export const metadata = { title: 'Dashboard' };

export default async function DashboardRoot({ children }: LayoutProps<'/dashboard'>) {
  return <BrandProvider brand={await getBrand()}>{children}</BrandProvider>;
}
