import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ContractsService } from './contracts.service';
import { TerminateContractDto } from './dto/terminate-contract.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id/sign')
  @Roles(UserRole.distributor)
  sign(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.sign(
      id,
      user.id,
      user.role,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch(':id/terminate')
  @Roles(UserRole.company, UserRole.admin)
  terminate(
    @Param('id') id: string,
    @Body() dto: TerminateContractDto,
    @CurrentUser() user: any,
  ) {
    return this.service.terminate(id, user.id, user.role, dto);
  }
}
