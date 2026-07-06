import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSlug, importBlogFile } from './blog-upload.js';

describe('createSlug', () => {
  it('lowercases latin text and replaces separators with hyphens', () => {
    expect(createSlug('Hello World')).toBe('hello-world');
  });

  it('trims leading and trailing separators', () => {
    expect(createSlug('  --Hello World--  ')).toBe('hello-world');
  });

  it('caps the result at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(createSlug(long)).toHaveLength(64);
  });

  it('collapses consecutive separators into one hyphen', () => {
    expect(createSlug('Hello!!!World')).toBe('hello-world');
  });

  it('returns an empty string for cjk-only titles', () => {
    expect(createSlug('你好世界')).toBe('');
  });

  it('handles mixed cjk and latin by keeping only latin digits', () => {
    expect(createSlug('React 入门指南')).toBe('react');
  });
});

describe('importBlogFile', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function makeMarkdownFile(name: string, content: string): File {
    return new File([content], name, { type: 'text/markdown' });
  }

  it('imports a markdown file and extracts the title from h1', async () => {
    const file = makeMarkdownFile('post.md', '# My First Post\n\nSome body text.');
    const imported = await importBlogFile(file);
    expect(imported.fileType).toBe('md');
    expect(imported.title).toBe('My First Post');
    expect(imported.slug).toBe('my-first-post');
    expect(imported.content).toContain('Some body text.');
  });

  it('falls back to the filename as title when no h1 exists', async () => {
    const file = makeMarkdownFile('hello-world.md', 'Just some content.');
    const imported = await importBlogFile(file);
    expect(imported.title).toBe('hello world');
    expect(imported.slug).toBe('hello-world');
  });

  it('strips null bytes and collapses excessive blank lines', async () => {
    const file = makeMarkdownFile('weird.md', '\x00hello\x00\n\n\n\nworld');
    const imported = await importBlogFile(file);
    expect(imported.content).toBe('hello\n\nworld');
  });

  it('rejects unsupported extensions', async () => {
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
    await expect(importBlogFile(file)).rejects.toThrow('仅支持上传 .md、.pdf 或 .docx 文件。');
  });

  it('rejects files larger than 8MB', async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    const file = new File([big], 'big.md', { type: 'text/markdown' });
    await expect(importBlogFile(file)).rejects.toThrow('文件不能超过 8MB。');
  });

  it('rejects files with almost no readable text', async () => {
    const file = makeMarkdownFile('empty.md', '   \n\n  ');
    await expect(importBlogFile(file)).rejects.toThrow('无法从该文件读取文字');
  });

  it('accepts uppercase and multi-dot file names', async () => {
    const file = new File(['# Title\n\nBody'], 'DRAFT.FINAL.md', { type: 'text/markdown' });
    const imported = await importBlogFile(file);
    expect(imported.fileType).toBe('md');
    expect(imported.title).toBe('Title');
  });

  it('does not treat a misleading .pdf.md extension as markdown', async () => {
    const file = new File(['# Title\n\nBody'], 'trick.pdf.md', { type: 'text/markdown' });
    const imported = await importBlogFile(file);
    expect(imported.fileType).toBe('md');
    expect(imported.title).toBe('Title');
  });

  it('imports a simple pdf literal text stream', async () => {
    const pdf = new TextEncoder().encode('1 0 obj\n<<>>\nstream\nBT\n(Hello PDF) Tj\nET\nendstream\n');
    const file = new File([pdf], 'sample.pdf', { type: 'application/pdf' });
    const imported = await importBlogFile(file);
    expect(imported.fileType).toBe('pdf');
    expect(imported.title).toBe('sample');
    expect(imported.content).toContain('Hello PDF');
  });

  it('imports a docx stored file (method 0) without decompression', async () => {
    const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:t>Hello DOCX</w:t></w:p></w:document>';
    const xmlBytes = new TextEncoder().encode(xml);
    const docx = buildStoredDocx([{ name: 'word/document.xml', data: xmlBytes }]);
    const file = new File([docx as BlobPart], 'report.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const imported = await importBlogFile(file);
    expect(imported.fileType).toBe('docx');
    expect(imported.content).toContain('Hello DOCX');
    expect(imported.title).toBe('report');
  });

  it('rejects a docx missing word/document.xml', async () => {
    const docx = buildStoredDocx([{ name: '[Content_Types].xml', data: new TextEncoder().encode('<Types/>') }]);
    const file = new File([docx as BlobPart], 'broken.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(importBlogFile(file)).rejects.toThrow('未在 docx 中找到正文内容。');
  });
});

type ZipEntry = { name: string; data: Uint8Array };

function buildStoredDocx(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, 0, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    chunks.push(header);
    chunks.push(entry.data);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
