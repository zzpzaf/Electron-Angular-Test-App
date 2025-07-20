import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { provideRouter, withHashLocation } from '@angular/router';
import { appRoutes } from './app/app.routes';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { importProvidersFrom } from '@angular/core';


// bootstrapApplication(App, appConfig)
//   .catch((err) => console.error(err));

bootstrapApplication(App, {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    provideRouter(appRoutes, withHashLocation()),
    importProvidersFrom(NzModalModule),

  ]
}).catch((err) => console.error(err));