import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { deleteMaterial, listMaterials, uploadMaterial } from "../api";
import { getPendingStudyContext, getStoredUserId } from "../studyState";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MaterialsPage() {
  const queryClient = useQueryClient();
  const pendingContext = getPendingStudyContext();
  const [subject, setSubject] = useState(pendingContext?.subject ?? "");
  const [userIdInput, setUserIdInput] = useState(() => getStoredUserId());
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const parsedUserId = Number(userIdInput);
  const isValidUserId = Number.isInteger(parsedUserId) && parsedUserId > 0;

  useEffect(() => {
    if (isValidUserId) {
      window.localStorage.setItem("its-user-id", userIdInput);
    }
  }, [isValidUserId, userIdInput]);

  const materialsQuery = useQuery({
    queryKey: ["materials", parsedUserId],
    queryFn: () => listMaterials(parsedUserId),
    enabled: isValidUserId,
    refetchInterval: (query) =>
      query.state.data?.some((material) => material.status === "processing") ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: number) => deleteMaterial(parsedUserId, materialId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["materials", parsedUserId] });
    },
  });

  const materials = materialsQuery.data ?? [];
  const subjectSummary = useMemo(
    () => new Set(materials.map((material) => material.subject ?? "General")).size,
    [materials],
  );

  async function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!isValidUserId || files.length === 0) {
      return;
    }

    setUploadError(null);
    setUploadingNames(files.map((file) => file.name));
    try {
      await Promise.all(files.map((file) => uploadMaterial(parsedUserId, file, subject)));
      await queryClient.invalidateQueries({ queryKey: ["materials", parsedUserId] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploadingNames([]);
      event.target.value = "";
    }
  }

  function handleDelete(materialId: number) {
    void deleteMutation.mutateAsync(materialId);
  }

  return (
    <div className="resource-page">
      <header className="resource-header">
        <div>
          <p className="page-kicker">Materials</p>
          <h1>Course material library</h1>
          <p className="resource-copy">
            Keep your readings, lecture notes, and course files in one place so the tutor can
            ground answers in your actual study material.
          </p>
        </div>

        <div className="resource-actions">
          <label className="flow-field compact">
            <span>User id</span>
            <input
              min={1}
              onChange={(event) => setUserIdInput(event.target.value)}
              type="number"
              value={userIdInput}
            />
          </label>
          <Link className="button button-secondary" to="/history">
            Session history
          </Link>
          <Link className="button button-primary" to="/sessions/new">
            Start a session
          </Link>
        </div>
      </header>

      <section className="resource-grid">
        <div className="resource-card">
          <p className="rail-card-label">Upload material</p>
          <label className="flow-field">
            <span>Subject tag</span>
            <input
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Biology 101"
              value={subject}
            />
          </label>

          <label className="upload-dropzone">
            <span>Select files</span>
            <small>Supported formats: PDF, TXT, and MD.</small>
            <input disabled={!isValidUserId} multiple onChange={handleFilesChange} type="file" />
          </label>

          {!isValidUserId ? <p className="error-text">Enter a valid user id before uploading.</p> : null}
          {uploadError ? <p className="error-text">{uploadError}</p> : null}
        </div>

        <div className="resource-card">
          <p className="rail-card-label">Current snapshot</p>
          <div className="snapshot-grid">
            <div>
              <strong>{materials.length}</strong>
              <span>stored materials</span>
            </div>
            <div>
              <strong>{subjectSummary}</strong>
              <span>subjects tagged</span>
            </div>
          </div>
        </div>
      </section>

      <section className="resource-card">
        <div className="table-header">
          <div>
            <p className="rail-card-label">Library</p>
            <h2>Uploaded materials</h2>
          </div>
        </div>

        {materialsQuery.isLoading ? <p className="muted">Loading materials…</p> : null}
        {materialsQuery.isError ? <p className="error-text">Failed to load materials.</p> : null}

        {uploadingNames.length > 0 ? (
          <div className="resource-list pending-resource-list">
            {uploadingNames.map((name) => (
              <article className="resource-item" key={name}>
                <div>
                  <strong>{name}</strong>
                  <p>{subject.trim() || "General"} • Uploading now</p>
                </div>
                <div className="resource-item-actions">
                  <span className="status-pill">uploading</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {materials.length === 0 && uploadingNames.length === 0 && !materialsQuery.isLoading ? (
          <p className="muted">No materials stored yet.</p>
        ) : (
          <div className="resource-list">
            {materials.map((material) => (
              <article className="resource-item" key={material.id}>
                <div>
                  <strong>{material.filename}</strong>
                  <p>
                    {material.subject ?? "General"} • {formatDate(material.created_at)}
                  </p>
                  {material.error_message ? <p className="error-text">{material.error_message}</p> : null}
                </div>
                <div className="resource-item-actions">
                  <span className="status-pill">{material.status}</span>
                  <button
                    className="button button-secondary"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(material.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
