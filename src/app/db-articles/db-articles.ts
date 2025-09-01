import { Component, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  Category,
  CategoryNode,
  PostData,
} from '../../../shared/projectObjects/varObjects';
import { BackEnd } from '../shared/services/back-end';
import { ArticlesTable } from "../articles-table/articles-table";

import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzButtonModule } from 'ng-zorro-antd/button';


import {
  NzTreeModule,
  NzFormatEmitEvent,
  NzTreeComponent,
  NzTreeNodeOptions,
} from 'ng-zorro-antd/tree';
import { NzTreeSelectModule } from 'ng-zorro-antd/tree-select';

import { NzIconModule } from 'ng-zorro-antd/icon';


function mapCategoryNodesToTree(nodes: CategoryNode[]): NzTreeNodeOptions[] {
  return nodes.map((n) => ({
    key: String(n.id),
    // title: n.name ?? '(untitled)',
    title:
      // n.name !== null && n.name !== undefined
      //   ? n.name + '-' + String(n.id)
      //   : '(untitled)',
      n.name !== null && n.name !== undefined ? n.name : '(untitled)',
    children: n.subCategoryNode
      ? mapCategoryNodesToTree(n.subCategoryNode)
      : [],
    isLeaf: !n.subCategoryNode || n.subCategoryNode.length === 0,
  }));
}

@Component({
  selector: 'app-db-articles',
  imports: [
    FormsModule,
    NzLayoutModule,
    NzMenuModule,
    NzCheckboxModule,
    NzButtonModule,
    NzTreeModule,
    NzTreeSelectModule,
    NzIconModule,
    ArticlesTable
],
  templateUrl: './db-articles.html',
  styleUrl: './db-articles.scss',
})
export class DbArticles {
  public $categories = signal<Category[]>([]);
  public $categoryForest = signal<CategoryNode[]>([]);
  public $treeNodes = signal<NzTreeNodeOptions[]>([]);

  public $articles = signal<PostData[]>([]);
  public $articlesMetaData = signal<PostData[]>([]);

  private backendService = inject(BackEnd);

  public unassignedOnly: boolean = true; // All Unassigned Articles
  public treeDisabled: boolean = true; // when true: the whole tree is disabled

  expandedKeys: string[] = [];
  selectedKeys: string[] = [];

  @ViewChild(NzTreeComponent) nztree!: NzTreeComponent;

  constructor() {}

  ngOnInit() {
    this.getCategoryForestByParentId(null);
    // this.getArticlesById();
    // this.getUnassignedArticles();
    this.backendService.setUncategorizedArticlesSignal();
    // this.backendService.setUncategorizedArticlesSignal().then(() => {
    //   this.$articles.set(this.backendService.$articles());
    //   console.log('>===>> DbArticles - Uncategorized Articles fetched: ', this.$articles().length);
    // });   
  }

  public isOnlyUnassignedToggle() {
    // this.rootOnly = !this.rootOnly;
    console.log('>===>> Unasigned Articles Only? ', this.unassignedOnly);
    if (this.unassignedOnly) {
      // this.getCategoriesByParentId(null);
      this.clearSelection(); // optional: also clear selection
      this.treeDisabled = true;
      // To-Do:
      // Select all articles with no category assigned
    } else {
      // this.getCategoriesByParentId();
      this.treeDisabled = false;
    }
  }

  private clearSelection() {
    this.selectedKeys = [];
    if (this.nztree) {
      this.nztree.getSelectedNodeList().forEach((n) => (n.isSelected = false));
    }
  }

  onTreeNodeClick(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;

    console.log('>===>> Node clicked: ', node.key, ' - ', node.title);

    // select the clicked node
    this.selectedKeys = [node.key!];

    // emulate "expand on click": toggle expansion for non-leaf nodes
    if (!node.isLeaf) {
      node.isExpanded = !node.isExpanded;
      // sync expandedKeys from the tree
      this.expandedKeys = this.nztree.getExpandedNodeList().map((n) => n.key!);
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

  onTreeNodeExpandChange(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;

    if (node.isExpanded) {
      if (!this.expandedKeys.includes(node.key!)) {
        this.expandedKeys = [...this.expandedKeys, node.key!];
      }
    } else {
      this.expandedKeys = this.expandedKeys.filter((k) => k !== node.key);
    }
  }

  async getCategoriesByParentId(parent_Id?: null | number) {
    try {
      const cats = await this.backendService.getCategoriesByParentId(parent_Id);
      console.log(
        '>===>> ',
        cats.length,
        ' Categories Fetched: ',
        JSON.stringify(cats)
      );
      if (cats.length > 0) this.$categories.set(cats);
    } catch (error) {
      console.log('>===>> Error fetching Categories from BackEnd: ', error);
    }
  }

  async getCategoryForestByParentId(parent_Id?: null | number) {
    try {
      const catForest: CategoryNode[] =
        await this.backendService.getCategoryForestByParentId(parent_Id);
      // console.log(
      //   '>===>> ',
      //   catForest.length,
      //   ' Category Forest Fetched: ',
      //   JSON.stringify(catForest)
      // );
      if (catForest.length > 0) {
        this.$categoryForest.set(catForest);
        this.$treeNodes.set(mapCategoryNodesToTree(this.$categoryForest()));
      }
    } catch (error) {
      console.log(
        '>===>> Error fetching Category Forest from BackEnd: ',
        error
      );
    }
  }

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
