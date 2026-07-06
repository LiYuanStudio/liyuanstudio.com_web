const MAX_IMPORT_SIZE = 8 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['md', 'pdf', 'docx']);

export type ImportedBlogFile = {
  fileName: string;
  fileType: 'md' | 'pdf' | 'docx';
  title: string;
  slug: string;
  content: string;
};

function getExtension(fileName: string): ImportedBlogFile['fileType'] | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) return null;
  return extension as ImportedBlogFile['fileType'];
}

export function createSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function inferTitle(fileName: string, content: string): string {
  const markdownTitle = content.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (markdownTitle) return markdownTitle.slice(0, 80);
  return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 80);
}

function compactText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function bytesToLatin1(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return chunks.join('');
}

function decodePdfLiteral(value: string): string {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, escaped: string) => {
    if (escaped === 'n') return '\n';
    if (escaped === 'r') return '\r';
    if (escaped === 't') return '\t';
    if (escaped === 'b') return '\b';
    if (escaped === 'f') return '\f';
    if (/^[0-7]+$/.test(escaped)) return String.fromCharCode(Number.parseInt(escaped, 8));
    return escaped;
  });
}

function decodeHexPdfText(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length - 1; i += 2) {
    bytes.push(Number.parseInt(clean.slice(i, i + 2), 16));
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function extractPdfText(bytes: Uint8Array): string {
  const source = bytesToLatin1(bytes);
  const parts: string[] = [];
  const literalPattern = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  const arrayPattern = /\[(.*?)\]\s*TJ/gs;
  const hexPattern = /<([0-9a-fA-F\s]+)>\s*Tj/g;

  for (const match of source.matchAll(literalPattern)) {
    parts.push(decodePdfLiteral(match[0].slice(1, match[0].lastIndexOf(')'))));
  }

  for (const match of source.matchAll(arrayPattern)) {
    const literals = [...match[1].matchAll(/\((?:\\.|[^\\()])*\)/g)]
      .map((item) => decodePdfLiteral(item[0].slice(1, -1)));
    if (literals.length) parts.push(literals.join(''));
  }

  for (const match of source.matchAll(hexPattern)) {
    parts.push(decodeHexPdfText(match[1]));
  }

  return compactText(parts.join('\n'));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const DecompressionStreamCtor = globalThis.DecompressionStream as
    | (new (format: string) => DecompressionStream)
    | undefined;
  if (!DecompressionStreamCtor) {
    throw new Error('当前浏览器暂不支持读取压缩 docx，请复制正文到编辑器后发布。');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStreamCtor('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function findZipEntry(bytes: Uint8Array, entryName: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (name === entryName) {
      const data = bytes.subarray(dataStart, dataEnd);
      if (method === 0) return data;
      if (method === 8) return await inflateRaw(data);
      throw new Error('暂不支持该 docx 压缩格式，请复制正文到编辑器后发布。');
    }
    offset = dataEnd || dataStart + uncompressedSize;
  }

  return null;
}

function extractDocxXmlText(xml: string): string {
  const parts: string[] = [];
  const tokenPattern = /<w:t\b[^>]*>(.*?)<\/w:t>|<\/w:p>/gs;
  for (const match of xml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) {
      parts.push(decodeXmlEntities(match[1]));
    } else {
      parts.push('\n');
    }
  }
  return compactText(parts.join(''));
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const documentXml = await findZipEntry(bytes, 'word/document.xml');
  if (!documentXml) {
    throw new Error('未在 docx 中找到正文内容。');
  }
  return extractDocxXmlText(new TextDecoder().decode(documentXml));
}

export async function importBlogFile(file: File): Promise<ImportedBlogFile> {
  const fileType = getExtension(file.name);
  if (!fileType) {
    throw new Error('仅支持上传 .md、.pdf 或 .docx 文件。');
  }
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error('文件不能超过 8MB。');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let content = '';
  if (fileType === 'md') {
    content = compactText(new TextDecoder().decode(bytes));
  } else if (fileType === 'pdf') {
    content = extractPdfText(bytes);
  } else {
    content = await extractDocxText(bytes);
  }

  if (content.length < 2) {
    throw new Error('无法从该文件读取文字，请复制正文到编辑器后再发布。');
  }

  const title = inferTitle(file.name, content);
  return {
    fileName: file.name,
    fileType,
    title,
    slug: createSlug(title || file.name.replace(/\.[^.]+$/, '')),
    content,
  };
}
