import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { User } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SessionResponseDto } from './dto/session-response.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtPayload } from './strategies/jwt.strategy';

function clientIp(req: FastifyRequest): string {
  return (
    ((req.headers['x-forwarded-for'] as string) ?? '').split(',')[0].trim() ||
    req.ip ||
    'unknown'
  );
}

@ApiTags('auth')
@Controller({ version: '1', path: 'auth' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // ── Login ─────────────────────────────────────────────────────────────────

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login — returns access + refresh tokens and creates a device session' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  login(
    @CurrentUser() user: User,
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
  ): Promise<TokenResponseDto> {
    return this.authService.login(user, dto, clientIp(req));
  }

  // ── Refresh ───────────────────────────────────────────────────────────────

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (token rotation)' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: FastifyRequest,
  ): Promise<TokenResponseDto> {
    return this.authService.refresh(dto, clientIp(req));
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: User) {
    return this.usersService.findById(user.id);
  }

  // ── Logout (revoke current session) ──────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout — revoke current device session' })
  async logout(@Req() req: FastifyRequest & { user: User }): Promise<void> {
    const payload = req.user as unknown as JwtPayload & User;
    // The session ID is embedded in the validated user via JWT payload
    // We reach it via the raw JWT in the Authorization header
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (token) {
      const decoded = this.decodeToken(token);
      if (decoded?.sid) {
        await this.authService.logout(decoded.sid);
      }
    }
  }

  // ── List active sessions ──────────────────────────────────────────────────

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all active sessions (devices) for the current user' })
  @ApiResponse({ status: 200, type: [SessionResponseDto] })
  getSessions(@CurrentUser() user: User, @Req() req: FastifyRequest): Promise<SessionResponseDto[]> {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const decoded = this.decodeToken(token);
    return this.authService.getSessions(user.id, decoded?.sid ?? '');
  }

  // ── Revoke a specific session ─────────────────────────────────────────────

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a specific session (kick a device)' })
  revokeSession(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.authService.revokeSession(id, user.id);
  }

  // ── Revoke ALL sessions ───────────────────────────────────────────────────

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout from all devices (revoke all sessions)' })
  revokeAllSessions(
    @CurrentUser() user: User,
    @Query('keepCurrent') keepCurrent: string,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    const decoded = this.decodeToken(token);
    const exceptId = keepCurrent === 'true' ? (decoded?.sid ?? undefined) : undefined;
    return this.authService.revokeAllSessions(user.id, exceptId);
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private decodeToken(token: string): (JwtPayload & { sid?: string }) | null {
    try {
      const parts = token.split('.');
      return JSON.parse(Buffer.from(parts[1], 'base64').toString()) as JwtPayload;
    } catch {
      return null;
    }
  }
}
