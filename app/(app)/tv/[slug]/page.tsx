import { renderWatchPage } from '@/lib/watch-page';

export default async function TvWatchPage({ params }: PageProps<'/tv/[slug]'>) {
    const { slug } = await params;
    return renderWatchPage('tv', slug);
}
