import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { AppConfig } from '../config/app-config';

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
}

@Injectable()
export class ClientIpService {
  constructor(private readonly config: AppConfig) {}

  getClientIp(request: unknown): string {
    const value = request as RequestLike;
    if (this.config.trustCloudflare) {
      const forwarded = this.headerValue(value.headers?.['cf-connecting-ip']);
      if (forwarded && isIP(forwarded) > 0) {
        return forwarded;
      }
    }

    const socketAddress =
      value.socket?.remoteAddress ?? value.connection?.remoteAddress;
    return socketAddress && isIP(socketAddress) > 0 ? socketAddress : '0.0.0.0';
  }

  hashRequestIp(request: unknown): string {
    return createHmac('sha256', this.config.ipHashSecret)
      .update(this.getClientIp(request), 'utf8')
      .digest('base64url');
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    const candidate = Array.isArray(value) ? value[0] : value;
    if (!candidate) {
      return undefined;
    }
    const trimmed = candidate.trim();
    return trimmed.length <= 128 ? trimmed : undefined;
  }
}
