/**
 * 히든 메뉴 비밀번호 입력 모달
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useSignalAuth } from '@/hooks/useSignal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PasswordModalProps {
  onClose: () => void;
}

export function PasswordModal({ onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useSignalAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC 키 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    const result = await login(password);

    setLoading(false);

    if (result.success) {
      onClose();
    } else {
      setError(result.error ?? '비밀번호가 올바르지 않습니다.');
    }
  }, [password, loading, login, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative bg-card border border-border rounded-lg shadow-xl p-6 w-[320px] z-10">
        <button
          type="button"
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-sm font-semibold text-foreground mb-4">
          비밀번호 입력
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                '확인'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
