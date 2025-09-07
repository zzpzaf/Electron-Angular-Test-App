import { Component, effect, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CategoryNodes } from '../shared/services/category-nodes';
import { BackEnd } from '../shared/services/back-end';

// import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzFormatEmitEvent, NzTreeComponent, NzTreeModule, NzTreeNodeOptions } from 'ng-zorro-antd/tree';


@Component({
  selector: 'categories-tree',
  imports: [
    FormsModule,
    // NzLayoutModule,
    NzTreeModule,

  ],
  templateUrl: './categories-tree.html',
  styleUrl: './categories-tree.scss'
})
export class CategoriesTree {

  public treeDisabled: boolean = true; // when true: the whole tree is disabled
  public unassignedOnly: boolean = true; // All Unassigned Articles
  public $treeNodes = signal<NzTreeNodeOptions[]>([]);
  expandedKeys: string[] = [];
  selectedKeys: string[] = [];
  selectedCategoryId: number = 0;

  private categoryNodesService = inject(CategoryNodes);
  private backEndService = inject(BackEnd);

  @ViewChild(NzTreeComponent) nztree!: NzTreeComponent;
  
  constructor() {
    effect(() => {
      this.$treeNodes.set(this.categoryNodesService.$catTreeNodes());
    });
  }


  onTreeNodeClick(event: NzFormatEmitEvent) {
    const node = event.node;
    if (!node) return;

    console.log('>===>> Node clicked: ', node.key, ' - ', node.title);

    // select the clicked node
    this.selectedCategoryId = Number(node.key!);
    // this.backEndService.$selectedCategoryId.set(this.selectedCategoryId);
    this.backEndService.setSelectedCategorySignal(this.selectedCategoryId);
    this.backEndService.setArticlesByCategoryIdSignal(this.selectedCategoryId);

    // emulate "expand on click": toggle expansion for non-leaf nodes
    if (!node.isLeaf) {
      node.isExpanded = !node.isExpanded;
      // sync expandedKeys from the tree
      this.expandedKeys = this.nztree.getExpandedNodeList().map((n) => n.key!);
    }
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

}
