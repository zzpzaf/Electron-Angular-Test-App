import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Layout } from "./layout/layout";


declare global {
  interface Window {
    electronAPI: any;
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Layout],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('electronang1 - Electron + Angular works!');


  ngOnInit() {
    if (window.electronAPI) {
      window.electronAPI.send('test-channel', 'Hello from Angular!');
    }
  }


}
