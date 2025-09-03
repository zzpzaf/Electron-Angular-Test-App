import { Component, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Category,
  // CategoryNode,
} from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';
import { ArticlesTable } from "../articles-table/articles-table";
import { CategoriesTree } from '../categories-tree/categories-tree'; 

import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';


import {
  // NzTreeModule,
  NzFormatEmitEvent,
  NzTreeComponent,
  NzTreeNodeOptions,
} from 'ng-zorro-antd/tree';
// import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';

import { NzIconModule } from 'ng-zorro-antd/icon';
import { CategoryNodes } from '../shared/services/category-nodes';
@Component({
  selector: 'app-db-articles',
  imports: [
    FormsModule,
    ArticlesTable,
    CategoriesTree,
    NzLayoutModule,
    NzMenuModule,
    NzCheckboxModule,
    NzButtonModule,
    // NzTreeModule,
    // NzTreeSelectModule,
    NzIconModule,
],
  templateUrl: './db-articles.html',
  styleUrl: './db-articles.scss',
})
export class DbArticles {
  public $categories = signal<Category[]>([]);
  public $treeNodes = signal<NzTreeNodeOptions[]>([]);
  private backendService = inject(BackEnd);
  private categoryNodesService = inject(CategoryNodes);

  public unassignedOnly: boolean = true; // All Unassigned Articles
  public treeDisabled: boolean = true; // when true: the whole tree is disabled

  expandedKeys: string[] = [];
  selectedKeys: string[] = [];

  @ViewChild(NzTreeComponent) nztree!: NzTreeComponent;

  constructor() {}

  ngOnInit() {
    this.categoryNodesService.setCategoryTreeNodesSignal();
    this.backendService.setUncategorizedArticlesSignal();
  }

  ngOnDestroy() {
    this.backendService.$selectedCategoryId.set(0);
  }

  public isOnlyUnassignedToggle() {
    console.log('>===>> Unasigned Articles Only? ', this.unassignedOnly);
    if (this.unassignedOnly) {
      this.clearSelection(); // optional: also clear selection
      this.treeDisabled = true;
      this.backendService.setUncategorizedArticlesSignal();
      // this.backendService.$selectedCategoryId.set(0);
    } else {
      this.treeDisabled = false;
      // We must select (click on) the Category - Then the $articles signal
      // is set by calling the backend-service function: 'setArticlesByCategoryIdSignal()' 
      // in  the  CategoriesTree component
      // this.backendService.setArticlesByCategoryIdSignal(*** cat id ***);
      if (this.backendService.$selectedCategoryId() > 0) {
        this.backendService.setArticlesByCategoryIdSignal(this.backendService.$selectedCategoryId());
      }
    }
  }

  private clearSelection() {
    this.selectedKeys = [];
    if (this.nztree) {
      this.nztree.getSelectedNodeList().forEach((n) => {
        console.log('>===>> DbArticles - Deselecting node: ', n.key, ' - ', n.title);
        n.isSelected = false;
      });
    }
  }

  onUnAssignedCheckBoxChanged(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;
    console.log(
      '>===>> Node Checked change: ',
      node.key,
      ' - ',
      node.title,
      node
    );
  }

  // async getCategoriesByParentId(parent_Id?: null | number) {
  //   try {
  //     const cats = await this.backendService.getCategoriesByParentId(parent_Id);
  //     console.log(
  //       '>===>> ',
  //       cats.length,
  //       ' Categories Fetched: ',
  //       JSON.stringify(cats)
  //     );
  //     if (cats.length > 0) this.$categories.set(cats);
  //   } catch (error) {
  //     console.log('>===>> Error fetching Categories from BackEnd: ', error);
  //   }
  // }


  // If we want to expand all nodes that have children:
  private expandAllWithChildren(nodes: NzTreeNodeOptions[]): string[] {
    const keys: string[] = [];
    const walk = (arr: NzTreeNodeOptions[]) => {
      for (const n of arr) {
        if (n.children && n.children.length) {
          if (n.key) keys.push(n.key);
          walk(n.children as NzTreeNodeOptions[]);
        }
      }
    };
    walk(nodes);
    return keys;
  }
}
