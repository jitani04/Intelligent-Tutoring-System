import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileQuestion } from "lucide-react";

import { deleteMaterial, getMaterialExtractedText, getMaterialPreviewUrl, listMaterials } from "../api";
import { MarkdownText } from "./MarkdownText";
import { buttonClass } from "./buttonClass";
import Loading from "./Loading";
import ErrorMessage from "./ErrorMessage";

async function downloadViaBlob(url: string, filename: string, onError: (msg: string) => void) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    onError(err instanceof Error ? err.message : "Download failed.");
  }
}

function isMarkdownMime(mime: string): boolean {
  const lower = mime.toLowerCase();
  return lower.startsWith("text/markdown") || lower === "text/x-markdown";
}

function isPlainTextMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("text/") && !isMarkdownMime(mime);
}

function isIframePreviewable(mime: string): boolean {
  const lower = mime.toLowerCase();
  return lower === "application/pdf" || lower.startsWith("image/");
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MaterialDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [blobPreviewUrl, setBlobPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFetchError, setPreviewFetchError] = useState<string | null>(null);
  const { materialId, subject } = useParams<{ materialId: string; subject: string }>();
  const decodedSubject = decodeURIComponent(subject ?? "");
  const parsedMaterialId = Number(materialId);
  const projectMaterialsPath = decodedSubject
    ? `/projects/${encodeURIComponent(decodedSubject)}?tab=materials`
    : "/dashboard";

  const materialsQuery = useQuery({
    queryKey: ["materials", decodedSubject],
    queryFn: () => listMaterials(decodedSubject),
    enabled: Boolean(decodedSubject),
    refetchInterval: (q) =>
      q.state.data?.some((material) => material.status === "processing") ? 3000 : false,
  });

  const material = materialsQuery.data?.find((item) => item.id === parsedMaterialId);
  const isReady = material?.status === "ready";

  const previewQuery = useQuery({
    queryKey: ["material-preview", parsedMaterialId],
    queryFn: () => getMaterialPreviewUrl(parsedMaterialId),
    enabled: isReady && Number.isInteger(parsedMaterialId) && parsedMaterialId > 0,
    refetchInterval: (q) => {
      const expiresIn = q.state.data?.expires_in;
      if (!expiresIn) return false;
      return Math.max(60_000, (expiresIn - 60) * 1000);
    },
    staleTime: 30_000,
  });

  const previewMime = previewQuery.data?.mime_type ?? material?.mime_type ?? "";
  const isTextPreview = isMarkdownMime(previewMime) || isPlainTextMime(previewMime);
  const previewFilename = previewQuery.data?.filename ?? material?.filename ?? "";
  const inferredPdf = previewMime.toLowerCase() === "" && previewFilename.toLowerCase().endsWith(".pdf");
  const effectiveIframePreviewable = isIframePreviewable(previewMime) || inferredPdf;
  const needsExtractedText = isReady && !isTextPreview && !effectiveIframePreviewable;
  const extractedTextQuery = useQuery({
    queryKey: ["material-extracted-text", parsedMaterialId],
    enabled: needsExtractedText,
    staleTime: 60_000,
    queryFn: () => getMaterialExtractedText(parsedMaterialId),
  });
  const textContentQuery = useQuery({
    queryKey: ["material-preview-text", parsedMaterialId, previewQuery.data?.url],
    enabled: Boolean(previewQuery.data?.url) && isTextPreview,
    staleTime: 30_000,
    queryFn: async () => {
      const resp = await fetch(previewQuery.data!.url);
      if (!resp.ok) throw new Error(`Could not load file (${resp.status}).`);
      return resp.text();
    },
  });

  useEffect(() => {
    let revoked = false;
    async function fetchBlobPreview() {
      if (!effectiveIframePreviewable || !previewQuery.data?.url) {
        setPreviewLoading(false);
        setPreviewFetchError(null);
        if (blobPreviewUrl) {
          URL.revokeObjectURL(blobPreviewUrl);
          setBlobPreviewUrl(null);
        }
        return;
      }
      setPreviewLoading(true);
      setPreviewFetchError(null);
      try {
        const resp = await fetch(previewQuery.data.url);
        if (!resp.ok) throw new Error(`Could not fetch preview (${resp.status}).`);
        const blob = await resp.blob();
        if (revoked) return;
        const url = URL.createObjectURL(blob);
        if (blobPreviewUrl) URL.revokeObjectURL(blobPreviewUrl);
        setBlobPreviewUrl(url);
      } catch (err) {
        setPreviewFetchError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewLoading(false);
      }
    }
    void fetchBlobPreview();
    return () => {
      revoked = true;
      if (blobPreviewUrl) {
        URL.revokeObjectURL(blobPreviewUrl);
        setBlobPreviewUrl(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewQuery.data?.url, effectiveIframePreviewable]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["materials", decodedSubject] });
      navigate(projectMaterialsPath);
    },
  });

  if (!Number.isInteger(parsedMaterialId) || parsedMaterialId <= 0) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <div className="empty-state-icon"><FileQuestion size={26} strokeWidth={1.6} /></div>
          <h3>Material not found</h3>
          <p>This material link is not valid.</p>
          <Link className={buttonClass("primary")} to={projectMaterialsPath}>Back to materials</Link>
        </div>
      </div>
    );
  }

  if (materialsQuery.isLoading) {
    return (
      <div className="page-shell">
        <Loading title="Loading material…" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <div className="empty-state-icon"><FileQuestion size={26} strokeWidth={1.6} /></div>
          <h3>Material not found</h3>
          <p>It may have been deleted, or you may not have access to it.</p>
          <Link className={buttonClass("primary")} to={projectMaterialsPath}>Back to materials</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <Link className={buttonClass("secondary")} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.5rem" }} to={projectMaterialsPath}>
            <ChevronLeft size={15} strokeWidth={2} />Back
          </Link>
          <h1 className="page-title">{material.filename}</h1>
          <p className="page-subtitle">
            {material.subject ?? "General"} material uploaded on {formatDateTime(material.created_at)}.
          </p>
        </div>
        <button
          className={buttonClass("secondary")}
          disabled={deleteMutation.isPending}
          onClick={() => void deleteMutation.mutateAsync(material.id)}
          type="button"
        >
          {deleteMutation.isPending ? "Deleting…" : "Delete"}
        </button>
      </div>

      {material.status === "processing" ? (
        <Loading title="Processing file…" subtitle="Sapient is reading and indexing this file." />
      ) : null}
      {material.status === "failed" ? (
        <ErrorMessage message={material.error_message ?? "Processing failed."} />
      ) : null}

      {isReady ? (
        <div className="content-card">
          {previewQuery.isLoading ? <Loading title="Loading preview…" /> : null}
          {previewQuery.isError ? (
            <ErrorMessage message={`Could not load preview. ${(previewQuery.error as Error)?.message ?? ""}`} />
          ) : null}
          {previewQuery.data ? (
            <div className="material-preview-frame">
              {isTextPreview ? (
                <div
                  style={{
                    width: "100%",
                    maxHeight: "70vh",
                    overflow: "auto",
                    border: "1px solid var(--border, #e2e2e2)",
                    borderRadius: "8px",
                    background: "#fff",
                    padding: "1rem 1.25rem",
                  }}
                >
                  {textContentQuery.isLoading ? (
                    <Loading title="Loading file…" />
                  ) : textContentQuery.isError ? (
                    <ErrorMessage message={`Could not load file. ${(textContentQuery.error as Error)?.message ?? ""}`} />
                  ) : isMarkdownMime(previewMime) ? (
                    <MarkdownText className="markdown-body">{textContentQuery.data ?? ""}</MarkdownText>
                  ) : (
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                      {textContentQuery.data ?? ""}
                    </pre>
                  )}
                </div>
              ) : effectiveIframePreviewable ? (
                previewLoading ? (
                  <Loading title="Loading preview…" />
                ) : previewFetchError ? (
                  <ErrorMessage message={`Could not load preview. ${previewFetchError}`} />
                ) : (
                  <iframe
                    key={blobPreviewUrl ?? previewQuery.data.url}
                    src={blobPreviewUrl ? `${blobPreviewUrl}#${encodeURIComponent(previewFilename)}` : previewQuery.data.url}
                    title={`Preview of ${material.filename}`}
                    style={{ width: "100%", height: "70vh", border: "1px solid var(--border, #e2e2e2)", borderRadius: "8px", background: "#fff" }}
                  />
                )
              ) : (
                <div className="material-extracted-preview">
                  {extractedTextQuery.isLoading ? (
                    <Loading title="Loading extracted text…" />
                  ) : extractedTextQuery.isError ? (
                    <ErrorMessage message={`Could not load extracted text. ${(extractedTextQuery.error as Error)?.message ?? ""}`} />
                  ) : extractedTextQuery.data && extractedTextQuery.data.chunks.length === 0 ? (
                    <p className="muted">No text was extracted from this file.</p>
                  ) : (
                    <div className="material-extracted-body">
                      {(extractedTextQuery.data?.chunks ?? []).map((chunk, idx) => (
                        <section key={idx} className="material-extracted-chunk">
                          {chunk.page_number != null && (
                            <div className="material-extracted-page">Page {chunk.page_number}</div>
                          )}
                          <p>{chunk.content}</p>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                <a
                  className={buttonClass("secondary")}
                  href={blobPreviewUrl ? `${blobPreviewUrl}#${encodeURIComponent(previewFilename)}` : previewQuery.data.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    // If we have a blob URL use it directly; otherwise let the link open the signed URL
                    if (blobPreviewUrl) return;
                    // If the signed URL would force a download, prevent navigation and open a blob fallback if available
                    return;
                  }}
                >
                  Open in new tab
                </a>
                <button
                  className={buttonClass("secondary")}
                  disabled={downloading}
                  onClick={async () => {
                    setDownloadError(null);
                    setDownloading(true);
                    await downloadViaBlob(previewQuery.data!.url, material.filename, setDownloadError);
                    setDownloading(false);
                  }}
                  type="button"
                >
                  {downloading ? "Downloading…" : "Download"}
                </button>
                {downloadError && <ErrorMessage message={downloadError} />}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
