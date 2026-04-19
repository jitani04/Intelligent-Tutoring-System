import { ChangeEvent, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { addMaterials, getPendingStudyContext } from "../studyState";

export function StartMaterialsPage() {
  const navigate = useNavigate();
  const pendingContext = getPendingStudyContext();
  const [fileNames, setFileNames] = useState<string[]>([]);

  const subtitle = useMemo(() => {
    if (!pendingContext) {
      return "";
    }

    return `${pendingContext.subject} • ${pendingContext.topic}`;
  }, [pendingContext]);

  if (!pendingContext) {
    return <Navigate replace to="/start/topic" />;
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []).map((file) => file.name);
    setFileNames(nextFiles);
  }

  function handleContinue() {
    if (!pendingContext) {
      return;
    }

    if (fileNames.length > 0) {
      addMaterials(fileNames, pendingContext.subject, "onboarding");
    }

    navigate("/start/method");
  }

  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">Step 2 of 3</div>
        <h1>Upload course material</h1>
        <p className="flow-copy">
          Optional, but this is how the product becomes course-grounded instead of generic.
        </p>
        <p className="flow-subcopy">{subtitle}</p>

        <label className="upload-dropzone">
          <span>Drop PDFs, lecture notes, or syllabi here</span>
          <small>The backend ingestion pipeline is not wired yet, so this stores file metadata locally.</small>
          <input multiple onChange={handleFilesChange} type="file" />
        </label>

        {fileNames.length > 0 ? (
          <div className="selection-list">
            {fileNames.map((name) => (
              <div className="selection-item" key={name}>
                {name}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flow-actions">
          <Link className="button button-secondary" to="/start/topic">
            Back
          </Link>
          <button className="button button-primary" onClick={handleContinue} type="button">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
