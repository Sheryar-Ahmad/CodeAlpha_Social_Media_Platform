import { build } from 'vite';

// Local server settings must not turn a release client into a development build.
process.env.NODE_ENV = 'production';
await build();
