// import { bootstrapApplication } from '@angular/platform-browser';
// import { provideRouter, Routes, withHashLocation } from '@angular/router';
// import { App } from './app';
import { provideRouter, Routes } from '@angular/router';
import { Home } from './home/home';
import { Article } from './article/article';



export const appRoutes: Routes = [
  { path: 'home', component: Home },
  { path: 'article', component: Article },
  // { path: 'profile', component: ProfileComponent },
  // { path: 'help', component: HelpComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
];

