export interface QuickCaptureNote {
  title: string;
  content: string;
  color: string;
}

export function buildQuickCaptureNote(title: string, content: string, color = "#22d3ee"): QuickCaptureNote | null {
  const normalizedTitle = title.trim();
  const normalizedContent = content.trim();
  const fallbackTitle = normalizedContent.split("\n")[0]?.slice(0, 72).trim() || "Nota rápida";

  if (!normalizedTitle && !normalizedContent) return null;

  return {
    title: normalizedTitle || fallbackTitle,
    content: normalizedContent,
    color,
  };
}
