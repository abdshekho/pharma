import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcryptjs';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { UserRole, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const data: any = { ...updateUserDto };
    if (updateUserDto.password) {
      data.passwordHash = await bcrypt.hash(updateUserDto.password, 10);
      delete data.password;
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          fullName: true,
          phone: true,
          avatarUrl: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const field = (error.meta?.target as string[])?.includes('phone') ? 'Phone number' : 'Email';
        throw new ConflictException(`${field} is already in use`);
      }
      throw error;
    }
  }

  async verifyUser(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === UserStatus.active) throw new BadRequestException('User is already verified');
    if (user.role === UserRole.admin) throw new ForbiddenException('Cannot verify an admin account');

    const verifiedAt = new Date();
    const verifiedBy = adminId;

    const profileMap: Record<string, () => Promise<any>> = {
      company:     () => this.prisma.companyProfile.update({ where: { userId }, data: { verifiedAt, verifiedBy } }),
      doctor:      () => this.prisma.doctorProfile.update({ where: { userId }, data: { verifiedAt, verifiedBy } }),
      pharmacist:  () => this.prisma.pharmacistProfile.update({ where: { userId }, data: { verifiedAt, verifiedBy } }),
      distributor: () => this.prisma.distributorProfile.update({ where: { userId }, data: { verifiedAt, verifiedBy } }),
    };

    await profileMap[user.role]();
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.active },
      select: { id: true, email: true, role: true, status: true,fullName: true },
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.admin) {
      throw new ForbiddenException('Cannot delete an admin account, shuld be delete it from DB');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'User deleted successfully' };
  }
}