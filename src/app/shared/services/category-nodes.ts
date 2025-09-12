import { inject, Injectable, signal } from '@angular/core';
import { Category, CategoryNode } from '../../../../shared/projectObjects/varObjects';

import { NzTreeNodeOptions } from 'ng-zorro-antd/tree';
import { BackEnd } from './back-end';

@Injectable({
  providedIn: 'root'
})
export class CategoryNodes {

  public $catTreeNodes = signal<NzTreeNodeOptions[]>([]);
  private categoryForest: CategoryNode[] = [];
  private backendService = inject(BackEnd);

  constructor() {
    // if (this.categoryForest.length === 0) {
    //   this.setCategoryTreeNodesSignal();
    // }
  }

  public setCategoryTreeNodesSignal(parent_Id?: null | number): void {
    // this.$catTreeNodes = this.mapCategoryNodesToTree(nodes);
    console.log('>===>> Setting Category Tree Nodes signal with parent_Id:', parent_Id);
    this.getCategoryForestByParentId();
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





  // 250912
  /**
   * Find a tree node by key and return it with its ancestors.
   * Initially used as findTreeSelectNodeWithAncestors() private function in the Bookmarks component.
   * @param nodes: NzTreeNodeOptions[]
   * @param key: string
   * @param path: NzTreeNodeOptions[]
   * @returns: { node: NzTreeNodeOptions; ancestors: NzTreeNodeOptions[] } | undefined
   */
  public getTreeSelectedNodeWithAncestors(
    nodes: NzTreeNodeOptions[],
    key: string,
    path: NzTreeNodeOptions[] = []
  ): { node: NzTreeNodeOptions; ancestors: NzTreeNodeOptions[] } | undefined {
    for (const n of nodes) {
      const newPath = [...path, n];
      if (n.key === key) {
        return { node: n, ancestors: path };
      }
      if (n.children) {
        const result = this.getTreeSelectedNodeWithAncestors(
          n.children,
          key,
          newPath
        );
        if (result) return result;
      }
    }
    return undefined;
  }

  // 250912
  /**
   * Get the full path of a node's ancestors.
   * @param nodes: NzTreeNodeOptions[] 
   * @param key: string 
   * @returns: string | undefined - full path of titles separated by ' > ', or undefined if not found
   */
  public getFullAncestorsPath(
    nodes: NzTreeNodeOptions[],
    key: string
  ): string | undefined {
    const result = this.getTreeSelectedNodeWithAncestors(nodes, key);
    if (result) {
      const { node, ancestors } = result;
      const ancestorTitles = ancestors.map((a) => a.title).filter(Boolean);
      const selectedNodeTitle = node.title ?? '';
      return (
        ancestorTitles.join(' > ') + (ancestorTitles.length > 0 ? ' > ' : '') + selectedNodeTitle
      );
    }
    return undefined;
  }







/** 250911
 *  Parent → children DFS flatten (siblings sorted by id) 
 */
public flattenByHierarchy(
  cats: Category[],
  cmp: (a: Category, b: Category) => number = (a, b) => a.name.localeCompare(b.name)
): Category[] {
  const items = [...cats];
  const byParent = new Map<number | null, Category[]>();

  for (const c of items) {
    const k = c.parent_id ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(c);
  }
  // sort every sibling group
  for (const arr of byParent.values()) arr.sort(cmp);

  const out: Category[] = [];
  const visit = (pid: number | null) => {
    for (const c of byParent.get(pid) ?? []) {
      out.push(c);         // parent
      visit(c.id);         // then all its descendants
    }
  };

  // roots are parent_id === null OR orphaned (parent missing)
  const ids = new Set(items.map(c => c.id));
  const roots = (byParent.get(null) ?? []).slice();
  for (const c of items) if (c.parent_id != null && !ids.has(c.parent_id)) roots.push(c);
  roots.sort(cmp);

  // emit roots (each will emit its subtree)
  for (const r of roots) {
    out.push(r);
    visit(r.id);
  }

  return out;
}







  /** 250911 
   *  Map<id, level> for indentation 
   * */
  public buildLevelById(cats: Category[]): Map<number, number> {
    const byId = new Map(cats.map(c => [c.id, c]));
    const cache = new Map<number, number>();

    const visited = new Set<number>();

    const levelOf = (id: number): number => {
      if (cache.has(id)) return cache.get(id)!;

      if (visited.has(id)) {
      // Cycle detected, treat as root
      console.log('>===>> CategoryNodes Service - Cycle detected (infinite recursion) in category hierarchy at id:', id);
      return 0;
    }
    visited.add(id);

      const c = byId.get(id)!;
      const lvl = c.parent_id == null || !byId.has(c.parent_id) ? 0 : levelOf(c.parent_id) + 1;
      cache.set(id, lvl);
      return lvl;
    };
    byId.forEach((_c, id) => levelOf(id));
    return cache;
  }









}
