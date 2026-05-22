const SUBJECT_THEMES: Array<{ match: string[]; image: string }> = [
  { match: ["biology", "anatomy", "botany", "zoology"], image: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=1200&q=80" },
  { match: ["chemistry", "organic", "biochem"], image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80" },
  { match: ["physics", "mechanics", "thermo", "electric"], image: "https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&w=1200&q=80" },
  { match: ["math", "algebra", "geometry", "calculus", "statistics", "discrete"], image: "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=80" },
  { match: ["history", "government", "politics", "geography"], image: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80" },
  { match: ["english", "writing", "literature", "reading"], image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80" },
  { match: ["computer", "coding", "programming", "software"], image: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1200&q=80" },
  { match: ["economics", "finance", "accounting", "business"], image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80" },
  { match: ["psychology", "sociology"], image: "https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=1200&q=80" },
];

const DEFAULT_SUBJECT_IMAGE = "https://images.unsplash.com/photo-1513258496099-48168024aec0?auto=format&fit=crop&w=1200&q=80";

export function subjectCoverImage(subject: string): string {
  const key = subject.toLowerCase();
  for (const { match, image } of SUBJECT_THEMES) {
    if (match.some((word) => key.includes(word))) return image;
  }
  return DEFAULT_SUBJECT_IMAGE;
}

export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "").trim().toLowerCase();
}

export function formatSubjectName(subject: string | null | undefined): string {
  const trimmed = (subject ?? "").trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}
