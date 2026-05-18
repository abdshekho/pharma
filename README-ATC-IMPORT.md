# استيراد بيانات ATC (التصنيف الكيميائي التشريحي العلاجي)

## نظرة عامة

هذا الدليل يشرح كيفية استيراد بيانات ATC (Anatomical Therapeutic Chemical Classification System) من ملف Excel إلى قاعدة البيانات.

## هيكلية ملف ATC

ملف Excel يحتوي على التصنيفات الهرمية التالية:

| العمود | الوصف | المثال |
|--------|--------|--------|
| ATC code_L1 | المستوى الأول (المجموعة التشريحية الرئيسية) | A |
| ATC code_L2 | المستوى الثاني (المجموعة العلاجية) | A01 |
| ATC code_L3 | المستوى الثالث (المجموعة الدوائية) | A01A |
| name_L3 | اسم المستوى الثالث | STOMATOLOGICAL PREPARATIONS |
| ATC code_L4 | المستوى الرابع (المجموعة الكيميائية) | A01AA |
| name_L4 | اسم المستوى الرابع | Caries prophylactic agents |
| ATC code_L5 | المستوى الخامس (المادة الكيميائية) | A01AA01 |
| Name_L5 | اسم المستوى الخامس | sodium fluoride |
| DDD_L5 | الجرعة اليومية المحددة | 1.1 |
| U_L5 | وحدة القياس | mg |
| Adm.R_L5 | طريق الإعطاء | O |
| Note_L5 | ملاحظات | 0.5 mg fluoride |
| href_L5 | رابط المرجع | https://www.whocc.no/... |
| flag_DDD | علم DDD | 1 |

## كيفية الاستيراد

### الطريقة 1: استيراد من ملف CSV محلي

1. **تحويل ملف Excel إلى CSV:**
   ```bash
   npm run convert:atc
   ```
   أو يدوياً:
   - افتح ملف `ATC_DDD_Index.xlsx`
   - احفظه كـ CSV: File → Save As → CSV
   - اسم الملف: `ATC_DDD_Index.csv`
   - ضعه في مجلد المشروع الرئيسي

2. **تشغيل الاستيراد:**
   ```bash
   npm run start:dev
   ```

3. **استخدام API:**
   ```
   POST /drug-groups/import/atc/local
   ```
   - تحتاج إلى token مصادقة مع دور admin
   - سيقوم باستيراد البيانات من ملف `ATC_DDD_Index.csv`

### الطريقة 2: رفع ملف مباشر

```
POST /drug-groups/import/atc
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

ارفع ملف CSV مع اسم الحقل `file`.

## ما يتم إنشاؤه

### 1. التصنيفات (Categories)
- **المستوى 1 (L1):** كتصنيفات رئيسية (مثال: Alimentary tract and metabolism)
- **المستوى 2 (L2):** كتصنيفات فرعية مرتبطة بالمستوى 1
- **المستوى 3 (L3):** كتصنيفات فرعية مرتبطة بالمستوى 2

### 2. مجموعات الأدوية (Drug Groups)
- **المستوى 4 (L4):** يتم إنشاؤها كمجموعات أدوية
- **المستوى 5 (L5):** يتم استخدامها في وصف مجموعة الدواء

### 3. العلاقات
- كل مجموعة دواء (L4) ترتبط بالتصنيف المناسب (L3)
- التصنيفات مرتبطة هرمياً (L3 → L2 → L1)

## مثال على البيانات المستوردة

### قبل الاستيراد:
- قاعدة البيانات فارغة من مجموعات الأدوية والتصنيفات

### بعد الاستيراد:
```
التصنيفات:
- A: Alimentary tract and metabolism (المستوى 1)
  - A01: ATC Level 2: A01 (المستوى 2)
    - A01A: STOMATOLOGICAL PREPARATIONS (المستوى 3)

مجموعات الأدوية:
- A01AA - Caries prophylactic agents
  - الوصف: Chemical Substance: sodium fluoride (A01AA01)
            DDD: 1.1 mg
            Administration Route: O
            Note: 0.5 mg fluoride
            Reference: https://www.whocc.no/...
```

## API Endpoints

### 1. استيراد من ملف محلي
```
POST /drug-groups/import/atc/local
```
**المتطلبات:**
- دور المستخدم: admin
- ملف `ATC_DDD_Index.csv` موجود في مجلد المشروع

**الاستجابة:**
```json
{
  "success": true,
  "message": "Successfully imported X ATC records",
  "stats": {
    "drugGroupsCreated": 10,
    "categoriesCreated": 5,
    "drugGroupCategoriesLinked": 10,
    "levels": {
      "l1": 1,
      "l2": 1,
      "l3": 1,
      "l4": 2,
      "l5": 8
    }
  }
}
```

### 2. رفع ملف واستيراد
```
POST /drug-groups/import/atc
```
**المتطلبات:**
- دور المستخدم: admin
- ملف CSV مرفوع عبر form-data

## استكشاف الأخطاء وإصلاحها

### المشكلة: ملف Excel لا يمكن قراءته
**الحل:** تحويله يدوياً إلى CSV:
1. افتح ملف Excel
2. File → Save As
3. اختر "CSV (Comma delimited) (*.csv)"
4. احفظ باسم `ATC_DDD_Index.csv`

### المشكلة: خطأ في الترميز
**الحل:** تأكد أن الملف يستخدم ترميز UTF-8

### المشكلة: البيانات لا تظهر
**الحل:** تحقق من:
1. أن الملف يحتوي على البيانات الصحيحة
2. أن الرؤوس (headers) مطابقة للتوقعات
3. أن الفواصل هي علامات تبويب (tabs) وليست فواصل

## ملاحظات مهمة

1. **البيانات المكررة:** الخدمة تتحقق من البيانات المكررة ولا تنشئ سجلات مكررة
2. **الترابط الهرمي:** يتم الحفاظ على العلاقات الهرمية بين المستويات
3. **الوصف:** يتم إنشاء وصف غني يحتوي على معلومات DDD وطريق الإعطاء والملاحظات
4. **الحالة:** جميع السجلات المنشأة تكون `isActive: true`

## اختبار الاستيراد

لاختبار الوظيفة بدون ملف Excel كامل:
1. تشغيل `npm run convert:atc` لإنشاء ملف تجريبي
2. استخدام ملف `test-atc-sample.csv` للاستيراد
3. التحقق من البيانات المنشأة عبر API `GET /drug-groups`