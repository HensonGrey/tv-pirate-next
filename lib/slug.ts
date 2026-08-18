/** "Breaking Bad" → "breaking-bad" — decorative URL slugs. The tmdb id
 * before the dash is what the route actually reads; the slug is for humans
 * (and typing convenience). */
export function slugify(title: string | null): string {
    return (title ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
