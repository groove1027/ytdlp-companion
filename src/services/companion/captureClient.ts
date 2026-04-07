import type { CompanionCaptureFormat, CompanionCaptureResult, CompanionCaptureTarget } from '../../types';
import { monitoredFetch } from '../apiService';

const COMPANION_URL = 'http://127.0.0.1:9876';

interface CaptureScreenApiBase {
  ok?: boolean;
  format?: CompanionCaptureFormat;
  size_bytes?: number;
  error?: string;
  detail?: string;
}

interface CaptureScreenBase64ApiResponse extends CaptureScreenApiBase {
  ok: true;
  format: 'base64';
  data?: string;
  mime?: string;
}

interface CaptureScreenTunnelApiResponse extends CaptureScreenApiBase {
  ok: true;
  format: 'tunnel';
  url?: string;
  token?: string;
}

type CaptureScreenApiResponse =
  | CaptureScreenApiBase
  | CaptureScreenBase64ApiResponse
  | CaptureScreenTunnelApiResponse;

export async function captureScreen(opts: {
  target: CompanionCaptureTarget;
  format: CompanionCaptureFormat;
}): Promise<CompanionCaptureResult> {
  const res = await monitoredFetch(
    `${COMPANION_URL}/api/capture/screen`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    },
    15_000,
  );

  const body = (await res.json().catch(() => null)) as CaptureScreenApiResponse | null;
  if (!res.ok) {
    throw new Error(body?.error || body?.detail || res.statusText || '화면 캡처 실패');
  }
  if (!body?.ok || !body.format || !Number.isFinite(body.size_bytes)) {
    throw new Error(body?.error || '화면 캡처 응답이 올바르지 않습니다.');
  }
  if (body.format !== opts.format) {
    throw new Error(`화면 캡처 응답 포맷 불일치: ${opts.format} 요청, ${body.format} 응답`);
  }
  if (body.format === 'base64') {
    const base64Body = body as CaptureScreenBase64ApiResponse;
    if (!base64Body.data || !base64Body.mime || !base64Body.mime.startsWith('image/')) {
      throw new Error('화면 캡처 base64 응답이 비어 있습니다.');
    }
    return { format: 'base64', data: base64Body.data, mime: base64Body.mime, sizeBytes: base64Body.size_bytes };
  }
  const tunnelBody = body as CaptureScreenTunnelApiResponse;
  if (!tunnelBody.url || !tunnelBody.token) {
    throw new Error('화면 캡처 tunnel 응답이 비어 있습니다.');
  }
  return { format: 'tunnel', url: tunnelBody.url, token: tunnelBody.token, sizeBytes: tunnelBody.size_bytes };
}
