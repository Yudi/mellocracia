import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AppConfig } from '../config/app-config';

@Injectable()
export class TurnstileService {
  constructor(private readonly config: AppConfig) {}

  async verify(token: unknown): Promise<void> {
    if (!this.config.turnstileSecretKey) {
      return;
    }
    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 2_048
    ) {
      throw new BadRequestException({
        code: 'TURNSTILE_REQUIRED',
        message: 'A valid challenge is required',
      });
    }

    const body = new URLSearchParams({
      secret: this.config.turnstileSecretKey,
      response: token,
    });
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      response = await fetch(this.config.turnstileSiteverifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      throw new ForbiddenException({
        code: 'TURNSTILE_UNAVAILABLE',
        message: 'Challenge verification failed',
      });
    }
    clearTimeout(timeout);

    if (!response.ok) {
      throw new ForbiddenException({
        code: 'TURNSTILE_UNAVAILABLE',
        message: 'Challenge verification failed',
      });
    }
    const result = (await response
      .json()
      .catch(() => ({ success: false }))) as { success?: boolean };
    if (result.success !== true) {
      throw new ForbiddenException({
        code: 'TURNSTILE_FAILED',
        message: 'Challenge verification failed',
      });
    }
  }
}
