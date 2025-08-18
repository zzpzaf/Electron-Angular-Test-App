import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { provideRouter, withHashLocation } from '@angular/router';
import { appRoutes } from './app/app.routes';

import { NzModalModule } from 'ng-zorro-antd/modal';
import { importProvidersFrom } from '@angular/core';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { LogoutOutline, SettingOutline, HomeOutline } from '@ant-design/icons-angular/icons';


// bootstrapApplication(App, appConfig)
//   .catch((err) => console.error(err));

bootstrapApplication(App, {
  ...appConfig,
  providers: [
    ...(appConfig.providers || []),
    provideRouter(appRoutes, withHashLocation()),
    importProvidersFrom(NzModalModule),
    provideNzIcons([SettingOutline, LogoutOutline, HomeOutline,])

  ]
}).catch((err) => console.error(err));