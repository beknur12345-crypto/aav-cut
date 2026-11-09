import type { Metadata } from 'next';
import { listMaterials } from '@/app/actions/settings';
import { CatalogManager } from '@/components/settings/CatalogManager';

export const metadata: Metadata = { title: 'Catalog of goods' };

export default async function CatalogPage() {
  return <CatalogManager materials={await listMaterials()} />;
}
