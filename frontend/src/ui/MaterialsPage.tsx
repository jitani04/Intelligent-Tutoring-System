import { ChangeEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { addMaterials, deleteMaterial, getMaterials, getPendingStudyContext } from "../studyState";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MaterialsPage() {
  const pendingContext = getPendingStudyContext();
  const [subject, setSubject] = useState(pendingContext?.subject ?? "");
  const [materials, setMaterials] = useState(() => getMaterials());
  const subjectSummary = useMemo(() => new Set(materials.map((material) => material.subject)).size, [materials]);

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const fileNames = Array.from(event.target.files ?? []).map((file) => file.name);
    if (fileNames.length === 0) {
      return;
    }

    const nextMaterials = addMaterials(fileNames, subject, "library");
    setMaterials(nextMaterials);
  }

  function handleDelete(materialId: string) {
    setMaterials(deleteMaterial(materialId));
  }

  return (
    <div className="resource-page">
      <header className="resource-header">
        <div>
          <p className="page-kicker">Materials</p>
          <h1>Course material library</h1>
          <p className="resource-copy">
            This is the route the PRD expects for upload management. The backend ingestion work is
            still pending, so this page currently manages local placeholders only.
          </p>
        </div>

        <div className="resource-actions">
          <Link className="button button-secondary" to="/history">
            Session history
          </Link>
          <Link className="button button-primary" to="/start/topic">
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
            <small>PDFs, notes, and syllabi will show up here while the real pipeline is pending.</small>
            <input multiple onChange={handleFilesChange} type="file" />
          </label>
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

        {materials.length === 0 ? (
          <p className="muted">No materials stored yet.</p>
        ) : (
          <div className="resource-list">
            {materials.map((material) => (
              <article className="resource-item" key={material.id}>
                <div>
                  <strong>{material.name}</strong>
                  <p>
                    {material.subject} • {formatDate(material.addedAt)}
                  </p>
                </div>
                <div className="resource-item-actions">
                  <span className="status-pill">{material.status}</span>
                  <button className="button button-secondary" onClick={() => handleDelete(material.id)} type="button">
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
