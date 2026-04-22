from app.services.retriever import RetrievedChunk


def test_retrieved_chunk_snippet_truncates_long_content() -> None:
    chunk = RetrievedChunk(
        chunk_id=1,
        material_id=1,
        material_filename="lecture.txt",
        subject="Math",
        content="A" * 260,
        page_number=None,
        similarity_score=0.9,
    )

    assert chunk.snippet.endswith("...")
    assert len(chunk.snippet) == 220
