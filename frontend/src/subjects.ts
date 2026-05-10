export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "").trim().toLowerCase();
}
