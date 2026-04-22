from pathlib import Path

import pytest

from app.services.material_service import (
    ExtractedBlock,
    chunk_blocks,
    extract_material_blocks,
    validate_material_filename,
)


def test_validate_material_filename_rejects_unsupported_types() -> None:
    with pytest.raises(ValueError):
        validate_material_filename("slides.docx")


@pytest.mark.asyncio
async def test_extract_material_blocks_reads_text_file(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    path.write_text("Cell respiration\n\nproduces ATP.", encoding="utf-8")

    blocks = await extract_material_blocks(path)

    assert len(blocks) == 1
    assert blocks[0].text == "Cell respiration produces ATP."
    assert blocks[0].page_number is None


def test_chunk_blocks_preserve_order_and_overlap() -> None:
    blocks = [ExtractedBlock(text="abcdefghij", page_number=1)]

    chunks = chunk_blocks(blocks, chunk_size=4, chunk_overlap=1)

    assert [chunk.content for chunk in chunks] == ["abcd", "defg", "ghij"]
    assert [chunk.char_start for chunk in chunks] == [0, 3, 6]
    assert [chunk.page_number for chunk in chunks] == [1, 1, 1]
