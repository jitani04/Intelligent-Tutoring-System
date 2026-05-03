import { ChangeEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { deleteMaterial, listMaterials, uploadMaterial } from "../api";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function MaterialsPage() {
  const { subject } = useParams<{ subject: string }>();
  const decodedSubject = decodeURIComponent(subject ?? "");
  const projectMaterialsPath = `/projects/${encodeURIComponent(decodedSubject)}/materials`;
  const queryClient = useQueryClient();
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const materialsQuery = useQuery({
    queryKey: ["materials", decodedSubject],
    queryFn: () => listMaterials(decodedSubject),
    enabled: Boolean(decodedSubject),
    refetchInterval: (q) =>
      q.state.data?.some((m) => m.status === "processing") ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMaterial(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["materials", decodedSubject] }); },
  });

  const materials = materialsQuery.data ?? [];

  if (!decodedSubject) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <div className="empty-state-icon">?</div>
          <h3>Subject not found</h3>
          <p>Open materials from a specific subject.</p>
          <Link className="button button-primary" to="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadError(null);
    setUploadingNames(files.map((f) => f.name));
    try {
      await Promise.all(files.map((f) => uploadMaterial(f, decodedSubject)));
      await queryClient.invalidateQueries({ queryKey: ["materials", decodedSubject] });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingNames([]);
      e.target.value = "";
    }
  }

  const statusClass: Record<string, string> = {
    ready: "status-dot-ready",
    processing: "status-dot-processing",
    failed: "status-dot-failed",
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Materials</h1>
          <p className="page-subtitle">
            {decodedSubject} subject files for grounded tutoring, retrieval, and study support.
          </p>
        </div>
      </div>

      <div className="content-card">
        <div className="content-card-title">Upload</div>
        <p className="settings-copy" style={{ marginBottom: "0.875rem" }}>
          Uploading here automatically attaches each file to <strong>{decodedSubject}</strong>.
        </p>
        <label className="upload-zone">
          <div className="upload-zone-icon">📄</div>
          <div className="upload-zone-label">Drop files or click to browse</div>
          <div className="upload-zone-sub">PDF, TXT, MD · max 10 MB each</div>
          <input type="file" multiple style={{ display: "none" }} onChange={handleFiles} />
        </label>
        {uploadError ? <p className="error-text" style={{ marginTop: "0.5rem" }}>{uploadError}</p> : null}
      </div>

      <div className="content-card">
        <div className="content-card-title">All materials</div>

        {materialsQuery.isLoading ? <p className="muted">Loading…</p> : null}
        {materialsQuery.isError ? <p className="error-text">Failed to load materials.</p> : null}

        <div className="material-list">
          {uploadingNames.map((name) => (
            <div key={name} className="material-row">
              <div className="material-row-icon">📄</div>
              <div className="material-row-info">
                <div className="material-row-name">{name}</div>
                <div className="material-row-meta">Uploading…</div>
              </div>
              <div className="status-dot status-dot-processing" />
            </div>
          ))}

          {materials.length === 0 && uploadingNames.length === 0 && !materialsQuery.isLoading ? (
            <p className="muted">No materials yet. Upload files above.</p>
          ) : null}

          {materials.map((m) => (
            <div key={m.id} className="material-row">
              <div className="material-row-icon">📄</div>
              <div className="material-row-info">
                <Link className="material-row-name material-row-link" to={`${projectMaterialsPath}/${m.id}`}>
                  {m.filename}
                </Link>
                <div className="material-row-meta">
                  {formatDate(m.created_at)}
                  {m.error_message ? ` · ${m.error_message}` : ""}
                </div>
              </div>
              <div className={`status-dot ${statusClass[m.status] ?? ""}`} />
              <button
                className="button button-secondary"
                style={{ fontSize: "0.76rem", padding: "0.3rem 0.65rem" }}
                disabled={deleteMutation.isPending}
                onClick={() => void deleteMutation.mutateAsync(m.id)}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
