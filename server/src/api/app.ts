// C-02 API Layer: builds the Express app. Routes only validate input, check the role and call a service.
import express, { type Express } from 'express';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { mountProtectedRoutes } from './routes/protectedRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createHealthService, type HealthService } from '../services/health/healthService.js';

export interface AppDependencies {
  healthService: HealthService;
}

export function createApp(deps: AppDependencies = { healthService: createHealthService() }): Express {
  const app = express();
  app.use(express.json());
  app.use(healthRouter(deps.healthService));
  app.use(authRouter());
  mountProtectedRoutes(app);
  app.use(errorHandler);
  return app;
}
