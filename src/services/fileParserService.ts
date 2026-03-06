/**
 * fileParserService.ts
 * 지원 포맷: TXT, SRT, MD, PDF, CSV, Excel(xlsx/xls), RTF
 */

/** 지원하는 파일 확장자 목록 */
export const SUPPORTED_EXTENSIONS = '.txt,.srt,.md,.pdf,.csv,.xlsx,.xls,.rtf';
export const SUPPORTED_FORMATS_LABEL = 'TXT, SRT, MD, PDF, CSV, Excel, RTF';

/**
 * 파일을 읽어서 텍스트로 변환한다.
 * 확장자에 따라 적절한 파서를 자동 선택.
 */
export async function parseFileToText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'txt':
    case 'srt':
    case 'md':
      return readAsText(file);
    case 'pdf':
      return parsePdf(file);
    case 'csv':
      return parseCsv(file);
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'rtf':
      return parseRtf(file);
    default:
      // 알 수 없는 확장자는 텍스트로 시도
      return readAsText(file);
  }
}

/** 기본 텍스트 읽기 */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string || '');
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file);
  });
}

/** PDF → 텍스트 (pdfjs-dist) */
async function parsePdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Worker 설정 (Vite 환경)
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

/** CSV → 텍스트 (papaparse) */
async function parseCsv(file: File): Promise<string> {
  const Papa = await import('papaparse');
  const text = await readAsText(file);

  return new Promise((resolve) => {
    Papa.default.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          resolve(text); // 파싱 실패시 원본 반환
          return;
        }
        // 각 행의 값들을 탭으로, 행 사이를 줄바꿈으로 연결
        const rows = results.data as Record<string, string>[];
        const lines = rows.map((row) => Object.values(row).join('\t'));
        // 헤더도 포함
        const headers = Object.keys(rows[0] || {}).join('\t');
        resolve(headers + '\n' + lines.join('\n'));
      },
      error: () => resolve(text),
    });
  });
}

/** Excel (xlsx/xls) → 텍스트 (SheetJS) */
async function parseExcel(file: File): Promise<string> {
  const XLSX = await import('xlsx');

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const sheets: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      if (workbook.SheetNames.length > 1) {
        sheets.push(`[${sheetName}]\n${csv}`);
      } else {
        sheets.push(csv);
      }
    }
  }

  return sheets.join('\n\n');
}

/** RTF → 텍스트 (RTF 태그 스트리핑) */
async function parseRtf(file: File): Promise<string> {
  const raw = await readAsText(file);

  // RTF 형식이 아닌 경우 원본 반환
  if (!raw.startsWith('{\\rtf')) return raw;

  let text = raw;

  // RTF 그룹에서 텍스트 추출
  // 1. \' 뒤의 hex 문자 처리 (한국어 등)
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // 2. \u 유니코드 이스케이프 처리
  text = text.replace(/\\u(\d+)\??/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10))
  );

  // 3. 줄바꿈 RTF 명령어 → 실제 줄바꿈
  text = text.replace(/\\par\b/g, '\n');
  text = text.replace(/\\line\b/g, '\n');
  text = text.replace(/\\tab\b/g, '\t');

  // 4. 모든 RTF 제어 그룹 제거 ({\...} 형태)
  text = text.replace(/\{\\[^{}]*\}/g, '');

  // 5. 남은 RTF 제어 시퀀스 제거
  text = text.replace(/\\[a-z]+\d*\s?/gi, '');

  // 6. 중괄호 제거
  text = text.replace(/[{}]/g, '');

  // 7. 연속 공백/빈줄 정리
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');

  return text.trim();
}
