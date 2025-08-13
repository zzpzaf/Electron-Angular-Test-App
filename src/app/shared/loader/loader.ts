// app/shared/loader/loader.ts
// This file defines the Global overlay Loader component for displaying loading indicators in the application.
// It uses Angular's NgZorro library for styling and is reactive to the LoaderService state.

import { Component, inject } from '@angular/core';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { LoaderService } from '../services/loader-service';


@Component({
  selector: 'app-global-loader',
  standalone: true,
  imports: [NzSpinModule],
  templateUrl: './loader.html',
  styleUrls: ['./loader.scss'],
})
export class Loader {
  
  public loader = inject(LoaderService);
  
  constructor() {}
}

