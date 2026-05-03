import React, { ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useReadingPrefs } from "../ReadingPrefsContext";

function bionicify(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\s+)/).map((token, i) => {
    if (!token || /^\s+$/.test(token)) return token;
    const cut = Math.max(1, Math.ceil(token.length / 2));
    return (
      <span key={`${keyPrefix}-${i}`}>
        <b style={{ fontWeight: 700 }}>{token.slice(0, cut)}</b>
        {token.slice(cut)}
      </span>
    );
  });
}

function bionicChildren(children: ReactNode, keyPrefix: string): ReactNode {
  if (typeof children === "string") return bionicify(children, keyPrefix);
  if (Array.isArray(children)) {
    return (children as ReactNode[]).map((child, i) =>
      bionicChildren(child, `${keyPrefix}-${i}`)
    );
  }
  if (React.isValidElement(children)) {
    const el = children as React.ReactElement<{ children?: ReactNode }>;
    if (el.type === "code" || el.type === "pre") return children;
    const nested = el.props.children;
    if (nested == null) return children;
    return React.cloneElement(el, {}, bionicChildren(nested, `${keyPrefix}-c`));
  }
  return children;
}

function makeBionicWrapper(tag: string) {
  return function BionicElement({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) {
    const Tag = tag as keyof React.JSX.IntrinsicElements;
    return <Tag {...(rest as object)}>{bionicChildren(children, tag)}</Tag>;
  };
}

export function MarkdownText({ children, className }: { children: string; className?: string }) {
  const { bionic } = useReadingPrefs();

  const components = useMemo<Components>(() => {
    const base: Components = {
      // Open links externally; keep them safe
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
      ),
      pre: ({ children }) => <pre className="md-code-block">{children}</pre>,
      code: ({ children, className: cls }) => {
        if (cls?.startsWith("language-")) {
          return <code className={`md-code-block-inner ${cls}`}>{children}</code>;
        }
        return <code className="msg-inline-code">{children}</code>;
      },
    };

    if (bionic) {
      const textTags = ["p", "li", "h1", "h2", "h3", "h4", "blockquote", "td", "th"] as const;
      for (const tag of textTags) {
        (base as Record<string, unknown>)[tag] = makeBionicWrapper(tag);
      }
    }

    return base;
  }, [bionic]);

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
