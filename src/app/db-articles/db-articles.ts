import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';


@Component({
  selector: 'app-db-articles',
  imports: [
    FormsModule, 
    NzLayoutModule,
    NzMenuModule,
    NzCheckboxModule,
    NzButtonModule,
  ],
  templateUrl: './db-articles.html',
  styleUrl: './db-articles.scss'
})
export class DbArticles {

  public rootOnly: boolean = true;

  public isOnlyRootToggle() {
    // this.rootOnly = !this.rootOnly;
    console.log('>===>> Root Categories Only? ',this.rootOnly);
  }

}
