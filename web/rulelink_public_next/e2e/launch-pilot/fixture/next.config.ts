import type {NextConfig} from 'next';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const config: NextConfig = {
  turbopack: {
    root: appRoot,
  },
};

export default config;
