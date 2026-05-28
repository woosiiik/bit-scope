import { Injectable, Logger } from '@nestjs/common';

interface ExchangeState {
  consecutiveFailures: number;
  backoffUntil: number;
}

@Injectable()
export class ExchangeBackoffManager {
  private readonly logger = new Logger(ExchangeBackoffManager.name);
  private readonly states = new Map<string, ExchangeState>();

  shouldSkip(exchange: string): boolean {
    const state = this.states.get(exchange);
    if (!state) return false;
    if (Date.now() < state.backoffUntil) {
      return true;
    }
    return false;
  }

  recordSuccess(exchange: string): void {
    this.states.delete(exchange);
  }

  recordFailure(exchange: string): void {
    const state = this.states.get(exchange) ?? { consecutiveFailures: 0, backoffUntil: 0 };
    state.consecutiveFailures++;

    const baseDelay = 60_000; // 60초
    const maxDelay = 3_600_000; // 1시간

    if (state.consecutiveFailures >= 3) {
      const delay = Math.min(baseDelay * Math.pow(2, state.consecutiveFailures - 3), maxDelay);
      state.backoffUntil = Date.now() + delay;
      this.logger.warn(`${exchange} 백오프 ${delay / 1000}초 (연속 실패 ${state.consecutiveFailures}회)`);
    }

    this.states.set(exchange, state);
  }

  getStatus(): Record<string, { failures: number; backoffSeconds: number }> {
    const result: Record<string, { failures: number; backoffSeconds: number }> = {};
    for (const [exchange, state] of this.states) {
      result[exchange] = {
        failures: state.consecutiveFailures,
        backoffSeconds: Math.max(0, Math.ceil((state.backoffUntil - Date.now()) / 1000)),
      };
    }
    return result;
  }
}
