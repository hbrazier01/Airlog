import { run } from './cli.js';
import { StandaloneConfig, createLogger } from '@repo/kitties-api';

const config = new StandaloneConfig();
const logger = await createLogger(config.logDir);
await run(config, logger);
