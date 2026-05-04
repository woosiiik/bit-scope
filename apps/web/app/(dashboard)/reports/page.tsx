/**
 * 리포트 및 데이터 내보내기 페이지
 *
 * 포트폴리오 리포트 생성, 리포트 이력 조회, 데이터 내보내기(CSV, JSON, PDF),
 * 정기 리포트 스케줄 관리, 사용자 설정 백업/복원 기능을 제공한다.
 *
 * 주요 기능:
 * - 리포트 생성 요청 (일간/주간/월간/사용자 지정)
 * - 리포트 이력 목록 및 상세 보기
 * - PDF/이미지 다운로드
 * - 정기 리포트 설정 폼 (일간/주간/월간)
 * - 데이터 내보내기 UI (CSV, JSON, PDF)
 * - 거래 내역 내보내기 (CSV)
 * - 설정 백업/복원 (API 키 제외, JSON 형식)
 *
 * @see 요구사항 7.1 (리포트 생성 요청)
 * @see 요구사항 7.2 (PDF 또는 이미지 다운로드)
 * @see 요구사항 7.3 (정기 리포트 설정)
 * @see 요구사항 7.5 (리포트 이력 조회)
 * @see 요구사항 7.6 (CSV, JSON 데이터 내보내기)
 * @see 요구사항 7.7 (거래 내역 CSV 내보내기)
 * @see 요구사항 7.8 (설정 백업)
 * @see 요구사항 7.9 (설정 복원)
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Upload,
  Calendar,
  Plus,
  Trash2,
  Clock,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Save,
  UploadCloud,
  AlertCircle,
  Check,
  FileDown,
  Settings,
  RefreshCw,
} from 'lucide-react';
import type { ReportType, ExportFormat } from '@bitscope/shared';
import { formatCompactKRW } from '@bitscope/shared';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/i18n-context';
import { useWalletAuth } from '@/hooks/useWalletAuth';
import { useSettingsStore } from '@/store/settings-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableRowSkeleton } from '@/components/ui/skeleton';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  FormattedCurrency,
  FormattedPercent,
} from '@/components/ui/formatted-number';

// ===== 상수 =====

/**
 * NestJS 백엔드 API 기본 URL
 */
