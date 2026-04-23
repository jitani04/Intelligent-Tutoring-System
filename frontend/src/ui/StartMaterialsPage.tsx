import { ChangeEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { uploadMaterial } from "../api";
import { getPendingStudyContext } from "../studyState";

export function StartMaterialsPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (!pendingContext) {
      return "";
    }

    return pendingContext.subject;
  }, [pendingContext]);

  if (!pendingContext) {
    return <Navigate replace to="/start/topic" />;
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFiles(Array.from(event.target.files ?? []));
  }

  async function handleContinue() {
    if (!pendingContext) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (selectedFiles.length > 0) {
        await Promise.all(selectedFiles.map((file) => uploadMaterial(file, pendingContext.subject)));
      }

      navigate("/start/method");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to upload materials.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">Step 2 of 3</div>
        <h1>Upload course material</h1>
        <p className="flow-copy">
          Optional, but recommended. Adding course material helps the tutor stay aligned with your
          class, notes, and terminology.
        </p>
        <p className="flow-subcopy">{subtitle}</p>

        <label className="upload-dropzone">
          <span>Drop PDFs, lecture notes, or syllabi here</span>
          <small>Supported formats: PDF, TXT, and MD.</small>
          <input multiple onChange={handleFilesChange} type="file" />
        </label>

        {selectedFiles.length > 0 ? (
          <div className="selection-list">
            {selectedFiles.map((file) => (
              <div className="selection-item" key={`${file.name}-${file.size}`}>
                {file.name}
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}

        <div className="flow-actions">
          <Link className="button button-secondary" to="/start/topic">
            Back
          </Link>
          <button className="button button-primary" disabled={isSubmitting} onClick={() => void handleContinue()} type="button">
            {isSubmitting ? "Uploading…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
