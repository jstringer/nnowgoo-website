// Typed fetch helpers for the Payload REST API. This is the only place the
// Astro site talks to the CMS; pages import from here.

const BASE_URL = import.meta.env.PAYLOAD_URL ?? 'http://localhost:3000';

// Minimal shapes of what the site reads. Kept local so web/ doesn't depend on
// cms/ files; update alongside cms/src/collections/Work.ts and Media.ts.
export interface Media {
  id: string | number;
  url?: string | null;
  alt: string;
  mimeType?: string | null;
}

export function isVideo(media: Media): boolean {
  return Boolean(media.mimeType?.startsWith('video/'));
}

export interface Work {
  id: string | number;
  title: string;
  slug: string;
  client: string;
  date: string;
  overview: string;
  stack?: { name: string }[] | null;
  thumbnail: Media;
  gallery?: { image: Media }[] | null;
}

// Local disk storage returns relative URLs; Neon Object Storage returns
// absolute ones. Resizing happens on the frontend via astro:assets, so this
// always returns the original upload.
export function mediaUrl(media: Media): string {
  const url = media.url || '';
  return url.startsWith('/') ? `${BASE_URL}${url}` : url;
}

// All published work, newest first. depth=2 populates thumbnail and gallery media.
export async function getAllWork(): Promise<Work[]> {
  const query = 'where[_status][equals]=published&sort=-date&depth=2&limit=100';
  const url = `${BASE_URL}/api/work?${query}`;
  const res = await fetch(url).catch(() => {
    throw new Error(`Could not reach the Payload CMS at ${BASE_URL}. Is it running (cd cms && npm run dev)?`);
  });
  if (!res.ok) throw new Error(`Payload request failed (${res.status}) for ${url}`);
  const { docs } = (await res.json()) as { docs: Work[] };
  return docs;
}
