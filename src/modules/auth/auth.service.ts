import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import type { User } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SessionResponseDto } from './dto/session-response.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Validate credentials (called by LocalStrategy) ───────────────────────

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    return isMatch ? user : null;
  }

  // ── Login: create/update session, return tokens ───────────────────────────

  async login(user: User, dto: LoginDto, ip?: string): Promise<TokenPair> {
    const deviceId = dto.deviceId ?? randomUUID();

    // Find existing session for this device (so we reuse the same session ID)
    const existing = await this.prisma.session.findUnique({
      where: { userId_deviceId: { userId: user.id, deviceId } },
    });

    const sessionId = existing?.id ?? randomUUID();
    const tokens = this.generateTokens(user, sessionId);
    const refreshHash = sha256(tokens.refreshToken);
    const expiresAt = jwtExpiry(tokens.refreshToken);

    await this.prisma.session.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      create: {
        id: sessionId,
        userId: user.id,
        deviceId,
        deviceName: dto.deviceName,
        deviceType: dto.deviceType,
        ipAddress: ip,
        refreshTokenHash: refreshHash,
        expiresAt,
      },
      update: {
        deviceName: dto.deviceName ?? existing?.deviceName,
        deviceType: dto.deviceType ?? existing?.deviceType,
        ipAddress: ip,
        refreshTokenHash: refreshHash,
        expiresAt,
        revokedAt: null,
        lastUsedAt: new Date(),
      },
    });

    return tokens;
  }

  // ── Refresh: validate token + device, rotate refresh token ───────────────

  async refresh(dto: RefreshTokenDto, ip?: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('Legacy token — please log in again');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (!session) throw new UnauthorizedException('Session not found');
    if (session.revokedAt) throw new UnauthorizedException('Session revoked — please log in again');
    if (session.userId !== payload.sub) throw new UnauthorizedException('Token mismatch');

    // Verify refresh token hash (prevents refresh token reuse after rotation)
    if (sha256(dto.refreshToken) !== session.refreshTokenHash) {
      // Possible token theft — revoke the session entirely
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token already used — session revoked for security');
    }

    // Optionally verify device hasn't changed
    if (dto.deviceId && dto.deviceId !== session.deviceId) {
      throw new UnauthorizedException('Device mismatch — please log in again');
    }

    // Generate new tokens (refresh token rotation)
    const newTokens = this.generateTokens(session.user, session.id);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: sha256(newTokens.refreshToken),
        expiresAt: jwtExpiry(newTokens.refreshToken),
        lastUsedAt: new Date(),
        ipAddress: ip ?? session.ipAddress,
      },
    });

    return newTokens;
  }

  // ── Logout: revoke current session ───────────────────────────────────────

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ── List active sessions for a user ──────────────────────────────────────

  async getSessions(userId: string, currentSessionId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      deviceType: s.deviceType,
      ipAddress: s.ipAddress,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
    }));
  }

  // ── Revoke a specific session ─────────────────────────────────────────────

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException('Cannot revoke another user\'s session');
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  // ── Revoke ALL sessions (logout everywhere) ───────────────────────────────

  async revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  // ── Token generation ──────────────────────────────────────────────────────

  private generateTokens(user: User, sessionId: string): TokenPair {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
      sid: sessionId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '7d'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '90d'),
    });

    return { accessToken, refreshToken };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function jwtExpiry(token: string): Date {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp: number };
  return new Date(payload.exp * 1000);
}
