const fs = require('fs');
const path = require('path');

// Simple script to convert Excel to CSV manually
// Since we can't install xlsx package, we'll create a helper script
// that you can run manually after converting the file

console.log('ATC File Converter');
console.log('==================');

const excelFilePath = path.join(__dirname, '..', 'ATC_DDD_Index.xlsx');
const csvFilePath = path.join(__dirname, '..', 'ATC_DDD_Index.csv');

if (!fs.existsSync(excelFilePath)) {
  console.error(`Excel file not found: ${excelFilePath}`);
  console.log('\nTo use this feature:');
  console.log('1. Open the Excel file manually');
  console.log('2. Save it as CSV (File -> Save As -> CSV)');
  console.log('3. Name it: ATC_DDD_Index.csv');
  console.log('4. Place it in the project root directory');
  process.exit(1);
}

console.log(`Found Excel file: ${excelFilePath}`);
console.log('\nNote: Automatic conversion requires xlsx package.');
console.log('Since network issues prevent installation, please:');
console.log('\n1. Open the Excel file manually');
console.log('2. Save it as CSV (File -> Save As -> CSV)');
console.log('3. Name it: ATC_DDD_Index.csv');
console.log('4. Place it in the project root directory');
console.log('\nThen run: npm run import:atc');

// Create a simple CSV template for testing
const testCsvContent = `ATC code_L1	ATC code_L2	ATC code_L3	name_L3	ATC code_L4	name_L4	ATC code_L5	Name_L5	DDD_L5	U_L5	Adm.R_L5	Note_L5	href_L5	flag_DDD
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA01	sodium fluoride	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA02	sodium monofluorophosphate	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA03	olaflur	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA04	stannous fluoride	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA30	combinations	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA51	sodium fluoride, combinations	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA52	sodium monofluorophosphate, combinations	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA53	olaflur, combinations	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AA	Caries prophylactic agents	A01AA54	stannous fluoride, combinations	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AA&showdescription=no	1
A	A01	A01A	STOMATOLOGICAL PREPARATIONS	A01AB	Antiinfectives and antiseptics for local oral treatment	A01AB02	hydrogen peroxide	1.1	mg	O	0.5 mg fluoride	https://www.whocc.no/atc_ddd_index/?code=A01AB&showdescription=no	1`;

const testCsvPath = path.join(__dirname, '..', 'test-atc-sample.csv');
fs.writeFileSync(testCsvPath, testCsvContent);
console.log(`\nCreated test CSV file: ${testCsvPath}`);
console.log('You can use this for testing the import functionality.');