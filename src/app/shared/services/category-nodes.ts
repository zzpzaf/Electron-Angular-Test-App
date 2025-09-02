import { inject, Injectable, signal } from '@angular/core';
import { CategoryNode } from '../../../../shared/projectObjects/varObjects';

import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { BackEnd } from './back-end';

@Injectable({
  providedIn: 'root'
})
export class CategoryNodes {

  public $catTreeNodes = signal<NzTreeNodeOptions[]>([]);
  private categoryForest: CategoryNode[] = [];
  private backendService = inject(BackEnd);

  constructor() {}

  public setCategoryTreeNodesSignal(): void {
    // this.$catTreeNodes = this.mapCategoryNodesToTree(nodes);
    this.getCategoryForestByParentId();
  }

  private mapCategoryNodesToTree(nodes: CategoryNode[]): NzTreeNodeOptions[] {
    const catTreeNodes: NzTreeNodeOptions[] = nodes.map((n) => ({
      key: String(n.id),
      // title: n.name ?? '(untitled)',
      title:
        // n.name !== null && n.name !== undefined
        //   ? n.name + '-' + String(n.id)
        //   : '(untitled)',
        n.name !== null && n.name !== undefined ? n.name : '(untitled)',
      children: n.subCategoryNode
        ? this.mapCategoryNodesToTree(n.subCategoryNode)
        : [],
      isLeaf: !n.subCategoryNode || n.subCategoryNode.length === 0,
    }));
    return catTreeNodes;
  }

  private async getCategoryForestByParentId(parent_Id?: null | number) {
    try {
      const catForest: CategoryNode[] =
        await this.backendService.getCategoryForestByParentId(parent_Id);
      if (catForest.length > 0) {
        this.categoryForest = catForest;
        this.$catTreeNodes.set(this.mapCategoryNodesToTree(catForest));
      }
    } catch (error) {
      console.log(
        '>===>> Error fetching Category Forest from BackEnd: ',
        error
      );
    }
  }

  
}
