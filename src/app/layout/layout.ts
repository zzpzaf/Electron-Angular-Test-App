import { Component } from '@angular/core';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  selector: 'app-layout',
  imports: [NzLayoutModule, NzMenuModule, NzIconModule],
  templateUrl: './layout.html',
  styleUrl: './layout.scss'
})
export class Layout {

}
