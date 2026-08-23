import { AppConfig } from './app-config';

export const appConfigProvider = {
  provide: AppConfig,
  useFactory: (): AppConfig => new AppConfig(),
};
