import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes, withHashLocation } from '@angular/router';
import { App } from './app';

export const routes: Routes = [];

bootstrapApplication(App, {
  providers: [
    provideRouter(routes, withHashLocation())
  ]
});