const NESTJS_API_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`)
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

/** 탭 정의 */
type TabId = 'reports' | 'export' | 'schedule' | 'backup';

/** 리포트 유형 옵션 */
const REPORT_TYPE_OPTIONS: { value: ReportType; labelKey: 'daily' | 'weekly' | 'monthly' }[] = [
  { value: 'daily', labelKey: 'daily' },
  { value: 'weekly', labelKey: 'weekly' },
  { value: 'monthly', labelKey: 'monthly' },
];

/** 내보내기 포맷 옵션 */
const EXPORT_FORMAT_OPTIONS: { value: ExportFormat; labelKey: 'exportCsv' | 'exportJson' | 'exportPdf' }[] = [
  { value: 'csv', labelKey: 'exportCsv' },
  { value: 'json', labelKey: 'exportJson' },
  { value: 'pdf', labelKey: 'exportPdf' },
];

// ===== API 응답 타입 =====

/** 리포트 응답 타입 */
interface ReportResponse {
  id: string;
  walletAddress: string;
  type: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalEvaluation?: number;
    evaluationChange?: number;
    evaluationChangeRate?: number;
    topGainers?: { symbol: string; rate: number }[];
    topLosers?: { symbol: string; rate: number }[];
    newCoins?: string[];
    removedCoins?: string[];
  };
  data: {
    walletAddress?: string;
    timestamp?: string;
    totalEvaluation?: number;
    totalInvestment?: number;
    totalProfitLoss?: number;
    profitLossRate?: number;
    holdings?: {
      symbol: string;
      exchange: string;
      balance: number;
      avgBuyPrice: number;
      currentPrice: number;
      evaluation: number;
    }[];
  };
}

/** 리포트 스케줄 응답 타입 */
interface ScheduleResponse {
  id: string;
  walletAddress: string;
  type: string;
  isActive: boolean;
  nextRunAt: string;
  cronExpression: string;
  createdAt: string;
  updatedAt: string;
}

// ===== API 호출 함수 =====

/**
 * 리포트를 생성한다.
 */
async function createReport(
  walletAddress: string,
  type: ReportType,
): Promise<ReportResponse> {
  const response = await fetch(`${NESTJS_API_BASE_URL}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, type }),
  });

  if (!response.ok) {
    throw new Error(`리포트 생성 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * 리포트 이력을 조회한다.
 */
async function fetchReportHistory(
  walletAddress: string,
  type?: ReportType,
  limit: number = 20,
): Promise<ReportResponse[]> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  params.set('limit', String(limit));

  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/${walletAddress}?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`리포트 이력 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * 리포트 스케줄 목록을 조회한다.
 */
async function fetchSchedules(
  walletAddress: string,
): Promise<ScheduleResponse[]> {
  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/schedules/${walletAddress}`,
  );

  if (!response.ok) {
    throw new Error(`스케줄 조회 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * 정기 리포트 스케줄을 생성한다.
 */
async function createSchedule(
  walletAddress: string,
  type: ReportType,
): Promise<ScheduleResponse> {
  const response = await fetch(`${NESTJS_API_BASE_URL}/reports/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, type, isActive: true }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    const errMsg = errData?.message || `HTTP ${response.status}`;
    throw new Error(`스케줄 생성 실패: ${errMsg}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * 정기 리포트 스케줄을 삭제한다.
 */
async function deleteSchedule(scheduleId: string): Promise<void> {
  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/schedules/${scheduleId}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    throw new Error(`스케줄 삭제 실패: HTTP ${response.status}`);
  }
}

/**
 * 정기 리포트 스케줄 활성/비활성을 전환한다.
 */
async function toggleScheduleActive(
  scheduleId: string,
  isActive: boolean,
): Promise<ScheduleResponse> {
  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/schedules/${scheduleId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    },
  );

  if (!response.ok) {
    throw new Error(`스케줄 토글 실패: HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.data ?? json;
}

/**
 * 데이터를 내보낸다. 브라우저 다운로드를 트리거한다.
 */
async function exportData(
  walletAddress: string,
  format: ExportFormat,
  start?: string,
  end?: string,
): Promise<void> {
  const params = new URLSearchParams({ format });
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/${walletAddress}/export?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`데이터 내보내기 실패: HTTP ${response.status}`);
  }

  // 파일 다운로드 처리
  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? `bitscope-export.${format}`;

  triggerDownload(blob, filename);
}

/**
 * 거래 내역을 CSV로 내보낸다.
 */
async function exportTransactions(
  walletAddress: string,
  start?: string,
  end?: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  const response = await fetch(
    `${NESTJS_API_BASE_URL}/reports/${walletAddress}/export/transactions?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`거래 내역 내보내기 실패: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('Content-Disposition');
  const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? 'bitscope-transactions.csv';

  triggerDownload(blob, filename);
}

/**
 * Blob 데이터를 파일로 다운로드한다.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== 메인 페이지 =====

export default function ReportsPage() {
  const { t } = useTranslation();
  const { wallet } = useWalletAuth();

  // 활성 탭
  const [activeTab, setActiveTab] = useState<TabId>('reports');

  // 지갑 미연결 시 안내
  if (!wallet.isConnected || !wallet.address) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[60vh]">
        <FileText className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          {t.wallet.authRequired.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t.wallet.authRequired.description}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 헤더 */}
      <ReportsPageHeader />

      {/* 탭 네비게이션 */}
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 탭 콘텐츠 */}
      {activeTab === 'reports' && (
        <ReportsTab walletAddress={wallet.address} />
      )}
      {activeTab === 'export' && (
        <ExportTab walletAddress={wallet.address} />
      )}
      {activeTab === 'schedule' && (
        <ScheduleTab walletAddress={wallet.address} />
      )}
      {activeTab === 'backup' && (
        <BackupTab />
      )}
    </div>
  );
}

// ===== 서브 컴포넌트 =====

// ----- 페이지 헤더 -----

/**
 * 리포트 페이지 상단 헤더
 */
function ReportsPageHeader() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">
        {t.report.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t.report.description}
      </p>
    </div>
  );
}

// ----- 탭 네비게이션 -----

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/**
 * 탭 네비게이션 컴포넌트
 */
function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const { t } = useTranslation();

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'reports', label: t.report.tabs.reports, icon: FileText },
    { id: 'export', label: t.report.tabs.export, icon: Download },
    { id: 'schedule', label: t.report.tabs.schedule, icon: Calendar },
    { id: 'backup', label: t.report.tabs.backup, icon: Settings },
  ];

  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto" role="tablist" aria-label={t.report.title}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== 리포트 탭 =====

interface ReportsTabProps {
  walletAddress: string;
}

/**
 * 리포트 탭
 *
 * 리포트 생성 요청 및 이력 목록을 표시한다.
 *
 * @see 요구사항 7.1 (리포트 생성 요청)
 * @see 요구사항 7.5 (리포트 이력 조회)
 */
function ReportsTab({ walletAddress }: ReportsTabProps) {
  const { t } = useTranslation();

  // 상태
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateType, setGenerateType] = useState<ReportType>('daily');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // 리포트 이력 로드
  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchReportHistory(walletAddress);
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.generateFailed);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, t.report.generateFailed]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // 리포트 생성
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await createReport(walletAddress, generateType);
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.generateFailed);
    } finally {
      setIsGenerating(false);
    }
  }, [walletAddress, generateType, loadReports, t.report.generateFailed]);

  // 리포트 상세 토글
  const toggleDetail = useCallback((reportId: string) => {
    setExpandedReportId((prev) => (prev === reportId ? null : reportId));
  }, []);

  return (
    <div className="space-y-4">
      {/* 리포트 생성 카드 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {t.report.generateReport}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="report-type">{t.report.selectType}</Label>
              <select
                id="report-type"
                value={generateType}
                onChange={(e) => setGenerateType(e.target.value as ReportType)}
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
                aria-label={t.report.selectType}
              >
                {REPORT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t.report[opt.labelKey]}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              size="sm"
            >
              {isGenerating ? (
                <>
                  <LoadingSpinner size="sm" className="mr-1" />
                  {t.report.generating}
                </>
              ) : (
                <>
                  <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t.report.generate}
                </>
              )}
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 리포트 이력 */}
      {isLoading && reports.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={4} rows={5} />
          </CardContent>
        </Card>
      ) : !isLoading && reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">{t.report.noReports}</p>
            <p className="text-xs text-muted-foreground">{t.report.noReportsDescription}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">
                {t.report.reportHistory}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadReports} disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {reports.map((report) => (
                <ReportItem
                  key={report.id}
                  report={report}
                  isExpanded={expandedReportId === report.id}
                  onToggle={() => toggleDetail(report.id)}
                  walletAddress={walletAddress}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----- 리포트 아이템 -----

interface ReportItemProps {
  report: ReportResponse;
  isExpanded: boolean;
  onToggle: () => void;
  walletAddress: string;
}

/**
 * 리포트 이력의 개별 아이템
 *
 * 요약 정보와 상세 데이터를 접기/펼치기 형태로 표시한다.
 * 이전 리포트 대비 변동 사항(신규 편입/편출 코인)을 하이라이트한다.
 *
 * @see 요구사항 7.4 (이전 대비 변동 사항 하이라이트)
 * @see 요구사항 7.5 (리포트 이력 목록)
 */
function ReportItem({ report, isExpanded, onToggle, walletAddress }: ReportItemProps) {
  const { t } = useTranslation();

  const generatedDate = new Date(report.generatedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const periodStart = new Date(report.periodStart).toLocaleDateString('ko-KR');
  const periodEnd = new Date(report.periodEnd).toLocaleDateString('ko-KR');

  const typeLabel = getReportTypeLabel(report.type as ReportType, t);
  const summary = report.summary;

  // PDF 다운로드 핸들러
  const handleDownloadPdf = useCallback(async () => {
    try {
      await exportData(walletAddress, 'pdf');
    } catch {
      // 에러는 조용히 처리 (사용자에게 토스트 메시지를 표시하는 것이 좋지만 현재 구현에서는 무시)
    }
  }, [walletAddress]);

  return (
    <div className="px-4">
      {/* 요약 행 */}
      <button
        type="button"
        className="flex w-full items-center justify-between py-3 text-left transition-colors hover:bg-muted/30 -mx-4 px-4"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${typeLabel} ${t.report.reportDetail}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant="outline" className="text-xs shrink-0">
            {typeLabel}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {periodStart} ~ {periodEnd}
            </p>
            <p className="text-xs text-muted-foreground">
              {generatedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {summary.totalEvaluation != null && (
            <span className="hidden sm:block text-sm font-medium text-foreground">
              {formatCompactKRW(summary.totalEvaluation)}
            </span>
          )}
          {summary.evaluationChangeRate != null && summary.evaluationChangeRate !== 0 && (
            <FormattedPercent
              value={summary.evaluationChangeRate}
              colorize
              className="hidden sm:block text-xs"
            />
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </button>

      {/* 상세 내용 (확장 시) */}
      {isExpanded && (
        <div className="pb-4 space-y-4">
          {/* 요약 정보 그리드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.totalEvaluation != null && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t.report.totalEvaluation}</p>
                <FormattedCurrency value={summary.totalEvaluation} className="text-sm font-medium" />
              </div>
            )}
            {summary.evaluationChange != null && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t.report.evaluationChange}</p>
                <FormattedCurrency value={summary.evaluationChange} colorize showSign className="text-sm font-medium" />
              </div>
            )}
            {summary.evaluationChangeRate != null && (
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t.report.evaluationChangeRate}</p>
                <FormattedPercent value={summary.evaluationChangeRate} colorize className="text-sm font-medium" />
              </div>
            )}
          </div>

          {/* 상승/하락 코인 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {summary.topGainers && summary.topGainers.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-profit" aria-hidden="true" />
                  <span className="text-xs font-medium text-muted-foreground">{t.report.topGainers}</span>
                </div>
                <div className="space-y-1">
                  {summary.topGainers.map((coin) => (
                    <div key={coin.symbol} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{coin.symbol}</span>
                      <FormattedPercent value={coin.rate} colorize className="text-xs" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {summary.topLosers && summary.topLosers.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingDown className="h-3.5 w-3.5 text-loss" aria-hidden="true" />
                  <span className="text-xs font-medium text-muted-foreground">{t.report.topLosers}</span>
                </div>
                <div className="space-y-1">
                  {summary.topLosers.map((coin) => (
                    <div key={coin.symbol} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{coin.symbol}</span>
                      <FormattedPercent value={coin.rate} colorize className="text-xs" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 신규 편입/편출 코인 */}
          <div className="flex flex-wrap gap-2">
            {summary.newCoins && summary.newCoins.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t.report.newCoins}:</span>
                {summary.newCoins.map((coin) => (
                  <Badge key={coin} variant="default" className="text-[10px] bg-profit/20 text-profit">
                    +{coin}
                  </Badge>
                ))}
              </div>
            )}
            {summary.removedCoins && summary.removedCoins.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{t.report.removedCoins}:</span>
                {summary.removedCoins.map((coin) => (
                  <Badge key={coin} variant="secondary" className="text-[10px] text-loss">
                    -{coin}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* 보유 자산 상세 */}
          {report.data.holdings && report.data.holdings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t.report.holdings}</p>
              <div className="overflow-x-auto">
                <table className="w-full" role="table" aria-label={t.report.holdings}>
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.coinName}
                      </th>
                      <th className="px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.alert.selectExchange}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.quantity}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.currentPrice}
                      </th>
                      <th className="px-2 py-1.5 text-right text-[11px] font-medium text-muted-foreground" scope="col">
                        {t.portfolio.evaluationAmount}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.holdings.map((holding, index) => (
                      <tr key={`${holding.symbol}-${holding.exchange}-${index}`} className="border-b border-border last:border-b-0">
                        <td className="px-2 py-1.5 text-sm font-medium text-foreground">{holding.symbol}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{holding.exchange}</td>
                        <td className="px-2 py-1.5 text-right text-xs text-foreground">
                          {Number(holding.balance).toFixed(8).replace(/\.?0+$/, '')}
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs">
                          <FormattedCurrency value={Number(holding.currentPrice)} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-xs">
                          <FormattedCurrency value={Number(holding.evaluation)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PDF 다운로드 버튼 */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <FileDown className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t.report.downloadPdf}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 데이터 내보내기 탭 =====

interface ExportTabProps {
  walletAddress: string;
}

/**
 * 데이터 내보내기 탭
 *
 * 포트폴리오 스냅샷 데이터를 CSV, JSON, PDF 포맷으로 내보내고,
 * 거래 내역을 CSV로 내보내는 기능을 제공한다.
 *
 * @see 요구사항 7.6 (CSV, JSON 데이터 내보내기)
 * @see 요구사항 7.7 (거래 내역 CSV 내보내기)
 */
function ExportTab({ walletAddress }: ExportTabProps) {
  const { t } = useTranslation();

  // 포트폴리오 내보내기 상태
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // 거래 내역 내보내기 상태
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [isExportingTx, setIsExportingTx] = useState(false);
  const [txExportError, setTxExportError] = useState<string | null>(null);
  const [txExportSuccess, setTxExportSuccess] = useState(false);

  // 포트폴리오 데이터 내보내기
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      await exportData(
        walletAddress,
        exportFormat,
        exportStartDate || undefined,
        exportEndDate || undefined,
      );
      setExportSuccess(true);
      // 3초 후 성공 메시지 숨기기
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t.report.exportFailed);
    } finally {
      setIsExporting(false);
    }
  }, [walletAddress, exportFormat, exportStartDate, exportEndDate, t.report.exportFailed]);

  // 거래 내역 내보내기
  const handleExportTransactions = useCallback(async () => {
    setIsExportingTx(true);
    setTxExportError(null);
    setTxExportSuccess(false);
    try {
      await exportTransactions(
        walletAddress,
        txStartDate || undefined,
        txEndDate || undefined,
      );
      setTxExportSuccess(true);
      setTimeout(() => setTxExportSuccess(false), 3000);
    } catch (err) {
      setTxExportError(err instanceof Error ? err.message : t.report.exportFailed);
    } finally {
      setIsExportingTx(false);
    }
  }, [walletAddress, txStartDate, txEndDate, t.report.exportFailed]);

  return (
    <div className="space-y-4">
      {/* 포트폴리오 데이터 내보내기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {t.report.exportData}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t.report.exportDescription}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* 포맷 선택 */}
              <div className="space-y-1.5">
                <Label htmlFor="export-format">{t.report.exportFormat}</Label>
                <select
                  id="export-format"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  )}
                  aria-label={t.report.exportFormat}
                >
                  {EXPORT_FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t.report[opt.labelKey]}
                    </option>
                  ))}
                </select>
              </div>

              {/* 시작 기간 */}
              <div className="space-y-1.5">
                <Label htmlFor="export-start">{t.report.exportStart}</Label>
                <Input
                  id="export-start"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  aria-label={t.report.exportStart}
                />
              </div>

              {/* 종료 기간 */}
              <div className="space-y-1.5">
                <Label htmlFor="export-end">{t.report.exportEnd}</Label>
                <Input
                  id="export-end"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  aria-label={t.report.exportEnd}
                />
              </div>
            </div>

            {/* 오류/성공 메시지 */}
            {exportError && (
              <p className="text-sm text-destructive" role="alert">{exportError}</p>
            )}
            {exportSuccess && (
              <p className="flex items-center gap-1 text-sm text-profit" role="status">
                <Check className="h-4 w-4" aria-hidden="true" />
                {t.report.exportSuccess}
              </p>
            )}

            {/* 내보내기 버튼 */}
            <div className="flex justify-end">
              <Button onClick={handleExport} disabled={isExporting} size="sm">
                {isExporting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-1" />
                    {t.report.exporting}
                  </>
                ) : (
                  <>
                    <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t.report.exportButton}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 거래 내역 내보내기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {t.report.exportTransactions}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t.report.exportTransactionsDescription}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* 시작 기간 */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-start">{t.report.exportStart}</Label>
                <Input
                  id="tx-start"
                  type="date"
                  value={txStartDate}
                  onChange={(e) => setTxStartDate(e.target.value)}
                  aria-label={t.report.exportStart}
                />
              </div>

              {/* 종료 기간 */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-end">{t.report.exportEnd}</Label>
                <Input
                  id="tx-end"
                  type="date"
                  value={txEndDate}
                  onChange={(e) => setTxEndDate(e.target.value)}
                  aria-label={t.report.exportEnd}
                />
              </div>
            </div>

            {/* 오류/성공 메시지 */}
            {txExportError && (
              <p className="text-sm text-destructive" role="alert">{txExportError}</p>
            )}
            {txExportSuccess && (
              <p className="flex items-center gap-1 text-sm text-profit" role="status">
                <Check className="h-4 w-4" aria-hidden="true" />
                {t.report.exportSuccess}
              </p>
            )}

            {/* 내보내기 버튼 */}
            <div className="flex justify-end">
              <Button onClick={handleExportTransactions} disabled={isExportingTx} variant="outline" size="sm">
                {isExportingTx ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-1" />
                    {t.report.exporting}
                  </>
                ) : (
                  <>
                    <FileDown className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t.report.exportCsv}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== 정기 리포트 탭 =====

interface ScheduleTabProps {
  walletAddress: string;
}

/**
 * 정기 리포트 스케줄 탭
 *
 * 일간/주간/월간 정기 리포트 스케줄 CRUD를 제공한다.
 *
 * @see 요구사항 7.3 (정기 리포트 설정)
 */
function ScheduleTab({ walletAddress }: ScheduleTabProps) {
  const { t } = useTranslation();

  // 상태
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createType, setCreateType] = useState<ReportType>('daily');
  const [isCreating, setIsCreating] = useState(false);

  // 스케줄 로드
  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSchedules(walletAddress);
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.scheduleCreateFailed);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, t.report.scheduleCreateFailed]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // 스케줄 생성
  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      await createSchedule(walletAddress, createType);
      setShowCreateForm(false);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.scheduleCreateFailed);
    } finally {
      setIsCreating(false);
    }
  }, [walletAddress, createType, loadSchedules, t.report.scheduleCreateFailed]);

  // 스케줄 삭제
  const handleDelete = useCallback(async (scheduleId: string) => {
    if (!window.confirm(t.report.scheduleDeleteConfirm)) return;
    try {
      await deleteSchedule(scheduleId);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.scheduleDeleteFailed);
    }
  }, [loadSchedules, t.report.scheduleDeleteConfirm, t.report.scheduleDeleteFailed]);

  // 스케줄 토글
  const handleToggle = useCallback(async (scheduleId: string, currentActive: boolean) => {
    try {
      await toggleScheduleActive(scheduleId, !currentActive);
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.report.scheduleCreateFailed);
    }
  }, [loadSchedules, t.report.scheduleCreateFailed]);

  return (
    <div className="space-y-4">
      {/* 안내 카드 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-medium text-foreground">{t.report.scheduleTitle}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.report.scheduleDescription}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 생성 버튼 / 폼 */}
      {!showCreateForm ? (
        <Button size="sm" onClick={() => setShowCreateForm(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {t.report.createSchedule}
        </Button>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              {t.report.createSchedule}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="schedule-type">{t.report.scheduleType}</Label>
                <select
                  id="schedule-type"
                  value={createType}
                  onChange={(e) => setCreateType(e.target.value as ReportType)}
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  )}
                  aria-label={t.report.scheduleType}
                >
                  {REPORT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t.report[opt.labelKey]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={isCreating} size="sm">
                  {isCreating ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-1" />
                      {t.report.generating}
                    </>
                  ) : (
                    <>
                      <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                      {t.common.confirm}
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCreateForm(false)} disabled={isCreating}>
                  {t.common.cancel}
                </Button>
              </div>
            </div>
            {error && (
              <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 스케줄 목록 */}
      {isLoading && schedules.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <TableRowSkeleton columns={4} rows={3} />
          </CardContent>
        </Card>
      ) : !isLoading && schedules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">{t.report.noSchedules}</p>
            <p className="text-xs text-muted-foreground">{t.report.noSchedulesDescription}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" role="table" aria-label={t.report.scheduleTitle}>
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                      {t.report.scheduleType}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground" scope="col">
                      {t.report.scheduleNextRun}
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" scope="col">
                      {t.apiKey.connectionStatus}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" scope="col">
                      {/* 액션 */}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((schedule) => (
                    <ScheduleTableRow
                      key={schedule.id}
                      schedule={schedule}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border">
              {schedules.map((schedule) => (
                <ScheduleMobileCard
                  key={schedule.id}
                  schedule={schedule}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----- 스케줄 테이블 행 -----

interface ScheduleTableRowProps {
  schedule: ScheduleResponse;
  onToggle: (scheduleId: string, currentActive: boolean) => void;
  onDelete: (scheduleId: string) => void;
}

/**
 * 정기 리포트 스케줄 테이블 행 (데스크톱)
 */
function ScheduleTableRow({ schedule, onToggle, onDelete }: ScheduleTableRowProps) {
  const { t } = useTranslation();

  const typeLabel = getReportTypeLabel(schedule.type as ReportType, t);
  const nextRunDate = new Date(schedule.nextRunAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">
          {typeLabel}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-foreground">{nextRunDate}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => onToggle(schedule.id, schedule.isActive)}
          className="inline-flex items-center"
          aria-label={t.report.scheduleToggle}
        >
          <Badge
            variant={schedule.isActive ? 'default' : 'secondary'}
            className={cn(
              'cursor-pointer text-xs',
              schedule.isActive
                ? 'bg-profit/20 text-profit hover:bg-profit/30'
                : 'hover:bg-muted',
            )}
          >
            {schedule.isActive ? t.report.scheduleActive : t.report.scheduleInactive}
          </Badge>
        </button>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(schedule.id)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={t.common.delete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}

// ----- 스케줄 모바일 카드 -----

interface ScheduleMobileCardProps {
  schedule: ScheduleResponse;
  onToggle: (scheduleId: string, currentActive: boolean) => void;
  onDelete: (scheduleId: string) => void;
}

/**
 * 정기 리포트 스케줄 모바일 카드
 */
function ScheduleMobileCard({ schedule, onToggle, onDelete }: ScheduleMobileCardProps) {
  const { t } = useTranslation();

  const typeLabel = getReportTypeLabel(schedule.type as ReportType, t);
  const nextRunDate = new Date(schedule.nextRunAt).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="px-4 py-3 space-y-2">
      {/* 상단: 유형 + 상태 */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          {typeLabel}
        </Badge>
        <button
          type="button"
          onClick={() => onToggle(schedule.id, schedule.isActive)}
          aria-label={t.report.scheduleToggle}
        >
          <Badge
            variant={schedule.isActive ? 'default' : 'secondary'}
            className={cn(
              'cursor-pointer text-xs',
              schedule.isActive ? 'bg-profit/20 text-profit' : '',
            )}
          >
            {schedule.isActive ? t.report.scheduleActive : t.report.scheduleInactive}
          </Badge>
        </button>
      </div>

      {/* 중단: 다음 실행 시각 */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t.report.scheduleNextRun}: {nextRunDate}</span>
      </div>

      {/* 하단: 삭제 버튼 */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(schedule.id)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          aria-label={t.common.delete}
        >
          <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
          {t.common.delete}
        </Button>
      </div>
    </div>
  );
}

// ===== 설정 백업/복원 탭 =====

/**
 * 설정 백업 및 복원 탭
 *
 * API 키를 제외한 사용자 설정(알림 설정, 테마, 언어 등)을
 * JSON 형식으로 내보내고 복원하는 기능을 제공한다.
 *
 * @see 요구사항 7.8 (설정 백업)
 * @see 요구사항 7.9 (설정 복원)
 */
function BackupTab() {
  const { t } = useTranslation();

  const { exportSettings, importSettings } = useSettingsStore();

  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 설정 백업 (JSON 다운로드)
  const handleBackup = useCallback(() => {
    try {
      const settingsJson = exportSettings();
      const blob = new Blob([settingsJson], { type: 'application/json' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      triggerDownload(blob, `bitscope-settings-${timestamp}.json`);
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
    } catch {
      // 실패 시 무시
    }
  }, [exportSettings]);

  // 설정 복원 (JSON 업로드)
  const handleRestore = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 파일 선택 핸들러
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setRestoreError(null);
      setRestoreSuccess(false);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result;
        if (typeof content !== 'string') {
          setRestoreError(t.report.restoreFailed);
          return;
        }

        if (!window.confirm(t.report.restoreConfirm)) return;

        const success = importSettings(content);
        if (success) {
          setRestoreSuccess(true);
          setTimeout(() => setRestoreSuccess(false), 3000);
        } else {
          setRestoreError(t.report.restoreFailed);
        }
      };
      reader.readAsText(file);

      // input 값 초기화 (같은 파일을 다시 선택할 수 있도록)
      e.target.value = '';
    },
    [importSettings, t.report.restoreFailed, t.report.restoreConfirm],
  );

  return (
    <div className="space-y-4">
      {/* 안내 카드 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-medium text-foreground">{t.report.backupTitle}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.report.backupDescription}</p>
              <p className="mt-1 text-xs text-muted-foreground/80">{t.report.noApiKeyInBackup}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 백업/복원 버튼 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 백업 */}
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-3">
            <Save className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t.report.settingsBackup}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.report.noApiKeyInBackup}
              </p>
            </div>
            <Button onClick={handleBackup} variant="outline" size="sm">
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t.report.backupButton}
            </Button>
            {backupSuccess && (
              <p className="flex items-center gap-1 text-xs text-profit" role="status">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t.report.backupSuccess}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 복원 */}
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-6 space-y-3">
            <UploadCloud className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{t.report.settingsRestore}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.report.noApiKeyInBackup}
              </p>
            </div>
            <Button onClick={handleRestore} variant="outline" size="sm">
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
              {t.report.restoreButton}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
              aria-label={t.report.restoreButton}
            />
            {restoreSuccess && (
              <p className="flex items-center gap-1 text-xs text-profit" role="status">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t.report.restoreSuccess}
              </p>
            )}
            {restoreError && (
              <p className="text-xs text-destructive" role="alert">
                {restoreError}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== 유틸리티 함수 =====

/**
 * 리포트 유형에 대한 표시 레이블을 반환한다.
 */
function getReportTypeLabel(
  type: ReportType,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  switch (type) {
    case 'daily':
      return t.report.daily;
    case 'weekly':
      return t.report.weekly;
    case 'monthly':
      return t.report.monthly;
    case 'custom':
      return t.report.custom;
    default:
      return String(type);
  }
}
