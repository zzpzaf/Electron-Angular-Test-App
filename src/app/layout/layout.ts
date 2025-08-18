// src/app/layout.ts

import { Component, inject, signal, ViewChild } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { MainAppMenuItem, MainAppMenuItems, SIDER_MENUS, SiderMenuItem } from '../appObjects/angObjects';
import { BackEnd } from '../shared/services/back-end';
import { Settings } from '../settings/settings';



import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

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

  public mainMenuItems = MainAppMenuItems;
  // public siderMenuItems = SiderScrapeMenuItems;
  public $siderMenuItems = signal<SiderMenuItem[]>(
    [...SIDER_MENUS.SiderScrapeMenuItems] // default (clone for new ref)
  );
  public $routeLink = signal<string>(this.$siderMenuItems()[0].route);

  public headerTitle = 'PBM - Personal Bookmarks Manager';
  public footerContent = '© 2025 Panos Zafiropoulos. All rights reserved.';

  private backService = inject(BackEnd);
  public showSettings = signal(false);

  public router = inject(Router);

  public selectedMainMenuId = this.mainMenuItems[0].id; // default - preselected


  ngOnInit(): void {
    document.title = this.headerTitle;
    this.router.navigate([this.$routeLink()]);
  }



  onMainMenuClick(item: MainAppMenuItem) {
    console.log('>===>> Main Menu Item Array clicked: ', item.siderMenuName);
    const arr = SIDER_MENUS[item.siderMenuName]; // type-safe
    // clone to ensure a new array reference (so effects re-run even if same key)
    this.$siderMenuItems.set([...arr]);
    this.$routeLink.set(this.$siderMenuItems()[0].route);
    this.router.navigate([this.$routeLink()]);
  }

  onHomeClick(){

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




}
