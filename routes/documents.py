"""Extract document text for the existing summary/chat flow, without changing AI."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from starlette.concurrency import run_in_threadpool

router = APIRouter(tags=['documents'])
MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 100
MAX_CHARACTERS = 200_000


class DocumentError(ValueError):
    def __init__(self, code):
        self.code = code


MESSAGES = {
    'unsupported': ('Chỉ hỗ trợ tài liệu PDF và Word DOCX. Với file DOC, hãy lưu lại dưới dạng DOCX.', 'Documents must be PDF or Word DOCX. Save legacy DOC files as DOCX first.'),
    'too_large': ('Tài liệu tối đa 10 MB, 100 trang PDF và 200.000 ký tự.', 'Documents are limited to 10 MB, 100 PDF pages and 200,000 characters.'),
    'locked': ('PDF có mật khẩu. Hãy bỏ mật khẩu rồi tải lại.', 'This PDF is password protected. Remove the password and upload it again.'),
    'empty': ('Không đọc được văn bản. PDF scan/ảnh cần OCR trước khi tải lên.', 'No readable text was found. Scanned/image PDFs need OCR before upload.'),
    'invalid': ('Tệp bị lỗi hoặc không đúng định dạng PDF/DOCX.', 'The file is damaged or is not a valid PDF/DOCX document.'),
}


def extract_document(content, filename):
    if len(content) > MAX_BYTES:
        raise DocumentError('too_large')
    suffix = Path(filename).suffix.lower()
    sections = []
    total = 0

    def append(text, page=None):
        nonlocal total
        text = text.replace('\x00', '').strip()
        total += len(text)
        if total > MAX_CHARACTERS:
            raise DocumentError('too_large')
        # Keep every extracted character; split only for readable document rows.
        for start in range(0, len(text), 3000):
            sections.append({'text': text[start:start + 3000], 'page': page})

    try:
        if suffix == '.pdf':
            from pypdf import PdfReader
            if not content.lstrip().startswith(b'%PDF-'):
                raise DocumentError('invalid')
            reader = PdfReader(BytesIO(content))
            if reader.is_encrypted and not reader.decrypt(''):
                raise DocumentError('locked')
            if len(reader.pages) > MAX_PAGES:
                raise DocumentError('too_large')
            page_count = len(reader.pages)
            for number, page in enumerate(reader.pages, 1):
                stream = page.get_contents()
                if stream is not None and len(stream.get_data()) > 5 * 1024 * 1024:
                    raise DocumentError('too_large')
                append(page.extract_text() or '', number)
        elif suffix == '.docx':
            from docx import Document
            from docx.table import Table
            with ZipFile(BytesIO(content)) as archive:
                if 'word/document.xml' not in archive.namelist():
                    raise DocumentError('invalid')
                if sum(item.file_size for item in archive.infolist()) > 40 * 1024 * 1024:
                    raise DocumentError('too_large')
            document = Document(BytesIO(content))
            page_count = None  # DOCX pagination depends on fonts and layout engine.
            for block in document.iter_inner_content():
                if isinstance(block, Table):
                    for row in block.rows:
                        append(' | '.join(cell.text for cell in row.cells))
                else:
                    append(block.text)
        else:
            raise DocumentError('unsupported')
    except DocumentError:
        raise
    except Exception:
        raise DocumentError('invalid') from None
    if not sections:
        raise DocumentError('empty')
    return {'status': 'ok', 'kind': suffix[1:], 'sections': sections,
            'page_count': page_count, 'character_count': total}


@router.post('/api/documents/extract')
async def extract_endpoint(request: Request, file: UploadFile = File(...)):
    name = (file.filename or '').replace('\\', '/').rsplit('/', 1)[-1]
    vi = request.headers.get('accept-language', 'vi').lower().startswith('vi')
    try:
        # Never persist the original file or send documents to the speech server.
        content = await file.read(MAX_BYTES + 1)
        return await run_in_threadpool(extract_document, content, name)
    except DocumentError as err:
        status = 413 if err.code == 'too_large' else 415 if err.code == 'unsupported' else 422
        raise HTTPException(status, detail={'code': err.code, 'message': MESSAGES[err.code][0 if vi else 1]})
    finally:
        await file.close()
