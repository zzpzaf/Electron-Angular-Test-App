// import { bootstrapApplication } from '@angular/platform-browser';
// import { provideRouter, Routes, withHashLocation } from '@angular/router';
// import { App } from './app';
// import { provideRouter, Routes } from '@angular/router';
import { Routes } from '@angular/router';
import { Home } from './home/home';
import { ListUrls  } from './list-urls/list-urls';
import { FileUrls } from './file-urls/file-urls';
import { Bookmarks } from './bookmarks/bookmarks';
import { SingleUrl } from './single-url/single-url';
import { DbArticles } from './db-articles/db-articles';
import { MarkViewer } from './mark-viewer/mark-viewer';
import { Layout } from './layout/layout';
import { Categories } from './categories/categories';
// import { ArticlesTable } from './articles-table/articles-table';


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
      { path: 'single-url', component: SingleUrl },
      { path: 'list-urls', component: ListUrls },
      { path: 'file-urls', component: FileUrls },
      { path: 'bookmarks', component: Bookmarks },
      { path: 'dbarticles', component: DbArticles },
      { path: 'categories', component: Categories }
      // { path: 'articles-table', component: ArticlesTable },
    ]
  }, 
  { path: 'show-mark', component: MarkViewer },  
  { path: '**', redirectTo: 'home' },
  // { path: '/', redirectTo: 'home' },


];



