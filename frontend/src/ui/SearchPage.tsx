import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, MessageCircle, StickyNote } from "lucide-react";

import { searchAll } from "../api";
import type { SearchMaterialResult, SearchNoteResult, SearchResponse, SearchSessionResult } from "../types";

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchAll(q);
        setResults(data);
        setSearchParams(q ? { q } : {}, { replace: true });
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, setSearchParams]);

  const totalResults = results
    ? results.sessions.length + results.notes.length + results.materials.length
    : 0;
  const hasResults = totalResults > 0;
  const searched = query.trim().length >= 2;

  return (
    <div className="page-shell">
      <div className="search-bar-wrap">
        <svg className="search-icon" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          autoComplete="off"
          className="search-input"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions, notes, and materials…"
          type="search"
          value={query}
        />
        {loading && <span className="search-spinner" />}
      </div>

      {!searched && (
        <div className="search-empty">
          <p className="muted">Type at least 2 characters to search.</p>
        </div>
      )}

      {searched && !loading && results && !hasResults && (
        <div className="search-empty">
          <p className="muted">No results for <strong>"{query.trim()}"</strong>.</p>
        </div>
      )}

      {results && hasResults && (
        <div className="search-results">
          {results.sessions.length > 0 && (
            <SearchSection title="Sessions" count={results.sessions.length}>
              {results.sessions.map((r) => (
                <SessionResultRow key={r.message_id} result={r} query={query.trim()} />
              ))}
            </SearchSection>
          )}

          {results.notes.length > 0 && (
            <SearchSection title="Notes" count={results.notes.length}>
              {results.notes.map((r) => (
                <NoteResultRow key={r.id} result={r} query={query.trim()} />
              ))}
            </SearchSection>
          )}

          {results.materials.length > 0 && (
            <SearchSection title="Materials" count={results.materials.length}>
              {results.materials.map((r) => (
                <MaterialResultRow key={r.material_id} result={r} query={query.trim()} />
              ))}
            </SearchSection>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="search-section">
      <div className="search-section-header">
        <span className="search-section-title">{title}</span>
        <span className="search-section-count">{count}</span>
      </div>
      <div className="search-section-rows">{children}</div>
    </div>
  );
}

function SessionResultRow({ result, query }: { result: SearchSessionResult; query: string }) {
  return (
    <Link className="search-result-row" to={`/sessions/${result.conversation_id}`}>
      <div className="search-result-icon"><MessageCircle size={18} strokeWidth={1.6} /></div>
      <div className="search-result-body">
        <div className="search-result-title">
          {result.subject ?? "General"}
          <span className="search-result-meta">{formatDate(result.created_at)}</span>
        </div>
        <div className="search-result-snippet">{highlight(result.snippet, query)}</div>
      </div>
    </Link>
  );
}

function NoteResultRow({ result, query }: { result: SearchNoteResult; query: string }) {
  return (
    <div className="search-result-row search-result-row-static">
      <div className="search-result-icon"><StickyNote size={18} strokeWidth={1.6} /></div>
      <div className="search-result-body">
        <div className="search-result-title">
          {highlight(result.concept, query)}
          {result.subject && <span className="search-result-meta">{result.subject}</span>}
        </div>
        <div className="search-result-snippet">{highlight(result.snippet, query)}</div>
      </div>
    </div>
  );
}

function MaterialResultRow({ result, query }: { result: SearchMaterialResult; query: string }) {
  return (
    <div className="search-result-row search-result-row-static">
      <div className="search-result-icon"><FileText size={18} strokeWidth={1.6} /></div>
      <div className="search-result-body">
        <div className="search-result-title">
          {result.filename}
          {result.page_number != null && (
            <span className="search-result-meta">p. {result.page_number}</span>
          )}
        </div>
        <div className="search-result-snippet">{highlight(result.snippet, query)}</div>
      </div>
    </div>
  );
}
