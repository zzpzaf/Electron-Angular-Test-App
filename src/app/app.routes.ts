// import { bootstrapApplication } from '@angular/platform-browser';
// import { provideRouter, Routes, withHashLocation } from '@angular/router';
// import { App } from './app';
// import { provideRouter, Routes } from '@angular/router';
import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Links } from './links/links';
import { UrlsFile } from './urls-file/urls-file';
import { Bookmarks } from './bookmarks/bookmarks';
import { Markdown } from './markdown/markdown';
import { DbArticles } from './db-articles/db-articles';
import { MarkViewer } from './mark-viewer/mark-viewer';
import { Layout } from './layout/layout';


export const appRoutes: Routes = [

  // { path: 'home', component: Home },
  // { path: 'links', component: Links },
  // { path: 'urlsfile', component: UrlsFile },
  // { path: 'bookmarks', component: Bookmarks },
  // { path: 'markdown', component: Markdown },
  // { path: 'articles', component: DbArticles },
  // { path: 'show-mark', component: MarkViewer },
  // { path: '', redirectTo: '/home', pathMatch: 'full' },

    {
    path: '',
    component: Layout,
    children: [
      { path: 'home', component: Home },
      { path: 'links', component: Links },
      { path: 'urlsfile', component: UrlsFile },
      { path: 'bookmarks', component: Bookmarks },
      { path: 'markdown', component: Markdown },
      { path: 'articles', component: DbArticles },
    ]
  }, 
  { path: 'show-mark', component: MarkViewer },  
  { path: '**', redirectTo: 'home' }


];



