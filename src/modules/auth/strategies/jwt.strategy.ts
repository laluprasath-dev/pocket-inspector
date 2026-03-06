import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  orgId: string;
  sid?: string; // session ID — present on all tokens issued after device-session feature
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Tokens without a session ID (issued before this feature) — legacy path
    if (!payload.sid) {
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new UnauthorizedException('User no longer exists');
      return user;
    }

    // Verify session is still active
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session || !session.user) {
      throw new UnauthorizedException('Session not found — please log in again');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Session revoked — please log in again');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired — please log in again');
    }

    // Update lastUsedAt (fire and forget — non-blocking)
    this.prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return session.user;
  }
}
