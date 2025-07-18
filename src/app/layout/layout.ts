import { Component } from '@angular/core';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { SiderMenuItems } from '../appObjects/angObjects';
import { RouterModule } from '@angular/router';



@Component({
  selector: 'app-layout',
  imports: [
    RouterModule,
    NzLayoutModule, 
    NzMenuModule, 
    NzIconModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss'
})
export class Layout {

  public siderMenuItems = SiderMenuItems;
  public headerTitle = 'MEDIUM Scrapper';
  public footerContent = '© 2025 Panos Zafiropoulos. All rights reserved.';
  
  ngOnInit(): void {
    document.title = this.headerTitle;
  }


}
