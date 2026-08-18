import { renderWatchPage } from '@/lib/watch-page';

export default async function MovieWatchPage({ params }: PageProps<'/movie/[slug]'>) {
    const { slug } = await params;
    return renderWatchPage('movie', slug);
}
