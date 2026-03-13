# Pharma Soft - نظام إدارة الأدوية

نظام شامل لإدارة الأدوية والصيدليات مبني بـ NestJS و Prisma.

## المميزات الحالية

### نظام المصادقة والأدوار (Auth & Roles)
- تسجيل المستخدمين الجدد
- تسجيل الدخول مع JWT
- إدارة الأدوار (شركة، طبيب، صيدلي، موزع، مدير)
- حماية المسارات بناءً على الأدوار
- التحقق من صحة البيانات

### الأدوار المتاحة
- `company` - شركات الأدوية
- `doctor` - الأطباء
- `pharmacist` - الصيادلة
- `distributor` - الموزعون
- `admin` - المديرون

## التثبيت والتشغيل

```bash
# تثبيت المكتبات
npm install

# إعداد قاعدة البيانات
# تأكد من تحديث DATABASE_URL في ملف .env
npx prisma migrate dev

# تشغيل التطبيق
npm run start:dev
```

## متغيرات البيئة

```env
DATABASE_URL="postgresql://username:password@localhost:5432/pharma_db?schema=public"
JWT_SECRET="pharma-jwt-secret-key-2025"
PORT=3000
```

## API Endpoints

### المصادقة
- `POST /auth/register` - Sign Up
- `POST /auth/login` - Sign in
- `GET /auth/profile` - الحصول على بيانات المستخدم الحالي

### المستخدمون
- `GET /users/me` - بيانات المستخدم الحالي
- `GET /users/admin-only` - مسار خاص بالمديرين فقط

## مثال على التسجيل

```json
POST /auth/register
{
  "email": "doctor@example.com",
  "password": "password123",
  "role": "doctor",
  "fullName": "د. أحمد محمد",
  "phone": "+963123456789",
  "cityId": "uuid-city-id"
}
```

## مثال على تسجيل الدخول

```json
POST /auth/login
{
  "email": "doctor@example.com",
  "password": "password123"
}
```

## الخطوات التالية

- [ ] إنشاء واجهات إدارة الملفات الشخصية
- [ ] نظام إدارة المنتجات
- [ ] نظام الطلبات
- [ ] نظام العينات
- [ ] نظام الإشعارات
- [ ] نظام التقارير

## التقنيات المستخدمة

- **NestJS** - إطار العمل الخلفي
- **Prisma** - ORM لقاعدة البيانات
- **PostgreSQL** - قاعدة البيانات
- **JWT** - المصادقة
- **bcryptjs** - تشفير كلمات المرور
- **class-validator** - التحقق من صحة البيانات