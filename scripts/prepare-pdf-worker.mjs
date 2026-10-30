import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(projectRoot, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const destination = resolve(projectRoot, 'public/pdf.worker.min.mjs');

try {
  const sourceStats = statSync(source);
  if (!sourceStats.isFile() || sourceStats.size < 100_000) {
    throw new Error(`Il worker PDF sorgente è mancante o insolitamente piccolo (${sourceStats.size} byte).`);
  }
  const first = readFileSync(source, { encoding: 'utf8', flag: 'r' }).trimStart()[0];
  if (first === '<') {
    throw new Error('Il file sorgente del worker contiene HTML invece di JavaScript.');
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  const destinationStats = statSync(destination);
  if (destinationStats.size !== sourceStats.size) {
    throw new Error(`Copia del worker incompleta: origine ${sourceStats.size} byte, destinazione ${destinationStats.size} byte.`);
  }
  console.log(`Worker PDF preparato: public/pdf.worker.min.mjs (${destinationStats.size} byte).`);
} catch (error) {
  console.error(`Preparazione del worker PDF non riuscita: ${error?.message || error}`);
  process.exitCode = 1;
}
