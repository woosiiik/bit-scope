'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  const [local, setLocal] = useState(value);

  // 부모 value 동기화
  useEffect(() => {
    setLocal(value);
  }, [value]);

  // debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local, value, onChange]);

  return (
    <div className="relative w-full max-w-[240px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        placeholder="Search coin..."
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        className="h-8 text-xs pl-8"
      />
    </div>
  );
}
