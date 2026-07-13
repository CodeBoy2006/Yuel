import { PdfErrorCode } from '@embedpdf/models';

import { isPdfSourceError } from '../source';
import type { PdfSourceProgress } from '../source';

export function formatPdfBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / (1024 ** unitIndex);
  const fractionDigits = unitIndex === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function formatPdfSourceProgress(progress: PdfSourceProgress): string {
  const stageLabel = {
    reading: '正在读取',
    validating: '正在校验',
    hashing: '正在生成文档标识',
    ready: '准备打开',
  }[progress.stage];

  if (!progress.totalBytes || progress.totalBytes <= 0) {
    return `${stageLabel} · ${formatPdfBytes(progress.loadedBytes)}`;
  }

  const percentage = Math.min(
    100,
    Math.max(0, Math.round((progress.loadedBytes / progress.totalBytes) * 100)),
  );
  return `${stageLabel} · ${percentage}%`;
}

export function formatPdfOpenError(error: unknown): string {
  if (isPdfSourceError(error)) {
    switch (error.code) {
      case 'too-large': {
        const actualBytes = Number(error.details.actualBytes);
        const maxBytes = Number(error.details.maxBytes);
        const actual = Number.isFinite(actualBytes) ? formatPdfBytes(actualBytes) : '该文件';
        const maximum = Number.isFinite(maxBytes) ? formatPdfBytes(maxBytes) : '当前上限';
        return `文件过大：${actual}，当前完整加载上限为 ${maximum}。`;
      }
      case 'http-error':
        return `远程服务器返回 HTTP ${error.details.status ?? '错误'}，无法打开该 PDF。`;
      case 'invalid-pdf':
        return '文件未通过 PDF 格式校验，请确认链接或文件内容正确。';
      case 'invalid-url':
        return '请输入完整的 HTTP 或 HTTPS PDF 地址。';
      case 'unsupported-protocol':
        return '远程 PDF 地址仅支持 HTTP 或 HTTPS。';
      case 'network-error':
        return '下载失败。请确认链接可直接访问，且服务器允许扩展读取该文件。';
      case 'read-error':
        return '无法读取所选文件，请重新选择或检查文件权限。';
      case 'released':
        return 'PDF 数据已被释放，请重新打开文件。';
      case 'aborted':
        return '已取消 PDF 加载。';
    }
  }

  const reason = getTaskReason(error);
  if (reason?.message) return reason.message;
  if (error instanceof Error && error.message) return error.message;
  return '无法打开 PDF，请重试或选择其他文件。';
}

export function isPasswordPdfError(error: unknown): boolean {
  return getTaskReason(error)?.code === PdfErrorCode.Password;
}

function getTaskReason(error: unknown): { code?: number; message?: string } | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const reason = 'reason' in error ? error.reason : error;
  if (!reason || typeof reason !== 'object') return undefined;

  return {
    ...('code' in reason && typeof reason.code === 'number' ? { code: reason.code } : {}),
    ...('message' in reason && typeof reason.message === 'string'
      ? { message: reason.message }
      : {}),
  };
}
