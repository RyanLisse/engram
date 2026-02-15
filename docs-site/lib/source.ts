import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mdxSource = docs.toFumadocsSource() as any;
const files = typeof mdxSource.files === 'function' ? mdxSource.files() : mdxSource.files;

export const source = loader({
  baseUrl: '/docs',
  source: { files },
});
