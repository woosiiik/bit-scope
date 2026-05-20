/**
 * 히든 메뉴 트리거
 *
 * 버전 텍스트를 2초 이내에 5번 클릭하면 비밀번호 모달을 띄운다.
 * 외관상 일반 텍스트와 동일하게 유지하여 힌트를 노출하지 않는다.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { PasswordModal } from './password-modal';

interface HiddenMenuTriggerProps {
  versionText: string;
}

const CLICK_THRESHOLD = 5;
const CLICK_TIMEOUT_MS = 2000;

export function HiddenMenuTrigger({ versionText }: HiddenMenuTriggerProps) {
  const [showModal, setShowModal] = useState(false);
  const clickCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    clickCountRef.current += 1;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, CLICK_TIMEOUT_MS);

    if (clickCountRef.current >= CLICK_THRESHOLD) {
      clickCountRef.current = 0;
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowModal(true);
    }
  }, []);

  return (
    <>
      <span
        onClick={handleClick}
        className="text-[10px] text-sidebar-foreground/40 cursor-default select-none"
      >
        {versionText}
      </span>
      {showModal && (
        <PasswordModal onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
