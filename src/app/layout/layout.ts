import { Component, inject, signal, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SiderMenuItems } from '../appObjects/angObjects';
import { BackEnd } from '../shared/services/back-end';
import { Settings } from '../settings/settings';


import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule, provideNzIcons } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-layout',
  imports: [
    RouterModule,
    Settings,
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzButtonModule,
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  public siderMenuItems = SiderMenuItems;
  public headerTitle = 'PBM - Personal Bookmarks Manager';
  public footerContent = '© 2025 Panos Zafiropoulos. All rights reserved.';

  private backService = inject(BackEnd);
  public showSettings = signal(false);
  ngOnInit(): void {
    document.title = this.headerTitle;
  }

  onSettingsClick(): void {
    // this.showSettings.set(true);
    this.showSettings.set(!this.showSettings());
    console.log('⚙️ Settings button clicked');
    // Add your logic, e.g., open settings modal
  }


  onSettingsClosed() {
    this.showSettings.set(false);
  }


  onExitClick(): void {
    console.log('🚪 Exit button clicked');
    this.backService.closeDbConnections();
    this.backService.quitApp();
    // Add your logic, e.g., call logout service
  }


  aaa() {
    console.log('Sider Menu Item clicked!');
  }


}
