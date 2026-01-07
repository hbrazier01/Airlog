import { StandaloneConfig, createLogger } from '@repo/kitties-api';
import { run } from './run.js';

const config = new StandaloneConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
