import * as fs from 'fs';
import * as path from 'path';

const fontsDir = path.join(path.dirname(require.resolve('@fontsource/cairo/package.json')), 'files');

function loadFontBase64(filename: string): string {
  return fs.readFileSync(path.join(fontsDir, filename)).toString('base64');
}

const cairoRegular = loadFontBase64('cairo-arabic-400-normal.woff2');
const cairoBold = loadFontBase64('cairo-arabic-700-normal.woff2');

export const catalogFontFaceCss = `
  @font-face {
    font-family: 'Cairo';
    font-weight: 400;
    src: url(data:font/woff2;base64,${cairoRegular}) format('woff2');
  }
  @font-face {
    font-family: 'Cairo';
    font-weight: 700;
    src: url(data:font/woff2;base64,${cairoBold}) format('woff2');
  }
`;
