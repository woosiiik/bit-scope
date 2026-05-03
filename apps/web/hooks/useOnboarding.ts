/**
 * 온보딩 상태 관리 커스텀 훅
 *
 * 최초 로그인 사용자에 대한 온보딩 가이드 표시 여부를 관리한다.
 * 온보딩 완료 상태를 지갑 주소별로 추적하고,
 * API 키 미등록 시 데모 모드를 활성화한다.
 *
 * @see 요구사항 11.1 (단계별 온보딩 가이드)
 * @see 요구사항 11.3 (데모 데이터 미리보기 모드)
 * @see 요구사항 11.4 (온보딩 완료 후 대시보드 이동)
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExchangeType } from '@bitscope/shared';
import {
  isOnboardingCompleted,
  markOnboardingCompleted,
  getDemoPortfolio,
} from '@/lib/onboarding';
import { hasEncryptedKeys } from '@/lib/crypto/encryption-service';

/** 온보딩 스텝 식별자 */
export type OnboardingStep = 'exchange-select' | 'api-key' | 'verify';

/** useOnboarding 훅 반환 타입 */
export interface UseOnboardingReturn {
  /** 온보딩을 표시해야 하는지 여부 */
  shouldShowOnboarding: boolean;
  /** 온보딩이 이미 완료되었는지 여부 */
  isCompleted: boolean;
  /** 데모 모드 활성 여부 (API 키 미등록 시) */
  isDemoMode: boolean;
  /** 현재 온보딩 스텝 */
  currentStep: OnboardingStep;
  /** 현재 스텝 인덱스 (0-based) */
  currentStepIndex: number;
  /** 총 스텝 수 */
  totalSteps: number;
  /** 선택된 거래소 목록 */
  selectedExchanges: ExchangeType[];
  /** 거래소 선택/해제 토글 */
  toggleExchange: (exchange: ExchangeType) => void;
  /** 다음 스텝으로 이동 */
  goToNextStep: () => void;
  /** 이전 스텝으로 이동 */
  goToPreviousStep: () => void;
  /** 특정 스텝으로 이동 */
  goToStep: (step: OnboardingStep) => void;
  /** 온보딩 완료 처리 */
  completeOnboarding: () => void;
  /** 온보딩 건너뛰기 (완료 처리 후 대시보드로) */
  skipOnboarding: () => void;
  /** 데모 모드 활성화 */
  activateDemoMode: () => void;
  /** 데모 모드 비활성화 */
  exitDemoMode: () => void;
  /** 데모 모드 포트폴리오 데이터 */
  demoPortfolio: ReturnType<typeof getDemoPortfolio> | null;
}

/** 온보딩 스텝 목록 */
const ONBOARDING_STEPS: OnboardingStep[] = ['exchange-select', 'api-key', 'verify'];

/**
 * 온보딩 상태 관리 훅
 *
 * @param walletAddress 현재 연결된 지갑 주소
 * @returns 온보딩 상태 및 제어 함수들
 */
export function useOnboarding(walletAddress: string): UseOnboardingReturn {
  const [isCompleted, setIsCompleted] = useState(true); // 기본적으로 완료로 시작 (로드 전)
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedExchanges, setSelectedExchanges] = useState<ExchangeType[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoPortfolio, setDemoPortfolio] = useState<ReturnType<typeof getDemoPortfolio> | null>(null);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  /**
   * 지갑 주소가 변경되면 온보딩 상태를 확인한다.
   *
   * - 온보딩이 완료되지 않았고 API 키도 없으면 온보딩을 표시
   * - 이미 완료되었거나 API 키가 있으면 표시하지 않음
   */
  useEffect(() => {
    if (!walletAddress) {
      setShouldShowOnboarding(false);
      setIsCompleted(true);
      return;
    }

    const completed = isOnboardingCompleted(walletAddress);
    const hasKeys = hasEncryptedKeys(walletAddress);

    setIsCompleted(completed);

    // 온보딩 완료되지 않았고, API 키도 등록되지 않은 경우에만 온보딩 표시
    // API 키가 이미 있으면 온보딩을 이미 경험한 것으로 간주
    if (!completed && !hasKeys) {
      setShouldShowOnboarding(true);
      setCurrentStepIndex(0);
      setSelectedExchanges([]);
      setIsDemoMode(false);
      setDemoPortfolio(null);
    } else {
      setShouldShowOnboarding(false);

      // API 키가 있지만 온보딩이 미완료라면 자동으로 완료 처리
      if (!completed && hasKeys) {
        markOnboardingCompleted(walletAddress);
        setIsCompleted(true);
      }
    }
  }, [walletAddress]);

  /** 현재 온보딩 스텝 */
  const currentStep = ONBOARDING_STEPS[currentStepIndex] ?? 'exchange-select';

  /** 거래소 선택/해제 토글 */
  const toggleExchange = useCallback((exchange: ExchangeType) => {
    setSelectedExchanges((prev) =>
      prev.includes(exchange)
        ? prev.filter((e) => e !== exchange)
        : [...prev, exchange],
    );
  }, []);

  /** 다음 스텝으로 이동 */
  const goToNextStep = useCallback(() => {
    setCurrentStepIndex((prev) =>
      Math.min(prev + 1, ONBOARDING_STEPS.length - 1),
    );
  }, []);

  /** 이전 스텝으로 이동 */
  const goToPreviousStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  /** 특정 스텝으로 이동 */
  const goToStep = useCallback((step: OnboardingStep) => {
    const index = ONBOARDING_STEPS.indexOf(step);
    if (index >= 0) {
      setCurrentStepIndex(index);
    }
  }, []);

  /** 온보딩 완료 처리 */
  const completeOnboarding = useCallback(() => {
    if (!walletAddress) return;

    markOnboardingCompleted(walletAddress, selectedExchanges);
    setIsCompleted(true);
    setShouldShowOnboarding(false);
    setIsDemoMode(false);
    setDemoPortfolio(null);
  }, [walletAddress, selectedExchanges]);

  /** 온보딩 건너뛰기 (완료 처리) */
  const skipOnboarding = useCallback(() => {
    if (!walletAddress) return;

    markOnboardingCompleted(walletAddress);
    setIsCompleted(true);
    setShouldShowOnboarding(false);
    setIsDemoMode(false);
    setDemoPortfolio(null);
  }, [walletAddress]);

  /** 데모 모드 활성화 */
  const activateDemoMode = useCallback(() => {
    setIsDemoMode(true);
    setDemoPortfolio(getDemoPortfolio());
    // 데모 모드 진입 시에도 온보딩 완료 처리
    if (walletAddress) {
      markOnboardingCompleted(walletAddress);
      setIsCompleted(true);
      setShouldShowOnboarding(false);
    }
  }, [walletAddress]);

  /** 데모 모드 비활성화 */
  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false);
    setDemoPortfolio(null);
  }, []);

  return {
    shouldShowOnboarding,
    isCompleted,
    isDemoMode,
    currentStep,
    currentStepIndex,
    totalSteps: ONBOARDING_STEPS.length,
    selectedExchanges,
    toggleExchange,
    goToNextStep,
    goToPreviousStep,
    goToStep,
    completeOnboarding,
    skipOnboarding,
    activateDemoMode,
    exitDemoMode,
    demoPortfolio,
  };
}
