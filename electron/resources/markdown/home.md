# Medium Scraper

This project is a desktop application built with **Electron** and **Angular** that allows you to scrape Medium articles by URL and display the fetched data in a user-friendly interface.

## 🚀 Features

- Electron + Angular integration.
- Scrape Medium articles using a backend `scrapper` service.
- Display scraped data in a multiline text area.
- Clear, submit, and control data flow with buttons.
- Disable/enable buttons based on scraper state.
- Use Angular **signals** for reactive data binding (no manual change detection needed).
- Responsive UI with Ant Design (NG-ZORRO) components.

## 📦 Tech Stack

- [Electron](https://www.electronjs.org/) — desktop app framework.
- [Angular](https://angular.io/) — frontend framework.
- [NG-ZORRO](https://ng.ant.design/docs/introduce/en) — Ant Design components for Angular.
- TypeScript.

## 🏗️ Project Structure

- **Main process (Electron)**:
  - Creates the application window (`BrowserWindow`).
  - Sets the window title using `title` option or `mainWindow.setTitle()`.
  - Opens DevTools in development.
  
- **Renderer process (Angular)**:
  - Contains the main UI and logic.
  - Uses `[(ngModel)]` or **signals** to bind form controls like textarea and checkboxes.
  - Calls `scrapper.scrapeArticle(url)` to fetch data asynchronously.
  - Displays fetched data in a multiline textarea.
  - Updates UI automatically using Angular signals.

## 💻 UI Design

### MIT License

#### Copyright (c) 2025 Panos Zafiropoulos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
