import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private config: ConfigService) {
    this.from = this.config.get<string>('SMTP_FROM') ?? `Teryaq <${this.config.get<string>('SMTP_USER')}>`;

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendAccountVerifiedEmail(to: string, fullName: string | null) {
    const dashboardUrl = this.config.get<string>('DASHBOARD_URL') ?? 'https://teryaq-dashboard-nine.vercel.app';

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Your Teryaq account has been verified',
        text: `Hi ${fullName ?? 'there'},\n\nGood news — your account has been verified by our team. You can now log in to the dashboard:\n${dashboardUrl}\n\nThanks,\nThe Teryaq Team`,
        html: `
          <p>Hi ${fullName ?? 'there'},</p>
          <p>Good news — your account has been verified by our team. You can now log in to the dashboard:</p>
          <p><a href="${dashboardUrl}">${dashboardUrl}</a></p>
          <p>Thanks,<br/>The Teryaq Team</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error instanceof Error ? error.stack : error);
    }
  }
}
