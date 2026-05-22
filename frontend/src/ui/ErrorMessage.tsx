import React from "react";

interface Props {
  message: string | null | undefined;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: Props) {
  if (!message) return null;
  return (
    <div className="flow-error" role="alert">
      <div>{message}</div>
      {onRetry ? (
        <button className="mt-2" onClick={onRetry} type="button">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export default ErrorMessage;
