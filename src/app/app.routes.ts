// import { bootstrapApplication } from '@angular/platform-browser';
// import { provideRouter, Routes, withHashLocation } from '@angular/router';
// import { App } from './app';
// import { provideRouter, Routes } from '@angular/router';
import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Article } from './article/article';
import { UrlsFile } from './urls-file/urls-file';
import { SqliteUrls } from './sqlite-urls/sqlite-urls';



export const appRoutes: Routes = [
  { path: 'home', component: Home },
  { path: 'article', component: Article },
  { path: 'urlsfile', component: UrlsFile },
  { path: 'sqliteurls', component: SqliteUrls },
  // { path: 'help', component: HelpComponent },
  { path: '', redirectTo: '/home', pathMatch: 'full' },
];

