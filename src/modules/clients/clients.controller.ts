import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '../../../generated/prisma/client';
import { Role } from '../../../generated/prisma/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@ApiTags('clients')
@ApiBearerAuth('access-token')
@Roles(Role.ADMIN)
@Controller({ version: '1', path: 'clients' })
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'List all clients in the org (admin only)' })
  findAll(@CurrentUser() user: User) {
    return this.clientsService.findAll(user.orgId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a client by ID with linked sites and buildings (admin only)',
  })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.clientsService.findById(id, user.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new client (admin only)' })
  create(@Body() dto: CreateClientDto, @CurrentUser() user: User) {
    return this.clientsService.create(dto, user.orgId, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a client (admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: User,
  ) {
    return this.clientsService.update(id, dto, user.orgId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.clientsService.remove(id, user.orgId);
  }
}
