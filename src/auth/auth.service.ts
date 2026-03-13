import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    console.log('Register DTO received:', JSON.stringify(registerDto, null, 2));

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

    const user = await this.prisma.user.create({
      data: userData,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        fullName: true,
      },
    });

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
