import React from "react";

interface Props {
  title?: string;
  subtitle?: string;
}

export function Loading({ title = "Loading", subtitle }: Props) {
  return (
    <div className="flow-page">
      <div className="flow-card">
        <div className="flow-step">{title}</div>
        {subtitle ? <p className="flow-copy">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export default Loading;
