import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async registerAdmin(registerDto: RegisterDto) {
    return this.createUser(registerDto);
  }

  async register(registerDto: RegisterDto) {
    if (registerDto.role === UserRole.admin) {
      throw new ForbiddenException('Cannot create admin account through public registration');
    }
    return this.createUser(registerDto);
  }

  private async createUser(registerDto: RegisterDto) {

    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    if (registerDto.cityId) {
      const cityExists = await this.prisma.city.findUnique({
        where: { id: registerDto.cityId },
      });
      if (!cityExists) {
        throw new ConflictException('Invalid city ID');
      }
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const userData = {
      email: registerDto.email,
      passwordHash: hashedPassword,
      role: registerDto.role,
      fullName: registerDto.fullName,
      phone: registerDto.phone || null,
      cityId: registerDto.cityId || null,
    };

    console.log('User data to create:', JSON.stringify(userData, null, 2));

    let user;
    try {
      user = await this.prisma.user.create({
        data: userData,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          fullName: true,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        const field = (error.meta?.target as string[])?.includes('phone') ? 'Phone number' : 'Email';
        throw new ConflictException(`${field} is already in use`);
      }
      throw error;
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user || !(await bcrypt.compare(loginDto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        fullName: user.fullName,
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        fullName: true,
      },
    });
  }
}
