// Loaded with --import: registers the resolve hook in ts-hooks.mjs.
import { register } from 'node:module';

register('./ts-hooks.mjs', import.meta.url);
